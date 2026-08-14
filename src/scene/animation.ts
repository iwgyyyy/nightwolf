/** 场景动画的小工具：缓动 + 三点贝塞尔 */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** 二次贝塞尔（用于"拿起再放下"的弧线运动） */
export function bezier2(
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  t: number,
): [number, number, number] {
  const u = 1 - t
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ]
}
