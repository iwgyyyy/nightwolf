import { useState } from "react"
import { Check, Moon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { CountdownRing } from "@/components/game/CountdownRing"
import { getSyncService } from "@/sync"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { useNightUiStore } from "@/stores/nightUiStore"
import { buildNightSteps } from "@/engine/nightOrder"
import { isCenterId } from "@/engine/nightActions"
import { ROLE_META } from "@/types"
import type { NightActionSubmission } from "@/types"

/**
 * 夜晚阶段 HUD（DOM 层）。
 * 顶栏 z-50 仅 actor 睁眼时显示；非 actor 的回合信息在眼睑幕中央（NightCurtain）。
 * 底部操作区 z-10，闭眼时被幕布（z-40）盖住 —— 只有 actor 看得到。
 */
export function NightHud() {
  const { playerId } = useLocalPlayer()
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const stage = useNightUiStore((s) => s.stage)
  const selected = useNightUiStore((s) => s.selected)
  // 记录"发生在哪一步"，步骤推进后自动失效，无需 effect 重置
  const currentStep = publicState?.currentNightStep ?? null
  const [submittingAtStep, setSubmittingAtStep] = useState<number | null>(null)
  const submitting = submittingAtStep !== null && submittingAtStep === currentStep

  if (!publicState) return null

  const stepIdx = publicState.currentNightStep ?? 0
  const steps = buildNightSteps(publicState.settings.roles)
  const currentStepRole = steps[stepIdx] ?? null
  // 非 actor 闭眼时顶栏隐藏，回合信息由眼睑幕中央显示（NightCurtain）
  const isActor =
    currentStepRole !== null && privateState?.originalRole === currentStepRole
  const request = privateState?.nightActionRequest ?? null
  const result = privateState?.nightActionResult ?? null
  const submitted = publicState.submittedPlayerIds.includes(playerId)

  const submitDirect = (submission: NightActionSubmission) => {
    if (submitting) return
    setSubmittingAtStep(currentStep)
    try {
      getSyncService().submitAction(publicState.roomId, {
        kind: "nightAction",
        submission,
      })
      useNightUiStore.getState().setStage("waiting")
    } catch {
      toast.error("提交失败")
      setSubmittingAtStep(null)
    }
  }

  // ===== 底部内容 =====
  let bottom: React.ReactNode = null
  if (request && !submitted && stage === "selecting") {
    switch (request.kind) {
      case "werewolfConfirm":
        bottom = (
          <HintWithButton
            hint={
              request.otherWerewolves.length > 0
                ? "发光的人影是你的狼同伴，记住他们"
                : "你是唯一的狼人"
            }
            button="已记住"
            disabled={submitting}
            onClick={() => submitDirect({ kind: "werewolfConfirm" })}
          />
        )
        break
      case "minionView":
        bottom = (
          <HintWithButton
            hint={
              request.werewolfPlayers.length > 0
                ? "发光的人影是狼人，你站在他们一边"
                : "本局没有狼人玩家（狼人都在底牌里）"
            }
            button="已记住"
            disabled={submitting}
            onClick={() => submitDirect({ kind: "minionConfirm" })}
          />
        )
        break
      case "seerChoice": {
        const centers = selected.filter(isCenterId)
        bottom = (
          <div className="flex flex-col items-center gap-2">
            <Hint
              text={
                centers.length === 1
                  ? "再点一张底牌（共看两张）"
                  : "点一名玩家的牌查验，或点两张中央底牌"
              }
            />
            {centers.length === 2 && (
              <Button
                className="candle-glow h-11 w-full max-w-xs font-display"
                onClick={() => useNightUiStore.getState().confirmSelection()}
              >
                翻看这两张底牌
              </Button>
            )}
          </div>
        )
        break
      }
      case "troublemakerSwap":
        bottom = (
          <div className="flex flex-col items-center gap-2">
            <Hint
              text={
                selected.length < 2
                  ? `点两名玩家的牌交换他们的身份（已选 ${selected.length}/2）`
                  : "交换他们俩的身份牌？"
              }
            />
            {selected.length === 2 && (
              <Button
                className="candle-glow h-11 w-full max-w-xs font-display"
                onClick={() => useNightUiStore.getState().confirmSelection()}
              >
                交换
              </Button>
            )}
          </div>
        )
        break
      case "robberSwap":
        bottom = <Hint text="点一名玩家的牌，抢走他的身份" />
        break
      case "drunkSwap":
        bottom = <Hint text="点一张中央底牌与你交换（你不会看到新牌）" />
        break
      case "loneWerewolf":
        bottom = (
          <div className="flex flex-col items-center gap-2">
            <Hint text="你是唯一的狼人，可以偷看一张中央底牌" />
            <Button
              variant="outline"
              className="h-10 w-full max-w-xs font-display"
              disabled={submitting}
              onClick={() => submitDirect({ kind: "loneWerewolfSkip" })}
            >
              不看，跳过
            </Button>
          </div>
        )
        break
      case "insomniacView":
        bottom = <Hint text="点你面前的牌，确认自己现在的身份" />
        break
    }
  } else if (stage === "acting") {
    bottom = null
  } else if (stage === "revealing") {
    bottom = (
      <Button
        className="candle-glow h-11 w-full max-w-xs gap-2 font-display"
        onClick={() => useNightUiStore.getState().finishReveal()}
      >
        <Check className="h-4 w-4" />
        已记住
      </Button>
    )
  } else if (submitted || stage === "waiting" || result) {
    bottom = <Hint text="已完成，闭眼等待其他玩家…" muted />
  }

  return (
    <>
      {/* 顶栏：仅 actor 睁眼时显示；阶段状态居中，避开左上角退出/解散按钮 */}
      {isActor && (
        <header
          className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-end px-5"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <div className="absolute inset-x-0 text-center">
            <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-candle-500/70">
              Night
            </p>
            <h1 className="flex items-center justify-center gap-1.5 font-display text-lg text-moon-100/90">
              <Moon className="candle-flicker h-4 w-4 text-candle-500" strokeWidth={1.2} />
              {currentStepRole
                ? `${ROLE_META[currentStepRole].displayName}请睁眼`
                : "夜晚进行中"}
            </h1>
          </div>
          <div className="relative">
            <CountdownRing
              endsAt={publicState.phaseEndsAt}
              totalSeconds={publicState.settings.actionTime}
              size={52}
            />
          </div>
        </header>
      )}

      {/* 底部操作区：z-10，闭眼时被幕布盖住 */}
      {bottom && (
        <footer
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
        >
          {bottom}
        </footer>
      )}
    </>
  )
}

function Hint({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <p
      className={
        muted
          ? "rounded-full bg-night-900/60 px-4 py-2 font-display text-sm text-moon-100/45 backdrop-blur-sm"
          : "rounded-full border border-candle-500/25 bg-night-900/60 px-4 py-2 font-display text-sm text-candle-500/90 backdrop-blur-sm"
      }
    >
      {text}
    </p>
  )
}

function HintWithButton({
  hint,
  button,
  disabled,
  onClick,
}: {
  hint: string
  button: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Hint text={hint} />
      <Button
        className="candle-glow h-11 w-full max-w-xs gap-2 font-display"
        disabled={disabled}
        onClick={onClick}
      >
        <Check className="h-4 w-4" />
        {button}
      </Button>
    </div>
  )
}
