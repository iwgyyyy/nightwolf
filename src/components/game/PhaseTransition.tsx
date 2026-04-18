import { AnimatePresence, motion } from "framer-motion"
import type { GamePhase } from "@/types"

const PHASE_META: Record<
  GamePhase,
  { title: string; subtitle: string; accent: string }
> = {
  waiting: {
    title: "等待大厅",
    subtitle: "Waiting",
    accent: "text-moon-100",
  },
  dealing: {
    title: "发牌",
    subtitle: "Dealing the cards",
    accent: "text-candle-500",
  },
  night: {
    title: "天黑请闭眼",
    subtitle: "Night falls",
    accent: "text-candle-500",
  },
  day: {
    title: "天亮了",
    subtitle: "Dawn",
    accent: "text-candle-400",
  },
  voting: {
    title: "开始投票",
    subtitle: "Cast your vote",
    accent: "text-blood-500",
  },
  result: {
    title: "结算",
    subtitle: "Reveal",
    accent: "text-candle-500",
  },
}

interface PhaseTransitionProps {
  phase: GamePhase | null
  /** 显示时长（毫秒），0 = 持续显示直到 phase 改变 */
  duration?: number
  onComplete?: () => void
}

/**
 * 阶段切换全屏过场：深色遮罩 + 大标题入场淡出。
 * 通过 `phase` 的变化触发。传入 null 时不显示。
 */
export function PhaseTransition({
  phase,
  duration = 1600,
  onComplete,
}: PhaseTransitionProps) {
  return (
    <AnimatePresence
      onExitComplete={() => {
        if (duration > 0) onComplete?.()
      }}
    >
      {phase && (
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-night-900/90 backdrop-blur-sm"
          onAnimationComplete={() => {
            if (duration > 0) {
              setTimeout(() => onComplete?.(), duration)
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{
              duration: 0.8,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.1,
            }}
            className="text-center"
          >
            <p className="font-sans text-xs tracking-[0.5em] uppercase text-moon-100/40">
              {PHASE_META[phase].subtitle}
            </p>
            <h1
              className={`mt-3 font-display text-6xl tracking-wide candle-text-glow md:text-7xl ${PHASE_META[phase].accent}`}
            >
              {PHASE_META[phase].title}
            </h1>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
