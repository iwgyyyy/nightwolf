/**
 * 圆桌座位位置计算。
 * 单独抽出以避免与 PlayerTable 组件同文件（react-refresh/only-export-components）。
 */

export function computeSeatPositions(
  n: number,
  radius: number,
): { x: number; y: number }[] {
  if (n === 0) return []
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2 // 顶部起点
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    })
  }
  return positions
}
