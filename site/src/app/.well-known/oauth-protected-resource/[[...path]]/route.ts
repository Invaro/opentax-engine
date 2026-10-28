/**
 * OAuth protected-resource metadata (RFC 9728) for the signed-in connector.
 * MCP clients read it at /.well-known/oauth-protected-resource/mcp/account
 * after a 401, then sign the person in through the server it names.
 */
import { MCP_ACCOUNT_PATH, oauthOrigin } from "@/lib/oauth";

export const runtime = "nodejs";

export function GET(req: Request): Response {
  const origin = oauthOrigin(req);
  return Response.json(
    {
      resource: `${origin}${MCP_ACCOUNT_PATH}`,
      authorization_servers: [origin],
      bearer_methods_supported: ["header"],
      scopes_supported: ["opentax"],
      resource_name: "OpenTax",
      resource_documentation: `${origin}/docs/mcp`,
    },
    { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } },
  );
}
