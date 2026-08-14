import { useState } from "react"
import { SkipForward, Sun } from "lucide-react"
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
import { getSyncService } from "@/sync"
import { useGameStore, selectHostId } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"

/**
 * 白天讨论 HUD：顶栏居中标题 + 倒计时；房主可提前结束讨论进入投票。
 */
export function DayHud() {
  const publicState = useGameStore((s) => s.publicState)
  const hostId = useGameStore(selectHostId)
  const { playerId } = useLocalPlayer()
  const [ending, setEnding] = useState(false)

  if (!publicState) return null
  const isHost = hostId === playerId
  const totalSeconds = publicState.settings.discussionTime * 60

  const handleEnd = () => {
    if (ending) return
    setEnding(true)
    try {
      getSyncService().sendHostCommand(publicState.roomId, { kind: "endDay" })
    } catch {
      toast.error("结束失败，请重试")
      setEnding(false)
    }
  }

  return (
    <>
      {/* 顶栏：标题居中（避开左上角退出/解散按钮）+ 右侧倒计时 */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div className="absolute inset-x-0 text-center">
          <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-candle-500/70">
            Day
          </p>
          <h1 className="flex items-center justify-center gap-1.5 font-display text-lg text-moon-100/90">
            <Sun className="candle-flicker h-4 w-4 text-candle-500" strokeWidth={1.2} />
            自由讨论
          </h1>
        </div>
        <div className="relative">
          <CountdownRing
            endsAt={publicState.phaseEndsAt}
            totalSeconds={totalSeconds}
            size={52}
          />
        </div>
      </header>

      {/* 底部：房主可提前结束 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        {isHost ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 w-full max-w-56 gap-2 font-display"
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
                  所有玩家将立即进入投票阶段，倒计时{" "}
                  {publicState.settings.voteTime} 秒。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleEnd}>确认结束</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <p className="rounded-full bg-night-900/60 px-4 py-2 font-display text-sm text-moon-100/45 backdrop-blur-sm">
            讨论结束后进入投票
          </p>
        )}
      </footer>
    </>
  )
}
