/**
 * POST /api/billing/sync { sessionId } → { ok }
 * Called by the account page on return from Checkout so the plan shows up
 * without waiting for the webhook. It only reads Stripe's own record of the
 * session, and only for the signed-in buyer.
 */
import { syncCheckoutSession } from "@/lib/billing";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  if (!rateLimit(`billing-sync:ip:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests" }, { status: 429 });
  }
  let sessionId = "";
  try {
    sessionId = String(((await req.json()) as { sessionId?: string }).sessionId ?? "");
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!/^cs_(live|test)_[A-Za-z0-9]{10,200}$/.test(sessionId)) {
    return Response.json({ ok: false, error: "unknown checkout session" }, { status: 400 });
  }
  try {
    const result = await syncCheckoutSession(sessionId, email);
    if (!result) return Response.json({ ok: false, error: "that checkout is not complete yet" }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "could not confirm the payment yet, refresh in a minute" }, { status: 502 });
  }
}
