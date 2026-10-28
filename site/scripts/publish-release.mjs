#!/usr/bin/env node
/**
 * Pack the licensed library (core, corpus-us-federal, compose, solve) and
 * publish it to the site's private Blob store, where Firm License holders
 * download it from the console. Run from the repo root:
 *
 *   BLOB_READ_WRITE_TOKEN=… node site/scripts/publish-release.mjs [--notes notes.md] [--force]
 *   node site/scripts/publish-release.mjs --local      # writes to site/.data for local testing
 *
 * The script deletes each package's dist/ and rebuilds it, so nothing stale
 * or hand-edited can ship, then checks the built corpus hashes to the Merkle
 * root committed in corpus.lock.json. The tag is v<corpus version>; an
 * existing tag is never replaced without --force.
 *
 * A package keeps its version only while its tarball is byte-identical:
 * workspace devDependencies (build- and test-only, like solve's corpus) are
 * left out of the packed manifest so an unchanged package packs the same way
 * every release, and a package whose bytes changed under the version it had
 * in the previous release stops the publish until its version is bumped.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const local = args.includes("--local");
const force = args.includes("--force");
const notesIdx = args.indexOf("--notes");
const notes = notesIdx >= 0 ? readFileSync(args[notesIdx + 1], "utf8") : undefined;

const root = process.cwd();
const PACKAGES = ["core", "corpus-us-federal", "compose", "solve"];
const lock = JSON.parse(readFileSync(join(root, "packages/corpus-us-federal/corpus.lock.json"), "utf8"));
const tag = `v${lock.version}`;
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain", "packages"], { encoding: "utf8" }).trim();
if (dirty && !local) {
  console.error("packages/ has uncommitted changes; a release must be reproducible from a commit");
  process.exit(1);
}

for (const p of PACKAGES) rmSync(join(root, "packages", p, "dist"), { recursive: true, force: true });
for (const p of PACKAGES) execFileSync("pnpm", ["build"], { cwd: join(root, "packages", p), stdio: "inherit" });
const { getCorpus } = await import(pathToFileURL(join(root, "packages/corpus-us-federal/dist/index.js")).href);
const built = getCorpus();
if (built.merkleRoot !== lock.merkleRoot || built.version !== lock.version) {
  console.error(`built corpus ${built.version} ${built.merkleRoot} does not match corpus.lock.json ${lock.version} ${lock.merkleRoot}`);
  process.exit(1);
}

const existing = await readIndex();
if (existing.some((r) => r.tag === tag) && !force) {
  console.error(`${tag} is already published; bump the corpus version, or pass --force to replace it`);
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), "opentax-release-"));
for (const p of PACKAGES) {
  // pnpm pack rewrites workspace:* to the sibling's current version, so a
  // test-only devDependency on the corpus would change this package's bytes
  // every corpus release; leave workspace devDependencies out of the tarball
  const manifestPath = join(root, "packages", p, "package.json");
  const original = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(original);
  const dev = Object.entries(manifest.devDependencies ?? {}).filter(([, v]) => !String(v).startsWith("workspace:"));
  const packed = { ...manifest, devDependencies: Object.fromEntries(dev) };
  if (!dev.length) delete packed.devDependencies;
  try {
    writeFileSync(manifestPath, JSON.stringify(packed, null, 2) + "\n");
    execFileSync("pnpm", ["pack", "--pack-destination", out], { cwd: join(root, "packages", p), stdio: "ignore" });
  } finally {
    writeFileSync(manifestPath, original);
  }
}

const files = readdirSync(out)
  .filter((f) => f.endsWith(".tgz"))
  .map((name) => {
    const bytes = readFileSync(join(out, name));
    const pkg = JSON.parse(execFileSync("tar", ["-xOzf", join(out, name), "package/package.json"], { encoding: "utf8" }));
    return { name, package: pkg.name, version: pkg.version, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, bytes };
  });

// a version names one tarball: the same name@version with different bytes
// than the latest earlier release would break installs pinned by integrity
const previous = existing.filter((r) => r.tag !== tag).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
const reused = files.filter((f) => previous?.files.some((g) => g.package === f.package && g.version === f.version && g.sha256 !== f.sha256));
if (reused.length && !force) {
  console.error(
    `these packages changed but kept the version they had in ${previous.tag}; bump each before publishing:\n` +
      reused.map((f) => `  ${f.package}@${f.version}`).join("\n"),
  );
  process.exit(1);
}

const release = {
  tag,
  publishedAt: new Date().toISOString(),
  gitCommit,
  corpusVersion: lock.version,
  corpusMerkleRoot: lock.merkleRoot,
  ...(notes ? { notes } : {}),
  files: files.map(({ bytes, ...f }) => f),
};

async function write(pathname, body, contentType) {
  if (local) {
    const p = join(root, "site/.data", pathname);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    return;
  }
  const { put } = await import("@vercel/blob");
  await put(pathname, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
}

async function readIndex() {
  if (local) {
    try {
      return JSON.parse(readFileSync(join(root, "site/.data/releases/index.json"), "utf8"));
    } catch {
      return [];
    }
  }
  const { get } = await import("@vercel/blob");
  const res = await get("releases/index.json", { access: "private", useCache: false }).catch(() => null);
  return res ? JSON.parse(await new Response(res.stream).text()) : [];
}

for (const f of files) await write(`releases/${tag}/${f.name}`, f.bytes, "application/gzip");
const index = [release, ...existing.filter((r) => r.tag !== tag)];
await write("releases/index.json", JSON.stringify(index, null, 2), "application/json");

console.log(`published ${tag} (${gitCommit.slice(0, 7)}, corpus ${lock.merkleRoot.slice(0, 19)}…) to ${local ? "site/.data" : "Blob"}`);
for (const f of release.files) console.log(`  ${f.name}  ${f.sha256.slice(0, 16)}…  ${(f.size / 1024).toFixed(0)} KB`);
