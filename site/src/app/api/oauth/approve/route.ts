/**
 * POST /api/oauth/approve { client_id, redirect_uri, code_challenge, state?, resource? }
 * The signed-in person allowed the app: a one-time code goes back to the app's redirect.
 */
import { getClient, issueCode, MCP_ACCOUNT_PATH, oauthOrigin } from "@/lib/oauth";
import { forbidden, sameOrigin } from "@/lib/request-guard";
import { sessionEmail } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return forbidden();
  const email = await sessionEmail(req);
  if (!email) return Response.json({ ok: false, error: "sign in first" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) throw new Error("too large");
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const client = await getClient(body.client_id);
  const redirectUri = String(body.redirect_uri ?? "");
  if (!client || !client.redirectUris.includes(redirectUri)) {
    return Response.json({ ok: false, error: "This sign-in link isn't valid. Start again from your agent." }, { status: 400 });
  }
  const challenge = String(body.code_challenge ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || (body.code_challenge_method ?? "S256") !== "S256") {
    return Response.json({ ok: false, error: "This app didn't send a valid PKCE challenge." }, { status: 400 });
  }
  // a token is only for this connector: refuse a request naming another resource
  const resource = body.resource ? String(body.resource) : "";
  if (resource && resource.replace(/\/$/, "") !== `${oauthOrigin(req)}${MCP_ACCOUNT_PATH}`) {
    return Response.json({ ok: false, error: "This app asked for access to something else." }, { status: 400 });
  }
  const code = await issueCode(client, email, redirectUri, challenge);
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (typeof body.state === "string" && body.state) url.searchParams.set("state", body.state.slice(0, 500));
  url.searchParams.set("iss", oauthOrigin(req));
  console.log(JSON.stringify({ evt: "oauth_approved", client: client.clientId.slice(0, 12) }));
  return Response.json({ ok: true, url: url.toString() });
}
