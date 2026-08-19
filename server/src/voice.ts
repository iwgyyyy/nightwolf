/**
 * 房间语音（LiveKit SFU）接入凭证签发。
 *
 * token 是离线签名的 JWT，本服务与 LiveKit 实例之间不需要网络互通；
 * identity 取连接身份（ws.data.playerId），客户端无法冒充他人。
 * 未配置 LIVEKIT_* 时不签发，前端等待超时后自行降级。
 */

import { AccessToken } from "livekit-server-sdk";

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "";
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

/** token 有效期：覆盖一整晚的连续对局；掉线重连会重新签发 */
const TOKEN_TTL = "24h";

export function isVoiceConfigured(): boolean {
  return (
    LIVEKIT_URL.length > 0 &&
    LIVEKIT_API_KEY.length > 0 &&
    LIVEKIT_API_SECRET.length > 0
  );
}

export function voiceUrl(): string {
  return LIVEKIT_URL;
}

export function issueVoiceToken(
  roomId: string,
  playerId: string,
): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: playerId,
    ttl: TOKEN_TTL,
  });
  at.addGrant({ roomJoin: true, room: roomId });
  return at.toJwt();
}
