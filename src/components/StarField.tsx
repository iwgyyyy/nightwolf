import { useMemo } from "react"
import { cn } from "@/lib/utils"

interface Star {
  x: number
  y: number
  size: number
  delay: number
  duration: number
}

interface StarFieldProps {
  count?: number
  className?: string
  /** 随机种子，保证同次渲染位置稳定 */
  seed?: number
}

/**
 * 伪随机（依赖 seed），浏览器端渲染稳定。
 */
function makeStars(count: number, seed: number): Star[] {
  // Mulberry32 伪随机
  let s = seed >>> 0
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return Array.from({ length: count }, () => ({
    x: random() * 100,
    y: random() * 100,
    size: 1 + random() * 2,
    delay: random() * 5,
    duration: 2 + random() * 4,
  }))
}

export function StarField({ count = 40, className, seed = 1337 }: StarFieldProps) {
  const stars = useMemo(() => makeStars(count, seed), [count, seed])

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0", className)}
    >
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-moon-100"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: 0.4,
            animation: `twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            boxShadow: "0 0 4px oklch(0.97 0.01 260 / 0.6)",
          }}
        />
      ))}
    </div>
  )
}
