import { AnimatePresence, motion } from "framer-motion"
import { Crown, Moon, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { PlayerAvatar } from "./PlayerAvatar"

type SeatSize = "sm" | "md" | "lg"

const SIZE: Record<
  SeatSize,
  { avatar: number; name: string; crown: string }
> = {
  sm: { avatar: 32, name: "text-xs", crown: "h-3 w-3" },
  md: { avatar: 48, name: "text-sm", crown: "h-3.5 w-3.5" },
  lg: { avatar: 64, name: "text-base", crown: "h-4 w-4" },
}

interface PlayerSeatProps {
  name: string
  size?: SeatSize
  isHost?: boolean
  isYou?: boolean
  isConnected?: boolean
  /** 正在被唤醒 / 行动中：发光 + 呼吸 */
  isActive?: boolean
  /** 闭眼等待中：变暗 + 呼吸 + Zz 飘浮 */
  isSleeping?: boolean
  /** 已出局：灰度 + 打叉 */
  isEliminated?: boolean
  /** 被选中（作为夜晚目标、投票目标） */
  selected?: boolean
  /** 被自己投出的标记：头像上半透明 Check（用于 VotingScreen） */
  votedMark?: boolean
  /** 上下浮动（闭眼漂浮效果，通常只给"自己"在闭眼时用） */
  floating?: boolean
  /** 危险高亮（狼人 / 出局预警）：红色光晕 */
  danger?: boolean
  onClick?: () => void
  className?: string
  /** 底部附加信息（如角色徽章、投票计数） */
  footer?: React.ReactNode
  /** 座位下方的附加内容（圆桌场景用于挂背面卡牌） */
  below?: React.ReactNode
}

/**
 * 玩家座位：头像 + 名字 + 状态叠加。
 * 可独立使用，也是 PlayerTable 的原子单元。
 */
export function PlayerSeat({
  name,
  size = "md",
  isHost = false,
  isYou = false,
  isConnected = true,
  isActive = false,
  isSleeping = false,
  isEliminated = false,
  selected = false,
  votedMark = false,
  floating = false,
  danger = false,
  onClick,
  className,
  footer,
  below,
}: PlayerSeatProps) {
  const cfg = SIZE[size]
  const clickable = !!onClick && !isEliminated

  const ring: "candle" | "sage" | "blood" | "none" = danger
    ? "blood"
    : selected || isActive || isHost
      ? "candle"
      : "none"

  return (
    <motion.div
      onClick={clickable ? onClick : undefined}
      whileTap={clickable ? { scale: 0.96 } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      animate={
        floating
          ? { y: [0, -6, 0] }
          : undefined
      }
      transition={
        floating
          ? { duration: 3.2, repeat: Infinity, ease: "easeInOut" }
          : undefined
      }
      className={cn(
        "relative flex flex-col items-center gap-1.5 select-none",
        clickable && "cursor-pointer",
        !isConnected && !isEliminated && "opacity-50",
        isSleeping && !isEliminated && "opacity-60",
        isEliminated && "opacity-40 grayscale",
        className,
      )}
    >
      {/* 头像 */}
      <div
        className={cn(
          "relative",
          isActive && "breathing-pulse",
          isSleeping && !isActive && "breathing-pulse",
        )}
      >
        <PlayerAvatar
          name={name}
          size={cfg.avatar}
          ring={ring}
        />

        {/* 闭眼遮罩 */}
        {isSleeping && !isEliminated && <SleepOverlay size={cfg.avatar} />}

        {/* Host 皇冠叠加 */}
        {isHost && (
          <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-candle-500 text-ink-900 shadow-md">
            <Crown className={cfg.crown} />
          </span>
        )}

        {/* 漂浮的 Z */}
        <AnimatePresence>
          {isSleeping && !isEliminated && <SleepZ key="z" />}
        </AnimatePresence>

        {/* 出局打叉 */}
        {isEliminated && <EliminationMark />}

        {/* 投票目标标记：头像正中半透明 Check，名字不遮 */}
        <AnimatePresence>
          {votedMark && !isEliminated && <VotedMark size={cfg.avatar} />}
        </AnimatePresence>
      </div>

      {/* 名字 + 你标记 */}
      <div
        className={cn(
          "flex items-center gap-1 font-display",
          cfg.name,
          selected && "text-candle-500",
        )}
      >
        <span className="max-w-[7em] truncate">{name}</span>
        {isYou && (
          <span className="rounded bg-moon-100/10 px-1 text-[9px] tracking-wider text-moon-100/50">
            你
          </span>
        )}
      </div>

      {/* 底部附加槽 */}
      {footer && <div className="mt-0.5">{footer}</div>}

      {/* 座位下方扩展槽（圆桌场景用于挂背面卡牌） */}
      {below && <div className="mt-1 flex justify-center">{below}</div>}

      {/* 在线指示 */}
      {!isConnected && !isEliminated && (
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-night-900 bg-moon-100/30" />
      )}
    </motion.div>
  )
}

function SleepOverlay({ size }: { size: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-night-900/40 backdrop-blur-[1px]"
      aria-hidden
    >
      <Moon
        className="text-candle-500/80 candle-flicker"
        style={{ width: size * 0.45, height: size * 0.45 }}
        strokeWidth={1}
      />
    </div>
  )
}

function SleepZ() {
  return (
    <motion.span
      aria-hidden
      className="absolute -top-3 -right-2 font-display text-xs text-moon-100/70"
      initial={{ opacity: 0, y: 4, scale: 0.8 }}
      animate={{
        opacity: [0.8, 1, 0.4],
        y: [-2, -10, -18],
        scale: [1, 0.95, 0.8],
      }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        ease: "easeOut",
      }}
    >
      Z
    </motion.span>
  )
}

function VotedMark({ size }: { size: number }) {
  return (
    <motion.div
      aria-hidden
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full"
      style={{
        background:
          "radial-gradient(circle, oklch(0.62 0.08 145 / 0.75), oklch(0.62 0.08 145 / 0.35) 65%, transparent 80%)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-sage-500 text-night-900 shadow-lg"
        style={{ width: size * 0.6, height: size * 0.6 }}
      >
        <Check style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={3} />
      </div>
    </motion.div>
  )
}

function EliminationMark() {
  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full text-blood-500"
      aria-hidden
    >
      <line
        x1="15"
        y1="15"
        x2="85"
        y2="85"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.8"
      />
    </svg>
  )
}
