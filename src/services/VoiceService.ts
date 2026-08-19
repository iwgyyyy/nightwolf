/**
 * 房间语音（LiveKit SFU，纯音频）。
 *
 * - 每人只向 SFU 上传 1 路音频，10 人房也只有 1 上行 + 9 下行，
 *   取代旧 WebRTC mesh 的两两直连（N² 条连接手机撑不住）
 * - 接入凭证由游戏服务端经 WS 签发（voice_token），玩家无需登录；
 *   服务端未配置 LIVEKIT_* 时等待超时，降级为 unsupported
 * - 进房即申请麦克风并发布**静音**音轨（开关麦=mute/unmute，
 *   状态由 LiveKit 自动同步给所有端）；拿不到权限则纯收听
 * - 阶段规则：进入夜晚强制全员禁麦并锁定；天亮解除锁定并自动开麦；
 *   其余阶段玩家可自由开关
 * - 自动播放被拦时，任意一次页面点击经 startAudio() 恢复
 */

import {
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteTrack,
} from "livekit-client"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useVoiceUiStore } from "@/stores/voiceUiStore"
import type { GamePhase } from "@/types"

type Unsubscribe = () => void

/**
 * voice_token 请求的重试节奏。单发不可靠：WS 未连上时 send 直接丢弃；
 * 服务端在 join_room 写入连接身份**之前**收到请求也会静默丢弃。
 */
const TOKEN_RETRY_MS = 2_000
const TOKEN_MAX_TRIES = 8

const MIC_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}

/** coturn 兜底：客户端 UDP 被墙时经 TURN 中继连到 SFU */
const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined
  if (raw) {
    try {
      return JSON.parse(raw) as RTCIceServer[]
    } catch {
      // 配置格式错误时不带额外 ICE server
    }
  }
  return []
})()

export class VoiceService {
  private roomId: string | null = null
  private selfId: string | null = null
  private room: Room | null = null
  private micTrack: LocalAudioTrack | null = null
  private unsubs: Unsubscribe[] = []
  private lastPhase: GamePhase | null = null
  private tokenTimer: ReturnType<typeof setInterval> | null = null
  private tokenTries = 0

  /** 进入房间时调用；同房间重复调用是 no-op */
  join(roomId: string, selfId: string): void {
    if (this.roomId === roomId && this.selfId === selfId) return
    this.leave()
    this.roomId = roomId
    this.selfId = selfId

    const ui = useVoiceUiStore.getState()
    ui.set({ status: "connecting", micOn: false, locked: false })

    // 自动播放被拦的 audio 不会自己恢复，必须在用户手势里补
    document.addEventListener("pointerdown", this.resumeAudio, true)
    this.unsubs.push(() =>
      document.removeEventListener("pointerdown", this.resumeAudio, true),
    )

    this.unsubs.push(
      getSyncService().onVoiceToken((url, token) => void this.connect(url, token)),
    )
    this.startTokenRequests()

    // 跟随 publicState 的阶段静音规则
    this.unsubs.push(
      useGameStore.subscribe((state) => {
        this.applyPhaseRules(state.publicState?.gamePhase ?? null)
      }),
    )
    this.applyPhaseRules(
      useGameStore.getState().publicState?.gamePhase ?? null,
      /* initial */ true,
    )
  }

  leave(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    this.stopTokenRequests()
    const ui = useVoiceUiStore.getState()
    for (const id of Object.keys(ui.peers)) ui.clearPeerVoice(id)
    this.micTrack?.stop()
    this.micTrack = null
    const room = this.room
    this.room = null
    if (room) {
      room.removeAllListeners()
      for (const p of room.remoteParticipants.values()) this.detachTracks(p)
      void room.disconnect()
    }
    this.roomId = null
    this.selfId = null
    this.lastPhase = null
    ui.set({ status: "idle", micOn: false, locked: false })
  }

  /** 玩家手动开关麦。夜晚锁定时不可开。 */
  toggleMic(): void {
    const ui = useVoiceUiStore.getState()
    if (ui.locked && !ui.micOn) return
    this.setMic(!ui.micOn)
  }

  /**
   * 权限被拒后在用户手势里重试（iOS Safari 非手势发起的请求会被静默拒绝，
   * 手势里重试才会弹出询问框）。成功且未锁定时直接开麦。
   */
  async retryMic(): Promise<boolean> {
    if (this.micTrack) return true
    if (!this.room) return false
    await this.acquireMic(this.room)
    if (!this.micTrack) return false
    if (!useVoiceUiStore.getState().locked) this.setMic(true)
    return true
  }

  /** 语音服务连不上（unavailable）后手动重试，MicButton 点击时调用 */
  retryConnect(): void {
    if (!this.roomId || this.room) return
    this.startTokenRequests()
  }

  private startTokenRequests(): void {
    this.stopTokenRequests()
    useVoiceUiStore.getState().set({ status: "connecting" })
    this.tokenTries = 0
    const tick = () => {
      if (!this.roomId || this.room) return this.stopTokenRequests()
      if (this.tokenTries >= TOKEN_MAX_TRIES) {
        this.stopTokenRequests()
        useVoiceUiStore.getState().set({ status: "unavailable" })
        return
      }
      this.tokenTries++
      try {
        getSyncService().requestVoiceToken(this.roomId)
      } catch {
        // 断线期间丢请求没关系，下个 tick 重发
      }
    }
    tick()
    this.tokenTimer = setInterval(tick, TOKEN_RETRY_MS)
  }

  private stopTokenRequests(): void {
    if (this.tokenTimer) {
      clearInterval(this.tokenTimer)
      this.tokenTimer = null
    }
  }

  private setMic(on: boolean): void {
    const track = this.micTrack
    if (!track) return
    // mute 状态由 LiveKit 同步给所有端，无需自行广播
    void (on ? track.unmute() : track.mute()).catch(() => {})
    useVoiceUiStore.getState().set({ micOn: on })
  }

  // ==========================================================
  // 连接与媒体
  // ==========================================================
  private async connect(url: string, token: string): Promise<void> {
    // 已连接（重复响应）或已离开
    if (this.room || !this.roomId) return
    this.stopTokenRequests()

    const room = new Room()
    this.room = room

    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return
        const el = track.attach()
        el.setAttribute("playsinline", "")
        document.body.appendChild(el)
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        for (const el of track.detach()) el.remove()
      })
      .on(RoomEvent.ParticipantConnected, (p) => this.syncPeerMic(p))
      .on(RoomEvent.TrackPublished, (_pub, p) => this.syncPeerMic(p))
      .on(RoomEvent.TrackMuted, (_pub, p) => this.syncPeerMic(p))
      .on(RoomEvent.TrackUnmuted, (_pub, p) => this.syncPeerMic(p))
      .on(RoomEvent.ParticipantDisconnected, (p) => {
        this.detachTracks(p)
        useVoiceUiStore.getState().clearPeerVoice(p.identity)
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const active = new Set(speakers.map((s) => s.identity))
        const ui = useVoiceUiStore.getState()
        for (const p of room.remoteParticipants.values()) {
          ui.setPeerVoice(p.identity, { speaking: active.has(p.identity) })
        }
      })
      .on(RoomEvent.Disconnected, () => {
        // 不可恢复的断开（SDK 自身的网络重连不走这里）：
        // 仍在游戏房间就重新要 token 建连
        if (this.room !== room) return
        this.room = null
        if (this.roomId) this.startTokenRequests()
      })

    try {
      await room.connect(url, token, {
        rtcConfig: ICE_SERVERS.length ? { iceServers: ICE_SERVERS } : undefined,
      })
    } catch {
      // 建连失败（LiveKit 不可达 / token 失效）：置 unavailable，
      // 由用户点麦克风按钮 retryConnect，避免自动无限重连
      if (this.room === room) {
        this.room = null
        useVoiceUiStore.getState().set({ status: "unavailable" })
      }
      return
    }
    // connect 期间被 leave 打断
    if (this.room !== room) {
      void room.disconnect()
      return
    }

    for (const p of room.remoteParticipants.values()) this.syncPeerMic(p)
    await this.acquireMic(room)
  }

  private async acquireMic(room: Room): Promise<void> {
    // 非安全上下文（http://192.168.x.x 等）浏览器不提供 getUserMedia，
    // 和"用户拒绝"是两码事，提示要分开
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      useVoiceUiStore.getState().set({ status: "unsupported" })
      return
    }
    try {
      const track = await createLocalAudioTrack(MIC_CONSTRAINTS)
      // 期间被 leave 打断
      if (this.room !== room) {
        track.stop()
        return
      }
      // 先静音再发布：进房默认闭麦
      await track.mute()
      await room.localParticipant.publishTrack(track)
      this.micTrack = track
      useVoiceUiStore.getState().set({ status: "ready" })
    } catch {
      useVoiceUiStore.getState().set({ status: "denied" })
    }
  }

  private syncPeerMic(p: Participant): void {
    if (p.identity === this.selfId) return
    useVoiceUiStore
      .getState()
      .setPeerVoice(p.identity, { micOn: p.isMicrophoneEnabled })
  }

  private detachTracks(p: Participant): void {
    for (const pub of p.trackPublications.values()) {
      const track = pub.track as RemoteTrack | undefined
      if (track) for (const el of track.detach()) el.remove()
    }
  }

  private resumeAudio = (): void => {
    const room = this.room
    if (room && !room.canPlaybackAudio) void room.startAudio().catch(() => {})
  }

  // ==========================================================
  // 阶段静音规则
  // ==========================================================
  private applyPhaseRules(phase: GamePhase | null, initial = false): void {
    if (phase === this.lastPhase) return
    const prev = this.lastPhase
    this.lastPhase = phase
    const ui = useVoiceUiStore.getState()

    if (phase === "night") {
      // 天黑：强制禁麦并锁定（进房时已是夜晚同样生效）
      ui.set({ locked: true })
      this.setMic(false)
    } else if (prev === "night" && phase === "day") {
      // 天亮：解锁并默认全员开麦
      ui.set({ locked: false })
      this.setMic(true)
    } else if (!initial) {
      ui.set({ locked: false })
    }
  }
}

let instance: VoiceService | null = null

export function getVoiceService(): VoiceService {
  if (!instance) {
    instance = new VoiceService()
    if (import.meta.env.DEV) {
      ;(window as unknown as { __voice?: VoiceService }).__voice = instance
    }
  }
  return instance
}
