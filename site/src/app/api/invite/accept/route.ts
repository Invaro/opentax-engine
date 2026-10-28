/** POST /api/invite/accept { token } → joins the signed-in account to the inviting firm's plan. */
import { sha256 } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";
import { acceptInvite } from "@/lib/team";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "sign in to accept" }, { status: 401 });
  if (!rateLimit(`invite-accept:${clientIp(req)}`, 20, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many requests" }, { status: 429 });
  }
  let token = "";
  try {
    token = String(((await req.json()) as { token?: string }).token ?? "");
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return Response.json({ ok: false, error: "invalid invite link" }, { status: 400 });
  const result = await acceptInvite(email, token);
  console.log(JSON.stringify({ evt: "invite_accept", ok: result.ok, email: sha256(email).slice(0, 12) }));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
