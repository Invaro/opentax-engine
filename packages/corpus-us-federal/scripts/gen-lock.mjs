/**
 * Regenerate corpus.lock.json (per-rule content hashes + Merkle root).
 *
 * Run after any rule change: `pnpm -F @invaro/opentax-corpus-us-federal gen:lock`
 * The committed lock file makes every semantic corpus change a visible hash
 * diff in code review, and the drift test fails until it is regenerated.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCorpus } from "../dist/index.js";

const corpus = getCorpus();
const lock = {
  name: corpus.name,
  version: corpus.version,
  merkleRoot: corpus.merkleRoot,
  ruleCount: corpus.rules.length,
  rules: Object.fromEntries(
    [...corpus.ruleHashes.entries()].sort(([a], [b]) => a.localeCompare(b)),
  ),
};

const dest = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "corpus.lock.json",
);
writeFileSync(dest, JSON.stringify(lock, null, 2) + "\n");
console.log(`wrote ${dest}`);
console.log(`merkle root: ${corpus.merkleRoot}`);
