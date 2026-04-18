import { InMemorySyncService } from "./InMemorySyncService"
import { WebSocketSyncService } from "./WebSocketSyncService"
import type { GameSyncService } from "./GameSyncService"

export type { GameSyncService, Unsubscribe, AdminCredentials } from "./GameSyncService"
export { SyncError } from "./GameSyncService"
export { InMemorySyncService } from "./InMemorySyncService"
export { WebSocketSyncService } from "./WebSocketSyncService"

/**
 * 全局唯一的同步服务实例。
 *
 * 选择逻辑：
 *   1. `VITE_WS_URL` 设置了 → 使用 WebSocketSyncService
 *   2. 否则 → InMemorySyncService（同浏览器多 tab 可用，跨浏览器/无痕不可用）
 */
let instance: GameSyncService | null = null

export function getSyncService(): GameSyncService {
  if (instance) return instance

  const wsUrl = import.meta.env.VITE_WS_URL
  if (typeof wsUrl === "string" && wsUrl.trim().length > 0) {
    instance = new WebSocketSyncService(resolveWsUrl(wsUrl))
  } else {
    instance = new InMemorySyncService()
  }
  return instance
}

/**
 * 若 WS URL 的 host 是 localhost / 0.0.0.0，替换为当前访问页面的 host。
 * 目的：手机通过 `http://192.168.x.x:5173` 访问 Vite dev server 时，
 *      WS 连接也走 `ws://192.168.x.x:9000`，不需要手动改 .env.local。
 */
function resolveWsUrl(raw: string): string {
  if (typeof window === "undefined") return raw
  try {
    const url = new URL(raw)
    if (url.hostname === "localhost" || url.hostname === "0.0.0.0" || url.hostname === "127.0.0.1") {
      url.hostname = window.location.hostname
    }
    return url.toString()
  } catch {
    return raw
  }
}

/** 切换实现（主要给测试和本地切换用） */
export function __setSyncService(svc: GameSyncService | null): void {
  instance = svc
}
