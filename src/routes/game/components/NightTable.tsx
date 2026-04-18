import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Moon } from "lucide-react"
import { Card } from "@/components/game/Card"
import { CardSwap, type SwapCardData } from "@/components/game/CardSwap"
import { PlayerTable } from "@/components/game/PlayerTable"
import { computeSeatPositions } from "@/components/game/seat-positions"
import { ROLE_META } from "@/types"
import type { Role } from "@/types"
import { useGameStore, selectPlayers, selectHostId } from "@/stores/gameStore"
import { useLocalPlayer } from "@/hooks/use-local-player"
import { useWindowSize } from "@/hooks/use-window-size"
import {
  onNightEvent,
  type NightSwapEvent,
} from "@/stores/nightAnimationBus"
import { cn } from "@/lib/utils"

const MOBILE_BREAKPOINT = 640
const SWAP_DURATION_S = 1.2
const EMPTY_IDS: string[] = []

/** 根据玩家数和设备动态计算圆桌直径：人越多越大，移动端更紧凑 */
function pickDiameter(playerCount: number, isMobile: boolean): number {
  if (isMobile) return playerCount <= 5 ? 280 : 320
  return playerCount <= 5 ? 380 : 460
}

interface NightTableProps {
  /** 当前步骤对应的角色（用于闭眼态显示） */
  currentStepRole: Role | null
  /** 自己是不是本步骤的 actor */
  isActorThisStep: boolean
}

/**
 * 夜晚沉浸式圆桌：
 *   - 所有玩家围坐，座位下方挂背面卡牌（移动端省略）
 *   - 中央 3 张桌面牌
 *   - 闭眼态：全屏遮罩 + 自己座位漂浮（仅自己亮起）
 *   - 睁眼态：全员亮起，动画通过 nightAnimationBus 触发 CardSwap
 */
export function NightTable({
  currentStepRole,
  isActorThisStep,
}: NightTableProps) {
  const { playerId } = useLocalPlayer()
  const { width } = useWindowSize()
  const isMobile = width > 0 && width < MOBILE_BREAKPOINT

  const players = useGameStore(selectPlayers)
  const hostId = useGameStore(selectHostId)
  const submittedIds = useGameStore(
    (s) => s.publicState?.submittedPlayerIds ?? EMPTY_IDS,
  )
  const diameter = pickDiameter(players.length, isMobile)

  const tablePlayers = useMemo(
    () =>
      players.map((p) => {
        const isMe = p.playerId === playerId
        return {
          playerId: p.playerId,
          name: p.name,
          isHost: p.playerId === hostId,
          isYou: isMe,
          isConnected: p.isConnected,
          // 闭眼态下所有非 actor 的座位都 sleeping；actor 自己不 sleeping
          sleeping: !isActorThisStep && !isMe,
          // 自己在闭眼时漂浮
          floating: !isActorThisStep && isMe,
          // 已提交指示
          isActive: isMe && submittedIds.includes(p.playerId),
        }
      }),
    [players, playerId, hostId, isActorThisStep, submittedIds],
  )

  const raisedIds = useMemo(() => [playerId], [playerId])

  // 座位坐标（供 CardSwap 使用）
  const seatPositions = useMemo(() => {
    const n = players.length
    const radius = diameter / 2 - 32
    const positions = computeSeatPositions(n, radius)
    const map = new Map<string, { x: number; y: number }>()
    players.forEach((p, i) => {
      map.set(p.playerId, positions[i])
    })
    // 桌面牌位置：中心三张小幅水平错开
    map.set("center_0", { x: -44, y: 0 })
    map.set("center_1", { x: 0, y: 0 })
    map.set("center_2", { x: 44, y: 0 })
    return map
  }, [players, diameter])

  return (
    <div className="relative flex justify-center">
      <div
        className="relative"
        style={{ width: diameter, height: diameter }}
      >
        <PlayerTable
          players={tablePlayers}
          diameter={diameter}
          seatSize={isMobile ? "sm" : "md"}
          raisedIds={raisedIds}
          center={isActorThisStep ? <CenterCards /> : null}
        />

        {/* 动画叠层（绝对定位，穿透 PlayerTable 之上） */}
        <SwapAnimationLayer
          width={diameter}
          height={diameter}
          positions={seatPositions}
        />

        {/* 闭眼遮罩（非 actor 可见；透过 raisedIds 的 z-index 保留自己亮起） */}
        <AnimatePresence>
          {!isActorThisStep && (
            <motion.div
              key="night-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="pointer-events-none absolute rounded-full"
              style={{
                // 向外扩 60px：覆盖超出圆桌 diameter 的座位（头像+名字会溢出边界）
                inset: "-60px",
                zIndex: 20,
                background:
                  "radial-gradient(circle at center, oklch(0.05 0.02 265 / 0.9) 0%, oklch(0.02 0 0 / 0.99) 70%, oklch(0.02 0 0 / 1) 100%)",
              }}
              aria-hidden
            />
          )}
        </AnimatePresence>

        {/* 闭眼态顶部的"X 请睁眼"小提示 */}
        <AnimatePresence>
          {!isActorThisStep && currentStepRole && (
            <motion.div
              key="role-hint"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center"
              style={{ zIndex: 25 }}
            >
              <Moon
                className="mx-auto h-9 w-9 text-candle-500/70 candle-flicker"
                strokeWidth={0.8}
              />
              <p className="mt-2 font-display text-base text-moon-100/70">
                {ROLE_META[currentStepRole].displayName}行动中
              </p>
              <p className="mt-1 text-[0.65rem] uppercase tracking-[0.35em] text-moon-100/40">
                请闭上眼睛
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ============================================================
// 中央 3 张桌面牌
// ============================================================

function CenterCards() {
  return (
    <div className="flex items-center gap-2">
      <Card size="sm" />
      <Card size="sm" />
      <Card size="sm" />
    </div>
  )
}

// ============================================================
// CardSwap 动画层：监听 nightAnimationBus 触发
// ============================================================

interface ActiveSwap {
  id: number
  event: NightSwapEvent
}

function SwapAnimationLayer({
  width,
  height,
  positions,
}: {
  width: number
  height: number
  positions: Map<string, { x: number; y: number }>
}) {
  const [active, setActive] = useState<ActiveSwap | null>(null)

  useEffect(() => {
    let counter = 0
    return onNightEvent("swap", (event) => {
      counter += 1
      setActive({ id: counter, event })
    })
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = setTimeout(
      () => setActive(null),
      SWAP_DURATION_S * 1000 + 200,
    )
    return () => clearTimeout(timer)
  }, [active])

  if (!active) return null
  const from = positions.get(active.event.fromId)
  const to = positions.get(active.event.toId)
  if (!from || !to) return null

  const cards: [SwapCardData, SwapCardData] = [
    {
      id: "a",
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
    },
    {
      id: "b",
      from: { x: to.x, y: to.y },
      to: { x: from.x, y: from.y },
    },
  ]

  return (
    <div
      className={cn("pointer-events-none absolute top-0 left-0")}
      style={{ width, height, zIndex: 35 }}
    >
      <CardSwap
        cards={cards}
        width={width}
        height={height}
        duration={SWAP_DURATION_S}
        size="sm"
      />
    </div>
  )
}
