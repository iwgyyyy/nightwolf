import { useEffect } from "react"
import { getVoiceService } from "@/services/VoiceService"
import { useGameStore } from "@/stores/gameStore"
import { useLocalPlayerStore } from "./use-local-player"

/**
 * 房间语音生命周期：大厅与游戏页都挂载。
 * join 幂等，大厅↔游戏路由切换不断开；真正离开房间
 * （currentRoomId 变化/清空）后才拆连接。
 */
export function useVoiceChat(roomId: string | undefined): void {
  const playerId = useLocalPlayerStore((s) => s.playerId)

  useEffect(() => {
    if (!roomId || !playerId) return
    getVoiceService().join(roomId, playerId)
    return () => {
      // 延迟一拍：路由切换会先卸载旧页再挂载新页，等新页 effect 落定后
      // 仍不在本房间才真正离开
      setTimeout(() => {
        if (useGameStore.getState().currentRoomId !== roomId) {
          getVoiceService().leave()
        }
      }, 50)
    }
  }, [roomId, playerId])
}
