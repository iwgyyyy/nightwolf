import { useState } from "react"
import { motion } from "framer-motion"
import { Sun, SkipForward, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { CountdownRing } from "@/components/game/CountdownRing"
import { PlayerTable } from "@/components/game/PlayerTable"
import { useWindowSize } from "@/hooks/use-window-size"
import {
  useGameStore,
  selectPlayers,
  selectHostId,
} from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { hostEndDay } from "@/hooks/use-host-orchestrator"

const MOBILE_BREAKPOINT = 640
const DESKTOP_DIAMETER = 420
const MOBILE_DIAMETER = 300

/**
 * 白天讨论阶段。
 *   - 圆桌展示所有玩家
 *   - 顶部：阶段标题 + 倒计时
 *   - 底部：Host 可"提前结束讨论"（AlertDialog 确认）
 *   - 倒计时到期或 Host 手动结束都进入 voting
 */
export default function DayScreen() {
  const publicState = useGameStore((s) => s.publicState)
  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const { width } = useWindowSize()
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT
  const diameter = isMobile ? MOBILE_DIAMETER : DESKTOP_DIAMETER
  const [ending, setEnding] = useState(false)

  if (!publicState) return null
  const isHost = hostId === playerId
  const totalSeconds = publicState.settings.discussionTime * 60

  const handleEnd = async () => {
    if (ending) return
    setEnding(true)
    try {
      await hostEndDay(publicState.roomId)
    } catch {
      toast.error("结束失败，请重试")
      setEnding(false)
    }
  }

  const tablePlayers = players.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    isHost: p.playerId === hostId,
    isYou: p.playerId === playerId,
    isConnected: p.isConnected,
  }))

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
        <p className="font-sans text-[0.65rem] uppercase tracking-[0.4em] text-candle-500/70">
          Day · 白天讨论
        </p>
        <div className="flex items-center gap-3">
          <Sun className="h-5 w-5 text-candle-500 candle-flicker" strokeWidth={1} />
          <h1 className="font-display text-2xl text-moon-100">
            自由讨论时间
          </h1>
        </div>
        <CountdownRing
          endsAt={publicState.phaseEndsAt}
          totalSeconds={totalSeconds}
          size={72}
        />
      </motion.header>

      <div className="mt-10 flex justify-center">
        <PlayerTable
          players={tablePlayers}
          diameter={diameter}
          seatSize={isMobile ? "sm" : "md"}
          center={
            <div className="flex flex-col items-center gap-2 text-center">
              <MessageCircle
                className="h-8 w-8 text-candle-500/70"
                strokeWidth={1}
              />
              <p className="font-display text-sm text-moon-100/60">
                讨论中…
              </p>
            </div>
          }
        />
      </div>

      {/* Host 提前结束 */}
      {isHost && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-auto w-full max-w-sm"
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2"
                disabled={ending}
              >
                <SkipForward className="h-4 w-4" />
                结束讨论，开始投票
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>结束讨论？</AlertDialogTitle>
                <AlertDialogDescription>
                  所有玩家将立即进入投票阶段，倒计时 {publicState.settings.voteTime} 秒。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleEnd}>
                  确认结束
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>
      )}

      {!isHost && (
        <p className="mt-auto text-center text-xs text-moon-100/40">
          讨论结束或房主提前结束后进入投票
        </p>
      )}
    </main>
  )
}
