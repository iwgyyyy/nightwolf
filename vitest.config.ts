import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    // 顺序敏感，与 vite.config.ts 保持一致
    alias: {
      "@/engine": path.resolve(__dirname, "./shared/engine"),
      "@/protocol": path.resolve(__dirname, "./shared/protocol.ts"),
      "@/types": path.resolve(__dirname, "./shared/types"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["{src,shared}/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
  },
})
