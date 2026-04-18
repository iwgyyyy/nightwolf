/**
 * 创建房间需要管理员凭证。
 *
 * 注意：VITE_* 前缀的环境变量会被 Vite 打包进客户端 bundle，
 * 所以这里的校验**只是 UX 门槛**，不能阻止有 DevTools 的攻击者。
 * 真正的服务端强校验由 WebSocket relay 在 Phase 7 实现。
 */
export const ADMIN_CREDENTIALS = {
  username: import.meta.env.VITE_ADMIN_USERNAME ?? "",
  password: import.meta.env.VITE_ADMIN_PASSWORD ?? "",
} as const

export function verifyAdmin(username: string, password: string): boolean {
  const { username: u, password: p } = ADMIN_CREDENTIALS
  if (!u || !p) {
    // 未配置凭证：开发环境兜底放行（部署时必须配置）
    if (import.meta.env.DEV) return true
    return false
  }
  return username === u && password === p
}
