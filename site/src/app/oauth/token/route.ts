/** OAuth token endpoint: a sign-in code (with its PKCE verifier) or a refresh token, for tokens. */
import { exchangeCode, refreshTokens } from "@/lib/oauth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

function fail(error: string, description: string, status = 400): Response {
  return Response.json({ error, error_description: description }, { status, headers: { ...CORS, ...NO_STORE } });
}

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`oauth:token:${clientIp(req)}`, 120, 3600 * 1000)) return fail("slow_down", "too many requests", 429);
  const raw = await req.text();
  if (raw.length > 8192) return fail("invalid_request", "request too large");
  // the spec says form-encoded; accept JSON too, as some clients send it
  let params: URLSearchParams;
  try {
    params = (req.headers.get("content-type") ?? "").includes("json")
      ? new URLSearchParams(Object.entries(JSON.parse(raw) as Record<string, string>).map(([k, v]) => [k, String(v)]))
      : new URLSearchParams(raw);
  } catch {
    return fail("invalid_request", "unreadable body");
  }
  const grant = params.get("grant_type");
  const clientId = params.get("client_id") ?? "";
  const result =
    grant === "authorization_code"
      ? await exchangeCode({
          code: params.get("code") ?? "",
          clientId,
          redirectUri: params.get("redirect_uri") ?? "",
          verifier: params.get("code_verifier") ?? "",
        })
      : grant === "refresh_token"
        ? await refreshTokens(params.get("refresh_token") ?? "", clientId)
        : { error: "unsupported_grant_type", description: "use authorization_code or refresh_token" };
  if ("error" in result) return fail(result.error, result.description, result.error === "invalid_client" ? 401 : 400);
  return Response.json(result, { headers: { ...CORS, ...NO_STORE } });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
