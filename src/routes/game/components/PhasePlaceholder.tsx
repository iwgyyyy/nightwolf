import { motion } from "framer-motion"
import type { GamePhase } from "@/types"

interface PhasePlaceholderProps {
  phase: GamePhase
  title: string
  description: string
}

/**
 * 夜晚/白天/投票/结算等阶段的通用占位面板。
 * 真正的 UI 在后续 Phase 6+ 逐个填充。
 */
export function PhasePlaceholder({ title, description }: PhasePlaceholderProps) {
  return (
    <main
      className="flex items-center justify-center px-6"
      style={{ minHeight: "100dvh" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="night-panel max-w-sm p-8 text-center"
      >
        <p className="font-sans text-xs uppercase tracking-[0.4em] text-candle-500/70">
          {title}
        </p>
        <h1 className="mt-3 font-display text-3xl text-moon-100 candle-text-glow">
          {description}
        </h1>
        <p className="mt-6 text-sm text-moon-100/40">
          该阶段 UI 将在后续 Phase 填充
        </p>
      </motion.div>
    </main>
  )
}
