import { CanvasTexture, SRGBColorSpace } from "three"
import type { Role, Team } from "@/types"
import { ROLE_META } from "@/types"
import { ROLE_GLYPH } from "@/components/game/role-display"

/**
 * 用 canvas 生成卡牌贴图，视觉沿用 2D 版：汉字单字主视觉 + 阵营色。
 * 圆角以透明像素画出，材质开 transparent 即得圆角卡。
 */

const W = 256
const H = 356
const RADIUS = 22

const TEAM_COLOR: Record<Team, string> = {
  werewolf: "#b34a33",
  villager: "#7ca887",
  independent: "#c2913f",
}

const FONT_STACK = `"LXGW WenKai Screen", "Source Han Serif SC", serif`

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")!
  return [canvas, ctx]
}

function roundedCardPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.roundRect(0, 0, W, H, RADIUS)
}

function drawBack(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, W, H)
  roundedCardPath(ctx)
  ctx.fillStyle = "#191d31"
  ctx.fill()
  ctx.save()
  roundedCardPath(ctx)
  ctx.clip()

  // 内框
  ctx.strokeStyle = "rgba(233,189,106,0.45)"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(12, 12, W - 24, H - 24, RADIUS - 8)
  ctx.stroke()

  // 月亮
  ctx.beginPath()
  ctx.arc(W / 2, H / 2 - 10, 46, 0, Math.PI * 2)
  ctx.fillStyle = "rgba(243,244,250,0.16)"
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W / 2 + 16, H / 2 - 22, 40, 0, Math.PI * 2)
  ctx.fillStyle = "#191d31"
  ctx.fill()

  // 点星
  ctx.fillStyle = "rgba(243,244,250,0.35)"
  for (const [x, y, r] of [
    [52, 64, 2.2],
    [204, 88, 1.6],
    [70, 270, 1.8],
    [190, 292, 2.4],
    [140, 60, 1.4],
  ] as const) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // 底部字
  ctx.fillStyle = "rgba(233,189,106,0.6)"
  ctx.font = `18px ${FONT_STACK}`
  ctx.textAlign = "center"
  ctx.fillText("夜 幕 之 下", W / 2, H - 44)
  ctx.restore()
}

function drawFront(ctx: CanvasRenderingContext2D, role: Role) {
  const meta = ROLE_META[role]
  const accent = TEAM_COLOR[meta.team]

  ctx.clearRect(0, 0, W, H)
  roundedCardPath(ctx)
  ctx.fillStyle = "#f0e7d0"
  ctx.fill()
  ctx.save()
  roundedCardPath(ctx)
  ctx.clip()

  // 阵营色上沿
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, W, 10)

  // 内框
  ctx.strokeStyle = "rgba(51,46,40,0.35)"
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(12, 20, W - 24, H - 34, RADIUS - 8)
  ctx.stroke()

  // 汉字主视觉
  ctx.fillStyle = "#332e28"
  ctx.font = `150px ${FONT_STACK}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(ROLE_GLYPH[role], W / 2, H / 2 - 26)

  // 角色名
  ctx.font = `34px ${FONT_STACK}`
  ctx.fillStyle = accent
  ctx.textBaseline = "alphabetic"
  ctx.fillText(meta.displayName, W / 2, H - 62)

  // 阵营小字
  ctx.font = `16px ${FONT_STACK}`
  ctx.fillStyle = "rgba(51,46,40,0.55)"
  const teamLabel =
    meta.team === "werewolf" ? "狼人阵营" : meta.team === "villager" ? "村民阵营" : "独立阵营"
  ctx.fillText(teamLabel, W / 2, H - 34)
  ctx.restore()
}

// ============================================================
// 纹理缓存：字体就绪后统一重绘一次
// ============================================================

interface CacheEntry {
  texture: CanvasTexture
  redraw: () => void
}

const cache = new Map<string, CacheEntry>()
let fontsReady = false
let fontsHooked = false

function hookFonts() {
  if (fontsHooked || typeof document === "undefined") return
  fontsHooked = true
  document.fonts?.ready.then(() => {
    fontsReady = true
    for (const entry of cache.values()) entry.redraw()
  })
}

function getOrCreate(key: string, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const existing = cache.get(key)
  if (existing) return existing.texture
  hookFonts()
  const [canvas, ctx] = makeCanvas()
  draw(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  const entry: CacheEntry = {
    texture,
    redraw: () => {
      draw(ctx)
      texture.needsUpdate = true
    },
  }
  cache.set(key, entry)
  // 字体已就绪但首绘可能发生在 ready 之前的同一帧，稳妥起见再绘一次
  if (fontsReady) entry.redraw()
  return texture
}

export function cardBackTexture(): CanvasTexture {
  return getOrCreate("back", drawBack)
}

export function cardFrontTexture(role: Role): CanvasTexture {
  return getOrCreate(`front:${role}`, (ctx) => drawFront(ctx, role))
}
