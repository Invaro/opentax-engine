import { randomBytes, randomInt } from "node:crypto";
import { removeJson, sha256, updateJson, writeJson } from "@/lib/accounts";
import { keyedHash, safeEqualHex, signToken, verifyToken } from "@/lib/tokens";

/**
 * Email sign-in codes. The browser only ever holds a signed, opaque challenge
 * id; the code's keyed hash, the attempt count and the expiry live
 * server-side, so a code cannot be guessed offline, is good for five tries,
 * and works once. Codes are eight digits: five tries against a hundred
 * million values.
 *
 *   auth/otp/<sha256(nonce)>.json   { email, codeHash, expiresAt, attempts }
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Challenge = { email: string; codeHash: string; expiresAt: number; attempts: number };

const path = (nonce: string) => `auth/otp/${sha256(nonce)}.json`;

/**
 * Code requests are limited per (address, IP) and per address, stored and
 * updated atomically so the limits hold across every server instance. The
 * per-(address, IP) limit is the tight one, so a stranger asking for codes
 * can't use up a real user's allowance; the per-address cap stops one
 * inbox being flooded from many IPs.
 */
const HOURLY_PER_EMAIL_AND_IP = 3;
const HOURLY_PER_EMAIL = 15;

async function take(pathname: string, limit: number): Promise<boolean> {
  const now = Date.now();
  let allowed = false;
  await updateJson<{ times: number[] }>(pathname, (cur) => {
    const recent = (cur?.times ?? []).filter((t) => now - t < 3600_000);
    allowed = recent.length < limit;
    return allowed ? { times: [...recent, now] } : undefined;
  });
  return allowed;
}

/**
 * A device that has signed in to this address before skips the per-address
 * cap, so a stranger flooding the address from many IPs can't lock its owner
 * out. The per-(address, IP) limit still applies to everyone.
 */
export async function codeAllowance(email: string, ip: string, knownDevice = false): Promise<boolean> {
  const e = sha256(email);
  if (!(await take(`auth/otp-rate/${e}/${sha256(ip).slice(0, 16)}.json`, HOURLY_PER_EMAIL_AND_IP))) return false;
  return knownDevice || take(`auth/otp-rate/${e}/all.json`, HOURLY_PER_EMAIL);
}

const PROD = process.env.NODE_ENV === "production";
const DEVICE_COOKIE = PROD ? "__Host-otx_device" : "otx_device";
const DEVICE_MAX_AGE_MS = 90 * 86_400_000;

export function deviceCookie(email: string): string {
  const token = signToken("device", sha256(email));
  const secure = PROD ? "; Secure" : "";
  return `${DEVICE_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEVICE_MAX_AGE_MS / 1000}${secure}`;
}

export function isKnownDevice(req: Request, email: string): boolean {
  const m = new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "");
  if (!m) return false;
  try {
    return verifyToken("device", decodeURIComponent(m[1]), DEVICE_MAX_AGE_MS)?.payload === sha256(email);
  } catch {
    return false;
  }
}

export async function createChallenge(email: string): Promise<{ code: string; challenge: string }> {
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const nonce = randomBytes(24).toString("base64url");
  const record: Challenge = {
    email,
    codeHash: keyedHash("otp-code", `${nonce}|${email}|${code}`),
    expiresAt: Date.now() + TTL_MS,
    attempts: 0,
  };
  await writeJson(path(nonce), record);
  return { code, challenge: signToken("otp", nonce) };
}

export type VerifyResult = { ok: true; email: string } | { ok: false; error: string };

export async function verifyChallenge(challenge: string, email: string, code: string): Promise<VerifyResult> {
  const parsed = verifyToken("otp", challenge, TTL_MS);
  if (!parsed) return { ok: false, error: "that code expired, request a new one" };
  const nonce = parsed.payload;
  // spend an attempt BEFORE comparing, with a compare-and-swap write: parallel
  // guesses each need their own successful increment, so at most five ever run
  let state: "ok" | "expired" | "exhausted" = "expired";
  let record: Challenge | null = null;
  try {
    record = await updateJson<Challenge>(path(nonce), (cur) => {
      if (!cur || cur.expiresAt < Date.now()) return void (state = "expired");
      if (cur.attempts >= MAX_ATTEMPTS) return void (state = "exhausted");
      state = "ok";
      return { ...cur, attempts: cur.attempts + 1 };
    }, 4);
  } catch {
    return { ok: false, error: "too many attempts at once, try again in a moment" };
  }
  if (state === "expired" || !record) return { ok: false, error: "that code expired, request a new one" };
  if (state === "exhausted") {
    await removeJson(path(nonce)).catch(() => {});
    return { ok: false, error: "too many wrong codes, request a new one" };
  }
  const match =
    record.email === email && safeEqualHex(record.codeHash, keyedHash("otp-code", `${nonce}|${email}|${code}`));
  if (!match) return { ok: false, error: "wrong code" };
  await removeJson(path(nonce));
  return { ok: true, email };
}
