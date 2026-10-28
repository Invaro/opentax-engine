/** POST /api/auth/verify { email, code, challenge } → sets the session cookie, creating the account on first sign-in. */
import { addSession, ensureAccount, normalizeEmail, sha256 } from "@/lib/accounts";
import { deviceCookie, verifyChallenge } from "@/lib/otp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  if (!rateLimit(`verify:ip:${clientIp(req)}`, 12, 10 * 60 * 1000)) {
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
  if (!email || code.length !== 8 || !challenge) {
    return Response.json({ ok: false, error: "enter the eight-digit code" }, { status: 400 });
  }
  const result = await verifyChallenge(challenge, email, code);
  if (!result.ok) return Response.json(result, { status: 400 });
  try {
    await ensureAccount(email);
    const session = await addSession(email);
    console.log(JSON.stringify({ evt: "auth_signed_in", email: sha256(email).slice(0, 12) }));
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", sessionCookie(email, session.epoch, session.id));
    headers.append("Set-Cookie", deviceCookie(email));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    return Response.json({ ok: false, error: "could not sign you in, try again" }, { status: 502 });
  }
}
