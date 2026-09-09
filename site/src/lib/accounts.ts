import { createHash, randomBytes } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/**
 * Accounts and API keys, stored in the site's private Vercel Blob store.
 *
 *   accounts/<sha256(email)>/profile.json   { email, plan, org?, createdAt, key, keyCreatedAt }
 *   apikeys/<sha256(key)>.json              { email, plan, org?, createdAt }
 *
 * A key is looked up by its hash on every authenticated request (cached per
 * instance); rotating a key deletes the old hash record, so the old key stops
 * working within the cache TTL. The plaintext key lives only in the owner's
 * profile so the console can show it again.
 */

export type Plan = "evaluation";
export type Profile = {
  email: string;
  plan: Plan;
  org?: string;
  createdAt: string;
  key: string;
  keyCreatedAt: string;
};
export type KeyRecord = { email: string; plan: Plan; org?: string; createdAt: string };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return null;
  return email;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function emailHash(email: string): string {
  return sha256(email);
}

function profilePath(email: string): string {
  return `accounts/${emailHash(email)}/profile.json`;
}

function keyPath(key: string): string {
  return `apikeys/${sha256(key)}.json`;
}

async function readJson<T>(pathname: string): Promise<T | null> {
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res) return null;
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(pathname: string, value: unknown): Promise<void> {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** `otx_` + 40 hex characters (160 bits). */
export function mintKey(): string {
  return `otx_${randomBytes(20).toString("hex")}`;
}

export function maskKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : "otx_…";
}

export async function getProfile(email: string): Promise<Profile | null> {
  return readJson<Profile>(profilePath(email));
}

/** Creates the account with its first key on first sign-in; idempotent afterwards. */
export async function ensureAccount(email: string, org?: string): Promise<Profile> {
  const existing = await getProfile(email);
  if (existing) return existing;
  const now = new Date().toISOString();
  const key = mintKey();
  const profile: Profile = { email, plan: "evaluation", org, createdAt: now, key, keyCreatedAt: now };
  await writeJson(keyPath(key), { email, plan: profile.plan, org, createdAt: now } satisfies KeyRecord);
  await writeJson(profilePath(email), profile);
  return profile;
}

export async function rotateKey(email: string): Promise<Profile> {
  const profile = (await getProfile(email)) ?? (await ensureAccount(email));
  const now = new Date().toISOString();
  const key = mintKey();
  await writeJson(keyPath(key), { email, plan: profile.plan, org: profile.org, createdAt: now } satisfies KeyRecord);
  const next: Profile = { ...profile, key, keyCreatedAt: now };
  await writeJson(profilePath(email), next);
  await del(keyPath(profile.key)).catch(() => {});
  keyCache.delete(profile.key);
  return next;
}

/** Per-instance cache: a hit lives 5 minutes, a miss 60 seconds. */
const keyCache = new Map<string, { record: KeyRecord | null; until: number }>();

export type Account = { account: string; org?: string; plan?: string };

/**
 * Resolve `Authorization: Bearer <key>`. OPENTAX_API_KEYS (a JSON object
 * { "<key>": { account, org, plan } } in the deployment environment) is
 * consulted first for operator-issued keys; then the Blob key records.
 */
export async function resolveApiKey(
  req: Request,
): Promise<{ status: "anonymous" } | { status: "ok"; account: Account; keyId: string } | { status: "unknown" }> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return { status: "anonymous" };
  const key = m[1];
  const keyId = sha256(key).slice(0, 12);

  let envKeys: Record<string, Account> = {};
  try {
    envKeys = JSON.parse(process.env.OPENTAX_API_KEYS ?? "{}") as Record<string, Account>;
  } catch {
    envKeys = {};
  }
  if (envKeys[key]) return { status: "ok", account: envKeys[key], keyId };

  if (!key.startsWith("otx_")) return { status: "unknown" };
  const now = Date.now();
  const cached = keyCache.get(key);
  let record: KeyRecord | null;
  if (cached && cached.until > now) {
    record = cached.record;
  } else {
    try {
      record = await readJson<KeyRecord>(keyPath(key));
    } catch {
      // the store is unreachable: refuse rather than silently downgrade to anonymous
      return { status: "unknown" };
    }
    keyCache.set(key, { record, until: now + (record ? 5 * 60_000 : 60_000) });
    if (keyCache.size > 5_000) keyCache.clear();
  }
  if (!record) return { status: "unknown" };
  return { status: "ok", account: { account: record.email, org: record.org, plan: record.plan }, keyId };
}
