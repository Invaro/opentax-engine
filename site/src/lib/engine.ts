import {
  createServer,
  WebStandardStreamableHTTPServerTransport,
} from "@/lib/opentax-mcp.bundle.mjs";

/**
 * In-process access to the bundled MCP server: the REST layer and the docs
 * build call the same server the /mcp endpoint serves, through the same
 * transport, so the two surfaces can never disagree.
 */

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean; tools?: ToolSpec[] };
  error?: { code: number; message: string; data?: unknown };
};

export type ToolSpec = {
  name: string;
  description?: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
};

export async function rpc(body: unknown): Promise<JsonRpcResponse> {
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport as never);
  try {
    const res = await transport.handleRequest(
      new Request("http://opentax.internal/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify(body),
      }),
    );
    return (await res.json()) as JsonRpcResponse;
  } finally {
    await server.close().catch(() => {});
  }
}

let toolsCache: { at: number; tools: ToolSpec[] } | null = null;

export async function listTools(): Promise<ToolSpec[]> {
  if (toolsCache && Date.now() - toolsCache.at < 10 * 60_000) return toolsCache.tools;
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  const tools = (res.result?.tools ?? []) as ToolSpec[];
  toolsCache = { at: Date.now(), tools };
  return tools;
}

export type ToolCallOutcome =
  | { kind: "ok"; body: unknown }
  | { kind: "refused"; body: unknown } // engine said ok:false (NEEDS_FACTS etc.)
  | { kind: "invalid"; message: string } // schema validation / unknown tool
  | { kind: "text"; text: string }; // non-JSON tool text

/** Call one tool and decode the text payload the MCP server returns. */
export async function callTool(name: string, args: unknown): Promise<ToolCallOutcome> {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args ?? {} } });
  if (res.error) return { kind: "invalid", message: res.error.message };
  const text = res.result?.content?.find((c) => c.type === "text")?.text ?? "";
  if (res.result?.isError && /^MCP error -32602/.test(text)) {
    return { kind: "invalid", message: text.replace(/^MCP error -32602:\s*/, "") };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "text", text };
  }
  if (parsed && typeof parsed === "object" && (parsed as { ok?: boolean }).ok === false) {
    return { kind: "refused", body: parsed };
  }
  return { kind: "ok", body: parsed };
}
