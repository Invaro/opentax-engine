/**
 * In-memory sliding-window rate limiter.
 *
 * Per-instance by design: state lives in the function instance, so a cold
 * start resets it and concurrent instances each get their own budget. That
 * still hard-caps what any single instance can spend (emails, blob writes)
 * and stops scripted abuse without adding a datastore dependency.
 */
const buckets = new Map<string, number[]>();

/** Returns true if the call is allowed, false if the key is over budget. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

/** First hop of x-forwarded-for, set by Vercel's edge proxy on every request. */
export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
}
