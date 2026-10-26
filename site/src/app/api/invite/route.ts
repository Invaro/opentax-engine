/** GET /api/invite?token=… → { ok, firm, email } for the accept page. */
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { lookupInvite } from "@/lib/team";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  if (!rateLimit(`invite-lookup:${clientIp(req)}`, 30, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests" }, { status: 429 });
  }
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return Response.json({ ok: false, error: "invalid invite link" }, { status: 400 });
  const invite = await lookupInvite(token);
  if (!invite) return Response.json({ ok: false, error: "this invite has expired or was cancelled" }, { status: 404 });
  return Response.json({ ok: true, ...invite }, { headers: { "Cache-Control": "no-store" } });
}
