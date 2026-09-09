import { after } from "next/server";
import { resolveApiKey, type Account } from "@/lib/accounts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountFields, returnIdHash, writeUsage } from "@/lib/usage";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-OpenTax-Return-Id",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ ok: false, error: { code, message, ...extra } }, status, status === 429 ? { "Retry-After": "60" } : {});
}

/** Auth + rate budget shared by every /v1 route. Returns a Response to send, or the resolved account. */
export async function gate(req: Request): Promise<{ account?: Account } | Response> {
  const auth = await resolveApiKey(req);
  if (auth.status === "unknown") return apiError(401, "UNKNOWN_API_KEY", "unknown API key — sign in at https://opentax.invaro.ai/console to see yours");
  const budgetKey = auth.status === "ok" ? `mcp:key:${auth.keyId}` : `mcp:ip:${clientIp(req)}`;
  const budget = auth.status === "ok" ? 6000 : 600;
  if (!rateLimit(budgetKey, budget, 3600 * 1000)) return apiError(429, "RATE_LIMITED", "rate budget exceeded");
  return { account: auth.status === "ok" ? auth.account : undefined };
}

export function logRest(req: Request, tool: string, account?: Account): void {
  const ip = clientIp(req);
  const ret = returnIdHash(req);
  after(async () => {
    try {
      await writeUsage(
        { evt: "rest", method: "tools/call", tool, client: req.headers.get("user-agent")?.slice(0, 60) ?? "", clientVersion: "", ...accountFields(account), ret, at: new Date().toISOString() },
        ip,
      );
    } catch {
      /* observability must never break the endpoint */
    }
  });
}
