import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import type {
  PlayerPublicInfo,
  PrivatePlayerState,
  PublicRoomState,
} from "@/types"

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export type LobbyError =
  | "invalid"
  | "not-found"
  | "in-progress"
  | "full"
  | "unknown"

interface GameState {
  /** 当前房间 ID（null = 未加入任何房间） */
  currentRoomId: string | null
  /** 连接状态 */
  connectionStatus: ConnectionStatus
  /** 进入/加入房间时出现的错误 */
  joinError: LobbyError | null
  /** 公共房间状态 */
  publicState: PublicRoomState | null
  /** 本玩家的私有状态（服务端单播，只含自己那份） */
  privateState: PrivatePlayerState | null
}

interface GameActions {
  setCurrentRoom: (roomId: string | null) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setJoinError: (err: LobbyError | null) => void
  setPublicState: (state: PublicRoomState) => void
  setPrivateState: (state: PrivatePlayerState) => void
  /** 重置所有房间相关状态（离开房间 / 被解散 / 再来一局） */
  resetRoom: () => void
}

const INITIAL_STATE: GameState = {
  currentRoomId: null,
  connectionStatus: "idle",
  joinError: null,
  publicState: null,
  privateState: null,
}

export const useGameStore = create<GameState & GameActions>()(
  immer((set) => ({
    ...INITIAL_STATE,

    setCurrentRoom: (roomId) =>
      set((s) => {
        s.currentRoomId = roomId
      }),

    setConnectionStatus: (status) =>
      set((s) => {
        s.connectionStatus = status
      }),

    setJoinError: (err) =>
      set((s) => {
        s.joinError = err
      }),

    setPublicState: (state) =>
      set((s) => {
        s.publicState = state
      }),

    setPrivateState: (state) =>
      set((s) => {
        s.privateState = state
      }),

    resetRoom: () =>
      set((s) => {
        Object.assign(s, INITIAL_STATE)
      }),
  })),
)

// ============================================================
// Selectors（避免组件订阅整个 store 导致过度重渲染）
// ============================================================

// 稳定引用的空数组：避免 selector 在 publicState 为 null 时每次返回新数组，
// 触发 useSyncExternalStore 的无限循环警告。
const EMPTY_PLAYERS: PlayerPublicInfo[] = []

export const selectPlayers = (s: GameState): PlayerPublicInfo[] =>
  s.publicState?.players ?? EMPTY_PLAYERS
export const selectGamePhase = (s: GameState) =>
  s.publicState?.gamePhase ?? null
export const selectHostId = (s: GameState) => s.publicState?.hostId ?? null
