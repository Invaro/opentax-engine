/** POST /api/account/connections { clientId } → disconnect an AI app from this account; its tokens stop working. */
import { disconnect } from "@/lib/oauth";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  let clientId = "";
  try {
    const raw = await req.text();
    if (raw.length > 1024) throw new Error("too large");
    clientId = String((JSON.parse(raw) as { clientId?: unknown }).clientId ?? "");
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!/^otc_[A-Za-z0-9_-]{20,40}$/.test(clientId)) return Response.json({ ok: false, error: "unknown app" }, { status: 400 });
  await disconnect(email, clientId);
  return Response.json({ ok: true });
}
