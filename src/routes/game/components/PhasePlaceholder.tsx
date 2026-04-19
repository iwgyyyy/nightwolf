import { motion } from "framer-motion"
import { Eye } from "lucide-react"

interface PhasePlaceholderProps {
  title: string
  description: string
  hint?: string
}

/**
 * 观察者/异常态的通用占位面板：
 *   - 玩家未被分配私有状态（未参与本局）
 *   - 中途加入等其他边缘场景
 */
export function PhasePlaceholder({
  title,
  description,
  hint = "本局中途无法加入，可等待当前对局结束后再来一局",
}: PhasePlaceholderProps) {
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
        <Eye
          className="mx-auto mb-4 h-9 w-9 text-candle-500/60 candle-flicker"
          strokeWidth={0.8}
        />
        <p className="font-sans text-xs uppercase tracking-[0.4em] text-candle-500/70">
          {title}
        </p>
        <h1 className="mt-3 font-display text-3xl text-moon-100 candle-text-glow">
          {description}
        </h1>
        <p className="mt-6 text-sm text-moon-100/50">{hint}</p>
      </motion.div>
    </main>
  )
}
