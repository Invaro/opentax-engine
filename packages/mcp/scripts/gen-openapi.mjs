/**
 * Generate docs/api/openapi.json from the LIVE MCP server: connect an in-memory
 * client, list the tools, and emit their JSON-Schema inputs as an OpenAPI 3.1
 * document describing the hosted JSON-RPC endpoint. Also dumps the raw tool
 * list to docs/api/tools.json. Run after `pnpm -F @invaro/opentax build`.
 *
 *   node packages/mcp/scripts/gen-openapi.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const server = createServer();
const [clientT, serverT] = InMemoryTransport.createLinkedPair();
await server.connect(serverT);
const client = new Client({ name: "opentax-docs-generator", version: "1.0.0" });
await client.connect(clientT);
const { tools } = await client.listTools();
const corpus = getCorpus();

const toolPaths = {};
for (const t of tools) {
  toolPaths[`/mcp#tools/call:${t.name}`] = {
    post: {
      operationId: t.name,
      summary: t.title ?? t.name,
      description: t.description,
      tags: ["tools"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["jsonrpc", "id", "method", "params"],
              properties: {
                jsonrpc: { const: "2.0" },
                id: { oneOf: [{ type: "integer" }, { type: "string" }] },
                method: { const: "tools/call" },
                params: {
                  type: "object",
                  required: ["name", "arguments"],
                  properties: { name: { const: t.name }, arguments: t.inputSchema },
                },
              },
            },
          },
        },
      },
      responses: { "200": { $ref: "#/components/responses/ToolResult" } },
    },
  };
}

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "OpenTax hosted API",
    version: `corpus ${corpus.version} · engine proof schema 2`,
    description:
      "The OpenTax engine as a remote MCP server (Model Context Protocol, Streamable HTTP transport, JSON-RPC 2.0). One endpoint, POST https://opentax.invaro.ai/mcp. Every tool below is invoked with method `tools/call`; discover them at runtime with `tools/list`. Responses carry the corpus Merkle root so any answer can be re-derived offline. This document is GENERATED from the live server by packages/mcp/scripts/gen-openapi.mjs — the tool input schemas are the server's own zod schemas rendered as JSON Schema.",
    "x-corpus-merkle-root": corpus.merkleRoot,
    "x-generated": new Date().toISOString(),
  },
  servers: [{ url: "https://opentax.invaro.ai", description: "Hosted (Vercel, stateless)" }],
  security: [{}, { bearerKey: [] }],
  components: {
    securitySchemes: {
      bearerKey: { type: "http", scheme: "bearer", description: "Optional evaluation API key: `Authorization: Bearer <key>`. Anonymous calls are accepted at a lower rate limit; a key attributes usage to an account." },
    },
    responses: {
      ToolResult: {
        description: "JSON-RPC 2.0 result. `result.content[0].text` is a JSON string with `ok: true|false`; on success it carries the value(s), `assumptions`, `corpusMerkleRoot` and (for calculate_tax) the proof; on refusal `error: { code, message, data, hint }` with codes NEEDS_FACTS, NO_APPLICABLE_RULE, UNHANDLED_ENUM_CASE, or an input validation error.",
        content: { "application/json": { schema: { type: "object", properties: { jsonrpc: { const: "2.0" }, id: {}, result: { type: "object", properties: { content: { type: "array", items: { type: "object", properties: { type: { const: "text" }, text: { type: "string" } } } }, isError: { type: "boolean" } } }, error: { type: "object", properties: { code: { type: "integer" }, message: { type: "string" } } } } } } },
      },
    },
  },
  paths: {
    "/mcp": {
      post: {
        operationId: "jsonrpc",
        summary: "MCP Streamable HTTP endpoint (initialize, tools/list, tools/call)",
        description: "Stateless: send `initialize` once per client if your MCP library requires it, then `tools/list` and `tools/call`. Set `Accept: application/json, text/event-stream`. No session id is issued or required.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["jsonrpc", "method"], properties: { jsonrpc: { const: "2.0" }, id: {}, method: { type: "string", enum: ["initialize", "notifications/initialized", "tools/list", "tools/call", "ping"] }, params: { type: "object" } } } } } },
        responses: { "200": { $ref: "#/components/responses/ToolResult" }, "401": { description: "An Authorization header was sent with an unknown key" }, "429": { description: "Rate limit exceeded for this IP or key" } },
      },
    },
    ...toolPaths,
  },
};
mkdirSync(path.join(root, "docs/api"), { recursive: true });
writeFileSync(path.join(root, "docs/api/openapi.json"), JSON.stringify(openapi, null, 2) + "\n");
writeFileSync(path.join(root, "docs/api/tools.json"), JSON.stringify({ corpusVersion: corpus.version, merkleRoot: corpus.merkleRoot, tools }, null, 2) + "\n");
console.log(`tools: ${tools.length}`);
for (const t of tools) console.log(` - ${t.name}: ${Object.keys(t.inputSchema.properties ?? {}).length} inputs${t.inputSchema.required?.length ? ` (required: ${t.inputSchema.required.join(", ")})` : ""}`);
await client.close();
