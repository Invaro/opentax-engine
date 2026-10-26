import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getProfile,
  readJson,
  removeJson,
  sha256,
  updateJson,
  updateProfile,
  writeJson,
  type Connection,
} from "@/lib/accounts";

/**
 * Sign-in for MCP clients (OAuth 2.1 with PKCE and dynamic client
 * registration, as the MCP authorization spec asks). Claude, ChatGPT, Cursor
 * and Claude Code add https://<site>/mcp/account, get a 401 that points here,
 * send the person to /oauth/authorize to sign in with their OpenTax email,
 * and receive a token bound to that account. No API key to paste.
 *
 *   oauth/clients/<client_id>.json        { clientId, name, redirectUris, createdAt }
 *   oauth/codes/<sha256(code)>.json       one-time code, 10 minutes, PKCE challenge
 *   oauth/tokens/<sha256(token)>.json     { email, clientId, kind, expiresAt }
 *
 * Tokens are stored only as hashes. A token works only while its client is
 * still in the account's connections, so "disconnect" on the account page
 * revokes it at once (after the per-instance cache, at most a minute).
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 24 * 3600 * 1000;
const REFRESH_TTL_MS = 90 * 86_400_000;
const MAX_REDIRECTS = 5;

export type OAuthClient = { clientId: string; name: string; redirectUris: string[]; createdAt: string };
type CodeRecord = {
  clientId: string;
  email: string;
  redirectUri: string;
  challenge: string;
  expiresAt: number;
  used?: boolean;
};
type TokenRecord = { email: string; clientId: string; kind: "access" | "refresh"; expiresAt: number; used?: boolean };

const clientPath = (id: string) => `oauth/clients/${sha256(id).slice(0, 40)}.json`;
const codePath = (code: string) => `oauth/codes/${sha256(code)}.json`;
const tokenPath = (token: string) => `oauth/tokens/${sha256(token)}.json`;

const random = (prefix: string, bytes: number) => `${prefix}${randomBytes(bytes).toString("base64url")}`;

/** The public origin, for metadata and the resource identifier. */
export function oauthOrigin(req: Request): string {
  if (process.env.NODE_ENV === "production") return process.env.SITE_URL ?? "https://opentax.invaro.ai";
  return new URL(req.url).origin;
}

export const MCP_ACCOUNT_PATH = "/mcp/account";

/**
 * Redirect URIs a client may register: https anywhere, or http only on this
 * machine (Claude Code and other desktop clients listen on localhost). Never
 * fragments, never custom schemes that could hand a code to another app.
 */
export function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(body: { client_name?: unknown; redirect_uris?: unknown }): Promise<OAuthClient | { error: string }> {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || uris.length > MAX_REDIRECTS || !uris.every(validRedirect)) {
    return { error: "redirect_uris must be 1 to 5 https URLs (http only for localhost)" };
  }
  const raw = typeof body.client_name === "string" ? body.client_name : "";
  // shown on the consent page: plain text, short
  const name = raw.replace(/[^\p{L}\p{N} .,'()&:+-]/gu, "").trim().slice(0, 60) || "An agent";
  const client: OAuthClient = { clientId: random("otc_", 18), name, redirectUris: uris as string[], createdAt: new Date().toISOString() };
  await writeJson(clientPath(client.clientId), client);
  return client;
}

export async function getClient(clientId: unknown): Promise<OAuthClient | null> {
  if (typeof clientId !== "string" || !/^otc_[A-Za-z0-9_-]{20,40}$/.test(clientId)) return null;
  const c = await readJson<OAuthClient>(clientPath(clientId));
  return c && c.clientId === clientId ? c : null;
}

/** The signed-in person approved the client: a one-time code bound to their email and the PKCE challenge. */
export async function issueCode(client: OAuthClient, email: string, redirectUri: string, challenge: string): Promise<string> {
  const code = random("otx_code_", 24);
  const record: CodeRecord = { clientId: client.clientId, email, redirectUri, challenge, expiresAt: Date.now() + CODE_TTL_MS };
  await writeJson(codePath(code), record);
  return code;
}

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

async function mintTokens(email: string, client: OAuthClient): Promise<TokenResponse> {
  const access = random("otx_at_", 32);
  const refresh = random("otx_rt_", 32);
  const now = Date.now();
  await writeJson(tokenPath(access), { email, clientId: client.clientId, kind: "access", expiresAt: now + ACCESS_TTL_MS } satisfies TokenRecord);
  await writeJson(tokenPath(refresh), { email, clientId: client.clientId, kind: "refresh", expiresAt: now + REFRESH_TTL_MS } satisfies TokenRecord);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: "opentax" };
}

/** Exchange a code (once) for tokens, checking the client, redirect and PKCE verifier. */
export async function exchangeCode(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  verifier: string;
}): Promise<TokenResponse | { error: string; description: string }> {
  const client = await getClient(params.clientId);
  if (!client) return { error: "invalid_client", description: "unknown client" };
  let record: CodeRecord | null = null;
  // claim the code atomically: two exchanges of one code can't both succeed
  await updateJson<CodeRecord>(codePath(params.code), (cur) => {
    if (!cur || cur.used) return undefined;
    record = cur;
    return { ...cur, used: true };
  });
  const r = record as CodeRecord | null;
  await removeJson(codePath(params.code)).catch(() => {});
  if (!r || r.expiresAt < Date.now()) return { error: "invalid_grant", description: "the code expired or was already used" };
  if (r.clientId !== client.clientId || r.redirectUri !== params.redirectUri) {
    return { error: "invalid_grant", description: "the code was issued to a different client or redirect" };
  }
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(params.verifier) || !sameString(s256(params.verifier), r.challenge)) {
    return { error: "invalid_grant", description: "PKCE verification failed" };
  }
  await connect(r.email, client);
  return mintTokens(r.email, client);
}

/** Trade a refresh token for new tokens; the old refresh token stops working. */
export async function refreshTokens(refreshToken: string, clientId: string): Promise<TokenResponse | { error: string; description: string }> {
  // claimed atomically, like a code: one refresh token, one exchange
  let claimed: TokenRecord | null = null;
  if (/^otx_rt_[A-Za-z0-9_-]{30,60}$/.test(refreshToken)) {
    await updateJson<TokenRecord>(tokenPath(refreshToken), (cur) => {
      if (!cur || cur.used) return undefined;
      claimed = cur;
      return { ...cur, used: true };
    }).catch(() => null);
  }
  const record = claimed as TokenRecord | null;
  await removeJson(tokenPath(refreshToken)).catch(() => {});
  if (!record || record.kind !== "refresh" || record.expiresAt < Date.now() || record.clientId !== clientId) {
    return { error: "invalid_grant", description: "the refresh token is not valid" };
  }
  const client = await getClient(clientId);
  if (!client || !(await isConnected(record.email, clientId))) {
    return { error: "invalid_grant", description: "this app was disconnected from the account" };
  }
  return mintTokens(record.email, client);
}

async function connect(email: string, client: OAuthClient): Promise<void> {
  const now = new Date().toISOString();
  await updateProfile(email, (p) => {
    const others = (p.connections ?? []).filter((c) => c.clientId !== client.clientId);
    const entry: Connection = { clientId: client.clientId, name: client.name, connectedAt: now };
    // newest first, and a bounded list
    return { ...p, connections: [entry, ...others].slice(0, 20) };
  });
}

async function isConnected(email: string, clientId: string): Promise<boolean> {
  const profile = await getProfile(email);
  return (profile?.connections ?? []).some((c) => c.clientId === clientId);
}

export async function disconnect(email: string, clientId: string): Promise<void> {
  await updateProfile(email, (p) =>
    (p.connections ?? []).some((c) => c.clientId === clientId)
      ? { ...p, connections: (p.connections ?? []).filter((c) => c.clientId !== clientId) }
      : undefined,
  );
  // this instance stops honouring it at once; others within the cache minute
  for (const [key, hit] of tokenCache) if (hit.clientId === clientId) tokenCache.delete(key);
}

/** Per-instance cache of verified access tokens, as with API keys. */
const tokenCache = new Map<string, { email: string; clientId: string; until: number }>();

/**
 * The account behind `Authorization: Bearer otx_at_…`, or null. Checks
 * expiry and that the client is still connected (cached for a minute).
 */
export async function resolveAccessToken(req: Request): Promise<{ email: string; clientId: string } | null> {
  const m = /^Bearer\s+(otx_at_[A-Za-z0-9_-]{30,60})$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const token = m[1];
  const key = sha256(token);
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.until > now) return { email: hit.email, clientId: hit.clientId };
  const record = await readJson<TokenRecord>(tokenPath(token)).catch(() => null);
  if (!record || record.kind !== "access" || record.expiresAt < now) return null;
  if (!(await isConnected(record.email, record.clientId))) return null;
  tokenCache.set(key, { email: record.email, clientId: record.clientId, until: Math.min(now + 60_000, record.expiresAt) });
  if (tokenCache.size > 5000) tokenCache.delete(tokenCache.keys().next().value as string);
  return { email: record.email, clientId: record.clientId };
}

/** Record when a connected app last made a call (at most once an hour per app, to spare writes). */
export async function touchConnection(email: string, clientId: string): Promise<void> {
  const now = Date.now();
  await updateProfile(email, (p) => {
    const conns = p.connections ?? [];
    const c = conns.find((x) => x.clientId === clientId);
    if (!c || (c.lastUsedAt && now - Date.parse(c.lastUsedAt) < 3600_000)) return undefined;
    return { ...p, connections: conns.map((x) => (x.clientId === clientId ? { ...x, lastUsedAt: new Date(now).toISOString() } : x)) };
  });
}
