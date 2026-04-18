import { useEffect } from "react"

/**
 * 申请 Screen Wake Lock，防止游戏过程中手机息屏（打断 Host 的语音和计时）。
 *
 * - 不支持 Wake Lock API 的浏览器（如微信内置）静默失败，不报错
 * - tab 被切到后台会自动释放 lock；visibilitychange 回到前台时重新申请
 * - effect cleanup 时释放
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return
    const wakeLock = navigator.wakeLock
    if (!wakeLock) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled) return
      try {
        sentinel = await wakeLock.request("screen")
        sentinel.addEventListener("release", () => {
          sentinel = null
        })
      } catch {
        sentinel = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinel) {
        void acquire()
      }
    }

    void acquire()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [enabled])
}
