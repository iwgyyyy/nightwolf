import { motion } from "framer-motion"
import { PauseCircle } from "lucide-react"

/**
 * 房主断线时的全屏暂停遮罩。
 *   - 由 `publicState.isPaused` 驱动显示
 *   - 房主重连后后端自动清除 isPaused，overlay 随之消失
 *   - 所有玩家都看到此遮罩（包括房主刚回来时，在 state 刷新前的短暂一瞬）
 */
export function PausedOverlay({ hostName }: { hostName?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-40 flex items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(circle, oklch(0.05 0.02 265 / 0.92) 0%, oklch(0.02 0 0 / 0.98) 80%)",
        backdropFilter: "blur(6px)",
      }}
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0.9, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="flex max-w-sm flex-col items-center gap-4 text-center"
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <PauseCircle className="h-16 w-16 text-candle-500/80" strokeWidth={1} />
        </motion.div>
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.4em] text-candle-500/70">
          Paused · 暂停中
        </p>
        <h2 className="font-display text-2xl text-moon-100">
          {hostName ? `房主 ${hostName} 已离开` : "房主已离开"}
        </h2>
        <p className="text-sm text-moon-100/55">
          等待房主重新连接后继续游戏……
        </p>
      </motion.div>
    </motion.div>
  )
}
