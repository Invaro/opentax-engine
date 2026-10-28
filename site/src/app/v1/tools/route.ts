/** GET /v1/tools — the tool catalogue (name, description, required inputs), from the live server. */
import { listTools } from "@/lib/engine";

export const runtime = "nodejs";
// the catalogue only changes when we deploy: build it once and serve it from the CDN,
// so no request ever waits on a server starting up. (An OPTIONS handler here
// would make the route dynamic; next.config.mjs sends its CORS headers instead.)
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const tools = await listTools();
  const body = {
    ok: true,
    endpoint: "https://opentax.invaro.ai/v1/tools/{name}",
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      required: t.inputSchema?.required ?? [],
      inputs: Object.keys(t.inputSchema?.properties ?? {}),
      docs: `https://opentax.invaro.ai/docs/tools/${t.name}`,
    })),
  };
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
