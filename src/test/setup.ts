/**
 * Vitest 全局 setup。
 * Bun runtime 会给 globalThis 注入一个残缺的 `localStorage`（只有空对象，没有方法），
 * 这里用一个完整的 Map-based 实现覆盖，保证 happy-dom/测试环境都能正常工作。
 */
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

Object.defineProperty(globalThis, "localStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
Object.defineProperty(globalThis, "sessionStorage", {
  value: new MemoryStorage(),
  writable: true,
  configurable: true,
})
