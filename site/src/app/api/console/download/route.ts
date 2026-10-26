/** GET /api/console/download?tag=…&file=… — a release tarball, for anyone on a Firm plan in force. */
import { sha256 } from "@/lib/accounts";
import { openReleaseFile } from "@/lib/releases";
import { sessionEmail } from "@/lib/session";
import { planAccess } from "@/lib/team";

export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "signed out" }, { status: 401 });
  const access = await planAccess(email);
  if (!access?.inForce) return Response.json({ ok: false, error: "releases come with the Firm plan" }, { status: 403 });
  const url = new URL(req.url);
  const tag = url.searchParams.get("tag") ?? "";
  const file = url.searchParams.get("file") ?? "";
  if (!/^v[0-9][0-9A-Za-z.\-]{0,40}$/.test(tag) || !/^[a-z0-9.\-]{1,100}\.tgz$/.test(file)) {
    return Response.json({ ok: false, error: "bad release name" }, { status: 400 });
  }
  const stream = await openReleaseFile(tag, file);
  if (!stream) return Response.json({ ok: false, error: "no such release file" }, { status: 404 });
  console.log(JSON.stringify({ evt: "release_download", plan: access.license.id, who: sha256(email).slice(0, 12), tag, file }));
  return new Response(stream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
