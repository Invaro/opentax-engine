/**
 * Temporary deduction for seniors, TY2025–2028 — Pub. L. 119-21 (OBBBA)
 * § 70103, enacted July 4, 2025.
 *
 * $6,000 per taxpayer age 65+ ($12,000 if both spouses on a joint return
 * qualify), allowed whether or not the taxpayer itemizes, phased out by 6%
 * of MAGI over $75,000 ($150,000 MFJ).
 *
 * v0.2 simplification, stated here and in the title: MAGI is approximated
 * as AGI (this corpus has no foreign-income exclusions to add back).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

const zero = money("0");

/** max0($6,000 − 6% × excess MAGI) — one qualified individual's net amount. */
function perSeniorNet(): Expr {
  return {
    kind: "max0",
    arg: {
      kind: "sub",
      left: param("perSenior"),
      right: {
        kind: "mulRate",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.agi"),
            right: ruleRef("us.federal.senior_deduction.magi_threshold"),
          },
        },
        rate: { num: "6", den: "100" },
        round: "half-up",
      },
    },
  };
}

export const seniorDeductionRules: Rule[] = [
  {
    id: "us.federal.senior_deduction",
    version: 2, // v1 wrongly applied the 6% reduction ONCE to the combined amount;
    // § 151(d)(5)(C) reduces "the $6,000 amount" — i.e., EACH qualified
    // individual's amount — so a joint couple phases out at 12%/dollar
    // (found by the differential harness vs PolicyEngine)
    jurisdiction: "us.federal",
    title: "Temporary deduction for seniors (OBBBA; simplified: MAGI approximated as AGI)",
    citation: {
      source: "26 U.S.C. § 151(d)(5), added by Pub. L. 119-21 (OBBBA) § 70103",
      section: "§ 151(d)(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/151",
      excerpt:
        "There shall be allowed a deduction in an amount equal to $6,000 for each qualified individual… the $6,000 amount… shall be reduced (but not below zero) by 6 percent of so much of the taxpayer's modified adjusted gross income as exceeds $75,000 ($150,000 in the case of a joint return). [Taxable years beginning before January 1, 2029. Married taxpayers must file jointly (§ 151(d)(5)(C)(v)) — MFS receives $0. SSN of the qualified individual required on the return — this corpus assumes that condition is met.]",
    },
    // statutory window: taxable years 2025 through 2028
    effectiveFrom: "2025-01-01",
    effectiveTo: "2029-01-01",
    output: { type: "money" },
    parameters: {
      perSenior: { value: "600000", type: "money" }, // $6,000
    },
    formula: {
      // § 151(d)(5)(C)(v): married taxpayers must file jointly — MFS gets $0.
      kind: "if",
      cond: isStatus("mfs"),
      then: zero,
      else: {
        // Only compute (and only demand the threshold) when a senior exists.
        kind: "if",
        cond: {
          kind: "or",
          args: [
            fact("isAge65OrOlder"),
            {
              kind: "and",
              args: [isStatus("mfj"), fact("spouseIsAge65OrOlder")],
            },
          ],
        },
        then: {
          // EACH qualified individual's $6,000 is reduced by 6% of the
          // excess MAGI (so a joint couple loses 12%/dollar in aggregate,
          // fully phased out at $250,000 joint / $175,000 single)
          kind: "add",
          args: [
            {
              kind: "if",
              cond: fact("isAge65OrOlder"),
              then: perSeniorNet(),
              else: zero,
            },
            {
              kind: "if",
              cond: {
                kind: "and",
                args: [isStatus("mfj"), fact("spouseIsAge65OrOlder")],
              },
              then: perSeniorNet(),
              else: zero,
            },
          ],
        },
        else: zero,
      },
    },
  },
  {
    id: "us.federal.senior_deduction.magi_threshold",
    version: 1,
    jurisdiction: "us.federal",
    title: "Senior deduction MAGI phase-out threshold by filing status",
    citation: {
      source: "26 U.S.C. § 151(d)(5)(C), added by Pub. L. 119-21 (OBBBA) § 70103",
      section: "§ 151(d)(5)(C)",
      url: "https://www.law.cornell.edu/uscode/text/26/151",
      excerpt:
        "…reduced (but not below zero) by 6 percent of so much of the taxpayer's modified adjusted gross income as exceeds $75,000 ($150,000 in the case of a joint return).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2029-01-01",
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        // $150,000 only "in the case of a joint return"; QSS is not a joint
        // return. MFS is excluded from the deduction entirely (never reached).
        { when: "mfj", value: money("15000000") }, // $150,000
        { when: "single", value: money("7500000") }, // $75,000
        { when: "hoh", value: money("7500000") }, // $75,000
        { when: "qss", value: money("7500000") }, // $75,000
      ],
    },
  },
];
