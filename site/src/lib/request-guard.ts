/**
 * Cross-site request checks for state-changing routes. The session cookie is
 * SameSite=Lax, which already keeps it off cross-site POSTs; this is the
 * second lock: browsers always send Origin on POST, and it must be ours.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function forbidden(): Response {
  return Response.json({ ok: false, error: "cross-site request refused" }, { status: 403 });
}

/** Only same-origin destinations, judged by URL parsing (which normalizes "/\t/evil.com" to "//evil.com"). */
export function safeNext(raw: string | null | undefined, fallback = "/account"): string {
  try {
    const base = "https://opentax.invaro.ai";
    const u = new URL(String(raw ?? ""), base);
    if (u.origin !== base || String(raw ?? "").length > 300) return fallback;
    // collapse a leading "//" so the result can never be read as protocol-relative
    return u.pathname.replace(/^\/+/, "/") + u.search + u.hash;
  } catch {
    return fallback;
  }
}

/**
 * The address used in links we send out (invite emails, Stripe redirects).
 * Fixed in production, so a preview or vercel.app host never ends up in an
 * email; the request's own origin only in local development.
 */
export function siteOrigin(req: Request): string {
  if (process.env.NODE_ENV === "production") return process.env.SITE_URL || "https://opentax.invaro.ai";
  return new URL(req.url).origin;
}
