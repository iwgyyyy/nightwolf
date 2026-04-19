import { motion } from "framer-motion"
import { Moon } from "lucide-react"
import { CountdownRing } from "@/components/game/CountdownRing"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { ROLE_META } from "@/types"
import type { Role } from "@/types"
import { buildNightSteps } from "@/engine/nightOrder"
import { NightActionDispatcher } from "./NightActionPanels"
import { NightTable } from "./NightTable"
import { RevealOverlay } from "./RevealOverlay"

/**
 * 夜晚阶段主屏：
 *   - 顶部：当前角色提示 + 倒计时
 *   - 中间：沉浸式圆桌（闭眼遮罩 / 睁眼高亮）
 *   - 底部：actor 的操作面板 / 闭眼等待提示
 */
export default function NightScreen() {
  const { playerId } = useLocalPlayer()
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)

  if (!publicState) {
    return <LoadingNight />
  }

  const stepIdx = publicState.currentNightStep ?? 0
  const steps = buildNightSteps(publicState.settings.roles)
  const currentStepRole = steps[stepIdx] ?? null
  const request = privateState?.nightActionRequest ?? null
  const result = privateState?.nightActionResult ?? null
  const submitted = publicState.submittedPlayerIds.includes(playerId)

  // 是否"本步骤的 actor" = 初始身份匹配当前步
  const isActorThisStep =
    !!currentStepRole && privateState?.originalRole === currentStepRole
  const actingNow = isActorThisStep && (!!request || !!result || submitted)

  return (
    <main
      className="relative flex flex-col items-center overflow-hidden px-5 pb-10"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
      }}
    >
      <NightTopBar
        currentStepRole={currentStepRole}
        endsAt={publicState.phaseEndsAt}
        actionTime={publicState.settings.actionTime}
      />

      {/* 沉浸式圆桌 */}
      <div className="mt-20 w-full">
        <NightTable isActorThisStep={isActorThisStep} />
      </div>

      {/* 底部：操作面板 / 等待提示（z-40 确保不被圆桌遮罩覆盖） */}
      <div className="relative z-40 mt-4 flex w-full flex-1 flex-col items-center justify-start">
        {actingNow && request ? (
          <NightActionDispatcher request={request} result={result} />
        ) : (
          <SleepingHint />
        )}
      </div>

      {/* 查看牌的中央翻面动画（swapResult / rolesRevealed 时触发） */}
      <RevealOverlay />
    </main>
  )
}

// ============================================================
// 顶部栏
// ============================================================

function NightTopBar({
  currentStepRole,
  endsAt,
  actionTime,
}: {
  currentStepRole: Role | null
  endsAt: string | null
  actionTime: number
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-50 flex w-full flex-col items-center gap-3"
    >
      <p className="font-sans text-[0.65rem] uppercase tracking-[0.4em] text-candle-500/70">
        Night · 夜晚阶段
      </p>
      <div className="flex items-center gap-3">
        <Moon className="h-5 w-5 text-candle-500 candle-flicker" strokeWidth={1} />
        <h1 className="font-display text-2xl text-moon-100">
          {currentStepRole
            ? `${ROLE_META[currentStepRole].displayName}请睁眼`
            : "夜晚进行中"}
        </h1>
      </div>
      <CountdownRing endsAt={endsAt} totalSeconds={actionTime} size={64} />
    </motion.header>
  )
}

// ============================================================
// 闭眼等待提示（底部）
// ============================================================

function SleepingHint() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center gap-1 text-center"
    >
      <p className="font-display text-base text-moon-100/70">闭眼等待</p>
      <p className="text-xs text-moon-100/40">
        其他玩家正在行动，请保持闭眼不偷看
      </p>
    </motion.div>
  )
}

function LoadingNight() {
  return (
    <main
      className="flex flex-col items-center justify-center"
      style={{ minHeight: "100dvh" }}
    >
      <Moon
        className="h-10 w-10 text-candle-500/60 candle-flicker"
        strokeWidth={0.8}
      />
      <p className="mt-3 text-moon-100/60">夜幕降临…</p>
    </main>
  )
}
