import { create } from "zustand"

/**
 * 语音可用性：idle=未进房，connecting=正在连接语音服务/拿麦克风，ready=可用，
 * denied=权限被拒（可在用户手势里重试），
 * unsupported=环境不支持（非 HTTPS 访问时浏览器不提供 getUserMedia），
 * unavailable=语音服务连不上（token 请求多次无响应，可手动重试）
 */
export type VoiceStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "denied"
  | "unsupported"
  | "unavailable"

/** 其他玩家的语音状态（micOn 来自对端广播，speaking 来自本地音量采样） */
export interface PeerVoiceState {
  micOn: boolean
  speaking: boolean
}

interface VoiceUiState {
  status: VoiceStatus
  /** 自己的麦当前是否开启（track.enabled） */
  micOn: boolean
  /** 夜晚强制禁麦：锁定时不可手动开麦 */
  locked: boolean
  /** playerId → 对端语音状态 */
  peers: Record<string, PeerVoiceState>
  set: (patch: Partial<Omit<VoiceUiState, "set" | "setPeerVoice" | "clearPeerVoice" | "peers">>) => void
  setPeerVoice: (id: string, patch: Partial<PeerVoiceState>) => void
  clearPeerVoice: (id: string) => void
}

/** 跨 DOM/Canvas 与 VoiceService 共享的语音 UI 状态 */
export const useVoiceUiStore = create<VoiceUiState>()((set) => ({
  status: "idle",
  micOn: false,
  locked: false,
  peers: {},
  set: (patch) => set(patch),
  setPeerVoice: (id, patch) =>
    set((s) => {
      const prev = s.peers[id] ?? { micOn: false, speaking: false }
      const next = { ...prev, ...patch }
      // 值没变就不触发订阅者渲染
      if (prev.micOn === next.micOn && prev.speaking === next.speaking && s.peers[id])
        return s
      return { peers: { ...s.peers, [id]: next } }
    }),
  clearPeerVoice: (id) =>
    set((s) => {
      if (!(id in s.peers)) return s
      const peers = { ...s.peers }
      delete peers[id]
      return { peers }
    }),
}))
