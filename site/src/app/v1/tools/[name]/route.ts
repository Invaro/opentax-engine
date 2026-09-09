/**
 * POST /v1/tools/{name} — call one engine tool over plain HTTP.
 *
 * Body: the tool's arguments as a JSON object (the same object an MCP client
 * would put in params.arguments). Response: the engine's decoded JSON result
 * as the body, not wrapped in JSON-RPC. Status codes:
 *   200  ok:true  — computed
 *   200  ok:false — the engine refused (NEEDS_FACTS, NO_APPLICABLE_RULE, …); error.code says why
 *   400  invalid arguments (the server's own schema message) or unknown tool
 *   401  unknown API key · 413 body too large · 429 rate budget exceeded
 */
import { callTool, listTools } from "@/lib/engine";
import { apiError, CORS, gate, json, logRest } from "@/lib/v1/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = 512 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }): Promise<Response> {
  const { name } = await ctx.params;
  const g = await gate(req);
  if (g instanceof Response) return g;

  const tools = await listTools();
  if (!tools.some((t) => t.name === name)) {
    return apiError(404, "UNKNOWN_TOOL", `no tool named ${JSON.stringify(name)}`, { tools: tools.map((t) => t.name) });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY) return apiError(413, "BODY_TOO_LARGE", "request body over 512 KB");
  let args: unknown = {};
  if (raw.trim()) {
    try {
      args = JSON.parse(raw);
    } catch {
      return apiError(400, "BAD_JSON", "request body must be a JSON object of tool arguments");
    }
  }
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return apiError(400, "BAD_JSON", "request body must be a JSON object of tool arguments");
  }

  logRest(req, name, g.account);
  const out = await callTool(name, args);
  switch (out.kind) {
    case "ok":
      return json(out.body);
    case "refused":
      return json(out.body);
    case "invalid":
      return apiError(400, "INVALID_ARGUMENTS", out.message);
    case "text":
      return json({ ok: true, text: out.text });
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
