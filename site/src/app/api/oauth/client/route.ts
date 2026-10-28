/**
 * GET /api/oauth/client?client_id=…&redirect_uri=… → what the consent page
 * shows: the app's name, and who is signed in with which plan.
 */
import { getClient } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sessionEmail } from "@/lib/session";
import { planAccess } from "@/lib/team";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  if (!rateLimit(`oauth:client:${clientIp(req)}`, 60, 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests" }, { status: 429 });
  }
  const q = new URL(req.url).searchParams;
  const client = await getClient(q.get("client_id"));
  if (!client || !client.redirectUris.includes(q.get("redirect_uri") ?? "")) {
    return Response.json({ ok: false, error: "This sign-in link isn't valid. Start again from your agent." }, { status: 400 });
  }
  const email = await sessionEmail(req);
  const access = email ? await planAccess(email).catch(() => null) : null;
  return Response.json(
    {
      ok: true,
      clientName: client.name,
      redirectHost: new URL(q.get("redirect_uri")!).host,
      email,
      plan: access?.inForce ? { firm: access.license.firm ?? null, role: access.role } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
