/** POST /api/billing/portal → { ok, url } — Stripe's billing portal, for the plan owner only. */
import { getProfile } from "@/lib/accounts";
import { stripe } from "@/lib/billing";
import { forbidden, sameOrigin, siteOrigin } from "@/lib/request-guard";
import { rateLimit } from "@/lib/rate-limit";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  if (!rateLimit(`portal:${email}`, 10, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again later" }, { status: 429 });
  }
  const license = (await getProfile(email))?.license;
  // never fall back to the account's default portal: it may offer other products' prices
  const configuration = process.env.STRIPE_PORTAL_CONFIG;
  if (!configuration) return Response.json({ ok: false, error: "billing is unavailable right now, email support@invaro.ai" }, { status: 503 });
  if (!license) return Response.json({ ok: false, error: "only the plan owner can manage billing" }, { status: 403 });
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: license.customerId,
      configuration,
      return_url: `${siteOrigin(req)}/account`,
    });
    return Response.json({ ok: true, url: portal.url });
  } catch {
    console.log(JSON.stringify({ evt: "billing_portal_failed" }));
    return Response.json({ ok: false, error: "billing is unavailable right now, email support@invaro.ai" }, { status: 502 });
  }
}
