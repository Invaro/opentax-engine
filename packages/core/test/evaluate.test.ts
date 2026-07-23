import { describe, expect, it } from "vitest";
import {
  CorpusValidationError,
  CycleError,
  NeedsFactsError,
  NoApplicableRuleError,
  UnhandledEnumCaseError,
  evaluate,
  loadCorpus,
} from "@invaro/opentax-core";
import type { CorpusInput, Expr, Rule, TypedValueJSON } from "@invaro/opentax-core";

/** A tiny synthetic (non-tax) corpus exercising every engine feature. */
const cite = { source: "Test Act", section: "§ 1" };

const money = (cents: string): Expr => ({ kind: "money", cents });
const fact = (factId: string): Expr => ({ kind: "fact", factId });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });

function mkCorpus(overridesRules: Rule[] = []): CorpusInput {
  const rules: Rule[] = [
    {
      id: "test.base_fee",
      version: 1,
      jurisdiction: "test",
      title: "Base fee",
      citation: cite,
      effectiveFrom: "2025-01-01",
      effectiveTo: "2026-01-01",
      output: { type: "money" },
      formula: money("10000"), // $100
    },
    {
      id: "test.base_fee",
      version: 2,
      jurisdiction: "test",
      title: "Base fee (2026)",
      citation: cite,
      effectiveFrom: "2026-01-01",
      output: { type: "money" },
      formula: money("20000"), // $200
    },
    {
      id: "test.total",
      version: 1,
      jurisdiction: "test",
      title: "Total",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "add",
        args: [ruleRef("test.base_fee"), fact("surchargeCents")],
      },
    },
    ...overridesRules,
  ];
  return {
    name: "test-corpus",
    version: "0.0.1",
    rules,
    facts: [
      {
        id: "surchargeCents",
        type: "money",
        description: "Additional surcharge",
        default: { value: "0", rationale: "No surcharge unless stated" },
      },
      {
        id: "memberTier",
        type: "enum",
        enumValues: ["basic", "gold"],
        description: "Membership tier",
      },
      { id: "unitCount", type: "int", description: "Number of units" },
    ],
  };
}

describe("temporal rule selection", () => {
  it("selects the version valid as of the evaluation date", () => {
    const corpus = loadCorpus(mkCorpus());
    const r2025 = evaluate(corpus, {}, { asOf: "2025-06-30", target: "test.base_fee" });
    expect(r2025.value).toEqual({ type: "money", cents: 10000n });
    const r2026 = evaluate(corpus, {}, { asOf: "2026-06-30", target: "test.base_fee" });
    expect(r2026.value).toEqual({ type: "money", cents: 20000n });
  });

  it("half-open window: effectiveTo date itself belongs to the next version", () => {
    const corpus = loadCorpus(mkCorpus());
    const onBoundary = evaluate(corpus, {}, { asOf: "2026-01-01", target: "test.base_fee" });
    expect(onBoundary.value).toEqual({ type: "money", cents: 20000n });
  });

  it("throws NoApplicableRuleError with known versions outside all windows", () => {
    const corpus = loadCorpus(mkCorpus());
    try {
      evaluate(corpus, {}, { asOf: "2024-06-30", target: "test.base_fee" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NoApplicableRuleError);
      expect((err as NoApplicableRuleError).knownVersions).toHaveLength(2);
    }
  });

  it("rejects overlapping validity windows at load time", () => {
    const input = mkCorpus();
    input.rules.push({
      id: "test.base_fee",
      version: 3,
      jurisdiction: "test",
      title: "Overlapping",
      citation: cite,
      effectiveFrom: "2025-06-01",
      effectiveTo: "2025-07-01",
      output: { type: "money" },
      formula: money("999"),
    });
    expect(() => loadCorpus(input)).toThrow(CorpusValidationError);
  });
});

describe("default logic (overrides)", () => {
  const overrideRule: Rule = {
    id: "test.base_fee.gold_discount",
    version: 1,
    jurisdiction: "test",
    title: "Gold members pay half",
    citation: cite,
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    applicability: {
      kind: "cmp",
      op: "eq",
      left: fact("memberTier"),
      right: { kind: "enum", value: "gold" },
    },
    formula: money("5000"),
    overrides: { ruleId: "test.base_fee", priority: 10 },
  };

  it("applies the override when its guard holds and records the audit trail", () => {
    const corpus = loadCorpus(mkCorpus([overrideRule]));
    const facts: Record<string, TypedValueJSON> = {
      memberTier: { type: "enum", value: "gold" },
    };
    const { value, proof } = evaluate(corpus, facts, {
      asOf: "2025-06-30",
      target: "test.base_fee",
    });
    expect(value).toEqual({ type: "money", cents: 5000n });
    expect(proof.root.ruleId).toBe("test.base_fee.gold_discount");
    expect(proof.root.resolvedFrom).toBe("test.base_fee");
    expect(proof.root.candidatesConsidered).toEqual([
      {
        ruleId: "test.base_fee.gold_discount",
        version: 1,
        priority: 10,
        applicable: true,
      },
    ]);
  });

  it("falls back to the base rule when no override applies", () => {
    const corpus = loadCorpus(mkCorpus([overrideRule]));
    const facts: Record<string, TypedValueJSON> = {
      memberTier: { type: "enum", value: "basic" },
    };
    const { value, proof } = evaluate(corpus, facts, {
      asOf: "2025-06-30",
      target: "test.base_fee",
    });
    expect(value).toEqual({ type: "money", cents: 10000n });
    expect(proof.root.candidatesConsidered).toEqual([
      {
        ruleId: "test.base_fee.gold_discount",
        version: 1,
        priority: 10,
        applicable: false,
      },
      { ruleId: "test.base_fee", version: 1, priority: 0, applicable: true },
    ]);
  });

  it("rejects priority ties among overriders of one target at load time", () => {
    const rival: Rule = {
      ...overrideRule,
      id: "test.base_fee.rival",
      title: "Rival override",
    };
    expect(() => loadCorpus(mkCorpus([overrideRule, rival]))).toThrow(
      CorpusValidationError,
    );
  });
});

describe("missing facts and assumptions", () => {
  it("uses documented defaults and records them as assumptions", () => {
    const corpus = loadCorpus(mkCorpus());
    const { value, proof } = evaluate(corpus, {}, {
      asOf: "2025-06-30",
      target: "test.total",
    });
    expect(value).toEqual({ type: "money", cents: 10000n });
    expect(proof.assumptions).toEqual([
      {
        factId: "surchargeCents",
        value: { type: "money", value: "0" },
        source: "default",
        rationale: "No surcharge unless stated",
      },
    ]);
  });

  it("collects ALL missing facts in one pass", () => {
    const input = mkCorpus();
    input.facts = input.facts.map((f) =>
      f.id === "surchargeCents" ? { ...f, default: undefined } : f,
    );
    input.rules.push({
      id: "test.needs_two",
      version: 1,
      jurisdiction: "test",
      title: "Needs two facts",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "add",
        args: [
          fact("surchargeCents"),
          {
            kind: "mulInt",
            base: money("100"),
            count: fact("unitCount"),
          },
        ],
      },
    });
    const corpus = loadCorpus(input);
    try {
      evaluate(corpus, {}, { asOf: "2025-06-30", target: "test.needs_two" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NeedsFactsError);
      expect(
        (err as NeedsFactsError).missing.map((m) => m.factId).sort(),
      ).toEqual(["surchargeCents", "unitCount"]);
    }
  });
});

describe("structural safety", () => {
  it("detects rule cycles", () => {
    const input = mkCorpus();
    input.rules.push(
      {
        id: "test.a",
        version: 1,
        jurisdiction: "test",
        title: "a",
        citation: cite,
        effectiveFrom: "2025-01-01",
        output: { type: "money" },
        formula: ruleRef("test.b"),
      },
      {
        id: "test.b",
        version: 1,
        jurisdiction: "test",
        title: "b",
        citation: cite,
        effectiveFrom: "2025-01-01",
        output: { type: "money" },
        formula: ruleRef("test.a"),
      },
    );
    const corpus = loadCorpus(input);
    try {
      evaluate(corpus, {}, { asOf: "2025-06-30", target: "test.a" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CycleError);
      expect((err as CycleError).path).toEqual(["test.a", "test.b", "test.a"]);
    }
  });

  it("refuses unhandled enum cases instead of guessing", () => {
    const input = mkCorpus();
    input.rules.push({
      id: "test.tiered",
      version: 1,
      jurisdiction: "test",
      title: "Tiered",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "match",
        on: fact("memberTier"),
        cases: [{ when: "basic", value: money("100") }],
        // no case for "gold", no else
      },
    });
    const corpus = loadCorpus(input);
    expect(() =>
      evaluate(
        corpus,
        { memberTier: { type: "enum", value: "gold" } },
        { asOf: "2025-06-30", target: "test.tiered" },
      ),
    ).toThrow(UnhandledEnumCaseError);
  });

  it("rejects references to unknown rules/facts at load time", () => {
    const input = mkCorpus();
    input.rules.push({
      id: "test.dangling",
      version: 1,
      jurisdiction: "test",
      title: "Dangling",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: ruleRef("test.no_such_rule"),
    });
    expect(() => loadCorpus(input)).toThrow(CorpusValidationError);
  });
});

describe("brackets and stepUnits", () => {
  it("computes marginal amounts across brackets", () => {
    const input = mkCorpus();
    input.rules.push({
      id: "test.marginal",
      version: 1,
      jurisdiction: "test",
      title: "Marginal",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "brackets",
        base: fact("surchargeCents"),
        table: [
          { threshold: "0", rate: { num: "10", den: "100" } },
          { threshold: "100000", rate: { num: "20", den: "100" } }, // above $1,000
        ],
      },
    });
    const corpus = loadCorpus(input);
    // $1,500: 10% of first $1,000 + 20% of remaining $500 = $100 + $100
    const { value } = evaluate(
      corpus,
      { surchargeCents: { type: "money", value: "150000" } },
      { asOf: "2025-06-30", target: "test.marginal" },
    );
    expect(value).toEqual({ type: "money", cents: 20000n });
  });

  it("rejects malformed bracket tables at load time", () => {
    const input = mkCorpus();
    input.rules.push({
      id: "test.bad_table",
      version: 1,
      jurisdiction: "test",
      title: "Bad table",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "brackets",
        base: money("0"),
        table: [{ threshold: "5", rate: { num: "1", den: "10" } }], // must start at "0"
      },
    });
    expect(() => loadCorpus(input)).toThrow(CorpusValidationError);
  });
});
