/**
 * 底层 WebSocket 连接：心跳 + 指数退避重连 + 主动断开。
 *
 * 事件驱动；不处理业务消息语义（由上层 WebSocketSyncService 解析）。
 */

import { decodeInbound, encodeOutbound, type WSInbound, type WSOutbound } from "./WSMessage"

type ConnectionState = "idle" | "connecting" | "open" | "closed"

interface Handlers {
  onOpen?: () => void
  onClose?: (reason: "intentional" | "error" | "remote") => void
  onMessage?: (message: WSInbound) => void
}

const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_MS = 1_000
const RECONNECT_CAP_MS = 30_000

export class WebSocketConnection {
  private ws: WebSocket | null = null
  private state: ConnectionState = "idle"
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempts = 0
  private intentionalClose = false
  private readonly url: string
  private readonly handlers: Handlers

  constructor(url: string, handlers: Handlers = {}) {
    this.url = url
    this.handlers = handlers
  }

  connect(): void {
    if (this.state === "open" || this.state === "connecting") return
    this.intentionalClose = false
    this.state = "connecting"
    try {
      this.ws = new WebSocket(this.url)
    } catch {
      this.state = "closed"
      this.handlers.onClose?.("error")
      this.scheduleReconnect()
      return
    }

    this.ws.addEventListener("open", () => {
      this.state = "open"
      this.reconnectAttempts = 0
      this.startHeartbeat()
      this.handlers.onOpen?.()
    })

    this.ws.addEventListener("message", (ev) => {
      const msg = decodeInbound(typeof ev.data === "string" ? ev.data : String(ev.data))
      if (msg) this.handlers.onMessage?.(msg)
    })

    this.ws.addEventListener("close", () => {
      const wasOpen = this.state === "open"
      this.cleanupSocket()
      if (this.intentionalClose) {
        this.handlers.onClose?.("intentional")
        return
      }
      this.handlers.onClose?.(wasOpen ? "remote" : "error")
      this.scheduleReconnect()
    })

    this.ws.addEventListener("error", () => {
      // error 会紧跟 close，这里什么都不做（统一在 close 中处理）
    })
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearTimers()
    this.ws?.close()
    this.cleanupSocket()
    this.state = "closed"
  }

  get isOpen(): boolean {
    return this.state === "open" && this.ws?.readyState === WebSocket.OPEN
  }

  send(msg: WSOutbound): boolean {
    if (!this.isOpen || !this.ws) return false
    try {
      this.ws.send(encodeOutbound(msg))
      return true
    } catch {
      return false
    }
  }

  // ========================================================

  private cleanupSocket(): void {
    this.clearTimers()
    this.state = "closed"
    this.ws = null
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", data: {} })
    }, HEARTBEAT_INTERVAL_MS)
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return
    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_CAP_MS,
    )
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }
}
