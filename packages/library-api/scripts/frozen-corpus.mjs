#!/usr/bin/env node
/**
 * The frozen corpus: a small rule set that uses every expression kind, an
 * override, a contribution, an exclusion pass, two dated versions of a rule,
 * defaults, and ids that differ only by case and punctuation. Its Merkle root,
 * rule hashes and proofs (frozen/expected.json) were made with core 0.1.0
 * (release v0.52.0) and are never regenerated: the tests check that today's
 * core gives the same hashes, verifies those proofs and re-derives them
 * byte for byte. A failure means old proofs would stop verifying.
 *
 *   node scripts/frozen-corpus.mjs <path to a built core dist/index.js> > frozen/expected.json
 *   (only to create the file the first time, with the release being frozen)
 */
const cite = { source: "Frozen demo corpus", section: "§ 1", url: "https://example.com/frozen", excerpt: "A rule that exists to pin the engine's behavior." };
const money = (cents) => ({ kind: "money", cents: String(cents) });
const int = (value) => ({ kind: "int", value: String(value) });
const fact = (factId) => ({ kind: "fact", factId });
const ref = (ruleId, excluding) => ({ kind: "rule", ruleId, ...(excluding ? { excluding } : {}) });
const cmp = (op, left, right) => ({ kind: "cmp", op, left, right });
const rule = (id, formula, extra = {}) => ({ id, version: 1, jurisdiction: "demo", title: `Demo ${id}`, citation: cite, effectiveFrom: "2025-01-01", output: { type: "money" }, formula, ...extra });

export const FROZEN_CORPUS = {
  name: "frozen-demo",
  version: "1.0.0",
  facts: [
    { id: "income", type: "money", min: "0", description: "Income, in dollars." },
    { id: "status", type: "enum", enumValues: ["single", "joint"], description: "Filing status." },
    { id: "kids", type: "int", min: "0", max: "20", description: "Children.", default: { value: "0", rationale: "Assumed no children" } },
    { id: "isBlind", type: "bool", description: "Blind.", default: { value: false, rationale: "Assumed not blind" } },
    { id: "Bonus_pay", type: "money", min: "0", description: "Bonus.", default: { value: "0", rationale: "Assumed no bonus" } },
    { id: "bonus_extra", type: "money", min: "0", description: "Side income.", default: { value: "0", rationale: "Assumed no side income" } },
    { id: "bonusExtra2", type: "money", min: "0", description: "Unused: sorts beside the others.", default: { value: "0", rationale: "Assumed none" } },
  ],
  rules: [
    rule("demo.gross", { kind: "add", args: [fact("income"), fact("Bonus_pay")] }),
    rule("demo.side_income", fact("bonus_extra"), { contributesTo: "demo.gross" }),
    rule(
      "demo.deduction",
      { kind: "match", on: fact("status"), cases: [{ when: "single", value: { kind: "param", name: "base" } }], else: { kind: "mulInt", base: { kind: "param", name: "base" }, count: int(2) } },
      { effectiveTo: "2026-01-01", parameters: { base: { type: "money", value: "1500000", citation: cite } } },
    ),
    rule(
      "demo.deduction",
      { kind: "add", args: [{ kind: "if", cond: cmp("eq", fact("status"), { kind: "enum", value: "joint" }), then: money(3220000), else: money(1610000) }, { kind: "if", cond: fact("isBlind"), then: money(200000), else: money(0) }] },
      { version: 2, effectiveFrom: "2026-01-01" },
    ),
    rule("demo.taxable", { kind: "max0", arg: { kind: "sub", left: ref("demo.gross"), right: ref("demo.deduction") } }),
    rule("demo.taxable_without_side", { kind: "max0", arg: { kind: "sub", left: ref("demo.gross", ["demo.side_income"]), right: ref("demo.deduction") } }),
    rule("demo.tax", {
      kind: "brackets",
      base: ref("demo.taxable"),
      table: [
        { threshold: "0", rate: { num: "10", den: "100" } },
        { threshold: "2000000", rate: { num: "12", den: "100" } },
        { threshold: "8000000", rate: { num: "22", den: "100" } },
      ],
    }),
    rule("demo.tax_rounded", { kind: "roundToDollar", value: ref("demo.tax"), mode: "half-up" }),
    rule("demo.credit", {
      kind: "clamp",
      value: {
        kind: "sub",
        left: { kind: "min", args: [{ kind: "mulInt", base: money(200000), count: fact("kids") }, ref("demo.tax_rounded")] },
        right: { kind: "mulInt", base: money(5000), count: { kind: "stepUnits", value: { kind: "max0", arg: { kind: "sub", left: ref("demo.gross"), right: money(20000000) } }, unitCents: "100000", mode: "ceil" } },
      },
      lo: money(0),
      hi: money(500000),
    }),
    rule("demo.rate_piece", { kind: "add", args: [{ kind: "mulRate", base: ref("demo.taxable"), rate: { num: "153", den: "1000" }, round: "half-even" }, { kind: "mulDiv", a: ref("demo.taxable"), b: money(3), c: money(7), round: "floor" }] }),
    rule("demo.max_piece", { kind: "max", args: [ref("demo.rate_piece"), money(100)] }),
    rule("demo.flags", { kind: "and", args: [{ kind: "or", args: [fact("isBlind"), cmp("gt", fact("kids"), int(2))] }, { kind: "not", arg: cmp("lt", fact("income"), money(100000)) }] }, { output: { type: "bool" } }),
    rule("demo.net", { kind: "sub", left: { kind: "add", args: [ref("demo.tax_rounded"), ref("demo.max_piece")] }, right: ref("demo.credit") }),
    rule("demo.net_special", money(0), { overrides: { ruleId: "demo.net", priority: 5 }, applicability: ref("demo.flags") }),
    rule("demo.guarded", { kind: "if", cond: cmp("ge", fact("income"), money(100000000)), then: { kind: "unsupported", reason: "incomes of $1,000,000 or more are outside the demo" }, else: ref("demo.net") }),
    // ids that differ only by case and punctuation: their order is part of the Merkle root
    rule("demo.a_b", money(1)),
    rule("demo.a.b", money(2)),
    rule("demo.aB", money(3)),
    rule("demo.ab", money(4)),
    rule("demo.a1", money(5)),
    rule("demo.A-b", money(6)),
    rule("demo.order_sum", { kind: "add", args: ["demo.a_b", "demo.a.b", "demo.aB", "demo.ab", "demo.a1", "demo.A-b"].map((id) => ref(id)) }),
  ],
};

export const FROZEN_CASES = [
  { name: "single 2025", facts: { income: 85000, status: "single" }, asOf: "2025-06-30", target: "demo.guarded" },
  { name: "joint 2026, kids, bonus, side income", facts: { income: 240000, status: "joint", kids: 2, Bonus_pay: "12345.67", bonus_extra: 5000 }, asOf: "2026-12-31", target: "demo.guarded" },
  { name: "override fires (blind)", facts: { income: 60000, status: "single", isBlind: true }, asOf: "2026-01-01", target: "demo.net" },
  { name: "computed without regard to the contribution", facts: { income: 50000, status: "joint", bonus_extra: "9999.99" }, asOf: "2025-12-31", target: "demo.taxable_without_side" },
  { name: "a boolean answer", facts: { income: 500, status: "single", kids: 3 }, asOf: "2025-01-01", target: "demo.flags" },
  { name: "override fires (three kids)", facts: { income: 90000, status: "joint", kids: 3 }, asOf: "2025-01-01", target: "demo.guarded" },
  { name: "ids sorted", facts: {}, asOf: "2027-03-01", target: "demo.order_sum" },
  { name: "refused", facts: { income: 1000000, status: "single" }, asOf: "2025-06-30", target: "demo.guarded", error: "NOT_MODELED" },
  { name: "needs facts", facts: { income: 100 }, asOf: "2025-06-30", target: "demo.deduction", error: "NEEDS_FACTS" },
];

/** hashes and proofs of the frozen corpus under a given core build */
export async function freeze(core) {
  const corpus = core.loadCorpus(structuredClone(FROZEN_CORPUS));
  const cases = FROZEN_CASES.map((c) => {
    try {
      const { proof } = core.evaluate(corpus, core.coerceFacts(corpus, c.facts), { asOf: c.asOf, target: c.target });
      return { name: c.name, proof };
    } catch (e) {
      return { name: c.name, error: e.code };
    }
  });
  return { engine: core.ENGINE, merkleRoot: corpus.merkleRoot, ruleHashes: Object.fromEntries([...corpus.ruleHashes].sort(([a], [b]) => (a < b ? -1 : 1))), cases };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const core = await import(process.argv[2]);
  process.stdout.write(JSON.stringify(await freeze(core), null, 1) + "\n");
}
