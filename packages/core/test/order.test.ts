import { describe, expect, it } from "vitest";
import { compareIds, merkleRoot } from "../src/index.js";
import type { Rule } from "../src/index.js";

describe("compareIds: the id order behind the Merkle root", () => {
  it("is the documented order (docs/PROOF-FORMAT.md § 4)", () => {
    const sorted = ["demo.a", "Demo.a", "demo.a_b", "demo.A-b", "demo.a.b", "demo.a1", "demo.ab", "demo.aB"];
    expect([...sorted].reverse().sort(compareIds)).toEqual(sorted);
    expect(compareIds("x", "x")).toBe(0);
    expect(compareIds("a", "ab")).toBeLessThan(0);
    expect(compareIds("us.federal.agi", "us.federal.above_the_line_adjustments")).toBeGreaterThan(0);
  });

  it("matches an English collator on printable ASCII, which earlier versions sorted with", () => {
    const en = new Intl.Collator("en");
    const chars = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
    let seed = 20261110;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const word = () => Array.from({ length: Math.floor(next() * 7) }, () => chars[Math.floor(next() * chars.length)]).join("");
    for (let i = 0; i < 200_000; i++) {
      const a = word();
      const b = next() < 0.3 ? a.slice(0, Math.floor(next() * (a.length + 1))) + word() : next() < 0.3 ? a.toUpperCase() : word();
      expect(Math.sign(compareIds(a, b)), JSON.stringify([a, b])).toBe(Math.sign(en.compare(a, b)));
    }
  });

  it("does not consult the locale: the root is the same whatever localeCompare does", () => {
    const rule = (id: string): Rule => ({ id, version: 1, jurisdiction: "x", title: id, citation: { source: "s", section: "s" }, effectiveFrom: "2025-01-01", output: { type: "money" }, formula: { kind: "money", cents: "0" } });
    const rules = ["demo.ch", "demo.h", "demo.i", "demo.I", "demo.y", "demo.c"].map(rule);
    const before = merkleRoot(rules);
    const original = String.prototype.localeCompare;
    try {
      // a locale that sorts differently (Czech puts "ch" after "h"; Lithuanian puts "y" beside "i")
      String.prototype.localeCompare = function (other: string) {
        return original.call(this, other, "cs");
      };
      expect(merkleRoot([...rules].reverse())).toBe(before);
    } finally {
      String.prototype.localeCompare = original;
    }
  });
});
