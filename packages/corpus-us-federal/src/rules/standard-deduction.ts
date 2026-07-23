/**
 * Standard deduction — 26 U.S.C. § 63(c), (f).
 *
 * Structure:
 *   base_amount        — the per-status dollar table; one VERSION per tax year
 *                        (v2 TY2025 per OBBBA § 70102; v3 TY2026 per
 *                        Rev. Proc. 2025-32 § 4.14)
 *   base               — normally just base_amount…
 *   dependent_limit    — …unless claimable as a dependent (§ 63(c)(5)),
 *                        a true statutory exception encoded as an override
 *   additional         — age-65/blindness additions (§ 63(f)), per-year amounts
 *   standard_deduction — base + additional (structural, open-ended)
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

export const standardDeductionRules: Rule[] = [
  {
    id: "us.federal.standard_deduction.base_amount",
    version: 2, // v1 held pre-OBBBA Rev. Proc. 2024-40 amounts ($15,000/$30,000/$22,500)
    jurisdiction: J,
    title: "Basic standard deduction amount by filing status (TY2025, as amended by OBBBA)",
    citation: {
      source: "26 U.S.C. § 63(c), as amended by Pub. L. 119-21 (OBBBA) § 70102",
      section: "§ 63(c)(7); OBBBA § 70102; Rev. Proc. 2025-32 § 3.01",
      url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
      excerpt:
        "Section 63(c)(7) as amended by the OBBBA provides the standard deduction amounts… for any taxable year beginning in 2025 as follows: $31,500 (married filing jointly), $23,625 (head of household), $15,750 (single), superseding Rev. Proc. 2024-40 § 2.15(1).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        { when: "single", value: money("1575000") }, // $15,750
        { when: "mfs", value: money("1575000") }, // $15,750 (same as single)
        { when: "mfj", value: money("3150000") }, // $31,500
        { when: "qss", value: money("3150000") }, // $31,500 (§ 1(j)(2)(A): "…and Surviving Spouses")
        { when: "hoh", value: money("2362500") }, // $23,625
      ],
    },
  },
  {
    id: "us.federal.standard_deduction.base_amount",
    version: 3,
    jurisdiction: J,
    title: "Basic standard deduction amount by filing status (TY2026)",
    citation: {
      source: "26 U.S.C. § 63(c); Rev. Proc. 2025-32",
      section: "Rev. Proc. 2025-32 § 4.14(1)",
      url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
      excerpt:
        "For taxable years beginning in 2026, the standard deduction amounts under § 63(c)(2) are as follows: $32,200 (married filing jointly or surviving spouse), $24,150 (head of household), $16,100 (single or married filing separately).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        { when: "single", value: money("1610000") }, // $16,100
        { when: "mfs", value: money("1610000") }, // $16,100 ("single or married filing separately")
        { when: "mfj", value: money("3220000") }, // $32,200
        { when: "qss", value: money("3220000") }, // $32,200 (surviving spouse)
        { when: "hoh", value: money("2415000") }, // $24,150
      ],
    },
  },
  {
    id: "us.federal.standard_deduction.base",
    version: 1,
    jurisdiction: J,
    title: "Basic standard deduction",
    citation: {
      source: "26 U.S.C. § 63(c)(2)",
      section: "§ 63(c)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt: "the term 'basic standard deduction' means…",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: ruleRef("us.federal.standard_deduction.base_amount"),
  },
  {
    id: "us.federal.standard_deduction.dependent_limit",
    version: 1,
    jurisdiction: J,
    title: "Limitation on basic standard deduction of a dependent",
    citation: {
      source:
        "26 U.S.C. § 63(c)(5); Rev. Proc. 2024-40 § 2.15(2); Rev. Proc. 2025-32 § 4.14(2)",
      section: "§ 63(c)(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "For taxable years beginning in 2025 and 2026, the standard deduction amount under § 63(c)(5) for an individual who may be claimed as a dependent by another taxpayer cannot exceed the greater of (1) $1,350, or (2) the sum of $450 and the individual's earned income.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01", // same dollar amounts apply in 2025 and 2026
    output: { type: "money" },
    applicability: fact("isClaimedAsDependent"),
    // min(normal base amount, max($1,350, earned income + $450))
    // simplified: earned income approximated as wages
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.standard_deduction.base_amount"),
        {
          kind: "max",
          args: [
            money("135000"), // $1,350
            { kind: "add", args: [fact("wages"), money("45000")] }, // + $450
          ],
        },
      ],
    },
    overrides: { ruleId: "us.federal.standard_deduction.base", priority: 10 },
  },
  {
    id: "us.federal.standard_deduction.mfs_spouse_itemizes",
    version: 1,
    jurisdiction: J,
    title:
      "MFS standard deduction is zero when the spouse itemizes",
    citation: {
      source: "26 U.S.C. § 63(c)(6)(A)",
      section: "§ 63(c)(6)(A)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "In the case of… a married individual filing a separate return where either spouse itemizes deductions… the standard deduction shall be zero.",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    // if-form (not and-form) so the spouse-itemizes question is only ever
    // asked once the filing status is actually known to be MFS
    applicability: {
      kind: "if",
      cond: isStatus("mfs"),
      then: fact("spouseItemizes"),
      else: { kind: "bool", value: false },
    },
    formula: money("0"),
    // § 63(c)(6) zeroes the ENTIRE standard deduction (basic + additional),
    // so this overrides the sum rule, not just the basic component.
    overrides: { ruleId: "us.federal.standard_deduction", priority: 10 },
  },
  additionalRule(1, "2025-01-01", "2026-01-01", "160000", "200000", {
    sourceRevProc: "Rev. Proc. 2024-40 § 2.15(3)",
    year: "2025",
    married: "$1,600",
    unmarried: "$2,000",
  }),
  additionalRule(2, "2026-01-01", "2027-01-01", "165000", "205000", {
    sourceRevProc: "Rev. Proc. 2025-32 § 4.14(3)",
    year: "2026",
    married: "$1,650",
    unmarried: "$2,050",
  }),
  {
    id: "us.federal.standard_deduction",
    version: 1,
    jurisdiction: J,
    title: "Standard deduction",
    citation: {
      source: "26 U.S.C. § 63(c)(1)",
      section: "§ 63(c)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "the term 'standard deduction' means the sum of (A) the basic standard deduction, and (B) the additional standard deduction.",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.standard_deduction.base"),
        ruleRef("us.federal.standard_deduction.additional"),
      ],
    },
  },
];

/** Per-year § 63(f) additional standard deduction rule. */
function additionalRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  marriedCents: string,
  unmarriedCents: string,
  label: { sourceRevProc: string; year: string; married: string; unmarried: string },
): Rule {
  const perStatusAmount: Expr = {
    kind: "match",
    on: fact("filingStatus"),
    cases: [
      // the higher amount is for "unmarried AND not a surviving spouse" —
      // MFS and QSS get the married amount (read from both Rev. Procs.)
      { when: "mfj", value: { kind: "param", name: "amountMarried" } },
      { when: "mfs", value: { kind: "param", name: "amountMarried" } },
      { when: "qss", value: { kind: "param", name: "amountMarried" } },
      { when: "single", value: { kind: "param", name: "amountUnmarried" } },
      { when: "hoh", value: { kind: "param", name: "amountUnmarried" } },
    ],
  };
  const addIf = (cond: Expr): Expr => ({
    kind: "if",
    cond,
    then: perStatusAmount,
    else: money("0"),
  });
  return {
    id: "us.federal.standard_deduction.additional",
    version,
    jurisdiction: J,
    title: `Additional standard deduction for the aged and blind (TY${label.year})`,
    citation: {
      source: `26 U.S.C. § 63(f); ${label.sourceRevProc}`,
      section: "§ 63(f)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt: `For taxable years beginning in ${label.year}, the additional standard deduction amount under § 63(f) for the aged or the blind is ${label.married}; increased to ${label.unmarried} if the individual is also unmarried and not a surviving spouse (spouse's items counted on a joint return).`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      amountMarried: { value: marriedCents, type: "money" },
      amountUnmarried: { value: unmarriedCents, type: "money" },
    },
    formula: {
      kind: "add",
      args: [
        addIf(fact("isAge65OrOlder")),
        addIf(fact("isBlind")),
        addIf({
          kind: "and",
          args: [isStatus("mfj"), fact("spouseIsAge65OrOlder")],
        }),
        addIf({
          kind: "and",
          args: [isStatus("mfj"), fact("spouseIsBlind")],
        }),
      ],
    },
  };
}
