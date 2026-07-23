import { createHash } from "node:crypto";
import { put } from "@vercel/blob";
import { verifyToken } from "@/lib/waitlist-token";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const parsed = verifyToken(token);
  if (!parsed) {
    return Response.redirect("https://opentax.invaro.ai/confirmed?ok=0", 302);
  }
  const record = { email: parsed.email, confirmedAt: new Date().toISOString() };
  // Runtime logs get a hash, not the address — the address lives only in Blob.
  const emailHash = createHash("sha256").update(parsed.email).digest("hex").slice(0, 12);
  try {
    await put(
      `signups/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
      JSON.stringify(record),
      { access: "private", contentType: "application/json" },
    );
  } catch (err) {
    console.log(JSON.stringify({ evt: "confirm_store_error", email: emailHash, err: String(err) }));
  }
  console.log(JSON.stringify({ evt: "waitlist_confirmed", email: emailHash }));
  return Response.redirect("https://opentax.invaro.ai/confirmed?ok=1", 302);
}
