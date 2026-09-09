import { clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookie() },
  });
}
