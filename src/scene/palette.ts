/**
 * Moonlit Village 主题在 three.js 材质里的近似色。
 * three.js 不解析 oklch，这里是 index.css 中主题色的手工 hex 对应，
 * 改主题色时两边需要同步。
 */
export const PALETTE = {
  night900: "#0e1120",
  night800: "#191d31",
  night700: "#272c47",
  parchment: "#f0e7d0",
  candle400: "#f4d391",
  candle500: "#e9bd6a",
  candle600: "#c2913f",
  blood500: "#b34a33",
  sage500: "#7ca887",
  moon100: "#f3f4fa",

  // 场景专用色（不对应 CSS 变量）
  tableWood: "#503a29",
  tableWoodDark: "#3a2a1e",
  tableFelt: "#20304a",
  ground: "#11141f",
  cloak: "#232842",
  hoodShadow: "#161a2c",
  moonGlow: "#e7ecf9",
  moonlight: "#a9b8dd",
} as const
