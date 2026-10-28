/**
 * extendCorpus: a firm's own rules on top of the federal corpus, plugged in
 * through extension points (contributions) and pinned overrides, never by
 * copying a federal formula.
 */
import { describe, expect, it } from "vitest";
import { CorpusValidationError, CycleError, coerceFacts, evaluate, NeedsFactsError, verifyProof } from "@invaro/opentax-core";
import type { FactSpec, Rule } from "@invaro/opentax-core";
import { extendCorpus, getCorpus } from "@invaro/opentax-corpus-us-federal";

const asOf = "2025-12-31";
const cite = { source: "Firm memo", section: "1" };
const base = getCorpus();
const plain = { filingStatus: "single", wages: 120000 };

const fact = (id: string, description = id): FactSpec => ({ id, type: "money", description, min: "0" });
const nolCarryforward = fact("firmNolCarryforward", "NOL carried in from earlier years");

/** § 172(a)(2): NOL deduction limited to 80% of taxable income computed without it; reported on Schedule 1 line 8a. */
const nolRule: Rule = {
  id: "firm.nol_deduction",
  version: 1,
  jurisdiction: "us",
  title: "NOL deduction (80% limit)",
  citation: { source: "26 U.S.C.", section: "§ 172(a)(2)" },
  effectiveFrom: "2025-01-01",
  output: { type: "money" },
  contributesTo: "us.federal.gross_income",
  formula: {
    kind: "sub",
    left: { kind: "money", cents: "0" },
    right: {
      kind: "min",
      args: [
        { kind: "fact", factId: "firmNolCarryforward" },
        {
          kind: "mulRate",
          base: { kind: "max0", arg: { kind: "rule", ruleId: "us.federal.taxable_income", excluding: ["firm.nol_deduction"] } },
          rate: { num: "80", den: "100" },
          round: "floor",
        },
      ],
    },
  },
};

const net = (corpus: typeof base, input: Record<string, unknown>, target = "us.federal.net_tax") => {
  const r = evaluate(corpus, coerceFacts(corpus, input), { asOf, target });
  return { cents: (r.value as { cents: bigint }).cents, proof: r.proof };
};

describe("extendCorpus contributions", () => {
  it("an income item added at an extension point taxes exactly like the same amount entered as other income", () => {
    const corpus = extendCorpus({
      name: "firm",
      version: "1",
      facts: [fact("firmConsultingIncome")],
      rules: [
        {
          id: "firm.consulting_income",
          version: 1,
          jurisdiction: "us",
          title: "Consulting income",
          citation: cite,
          effectiveFrom: "2025-01-01",
          output: { type: "money" },
          contributesTo: "us.federal.gross_income",
          formula: { kind: "fact", factId: "firmConsultingIncome" },
        },
      ],
    });
    const extended = net(corpus, { ...plain, firmConsultingIncome: 15000 });
    expect(extended.cents).toBe(net(base, { ...plain, otherOrdinaryIncome: 15000 }).cents);
    expect(verifyProof(extended.proof, corpus)).toMatchObject({ ok: true });
    expect(corpus.merkleRoot).not.toBe(base.merkleRoot);
    expect(corpus.version).toBe(`${base.version}+1`);
  });

  it("an 80%-limited NOL reads taxable income without itself, and the proof verifies", () => {
    const corpus = extendCorpus({ name: "firm", version: "1", facts: [nolCarryforward], rules: [nolRule] });
    const without = net(base, plain, "us.federal.taxable_income").cents;
    const gi = net(base, plain, "us.federal.gross_income").cents;

    // carryforward larger than the limit: 80% of taxable income without the NOL
    const big = net(corpus, { ...plain, firmNolCarryforward: 1_000_000 }, "us.federal.gross_income");
    const limit = (without * 80n) / 100n;
    expect(big.cents).toBe(gi - limit);
    expect(verifyProof(big.proof, corpus)).toMatchObject({ ok: true });
    const root = big.proof.root;
    expect(root.contributions).toEqual([{ ruleId: "firm.nol_deduction", value: { type: "money", value: (-limit).toString() } }]);
    const json = JSON.stringify(root);
    expect(json).toContain('"excluding":["firm.nol_deduction"]');

    // carryforward under the limit: all of it
    const small = net(corpus, { ...plain, firmNolCarryforward: 5000 }, "us.federal.gross_income");
    expect(small.cents).toBe(gi - 500000n);
  });

  it("a contribution that reads its own total without excluding itself is a cycle, named", () => {
    const loop: Rule = { ...nolRule, formula: { kind: "sub", left: { kind: "money", cents: "0" }, right: { kind: "rule", ruleId: "us.federal.agi" } } };
    const corpus = extendCorpus({ name: "firm", version: "1", facts: [nolCarryforward], rules: [loop] });
    expect(() => net(corpus, plain)).toThrow(CycleError);
  });

  it("a missing fact in an extension rule is reported with the federal ones", () => {
    const corpus = extendCorpus({ name: "firm", version: "1", facts: [nolCarryforward], rules: [nolRule] });
    try {
      evaluate(corpus, coerceFacts(corpus, { wages: 1 }), { asOf, target: "us.federal.net_tax" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(NeedsFactsError);
      const ids = (err as NeedsFactsError).missing.map((m) => m.factId);
      expect(ids).toContain("filingStatus");
      expect(ids).toContain("firmNolCarryforward");
    }
  });

  it("refuses contributions outside the extension points", () => {
    expect(() =>
      extendCorpus({ name: "firm", version: "1", facts: [nolCarryforward], rules: [{ ...nolRule, contributesTo: "us.federal.agi" }] }),
    ).toThrow(/not an extension point/);
  });

  it("refuses ids that collide with the federal corpus", () => {
    expect(() =>
      extendCorpus({ name: "firm", version: "1", facts: [fact("wages")], rules: [{ ...nolRule, id: "us.federal.agi" }] }),
    ).toThrow(CorpusValidationError);
  });
});

describe("extendCorpus overrides", () => {
  const target = "us.federal.passive_loss_allowed";
  const [baseKey, baseHash] = [...base.ruleHashes].find(([k]) => k.startsWith(`${target}@`))!;
  const replacement: Rule = {
    id: "firm.passive_loss_allowed",
    version: 1,
    jurisdiction: "us",
    title: "Passive losses allowed, by activity (firm module)",
    citation: cite,
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    overrides: { ruleId: target, priority: 10 },
    applicability: { kind: "bool", value: true },
    formula: { kind: "money", cents: "123400" },
  };

  it("replaces a sub-computation when pinned to the version it was built against", () => {
    const corpus = extendCorpus({ name: "firm", version: "1", rules: [replacement], pins: { [baseKey]: baseHash } });
    const r = evaluate(corpus, coerceFacts(corpus, plain), { asOf, target });
    expect(r.value).toEqual({ type: "money", cents: 123400n });
    expect(r.proof.root.resolvedFrom).toBe(target);
  });

  it("refuses an unpinned override", () => {
    expect(() => extendCorpus({ name: "firm", version: "1", rules: [replacement] })).toThrow(/pin the version/);
  });

  it("refuses when the pinned federal rule has changed", () => {
    expect(() =>
      extendCorpus({ name: "firm", version: "1", rules: [replacement], pins: { [baseKey]: "sha256:" + "0".repeat(64) } }),
    ).toThrow(/has changed/);
    const [id, v] = baseKey.split("@");
    expect(() =>
      extendCorpus({ name: "firm", version: "1", rules: [replacement], pins: { [`${id}@${Number(v) + 7}`]: baseHash } }),
    ).toThrow(/is not in this corpus \(it now has/);
  });
});
