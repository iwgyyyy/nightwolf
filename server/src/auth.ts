/**
 * 管理员认证：凭证校验 + 无状态 HMAC token。
 *
 * 设计要点：
 *   - 密码只存在于服务端环境变量，**永不下发给客户端**
 *   - token 用 HMAC 签名而非服务端存储，所以重启 / 重新部署不会失效，
 *     30 天有效期才真正成立（内存存储配长 TTL 是自相矛盾的）
 *   - 代价：无法撤销单个 token。要全部失效就改 TOKEN_SECRET 或改密码。
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/** token 有效期：30 天 */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 签名密钥。优先用独立配置的 TOKEN_SECRET；未配置时从管理员凭证派生
 * （派生值在重启间保持稳定，且改密码会自动令旧 token 全部失效）。
 */
const SECRET: Buffer = process.env.TOKEN_SECRET
  ? Buffer.from(process.env.TOKEN_SECRET, "utf8")
  : createHash("sha256")
      .update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`)
      .digest();

export function isAdminConfigured(): boolean {
  return ADMIN_USERNAME.length > 0 && ADMIN_PASSWORD.length > 0;
}

/** 定长比较，避免因提前返回泄露匹配进度 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyCredentials(username: unknown, password: unknown): boolean {
  // 未配置凭证时拒绝一切，避免部署疏漏导致房间随便开
  if (!isAdminConfigured()) return false;
  if (typeof username !== "string" || typeof password !== "string") return false;
  // 两个都要算，不短路，否则用户名错时的响应会明显更快
  const userOk = safeEqual(username, ADMIN_USERNAME);
  const passOk = safeEqual(password, ADMIN_PASSWORD);
  return userOk && passOk;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export interface IssuedToken {
  token: string;
  /** ISO 字符串，供客户端展示"有效期至" */
  expiresAt: string;
}

export function issueToken(now: number): IssuedToken {
  const expiresAtMs = now + TOKEN_TTL_MS;
  const payload = String(expiresAtMs);
  return {
    token: `${payload}.${sign(payload)}`,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function verifyToken(token: unknown, now: number): boolean {
  if (typeof token !== "string") return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expiresAtMs = Number(payload);
  if (!Number.isFinite(expiresAtMs)) return false;
  if (now >= expiresAtMs) return false;

  return safeEqual(signature, sign(payload));
}

// ============================================================
// 失败限速
// ============================================================
//
// 密码现在是真正的秘密了，也就有了被爆破的价值 —— 旧实现完全没有限流。

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_FAILURES = 5;

const failures = new Map<string, { count: number; windowStart: number }>();

/** 返回 true 表示允许尝试；false 表示该来源已被暂时锁定 */
export function allowAuthAttempt(clientKey: string, now: number): boolean {
  const entry = failures.get(clientKey);
  if (!entry) return true;
  if (now - entry.windowStart > RATE_WINDOW_MS) {
    failures.delete(clientKey);
    return true;
  }
  return entry.count < RATE_MAX_FAILURES;
}

export function recordAuthFailure(clientKey: string, now: number): void {
  const entry = failures.get(clientKey);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    failures.set(clientKey, { count: 1, windowStart: now });
    return;
  }
  entry.count++;
}

export function clearAuthFailures(clientKey: string): void {
  failures.delete(clientKey);
}

/** 定期清理过期窗口，避免 Map 无限增长 */
export function pruneAuthFailures(now: number): void {
  for (const [key, entry] of failures) {
    if (now - entry.windowStart > RATE_WINDOW_MS) failures.delete(key);
  }
}
