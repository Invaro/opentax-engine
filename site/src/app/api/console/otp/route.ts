/**
 * POST /api/console/otp { email } → { ok, challenge }
 * Emails a six-digit code and returns a signed challenge binding the address
 * to the code's hash for ten minutes. Nothing is stored server-side.
 */
import { createHash, randomInt } from "node:crypto";
import { normalizeEmail, sha256 } from "@/lib/accounts";
import { domainAcceptsMail, sendMail, signInCodeEmail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { signToken } from "@/lib/tokens";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`otp:ip:${ip}`, 6, 10 * 60 * 1000) || !rateLimit("otp:all", 120, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again in a few minutes" }, { status: 429 });
  }
  let email: string | null = null;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return Response.json({ ok: false, error: "body too large" }, { status: 413 });
    email = normalizeEmail((JSON.parse(raw) as { email?: string }).email);
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!email) return Response.json({ ok: false, error: "enter a valid email address" }, { status: 400 });
  if (!rateLimit(`otp:email:${sha256(email)}`, 3, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "a code was already sent, check your inbox" }, { status: 429 });
  }
  if (!(await domainAcceptsMail(email.split("@")[1]))) {
    return Response.json({ ok: false, error: "that domain has no mail server, check for typos" }, { status: 400 });
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const mail = signInCodeEmail(code);
  const sent = await sendMail({ to: email, subject: `${code} is your OpenTax sign-in code`, ...mail }).catch(() => false);
  if (!sent) {
    console.log(JSON.stringify({ evt: "console_otp_send_failed", email: sha256(email).slice(0, 12) }));
    return Response.json({ ok: false, error: "could not send the email, try again" }, { status: 502 });
  }
  console.log(JSON.stringify({ evt: "console_otp_sent", email: sha256(email).slice(0, 12) }));
  const challenge = signToken("otp", `${email}|${codeHash}`);
  return Response.json({ ok: true, challenge });
}
