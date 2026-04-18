import type { Role, Team } from "@/types"
import { ROLE_META } from "@/types"
import { cn } from "@/lib/utils"

const TEAM_STYLES: Record<Team, string> = {
  werewolf: "bg-blood-500/15 text-blood-500 border-blood-500/35",
  villager: "bg-sage-500/15 text-sage-500 border-sage-500/35",
  independent: "bg-candle-500/15 text-candle-500 border-candle-500/35",
}

const TEAM_LABEL: Record<Team, string> = {
  werewolf: "狼人阵营",
  villager: "村民阵营",
  independent: "独立",
}

interface RoleBadgeProps {
  role: Role
  size?: "sm" | "md"
  variant?: "pill" | "solid"
  withTeam?: boolean
  className?: string
}

/**
 * 角色徽章：展示中文角色名 + 阵营色。
 * 用于玩家列表、结算翻牌、回放日志等场景。
 */
export function RoleBadge({
  role,
  size = "md",
  variant = "pill",
  withTeam = false,
  className,
}: RoleBadgeProps) {
  const meta = ROLE_META[role]
  const isSolid = variant === "solid"

  const sizeClass =
    size === "sm"
      ? "px-2 py-0.5 text-[11px]"
      : "px-2.5 py-1 text-xs"

  const base = "inline-flex items-center gap-1.5 rounded-full border font-medium"

  return (
    <span
      className={cn(
        base,
        sizeClass,
        isSolid
          ? SOLID_STYLES[meta.team]
          : TEAM_STYLES[meta.team],
        className,
      )}
      title={TEAM_LABEL[meta.team]}
    >
      <span>{meta.displayName}</span>
      {withTeam && (
        <span className="opacity-60">· {TEAM_LABEL[meta.team]}</span>
      )}
    </span>
  )
}

const SOLID_STYLES: Record<Team, string> = {
  werewolf: "bg-blood-500 text-moon-100 border-transparent",
  villager: "bg-sage-500 text-moon-100 border-transparent",
  independent: "bg-candle-500 text-ink-900 border-transparent",
}
