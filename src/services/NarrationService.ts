/**
 * 语音播报服务：夜晚阶段切换时所有客户端本地播报。
 *
 * 设计：
 *   - 首选真人录音（public/narration/{key}.mp3，进入应用即预加载为 blob），
 *     音频缺失或播放失败时回退 Web Speech TTS 念 cue.text
 *   - 纯接口，便于测试用 MockNarrationService 替换
 *   - 单例 getter `getNarrationService()`（整个 app 共用一个 instance）
 *   - `prime()` 在首次用户手势时预热，解锁 iOS Safari / Android 的自动播放限制
 *   - `speak(cue)` 返回 Promise，在播放结束/失败或 20s 兜底超时后 resolve
 *   - 不可用时（不支持 API）所有调用都是 no-op 且立即 resolve，不阻塞游戏
 */

import { ALL_ROLES } from "@/types"
import { buildNightSteps } from "@/engine/nightOrder"

// 最长录音 11.1s（werewolf-open），TTS 兜底念完整台词也要 10s+，封顶须盖过正常播完
const SPEAK_TIMEOUT_MS = 20_000

const CLIP_BASE = "/narration/"

/** 一次播报：key 对应录音文件名（不含扩展名），text 供 TTS 兜底 */
export interface NarrationCue {
  key: string
  text: string
}

/** 全部录音 key：转场 2 段 + 每个夜晚行动角色的睁眼/闭眼 */
export const NARRATION_CLIP_KEYS: string[] = [
  "night-start",
  "day-start",
  ...buildNightSteps(ALL_ROLES).flatMap((role) => [
    `${role}-open`,
    `${role}-close`,
  ]),
]

export interface NarrationService {
  /** 首次用户手势时调用，解锁自动播放 */
  prime(): void
  /** 播报一段语音，resolve 于播放结束或兜底超时 */
  speak(cue: NarrationCue): Promise<void>
  /** 打断当前正在播放的语音 */
  stop(): void
  /** 当前运行环境是否支持播报 */
  isAvailable(): boolean
}

/** TTS 兜底实现（录音失败 / 未加载时由 AudioNarrationService 内部调用） */
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

  speak(cue: NarrationCue): Promise<void> {
    if (!this.isAvailable() || !cue.text) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(cue.text)
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
}

/**
 * 真人录音播报。全程复用**同一个** HTMLAudioElement：
 * 在用户手势里解锁过一次后，后续换 src 程序化播放不再受自动播放策略限制。
 */
export class AudioNarrationService implements NarrationService {
  private tts = new WebSpeechNarrationService()
  private el: HTMLAudioElement | null = null
  /** key → objectURL，preload 拉回的 blob；缺失的 key 播放时直接请求源文件 */
  private clips = new Map<string, string>()
  private preloadStarted = false
  private unlocked = false
  private priming = false

  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof Audio !== "undefined"
  }

  /** 进入应用即调用：把全部录音拉成 blob，夜晚播报时零网络延迟 */
  preload(): void {
    if (!this.isAvailable() || this.preloadStarted) return
    this.preloadStarted = true
    for (const key of NARRATION_CLIP_KEYS) {
      void fetch(`${CLIP_BASE}${key}.mp3`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.blob()
        })
        .then((blob) => {
          this.clips.set(key, URL.createObjectURL(blob))
        })
        .catch(() => {
          // 拉取失败不致命：播放时先试源文件，再兜底 TTS
        })
    }
  }

  prime(): void {
    // 解锁一次即可；priming 防止连续手势各自触发 play 相互中止。
    // 关键：prime 全程保持 muted，绝不在这里解除静音——speak() 播放时才
    // 设 muted=false。否则两次 prime 互相打断时，catch 里恢复静音状态的
    // 时序会把解锁用的音频真的放出声（"天黑请闭眼"凭空响起）。
    if (this.isAvailable() && !this.unlocked && !this.priming) {
      try {
        const el = this.element()
        this.priming = true
        el.muted = true
        el.src = this.srcFor("night-start")
        void el
          .play()
          .then(() => {
            el.pause()
            this.unlocked = true
            this.priming = false
          })
          .catch(() => {
            this.priming = false
          })
      } catch {
        this.priming = false
      }
    }
    // TTS 兜底路径同样需要手势解锁
    this.tts.prime()
  }

  speak(cue: NarrationCue): Promise<void> {
    if (!this.isAvailable()) return this.tts.speak(cue)

    return new Promise<void>((resolve) => {
      const el = this.element()
      let done = false
      const finish = (ok: boolean) => {
        if (done) return
        done = true
        clearTimeout(timer)
        el.onended = null
        el.onerror = null
        if (ok) resolve()
        // 音频播不了（文件缺失/解码失败/未解锁）→ TTS 念完整台词
        else void this.tts.speak(cue).then(resolve)
      }
      const timer = setTimeout(() => finish(true), SPEAK_TIMEOUT_MS)
      el.onended = () => finish(true)
      el.onerror = () => finish(false)

      try {
        el.muted = false
        el.src = this.srcFor(cue.key)
        el.currentTime = 0
        void el.play().catch(() => finish(false))
      } catch {
        finish(false)
      }
    })
  }

  stop(): void {
    try {
      this.el?.pause()
    } catch {
      // ignore
    }
    this.tts.stop()
  }

  private element(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio()
      this.el.preload = "auto"
    }
    return this.el
  }

  private srcFor(key: string): string {
    return this.clips.get(key) ?? `${CLIP_BASE}${key}.mp3`
  }
}

export class MockNarrationService implements NarrationService {
  readonly spokenCues: NarrationCue[] = []
  primed = false

  isAvailable(): boolean {
    return true
  }
  prime(): void {
    this.primed = true
  }
  speak(cue: NarrationCue): Promise<void> {
    this.spokenCues.push(cue)
    return Promise.resolve()
  }
  stop(): void {
    // no-op
  }
}

let instance: NarrationService | null = null

export function getNarrationService(): NarrationService {
  if (!instance) instance = new AudioNarrationService()
  return instance
}

/** 测试或开发时替换单例 */
export function setNarrationService(svc: NarrationService): void {
  instance = svc
}

/** 应用入口调用：预加载全部录音（非 AudioNarrationService 单例时为 no-op） */
export function preloadNarration(): void {
  const svc = getNarrationService()
  if (svc instanceof AudioNarrationService) svc.preload()
}
