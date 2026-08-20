import { useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowRightLeft,
  Eye,
  History,
  RotateCcw,
  ScrollText,
  Trophy,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { RoleBadge } from "@/components/game/RoleBadge"
import { isPlayerWinner } from "@/engine/winJudge"
import { ROLE_META } from "@/types"
import type { NightAction, Vote, WinResult } from "@/types"
import { useGameStore, selectPlayers, selectHostId } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { useIsMobile } from "@/hooks/use-is-mobile"
import { getSyncService } from "@/sync"
import { cn } from "@/lib/utils"

const WIN_META: Record<
  WinResult,
  { title: string; subtitle: string; ring: string; icon: string; glow: string }
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
 * 结算 HUD：胜负横幅盖在 3D 翻牌桌上；
 * 投票记录与夜晚操作回放收进"本局详情"文本面板；房主可再来一局。
 */
export function ResultHud() {
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const isMobile = useIsMobile()
  const [detailOpen, setDetailOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (!publicState) return null
  const result = publicState.resultData
  if (!result) return null

  const isHost = hostId === playerId
  const meta = WIN_META[result.winner]
  // villagerWin 有一条"无人出局且场上无狼"的胜利路径，默认副标题不适用
  const subtitle =
    result.winner === "villagerWin" && result.eliminatedPlayerIds.length === 0
      ? "场上没有狼人，全员平安"
      : meta.subtitle
  const won = playerId
    ? isPlayerWinner(
        playerId,
        result.winner,
        result.finalRoles,
        result.eliminatedPlayerIds,
      )
    : false
  const selfEliminated =
    playerId != null && result.eliminatedPlayerIds.includes(playerId)

  const handlePlayAgain = () => {
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
    <>
      {/* 顶部：胜负横幅（居中，避开左上角退出/解散按钮） */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center"
        >
          <motion.div
            aria-hidden
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute top-1/2 left-1/2 h-32 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: meta.glow }}
          />
          <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-moon-100/50">
            Result
          </p>
          <div
            className={cn(
              "relative mt-1.5 flex items-center gap-2.5 rounded-full bg-night-800/80 px-5 py-2.5 ring-2 ring-inset backdrop-blur-sm",
              meta.ring,
            )}
          >
            <Trophy className={cn("h-5 w-5", meta.icon)} strokeWidth={1.2} />
            <div className="text-center">
              <h1 className="font-display text-lg leading-tight text-moon-100">
                {meta.title}
              </h1>
              <p className="text-[0.7rem] text-moon-100/60">{subtitle}</p>
            </div>
          </div>
          {/* 个人判定：胜负优先，出局只是后缀（出局≠失败，皮匠恰恰相反） */}
          {playerId && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="relative mt-2 font-display text-2xl leading-tight"
            >
              <span
                className={
                  won
                    ? "candle-text-glow text-candle-500"
                    : "text-moon-100/60"
                }
              >
                {won ? "您获胜了" : "您失败了"}
              </span>
              {selfEliminated && (
                <span className="text-blood-500"> · 出局</span>
              )}
            </motion.p>
          )}
        </motion.div>
      </header>

      {/* 底部：本局详情 + 再来一局 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <Button
          variant="outline"
          className="h-11 w-full max-w-56 gap-2 font-display"
          onClick={() => setDetailOpen(true)}
        >
          <ScrollText className="h-4 w-4" />
          本局详情
        </Button>
        {isHost ? (
          <Button
            className="candle-glow h-11 w-full max-w-56 gap-2 font-display"
            onClick={handlePlayAgain}
            disabled={resetting}
          >
            <RotateCcw className="h-4 w-4" />
            {resetting ? "重置中…" : "再来一局"}
          </Button>
        ) : (
          <p className="font-display text-xs text-moon-100/40">
            等待房主开启下一局…
          </p>
        )}
      </footer>

      {/* 详情面板：投票记录 + 夜晚操作回放（纯文本） */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "overflow-y-auto p-5",
            isMobile ? "max-h-[85dvh]" : "sm:max-w-md",
          )}
        >
          <SheetHeader className="p-0">
            <SheetTitle className="font-display text-lg text-moon-100">
              本局详情
            </SheetTitle>
          </SheetHeader>
          <VoteSummary votes={result.votes} players={players} selfId={playerId} />
          <NightPlayback
            actions={result.nightActions}
            players={players}
            selfId={playerId}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

// ============================================================
// 投票记录
// ============================================================

function VoteSummary({
  votes,
  players,
  selfId,
}: {
  votes: Vote[]
  players: import("@/types").PlayerPublicInfo[]
  selfId: string
}) {
  const byId = new Map(players.map((p) => [p.playerId, p.name]))
  const nameOf = (id: string) =>
    (byId.get(id) ?? id) + (id === selfId ? "（我）" : "")
  return (
    <section className="night-panel p-4">
      <h3 className="mb-3 font-display text-base text-moon-100">投票记录</h3>
      <ul className="grid grid-cols-1 gap-1.5 text-sm">
        {votes.map((v, i) => (
          <li
            key={`${v.voterId}-${i}`}
            className="flex items-center gap-2 rounded-md bg-night-800/50 px-3 py-2"
          >
            <span className="max-w-[9em] truncate text-moon-100">
              {nameOf(v.voterId)}
            </span>
            <span className="text-moon-100/40">→</span>
            {v.targetId ? (
              <span className="max-w-[9em] truncate text-candle-500">
                {nameOf(v.targetId)}
              </span>
            ) : (
              <span className="text-moon-100/50 italic">弃票</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ============================================================
// 夜晚操作回放（纯文本列表）
// ============================================================

function NightPlayback({
  actions,
  players,
  selfId,
}: {
  actions: NightAction[]
  players: import("@/types").PlayerPublicInfo[]
  selfId: string
}) {
  const byId = new Map(players.map((p) => [p.playerId, p.name]))
  if (actions.length === 0) return null

  const labelFor = (id: string): string => {
    if (byId.has(id)) return byId.get(id)! + (id === selfId ? "（我）" : "")
    if (id.startsWith("center_")) {
      return `桌面 ${Number(id.slice("center_".length)) + 1}`
    }
    return id
  }

  return (
    <section className="night-panel p-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-base text-moon-100">
        <History className="h-4 w-4 text-candle-500/80" />
        夜晚操作回放
        <span className="text-xs font-normal text-moon-100/40">
          {actions.length} 条
        </span>
      </h3>
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
                  {labelFor(a.actorId)}
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
                    <span key={i} className="rounded bg-night-900/60 px-1.5 py-0.5">
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
              {a.revealedRoles && Object.keys(a.revealedRoles).length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-moon-100/60">
                  <Eye className="h-3 w-3 text-candle-500/70" />
                  {Object.entries(a.revealedRoles).map(([id, role]) => (
                    <span key={id} className="rounded bg-night-900/60 px-1.5 py-0.5">
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
    </section>
  )
}
