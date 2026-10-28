/**
 * POST /api/account/team { action: "invite" | "resend" | "cancel" | "remove", email } → { ok }
 * Owner-only team management for the Firm plan.
 */
import { getProfile, normalizeEmail } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { forbidden, sameOrigin, siteOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";
import { cancelInvite, inviteMember, removeMember, resendInvite } from "@/lib/team";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const owner = await sessionEmail(req);
  if (!owner) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  if (!rateLimit(`team:${owner}`, 30, 10 * 60 * 1000)) {
    return Response.json({ ok: false, error: "too many changes, try again in a few minutes" }, { status: 429 });
  }
  let body: { action?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const email = normalizeEmail(body.email);
  if (!email) return Response.json({ ok: false, error: "enter a valid email" }, { status: 400 });
  if (!(await getProfile(owner))?.license) {
    return Response.json({ ok: false, error: "only the plan owner can manage the team" }, { status: 403 });
  }
  const origin = siteOrigin(req);
  const result =
    body.action === "invite"
      ? await inviteMember(owner, email, origin)
      : body.action === "resend"
        ? await resendInvite(owner, email, origin)
        : body.action === "cancel"
          ? await cancelInvite(owner, email)
          : body.action === "remove"
            ? await removeMember(owner, email)
            : { ok: false as const, error: "unknown action" };
  console.log(JSON.stringify({ evt: "team_change", action: body.action, ok: result.ok }));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
