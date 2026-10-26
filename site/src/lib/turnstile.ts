/**
 * Cloudflare Turnstile on sign-in-code requests. Off until both keys are
 * set; once they are, every code request must carry a fresh challenge token
 * that Cloudflare confirms was solved on this site for this action.
 */
export function turnstileEnabled(): boolean {
  return !!(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: unknown, ip: string, action: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const j = (await res.json()) as { success?: boolean; action?: string; hostname?: string; metadata?: { result_with_testing_key?: boolean } };
    if (!j.success) return false;
    // Cloudflare's public test keys return no action or hostname; accept them only outside production
    if (j.metadata?.result_with_testing_key) return process.env.NODE_ENV !== "production";
    if (j.action !== action) return false;
    const host = process.env.SITE_URL ? new URL(process.env.SITE_URL).hostname : "opentax.invaro.ai";
    return process.env.NODE_ENV !== "production" || j.hostname === host;
  } catch {
    // Cloudflare unreachable: refuse rather than wave requests through
    return false;
  }
}
