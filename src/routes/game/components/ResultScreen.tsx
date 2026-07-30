import { useState } from "react"
import { motion } from "framer-motion"
import {
  Trophy,
  RotateCcw,
  Skull,
  History,
  ChevronDown,
  Eye,
  ArrowRightLeft,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Card } from "@/components/game/Card"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { RoleBadge } from "@/components/game/RoleBadge"
import { ROLE_META } from "@/types"
import type { NightAction, Vote, WinResult } from "@/types"
import {
  useGameStore,
  selectPlayers,
  selectHostId,
} from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { getSyncService } from "@/sync"
import { cn } from "@/lib/utils"

const WIN_META: Record<
  WinResult,
  {
    title: string
    subtitle: string
    ring: string
    icon: string
    glow: string
  }
> = {
  villagerWin: {
    title: "村民阵营胜利",
    subtitle: "狼人被投票带走",
    ring: "ring-sage-500/60",
    icon: "text-sage-500",
    glow: "oklch(0.62 0.08 145 / 0.45)",
  },
  werewolfWin: {
    title: "狼人阵营胜利",
    subtitle: "没有狼人被投出",
    ring: "ring-blood-500/60",
    icon: "text-blood-500",
    glow: "oklch(0.58 0.17 25 / 0.45)",
  },
  tannerWin: {
    title: "皮匠独赢",
    subtitle: "皮匠如愿被投票带走",
    ring: "ring-candle-500/60",
    icon: "text-candle-500",
    glow: "oklch(0.78 0.13 75 / 0.45)",
  },
}

/**
 * 结算阶段：
 *   - 顶部横幅：胜利阵营
 *   - 玩家列表：身份牌翻开，出局者标记
 *   - 投票记录：每个玩家投了谁
 *   - 桌面 3 张牌翻开
 *   - Host 可点"再来一局"回 Lobby
 */
export default function ResultScreen() {
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const [resetting, setResetting] = useState(false)

  if (!publicState) return null
  const result = publicState.resultData
  if (!result) {
    return (
      <main
        className="flex items-center justify-center"
        style={{ minHeight: "100dvh" }}
      >
        <p className="text-moon-100/60">结算中…</p>
      </main>
    )
  }

  const isHost = hostId === playerId
  const meta = WIN_META[result.winner]

  const handlePlayAgain = async () => {
    if (resetting) return
    setResetting(true)
    try {
      getSyncService().sendHostCommand(publicState.roomId, { kind: "playAgain" })
    } catch {
      toast.error("重置失败")
      setResetting(false)
    }
  }

  return (
    <main
      className="relative flex flex-col items-center overflow-hidden px-5 pb-10"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
      }}
    >
      {/* 胜利横幅 + 光晕 */}
      <motion.header
        initial={{ opacity: 0, y: -12, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex w-full flex-col items-center gap-3"
      >
        {/* 背后脉冲光晕 */}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.15, 0.9] }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.3,
          }}
          className="pointer-events-none absolute top-1/2 left-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: meta.glow }}
        />
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.4em] text-moon-100/50">
          Result · 结算
        </p>
        <div
          className={cn(
            "relative flex items-center gap-3 rounded-full bg-night-800/80 px-6 py-3 ring-2 ring-inset backdrop-blur-sm",
            meta.ring,
          )}
        >
          <Trophy className={cn("h-6 w-6", meta.icon)} strokeWidth={1.2} />
          <div className="text-center">
            <h1 className="font-display text-xl text-moon-100">
              {meta.title}
            </h1>
            <p className="mt-0.5 text-xs text-moon-100/60">{meta.subtitle}</p>
          </div>
        </div>
      </motion.header>

      {/* 玩家身份揭示 */}
      <PlayerRevealGrid
        players={players.map((p) => ({
          id: p.playerId,
          name: p.name,
          role: result.finalRoles[p.playerId],
          isYou: p.playerId === playerId,
          isEliminated: result.eliminatedPlayerIds.includes(p.playerId),
        }))}
      />

      {/* 桌面 3 张牌 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="mt-8 w-full max-w-xl"
      >
        <h2 className="mb-3 text-center text-[0.65rem] uppercase tracking-[0.35em] text-moon-100/45">
          桌面牌
        </h2>
        <div className="flex items-center justify-center gap-3">
          {result.centerCards.map((role, i) => (
            <motion.div
              key={i}
              initial={{ rotateY: 0, opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 + i * 0.15 }}
              className="flex flex-col items-center gap-1.5"
            >
              <Card role={role} revealed size="sm" />
              <span className="text-[10px] text-moon-100/40">
                桌面 {i + 1}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* 投票记录 */}
      <VoteSummary votes={result.votes} players={players} />

      {/* 夜晚操作回放（可折叠） */}
      <NightPlayback actions={result.nightActions} players={players} />

      {/* 再来一局 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
        className="mt-10 w-full max-w-sm"
      >
        {isHost ? (
          <Button
            size="lg"
            onClick={handlePlayAgain}
            disabled={resetting}
            className="candle-glow h-12 w-full gap-2 font-display"
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? "重置中…" : "再来一局"}
          </Button>
        ) : (
          <p className="text-center text-xs text-moon-100/40">
            等待房主开启下一局…
          </p>
        )}
      </motion.div>
    </main>
  )
}

// ============================================================
// 玩家身份揭示（含出局标记）
// ============================================================

interface RevealedPlayer {
  id: string
  name: string
  role: import("@/types").Role | undefined
  isYou: boolean
  isEliminated: boolean
}

function PlayerRevealGrid({ players }: { players: RevealedPlayer[] }) {
  return (
    <section className="mt-8 grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {players.map((p, i) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: 16, rotateY: 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 + i * 0.12, duration: 0.55 }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border p-3 transition",
            p.isEliminated
              ? "border-blood-500/40 bg-blood-500/5"
              : "border-moon-100/10 bg-night-800/50",
          )}
        >
          <div className="relative">
            <PlayerAvatar name={p.name} size={44} />
            {p.isEliminated && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blood-500 text-night-900">
                <Skull className="h-3 w-3" strokeWidth={2} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="max-w-[7em] truncate font-display text-moon-100">
              {p.name}
            </span>
            {p.isYou && (
              <span className="rounded bg-moon-100/10 px-1 text-[9px] tracking-wider text-moon-100/50">
                你
              </span>
            )}
          </div>
          {p.role ? (
            <>
              <Card role={p.role} revealed size="sm" />
              <RoleBadge role={p.role} size="sm" />
            </>
          ) : (
            <Card size="sm" />
          )}
        </motion.div>
      ))}
    </section>
  )
}

// ============================================================
// 投票记录
// ============================================================

function VoteSummary({
  votes,
  players,
}: {
  votes: Vote[]
  players: import("@/types").PlayerPublicInfo[]
}) {
  const byId = new Map(players.map((p) => [p.playerId, p.name]))
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.0 }}
      className="mt-8 w-full max-w-xl"
    >
      <h2 className="mb-3 text-center text-[0.65rem] uppercase tracking-[0.35em] text-moon-100/45">
        投票记录
      </h2>
      <ul className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {votes.map((v, i) => (
          <li
            key={`${v.voterId}-${i}`}
            className="flex items-center gap-2 rounded-md bg-night-800/50 px-3 py-2"
          >
            <span className="max-w-[7em] truncate text-moon-100">
              {byId.get(v.voterId) ?? v.voterId}
            </span>
            <span className="text-moon-100/40">→</span>
            {v.targetId ? (
              <span className="max-w-[7em] truncate text-candle-500">
                {byId.get(v.targetId) ??
                  (v.targetId in ROLE_META ? ROLE_META[v.targetId as keyof typeof ROLE_META].displayName : v.targetId)}
              </span>
            ) : (
              <span className="text-moon-100/50 italic">弃票</span>
            )}
          </li>
        ))}
      </ul>
    </motion.section>
  )
}

// ============================================================
// 夜晚操作回放
// ============================================================

function NightPlayback({
  actions,
  players,
}: {
  actions: NightAction[]
  players: import("@/types").PlayerPublicInfo[]
}) {
  const [open, setOpen] = useState(false)
  if (actions.length === 0) return null
  const byId = new Map(players.map((p) => [p.playerId, p.name]))

  const labelFor = (id: string): string => {
    if (byId.has(id)) return byId.get(id)!
    if (id.startsWith("center_")) {
      return `桌面 ${Number(id.slice("center_".length)) + 1}`
    }
    return id
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.1 }}
      className="mt-6 w-full max-w-xl"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-moon-100/10 bg-night-800/50 px-4 py-3 text-left transition hover:border-candle-500/30"
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-candle-500/80" />
              <span className="font-display text-sm text-moon-100">
                夜晚操作回放
              </span>
              <span className="text-xs text-moon-100/40">
                {actions.length} 条
              </span>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-moon-100/50 transition-transform",
                !open && "-rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <ol className="space-y-1.5">
            {actions.map((a) => (
              <li
                key={a.order}
                className="flex items-start gap-2 rounded-md bg-night-800/40 px-3 py-2 text-xs text-moon-100/75"
              >
                <span className="mt-0.5 shrink-0 rounded bg-night-700/60 px-1.5 py-0.5 font-mono text-[10px] text-moon-100/50">
                  #{a.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-display text-moon-100">
                      {byId.get(a.actorId) ?? a.actorId}
                    </span>
                    <RoleBadge role={a.actorRole} size="sm" />
                    {a.status === "timedOut" && (
                      <span className="text-[10px] tracking-wider text-moon-100/40 uppercase">
                        超时未行动
                      </span>
                    )}
                  </div>
                  {a.cardChanges && a.cardChanges.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-moon-100/60">
                      <ArrowRightLeft className="h-3 w-3 text-candle-500/70" />
                      {a.cardChanges.map((c, i) => (
                        <span
                          key={i}
                          className="rounded bg-night-900/60 px-1.5 py-0.5"
                        >
                          {labelFor(c.targetId)}：
                          <span className="text-blood-500">
                            {ROLE_META[c.fromRole].displayName}
                          </span>
                          <span className="mx-1 text-moon-100/40">→</span>
                          <span className="text-sage-500">
                            {ROLE_META[c.toRole].displayName}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  {a.revealedRoles &&
                    Object.keys(a.revealedRoles).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-moon-100/60">
                        <Eye className="h-3 w-3 text-candle-500/70" />
                        {Object.entries(a.revealedRoles).map(([id, role]) => (
                          <span
                            key={id}
                            className="rounded bg-night-900/60 px-1.5 py-0.5"
                          >
                            {labelFor(id)}：
                            <span className="text-moon-100">
                              {ROLE_META[role].displayName}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                </div>
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
    </motion.section>
  )
}
