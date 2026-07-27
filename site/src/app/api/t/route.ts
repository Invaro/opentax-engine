import { put } from "@vercel/blob";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Anonymous telemetry sink for the CLI / stdio server (disclosed, opt-out via
 * OPENTAX_TELEMETRY=0 client-side). No PII: event name, version, platform.
 *
 * Abuse posture: always 204 (the pinging CLI never cares), but blob writes are
 * budgeted per IP and per instance. Over budget we log to stdout only, so an
 * anonymous flood can't run up storage.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const raw = await req.text();
    if (raw.length > 1024) return new Response(null, { status: 204 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const record = {
      e: String(body.e ?? "unknown").slice(0, 40),
      v: String(body.v ?? "").slice(0, 20),
      os: String(body.os ?? "").slice(0, 20),
      node: String(body.node ?? "").slice(0, 20),
      at: new Date().toISOString(),
    };
    console.log(JSON.stringify({ evt: "telemetry", ...record }));
    const withinBudget =
      rateLimit(`t:ip:${clientIp(req)}`, 6, 3600 * 1000) && rateLimit("t:all", 120, 3600 * 1000);
    if (withinBudget) {
      await put(
        `telemetry/${record.at.slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
        JSON.stringify(record),
        { access: "private", contentType: "application/json" },
      ).catch(() => {});
    }
  } catch {
    /* never fail the caller */
  }
  return new Response(null, { status: 204 });
}
