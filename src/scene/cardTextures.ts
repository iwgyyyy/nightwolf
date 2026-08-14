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

/** 牌面底色：羊皮纸基调上按阵营淡淡着色（狼红 / 村绿 / 独立黄） */
const TEAM_BG: Record<Team, string> = {
  werewolf: "#f2dcd2",
  villager: "#e5ecd6",
  independent: "#f4e9c4",
}

const FONT_STACK = `"LXGW WenKai Screen", "Source Han Serif SC", serif`

function makeCanvas(
  w = W,
  h = H,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
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
  ctx.fillStyle = TEAM_BG[meta.team]
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

function getOrCreate(
  key: string,
  draw: (ctx: CanvasRenderingContext2D) => void,
  w = W,
  h = H,
): CanvasTexture {
  const existing = cache.get(key)
  if (existing) return existing.texture
  hookFonts()
  const [canvas, ctx] = makeCanvas(w, h)
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

// ============================================================
// 桌面名签：玩家名字贴在他面前的桌沿，全阶段常显
// ============================================================

const NAME_W = 512
const NAME_H = 128

/** 名签左侧的语音角标：闭麦 / 讲话中 / 无 */
export type VoiceBadge = "none" | "muted" | "speaking"

/** speaking 声波动画帧数（0 弧 → 1 弧 → 2 弧 循环） */
export const SPEAKING_FRAMES = 3

/** 麦克风小图标（约 52px 高），muted 加斜杠，speaking 按帧画声波弧 */
function drawMicIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  badge: Exclude<VoiceBadge, "none">,
  frame: number,
) {
  const color =
    badge === "speaking" ? "rgba(143,206,159,0.95)" : "rgba(186,192,212,0.7)"
  ctx.save()
  ctx.lineWidth = 6
  ctx.lineCap = "round"
  ctx.strokeStyle = color
  ctx.fillStyle = color
  // 咪头
  ctx.beginPath()
  ctx.roundRect(cx - 9, cy - 26, 18, 30, 9)
  ctx.fill()
  // 拾音碗
  ctx.beginPath()
  ctx.arc(cx, cy + 2, 16, 0, Math.PI)
  ctx.stroke()
  // 支杆
  ctx.beginPath()
  ctx.moveTo(cx, cy + 18)
  ctx.lineTo(cx, cy + 26)
  ctx.stroke()
  if (badge === "muted") {
    ctx.strokeStyle = "rgba(224,92,76,0.95)"
    ctx.beginPath()
    ctx.moveTo(cx - 20, cy - 26)
    ctx.lineTo(cx + 20, cy + 26)
    ctx.stroke()
  } else {
    // 声波弧按帧扩散：frame=0 无弧，1 一道，2 两道
    const radii = [24, 34].slice(0, frame)
    for (const r of radii) {
      ctx.beginPath()
      ctx.arc(cx - 2, cy - 2, r, -0.35 * Math.PI, 0.35 * Math.PI)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawName(
  ctx: CanvasRenderingContext2D,
  name: string,
  eliminated: boolean,
  voice: VoiceBadge,
  frame: number,
) {
  ctx.clearRect(0, 0, NAME_W, NAME_H)
  // 微弱暗底提升可读性；刻意不做卡片状，避免与身份牌混淆。
  // 名签会叠在翻开的亮色牌面上，底板要够透明、靠文字阴影保对比
  ctx.beginPath()
  ctx.roundRect(72, 18, NAME_W - 144, NAME_H - 36, 46)
  ctx.fillStyle = "rgba(8,10,22,0.22)"
  ctx.fill()
  ctx.shadowColor = "rgba(6,8,18,0.9)"
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 2
  ctx.font = `bold 64px ${FONT_STACK}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  const y = NAME_H / 2 + 2

  // 组合排版：[语音角标] 名字 [红色"出局"后缀]，整体居中
  const suffix = eliminated ? " 出局" : ""
  const iconW = voice === "none" ? 0 : 68
  const nameW = Math.min(ctx.measureText(name).width, 240)
  const suffixW = suffix ? ctx.measureText(suffix).width : 0
  let x = (NAME_W - iconW - nameW - suffixW) / 2
  if (voice !== "none") {
    drawMicIcon(ctx, x + 24, y, voice, frame)
    x += iconW
  }
  ctx.fillStyle = "rgba(243,244,250,0.92)"
  ctx.fillText(name, x, y, 240)
  if (suffix) {
    x += nameW
    ctx.fillStyle = "rgba(224,92,76,0.95)"
    ctx.fillText(suffix, x, y)
  }
}

export function nameTexture(
  name: string,
  eliminated = false,
  voice: VoiceBadge = "none",
  frame = 0,
): CanvasTexture {
  // 只有 speaking 有动画帧，其余归一为 0，避免缓存重复
  const f = voice === "speaking" ? frame % SPEAKING_FRAMES : 0
  return getOrCreate(
    `name:${eliminated ? "elim:" : ""}${voice}:${f}:${name}`,
    (ctx) => drawName(ctx, name, eliminated, voice, f),
    NAME_W,
    NAME_H,
  )
}

/** 结算：自己出局时放在自己牌下方的提示（整句红字） */
export function selfEliminatedTexture(): CanvasTexture {
  return getOrCreate(
    "self-eliminated",
    (ctx) => {
      ctx.clearRect(0, 0, NAME_W, NAME_H)
      ctx.beginPath()
      ctx.roundRect(72, 18, NAME_W - 144, NAME_H - 36, 46)
      ctx.fillStyle = "rgba(8,10,22,0.22)"
      ctx.fill()
      ctx.shadowColor = "rgba(6,8,18,0.9)"
      ctx.shadowBlur = 12
      ctx.shadowOffsetY = 2
      ctx.font = `bold 64px ${FONT_STACK}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "rgba(224,92,76,0.95)"
      ctx.fillText("你出局了", NAME_W / 2, NAME_H / 2 + 2)
    },
    NAME_W,
    NAME_H,
  )
}
