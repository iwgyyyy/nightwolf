import { create } from "zustand"

/**
 * 发牌阶段"翻看自己身份牌"的交互状态。
 * DOM HUD 与 Canvas 场景是两个 React root，用 zustand 共享。
 *
 * down     牌扣在桌上，可点
 * picking  手正伸向牌
 * holding  牌已举到眼前（HUD 显示角色说明与确认按钮）
 * returning 牌正放回桌面
 */
export type PeekStage = "down" | "picking" | "holding" | "returning"

interface DealingUiState {
  peekStage: PeekStage
  setPeekStage: (s: PeekStage) => void
  /** 点牌触发（仅 down 状态有效） */
  requestPeek: () => void
  /** 确认/收起触发（仅 holding 状态有效） */
  requestReturn: () => void
  reset: () => void
}

export const useDealingUiStore = create<DealingUiState>()((set) => ({
  peekStage: "down",
  setPeekStage: (s) => set({ peekStage: s }),
  requestPeek: () =>
    set((st) => (st.peekStage === "down" ? { peekStage: "picking" } : st)),
  requestReturn: () =>
    set((st) => (st.peekStage === "holding" ? { peekStage: "returning" } : st)),
  reset: () => set({ peekStage: "down" }),
}))
