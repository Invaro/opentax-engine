/**
 * Remote MCP connector endpoint at https://<site>/mcp
 *
 * Streamable HTTP (MCP spec 2025-03-26), stateless: every POST gets a fresh
 * server + transport, so the function scales horizontally with no session
 * affinity. Add this URL as a custom connector in Claude.ai, ChatGPT, Cursor,
 * or `claude mcp add --transport http opentax <url>`.
 *
 * Authentication is optional: `Authorization: Bearer otx_…` (a key from
 * /console, or one issued through OPENTAX_API_KEYS) attributes usage to the
 * account and raises the rate budget; an unknown key is refused; no key is
 * anonymous. Keys are never logged. See src/lib/accounts.ts.
 */

import { after } from "next/server";
import { resolveApiKey, type Account } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountFields, returnIdHash, writeUsage } from "@/lib/usage";
import {
  createServer,
  WebStandardStreamableHTTPServerTransport,
} from "@/lib/opentax-mcp.bundle.mjs";

type RpcPeek = {
  method?: string;
  params?: { name?: string; clientInfo?: { name?: string; version?: string } };
};

function logUsage(req: Request, account?: Account): void {
  const clone = req.clone();
  const ip = clientIp(req);
  const ret = returnIdHash(req);
  after(async () => {
    try {
      const rpc = (await clone.json()) as RpcPeek | RpcPeek[];
      const first = Array.isArray(rpc) ? rpc[0] : rpc;
      if (!first?.method) return;
      // the tool ARGUMENTS are never read here, so no taxpayer data reaches the log
      await writeUsage(
        {
          evt: "mcp",
          method: first.method,
          tool: first.method === "tools/call" ? (first.params?.name ?? "") : "",
          client: first.method === "initialize" ? (first.params?.clientInfo?.name ?? "") : "",
          clientVersion: first.method === "initialize" ? (first.params?.clientInfo?.version ?? "") : "",
          ...accountFields(account),
          ret,
          at: new Date().toISOString(),
        },
        ip,
      );
    } catch {
      /* observability must never break the endpoint */
    }
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, X-OpenTax-Return-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export async function POST(req: Request): Promise<Response> {
  const auth = await resolveApiKey(req);
  if (auth.status === "unknown") {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unknown API key" } }), { status: 401, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
  }
  const budgetKey = auth.status === "ok" ? `mcp:key:${auth.keyId}` : `mcp:ip:${clientIp(req)}`;
  const budget = auth.status === "ok" ? 6000 : 600; // requests per hour per instance
  if (!rateLimit(budgetKey, budget, 3600 * 1000)) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "rate limit exceeded" } }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60", ...CORS_HEADERS } });
  }
  logUsage(req, auth.status === "ok" ? auth.account : undefined);
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport as never);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function GET(): Response {
  // stateless mode: no SSE notification stream, no sessions
  return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS_HEADERS } });
}
