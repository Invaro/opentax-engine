/**
 * Content addressing: SHA-256 over canonical JSON, and a Merkle root over
 * a corpus's rule hashes. A proof artifact pins the exact corpus it was
 * computed against by Merkle root.
 */

import { canonical } from "./canonical.js";
import type { FactSpec, Rule } from "./rule.js";
import { sha256HexPure } from "./sha256.js";

// Pure JS (no node:crypto) so the engine — and proof verification — runs
// unchanged in browsers. Bit-identity is pinned by corpus.lock.json.
export function sha256Hex(input: string): string {
  return sha256HexPure(input);
}

/** `sha256:<hex>` of the canonical JSON of any hashable value. */
export function hashOf(value: unknown): string {
  return `sha256:${sha256Hex(canonical(value))}`;
}

/** Hash of a rule. Covers id, version, citation, dates, params, formulas. */
export function ruleHash(rule: Rule): string {
  return hashOf(rule);
}

/**
 * Merkle root over the corpus: one leaf per rule (ordered by id, version)
 * plus one leaf for the fact catalog — fact DEFAULTS affect answers, so they
 * are pinned too. Odd node at any level is duplicated. An empty corpus
 * hashes the empty string.
 */
export function merkleRoot(rules: Rule[], facts: FactSpec[] = []): string {
  const ordered = [...rules].sort(
    (a, b) => a.id.localeCompare(b.id) || a.version - b.version,
  );
  let level = ordered.map((r) => sha256Hex(canonical(r)));
  if (facts.length > 0) {
    const orderedFacts = [...facts].sort((a, b) => a.id.localeCompare(b.id));
    level.push(sha256Hex(canonical({ facts: orderedFacts })));
  }
  if (level.length === 0) return `sha256:${sha256Hex("")}`;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(sha256Hex(`${left}|${right}`));
    }
    level = next;
  }
  return `sha256:${level[0]}`;
}
