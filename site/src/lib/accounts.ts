import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BlobPreconditionFailedError, del, get, put } from "@vercel/blob";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Accounts and API keys, stored in the site's private Vercel Blob store.
 *
 *   accounts/<sha256(email)>/profile.json   the account (see Profile)
 *   apikeys/<sha256(key)>.json              { email, plan, org?, createdAt }
 *
 * API keys are stored only as hashes. The plaintext is shown once, when the
 * key is created, and never again; the console shows a hint ("otx_ab12…9f3e").
 * A key is looked up by its hash on every authenticated request (cached per
 * instance); rotating deletes the old hash record, so the old key stops
 * working within the cache TTL.
 *
 * A paid Firm plan lives on the owner's profile (see lib/billing.ts and
 * lib/team.ts); while it is in good standing the plan reads "firm".
 */

export type Plan = "evaluation" | "firm";
export type License = {
  id: string;
  kind: "firm";
  status: string;
  seats: number;
  interval: "month" | "year";
  firm?: string;
  customerId: string;
  subscriptionId: string;
  currentPeriodEnd?: string;
  /** Set to end: either at the period's end or on a chosen date (cancelAt). */
  cancelAtPeriodEnd: boolean;
  /** When a scheduled cancellation takes effect. */
  cancelAt?: string;
  /** When the subscription actually ended, once it has. */
  endedAt?: string;
  startedAt: string;
  updatedAt: string;
  welcomedAt?: string;
  /** When this snapshot was read from Stripe; an older snapshot never overwrites a newer one. */
  fetchedAt?: string;
};
/** Subscriptions that keep a plan in force. past_due keeps it while Stripe retries the card. */
/**
 * Whether a plan grants access now. The status must be a live one AND the
 * paid-through date must not be long gone, so a lost webhook or a stale
 * write can never leave a cancelled plan active forever. Three days of slack
 * covers renewal retries and clock skew.
 */
const PERIOD_SLACK_MS = 3 * 86_400_000;
export function licenseInForce(license: { status: string; currentPeriodEnd?: string | null }): boolean {
  const live = license.status === "active" || license.status === "trialing" || license.status === "past_due";
  if (!live) return false;
  if (!license.currentPeriodEnd) return true;
  return Date.now() < Date.parse(license.currentPeriodEnd) + PERIOD_SLACK_MS;
}

export type Member = { email: string; addedAt: string };
export type Invite = { email: string; tokenHash: string; invitedAt: string; expiresAt: string };
export type Profile = {
  email: string;
  plan: Plan;
  org?: string;
  createdAt: string;
  /** sha256 of the current API key, or absent before the first key is created. */
  keyId?: string;
  keyHint?: string;
  keyCreatedAt?: string;
  /** Bumped by "sign out everywhere"; sessions minted under an older epoch stop working. */
  sessionEpoch?: number;
  /** Live sessions by id. Signing out removes one; a cookie whose id is gone stops working. */
  sessions?: Array<{ id: string; createdAt: string }>;
  /**
   * AI tools connected to this account through the MCP sign-in (OAuth), by
   * client id. A token counts only while its client is still listed, so
   * disconnecting one here cuts it off.
   */
  connections?: Connection[];
  license?: License;
  /** Staff on this account's Firm plan, not counting the owner. */
  team?: Member[];
  invites?: Invite[];
  /** When the team first exceeded the seat count; cleared once it fits again. */
  overSeatSince?: string;
  /** The billing period (its end date) whose one grace week has been used. */
  graceUsedFor?: string;
  /** The Stripe customer every checkout for this account uses, so all subscriptions stay in one place. */
  stripeCustomerId?: string;
  /** Legacy plaintext key from before keys were hashed; migrated on the next write. */
  key?: string;
};
export type Connection = { clientId: string; name: string; connectedAt: string; lastUsedAt?: string };
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

function keyRecordPath(keyId: string): string {
  return `apikeys/${keyId}.json`;
}

/**
 * Without a Blob token outside production, records go to site/.data/ so the
 * console and billing flows run end to end on a laptop.
 */
const LOCAL_STORE = !process.env.BLOB_READ_WRITE_TOKEN && process.env.NODE_ENV !== "production";
const localPath = (pathname: string) => join(process.cwd(), ".data", pathname);

export async function readJson<T>(pathname: string): Promise<T | null> {
  if (LOCAL_STORE) {
    try {
      return JSON.parse(await readFile(localPath(pathname), "utf8")) as T;
    } catch {
      return null;
    }
  }
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res) return null;
  const text = await new Response(res.stream).text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function writeJson(pathname: string, value: unknown): Promise<void> {
  if (LOCAL_STORE) {
    await mkdir(dirname(localPath(pathname)), { recursive: true });
    await writeFile(localPath(pathname), JSON.stringify(value, null, 2));
    return;
  }
  await put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/** Local-store only: serialize conditional writes per path, as Blob does server-side. */
const localLocks = new Map<string, Promise<unknown>>();
function withLocalLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = localLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  localLocks.set(key, run.catch(() => {}));
  return run;
}

/** A conditional write lost to a concurrent one; re-read and try again. */
export class WriteConflict extends Error {}

/** The value and its version tag, for compare-and-swap writes. */
export async function readJsonVersioned<T>(pathname: string): Promise<{ value: T; etag: string } | null> {
  if (LOCAL_STORE) {
    try {
      const text = await readFile(localPath(pathname), "utf8");
      return { value: JSON.parse(text) as T, etag: sha256(text) };
    } catch {
      return null;
    }
  }
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  const text = await new Response(res.stream).text();
  try {
    return { value: JSON.parse(text) as T, etag: res.blob.etag };
  } catch {
    return null;
  }
}

/**
 * Write only if nothing changed since `etag` was read, or only if the path
 * does not exist yet (`create`). Throws WriteConflict otherwise.
 */
export async function writeJsonIf(
  pathname: string,
  value: unknown,
  cond: { etag: string } | { create: true },
): Promise<void> {
  const body = JSON.stringify(value, null, LOCAL_STORE ? 2 : undefined);
  if (LOCAL_STORE) return withLocalLock(pathname, async () => {
    const path = localPath(pathname);
    await mkdir(dirname(path), { recursive: true });
    if ("create" in cond) {
      try {
        await writeFile(path, body, { flag: "wx" });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") throw new WriteConflict(pathname);
        throw err;
      }
      return;
    }
    let current = "";
    try {
      current = await readFile(path, "utf8");
    } catch {
      throw new WriteConflict(pathname);
    }
    if (sha256(current) !== cond.etag) throw new WriteConflict(pathname);
    await writeFile(path, body);
  });
  try {
    await put(pathname, body, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      ...("create" in cond ? { allowOverwrite: false } : { ifMatch: cond.etag }),
    });
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) throw new WriteConflict(pathname);
    // a create-only write fails when the path is taken; anything else is a real error
    if ("create" in cond && (await get(pathname, { access: "private", useCache: false }).catch(() => null))) {
      throw new WriteConflict(pathname);
    }
    throw err;
  }
}

/**
 * Read-modify-write without lost updates: re-reads and retries when another
 * writer got there first. `fn` returns the new value, or undefined to leave
 * the record as it is.
 */
export async function updateJson<T>(pathname: string, fn: (current: T | null) => T | undefined, tries = 25): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    // spread retries out so a burst of writers doesn't collide in lockstep
    if (i > 0) await new Promise((r) => setTimeout(r, 5 + Math.random() * 20 * Math.min(i, 5)));
    const cur = await readJsonVersioned<T>(pathname);
    const next = fn(cur?.value ?? null);
    if (next === undefined) return cur?.value ?? null;
    try {
      await writeJsonIf(pathname, next, cur ? { etag: cur.etag } : { create: true });
      return next;
    } catch (err) {
      if (!(err instanceof WriteConflict)) throw err;
    }
  }
  throw new Error(`too much contention on ${pathname}, try again`);
}

export async function removeJson(pathname: string): Promise<void> {
  if (LOCAL_STORE) return rm(localPath(pathname), { force: true });
  await del(pathname);
}

/** `otx_` + 40 hex characters (160 bits). */
export function mintKey(): string {
  return `otx_${randomBytes(20).toString("hex")}`;
}

export function keyHint(key: string): string {
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/** Old profiles carried the plaintext key; move them to hash + hint the first time they are read. */
function migrate(profile: Profile): Profile {
  const legacyTeam = profile.team as unknown as Array<Member | string> | undefined;
  const team = legacyTeam?.map((m) => (typeof m === "string" ? { email: m, addedAt: profile.createdAt } : m));
  if (!profile.key) return team ? { ...profile, team } : profile;
  const { key, ...rest } = profile;
  return { ...rest, team, keyId: sha256(key), keyHint: keyHint(key) };
}

function clean(profile: Profile): Profile {
  const { key: _legacy, ...rest } = profile;
  return rest;
}

/**
 * Change a profile safely under concurrent writers (webhooks, team changes,
 * key rotation, sign-out-everywhere). `fn` gets the current profile and
 * returns the new one, or undefined to leave it unchanged.
 */
export async function updateProfile(email: string, fn: (p: Profile) => Profile | undefined): Promise<Profile | null> {
  const next = await updateJson<Profile>(profilePath(email), (raw) => {
    if (!raw) return undefined;
    const changed = fn(migrate(raw));
    return changed ? clean(changed) : undefined;
  });
  return next ? migrate(next) : null;
}

export async function getProfile(email: string): Promise<Profile | null> {
  const raw = await readJson<Profile>(profilePath(email));
  return raw ? migrate(raw) : null;
}

/** Creates the account on first sign-in; idempotent afterwards. No API key until the owner asks for one. */
export async function ensureAccount(email: string, org?: string): Promise<Profile> {
  const existing = await getProfile(email);
  if (existing) return existing;
  const profile: Profile = { email, plan: "evaluation", org, createdAt: new Date().toISOString() };
  try {
    await writeJsonIf(profilePath(email), profile, { create: true });
    return profile;
  } catch (err) {
    if (!(err instanceof WriteConflict)) throw err;
    // created concurrently by another request: use theirs
    return (await getProfile(email))!;
  }
}

/**
 * Issue a new API key, replacing the old one. Returns the plaintext once;
 * only its hash is stored.
 */
export async function issueKey(email: string): Promise<{ profile: Profile; key: string }> {
  await ensureAccount(email);
  const now = new Date().toISOString();
  const key = mintKey();
  const keyId = sha256(key);
  let previous: string | undefined;
  const next = await updateProfile(email, (p) => {
    previous = p.keyId;
    return { ...p, keyId, keyHint: keyHint(key), keyCreatedAt: now };
  });
  if (!next) throw new Error("account not found");
  await writeJson(keyRecordPath(keyId), { email, plan: next.plan, org: next.org, createdAt: now } satisfies KeyRecord);
  if (previous && previous !== keyId) {
    await removeJson(keyRecordPath(previous)).catch(() => {});
    keyCache.delete(previous);
  }
  return { profile: next, key };
}

/** Invalidate every session for this account. */
export async function bumpSessionEpoch(email: string): Promise<void> {
  await ensureAccount(email);
  await updateProfile(email, (p) => ({ ...p, sessionEpoch: (p.sessionEpoch ?? 0) + 1, sessions: [] }));
}

const MAX_SESSIONS = 20;

/** Record a new session; the oldest falls off past twenty devices. */
export async function addSession(email: string): Promise<{ id: string; epoch: number }> {
  const id = randomBytes(16).toString("base64url");
  const p = await updateProfile(email, (cur) => ({
    ...cur,
    sessions: [...(cur.sessions ?? []), { id, createdAt: new Date().toISOString() }].slice(-MAX_SESSIONS),
  }));
  return { id, epoch: p?.sessionEpoch ?? 0 };
}

export async function removeSession(email: string, id: string): Promise<void> {
  await updateProfile(email, (cur) =>
    (cur.sessions ?? []).some((s) => s.id === id) ? { ...cur, sessions: (cur.sessions ?? []).filter((s) => s.id !== id) } : undefined,
  );
}

/**
 * Attach or update the license on an account (creating the account if the
 * buyer never signed in), and move the plan on both the profile and the key
 * record so the hosted API sees it.
 */
const ENDED = new Set(["canceled", "incomplete_expired"]);

/**
 * Whether `incoming` may replace `current`. Webhooks arrive out of order and
 * syncs can race, so: a snapshot older than the stored one loses; an ended
 * subscription is never revived by a stale snapshot; and a different
 * subscription that isn't live can't displace one that is.
 */
function supersedes(current: License | undefined, incoming: License): boolean {
  if (!current) return true;
  if (current.subscriptionId === incoming.subscriptionId) {
    if (current.fetchedAt && incoming.fetchedAt && current.fetchedAt > incoming.fetchedAt) return false;
    if (ENDED.has(current.status) && !ENDED.has(incoming.status)) return false;
    return true;
  }
  return !(licenseInForce(current) && !licenseInForce(incoming));
}

export async function setLicense(email: string, license: License, firmActive: boolean): Promise<Profile> {
  await ensureAccount(email, license.firm);
  const plan: Plan = firmActive ? "firm" : "evaluation";
  const next = await updateProfile(email, (p) =>
    supersedes(p.license, license) ? { ...p, plan, org: license.firm ?? p.org, license } : undefined,
  );
  if (!next) throw new Error("account not found");
  // our snapshot lost to a newer one: leave the key record as the winner wrote it
  if (next.license?.fetchedAt !== license.fetchedAt) return next;
  if (next.keyId) {
    await writeJson(keyRecordPath(next.keyId), {
      email,
      plan,
      org: next.org,
      createdAt: next.keyCreatedAt ?? next.createdAt,
    } satisfies KeyRecord);
    keyCache.delete(next.keyId);
  }
  return next;
}

/** Per-instance cache keyed by key hash: a hit lives 5 minutes, a miss 60 seconds. */
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
  const hash = sha256(key);
  const keyId = hash.slice(0, 12);

  let envKeys: Record<string, Account> = {};
  try {
    envKeys = JSON.parse(process.env.OPENTAX_API_KEYS ?? "{}") as Record<string, Account>;
  } catch {
    envKeys = {};
  }
  if (Object.hasOwn(envKeys, key)) return { status: "ok", account: envKeys[key], keyId };

  // exact format before touching the store: random junk never costs a read
  if (!/^otx_[0-9a-f]{40}$/.test(key)) return { status: "unknown" };
  const now = Date.now();
  const cached = keyCache.get(hash);
  let record: KeyRecord | null;
  if (cached && cached.until > now) {
    record = cached.record;
  } else {
    // uncached lookups cost a Blob read each, so they are budgeted per caller
    // (real keys are cached after their first use and rarely reach this)
    if (!rateLimit(`keylookup:${clientIp(req)}`, 120, 3600 * 1000)) return { status: "unknown" };
    try {
      record = await readJson<KeyRecord>(keyRecordPath(hash));
      if (record && !(await isCurrentKey(record, hash))) record = null;
    } catch {
      // the store is unreachable: refuse rather than silently downgrade to anonymous
      return { status: "unknown" };
    }
    keyCache.delete(hash);
    keyCache.set(hash, { record, until: now + (record ? 5 * 60_000 : 60_000) });
    // evict the oldest entries rather than everything, so junk keys can't flush real ones
    if (keyCache.size > 5_000) {
      let n = 0;
      for (const k of keyCache.keys()) {
        if (n++ >= 1_000) break;
        keyCache.delete(k);
      }
    }
  }
  if (!record) return { status: "unknown" };
  return { status: "ok", account: { account: record.email, org: record.org, plan: record.plan }, keyId };
}

/** A key record counts only while it is its account's current key (checked on cache misses). */
async function isCurrentKey(record: KeyRecord, hash: string): Promise<boolean> {
  const profile = await getProfile(record.email).catch(() => null);
  return profile?.keyId === hash;
}
