import { resolveMx } from "node:dns/promises";

/** Domain must actually run mail servers. ~50ms for real domains. */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
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

/** Transactional mail through Resend from the site's verified sender. */
export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // local development only: print the mail instead of sending it
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev mail] to=${opts.to} subject=${opts.subject}\n${opts.text ?? ""}`);
      return true;
    }
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "OpenTax by Invaro <updates@mail.invaro.ai>",
      reply_to: "support@invaro.ai",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
  return res.ok;
}

export function signInCodeEmail(code: string): { html: string; text: string } {
  const spaced = code.split("").join(" ");
  return {
    text: `Your OpenTax sign-in code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;padding:40px 20px;background:#fafafa;font-family:Georgia,serif;color:#121212;">
<div style="max-width:480px;margin:0 auto;">
  <p style="font-family:monospace;font-size:12px;color:#6a6a6a;margin:0 0 24px;">&#10035; opentax &nbsp;&middot;&nbsp; by Invaro</p>
  <h1 style="font-size:28px;font-weight:normal;margin:0 0 16px;">Your sign-in code</h1>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 20px;">Enter it on the sign-in page. It works for ten minutes.</p>
  <p style="font-family:monospace;font-size:34px;letter-spacing:6px;margin:0 0 28px;padding:16px 20px;background:#121212;color:#fafafa;display:inline-block;">${spaced}</p>
  <p style="font-size:12px;color:#8a8a8a;margin:0;line-height:1.6;">
    If you didn't ask for this, ignore it. Nobody can sign in without the code.<br/>
    OpenTax, the deterministic tax engine for AI agents &middot; <a href="https://opentax.invaro.ai" style="color:#8a8a8a;">opentax.invaro.ai</a>
  </p>
</div>
</body></html>`,
  };
}

export function licenseWelcomeEmail(license: { id: string; seats: number; interval: "month" | "year"; firm?: string }): {
  html: string;
  text: string;
} {
  const seats = `${license.seats} seat${license.seats === 1 ? "" : "s"}, billed ${license.interval === "year" ? "yearly" : "monthly"}`;
  const text = [
    `Your OpenTax Firm plan is active${license.firm ? ` for ${license.firm}` : ""}.`,
    "",
    `Seats: ${seats}`,
    "",
    "Get set up:",
    "1. Open https://opentax.invaro.ai/account and sign in with this email address.",
    "2. Connect your agent: Claude, ChatGPT, Cursor or Claude Code. It takes about a minute, and the page walks you through it.",
    "3. Invite your staff from the same page.",
    "",
    "Questions? Reply to this email or write to support@invaro.ai from this address. We'll know your firm and plan, so just tell us what you need. An engineer answers within 24 hours.",
    "",
    "Terms: https://opentax.invaro.ai/license",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:40px 20px;background:#fafafa;font-family:Georgia,serif;color:#121212;">
<div style="max-width:520px;margin:0 auto;">
  <p style="font-family:monospace;font-size:12px;color:#6a6a6a;margin:0 0 24px;">&#10035; opentax &nbsp;&middot;&nbsp; by Invaro</p>
  <h1 style="font-size:28px;font-weight:normal;margin:0 0 16px;">Your Firm plan is active</h1>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 20px;">${license.firm ? `${escapeHtml(license.firm)}, ` : ""}${seats}.</p>
  <p style="margin:0 0 28px;"><a href="https://opentax.invaro.ai/account" style="display:inline-block;padding:12px 20px;background:#121212;color:#fafafa;font-family:Arial,sans-serif;font-size:14px;text-decoration:none;">Get set up</a></p>
  <ol style="font-size:15px;line-height:1.7;color:#444;padding-left:20px;margin:0 0 24px;">
    <li>Sign in at <a href="https://opentax.invaro.ai/account" style="color:#121212;">opentax.invaro.ai/account</a> with this address.</li>
    <li>Connect your agent: Claude, ChatGPT, Cursor or Claude Code. It takes about a minute, and the page walks you through it.</li>
    <li>Invite your staff from the same page.</li>
  </ol>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px;">Questions? Reply to this email or write to <a href="mailto:support@invaro.ai" style="color:#121212;">support@invaro.ai</a> from this address. We'll know your firm and plan, so just tell us what you need. An engineer answers within 24 hours.</p>
  <p style="font-size:12px;color:#8a8a8a;margin:0;line-height:1.6;">
    Terms: <a href="https://opentax.invaro.ai/license" style="color:#8a8a8a;">opentax.invaro.ai/license</a> &middot; seats, card and invoices: your account page.
  </p>
</div>
</body></html>`;
  return { html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function teamInviteEmail(firm: string, invitedBy: string, link: string): { html: string; text: string } {
  const text = [
    `${invitedBy} invited you to ${firm}'s OpenTax Firm plan.`,
    "",
    "OpenTax calculates US taxes exactly, with every line cited to the law, for Claude, ChatGPT and the other agents your firm uses.",
    "",
    `Accept the invite: ${link}`,
    "",
    "The link works once and expires in 7 days. You'll sign in with this email address to accept it.",
    "If you weren't expecting this, ignore it.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:40px 20px;background:#fafafa;font-family:Georgia,serif;color:#121212;">
<div style="max-width:520px;margin:0 auto;">
  <p style="font-family:monospace;font-size:12px;color:#6a6a6a;margin:0 0 24px;">&#10035; opentax &nbsp;&middot;&nbsp; by Invaro</p>
  <h1 style="font-size:28px;font-weight:normal;margin:0 0 16px;">Join ${escapeHtml(firm)} on OpenTax</h1>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 12px;">${escapeHtml(invitedBy)} invited you to their Firm plan.</p>
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 24px;">OpenTax calculates US taxes exactly, with every line cited to the law, for Claude, ChatGPT and the other agents your firm uses.</p>
  <p style="margin:0 0 28px;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;background:#121212;color:#fafafa;text-decoration:none;font-family:sans-serif;font-size:14px;">Accept the invite</a></p>
  <p style="font-size:12px;color:#8a8a8a;margin:0;line-height:1.6;">The link works once and expires in 7 days. You'll sign in with this email address to accept it. If you weren't expecting this, ignore it.</p>
</div>
</body></html>`;
  return { html, text };
}
