import { useState } from "react"
import { motion } from "framer-motion"
import { Scale, Ban } from "lucide-react"
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

/**
 * 投票阶段：
 *   - 点击圆桌上其他玩家的座位 = 投他
 *   - 底部有"弃票"按钮
 *   - 选择后立刻提交；可重复覆盖（改票）直到最终结算
 *   - 投票行为公开（submittedPlayerIds），但**投给谁**不公开
 */
export default function VotingScreen() {
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const { width } = useWindowSize()
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT
  const diameter = isMobile ? MOBILE_DIAMETER : DESKTOP_DIAMETER
  const [localPick, setLocalPick] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!publicState) return null

  const hasSubmitted = publicState.submittedPlayerIds.includes(playerId)
  const totalSeconds = publicState.settings.voteTime

  const submit = async (targetId: string | null) => {
    if (submitting) return
    setSubmitting(true)
    setLocalPick(targetId)
    try {
      await getSyncService().submitAction(publicState.roomId, playerId, {
        kind: "vote",
        targetId,
      })
    } catch {
      toast.error("投票失败，请重试")
    } finally {
      setSubmitting(false)
    }
  }

  const onSeatClick = (targetId: string) => {
    if (targetId === playerId) return // 不能投自己
    void submit(targetId)
  }

  const tablePlayers = players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    isHost: p.playerId === hostId,
    isYou: p.playerId === playerId,
    isConnected: p.isConnected,
    // 已投过票的玩家用 "isActive" 高亮
    isActive: publicState.submittedPlayerIds.includes(p.playerId),
  }))

  const selected = localPick ? [localPick] : []

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
          onPlayerClick={onSeatClick}
          center={
            <div className="flex flex-col items-center gap-2 text-center">
              <Scale className="h-8 w-8 text-blood-500/70" strokeWidth={1} />
              <p className="font-display text-xs tracking-wider text-moon-100/55">
                {hasSubmitted ? "已投票（可改）" : "点击一名玩家投票"}
              </p>
            </div>
          }
        />
      </div>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        <Button
          size="lg"
          variant={localPick === null && hasSubmitted ? "default" : "outline"}
          className="w-full gap-2"
          onClick={() => submit(null)}
          disabled={submitting}
        >
          <Ban className="h-4 w-4" />
          弃票（不投任何人）
        </Button>
        <p className="text-center text-xs text-moon-100/40">
          已投 {publicState.submittedPlayerIds.length} / {players.length}
        </p>
      </div>
    </main>
  )
}
