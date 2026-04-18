import { motion } from "framer-motion"
import type { Role, Team } from "@/types"
import { ROLE_META } from "@/types"
import { cn } from "@/lib/utils"
import { ROLE_GLYPH } from "./role-display"

/** 阵营颜色（用于卡面底部条带 + accent） */
const TEAM_ACCENT: Record<Team, string> = {
  werewolf: "bg-blood-500",
  villager: "bg-sage-500",
  independent: "bg-candle-500",
}

const TEAM_INK: Record<Team, string> = {
  werewolf: "text-blood-500",
  villager: "text-sage-500",
  independent: "text-candle-500",
}

type CardSize = "sm" | "md" | "lg"

const SIZE_STYLES: Record<
  CardSize,
  { wrap: string; glyph: string; name: string; en: string; band: string }
> = {
  sm: {
    wrap: "w-[64px] h-[90px]",
    glyph: "text-4xl",
    name: "text-[10px]",
    en: "text-[8px]",
    band: "h-1",
  },
  md: {
    wrap: "w-[104px] h-[146px]",
    glyph: "text-6xl",
    name: "text-xs",
    en: "text-[10px]",
    band: "h-1.5",
  },
  lg: {
    wrap: "w-[180px] h-[252px]",
    glyph: "text-[6rem] leading-none",
    name: "text-base",
    en: "text-[11px]",
    band: "h-2",
  },
}

interface CardProps {
  /** 当 role 为 null 时只能显示背面 */
  role?: Role | null
  /** 是否正面朝上（false = 背面） */
  revealed?: boolean
  size?: CardSize
  selected?: boolean
  disabled?: boolean
  /** 点击卡牌（仅非 disabled 生效） */
  onClick?: () => void
  /** 顶部角标（如"你"/"桌面 1"） */
  label?: string
  className?: string
}

/**
 * 羊皮纸卡牌，支持翻面动画 + 选中/禁用状态。
 *
 * 视觉：
 *  - 正面：羊皮纸背景 + 巨大汉字 + 阵营色条 + 英文名
 *  - 背面：深色羊皮纸 + 月相纹 + 阵营中性
 */
export function Card({
  role,
  revealed = false,
  size = "md",
  selected = false,
  disabled = false,
  onClick,
  label,
  className,
}: CardProps) {
  const sizeCls = SIZE_STYLES[size]
  const clickable = !!onClick && !disabled
  const showFront = revealed && role != null

  return (
    <motion.div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
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
      whileTap={clickable ? { scale: 0.97 } : undefined}
      className={cn(
        "relative shrink-0 rounded-xl outline-none",
        sizeCls.wrap,
        disabled && "opacity-40",
        selected && !disabled && "candle-glow",
        clickable && "cursor-pointer",
        className,
      )}
      style={{ perspective: 1000 }}
    >
      {/* 选中描边 */}
      {selected && !disabled && (
        <div className="pointer-events-none absolute -inset-0.5 rounded-xl ring-2 ring-candle-500" />
      )}

      {/* 翻转容器 */}
      <motion.div
        animate={{ rotateY: showFront ? 180 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative h-full w-full"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* 背面 */}
        <CardBack size={size} style={{ backfaceVisibility: "hidden" }} />
        {/* 正面 */}
        <CardFront
          role={role}
          size={size}
          sizeCls={sizeCls}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        />
      </motion.div>

      {/* 角标 */}
      {label && (
        <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-night-900/80 px-2 py-0.5 text-[10px] tracking-wider text-moon-100/80 backdrop-blur-sm">
          {label}
        </span>
      )}
    </motion.div>
  )
}

// ============================================================
// 背面
// ============================================================

function CardBack({
  size,
  style,
}: {
  size: CardSize
  style?: React.CSSProperties
}) {
  return (
    <div
      className="card-parchment-dim absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{
        ...style,
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='2'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.20  0 0 0 0 0.12  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\"), linear-gradient(135deg, oklch(0.40 0.05 60), oklch(0.30 0.05 60))",
        backgroundBlendMode: "multiply",
      }}
    >
      {/* 月相花纹 */}
      <svg
        viewBox="0 0 100 100"
        className={cn(
          "text-candle-500/60 candle-flicker",
          size === "sm"
            ? "h-8 w-8"
            : size === "md"
              ? "h-12 w-12"
              : "h-20 w-20",
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        aria-hidden
      >
        <circle cx="50" cy="50" r="22" strokeDasharray="2 3" />
        <path d="M50 34 A16 16 0 0 1 50 66 A22 22 0 0 0 50 34 Z" fill="currentColor" opacity="0.6" />
      </svg>

      {/* 边缘装饰 */}
      <div className="pointer-events-none absolute inset-2 rounded-lg border border-candle-500/20" />
    </div>
  )
}

// ============================================================
// 正面
// ============================================================

function CardFront({
  role,
  sizeCls,
  style,
}: {
  role: Role | null | undefined
  size: CardSize
  sizeCls: (typeof SIZE_STYLES)[CardSize]
  style?: React.CSSProperties
}) {
  if (!role) return null
  const meta = ROLE_META[role]
  const glyph = ROLE_GLYPH[role]

  return (
    <div
      className="card-parchment absolute inset-0 flex flex-col items-center justify-between overflow-hidden py-3 text-ink-900"
      style={style}
    >
      {/* 顶部：阵营点 */}
      <div className="flex w-full items-center justify-between px-3">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", TEAM_ACCENT[meta.team])}
          aria-hidden
        />
        <span className={cn("font-display tracking-widest", sizeCls.en)}>
          {role.slice(0, 3).toUpperCase()}
        </span>
      </div>

      {/* 中间：大字 */}
      <div
        className={cn(
          "flex flex-1 items-center justify-center font-display font-medium",
          sizeCls.glyph,
          TEAM_INK[meta.team],
        )}
        style={{
          textShadow:
            "0 1px 0 oklch(1 0 0 / 0.3), 0 -1px 0 oklch(0 0 0 / 0.25)",
        }}
      >
        {glyph}
      </div>

      {/* 底部：角色名 + 阵营色条 */}
      <div className="flex w-full flex-col items-center gap-1.5">
        <p className={cn("font-display tracking-wide", sizeCls.name)}>
          {meta.displayName}
        </p>
        <div className={cn("w-full", sizeCls.band, TEAM_ACCENT[meta.team])} />
      </div>
    </div>
  )
}
