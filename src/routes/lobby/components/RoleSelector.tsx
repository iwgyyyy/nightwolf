import { useState } from "react"
import { ChevronDown, Minus, Plus } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ALL_ROLES, ROLE_META, type Role, type Team } from "@/types"
import { countRoles } from "@/engine/orchestrator"
import { cn } from "@/lib/utils"

interface RoleSelectorProps {
  selected: Role[]
  requiredTotal: number
  disabled?: boolean
  /** 默认展开；false 时初始折叠 */
  defaultOpen?: boolean
  onChange: (next: Role[]) => void
}

const TEAM_COLOR: Record<Team, string> = {
  werewolf: "bg-blood-500/15 text-blood-500 border-blood-500/30",
  villager: "bg-sage-500/15 text-sage-500 border-sage-500/30",
  independent: "bg-candle-500/15 text-candle-500 border-candle-500/30",
}

const TEAM_LABEL: Record<Team, string> = {
  werewolf: "狼人阵营",
  villager: "村民阵营",
  independent: "独立",
}

// 按夜晚顺序 + team 排序，展示时清爽
const ORDERED_ROLES: Role[] = [...ALL_ROLES].sort((a, b) => {
  const oa = ROLE_META[a].nightOrder ?? 99
  const ob = ROLE_META[b].nightOrder ?? 99
  return oa - ob
})

export function RoleSelector({
  selected,
  requiredTotal,
  disabled,
  defaultOpen = true,
  onChange,
}: RoleSelectorProps) {
  const [open, setOpen] = useState(defaultOpen)
  const counts = countRoles(selected)
  const total = selected.length

  const handleAdd = (role: Role) => {
    if (disabled) return
    const currentCount = counts[role] ?? 0
    if (currentCount >= ROLE_META[role].maxCount) return
    if (total >= requiredTotal) return
    onChange([...selected, role])
  }

  const handleRemove = (role: Role) => {
    if (disabled) return
    const idx = selected.lastIndexOf(role)
    if (idx < 0) return
    const next = [...selected]
    next.splice(idx, 1)
    onChange(next)
  }

  const countClass = cn(
    "font-mono text-sm tabular-nums",
    total === requiredTotal
      ? "text-sage-500"
      : total > requiredTotal
        ? "text-blood-500"
        : "text-candle-500",
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center justify-between rounded-lg py-1 text-left outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-candle-500/40"
        >
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                "h-4 w-4 text-moon-100/50 transition-transform duration-200",
                !open && "-rotate-90",
              )}
            />
            <p className="font-display text-base text-moon-100">角色配置</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={countClass}>
              {total} / {requiredTotal}
            </span>
            <span className="text-[0.65rem] uppercase tracking-wider text-moon-100/40">
              {open ? "收起" : "展开"}
            </span>
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <ul className="grid grid-cols-1 gap-2">
          {ORDERED_ROLES.map((role) => {
          const meta = ROLE_META[role]
          const count = counts[role] ?? 0
          const reachedMax = count >= meta.maxCount
          const atMinimum = count === 0
          const canAdd = !disabled && !reachedMax && total < requiredTotal

          return (
            <li
              key={role}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2 transition",
                count > 0
                  ? "border-moon-100/15 bg-night-700/50"
                  : "border-moon-100/5 bg-night-800/40",
              )}
            >
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] tracking-wider",
                  TEAM_COLOR[meta.team],
                )}
                title={TEAM_LABEL[meta.team]}
              >
                {meta.nightOrder ?? "—"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-moon-100">
                  {meta.displayName}
                </p>
                <p className="text-[11px] text-moon-100/40">
                  {TEAM_LABEL[meta.team]} · 最多 {meta.maxCount}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={atMinimum || disabled}
                  onClick={() => handleRemove(role)}
                  aria-label={`减少 ${meta.displayName}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-night-900/70 text-moon-100/70 transition hover:bg-night-900 disabled:opacity-30"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center font-mono text-sm tabular-nums text-moon-100">
                  {count}
                </span>
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => handleAdd(role)}
                  aria-label={`增加 ${meta.displayName}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-candle-500/15 text-candle-500 transition hover:bg-candle-500/30 disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          )
        })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
