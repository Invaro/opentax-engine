#!/usr/bin/env node
/**
 * One-time migration: accounts created before API keys were hashed kept the
 * plaintext key in their profile. Replace it with its sha256 (which is also
 * the key record's path, so the key keeps working) and a display hint.
 *
 *   BLOB_READ_WRITE_TOKEN=… node site/scripts/migrate-key-hashes.mjs [--dry-run]
 *   node site/scripts/migrate-key-hashes.mjs --local      # site/.data
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const local = args.includes("--local");
const dry = args.includes("--dry-run");
const sha256 = (s) => createHash("sha256").update(s).digest("hex");

function migrate(profile) {
  if (!profile.key) return null;
  const { key, ...rest } = profile;
  return { ...rest, keyId: sha256(key), keyHint: `${key.slice(0, 8)}…${key.slice(-4)}` };
}

let seen = 0;
let changed = 0;
if (local) {
  const dir = join(process.cwd(), "site/.data/accounts");
  for (const id of readdirSync(dir)) {
    const p = join(dir, id, "profile.json");
    seen += 1;
    const next = migrate(JSON.parse(readFileSync(p, "utf8")));
    if (!next) continue;
    changed += 1;
    if (!dry) writeFileSync(p, JSON.stringify(next, null, 2));
  }
} else {
  const { get, list, put } = await import("@vercel/blob");
  let cursor;
  do {
    const page = await list({ prefix: "accounts/", limit: 1000, cursor });
    for (const b of page.blobs.filter((x) => x.pathname.endsWith("/profile.json"))) {
      seen += 1;
      const res = await get(b.pathname, { access: "private", useCache: false });
      const next = migrate(JSON.parse(await new Response(res.stream).text()));
      if (!next) continue;
      changed += 1;
      if (!dry) {
        await put(b.pathname, JSON.stringify(next), {
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}
console.log(`${dry ? "would migrate" : "migrated"} ${changed} of ${seen} profiles`);
