/**
 * GET /api/cron/cleanup, run daily by Vercel Cron (vercel.json).
 *
 * Deletes sign-in records that have outlived their use: code challenges
 * (good for ten minutes) and code-request counters (an hour's window). Each
 * address someone types into the sign-in form leaves one of each, so without
 * this a script feeding it random addresses grows the store forever.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; with no secret set the
 * route refuses everything.
 */
import { timingSafeEqual } from "node:crypto";
import { del, list } from "@vercel/blob";

export const runtime = "nodejs";
export const maxDuration = 60;

const SWEEPS = [
  { prefix: "auth/otp/", olderThanMs: 3600_000 },
  { prefix: "auth/otp-rate/", olderThanMs: 2 * 3600_000 },
];
const MAX_PAGES = 20;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return new Response("not found", { status: 404 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ ok: true, deleted: 0, note: "no blob store" });
  const now = Date.now();
  let deleted = 0;
  let incomplete = false;
  for (const { prefix, olderThanMs } of SWEEPS) {
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list({ prefix, limit: 1000, cursor });
      const stale = page.blobs.filter((b) => now - new Date(b.uploadedAt).getTime() > olderThanMs).map((b) => b.url);
      for (let i = 0; i < stale.length; i += 100) await del(stale.slice(i, i + 100));
      deleted += stale.length;
      cursor = page.hasMore ? page.cursor : undefined;
      if (++pages >= MAX_PAGES && cursor) {
        incomplete = true;
        break;
      }
    } while (cursor);
  }
  console.log(JSON.stringify({ evt: "cron_cleanup", deleted, incomplete }));
  return Response.json({ ok: true, deleted, incomplete });
}
