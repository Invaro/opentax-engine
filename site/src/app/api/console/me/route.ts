/** GET /api/console/me → the signed-in account, its key, and 30-day usage. */
import { ensureAccount } from "@/lib/accounts";
import { sessionEmail } from "@/lib/session";
import { readUsage } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const email = sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  try {
    const [profile, usage] = await Promise.all([
      ensureAccount(email),
      readUsage(email, 30).catch(() => null),
    ]);
    return Response.json(
      {
        ok: true,
        account: { email: profile.email, plan: profile.plan, org: profile.org ?? null, createdAt: profile.createdAt },
        key: { value: profile.key, createdAt: profile.keyCreatedAt },
        usage,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return Response.json({ ok: false, error: `account store unavailable: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}
