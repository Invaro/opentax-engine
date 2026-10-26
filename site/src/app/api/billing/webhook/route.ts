/**
 * POST /api/billing/webhook — Stripe events for Firm plan subscriptions.
 * The Stripe account is shared with other Invaro products, so anything not
 * tagged metadata.app = "opentax" is acknowledged and ignored.
 */
import type Stripe from "stripe";
import { firmFromSession, isOpenTaxSubscription, stripe, syncSubscription } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "not configured" }, { status: 500 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.metadata?.app !== "opentax" || session.mode !== "subscription" || !session.subscription) break;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        await syncSubscription(await stripe().subscriptions.retrieve(subId), firmFromSession(session));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        if (!isOpenTaxSubscription(event.data.object)) break;
        // re-read: events can arrive out of order, the live object cannot
        const sub = await stripe().subscriptions.retrieve(event.data.object.id);
        await syncSubscription(sub);
        break;
      }
      case "invoice.payment_failed": {
        const details = event.data.object.parent?.subscription_details;
        // filter on the snapshot's metadata first: other products' failures cost no Stripe call
        if (details?.metadata?.app !== "opentax") break;
        const subId = details.subscription;
        if (!subId) break;
        const sub = await stripe().subscriptions.retrieve(typeof subId === "string" ? subId : subId.id);
        if (isOpenTaxSubscription(sub)) await syncSubscription(sub);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.log(JSON.stringify({ evt: "billing_webhook_failed", type: event.type, error: String(err).slice(0, 200) }));
    // 500 makes Stripe retry with backoff
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
  return Response.json({ received: true });
}
