import { createHash } from "node:crypto";
import Stripe from "stripe";
import {
  getProfile,
  licenseInForce,
  readJson,
  removeJson,
  setLicense,
  WriteConflict,
  writeJson,
  writeJsonIf,
  type License,
} from "@/lib/accounts";
import { licenseWelcomeEmail, sendMail } from "@/lib/mail";
import { reconcileSeats } from "@/lib/team";

/**
 * The Firm plan: a subscription for firms using OpenTax in their practice, sold per staff seat
 * through Stripe Checkout. Volume pricing: up to five seats are $9 each a
 * month; at six or more every seat is $5. Annual billing is eleven months.
 *
 * The Stripe account is shared with other Invaro products, so every object
 * this site creates carries metadata.app = "opentax" and the webhook ignores
 * anything without it. Checkout sessions never set client_reference_id: the
 * other products' webhooks read that field as their own org id.
 */

export type Interval = "month" | "year";

export const SEAT_PRICE_CENTS = { small: 900, large: 500 } as const;
export const VOLUME_THRESHOLD = 6;
export const MAX_SEATS = 500;

export function seatPriceCents(seats: number, interval: Interval): number {
  const monthly = seats >= VOLUME_THRESHOLD ? SEAT_PRICE_CENTS.large : SEAT_PRICE_CENTS.small;
  return interval === "year" ? monthly * 11 : monthly;
}

export function quoteCents(seats: number, interval: Interval): number {
  return seats * seatPriceCents(seats, interval);
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  client ??= new Stripe(key);
  return client;
}

export function priceId(interval: Interval): string {
  const id = interval === "year" ? process.env.STRIPE_PRICE_FIRM_ANNUAL : process.env.STRIPE_PRICE_FIRM_MONTHLY;
  if (!id) throw new Error(`the ${interval} price is not configured`);
  return id;
}

export { licenseInForce } from "@/lib/accounts";

/**
 * OTX-FIRM-XXXX-XXXX, unambiguous characters only, derived from the
 * subscription id. Stripe sends checkout.session.completed and
 * customer.subscription.created at the same moment; a random id let each
 * handler mint its own, so the welcome email and the account could show
 * different plan ids. Derived, every handler agrees.
 */
export function licenseIdFor(subscriptionId: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = createHash("sha256").update(`opentax-license|${subscriptionId}`).digest();
  const chars = [...bytes.subarray(0, 8)].map((b) => alphabet[b % alphabet.length]).join("");
  return `OTX-FIRM-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** True for the first caller only: concurrent webhooks must send one welcome email, not two. */
async function claimWelcome(subscriptionId: string): Promise<boolean> {
  try {
    await writeJsonIf(`billing/welcomed/${subscriptionId}.json`, { at: new Date().toISOString() }, { create: true });
    return true;
  } catch (err) {
    if (err instanceof WriteConflict) return false;
    throw err;
  }
}

/** current_period_end moved onto the subscription item in the 2025+ API versions. */
function periodEnd(sub: Stripe.Subscription): string | undefined {
  const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  const ts = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : undefined;
}

function customerMapPath(customerId: string): string {
  return `billing/customers/${customerId}.json`;
}

/** Which account owns a subscription: its metadata first, then the customer map. */
async function ownerEmail(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.opentax_email;
  if (fromMeta) return fromMeta;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const mapped = await readJson<{ email: string }>(customerMapPath(customerId));
  return mapped?.email ?? null;
}

export function isOpenTaxSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.app === "opentax";
}

/**
 * Bring an account's license in line with a Stripe subscription. Idempotent:
 * webhook retries and the success-page sync can both call it.
 */
export async function syncSubscription(sub: Stripe.Subscription, firm?: string): Promise<{ email: string; license: License } | null> {
  if (!isOpenTaxSubscription(sub)) return null;
  const email = await ownerEmail(sub);
  if (!email) {
    console.log(JSON.stringify({ evt: "billing_no_owner", sub: sub.id }));
    return null;
  }
  const fetchedAt = new Date().toISOString(); // taken first: everything below is slower
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const interval: Interval = item?.price.recurring?.interval === "year" ? "year" : "month";
  // the Stripe account is shared: only our own two prices count as a Firm plan,
  // whatever the metadata says (a subscription switched to another product's price is not one)
  const firmPrices = [process.env.STRIPE_PRICE_FIRM_MONTHLY, process.env.STRIPE_PRICE_FIRM_ANNUAL].filter(Boolean);
  const ourPrice =
    sub.items.data.length === 1 && !!item && firmPrices.includes(item.price.id) && (item.quantity ?? 0) >= 1;
  const existing = (await getProfile(email))?.license;
  const now = new Date().toISOString();
  // the firm name is typed into Checkout, which only checkout.session.completed
  // carries; it rides on the subscription's metadata so every later event has it
  firm = firm ?? (sub.metadata?.opentax_firm || undefined);
  const license: License = {
    id: existing?.subscriptionId === sub.id ? existing.id : (sub.metadata?.opentax_license ?? licenseIdFor(sub.id)),
    kind: "firm",
    status: ourPrice ? sub.status : "invalid_price",
    seats: item?.quantity ?? 1,
    interval,
    firm: firm ?? existing?.firm,
    customerId,
    subscriptionId: sub.id,
    currentPeriodEnd: periodEnd(sub),
    // Stripe's billing portal now schedules a cancellation with cancel_at and
    // leaves cancel_at_period_end false: either one means the plan is ending
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
    ...(sub.cancel_at != null ? { cancelAt: new Date(sub.cancel_at * 1000).toISOString() } : {}),
    ...(sub.ended_at != null ? { endedAt: new Date(sub.ended_at * 1000).toISOString() } : {}),
    startedAt: existing?.subscriptionId === sub.id ? existing.startedAt : new Date(sub.created * 1000).toISOString(),
    updatedAt: now,
    welcomedAt: existing?.subscriptionId === sub.id ? existing.welcomedAt : undefined,
    fetchedAt,
  };
  await writeJson(customerMapPath(customerId), { email });
  if (sub.metadata?.opentax_license !== license.id || (license.firm && sub.metadata?.opentax_firm !== license.firm)) {
    // the id rides on the subscription too, so it shows on Stripe invoices and survives a lost profile
    await stripe()
      .subscriptions.update(sub.id, {
        metadata: { ...sub.metadata, opentax_license: license.id, ...(license.firm ? { opentax_firm: license.firm } : {}) },
      })
      .catch(() => {});
  }
  if (licenseInForce(license) && !license.welcomedAt && (await claimWelcome(sub.id))) {
    const mail = licenseWelcomeEmail(license);
    const sent = await sendMail({ to: email, subject: `Your OpenTax Firm plan, ${license.id}`, ...mail }).catch(() => false);
    if (sent) license.welcomedAt = now;
    // a failed send gives the claim back, so the next event tries again
    else await removeJson(`billing/welcomed/${sub.id}.json`).catch(() => {});
  }
  await setLicense(email, license, licenseInForce(license));
  await reconcileSeats(email);
  console.log(JSON.stringify({ evt: "billing_license_synced", license: license.id, status: license.status, seats: license.seats }));
  return { email, license };
}

/**
 * The firm name typed into Checkout's custom field. It appears in invite
 * emails, so keep it to plain name characters: no links, no markup.
 */
export function firmFromSession(session: Stripe.Checkout.Session): string | undefined {
  const field = session.custom_fields?.find((f) => f.key === "firm");
  const value = (field?.text?.value ?? "")
    .replace(/https?:\/\/\S*|www\.\S*/gi, "")
    // bare domains ("paypal-security.help") become links in mail apps
    .replace(/\b[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*\.[\p{L}]{2,}\b/gu, "")
    .replace(/[^\p{L}\p{N} &.,'()\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return value || undefined;
}

/** Resolve a completed Checkout session into a license. */
export async function syncCheckoutSession(sessionId: string, buyer: string): Promise<{ email: string; license: License } | null> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.app !== "opentax" || session.mode !== "subscription" || !session.subscription) return null;
  if (session.metadata?.opentax_email !== buyer) return null;
  if (session.status !== "complete") return null;
  const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const sub = await stripe().subscriptions.retrieve(subId);
  return syncSubscription(sub, firmFromSession(session));
}
