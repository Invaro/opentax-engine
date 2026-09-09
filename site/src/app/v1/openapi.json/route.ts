/**
 * GET /v1/openapi.json — OpenAPI 3.1 for the REST layer, generated from the
 * live server's tools/list so the schemas are the server's own validators.
 */
import { listTools } from "@/lib/engine";
import { CORS } from "@/lib/v1/shared";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const tools = await listTools();
  const paths: Record<string, unknown> = {
    "/v1/tools": {
      get: {
        operationId: "listTools",
        summary: "List the tools",
        responses: { "200": { description: "tool catalogue", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
  };
  for (const t of tools) {
    paths[`/v1/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.name,
        description: t.description ?? "",
        tags: ["tools"],
        security: [{ bearer: [] }, {}],
        parameters: [
          {
            name: "X-OpenTax-Return-Id",
            in: "header",
            required: false,
            schema: { type: "string" },
            description: "Your identifier for the taxpayer-year this call belongs to; the billing unit. Stored hashed.",
          },
        ],
        requestBody: { required: true, content: { "application/json": { schema: t.inputSchema } } },
        responses: {
          "200": { $ref: "#/components/responses/ToolResult" },
          "400": { $ref: "#/components/responses/Error" },
          "401": { $ref: "#/components/responses/Error" },
          "429": { $ref: "#/components/responses/Error" },
        },
      },
    };
  }
  const doc = {
    openapi: "3.1.0",
    info: {
      title: "OpenTax REST API",
      version: "v1",
      description:
        "Plain-HTTP access to the OpenTax engine. POST a tool's arguments to /v1/tools/{name}; the decoded result is the response body. Generated from the live server — the request schemas are the server's own validators.",
    },
    servers: [{ url: "https://opentax.invaro.ai" }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "otx_… key from https://opentax.invaro.ai/console" } },
      responses: {
        ToolResult: {
          description: "ok:true with the computed value, line set or lookup hits; ok:false with error.code when the engine refuses (NEEDS_FACTS, NO_APPLICABLE_RULE, UNHANDLED_ENUM_CASE)",
          content: { "application/json": { schema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } }, additionalProperties: true } } },
        },
        Error: {
          description: "transport-level error",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { ok: { const: false }, error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } },
              },
            },
          },
        },
      },
    },
    paths,
  };
  return new Response(JSON.stringify(doc, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300", ...CORS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
