/**
 * Qualified passenger vehicle loan interest deduction, TY2025–2028 —
 * 26 U.S.C. § 163(h)(4), added by Pub. L. 119-21 (OBBBA).
 *
 * min(interest, $10,000) reduced by $200 for each $1,000 (OR PORTION
 * THEREOF) of MAGI over $100,000 ($200,000 joint) — note "or portion
 * thereof" makes this a CEILING like the CTC, the OPPOSITE of the
 * tips/overtime floor. Three rounding regimes across the OBBBA
 * deductions; each is pinned by a boundary fixture.
 *
 * Assumed satisfied and disclosed: vehicle is new (original use with the
 * taxpayer), final assembly in the US, personal use, purchased after 2024,
 * VIN reported. MFS treatment is encoded CONSERVATIVELY as $0 per IRS
 * guidance on married filers (disclosed in the excerpt) — this can only
 * overstate tax, never understate. MAGI approximated as AGI.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

export const carLoanRules: Rule[] = [
  {
    id: "us.federal.car_loan_interest_deduction",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Qualified passenger vehicle loan interest deduction (OBBBA; simplified: MAGI approximated as AGI)",
    citation: {
      source: "26 U.S.C. § 163(h)(4), added by Pub. L. 119-21 (OBBBA)",
      section: "§ 163(h)(4)",
      url: "https://www.law.cornell.edu/uscode/text/26/163",
      excerpt:
        "The amount of interest taken into account… shall not exceed $10,000… reduced (but not below zero) by $200 for each $1,000 (or portion thereof) by which the modified adjusted gross income of the taxpayer exceeds $100,000 ($200,000 in the case of a joint return). [TY2025–2028. Vehicle conditions (new, US final assembly, personal use, post-2024 purchase, VIN reported) assumed satisfied — disclosed. Married-filing-separately encoded conservatively as $0 per IRS guidance on married filers.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2029-01-01",
    output: { type: "money" },
    parameters: {
      cap: { value: "1000000", type: "money" }, // $10,000
      magiThreshold: { value: "10000000", type: "money" }, // $100,000
      magiThresholdJoint: { value: "20000000", type: "money" }, // $200,000
    },
    formula: {
      kind: "if",
      cond: isStatus("mfs"),
      then: zero,
      else: {
        kind: "if",
        cond: { kind: "cmp", op: "gt", left: fact("carLoanInterest"), right: zero },
        then: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: { kind: "min", args: [fact("carLoanInterest"), param("cap")] },
            right: {
              kind: "mulInt",
              base: money("20000"), // $200 per step
              count: {
                kind: "stepUnits",
                value: {
                  kind: "max0",
                  arg: {
                    kind: "sub",
                    left: ruleRef("us.federal.agi"),
                    right: {
                      kind: "if",
                      cond: isStatus("mfj"),
                      then: param("magiThresholdJoint"),
                      else: param("magiThreshold"),
                    },
                  },
                },
                unitCents: "100000", // $1,000
                mode: "ceil", // "or portion thereof" — a CEILING, unlike §§ 224/225
              },
            },
          },
        },
        else: zero,
      },
    },
  },
];
