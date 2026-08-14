import { create } from "zustand"

/**
 * 夜晚阶段场景交互状态。DOM HUD 与 Canvas 场景跨 React root 共享。
 *
 * selecting  睁眼选目标（点场景里的牌/看发光的同伴）
 * acting     手部/换牌动画进行中，动画节点由场景状态机提交 submission
 * revealing  结果已回，翻开的牌正在展示，等"已记住"
 * waiting    本步骤已完成，闭眼等待其他人
 */
export type NightStage = "selecting" | "acting" | "revealing" | "waiting"

interface NightUiState {
  stage: NightStage
  /** 已选目标：playerId 或 "center_0/1/2" */
  selected: string[]
  setSelected: (ids: string[]) => void
  setStage: (s: NightStage) => void
  /** 气泡/HUD 确认选择 → 进入 acting，场景动画状态机接手 */
  confirmSelection: () => void
  /** 展示完毕（已记住）→ 牌扣回，进入 waiting */
  finishReveal: () => void
  reset: () => void
}

export const useNightUiStore = create<NightUiState>()((set) => ({
  stage: "selecting",
  selected: [],
  setSelected: (ids) => set({ selected: ids }),
  setStage: (s) => set({ stage: s }),
  confirmSelection: () =>
    set((st) => (st.stage === "selecting" ? { stage: "acting" } : st)),
  finishReveal: () =>
    set((st) => (st.stage === "revealing" ? { stage: "waiting" } : st)),
  reset: () => set({ stage: "selecting", selected: [] }),
}))
