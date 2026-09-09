/** POST /api/console/rotate → a new key; the old one stops working within five minutes. */
import { rotateKey, sha256 } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const email = sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  if (!rateLimit(`rotate:${clientIp(req)}`, 5, 3600 * 1000)) {
    return Response.json({ ok: false, error: "too many rotations this hour" }, { status: 429 });
  }
  try {
    const profile = await rotateKey(email);
    console.log(JSON.stringify({ evt: "console_key_rotated", email: sha256(email).slice(0, 12) }));
    return Response.json({ ok: true, key: { value: profile.key, createdAt: profile.keyCreatedAt } });
  } catch (err) {
    return Response.json({ ok: false, error: `could not rotate: ${String(err).slice(0, 120)}` }, { status: 502 });
  }
}
