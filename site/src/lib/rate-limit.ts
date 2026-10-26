/**
 * In-memory sliding-window rate limiter.
 *
 * Per-instance by design: state lives in the function instance, so a cold
 * start resets it and concurrent instances each get their own budget. That
 * still hard-caps what any single instance can spend (emails, blob writes,
 * engine CPU) and stops scripted abuse without adding a datastore dependency.
 * Limits that must hold across instances are stored in Blob instead (see
 * lib/otp.ts and the invite allowance in lib/team.ts).
 *
 * The bucket map is bounded: past MAX_KEYS it drops expired buckets, then
 * the oldest-touched ones, so a flood of distinct keys can't grow memory or
 * make every call scan an ever-larger map.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 20_000;

function prune(now: number, windowMs: number): void {
  for (const [k, v] of buckets) {
    if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  // still too many live keys: evict the least recently touched (Map keeps insertion order)
  const excess = buckets.size - MAX_KEYS * 0.8;
  if (excess > 0) {
    let n = 0;
    for (const k of buckets.keys()) {
      if (n++ >= excess) break;
      buckets.delete(k);
    }
  }
}

/** Spend `units` of a key's budget; true if allowed, false if the key is over budget. */
export function rateLimit(key: string, limit: number, windowMs: number, units = 1): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.delete(key); // re-inserted below, so the map's order tracks recency
  if (hits.length + units > limit) {
    buckets.set(key, hits);
    return false;
  }
  for (let i = 0; i < units; i++) hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) prune(now, windowMs);
  return true;
}

/**
 * The caller's IP. Vercel sets x-real-ip itself and overwrites anything a
 * client sends in it; x-forwarded-for's first hop is the fallback for local
 * development. Behind any other proxy, set that proxy to overwrite these.
 *
 * IPv6 addresses are reduced to their /64: one subscriber usually holds a
 * whole /64, so keying on the full address would hand them 2^64 budgets.
 */
export function clientIp(req: Request): string {
  const ip =
    req.headers.get("x-real-ip")?.trim() ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ||
    "unknown";
  if (!ip.includes(":")) return ip;
  const full = expandIpv6(ip);
  return full ? `${full.slice(0, 4).join(":")}::/64` : ip;
}

function expandIpv6(ip: string): string[] | null {
  const addr = ip.replace(/^\[|\]$/g, "").split("%")[0];
  const [head, tail] = addr.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  if (addr.includes("::")) {
    const fill = 8 - h.length - t.length;
    if (fill < 0) return null;
    return [...h, ...Array(fill).fill("0"), ...t];
  }
  return h.length === 8 ? h : null;
}

/**
 * Rate units a tool call costs. Every call is one unit, as it always was,
 * except the two that do far more work: a cliff scan runs up to 4,000
 * evaluations, and a full proof is about twenty times the usual response.
 */
export function callCost(tool: string | undefined, args: unknown): number {
  if (tool === "find_tax_cliffs") return 20;
  const a = (args ?? {}) as { includeProof?: unknown };
  return a.includeProof === true ? 2 : 1;
}
