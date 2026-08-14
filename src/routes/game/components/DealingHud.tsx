import { useState } from "react"
import { Check, Hand as HandIcon } from "lucide-react"
import { toast } from "sonner"
import { CountdownRing } from "@/components/game/CountdownRing"
import { RoleBadge } from "@/components/game/RoleBadge"
import { Button } from "@/components/ui/button"
import { getSyncService } from "@/sync"
import { getNarrationService } from "@/services/NarrationService"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { useDealingUiStore } from "@/stores/dealingUiStore"
import { ROLE_DESCRIPTION } from "@/components/game/role-display"
import { DEALING_TIMEOUT_MS } from "@/engine/orchestrator"

const DEALING_TIMEOUT_SEC = Math.floor(DEALING_TIMEOUT_MS / 1000)

/**
 * 发牌阶段 HUD（DOM 层，叠在 3D 场景上）。
 * 翻牌动作在场景里完成；这里只负责提示、角色说明、确认与倒计时。
 */
export function DealingHud() {
  const { playerId } = useLocalPlayer()
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const peekStage = useDealingUiStore((s) => s.peekStage)
  const [submitting, setSubmitting] = useState(false)

  if (!publicState || !privateState) return null
  const roomId = publicState.roomId
  const submitted = publicState.submittedPlayerIds.includes(playerId)
  const confirmedCount = publicState.submittedPlayerIds.length
  const total = publicState.players.length
  const myRole = privateState.originalRole

  const handleConfirm = () => {
    if (submitted || submitting) return
    // 这个点击是夜晚语音前最后一次用户手势，再 prime 一次 TTS
    getNarrationService().prime()
    setSubmitting(true)
    try {
      getSyncService().submitAction(roomId, { kind: "confirmIdentity" })
    } catch {
      toast.error("提交失败，请重试")
      setSubmitting(false)
    }
    useDealingUiStore.getState().requestReturn()
  }

  const handlePutBack = () => {
    useDealingUiStore.getState().requestReturn()
  }

  return (
    <>
      {/* 顶部：阶段标题 + 倒计时 */}
      <header
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <div>
          <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-candle-500/70">
            Dealing
          </p>
          <h1 className="font-display text-xl text-moon-100/90">确认身份</h1>
        </div>
        <CountdownRing
          endsAt={publicState.phaseEndsAt}
          totalSeconds={DEALING_TIMEOUT_SEC}
          size={52}
        />
      </header>

      {/* 底部：按交互阶段切换 */}
      <footer
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        {peekStage === "holding" ? (
          <div className="night-panel w-full max-w-md p-4 text-center">
            <RoleBadge role={myRole} size="md" variant="solid" />
            <p className="mt-2 text-sm leading-relaxed text-moon-100/70">
              {ROLE_DESCRIPTION[myRole]}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {submitted ? (
                <Button
                  variant="outline"
                  className="h-11 font-display"
                  onClick={handlePutBack}
                >
                  扣回桌面
                </Button>
              ) : (
                <Button
                  className="candle-glow h-11 w-full max-w-xs font-display text-base tracking-wider"
                  disabled={submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? "提交中…" : "我已记住"}
                </Button>
              )}
            </div>
          </div>
        ) : submitted ? (
          <div className="flex items-center gap-2 rounded-full border border-sage-500/30 bg-sage-500/10 px-5 py-2.5 text-sage-500 backdrop-blur-sm">
            <Check className="h-4 w-4" />
            <span className="font-display text-sm tracking-wide">
              已确认身份 · 等待其他人（{confirmedCount}/{total}）
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-candle-500/25 bg-night-900/60 px-5 py-2.5 text-candle-500/90 backdrop-blur-sm">
            <HandIcon className="h-4 w-4" />
            <span className="font-display text-sm tracking-wide">
              点你面前的牌，看看你的身份
            </span>
          </div>
        )}
      </footer>
    </>
  )
}
