/** POST /api/auth/signout-all — ends every session for this account, on every device. */
import { bumpSessionEpoch } from "@/lib/accounts";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { clearSessionCookie, sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  await bumpSessionEpoch(email);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}
