/** GET /api/account/invoices → the plan owner's Stripe invoices, newest first, with links to view and download them. */
import { getProfile } from "@/lib/accounts";
import { stripe } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";
import { sessionEmail } from "@/lib/session";

/**
 * Stripe's rate limit is shared with every Invaro product on the account, so
 * invoice lists are cached briefly and each account's requests are capped.
 */
const cache = new Map<string, { at: number; invoices: unknown[] }>();

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  const license = (await getProfile(email))?.license;
  if (!license) return Response.json({ ok: true, invoices: [] }, { headers: { "Cache-Control": "no-store" } });
  const hit = cache.get(license.customerId);
  if (hit && Date.now() - hit.at < 60_000) {
    return Response.json({ ok: true, invoices: hit.invoices }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!rateLimit(`invoices:${email}`, 20, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again later" }, { status: 429 });
  }
  try {
    const list = await stripe().invoices.list({ customer: license.customerId, limit: 24 });
    const invoices = list.data
      .filter((i) => i.status !== "draft")
      .map((i) => ({
        number: i.number,
        date: new Date(i.created * 1000).toISOString(),
        total: i.total,
        currency: i.currency,
        status: i.status,
        url: i.hosted_invoice_url ?? null,
        pdf: i.invoice_pdf ?? null,
      }));
    cache.set(license.customerId, { at: Date.now(), invoices });
    if (cache.size > 1_000) cache.clear();
    return Response.json({ ok: true, invoices }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "invoices are unavailable right now" }, { status: 502 });
  }
}
