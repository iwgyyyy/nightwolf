import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Card } from "@/components/game/Card"
import { PlayerAvatar } from "@/components/game/PlayerAvatar"
import { useGameStore } from "@/stores/gameStore"
import type { NightActionResult, Role } from "@/types"

const FLIP_DELAY_MS = 800 // 从入场到翻面
const AUTO_DISMISS_MS = 3500 // 总显示时长

interface RevealItem {
  id: string
  role: Role
  isSelf?: boolean
}

/**
 * 查看牌的全屏中央动画：
 *   - actor 收到 result (swapResult / rolesRevealed) 触发
 *   - 卡片从小到大入场 → 延迟翻面 → 持续 ~3.5s 自动关闭
 *   - 点击背景可提前关闭
 *   - 每次 result 变化通过 key 触发重新 mount，计时干净利落
 */
export function RevealOverlay() {
  const result = useGameStore((s) => s.privateState?.nightActionResult ?? null)
  if (!result || result.kind === "noResult") return null
  // 爪牙在场但本局狼人都在桌面 → roles 为空对象，不显示弹窗
  if (result.kind === "rolesRevealed" && Object.keys(result.roles).length === 0) {
    return null
  }
  // 用结果内容作为 key，切换 result 时重新 mount 保证初始态干净
  return <RevealBody key={buildKey(result)} result={result} />
}

function buildKey(r: NightActionResult): string {
  if (r.kind === "swapResult") return `swap:${r.newRole}`
  if (r.kind === "rolesRevealed") {
    return (
      "rev:" +
      Object.entries(r.roles)
        .map(([k, v]) => `${k}=${v}`)
        .join("|")
    )
  }
  return "none"
}

function RevealBody({ result }: { result: NightActionResult }) {
  const [visible, setVisible] = useState(true)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const flipTimer = setTimeout(() => setRevealed(true), FLIP_DELAY_MS)
    const hideTimer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS)
    return () => {
      clearTimeout(flipTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  const items = useMemo<RevealItem[]>(() => {
    if (result.kind === "swapResult") {
      return [{ id: "self", role: result.newRole, isSelf: true }]
    }
    if (result.kind === "rolesRevealed") {
      return Object.entries(result.roles).map(([id, role]) => ({ id, role }))
    }
    return []
  }, [result])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="reveal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          onClick={() => setVisible(false)}
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center px-6"
          style={{
            background:
              "radial-gradient(circle, oklch(0.05 0.02 265 / 0.88) 0%, oklch(0.02 0 0 / 0.97) 80%)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-10">
            {items.map((item, i) => (
              <RevealCardSlot
                key={`${item.id}-${i}`}
                item={item}
                revealed={revealed}
                index={i}
              />
            ))}
          </div>
          <p className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-xs tracking-[0.4em] text-moon-100/40 uppercase">
            点击任意处关闭
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function RevealCardSlot({
  item,
  revealed,
  index,
}: {
  item: RevealItem
  revealed: boolean
  index: number
}) {
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0, y: 48 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.15,
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex flex-col items-center gap-3"
    >
      <Card role={item.role} revealed={revealed} size="lg" />
      <TargetLabel id={item.id} isSelf={item.isSelf} />
    </motion.div>
  )
}

function TargetLabel({ id, isSelf }: { id: string; isSelf?: boolean }) {
  const player = useGameStore((s) =>
    s.publicState?.players.find((p) => p.playerId === id),
  )
  if (isSelf) {
    return (
      <span className="font-display text-sm tracking-wider text-candle-500">
        你的新身份
      </span>
    )
  }
  if (player) {
    return (
      <div className="flex items-center gap-2 text-moon-100/85">
        <PlayerAvatar name={player.name} size={24} />
        <span className="font-display text-sm">{player.name}</span>
      </div>
    )
  }
  if (id.startsWith("center_")) {
    const idx = Number(id.slice("center_".length))
    return (
      <span className="font-display text-sm text-moon-100/75">
        桌面 {idx + 1}
      </span>
    )
  }
  return null
}
