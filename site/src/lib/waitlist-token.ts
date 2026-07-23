import { createHmac, timingSafeEqual } from "node:crypto";

/** Stateless signed confirmation tokens: base64url(email|ts) + "." + hmac. */

/** Fail closed: an unset secret must never silently HMAC with a known key. */
function secret(): string {
  const s = process.env.WAITLIST_SECRET;
  if (!s) throw new Error("WAITLIST_SECRET is not configured");
  return s;
}

export function signToken(email: string, ts: number): string {
  const payload = Buffer.from(`${email}|${ts}`).toString("base64url");
  const mac = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export function verifyToken(token: string): { email: string; ts: number } | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const decoded = Buffer.from(payload, "base64url").toString();
  const sep = decoded.lastIndexOf("|");
  const email = decoded.slice(0, sep);
  const ts = Number(decoded.slice(sep + 1));
  if (!email || !Number.isFinite(ts)) return null;
  if (Date.now() - ts > 48 * 3600 * 1000) return null; // 48h expiry
  return { email, ts };
}
