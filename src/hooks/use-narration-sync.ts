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

/**
 * 所有客户端（Host 与非 Host）都挂载：监听 publicState 的 phase/step 变化，
 * 本地播报语音。每个设备独立运行 `speechSynthesis`，让所有玩家同步听到
 *   - "天黑请闭眼 → {角色}请睁眼"（进入夜晚）
 *   - "{上一角色}请闭眼 → {下一角色}请睁眼"（夜晚步骤切换）
 *   - "天亮了"（进入白天）
 *
 * Host 端 orchestrator 改用固定延迟（NARRATE_DURATION_MS）在 publicState 切换
 * 步骤后等 narrate 播完再开倒计时，保证全设备节奏一致。
 */
export function useNarrationSync(): void {
  const lastKey = useRef<string | null>(null)

  useEffect(() => {
    const narrate = getNarrationService()

    const unsub = useGameStore.subscribe((state, prev) => {
      const ps = state.publicState
      const prevPs = prev.publicState
      if (!ps) return

      const key = `${ps.gamePhase}:${ps.currentNightStep ?? "-"}`
      const prevKey = lastKey.current
      if (prevKey === key) return
      lastKey.current = key

      // 首次挂载（刷新/重连）时不播，避免把历史阶段再念一次
      if (prevKey === null || !prevPs) return

      const steps = buildNightSteps(ps.settings.roles)
      const texts: string[] = []

      if (prevPs.gamePhase !== "night" && ps.gamePhase === "night") {
        // dealing → night
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
        // night → day
        texts.push(DAY_START_TEXT)
      }

      if (texts.length === 0) return
      void (async () => {
        for (const text of texts) {
          await narrate.speak(text)
        }
      })()
    })
    return unsub
  }, [])
}
