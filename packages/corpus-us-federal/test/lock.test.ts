/**
 * Corpus drift gate: the freshly computed Merkle root must equal the
 * committed lock file. Any rule edit fails here until `gen:lock` is rerun,
 * making every semantic change to the corpus a reviewable hash diff.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
// @ts-expect-error plain .mjs script without type declarations
import { buildRuleIndex } from "../scripts/rule-index.mjs";

describe("corpus.lock.json", () => {
  const lockPath = path.join(import.meta.dirname, "..", "corpus.lock.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const corpus = getCorpus();

  it("merkle root matches the committed lock", () => {
    expect(corpus.merkleRoot).toBe(lock.merkleRoot);
  });

  it("every rule hash matches the committed lock", () => {
    expect(Object.fromEntries(corpus.ruleHashes)).toEqual(lock.rules);
  });

  it("rule count matches", () => {
    expect(corpus.rules.length).toBe(lock.ruleCount);
  });

  it("rule-index.json (the source of change notes) matches the corpus", () => {
    const index = JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "rule-index.json"), "utf8"));
    expect(index).toEqual(buildRuleIndex(corpus));
  });
});
