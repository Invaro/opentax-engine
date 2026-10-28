/** GET /api/account → the signed-in account: its Firm plan (as owner or member), team, invites and releases. */
import { listReleases } from "@/lib/releases";
import { rateLimit } from "@/lib/rate-limit";
import { sessionProfile } from "@/lib/session";
import { planAccess } from "@/lib/team";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const profile = await sessionProfile(req);
  if (!profile) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  const email = profile.email;
  if (!rateLimit(`account:${email}`, 60, 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests, try again in a minute" }, { status: 429 });
  }
  try {
    const access = await planAccess(email);
    const releases = access?.inForce ? await listReleases().catch(() => []) : [];
    const l = access?.license;
    return Response.json(
      {
        ok: true,
        email,
        createdAt: profile.createdAt,
        hasKey: !!profile.keyId,
        connections: (profile.connections ?? []).map(({ clientId, name, connectedAt, lastUsedAt }) => ({
          clientId,
          name,
          connectedAt,
          lastUsedAt: lastUsedAt ?? null,
        })),
        plan: access && l
          ? {
              id: l.id,
              status: l.status,
              inForce: access.inForce,
              seats: l.seats,
              interval: l.interval,
              firm: l.firm ?? null,
              currentPeriodEnd: l.currentPeriodEnd ?? null,
              cancelAtPeriodEnd: l.cancelAtPeriodEnd,
              cancelAt: l.cancelAt ?? null,
              endedAt: l.endedAt ?? null,
              role: access.role,
              owner: access.owner,
              seatsUsed: access.seatsUsed,
              team: access.team,
              invites: access.invites,
              overSeat: access.overSeat,
            }
          : null,
        releases,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "account store unavailable, try again" }, { status: 502 });
  }
}
