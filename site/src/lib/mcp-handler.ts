/**
 * The hosted MCP endpoints, shared by two routes:
 *
 *   /mcp           open: anyone can try it; an API key (Bearer otx_…) is optional
 *   /mcp/account   signed in: the AI app connects through OAuth (lib/oauth.ts)
 *                  or an API key, and every call knows the account and its plan
 *
 * Streamable HTTP, stateless: every POST gets a fresh server + transport, so
 * the function scales horizontally with no session affinity. Keys and tokens
 * are never logged.
 */

import { after } from "next/server";
import { getProfile, resolveApiKey, type Account } from "@/lib/accounts";
import { MCP_ACCOUNT_PATH, oauthOrigin, resolveAccessToken, touchConnection } from "@/lib/oauth";
import { callCost, clientIp, rateLimit } from "@/lib/rate-limit";
import { planAccess } from "@/lib/team";
import { accountFields, returnIdHash, writeUsage } from "@/lib/usage";
import {
  createServer,
  WebStandardStreamableHTTPServerTransport,
} from "@/lib/opentax-mcp.bundle.mjs";

type RpcPeek = {
  method?: string;
  params?: { name?: string; arguments?: unknown; clientInfo?: { name?: string; version?: string } };
};

/** Logged strings come from the caller, so they are cut to a sane length. */
const clip = (v: unknown, n: number): string => (typeof v === "string" ? v.slice(0, n) : "");

/** Every message in the request is logged, so a batch is metered call by call. */
function logUsage(req: Request, messages: RpcPeek[], account?: Account): void {
  const ip = clientIp(req);
  const ret = returnIdHash(req);
  after(async () => {
    for (const m of messages) {
      if (!m?.method) continue;
      try {
        // the tool ARGUMENTS are never read here, so no taxpayer data reaches the log
        await writeUsage(
          {
            evt: "mcp",
            method: clip(m.method, 40),
            tool: m.method === "tools/call" ? clip(m.params?.name, 60) : "",
            client: m.method === "initialize" ? clip(m.params?.clientInfo?.name, 60) : "",
            clientVersion: m.method === "initialize" ? clip(m.params?.clientInfo?.version, 30) : "",
            ...accountFields(account),
            ret,
            at: new Date().toISOString(),
          },
          ip,
        );
      } catch {
        /* observability must never break the endpoint */
      }
    }
  });
}

/** JSON-RPC batches are allowed but small, and each message is charged by the work it asks for. */
const MAX_BATCH = 10;
const MAX_RESPONSE = 4 * 1024 * 1024;

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, X-OpenTax-Return-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

/** Same cap as /v1: tax facts are small, and unbounded JSON is a memory-exhaustion vector for the validators. */
const MAX_BODY = 512 * 1024;

function tooLarge(): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "request body over 512 KB" } }), {
    status: 413,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

/** Who the signed-in connector is talking to, as the my_account tool and server instructions describe it. */
export type ConnectedAccount = { email: string; plan: "firm" | "free"; firm: string | null; role: "owner" | "member" | null };

function unauthorized(req: Request, message: string): Response {
  const metadata = `${oauthOrigin(req)}/.well-known/oauth-protected-resource${MCP_ACCOUNT_PATH}`;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}"`,
      ...CORS_HEADERS,
    },
  });
}

export async function handleMcp(incoming: Request, mode: "open" | "account"): Promise<Response> {
  if (Number(incoming.headers.get("content-length") ?? 0) > MAX_BODY) return tooLarge();
  const raw = await incoming.text();
  if (raw.length > MAX_BODY) return tooLarge();
  const req = new Request(incoming.url, { method: "POST", headers: incoming.headers, body: raw });
  let messages: RpcPeek[] = [];
  try {
    const parsed = JSON.parse(raw) as RpcPeek | RpcPeek[];
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // malformed JSON: the transport answers with a parse error
  }
  if (messages.length > MAX_BATCH) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `batches are limited to ${MAX_BATCH} messages` } }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  // signed-in connector: an OAuth token from the AI app's sign-in, or an API key
  let connected: ConnectedAccount | undefined;
  let auth = await resolveApiKey(req);
  if (mode === "account") {
    const viaToken = await resolveAccessToken(req);
    if (viaToken) {
      auth = { status: "ok", account: { account: viaToken.email }, keyId: `oauth:${viaToken.clientId}` };
      after(() => touchConnection(viaToken.email, viaToken.clientId).catch(() => {}));
    } else if (auth.status !== "ok") {
      return unauthorized(req, "sign in to OpenTax to use this connector");
    }
    const email = auth.account.account;
    const access = await planAccess(email).catch(() => null);
    const firmPlan = !!access?.inForce;
    connected = {
      email,
      plan: firmPlan ? "firm" : "free",
      firm: firmPlan ? (access?.license.firm ?? null) : null,
      role: firmPlan ? (access?.role ?? null) : null,
    };
    auth.account = { ...auth.account, plan: connected.plan === "firm" ? "firm" : auth.account.plan, org: connected.firm ?? auth.account.org };
    // the account must still exist (an API key from OPENTAX_API_KEYS has no profile, and that's fine)
    if (auth.keyId.startsWith("oauth:") && !(await getProfile(email))) return unauthorized(req, "this account no longer exists");
  }
  if (auth.status === "unknown") {
    return mode === "account"
      ? unauthorized(req, "unknown API key")
      : new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unknown API key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        });
  }
  const budgetKey = auth.status === "ok" ? `mcp:key:${auth.keyId}` : `mcp:ip:${clientIp(req)}`;
  const budget = auth.status === "ok" ? 6000 : 600; // requests per hour per instance
  // charged by work, not by request: a cliff scan or a full proof costs several units
  const cost = Math.max(
    1,
    messages.reduce((sum, m) => sum + (m?.method === "tools/call" ? callCost(m.params?.name, m.params?.arguments) : 1), 0),
  );
  if (!rateLimit(budgetKey, budget, 3600 * 1000, cost)) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "rate limit exceeded" } }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60", ...CORS_HEADERS } });
  }
  logUsage(req, messages, auth.status === "ok" ? auth.account : undefined);
  const server = createServer(connected);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  await server.connect(transport as never);
  const res = await transport.handleRequest(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  // backstop against amplification: no legitimate answer comes near this
  const text = await res.text();
  if (text.length > MAX_RESPONSE) {
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "response too large; send smaller requests" } }), {
      status: 413,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
  return new Response(text, { status: res.status, headers });
}
