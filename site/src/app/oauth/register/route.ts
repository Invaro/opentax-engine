/** Dynamic client registration (RFC 7591): an AI app registers before it asks the person to sign in. */
import { registerClient } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`oauth:register:${clientIp(req)}`, 20, 3600 * 1000)) {
    return Response.json({ error: "slow_down", error_description: "too many registrations" }, { status: 429, headers: CORS });
  }
  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 8192) throw new Error("too large");
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_client_metadata", error_description: "send JSON" }, { status: 400, headers: CORS });
  }
  const client = await registerClient(body);
  if ("error" in client) {
    return Response.json({ error: "invalid_redirect_uri", error_description: client.error }, { status: 400, headers: CORS });
  }
  return Response.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(Date.parse(client.createdAt) / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "opentax",
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
