/**
 * The signed-in MCP connector at https://<site>/mcp/account. The AI app gets a
 * 401 that points to OAuth discovery, the person signs in with their OpenTax
 * email, and every call afterwards knows the account and whether it's on a
 * Firm plan. An API key works here too, for scripts.
 */
import { CORS_HEADERS, handleMcp } from "@/lib/mcp-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request): Promise<Response> {
  return handleMcp(req, "account");
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS_HEADERS } });
}
