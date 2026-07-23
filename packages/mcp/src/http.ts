#!/usr/bin/env node
/**
 * @invaro/opentax Streamable HTTP entry — the same tax oracle as a remote MCP
 * connector URL (spec 2025-03-26 Streamable HTTP transport, stateless mode).
 *
 * Run:   opentax-mcp-http            (PORT env, default 3411)
 * Then:  add https://<host>/mcp as a custom connector (Claude.ai, ChatGPT,
 *        Cursor, `claude mcp add --transport http opentax <url>`).
 *
 * Stateless by design: every POST gets a fresh server + transport, so the
 * process scales horizontally with no session affinity. The corpus is loaded
 * once per process and shared (it is immutable and content-addressed).
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3411);
const PATH = process.env.MCP_PATH ?? "/mcp";

/** Real MCP requests are a few KB; anything near this is a memory-exhaustion attempt. */
const MAX_BODY_BYTES = 1_000_000;

class PayloadTooLargeError extends Error {
  constructor() {
    super(`request body exceeds ${MAX_BODY_BYTES} bytes`);
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return reject(new PayloadTooLargeError());
    }
    let raw = "";
    let bytes = 0;
    let overflowed = false;
    req.on("data", (c: Buffer) => {
      if (overflowed) return;
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        overflowed = true;
        reject(new PayloadTooLargeError());
        req.destroy();
        return;
      }
      raw += c;
    });
    req.on("end", () => {
      if (overflowed) return;
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function cors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

const httpServer = createHttpServer(async (req, res) => {
  cors(res);
  const url = (req.url ?? "/").split("?")[0];
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (url !== PATH) {
    res.writeHead(404, { "Content-Type": "application/json" }).end('{"error":"not found — the MCP endpoint is ' + PATH + '"}');
    return;
  }
  if (req.method !== "POST") {
    // stateless mode: no SSE resumption stream, no sessions to DELETE
    res.writeHead(405, { Allow: "POST, OPTIONS" }).end();
    return;
  }
  try {
    const body = await readBody(req);
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    const tooLarge = err instanceof PayloadTooLargeError;
    try {
      if (!res.headersSent) {
        res.writeHead(tooLarge ? 413 : 400, { "Content-Type": "application/json" });
      }
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: String((err as Error)?.message ?? err) },
          id: null,
        }),
      );
    } catch {
      /* socket already destroyed by the overflow guard */
    }
  }
});

httpServer.listen(PORT, () => {
  console.error(`opentax MCP (Streamable HTTP, stateless) listening on :${PORT}${PATH}`);
});
