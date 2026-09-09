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
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "OpenTax by Invaro <updates@mail.invaro.ai>",
      reply_to: "founders@invaro.ai",
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
  <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 20px;">Enter this in the console. It works for ten minutes.</p>
  <p style="font-family:monospace;font-size:34px;letter-spacing:6px;margin:0 0 28px;padding:16px 20px;background:#121212;color:#fafafa;display:inline-block;">${spaced}</p>
  <p style="font-size:12px;color:#8a8a8a;margin:0;line-height:1.6;">
    If you didn't ask for this, ignore it. Nobody can sign in without the code.<br/>
    OpenTax, the deterministic tax engine for AI agents &middot; <a href="https://opentax.invaro.ai" style="color:#8a8a8a;">opentax.invaro.ai</a>
  </p>
</div>
</body></html>`,
  };
}
