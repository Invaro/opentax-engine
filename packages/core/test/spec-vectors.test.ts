/**
 * The test vectors printed in docs/PROOF-FORMAT.md, pinned. If canonical
 * JSON, hashing, or the Merkle construction ever changes, this fails and
 * the spec's schemaVersion must bump alongside the fix.
 */

import { describe, expect, it } from "vitest";
import { canonical, hashOf, merkleRoot, sha256Hex } from "../src/index.js";
import type { FactSpec, Rule } from "../src/index.js";

describe("PROOF-FORMAT.md vectors", () => {
  it("§2 canonical JSON vector", () => {
    const canon = canonical({ b: 1, a: "x", c: [true, null, "§"] });
    expect(canon).toBe('{"a":"x","b":1,"c":[true,null,"§"]}');
    expect(sha256Hex(canon)).toBe(
      "017b70e0870761b93f5a2f500e58237cf13f723c8e4ec70c0e95c9605909cbca",
    );
  });

  it("§4 Merkle vectors (two rules + facts leaf, order-independent; empty corpus)", () => {
    const ruleA: Rule = {
      id: "demo.a",
      version: 1,
      jurisdiction: "demo",
      title: "A",
      citation: { source: "s", section: "x", url: "u", excerpt: "e" },
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: { kind: "money", cents: "100" },
    };
    const ruleB: Rule = { ...ruleA, id: "demo.b", title: "B" };
    const facts: FactSpec[] = [
      { id: "f1", type: "money", description: "d", min: "0" },
    ];
    expect(hashOf(ruleA)).toBe(
      "sha256:cd4c673b8583d83ea9e117bf086efdff7f90b514c7c1b3cf4211bcc0b2640829",
    );
    expect(hashOf(ruleB)).toBe(
      "sha256:f9575198760a2d64f8b780e9617c0cb983e0148cb474486d5721cfd7b4e4a33c",
    );
    expect(`sha256:${sha256Hex(canonical({ facts }))}`).toBe(
      "sha256:f728a6c4653617753676bac1a37aaa7150f39978f6b6dbf379b05c788a0dc1a8",
    );
    // input order must not matter — the construction sorts by id
    expect(merkleRoot([ruleB, ruleA], facts)).toBe(
      "sha256:530ef172c65a6d0c9a6cf43e956745c4f739e6137964864e4963a46e6aa4c616",
    );
    expect(merkleRoot([ruleA, ruleB], facts)).toBe(
      merkleRoot([ruleB, ruleA], facts),
    );
    expect(merkleRoot([], [])).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
