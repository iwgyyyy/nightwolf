import { NightwolfClient } from "./client"

export { NightwolfClient, SyncError } from "./client"
export type { AdminToken, ConnectionStatus, Unsubscribe } from "./client"

/**
 * 全局唯一的客户端实例。
 *
 * 游戏逻辑跑在服务端，所以不再有"本地内存实现"可选 —— 必须连上后端。
 * 本地开发：在 server/ 下 `bun run dev`，并在 .env.local 配置 VITE_WS_URL。
 */
let instance: NightwolfClient | null = null

export function getSyncService(): NightwolfClient {
  if (instance) return instance
  const wsUrl = import.meta.env.VITE_WS_URL
  if (typeof wsUrl !== "string" || wsUrl.trim().length === 0) {
    throw new Error(
      "未配置 VITE_WS_URL —— 游戏逻辑在服务端，前端必须连接后端才能运行",
    )
  }
  instance = new NightwolfClient(resolveWsUrl(wsUrl))
  return instance
}

/**
 * 若 WS URL 的 host 是本机地址，替换为当前访问页面的 host。
 * 目的：手机通过 `http://192.168.x.x:5173` 访问 dev server 时，
 *      WS 连接也走 `ws://192.168.x.x:9000`，不用手改 .env.local。
 */
function resolveWsUrl(raw: string): string {
  if (typeof window === "undefined") return raw
  try {
    const url = new URL(raw)
    if (
      url.hostname === "localhost" ||
      url.hostname === "0.0.0.0" ||
      url.hostname === "127.0.0.1"
    ) {
      url.hostname = window.location.hostname
    }
    return url.toString()
  } catch {
    return raw
  }
}

/** 替换实例（给测试用） */
export function __setSyncService(svc: NightwolfClient | null): void {
  instance = svc
}
