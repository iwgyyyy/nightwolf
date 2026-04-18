import { useCountdown } from "@/hooks/use-countdown"
import { cn } from "@/lib/utils"

interface CountdownRingProps {
  /** ISO 结束时间 */
  endsAt: string | null
  /** 总时长（秒），用于计算进度百分比 */
  totalSeconds: number
  size?: number
  strokeWidth?: number
  /** 是否显示中心的剩余秒数文字 */
  showText?: boolean
  onEnd?: () => void
  className?: string
}

/**
 * SVG 环形倒计时。
 * - 进度条按剩余 / 总时长
 * - 最后 5 秒变红脉冲
 */
export function CountdownRing({
  endsAt,
  totalSeconds,
  size = 96,
  strokeWidth = 6,
  showText = true,
  onEnd,
  className,
}: CountdownRingProps) {
  const { remainingMs, remainingSeconds, ended } = useCountdown({
    endsAt,
    onEnd,
  })

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const totalMs = Math.max(1, totalSeconds * 1000)
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs))
  const dashOffset = circumference * (1 - ratio)

  const urgent = remainingSeconds <= 5 && !ended
  const strokeColor = urgent
    ? "oklch(0.58 0.17 25)" // blood-500
    : "oklch(0.78 0.13 75)" // candle-500

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center",
        urgent && "breathing-pulse",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={`${remainingSeconds} 秒`}
      >
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth={strokeWidth}
        />
        {/* 进度环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 0.25s linear, stroke 0.3s ease",
          }}
        />
      </svg>
      {showText && (
        <span
          className={cn(
            "absolute font-display tabular-nums",
            urgent ? "text-blood-500" : "text-candle-500",
          )}
          style={{ fontSize: size / 3.2 }}
        >
          {remainingSeconds}
        </span>
      )}
    </div>
  )
}
