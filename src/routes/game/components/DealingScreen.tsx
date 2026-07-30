import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Check, Hourglass } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/game/Card"
import { CountdownRing } from "@/components/game/CountdownRing"
import { RoleBadge } from "@/components/game/RoleBadge"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { Button } from "@/components/ui/button"
import { getSyncService } from "@/sync"
import { getNarrationService } from "@/services/NarrationService"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { ROLE_DESCRIPTION } from "@/components/game/role-display"
import { DEALING_TIMEOUT_MS } from "@/engine/orchestrator"
import { cn } from "@/lib/utils"

const DEALING_TIMEOUT_SEC = Math.floor(DEALING_TIMEOUT_MS / 1000)

/**
 * 发牌阶段。
 * - 展示本玩家初始身份牌（Card 翻转正面）
 * - 下方角色描述
 * - 倒计时 60s
 * - "我已记住" 按钮 → submitAction(confirmIdentity)
 * - 已确认后显示其他玩家提交进度
 */
export default function DealingScreen() {
  const { playerId } = useLocalPlayer()
  const publicState = useGameStore((s) => s.publicState)
  const privateState = useGameStore((s) => s.privateState)
  const roomId = publicState?.roomId
  const [submitting, setSubmitting] = useState(false)
  // 卡片先从屏幕顶部飞入（背面），落位后翻面
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 1100)
    return () => clearTimeout(timer)
  }, [])

  const submitted =
    !!playerId && !!publicState?.submittedPlayerIds.includes(playerId)

  if (!publicState || !privateState || !roomId) {
    return (
      <main
        className="flex items-center justify-center p-6"
        style={{ minHeight: "100dvh" }}
      >
        <p className="text-moon-100/60">正在发牌…</p>
      </main>
    )
  }

  const myRole = privateState.originalRole
  // 自己放第一位，所有玩家统一展示（包括自己）——确认后自己这格也会变绿
  const allPlayersOrdered = [
    ...publicState.players.filter((p) => p.playerId === playerId),
    ...publicState.players.filter((p) => p.playerId !== playerId),
  ]

  const handleConfirm = async () => {
    if (submitted || submitting) return
    // 再次 prime TTS —— 这个点击是夜晚语音前最后一次用户手势
    getNarrationService().prime()
    setSubmitting(true)
    try {
      await getSyncService().submitAction(roomId, {
        kind: "confirmIdentity",
      })
    } catch {
      toast.error("提交失败，请重试")
      setSubmitting(false)
    }
  }

  return (
    <main
      className="relative flex flex-col items-center overflow-hidden px-6 pb-8"
      style={{
        minHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top) + 2rem)",
      }}
    >
      {/* 顶部标题 */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <p className="font-sans text-xs uppercase tracking-[0.4em] text-candle-500/70">
          Dealing · 发牌阶段
        </p>
        <h1 className="mt-2 font-display text-3xl text-moon-100 md:text-4xl">
          你的身份
        </h1>
      </motion.header>

      {/* 大卡片 — 从屏幕顶部倾斜飞入，落位后翻面 */}
      <motion.div
        initial={{ opacity: 0, y: -240, rotate: -18, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
        transition={{
          delay: 0.25,
          duration: 0.95,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="mt-8"
      >
        <Card role={myRole} revealed={revealed} size="lg" />
      </motion.div>

      {/* 角色简介 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.7 }}
        className="mt-6 w-full max-w-md text-center"
      >
        <RoleBadge role={myRole} size="md" variant="solid" />
        <p className="mt-3 text-sm leading-relaxed text-moon-100/70">
          {ROLE_DESCRIPTION[myRole]}
        </p>
      </motion.div>

      {/* 倒计时 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8"
      >
        <CountdownRing
          endsAt={publicState.phaseEndsAt}
          totalSeconds={DEALING_TIMEOUT_SEC}
          size={84}
        />
      </motion.div>

      {/* 确认按钮 / 已确认状态 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0 }}
        className="mt-6 w-full max-w-xs"
      >
        {submitted ? (
          <div className="flex items-center justify-center gap-2 rounded-full border border-sage-500/30 bg-sage-500/10 px-5 py-3 text-sage-500">
            <Check className="h-4 w-4" />
            <span className="font-display text-sm tracking-wide">
              已确认身份
            </span>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={submitting}
            className="candle-glow h-12 w-full font-display text-base tracking-wider"
          >
            {submitting ? "提交中…" : "我已记住"}
          </Button>
        )}
      </motion.div>

      {/* 其他玩家进度 */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6 }}
        className="night-panel mt-8 w-full max-w-md p-4"
      >
        <h2 className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-moon-100/40">
          <Hourglass className="h-3.5 w-3.5" />
          所有玩家
        </h2>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {allPlayersOrdered.map((p) => {
            const confirmed = publicState.submittedPlayerIds.includes(p.playerId)
            const isYou = p.playerId === playerId
            return (
              <li
                key={p.playerId}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition",
                  confirmed
                    ? "border-sage-500/40 bg-sage-500/15"
                    : "border-transparent bg-night-700/40",
                  isYou && !confirmed && "border-candle-500/30",
                )}
              >
                <PlayerAvatar name={p.name} size={24} />
                <span className="flex-1 truncate text-xs">
                  {p.name}
                  {isYou && (
                    <span className="ml-1 rounded bg-moon-100/10 px-1 text-[9px] tracking-wider text-moon-100/50">
                      你
                    </span>
                  )}
                </span>
                {confirmed ? (
                  <Check className="h-3.5 w-3.5 text-sage-500" />
                ) : (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-moon-100/30" />
                )}
              </li>
            )
          })}
        </ul>
      </motion.section>
    </main>
  )
}
