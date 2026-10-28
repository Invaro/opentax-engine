/** GET /api/console/me → the signed-in account's API key hint and 30-day usage. */
import { rateLimit } from "@/lib/rate-limit";
import { sessionProfile } from "@/lib/session";
import { readUsage } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const profile = await sessionProfile(req);
  if (!profile) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  // usage reads list blobs, so a script looping on this page is capped
  if (!rateLimit(`me:${profile.email}`, 60, 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again in a minute" }, { status: 429 });
  }
  try {
    const usage = await readUsage(profile.email, 30).catch(() => null);
    return Response.json(
      {
        ok: true,
        account: { email: profile.email, plan: profile.plan, org: profile.org ?? null, createdAt: profile.createdAt },
        key: profile.keyHint ? { hint: profile.keyHint, createdAt: profile.keyCreatedAt } : null,
        usage,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "account store unavailable, try again" }, { status: 502 });
  }
}
