#!/usr/bin/env node
/**
 * Change notes for a corpus release: every rule added, removed or changed
 * since an earlier release, and what changed in each (formula, parameter
 * values old → new, validity window, guard, citation), plus fact defaults.
 *
 *   node packages/corpus-us-federal/scripts/change-notes.mjs                 # since the latest v* tag
 *   node packages/corpus-us-federal/scripts/change-notes.mjs --from v0.39.0  # since a tag or commit
 *   … --write   also saves packages/corpus-us-federal/changes/v<version>.md
 *   … --tag     also creates the annotated git tag v<version> with these notes (local only, never pushed)
 *
 * It reads rule-index.json at the earlier ref from git and compares it with
 * the working tree's, so run gen:lock first. An earlier ref from before
 * rule-index.json existed only has corpus.lock.json: changed rules are then
 * listed without the per-part detail.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (f) => path.relative(execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(), path.join(pkg, f));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

let from = opt("--from");
if (!from) {
  try {
    from = git("describe", "--tags", "--abbrev=0", "--match", "v*");
  } catch {
    fail("no v* tag yet; pass --from <tag or commit>");
  }
}

const current = JSON.parse(readFileSync(path.join(pkg, "rule-index.json"), "utf8"));
const lock = JSON.parse(readFileSync(path.join(pkg, "corpus.lock.json"), "utf8"));
if (current.merkleRoot !== lock.merkleRoot) fail("rule-index.json is stale; run gen:lock first");

const atRef = (file) => {
  try {
    return JSON.parse(git("show", `${from}:${rel(file)}`));
  } catch {
    return null;
  }
};
const previous = atRef("rule-index.json");
const previousLock = atRef("corpus.lock.json");
if (!previous && !previousLock) fail(`no corpus at ${from}`);

const fmtValue = (v) => (typeof v === "string" ? v : JSON.stringify(v));
const window = (r) => `${r.effectiveFrom} → ${r.effectiveTo ?? "open"}`;
const PART_NAMES = {
  formula: "formula",
  applicability: "applicability guard",
  citation: "citation",
  output: "output type",
  overrides: "override target",
  parameterDetail: "parameter citations or types",
};

const lines = [];
const before = previous?.rules ?? Object.fromEntries(Object.keys(previousLock.rules).map((k) => [k, null]));
const beforeHash = previousLock?.rules ?? {};
const ids = (o) => new Set(Object.keys(o));
const added = [...ids(current.rules)].filter((k) => !(k in before));
const removed = [...ids(before)].filter((k) => !(k in current.rules));
const changed = [];
for (const k of Object.keys(current.rules)) {
  if (!(k in before)) continue;
  const now = current.rules[k];
  const was = before[k];
  if (!was) {
    if (beforeHash[k] && beforeHash[k] !== lock.rules[k]) changed.push({ k, notes: ["changed (no per-part detail before rule-index.json)"] });
    continue;
  }
  const notes = [];
  for (const [part, label] of Object.entries(PART_NAMES)) {
    if (was.parts[part] !== now.parts[part]) notes.push(label);
  }
  if (was.effectiveFrom !== now.effectiveFrom || was.effectiveTo !== now.effectiveTo) {
    notes.push(`validity window ${window(was)} ⇒ ${window(now)}`);
  }
  const wp = was.parameters ?? {};
  const np = now.parameters ?? {};
  for (const p of new Set([...Object.keys(wp), ...Object.keys(np)])) {
    if (!(p in wp)) notes.push(`parameter \`${p}\` added: ${fmtValue(np[p])}`);
    else if (!(p in np)) notes.push(`parameter \`${p}\` removed`);
    else if (JSON.stringify(wp[p]) !== JSON.stringify(np[p])) notes.push(`parameter \`${p}\`: ${fmtValue(wp[p])} ⇒ ${fmtValue(np[p])}`);
  }
  if (was.title !== now.title && notes.length === 0) notes.push("title");
  if (notes.length) changed.push({ k, notes });
}

const factNotes = [];
if (previous) {
  for (const [id, f] of Object.entries(current.facts)) {
    const w = previous.facts[id];
    if (!w) factNotes.push(`- \`${id}\` added (${f.type}${f.default !== undefined ? `, default ${fmtValue(f.default)}` : ", no default"})`);
    else if (w.hash !== f.hash) {
      const what = [];
      if (w.type !== f.type) what.push(`type ${w.type} ⇒ ${f.type}`);
      if (JSON.stringify(w.default) !== JSON.stringify(f.default)) {
        what.push(`default ${w.default === undefined ? "none" : fmtValue(w.default)} ⇒ ${f.default === undefined ? "none" : fmtValue(f.default)}`);
      }
      factNotes.push(`- \`${id}\`: ${what.length ? what.join("; ") : "description or limits"}`);
    }
  }
  for (const id of Object.keys(previous.facts)) if (!(id in current.facts)) factNotes.push(`- \`${id}\` removed`);
}

const fromVersion = previous?.version ?? previousLock.version;
lines.push(`# Corpus v${current.version}`, "");
lines.push(`Changes since v${fromVersion} (\`${from}\`).`, "");
lines.push(`Fingerprint (Merkle root): \`${current.merkleRoot}\``, "");
lines.push(`${added.length} rules added, ${changed.length} changed, ${removed.length} removed, ${factNotes.length} fact changes.`, "");
const rule = (k) => {
  const r = current.rules[k];
  return `- \`${k}\` ${r.title} (${window(r)}; ${r.citation})`;
};
if (added.length) lines.push("## Added rules", "", ...added.map(rule), "");
if (changed.length) {
  lines.push("## Changed rules", "");
  for (const { k, notes } of changed) {
    lines.push(`- \`${k}\` ${current.rules[k].title}`);
    for (const n of notes) lines.push(`  - ${n}`);
  }
  lines.push("");
}
if (removed.length) lines.push("## Removed rules", "", ...removed.map((k) => `- \`${k}\`${before[k]?.title ? ` ${before[k].title}` : ""}`), "");
if (factNotes.length) lines.push("## Facts", "", ...factNotes, "");
const notes = lines.join("\n");
console.log(notes);

const tag = `v${current.version}`;
if (flag("--write")) {
  mkdirSync(path.join(pkg, "changes"), { recursive: true });
  writeFileSync(path.join(pkg, "changes", `${tag}.md`), notes);
  console.error(`wrote ${rel(path.join("changes", `${tag}.md`))}`);
}
if (flag("--tag")) {
  if (git("tag", "-l", tag)) fail(`${tag} already exists; bump the corpus version`);
  if (git("status", "--porcelain", "--", "packages")) fail("packages/ has uncommitted changes; commit before tagging");
  execFileSync("git", ["tag", "-a", tag, "-F", "-"], { input: notes });
  console.error(`created tag ${tag} (local). Publish it with: git push origin ${tag}`);
}
