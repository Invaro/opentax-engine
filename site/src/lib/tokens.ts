import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless signed tokens, one HMAC secret for the whole site, keyed by purpose
 * so a token minted for one use can never be replayed for another.
 * Format: base64url(purpose|payload|ts) + "." + hmac-sha256 hex.
 */

/** Fail closed: an unset secret must never silently HMAC with a known key. */
function secret(): string {
  const s = process.env.WAITLIST_SECRET;
  if (!s) throw new Error("WAITLIST_SECRET is not configured");
  return s;
}

export function signToken(purpose: string, payload: string, ts: number = Date.now()): string {
  const body = Buffer.from(`${purpose}|${payload}|${ts}`).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("hex");
  return `${body}.${mac}`;
}

export function verifyToken(
  purpose: string,
  token: string,
  maxAgeMs: number,
): { payload: string; ts: number } | null {
  const [body, mac] = String(token ?? "").split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("hex");
  try {
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  const decoded = Buffer.from(body, "base64url").toString();
  const first = decoded.indexOf("|");
  const last = decoded.lastIndexOf("|");
  if (first < 0 || last <= first) return null;
  if (decoded.slice(0, first) !== purpose) return null;
  const payload = decoded.slice(first + 1, last);
  const ts = Number(decoded.slice(last + 1));
  if (!payload || !Number.isFinite(ts)) return null;
  if (Date.now() - ts > maxAgeMs) return null;
  return { payload, ts };
}
