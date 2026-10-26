/**
 * POST /api/billing/checkout { seats, interval } → { ok, url }
 * Opens Stripe Checkout for the Firm plan. The buyer must be signed in; the
 * plan is attached to that account, and Checkout's email is locked to it.
 */
import { getProfile, updateProfile } from "@/lib/accounts";
import { MAX_SEATS, priceId, stripe, type Interval } from "@/lib/billing";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin, siteOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";
import { planAccess } from "@/lib/team";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "sign in first", signIn: true }, { status: 401 });
  if (!rateLimit(`checkout:ip:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again in a few minutes" }, { status: 429 });
  }
  let body: { seats?: number; interval?: string };
  try {
    const raw = await req.text();
    if (raw.length > 1024) return Response.json({ ok: false, error: "body too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const seats = Number(body.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return Response.json({ ok: false, error: `seats must be between 1 and ${MAX_SEATS}` }, { status: 400 });
  }
  const interval: Interval = body.interval === "year" ? "year" : "month";

  const access = await planAccess(email);
  if (access?.inForce) {
    return Response.json(
      {
        ok: false,
        error:
          access.role === "owner"
            ? "you already have a Firm plan; change seats from your account"
            : `you're already on ${access.license.firm ?? "a firm"}'s plan`,
      },
      { status: 409 },
    );
  }
  // one Stripe customer per account, created before Checkout: a second tab or a
  // returning buyer lands on the same customer, so every subscription and
  // invoice shows up together in the billing portal
  const profile = await getProfile(email);
  let customer = profile?.stripeCustomerId ?? profile?.license?.customerId;
  if (!customer) {
    try {
      const created = await stripe().customers.create({ email, metadata: { app: "opentax", opentax_email: email } });
      customer = created.id;
      await updateProfile(email, (p) => (p.stripeCustomerId ? undefined : { ...p, stripeCustomerId: created.id }));
      customer = (await getProfile(email))?.stripeCustomerId ?? created.id;
    } catch {
      return Response.json({ ok: false, error: "checkout is unavailable right now, email support@invaro.ai" }, { status: 502 });
    }
  }

  const origin = siteOrigin(req);
  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [
        { price: priceId(interval), quantity: seats, adjustable_quantity: { enabled: true, minimum: 1, maximum: MAX_SEATS } },
      ],
      customer,
      customer_update: { name: "auto", address: "auto" },
      // prices are in USD as the pricing page says; Stripe's local-currency
      // conversion would show another price and add a fee
      adaptive_pricing: { enabled: false },
      // the Stripe account is shared with other Invaro products: name this checkout for OpenTax
      branding_settings: { display_name: "OpenTax by Invaro", button_color: "#121212", border_style: "rectangular" },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      // a returning firm doesn't type its name twice
      custom_fields: [
        {
          key: "firm",
          label: { type: "custom", custom: "Firm name" },
          type: "text",
          ...(profile?.license?.firm ? { text: { default_value: profile.license.firm } } : {}),
        },
      ],
      custom_text: {
        submit: { message: "Subscribing accepts the OpenTax Firm plan terms at opentax.invaro.ai/license. Change seats or cancel any time from your account." },
      },
      metadata: { app: "opentax", license: "firm", opentax_email: email },
      subscription_data: {
        description: "OpenTax Firm plan",
        metadata: { app: "opentax", license: "firm", opentax_email: email },
      },
      success_url: `${origin}/account?checkout=done&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing?seats=${seats}&interval=${interval}`,
    });
    console.log(JSON.stringify({ evt: "billing_checkout_created", seats, interval }));
    return Response.json({ ok: true, url: session.url });
  } catch {
    console.log(JSON.stringify({ evt: "billing_checkout_failed" }));
    return Response.json({ ok: false, error: "checkout is unavailable right now, email support@invaro.ai" }, { status: 502 });
  }
}
