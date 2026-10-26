/** POST /api/auth/signout — ends this browser's session, on the server too, so a copied cookie stops working. */
import { removeSession } from "@/lib/accounts";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { clearSessionCookie, readToken } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const token = readToken(req);
  if (token) await removeSession(token.email, token.sid).catch(() => {});
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}
