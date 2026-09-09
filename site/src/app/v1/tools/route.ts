/** GET /v1/tools — the tool catalogue (name, description, required inputs), from the live server. */
import { listTools } from "@/lib/engine";
import { CORS, json } from "@/lib/v1/shared";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const tools = await listTools();
  return json({
    ok: true,
    endpoint: "https://opentax.invaro.ai/v1/tools/{name}",
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      required: t.inputSchema?.required ?? [],
      inputs: Object.keys(t.inputSchema?.properties ?? {}),
      docs: `https://opentax.invaro.ai/docs/tools/${t.name}`,
    })),
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
