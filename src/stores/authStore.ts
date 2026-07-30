import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * 管理员会话。
 *
 * 存的是服务端签发的 HMAC token，不是密码 —— 密码只在验证那一刻上行一次，
 * 客户端不留任何副本。token 有效期 30 天，过期后重新输入账号密码即可。
 */
interface AuthStore {
  token: string | null
  /** ISO 字符串 */
  expiresAt: string | null
  setToken: (token: string, expiresAt: string) => void
  clearToken: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      setToken: (token, expiresAt) => set({ token, expiresAt }),
      clearToken: () => set({ token: null, expiresAt: null }),
    }),
    {
      name: "nightwolf-auth",
      storage: {
        getItem: (key) => {
          const v = localStorage.getItem(key)
          return v ? JSON.parse(v) : null
        },
        setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        removeItem: (key) => localStorage.removeItem(key),
      },
    },
  ),
)

/**
 * 是否持有未过期的管理员 token。
 *
 * 这只是 UI 层的判断 —— 真正的授权在服务端，
 * 篡改本地存储也开不了房间，create_room 会验签。
 */
export const selectIsAdmin = (s: AuthStore): boolean => {
  if (!s.token || !s.expiresAt) return false
  return new Date(s.expiresAt).getTime() > Date.now()
}
