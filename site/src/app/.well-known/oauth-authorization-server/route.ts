/** OAuth authorization server metadata (RFC 8414) for MCP clients' sign-in. */
import { oauthOrigin } from "@/lib/oauth";

export const runtime = "nodejs";

export function GET(req: Request): Response {
  const origin = oauthOrigin(req);
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["opentax"],
      service_documentation: `${origin}/docs/mcp`,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
