import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CountdownRing } from "@/components/game/CountdownRing"
import { buildNightSteps } from "@/engine/nightOrder"
import { useGameStore, selectGamePhase } from "@/stores/gameStore"
import { ROLE_META } from "@/types"

interface NightCurtainProps {
  /** 是否"睁眼"：true = 两片幕布退到屏幕外，false = 合拢覆盖屏幕 */
  isOpen: boolean
}

const CURTAIN_TRANSITION = {
  duration: 0.85,
  ease: [0.65, 0, 0.35, 1] as const,
}

/**
 * 「天黑请闭眼」的全屏眼睑幕：
 *   - 上下两片黑幕从屏幕两端向中央合拢 / 从中央向两端退散
 *   - 首次合拢后，中央播放一次"睁眼 → 闭眼 → 保持 1s → 消失"的眼睛动画
 *   - 顶栏（z-50）始终不被遮住
 *
 * 使用方式：外层用 AnimatePresence 包裹，phase 离开 night 时卸载触发 exit。
 */
export function NightCurtain({ isOpen }: NightCurtainProps) {
  // 仅在"首次非 actor 挂载"时播放一次眼睛动画；后续 isOpen 变化不重播
  const [playEye] = useState(() => !isOpen)
  // 眼睛动画播完（约 0.85s delay + 2.4s）前中央让位，播完后再显示回合信息
  const [eyeDone, setEyeDone] = useState(!playEye)
  useEffect(() => {
    if (eyeDone) return
    const timer = setTimeout(() => setEyeDone(true), 3400)
    return () => clearTimeout(timer)
  }, [eyeDone])

  const publicState = useGameStore((s) => s.publicState)
  const stepIdx = publicState?.currentNightStep ?? 0
  const currentStepRole = publicState
    ? (buildNightSteps(publicState.settings.roles)[stepIdx] ?? null)
    : null

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-40"
      aria-hidden
    >
      {/* 上幕 */}
      <motion.div
        className="absolute top-0 right-0 left-0 h-1/2 bg-night-900"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--night-900) 0%, var(--night-900) 70%, oklch(0.08 0.03 265) 100%)",
          boxShadow: "0 12px 32px oklch(0 0 0 / 0.5)",
        }}
        initial={{ y: "-100%" }}
        animate={{ y: isOpen ? "-100%" : "0%" }}
        exit={{ y: "-100%" }}
        transition={CURTAIN_TRANSITION}
      />

      {/* 下幕 */}
      <motion.div
        className="absolute right-0 bottom-0 left-0 h-1/2 bg-night-900"
        style={{
          backgroundImage:
            "linear-gradient(to top, var(--night-900) 0%, var(--night-900) 70%, oklch(0.08 0.03 265) 100%)",
          boxShadow: "0 -12px 32px oklch(0 0 0 / 0.5)",
        }}
        initial={{ y: "100%" }}
        animate={{ y: isOpen ? "100%" : "0%" }}
        exit={{ y: "100%" }}
        transition={CURTAIN_TRANSITION}
      />

      {/* 眼睛动画（仅首次合拢后播一次） */}
      {playEye && <ClosingEye />}

      {/* 闭眼时把当前回合与倒计时放到幕布正中（非 actor 唯一的信息源） */}
      <AnimatePresence>
        {!isOpen && eyeDone && publicState && (
          <motion.div
            key="turn-info"
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.6, delay: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            <div className="text-center">
              <p className="font-sans text-[0.6rem] uppercase tracking-[0.35em] text-candle-500/70">
                Night
              </p>
              <h2 className="mt-1.5 font-display text-2xl text-moon-100/90">
                {currentStepRole
                  ? `${ROLE_META[currentStepRole].displayName}请睁眼`
                  : "夜晚进行中"}
              </h2>
            </div>
            <CountdownRing
              endsAt={publicState.phaseEndsAt}
              totalSeconds={publicState.settings.actionTime}
              size={84}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/**
 * 在 GamePage 层挂载，这样 phase 从 night 切走时 AnimatePresence 能播 exit
 * 动画（幕布从中央向两端退散，模拟睁眼）。
 */
export function NightCurtainHost() {
  const phase = useGameStore(selectGamePhase)
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)

  const isActorThisStep = (() => {
    if (phase !== "night" || !publicState || !privateState) return false
    const stepIdx = publicState.currentNightStep ?? 0
    const steps = buildNightSteps(publicState.settings.roles)
    const currentStepRole = steps[stepIdx] ?? null
    return (
      !!currentStepRole && privateState.originalRole === currentStepRole
    )
  })()

  return (
    <AnimatePresence>
      {phase === "night" && (
        <NightCurtain key="night-curtain" isOpen={isActorThisStep} />
      )}
    </AnimatePresence>
  )
}

// ============================================================
// 眼睛：睁开 → 闭合 → 保持 1s → 消失
// ============================================================

/**
 * 时间轴（总长 2.4s，幕布合拢后 delay 0.85s 开始）：
 *   0.00s  scaleY 0.03  opacity 0     （幕布刚合拢，眼尚未出现）
 *   0.30s  scaleY 1     opacity 1     （睁开到最大）
 *   0.70s  scaleY 1     opacity 1     （保持睁开）
 *   1.10s  scaleY 0.03  opacity 1     （闭眼，眼皮压下）
 *   2.10s  scaleY 0.03  opacity 1     （保持闭合 1s）
 *   2.40s  scaleY 0.03  opacity 0     （淡出）
 */
const EYE_KEYFRAMES = {
  opacity: [0, 1, 1, 1, 1, 0],
  scaleY: [0.03, 1, 1, 0.03, 0.03, 0.03],
}

const EYE_TIMES = [0, 0.125, 0.292, 0.458, 0.875, 1]

function ClosingEye() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <motion.div
        className="origin-center"
        initial={{ opacity: 0, scaleY: 0.03 }}
        animate={EYE_KEYFRAMES}
        transition={{
          duration: 2.4,
          times: EYE_TIMES,
          delay: 0.85,
          ease: "easeInOut",
        }}
      >
        <EyeSvg />
      </motion.div>
    </div>
  )
}

function EyeSvg() {
  return (
    <svg
      viewBox="0 0 240 110"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "min(260px, 64vw)", height: "auto", display: "block" }}
    >
      <defs>
        <radialGradient id="night-curtain-iris" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--candle-400)" stopOpacity="1" />
          <stop offset="55%" stopColor="var(--candle-500)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--night-900)" stopOpacity="1" />
        </radialGradient>
        <clipPath id="night-curtain-eye-shape">
          <path d="M 20 55 Q 120 8, 220 55 Q 120 102, 20 55 Z" />
        </clipPath>
      </defs>

      {/* 眼型外框（淡淡的月光描边） */}
      <path
        d="M 20 55 Q 120 8, 220 55 Q 120 102, 20 55 Z"
        fill="oklch(0.10 0.03 265)"
        stroke="var(--moon-100)"
        strokeOpacity="0.35"
        strokeWidth="1.4"
      />

      {/* 虹膜 + 瞳孔 + 高光（被眼型裁剪） */}
      <g clipPath="url(#night-curtain-eye-shape)">
        <circle cx="120" cy="55" r="30" fill="url(#night-curtain-iris)" />
        <circle cx="120" cy="55" r="11" fill="var(--night-900)" />
        <circle
          cx="112"
          cy="48"
          r="3.5"
          fill="var(--moon-100)"
          opacity="0.85"
        />
        <circle
          cx="128"
          cy="60"
          r="1.6"
          fill="var(--moon-100)"
          opacity="0.5"
        />
      </g>

      {/* 上睫毛（极简三笔） */}
      <path
        d="M 56 34 L 52 24"
        stroke="var(--moon-100)"
        strokeOpacity="0.45"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <path
        d="M 120 22 L 120 11"
        stroke="var(--moon-100)"
        strokeOpacity="0.45"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <path
        d="M 184 34 L 188 24"
        stroke="var(--moon-100)"
        strokeOpacity="0.45"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
