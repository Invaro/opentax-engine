/** POST /api/account/key → a new API key, shown once. Replaces the previous key, which stops working within five minutes. */
import { issueKey, sha256 } from "@/lib/accounts";
import { rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  if (!rateLimit(`key:${email}`, 5, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many new keys this hour" }, { status: 429 });
  }
  try {
    const { profile, key } = await issueKey(email);
    console.log(JSON.stringify({ evt: "api_key_issued", email: sha256(email).slice(0, 12) }));
    return Response.json(
      { ok: true, key, hint: profile.keyHint, createdAt: profile.keyCreatedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, error: "could not create a key, try again" }, { status: 502 });
  }
}
