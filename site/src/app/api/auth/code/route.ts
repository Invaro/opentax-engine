/**
 * POST /api/auth/code { email } → { ok, challenge }
 * Emails an eight-digit sign-in code. The challenge returned is an opaque,
 * signed id; nothing in it reveals the code.
 */
import { normalizeEmail, sha256 } from "@/lib/accounts";
import { domainAcceptsMail, sendMail, signInCodeEmail } from "@/lib/mail";
import { codeAllowance, createChallenge, isKnownDevice } from "@/lib/otp";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const ip = clientIp(req);
  if (!rateLimit(`otp:ip:${ip}`, 6, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again in a few minutes" }, { status: 429 });
  }
  let email: string | null = null;
  let captcha: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return Response.json({ ok: false, error: "body too large" }, { status: 413 });
    const body = JSON.parse(raw) as { email?: string; captcha?: string };
    email = normalizeEmail(body.email);
    captcha = body.captcha;
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!email) return Response.json({ ok: false, error: "enter a valid email address" }, { status: 400 });
  if (!(await verifyTurnstile(captcha, ip, "signin"))) {
    return Response.json({ ok: false, error: "please complete the check and try again", captcha: true }, { status: 403 });
  }
  if (!(await domainAcceptsMail(email.split("@")[1]))) {
    return Response.json({ ok: false, error: "that domain has no mail server, check for typos" }, { status: 400 });
  }
  // the site-wide email ceiling is charged only for requests that would really send
  if (!(await codeAllowance(email, ip, isKnownDevice(req, email))) || !rateLimit("otp:all", 1000, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many codes for this address, try again in an hour" }, { status: 429 });
  }
  const { code, challenge } = await createChallenge(email);
  const mail = signInCodeEmail(code);
  const sent = await sendMail({ to: email, subject: `${code} is your OpenTax sign-in code`, ...mail }).catch(() => false);
  if (!sent) {
    console.log(JSON.stringify({ evt: "auth_code_send_failed", email: sha256(email).slice(0, 12) }));
    return Response.json({ ok: false, error: "could not send the email, try again" }, { status: 502 });
  }
  console.log(JSON.stringify({ evt: "auth_code_sent", email: sha256(email).slice(0, 12) }));
  return Response.json({ ok: true, challenge });
}
