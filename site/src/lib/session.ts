import { signToken, verifyToken } from "@/lib/tokens";

export const SESSION_COOKIE = "otx_session";
const SESSION_MAX_AGE_MS = 30 * 86_400_000;

export function sessionCookie(email: string): string {
  const token = signToken("session", email);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}${secure}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** The signed-in email, or null. */
export function sessionEmail(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  if (!m) return null;
  try {
    const parsed = verifyToken("session", decodeURIComponent(m[1]), SESSION_MAX_AGE_MS);
    return parsed?.payload ?? null;
  } catch {
    return null;
  }
}
