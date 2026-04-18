/**
 * 语音播报服务：仅 Host 设备在夜晚阶段切换时使用。
 *
 * 设计：
 *   - 纯接口，便于测试用 MockNarrationService 替换
 *   - 单例 getter `getNarrationService()`（整个 app 共用一个 instance）
 *   - `prime()` 在首次用户手势时预热，解锁 iOS Safari 的自动播放限制
 *   - `speak(text)` 返回 Promise，在 onend/onerror 或 10s 兜底超时后 resolve
 *   - 不可用时（不支持 API）所有调用都是 no-op 且立即 resolve，不阻塞游戏
 */

const SPEAK_TIMEOUT_MS = 10_000
const WAIT_IDLE_TIMEOUT_MS = 10_000
const WAIT_IDLE_POLL_MS = 100
/** 调用 waitIdle 后先等这一小段时间，让 hook 的 subscribe 回调把 utterance 入队 */
const WAIT_IDLE_PRIMING_DELAY_MS = 200

export interface NarrationService {
  /** 首次用户手势时调用，解锁自动播放 */
  prime(): void
  /** 播报一段文字，resolve 于语音结束或兜底超时 */
  speak(text: string): Promise<void>
  /**
   * 等待当前设备的语音播放队列清空。
   * 用于 Host orchestrator：切换 step 后等本设备的 hook 播完再开倒计时。
   */
  waitIdle(timeoutMs?: number): Promise<void>
  /** 打断当前正在播放的语音 */
  stop(): void
  /** 当前运行环境是否支持 Web Speech */
  isAvailable(): boolean
}

export class WebSpeechNarrationService implements NarrationService {
  isAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window
    )
  }

  /**
   * iOS Safari 要求"解锁"时的 utterance 必须**非空**且在**用户手势内同步调用**。
   * 为了兼容性，这里用一个极短但非空的 utterance，且可被多次调用（每次用户操作都尝试续期解锁）。
   */
  prime(): void {
    if (!this.isAvailable()) return
    try {
      // 先 cancel 队列，避免上次未清的残留让新的 utterance 被忽略
      window.speechSynthesis.cancel()
      // iOS 对空字符串 utterance 有时不触发 onstart；用一个半角字符确保事件流
      const u = new SpeechSynthesisUtterance(" ")
      u.volume = 0
      u.rate = 1.0
      u.lang = "zh-CN"
      window.speechSynthesis.speak(u)
    } catch {
      // 失败无所谓，下次用户手势会再试
    }
  }

  speak(text: string): Promise<void> {
    if (!this.isAvailable() || !text) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = "zh-CN"
      u.rate = 1.0
      u.volume = 1.0

      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve()
      }
      u.onend = finish
      u.onerror = finish
      // 后台 tab / 浏览器静音时兜底，避免阶段卡死
      const timer = setTimeout(finish, SPEAK_TIMEOUT_MS)

      try {
        // iOS Safari 有时队列处于 paused 状态（切后台回来 / 长时间空闲后），需要 resume
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume()
        }
        window.speechSynthesis.speak(u)
      } catch {
        finish()
      }
    })
  }

  stop(): void {
    if (!this.isAvailable()) return
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
  }

  waitIdle(timeoutMs = WAIT_IDLE_TIMEOUT_MS): Promise<void> {
    if (!this.isAvailable()) return Promise.resolve()
    const start = Date.now()
    return new Promise<void>((resolve) => {
      const check = () => {
        const synth = window.speechSynthesis
        // 某些 iOS 版本 paused 卡住需要 resume 才能继续播完
        if (synth.paused) {
          try {
            synth.resume()
          } catch {
            // ignore
          }
        }
        const busy = synth.speaking || synth.pending
        if (!busy || Date.now() - start > timeoutMs) {
          resolve()
          return
        }
        setTimeout(check, WAIT_IDLE_POLL_MS)
      }
      // 先等 ~200ms 让 React subscribe 和 speak 入队完成，避免空跑
      setTimeout(check, WAIT_IDLE_PRIMING_DELAY_MS)
    })
  }
}

export class MockNarrationService implements NarrationService {
  readonly spokenTexts: string[] = []
  primed = false

  isAvailable(): boolean {
    return true
  }
  prime(): void {
    this.primed = true
  }
  speak(text: string): Promise<void> {
    this.spokenTexts.push(text)
    return Promise.resolve()
  }
  waitIdle(): Promise<void> {
    return Promise.resolve()
  }
  stop(): void {
    // no-op
  }
}

let instance: NarrationService | null = null

export function getNarrationService(): NarrationService {
  if (!instance) instance = new WebSpeechNarrationService()
  return instance
}

/** 测试或开发时替换单例 */
export function setNarrationService(svc: NarrationService): void {
  instance = svc
}
