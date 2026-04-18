/**
 * 根据玩家名称生成确定性的像素头像（Identicon）。
 *
 * 规则：
 * - 同一 name 永远生成相同图案
 * - 5x5 对称网格：左侧 3 列通过 hash 位决定，右侧 2 列镜像左侧
 * - 前景色 HSL 色相由 name hash 决定，饱和度/明度固定
 * - 背景色为同色系深色（融入 Moonlit Village 暗色主题）
 *
 * 说明：PRD §9.4 写明使用 SHA-256，这里用同步 cyrb53 近似哈希，
 * 对 identicon 的目的（确定性映射 name → 视觉）足够稳定且无需异步。
 */

const GRID_SIZE = 5
const HALF = Math.ceil(GRID_SIZE / 2) // 3

/** 64-bit 同步哈希（cyrb53），返回 [high32, low32] */
function cyrb53(str: string, seed = 0): [number, number] {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return [h2 >>> 0, h1 >>> 0]
}

export interface IdenticonColors {
  fg: string
  bg: string
}

/** 为某个 name 生成前景/背景色 */
export function identiconColors(name: string): IdenticonColors {
  const [hi, lo] = cyrb53(name, 0xabcdef)
  const hue = (hi ^ lo) % 360
  return {
    fg: `hsl(${hue}, 55%, 62%)`,
    bg: `hsl(${hue}, 30%, 22%)`,
  }
}

/**
 * 返回 `GRID_SIZE x GRID_SIZE` 的像素矩阵（true = 前景色）。
 * 左半部生成，右半部镜像。
 */
export function identiconMatrix(name: string): boolean[][] {
  const [hi, lo] = cyrb53(name || "anonymous")
  // 用 40 位够生成 5*3=15 个单元
  const bits: boolean[] = []
  for (let i = 0; i < 32; i++) bits.push(((lo >>> i) & 1) === 1)
  for (let i = 0; i < 8; i++) bits.push(((hi >>> i) & 1) === 1)

  const matrix: boolean[][] = Array.from({ length: GRID_SIZE }, () =>
    new Array(GRID_SIZE).fill(false),
  )
  let idx = 0
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < HALF; col++) {
      const on = bits[idx++] ?? false
      matrix[row][col] = on
      // 镜像到右侧（col 0 → col 4；col 1 → col 3；col 2 为中间列，不镜像）
      matrix[row][GRID_SIZE - 1 - col] = on
    }
  }
  return matrix
}

/**
 * 生成一个完整的 SVG 字符串，可直接作为 `img.src` 用 data URL。
 */
export function identiconSvg(name: string, size = 64): string {
  const matrix = identiconMatrix(name)
  const { fg, bg } = identiconColors(name)
  const cell = size / GRID_SIZE
  const rects: string[] = [
    `<rect width="${size}" height="${size}" fill="${bg}"/>`,
  ]
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (!matrix[row][col]) continue
      rects.push(
        `<rect x="${col * cell}" y="${row * cell}" width="${cell}" height="${cell}" fill="${fg}"/>`,
      )
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">${rects.join("")}</svg>`
}

/** 返回可直接赋给 `img.src` 的 data URL */
export function identiconDataUrl(name: string, size = 64): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(identiconSvg(name, size))}`
}
