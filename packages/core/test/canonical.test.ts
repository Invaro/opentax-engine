import { describe, expect, it } from "vitest";
import { canonical, hashOf, merkleRoot, sha256Hex } from "@invaro/opentax-core";
import type { Rule } from "@invaro/opentax-core";

describe("canonical JSON", () => {
  it("sorts object keys at every level and strips whitespace", () => {
    expect(canonical({ b: "2", a: { d: "4", c: "3" } })).toBe(
      '{"a":{"c":"3","d":"4"},"b":"2"}',
    );
  });

  it("preserves array order", () => {
    expect(canonical(["b", "a"])).toBe('["b","a"]');
  });

  it("drops undefined-valued keys", () => {
    expect(canonical({ a: "1", b: undefined })).toBe('{"a":"1"}');
  });

  it("allows safe integers, rejects floats and bigints", () => {
    expect(canonical({ v: 3 })).toBe('{"v":3}');
    expect(() => canonical({ v: 3.14 })).toThrow(/non-integer/);
    expect(() => canonical({ v: 1n })).toThrow(/bigint/);
  });

  it("escapes strings per JSON", () => {
    expect(canonical('he said "hi"\n')).toBe('"he said \\"hi\\"\\n"');
  });
});

describe("hashing", () => {
  it("sha256 of the empty string matches the known vector", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("hashOf is order-insensitive for object keys", () => {
    expect(hashOf({ a: "1", b: "2" })).toBe(hashOf({ b: "2", a: "1" }));
  });

  const mkRule = (id: string): Rule => ({
    id,
    version: 1,
    jurisdiction: "test",
    title: id,
    citation: { source: "Test Act", section: "§ 1" },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: { kind: "money", cents: "100" },
  });

  it("merkle root is stable under rule list reordering", () => {
    const a = mkRule("a");
    const b = mkRule("b");
    const c = mkRule("c");
    expect(merkleRoot([a, b, c])).toBe(merkleRoot([c, a, b]));
  });

  it("merkle root changes when any rule changes", () => {
    const a = mkRule("a");
    const b = mkRule("b");
    const before = merkleRoot([a, b]);
    const bEdited = { ...b, formula: { kind: "money", cents: "101" } as const };
    expect(merkleRoot([a, bEdited])).not.toBe(before);
  });

  it("empty corpus hashes deterministically", () => {
    expect(merkleRoot([])).toBe(`sha256:${sha256Hex("")}`);
  });
});
