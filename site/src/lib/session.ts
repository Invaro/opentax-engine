import { getProfile, type Profile } from "@/lib/accounts";
import { signToken, verifyToken } from "@/lib/tokens";

/**
 * Sessions are signed tokens in an HttpOnly cookie. Each carries the
 * account's session epoch; "sign out everywhere" bumps the epoch, which
 * invalidates every outstanding token. In production the cookie uses the
 * __Host- prefix, so it is Secure, host-only and scoped to "/".
 */

const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-otx_session" : "otx_session";
const SESSION_MAX_AGE_MS = 14 * 86_400_000;

export function sessionCookie(email: string, epoch: number, sid: string): string {
  const token = signToken("session", `${email}|${epoch}|${sid}`);
  const secure = PROD ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = PROD ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readToken(req: Request): { email: string; epoch: number; sid: string } | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookie);
  if (!m) return null;
  try {
    const parsed = verifyToken("session", decodeURIComponent(m[1]), SESSION_MAX_AGE_MS);
    if (!parsed) return null;
    // email|epoch|sid, read from the right: the email is the only part that could contain "|"
    const parts = parsed.payload.split("|");
    if (parts.length < 3) return null;
    const sid = parts.pop()!;
    const epoch = Number(parts.pop());
    const email = parts.join("|");
    if (!email || !sid || !Number.isInteger(epoch)) return null;
    return { email, epoch, sid };
  } catch {
    return null;
  }
}

/** The signed-in account, after checking the token is still current. */
export async function sessionProfile(req: Request): Promise<Profile | null> {
  const token = readToken(req);
  if (!token) return null;
  const profile = await getProfile(token.email).catch(() => null);
  if (!profile) return null;
  if ((profile.sessionEpoch ?? 0) !== token.epoch) return null;
  return (profile.sessions ?? []).some((s) => s.id === token.sid) ? profile : null;
}

/** The signed-in email, after checking the token is still current. */
export async function sessionEmail(req: Request): Promise<string | null> {
  return (await sessionProfile(req))?.email ?? null;
}
