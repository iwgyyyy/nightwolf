import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { identiconDataUrl } from "@/services/identicon"

interface PlayerAvatarProps {
  name: string
  size?: number
  className?: string
  /** 是否在头像周围加一圈光晕描边（用于突出 host/活跃态） */
  ring?: "none" | "candle" | "sage" | "blood"
}

const RING_CLASS = {
  none: "",
  candle: "ring-2 ring-candle-500 ring-offset-2 ring-offset-night-800",
  sage: "ring-2 ring-sage-500 ring-offset-2 ring-offset-night-800",
  blood: "ring-2 ring-blood-500 ring-offset-2 ring-offset-night-800",
} as const

/**
 * 根据玩家名称自动生成的像素头像。
 */
export function PlayerAvatar({
  name,
  size = 40,
  className,
  ring = "none",
}: PlayerAvatarProps) {
  const src = useMemo(
    () => identiconDataUrl(name || "anon", size * 2),
    [name, size],
  )
  return (
    <img
      src={src}
      alt={name ? `${name} 的头像` : "头像"}
      width={size}
      height={size}
      draggable={false}
      className={cn("rounded-full select-none", RING_CLASS[ring], className)}
      style={{ width: size, height: size }}
    />
  )
}
