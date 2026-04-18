import { motion } from "framer-motion"
import { Card } from "./Card"
import type { Role } from "@/types"

export interface SwapCardData {
  id: string
  role?: Role | null
  /** 正面朝上 */
  revealed?: boolean
  label?: string
  /** 起始坐标（相对容器中心） */
  from: { x: number; y: number }
  /** 结束坐标（相对容器中心） */
  to: { x: number; y: number }
}

interface CardSwapProps {
  /** 两张相互交换的牌 */
  cards: [SwapCardData, SwapCardData]
  /** 容器宽高，卡牌以中心为原点定位 */
  width: number
  height: number
  /** 动画总时长（秒），默认 1.2s */
  duration?: number
  /** 交换完成回调 */
  onComplete?: () => void
  /** 卡牌尺寸 */
  size?: "sm" | "md" | "lg"
  className?: string
}

/**
 * 两张卡沿贝塞尔曲线交换位置的动画。
 *
 * 视觉：
 *   - 两张卡各自沿弧线（一条向上弯，一条向下弯）飞到对方位置
 *   - 中段有轻微旋转让动作更有质感
 *   - 落位时有 overshoot → settle 的弹性
 */
export function CardSwap({
  cards,
  width,
  height,
  duration = 1.2,
  onComplete,
  size = "md",
  className,
}: CardSwapProps) {
  const [a, b] = cards

  return (
    <div
      className={className}
      style={{ position: "relative", width, height }}
      aria-hidden
    >
      <FlyingCard card={a} duration={duration} arc="up" size={size} />
      <FlyingCard
        card={b}
        duration={duration}
        arc="down"
        size={size}
        onAnimationComplete={onComplete}
      />
    </div>
  )
}

function FlyingCard({
  card,
  duration,
  arc,
  size,
  onAnimationComplete,
}: {
  card: SwapCardData
  duration: number
  arc: "up" | "down"
  size: "sm" | "md" | "lg"
  onAnimationComplete?: () => void
}) {
  // 贝塞尔控制点偏移（中途凸起）：up = 向上拱，down = 向下拱
  const midY = arc === "up" ? -50 : 50
  const midX = (card.from.x + card.to.x) / 2

  return (
    <motion.div
      onAnimationComplete={onAnimationComplete}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        translateX: "-50%",
        translateY: "-50%",
      }}
      initial={{
        x: card.from.x,
        y: card.from.y,
        rotate: 0,
      }}
      animate={{
        x: [card.from.x, midX, card.to.x],
        y: [card.from.y, card.from.y + midY, card.to.y],
        rotate: [0, arc === "up" ? 8 : -8, 0],
      }}
      transition={{
        duration,
        ease: [0.22, 1, 0.36, 1],
        times: [0, 0.5, 1],
      }}
    >
      <Card
        role={card.role}
        revealed={card.revealed}
        size={size}
        label={card.label}
      />
    </motion.div>
  )
}
