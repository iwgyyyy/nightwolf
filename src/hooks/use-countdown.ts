import { useEffect, useState } from "react"

interface UseCountdownOptions {
  /** ISO 8601 结束时间，或 timestamp */
  endsAt: string | number | null
  /** 倒计时到 0 时的回调（只调一次） */
  onEnd?: () => void
  /** 轮询间隔，默认 250ms */
  tickMs?: number
}

export interface CountdownState {
  /** 剩余毫秒（不小于 0） */
  remainingMs: number
  /** 剩余秒（向上取整） */
  remainingSeconds: number
  /** 是否已结束 */
  ended: boolean
}

/**
 * 基于结束时间的倒计时 hook。
 * 用结束时间而非递减秒数，避免暂停/重连时累积漂移。
 */
export function useCountdown({
  endsAt,
  onEnd,
  tickMs = 250,
}: UseCountdownOptions): CountdownState {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (endsAt == null) return
    const end = typeof endsAt === "string" ? new Date(endsAt).getTime() : endsAt
    if (end <= Date.now()) {
      onEnd?.()
      return
    }

    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= end) {
        clearInterval(id)
        onEnd?.()
      }
    }, tickMs)

    return () => clearInterval(id)
  }, [endsAt, onEnd, tickMs])

  if (endsAt == null) {
    return { remainingMs: 0, remainingSeconds: 0, ended: true }
  }

  const end = typeof endsAt === "string" ? new Date(endsAt).getTime() : endsAt
  const remainingMs = Math.max(0, end - now)
  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    ended: remainingMs <= 0,
  }
}
