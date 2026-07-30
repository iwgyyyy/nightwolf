import { useEffect, useRef } from "react"
import { useGameStore } from "@/stores/gameStore"
import { buildNightSteps } from "@/engine/nightOrder"
import {
  NIGHT_START_TEXT,
  DAY_START_TEXT,
  openEyesTextFor,
  closeEyesTextFor,
} from "@/engine/narrationText"
import { getNarrationService } from "@/services/NarrationService"
import { getSyncService } from "@/sync"
import type { PublicRoomState } from "@/types"

/**
 * 所有客户端都挂载：按 publicState 的阶段变化本地播报语音，播完回 ack。
 *
 * 播报内容完全由公开状态推导（角色配置本来就是大厅里公开选的），
 * 所以服务端不需要下发文案，只需要下发一个 narrationCueId 用于对齐。
 *
 * 重要：**无论这一轮是否真的需要出声，都必须 ack**。服务端在等齐所有在线
 * 玩家的回执后才会开始倒计时，漏 ack 会让整局卡到 8 秒超时才继续。
 */
export function useNarrationSync(): void {
  const lastCueId = useRef<string | null>(null)

  useEffect(() => {
    const narrate = getNarrationService()

    const unsub = useGameStore.subscribe((state, prev) => {
      const ps = state.publicState
      if (!ps) return

      const cueId = ps.narrationCueId
      if (!cueId || cueId === lastCueId.current) return
      lastCueId.current = cueId

      const texts = buildNarrationTexts(prev.publicState, ps)

      void (async () => {
        try {
          for (const text of texts) {
            await narrate.speak(text)
          }
        } finally {
          // 播报失败（比如浏览器拦截自动播放）也要放行，不能把房间卡住
          getSyncService().ackNarration(ps.roomId, cueId)
        }
      })()
    })
    return unsub
  }, [])
}

/**
 * 推导本次需要念的文案。刷新 / 重连后首次收到状态时返回空数组
 * （避免把历史阶段重念一遍），此时上层会立即 ack。
 */
function buildNarrationTexts(
  prevPs: PublicRoomState | null,
  ps: PublicRoomState,
): string[] {
  if (!prevPs) return []

  const steps = buildNightSteps(ps.settings.roles)
  const texts: string[] = []

  if (prevPs.gamePhase !== "night" && ps.gamePhase === "night") {
    // 进入夜晚
    texts.push(NIGHT_START_TEXT)
    const first = steps[ps.currentNightStep ?? 0]
    if (first) texts.push(openEyesTextFor(first))
  } else if (
    prevPs.gamePhase === "night" &&
    ps.gamePhase === "night" &&
    prevPs.currentNightStep !== ps.currentNightStep
  ) {
    // 夜晚步骤切换
    const prevRole = steps[prevPs.currentNightStep ?? 0]
    const nextRole = steps[ps.currentNightStep ?? 0]
    if (prevRole) texts.push(closeEyesTextFor(prevRole))
    if (nextRole) texts.push(openEyesTextFor(nextRole))
  } else if (prevPs.gamePhase === "night" && ps.gamePhase === "day") {
    texts.push(DAY_START_TEXT)
  }

  return texts
}
