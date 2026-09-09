/**
 * POST /api/console/verify { email, code, challenge } → sets the session cookie
 * and creates the account (with its first API key) on first sign-in.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { ensureAccount, normalizeEmail, sha256 } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sessionCookie } from "@/lib/session";
import { verifyToken } from "@/lib/tokens";

export const runtime = "nodejs";
const OTP_MAX_AGE_MS = 10 * 60 * 1000;

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`verify:ip:${ip}`, 12, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many attempts, request a new code" }, { status: 429 });
  }
  let email: string | null = null;
  let code = "";
  let challenge = "";
  try {
    const raw = await req.text();
    if (raw.length > 4096) return Response.json({ ok: false, error: "body too large" }, { status: 413 });
    const body = JSON.parse(raw) as { email?: string; code?: string; challenge?: string };
    email = normalizeEmail(body.email);
    code = String(body.code ?? "").replace(/\D/g, "");
    challenge = String(body.challenge ?? "");
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!email || code.length !== 6 || !challenge) {
    return Response.json({ ok: false, error: "enter the six-digit code" }, { status: 400 });
  }
  const parsed = verifyToken("otp", challenge, OTP_MAX_AGE_MS);
  if (!parsed) return Response.json({ ok: false, error: "that code expired, request a new one" }, { status: 400 });
  const sep = parsed.payload.lastIndexOf("|");
  const boundEmail = parsed.payload.slice(0, sep);
  const boundHash = parsed.payload.slice(sep + 1);
  const codeHash = createHash("sha256").update(code).digest("hex");
  const match =
    boundEmail === email &&
    boundHash.length === codeHash.length &&
    timingSafeEqual(Buffer.from(boundHash), Buffer.from(codeHash));
  if (!match) return Response.json({ ok: false, error: "wrong code" }, { status: 400 });

  try {
    await ensureAccount(email);
  } catch (err) {
    console.log(JSON.stringify({ evt: "console_account_error", email: sha256(email).slice(0, 12), err: String(err) }));
    return Response.json({ ok: false, error: "could not create the account, try again" }, { status: 502 });
  }
  console.log(JSON.stringify({ evt: "console_signed_in", email: sha256(email).slice(0, 12) }));
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie(email) },
  });
}
