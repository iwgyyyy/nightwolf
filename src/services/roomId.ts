/**
 * 生成 6 位房间 ID，排除易混字符 0/O/1/I/L。
 */
const ROOM_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const ROOM_ID_LENGTH = 6

export function generateRoomId(): string {
  const chars = new Array(ROOM_ID_LENGTH)
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    chars[i] = ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)]
  }
  return chars.join("")
}

export function isValidRoomId(id: string): boolean {
  if (id.length !== ROOM_ID_LENGTH) return false
  return [...id].every((c) => ROOM_ID_CHARS.includes(c))
}
