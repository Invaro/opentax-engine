/**
 * GET /api/auth/session → { signedIn, email? } for pages that only need to
 * know who is here. With ?plan=1 it also says whether they're already on a
 * Firm plan, so pricing doesn't offer to sell them a second one.
 */
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sessionEmail } from "@/lib/session";
import { planAccess } from "@/lib/team";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  if (!rateLimit(`session:ip:${clientIp(req)}`, 120, 60 * 1000)) {
    return Response.json({ signedIn: false, error: "too many requests" }, { status: 429 });
  }
  const email = await sessionEmail(req);
  const wantPlan = new URL(req.url).searchParams.get("plan") === "1";
  const access = email && wantPlan ? await planAccess(email).catch(() => null) : null;
  const plan = access?.inForce ? { role: access.role, firm: access.license.firm ?? null } : null;
  return Response.json(
    { signedIn: !!email, email: email ?? undefined, plan },
    { headers: { "Cache-Control": "no-store" } },
  );
}
