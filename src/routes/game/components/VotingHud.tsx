import { Ban, Scale } from "lucide-react"
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
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { useVoteUiStore } from "@/stores/voteUiStore"

/**
 * 投票阶段 HUD：顶栏血色主题 + 倒计时；
 * 选目标在场景内点牌完成，这里放提示、弃票入口与进度。
 */
export function VotingHud() {
  const publicState = useGameStore((s) => s.publicState)
  const { playerId } = useLocalPlayer()
  const selected = useVoteUiStore((s) => s.selected)
  const submitting = useVoteUiStore((s) => s.submitting)

  if (!publicState) return null

  const submitted = publicState.submittedPlayerIds.includes(playerId)
  const submittedCount = publicState.submittedPlayerIds.length
  const totalCount = publicState.players.length

  const handleAbstain = () => {
    if (submitted || submitting) return
    useVoteUiStore.getState().setSelected(null)
    useVoteUiStore.getState().setSubmitting(true)
    try {
      getSyncService().submitAction(publicState.roomId, {
        kind: "vote",
        targetId: null,
      })
    } catch {
      toast.error("提交失败，请重试")
      useVoteUiStore.getState().setSubmitting(false)
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
          <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-blood-500/80">
            Voting
          </p>
          <h1 className="flex items-center justify-center gap-1.5 font-display text-lg text-moon-100/90">
            <Scale className="h-4 w-4 text-blood-500" strokeWidth={1.2} />
            请投下你的一票
          </h1>
        </div>
        <div className="relative">
          <CountdownRing
            endsAt={publicState.phaseEndsAt}
            totalSeconds={publicState.settings.voteTime}
            size={52}
          />
        </div>
      </header>

      {/* 底部：提示 + 弃票 + 进度 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        {submitted ? (
          selected ? (
            <p className="rounded-full bg-night-900/60 px-4 py-2 font-display text-sm text-moon-100/45 backdrop-blur-sm">
              已投给{" "}
              <span className="text-sage-500">
                {publicState.players.find((p) => p.playerId === selected)?.name}
              </span>
              ，等待其他玩家…
            </p>
          ) : (
            <p className="flex items-center gap-1.5 rounded-full bg-night-900/60 px-4 py-2 font-display text-sm text-moon-100/45 backdrop-blur-sm">
              <Ban className="h-3.5 w-3.5" />
              你已弃票，等待其他玩家…
            </p>
          )
        ) : (
          <>
            <p className="rounded-full border border-blood-500/25 bg-night-900/60 px-4 py-2 font-display text-sm text-blood-500/90 backdrop-blur-sm">
              {selected
                ? "在气泡里确认，确认后不可修改"
                : "点一名玩家的牌投票，或选择弃票"}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 w-full max-w-xs gap-2 font-display"
                  disabled={submitting}
                >
                  <Ban className="h-4 w-4" />
                  弃票（不投任何人）
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确定弃票？</AlertDialogTitle>
                  <AlertDialogDescription>
                    弃票后不可修改。所有玩家都确认后将进入结算。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>再想想</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAbstain}>弃票</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        <p className="text-xs text-moon-100/40">
          已确认 {submittedCount} / {totalCount}
        </p>
      </footer>
    </>
  )
}
