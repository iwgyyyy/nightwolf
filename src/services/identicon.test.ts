import { describe, it, expect } from "vitest"
import {
  identiconColors,
  identiconDataUrl,
  identiconMatrix,
  identiconSvg,
} from "./identicon"

describe("identicon", () => {
  it("同名字生成相同 matrix（确定性）", () => {
    const a = identiconMatrix("Alice")
    const b = identiconMatrix("Alice")
    expect(a).toEqual(b)
  })

  it("不同名字生成不同 matrix", () => {
    const a = identiconMatrix("Alice")
    const b = identiconMatrix("Bob")
    expect(a).not.toEqual(b)
  })

  it("matrix 左右对称", () => {
    const matrix = identiconMatrix("Alice")
    for (const row of matrix) {
      for (let col = 0; col < row.length / 2; col++) {
        expect(row[col]).toBe(row[row.length - 1 - col])
      }
    }
  })

  it("matrix 是 5x5", () => {
    const m = identiconMatrix("Bob")
    expect(m).toHaveLength(5)
    for (const row of m) expect(row).toHaveLength(5)
  })

  it("colors 确定性", () => {
    expect(identiconColors("Alice")).toEqual(identiconColors("Alice"))
  })

  it("colors 不同名字不同", () => {
    expect(identiconColors("Alice")).not.toEqual(identiconColors("Bob"))
  })

  it("SVG 包含必要标签", () => {
    const svg = identiconSvg("Alice", 48)
    expect(svg).toContain("<svg")
    expect(svg).toContain("<rect")
    expect(svg).toContain('width="48"')
  })

  it("dataUrl 以 data:image/svg+xml 开头", () => {
    expect(identiconDataUrl("Alice")).toMatch(/^data:image\/svg\+xml/)
  })

  it("空名字 fallback 不 crash", () => {
    expect(() => identiconMatrix("")).not.toThrow()
    expect(() => identiconSvg("")).not.toThrow()
  })
})
