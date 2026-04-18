import { create } from "zustand"
import { persist } from "zustand/middleware"
import { v4 as uuid } from "uuid"

interface LocalPlayer {
  playerId: string
  name: string
}

interface LocalPlayerStore extends LocalPlayer {
  setName: (name: string) => void
  reset: () => void
}

/**
 * 本地玩家身份（playerId + name），长期存 localStorage。
 * 首次访问自动生成 playerId；name 默认空串，用户输入后持久化。
 */
export const useLocalPlayerStore = create<LocalPlayerStore>()(
  persist(
    (set) => ({
      playerId: uuid(),
      name: "",
      setName: (name) => set({ name: name.trim() }),
      reset: () => set({ playerId: uuid(), name: "" }),
    }),
    {
      name: "nightwolf-local-player",
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

/** 简易 hook：直接读本地玩家信息 */
export function useLocalPlayer(): LocalPlayer {
  const playerId = useLocalPlayerStore((s) => s.playerId)
  const name = useLocalPlayerStore((s) => s.name)
  return { playerId, name }
}

/** 是否已经填写过名字 */
export function useHasName(): boolean {
  return useLocalPlayerStore((s) => s.name.trim().length > 0)
}
