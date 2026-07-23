import { createHash } from "node:crypto";
import { resolveMx } from "node:dns/promises";
import { list, put } from "@vercel/blob";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { signToken } from "@/lib/waitlist-token";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Common disposable-email domains; typos land in the MX check instead. */
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwaway.email", "yopmail.com", "sharklasers.com",
  "getnada.com", "dispostable.com", "trashmail.com", "fakeinbox.com",
]);

/** Domain must actually run mail servers. ~50ms for real domains. */
async function domainAcceptsMail(domain: string): Promise<boolean> {
  try {
    const mx = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

async function sendConfirmation(email: string, confirmUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "OpenTax by Invaro <updates@mail.invaro.ai>",
      reply_to: "founders@invaro.ai",
      to: [email],
      subject: "Confirm your OpenTax updates",
      html: `<!doctype html><html><body style="margin:0;padding:40px 20px;background:#fafafa;font-family:Georgia,serif;color:#121212;">
<div style="max-width:480px;margin:0 auto;">
  <p style="font-family:monospace;font-size:12px;color:#6a6a6a;margin:0 0 24px;">&#10035; opentax &nbsp;&middot;&nbsp; by Invaro</p>
  <h1 style="font-size:28px;font-weight:normal;margin:0 0 16px;">One click and you're in.</h1>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 28px;">
    Confirm this address and we'll keep you posted on the good stuff: new features
    and other things worth knowing. If this wasn't you, just ignore it.
  </p>
  <a href="${confirmUrl}" style="display:inline-block;background:#121212;color:#fafafa;padding:12px 24px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;">Confirm subscription</a>
  <p style="font-size:12px;color:#8a8a8a;margin:32px 0 0;line-height:1.6;">
    The link expires in 48 hours. No confirmation, no emails, ever.<br/>
    OpenTax, the deterministic tax engine for AI agents &middot; <a href="https://opentax.invaro.ai" style="color:#8a8a8a;">opentax.invaro.ai</a>
  </p>
</div>
</body></html>`,
    }),
  });
  return res.ok;
}

/** One confirmation email per address per window, across all instances. */
const RESEND_WINDOW_MS = 24 * 3600 * 1000;

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit(`wl:ip:${ip}`, 3, 10 * 60 * 1000) || !rateLimit("wl:all", 30, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many requests" }, { status: 429 });
  }

  let email = "";
  let source = "site";
  try {
    const raw = await req.text();
    if (raw.length > 2048) {
      return Response.json({ ok: false, error: "body too large" }, { status: 413 });
    }
    const body = JSON.parse(raw) as { email?: string; source?: string };
    email = String(body.email ?? "").trim().toLowerCase();
    source = String(body.source ?? "site").slice(0, 40);
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ ok: false, error: "invalid email" }, { status: 400 });
  }
  const domain = email.split("@")[1];
  if (DISPOSABLE.has(domain)) {
    return Response.json({ ok: false, error: "disposable domain" }, { status: 400 });
  }
  if (!(await domainAcceptsMail(domain))) {
    return Response.json(
      { ok: false, error: "domain has no mail server, check for typos" },
      { status: 400 },
    );
  }

  // Cross-instance dedupe: one confirmation email per address per window, so
  // the endpoint can't be scripted into a harassment relay against a third
  // party. The marker blob's own uploadedAt is the clock.
  const emailHash = createHash("sha256").update(email).digest("hex");
  const marker = `waitlist-sent/${emailHash}.json`;
  try {
    const { blobs } = await list({ prefix: marker, limit: 1 });
    const last = blobs[0]?.uploadedAt ? new Date(blobs[0].uploadedAt).getTime() : 0;
    if (Date.now() - last < RESEND_WINDOW_MS) {
      // Same response shape as a fresh signup: no oracle for who's subscribed.
      return Response.json({ ok: true, confirm: true });
    }
  } catch {
    /* dedupe check unavailable: continue, the rate limits still bound sends */
  }

  // Stored fields are exactly what /privacy discloses: address, source, time.
  const record = {
    email,
    source,
    at: new Date().toISOString(),
  };
  const token = signToken(email, Date.now());
  const confirmUrl = `https://opentax.invaro.ai/api/confirm?token=${encodeURIComponent(token)}`;
  const sent = await sendConfirmation(email, confirmUrl).catch(() => false);
  if (sent) {
    await put(marker, JSON.stringify({ at: record.at }), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    }).catch(() => {});
  }

  try {
    await put(
      `signups-pending/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
      JSON.stringify({ ...record, confirmationSent: sent }),
      { access: "private", contentType: "application/json" },
    );
  } catch (err) {
    console.log(JSON.stringify({ evt: "waitlist_store_error", email: emailHash.slice(0, 12), err: String(err) }));
  }
  // Runtime logs get a hash, not the address — the address lives only in Blob.
  console.log(
    JSON.stringify({ evt: "waitlist_pending", email: emailHash.slice(0, 12), source, confirmationSent: sent }),
  );
  // Even if the send failed we captured the (MX-validated) address as pending.
  return Response.json({ ok: true, confirm: sent });
}
