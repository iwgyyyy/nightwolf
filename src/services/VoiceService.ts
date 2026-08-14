/**
 * 房间语音（WebRTC mesh，两两直连，纯音频）。
 *
 * - 信令复用游戏 WebSocket（voice_signal 中继），无额外服务
 * - 进房即建连；麦克风**默认关闭**（track.enabled=false，静音帧照发，
 *   开关麦无需重新协商）
 * - 阶段规则：进入夜晚强制全员禁麦并锁定；天亮解除锁定并自动开麦；
 *   其余阶段玩家可自由开关
 * - 双方同时发 offer 的冲突用 perfect negotiation 解决
 *   （playerId 字典序大的一方为 polite 端）
 * - 拿不到麦克风权限时进入 recvonly 模式：能听不能说
 */

import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useVoiceUiStore } from "@/stores/voiceUiStore"
import type { GamePhase } from "@/types"

type Unsubscribe = () => void

type VoiceSignal =
  | { kind: "desc"; desc: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  /** 麦克风开关状态广播（enabled=false 只是发静音帧，对端感知不到，需显式告知） */
  | { kind: "mic"; on: boolean }

/** inbound-rtp 音量高于该值视为在讲话；讲话判定在末次活跃后保持 600ms 防闪烁 */
const SPEAKING_LEVEL = 0.02
const SPEAKING_HOLD_MS = 600
const LEVEL_POLL_MS = 250

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
}

const ICE_SERVERS: RTCIceServer[] = (() => {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined
  if (raw) {
    try {
      return JSON.parse(raw) as RTCIceServer[]
    } catch {
      // 配置格式错误时退回默认 STUN
    }
  }
  return [{ urls: "stun:stun.miwifi.com:3478" }]
})()

export class VoiceService {
  private roomId: string | null = null
  private selfId: string | null = null
  private stream: MediaStream | null = null
  private peers = new Map<string, Peer>()
  private unsubs: Unsubscribe[] = []
  private lastPhase: GamePhase | null = null
  private levelTimer: ReturnType<typeof setInterval> | null = null
  /** playerId → 最近一次检测到活跃音量的时间戳 */
  private lastActiveAt = new Map<string, number>()

  /** 进入房间时调用；同房间重复调用是 no-op */
  join(roomId: string, selfId: string): void {
    if (this.roomId === roomId && this.selfId === selfId) return
    this.leave()
    this.roomId = roomId
    this.selfId = selfId

    const ui = useVoiceUiStore.getState()
    ui.set({ status: "connecting", micOn: false, locked: false })

    void this.acquireMic()

    const sync = getSyncService()
    this.unsubs.push(
      sync.onVoiceSignal((fromId, signal) => {
        void this.handleSignal(fromId, signal as VoiceSignal)
      }),
    )
    // 跟随 publicState：新玩家建连、离开的清理、阶段静音规则
    this.unsubs.push(
      useGameStore.subscribe((state) => {
        this.syncPeers()
        this.applyPhaseRules(state.publicState?.gamePhase ?? null)
      }),
    )
    this.syncPeers()
    this.applyPhaseRules(
      useGameStore.getState().publicState?.gamePhase ?? null,
      /* initial */ true,
    )
    this.levelTimer = setInterval(() => void this.sampleLevels(), LEVEL_POLL_MS)
  }

  leave(): void {
    for (const unsub of this.unsubs) unsub()
    this.unsubs = []
    if (this.levelTimer) {
      clearInterval(this.levelTimer)
      this.levelTimer = null
    }
    this.lastActiveAt.clear()
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop()
      this.stream = null
    }
    this.roomId = null
    this.selfId = null
    this.lastPhase = null
    useVoiceUiStore.getState().set({ status: "idle", micOn: false, locked: false })
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
    if (this.stream) return true
    await this.acquireMic()
    if (!this.stream) return false
    if (!useVoiceUiStore.getState().locked) this.setMic(true)
    return true
  }

  private setMic(on: boolean): void {
    if (!this.stream) return
    for (const t of this.stream.getAudioTracks()) t.enabled = on
    useVoiceUiStore.getState().set({ micOn: on })
    // 告知所有对端，供"闭麦"角标展示
    for (const id of this.peers.keys()) this.signal(id, { kind: "mic", on })
  }

  private async acquireMic(): Promise<void> {
    // 非安全上下文（http://192.168.x.x 等）浏览器不提供 getUserMedia，
    // 和"用户拒绝"是两码事，提示要分开
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      useVoiceUiStore.getState().set({ status: "unsupported" })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      // join 期间被 leave 打断
      if (!this.roomId) {
        for (const t of stream.getTracks()) t.stop()
        return
      }
      for (const t of stream.getAudioTracks()) t.enabled = false
      this.stream = stream
      useVoiceUiStore.getState().set({ status: "ready" })
      // 已建立的连接补上音轨（触发 renegotiation）
      for (const peer of this.peers.values()) {
        for (const t of stream.getTracks()) peer.pc.addTrack(t, stream)
      }
    } catch {
      useVoiceUiStore.getState().set({ status: "denied" })
    }
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

  // ==========================================================
  // mesh 维护
  // ==========================================================
  private syncPeers(): void {
    const ps = useGameStore.getState().publicState
    if (!ps || !this.selfId) return
    const online = new Set(
      ps.players
        .filter((p) => p.isConnected && p.playerId !== this.selfId)
        .map((p) => p.playerId),
    )
    for (const id of online) {
      if (!this.peers.has(id)) this.ensurePeer(id)
    }
    for (const id of [...this.peers.keys()]) {
      if (!online.has(id)) this.closePeer(id)
    }
  }

  private ensurePeer(otherId: string): Peer {
    const existing = this.peers.get(otherId)
    if (existing) return existing

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const audio = document.createElement("audio")
    audio.autoplay = true
    audio.setAttribute("playsinline", "")
    document.body.appendChild(audio)

    const peer: Peer = {
      pc,
      audio,
      // 双方一致的礼貌端约定：id 字典序大的一方让步
      polite: (this.selfId ?? "") > otherId,
      makingOffer: false,
      ignoreOffer: false,
    }
    this.peers.set(otherId, peer)

    if (this.stream) {
      for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream)
    } else {
      // 还没拿到（或拿不到）麦克风：先建收听通道
      pc.addTransceiver("audio", { direction: "recvonly" })
    }

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true
        await pc.setLocalDescription()
        this.signal(otherId, { kind: "desc", desc: pc.localDescription! })
      } catch {
        // 连接已关闭等场景，忽略
      } finally {
        peer.makingOffer = false
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) this.signal(otherId, { kind: "ice", candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0] ?? new MediaStream([e.track])
      void audio.play().catch(() => {
        // 自动播放被拦时，进房/操作的下一次手势会带动播放
      })
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce()
    }
    pc.onconnectionstatechange = () => {
      // 连上后把自己的麦态同步给对方（对方中途加入/重连也能拿到）
      if (pc.connectionState === "connected") {
        this.signal(otherId, {
          kind: "mic",
          on: useVoiceUiStore.getState().micOn,
        })
      }
    }
    return peer
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id)
    if (!peer) return
    this.peers.delete(id)
    try {
      peer.pc.close()
    } catch {
      // ignore
    }
    peer.audio.srcObject = null
    peer.audio.remove()
    this.lastActiveAt.delete(id)
    useVoiceUiStore.getState().clearPeerVoice(id)
  }

  private signal(targetId: string, signal: VoiceSignal): void {
    if (!this.roomId) return
    try {
      getSyncService().sendVoiceSignal(this.roomId, targetId, signal)
    } catch {
      // 断线期间丢信令没关系，重连后 syncPeers 会重建
    }
  }

  /** perfect negotiation（https://w3c.github.io/webrtc-pc/#perfect-negotiation-example） */
  private async handleSignal(fromId: string, signal: VoiceSignal): Promise<void> {
    if (!this.roomId) return
    const peer = this.ensurePeer(fromId)
    const { pc } = peer
    try {
      if (signal.kind === "desc") {
        const desc = signal.desc
        const collision =
          desc.type === "offer" &&
          (peer.makingOffer || pc.signalingState !== "stable")
        peer.ignoreOffer = !peer.polite && collision
        if (peer.ignoreOffer) return
        await pc.setRemoteDescription(desc)
        if (desc.type === "offer") {
          await pc.setLocalDescription()
          this.signal(fromId, { kind: "desc", desc: pc.localDescription! })
        }
      } else if (signal.kind === "ice") {
        try {
          await pc.addIceCandidate(signal.candidate)
        } catch (err) {
          if (!peer.ignoreOffer) throw err
        }
      } else if (signal.kind === "mic") {
        useVoiceUiStore.getState().setPeerVoice(fromId, { micOn: signal.on })
      }
    } catch {
      // 协商异常：关掉重来，syncPeers 会按在线列表重建
      this.closePeer(fromId)
    }
  }

  /** 定时采样各对端入站音量 → speaking 标记（带保持时间防闪烁） */
  private async sampleLevels(): Promise<void> {
    const now = Date.now()
    const ui = useVoiceUiStore.getState()
    for (const [id, peer] of this.peers) {
      if (peer.pc.connectionState !== "connected") continue
      let level = 0
      try {
        const stats = await peer.pc.getStats()
        stats.forEach((report) => {
          const r = report as { type?: string; kind?: string; audioLevel?: number }
          if (r.type === "inbound-rtp" && r.kind === "audio" && typeof r.audioLevel === "number") {
            level = Math.max(level, r.audioLevel)
          }
        })
      } catch {
        continue
      }
      if (level > SPEAKING_LEVEL) this.lastActiveAt.set(id, now)
      ui.setPeerVoice(id, {
        speaking: now - (this.lastActiveAt.get(id) ?? 0) < SPEAKING_HOLD_MS,
      })
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
