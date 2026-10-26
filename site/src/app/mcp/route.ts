/**
 * Remote MCP connector at https://<site>/mcp: open to everyone, an API key is
 * optional. Firms connect /mcp/account instead, which signs them in. The
 * shared handler is src/lib/mcp-handler.ts.
 */
import { CORS_HEADERS, handleMcp } from "@/lib/mcp-handler";

export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(req: Request): Promise<Response> {
  return handleMcp(req, "open");
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET(): Response {
  // stateless mode: no SSE notification stream, no sessions
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS_HEADERS } });
}
