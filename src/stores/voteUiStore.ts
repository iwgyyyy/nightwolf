import { create } from "zustand"

/**
 * 投票阶段跨 React root（DOM HUD ↔ Canvas 场景）的共享 UI 状态。
 * 提交与否以服务端 submittedPlayerIds 为准，这里只放本地选择。
 */
interface VoteUiState {
  /** 当前选中的投票目标（未提交）；提交后保留，作为"我投了他"的视觉标记 */
  selected: string | null
  /** 提交请求已发出，等服务端回包（防重复提交） */
  submitting: boolean
  setSelected: (id: string | null) => void
  setSubmitting: (v: boolean) => void
  reset: () => void
}

export const useVoteUiStore = create<VoteUiState>((set) => ({
  selected: null,
  submitting: false,
  setSelected: (id) => set({ selected: id }),
  setSubmitting: (v) => set({ submitting: v }),
  reset: () => set({ selected: null, submitting: false }),
}))
