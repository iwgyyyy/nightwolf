import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AuthStore {
  isAdmin: boolean
  grantAdmin: () => void
  revokeAdmin: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      isAdmin: false,
      grantAdmin: () => set({ isAdmin: true }),
      revokeAdmin: () => set({ isAdmin: false }),
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
