import { useEffect, useRef } from "react"
import { useGameStore } from "@/stores/gameStore"
import { buildNightSteps } from "@/engine/nightOrder"
import {
  NIGHT_START_TEXT,
  DAY_START_TEXT,
  openEyesTextFor,
  closeEyesTextFor,
} from "@/engine/narrationText"
import {
  getNarrationService,
  type NarrationCue,
} from "@/services/NarrationService"
import type { PublicRoomState } from "@/types"

/**
 * 所有客户端都挂载：按 publicState 的阶段变化本地播报语音。
 * 播报与服务端倒计时并行，纯本地效果，不影响游戏节奏。
 *
 * 播报内容完全由公开状态推导（角色配置本来就是大厅里公开选的），
 * 所以服务端不需要下发文案，只需要下发一个 narrationCueId 用于对齐。
 */
export function useNarrationSync(): void {
  const lastCueId = useRef<string | null>(null)
  // 断线/换房后内存里还留着旧 publicState，重连后第一份新状态和它做 diff
  // 可能横跨多个阶段（比如 dealing → night），会把入夜等播报误念一遍。
  // 标记后让下一份状态只做基线，不播报。
  const needsBaseline = useRef(false)

  useEffect(() => {
    const narrate = getNarrationService()

    const unsub = useGameStore.subscribe((state, prev) => {
      if (
        (prev.connectionStatus === "connected" &&
          state.connectionStatus !== "connected") ||
        state.currentRoomId !== prev.currentRoomId
      ) {
        needsBaseline.current = true
      }

      const ps = state.publicState
      // 只响应新到达的公共状态（connectionStatus 等其他字段变化时引用不变）
      if (!ps || ps === prev.publicState) return

      if (needsBaseline.current) {
        needsBaseline.current = false
        lastCueId.current = ps.narrationCueId
        return
      }

      const cueId = ps.narrationCueId
      if (!cueId || cueId === lastCueId.current) return
      lastCueId.current = cueId

      const cues = buildNarrationCues(prev.publicState, ps)

      void (async () => {
        for (const cue of cues) {
          await narrate.speak(cue)
        }
      })()
    })
    return unsub
  }, [])
}

/**
 * 推导本次需要念的播报（key 对应录音文件，text 供 TTS 兜底）。
 * 刷新后首次收到状态时（prev 为空）返回空数组，避免把历史阶段重念一遍。
 */
function buildNarrationCues(
  prevPs: PublicRoomState | null,
  ps: PublicRoomState,
): NarrationCue[] {
  if (!prevPs) return []

  const steps = buildNightSteps(ps.settings.roles)
  const cues: NarrationCue[] = []

  if (prevPs.gamePhase !== "night" && ps.gamePhase === "night") {
    // 进入夜晚
    cues.push({ key: "night-start", text: NIGHT_START_TEXT })
    const first = steps[ps.currentNightStep ?? 0]
    if (first) cues.push({ key: `${first}-open`, text: openEyesTextFor(first) })
  } else if (
    prevPs.gamePhase === "night" &&
    ps.gamePhase === "night" &&
    prevPs.currentNightStep !== ps.currentNightStep
  ) {
    // 夜晚步骤切换
    const prevRole = steps[prevPs.currentNightStep ?? 0]
    const nextRole = steps[ps.currentNightStep ?? 0]
    if (prevRole)
      cues.push({ key: `${prevRole}-close`, text: closeEyesTextFor(prevRole) })
    if (nextRole)
      cues.push({ key: `${nextRole}-open`, text: openEyesTextFor(nextRole) })
  } else if (prevPs.gamePhase === "night" && ps.gamePhase === "day") {
    cues.push({ key: "day-start", text: DAY_START_TEXT })
  }

  return cues
}
