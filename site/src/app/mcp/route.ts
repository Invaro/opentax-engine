/**
 * Remote MCP connector endpoint at https://<site>/mcp
 *
 * Streamable HTTP (MCP spec 2025-03-26), stateless: every POST gets a fresh
 * server + transport, so the function scales horizontally with no session
 * affinity. Add this URL as a custom connector in Claude.ai, ChatGPT, Cursor,
 * or `claude mcp add --transport http opentax <url>`.
 */

import { after } from "next/server";
import { put } from "@vercel/blob";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  createServer,
  WebStandardStreamableHTTPServerTransport,
} from "@/lib/opentax-mcp.bundle.mjs";

type RpcPeek = {
  method?: string;
  params?: { name?: string; clientInfo?: { name?: string; version?: string } };
};

function logUsage(req: Request): void {
  const clone = req.clone();
  const ip = clientIp(req);
  after(async () => {
    try {
      const rpc = (await clone.json()) as RpcPeek | RpcPeek[];
      const first = Array.isArray(rpc) ? rpc[0] : rpc;
      if (!first?.method) return;
      const record = {
        evt: "mcp",
        method: first.method,
        tool: first.method === "tools/call" ? (first.params?.name ?? "") : "",
        client: first.method === "initialize" ? (first.params?.clientInfo?.name ?? "") : "",
        clientVersion: first.method === "initialize" ? (first.params?.clientInfo?.version ?? "") : "",
        at: new Date().toISOString(),
      };
      console.log(JSON.stringify(record));
      // stdout always; blob writes budgeted per IP + per instance so an
      // anonymous flood degrades to log-only instead of unbounded storage.
      const withinBudget =
        rateLimit(`mcpblob:ip:${ip}`, 30, 3600 * 1000) && rateLimit("mcpblob:all", 240, 3600 * 1000);
      if (withinBudget && (record.method === "initialize" || record.method === "tools/call")) {
        await put(
          `mcp-usage/${record.at.slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
          JSON.stringify(record),
          { access: "private", contentType: "application/json" },
        ).catch(() => {});
      }
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
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export async function POST(req: Request): Promise<Response> {
  logUsage(req);
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
