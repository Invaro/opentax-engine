/**
 * Known-answer vectors for the pure-JS SHA-256 (FIPS 180-4 + NIST CAVP),
 * including multi-block, exact-padding-boundary, and non-ASCII UTF-8 inputs.
 * Bit-identity with node:crypto is asserted directly, and corpus.lock.json
 * pins it transitively for every rule hash and the Merkle root.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/hash.js";

const VECTORS: [string, string][] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  ],
];

describe("pure-JS sha256", () => {
  for (const [input, expected] of VECTORS) {
    it(`matches the FIPS vector for ${JSON.stringify(input.slice(0, 16))}… (len ${input.length})`, () => {
      expect(sha256Hex(input)).toBe(expected);
    });
  }

  it("matches node:crypto across lengths spanning every padding boundary and UTF-8 widths", () => {
    const samples = [
      "a".repeat(55), // padding fits with length in same block
      "a".repeat(56), // forces an extra block
      "a".repeat(63),
      "a".repeat(64),
      "a".repeat(65),
      "a".repeat(1000),
      "§ 164(b)(6) — $40,400 · naïve 🎩 proof",
      JSON.stringify({ cents: "5297297", rule: "us.federal.itemized_deductions" }),
    ];
    for (const s of samples) {
      const reference = createHash("sha256").update(s, "utf8").digest("hex");
      expect(sha256Hex(s), `len ${s.length}`).toBe(reference);
    }
  });
});
