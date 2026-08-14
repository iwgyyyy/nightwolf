import { useEffect } from "react"
import { useNavigate } from "react-router"
import { toast } from "sonner"
import { getSyncService, SyncError } from "@/sync"
import { useGameStore, type LobbyError } from "@/stores/gameStore"
import { useLocalPlayer } from "./use-local-player"
import { isValidRoomId } from "@/services/roomId"

interface UseGameSyncOptions {
  /** 房间 ID（未提供时不做任何事） */
  roomId: string | undefined
  /** 用户是否已填写昵称（未填写时阻塞连接） */
  enabled?: boolean
}

/**
 * 将服务端下发的状态桥接到 `gameStore`。
 *
 * 职责：
 *  - 加入房间（upsert 本玩家）
 *  - 订阅 publicState（广播）与自己的 privateState（单播）
 *  - 监听 `onRoomDeleted`，toast + 跳首页
 *  - 维护 connectionStatus、joinError
 *  - 卸载时 cleanup
 */
export function useGameSync({ roomId, enabled = true }: UseGameSyncOptions) {
  const navigate = useNavigate()
  const { playerId, name } = useLocalPlayer()
  const publicState = useGameStore((s) => s.publicState)

  const isHost = publicState?.hostId === playerId

  useEffect(() => {
    if (!enabled || !roomId) return
    if (!isValidRoomId(roomId)) {
      useGameStore.getState().setJoinError("invalid")
      return
    }

    const store = useGameStore.getState()
    store.setCurrentRoom(roomId)
    store.setConnectionStatus("connecting")
    store.setJoinError(null)

    const sync = getSyncService()

    // 订阅 publicState
    const unsubPublic = sync.onPublicStateChanged(roomId, (state) => {
      useGameStore.getState().setPublicState(state)
      useGameStore.getState().setConnectionStatus("connected")
    })

    // 订阅本玩家私有状态（服务端单播，收到的必然是自己那份）
    const unsubPrivate = sync.onPrivateStateChanged((state) => {
      useGameStore.getState().setPrivateState(state)
    })

    // 房间解散
    const unsubDelete = sync.onRoomDeleted(roomId, () => {
      toast.info("房间已被房主解散")
      useGameStore.getState().resetRoom()
      navigate("/", { replace: true })
    })

    // 连接状态 → store + toast 提示
    let firstStatus = true
    const unsubConn = sync.onConnectionChange((status) => {
      const store = useGameStore.getState()
      // 首次是 initial 推送，不 toast
      if (!firstStatus) {
        if (status === "disconnected") {
          toast.warning("连接已断开，正在尝试重连…")
        } else if (status === "connected") {
          toast.success("已重新连接")
        }
      }
      firstStatus = false

      if (status === "connected") store.setConnectionStatus("connected")
      else if (status === "disconnected") store.setConnectionStatus("disconnected")
      else store.setConnectionStatus("connecting")
    })

    // 发起加入。cancelled 防止本 effect 已被清理后（StrictMode 双挂载、
    // 路由切换）迟到的失败还去写 joinError
    let cancelled = false
    sync
      .joinRoom(roomId, { playerId, name, isConnected: true })
      .catch((err: unknown) => {
        if (cancelled) return
        const reason: LobbyError = mapJoinError(err)
        useGameStore.getState().setJoinError(reason)
        useGameStore.getState().setConnectionStatus("error")
      })

    return () => {
      cancelled = true
      unsubPublic()
      unsubPrivate()
      unsubDelete()
      unsubConn()
    }
  }, [roomId, enabled, playerId, name, navigate])

  // 组件卸载（例如离开房间路由）时清理 store
  useEffect(() => {
    return () => {
      useGameStore.getState().resetRoom()
    }
  }, [])

  return { playerId, isHost }
}

function mapJoinError(err: unknown): LobbyError {
  if (err instanceof SyncError) {
    if (err.code === "ROOM_NOT_FOUND") return "not-found"
    if (err.code === "GAME_IN_PROGRESS") return "in-progress"
    if (err.code === "ROOM_FULL") return "full"
  }
  return "unknown"
}
