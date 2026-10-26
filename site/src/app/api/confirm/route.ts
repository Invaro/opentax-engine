import { createHash } from "node:crypto";
import { WriteConflict, writeJsonIf } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyToken } from "@/lib/waitlist-token";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  if (!rateLimit(`confirm:ip:${clientIp(req)}`, 20, 3600 * 1000)) {
    return Response.redirect("https://opentax.invaro.ai/confirmed?ok=0", 302);
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const parsed = verifyToken(token);
  if (!parsed) {
    return Response.redirect("https://opentax.invaro.ai/confirmed?ok=0", 302);
  }
  // Runtime logs get a hash, not the address. The address lives only in Blob.
  const emailHash = createHash("sha256").update(parsed.email).digest("hex");
  try {
    // one record per address, created once: replaying the link writes nothing new
    await writeJsonIf(
      `signups/${emailHash}.json`,
      { email: parsed.email, confirmedAt: new Date().toISOString() },
      { create: true },
    );
  } catch (err) {
    if (!(err instanceof WriteConflict)) {
      console.log(JSON.stringify({ evt: "confirm_store_error", email: emailHash.slice(0, 12), err: String(err).slice(0, 200) }));
    }
  }
  console.log(JSON.stringify({ evt: "waitlist_confirmed", email: emailHash.slice(0, 12) }));
  return Response.redirect("https://opentax.invaro.ai/confirmed?ok=1", 302);
}
