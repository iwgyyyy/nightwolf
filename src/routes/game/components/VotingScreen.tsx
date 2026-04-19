import { useState } from "react"
import { motion } from "framer-motion"
import { Scale, Ban, Check, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CountdownRing } from "@/components/game/CountdownRing"
import { PlayerTable } from "@/components/game/PlayerTable"
import { useWindowSize } from "@/hooks/use-window-size"
import {
  useGameStore,
  selectPlayers,
  selectHostId,
} from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { getSyncService } from "@/sync"

const MOBILE_BREAKPOINT = 640
const DESKTOP_DIAMETER = 440
const MOBILE_DIAMETER = 320

/** 本地选择（未提交）：选目标 / 选弃票 / 未选 */
type LocalChoice =
  | { kind: "target"; targetId: string }
  | { kind: "abstain" }
  | null

/**
 * 投票阶段：
 *   - 点击头像 = 本地选中目标（未提交）
 *   - 点击"弃票"= 本地选中弃票（未提交）
 *   - 底部"确认最终投票"按钮点击后才真正提交，且不可修改
 *   - 所有人都确认后，host 推进到 result
 */
export default function VotingScreen() {
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const { width } = useWindowSize()
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT
  const diameter = isMobile ? MOBILE_DIAMETER : DESKTOP_DIAMETER
  const [choice, setChoice] = useState<LocalChoice>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!publicState) return null

  const hasSubmitted = publicState.submittedPlayerIds.includes(playerId)
  const totalSeconds = publicState.settings.voteTime
  const submittedCount = publicState.submittedPlayerIds.length
  const totalCount = players.length

  const pickedId = choice?.kind === "target" ? choice.targetId : null
  const isAbstain = choice?.kind === "abstain"
  const pickedName = players.find((p) => p.playerId === pickedId)?.name

  const onSeatClick = (targetId: string) => {
    if (hasSubmitted || submitting) return
    if (targetId === playerId) return
    setChoice({ kind: "target", targetId })
  }

  const onAbstainClick = () => {
    if (hasSubmitted || submitting) return
    setChoice({ kind: "abstain" })
  }

  const onConfirm = async () => {
    if (hasSubmitted || submitting || !choice) return
    setSubmitting(true)
    try {
      await getSyncService().submitAction(publicState.roomId, playerId, {
        kind: "vote",
        targetId: choice.kind === "target" ? choice.targetId : null,
      })
    } catch {
      toast.error("提交失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  const tablePlayers = players.map((p) => {
    const isMe = p.playerId === playerId
    return {
      playerId: p.playerId,
      name: p.name,
      isHost: p.playerId === hostId,
      isYou: isMe,
      isConnected: p.isConnected,
      isActive: publicState.submittedPlayerIds.includes(p.playerId),
      votedMark: !isMe && pickedId === p.playerId,
      below:
        isMe && pickedName ? (
          <VoteTargetTag targetName={pickedName} />
        ) : isMe && isAbstain ? (
          <AbstainTag />
        ) : null,
    }
  })

  const selected = pickedId ? [pickedId] : []

  return (
    <main
      className="relative flex flex-col items-center overflow-hidden px-5 pb-10"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
      }}
    >
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full flex-col items-center gap-3"
      >
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.4em] text-blood-500/80">
          Voting · 投票阶段
        </p>
        <div className="flex items-center gap-3">
          <Scale className="h-5 w-5 text-blood-500" strokeWidth={1} />
          <h1 className="font-display text-2xl text-moon-100">
            请投下你的一票
          </h1>
        </div>
        <CountdownRing
          endsAt={publicState.phaseEndsAt}
          totalSeconds={totalSeconds}
          size={72}
        />
      </motion.header>

      <div className="mt-8 flex justify-center">
        <PlayerTable
          players={tablePlayers}
          diameter={diameter}
          seatSize={isMobile ? "sm" : "md"}
          selectedPlayerIds={selected}
          onPlayerClick={hasSubmitted ? undefined : onSeatClick}
          center={
            <div className="flex flex-col items-center gap-2 text-center">
              <Scale className="h-8 w-8 text-blood-500/70" strokeWidth={1} />
              <p className="font-display text-xs tracking-wider text-moon-100/55">
                {hasSubmitted
                  ? "已确认，不可修改"
                  : choice
                    ? "可以继续改选 · 或点击下方确认"
                    : "点击一名玩家投票"}
              </p>
            </div>
          }
        />
      </div>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Button
          size="lg"
          variant={isAbstain ? "default" : "outline"}
          className="w-full gap-2"
          onClick={onAbstainClick}
          disabled={hasSubmitted || submitting}
        >
          <Ban className="h-4 w-4" />
          {isAbstain ? "已选弃票" : "弃票（不投任何人）"}
        </Button>

        {!hasSubmitted && choice && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-start gap-2 rounded-lg border border-blood-500/25 bg-blood-500/8 px-3 py-2 text-[0.75rem] text-moon-100/75"
          >
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blood-500" />
            <span>
              点击「已确认投票」后
              <span className="text-moon-100">不可再修改投票对象</span>
              。所有玩家都确认后将进入结算。
            </span>
          </motion.div>
        )}

        <Button
          size="lg"
          className="candle-glow w-full gap-2 font-display tracking-wider"
          onClick={onConfirm}
          disabled={hasSubmitted || submitting || !choice}
        >
          <Check className="h-4 w-4" />
          {hasSubmitted ? "已确认投票" : "已确认投票"}
        </Button>

        <p className="text-center text-xs text-moon-100/40">
          已确认 {submittedCount} / {totalCount}
        </p>
      </div>
    </main>
  )
}

function VoteTargetTag({ targetName }: { targetName: string }) {
  return (
    <span
      className="inline-flex max-w-[9em] items-center gap-1 truncate rounded-full border border-sage-500/40 bg-sage-500/15 px-2 py-0.5 text-[10px] tracking-wider text-sage-500"
      title={`你投给了 ${targetName}`}
    >
      投给 <span className="truncate font-medium text-moon-100">{targetName}</span>
    </span>
  )
}

function AbstainTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-moon-100/25 bg-night-800/60 px-2 py-0.5 text-[10px] tracking-wider text-moon-100/70">
      <Ban className="h-3 w-3" />
      弃票
    </span>
  )
}
