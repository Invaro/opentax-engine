/**
 * OBBBA "no tax on tips" and "no tax on overtime" deductions,
 * TY2025–2028 — 26 U.S.C. §§ 224, 225 (added by Pub. L. 119-21 §§ 70201–70202).
 *
 * Shape (both): min(qualified amount, cap) reduced by $100 for each COMPLETE
 * $1,000 of MAGI over $150,000 ($300,000 joint), floored at zero.
 *
 * ROUNDING NOTE: the phase-out counts whole $1,000s — "divide by $1,000 and
 * round DOWN" per the IRS Schedule 1-A instructions. This is a FLOOR, the
 * opposite of the CTC's "or fraction thereof" CEILING (§ 24(b)). Both are
 * pinned by boundary fixtures.
 *
 * Statutory conditions assumed satisfied and disclosed: SSN on return;
 * occupation on the Treasury tipped-occupation list (§ 224); amounts
 * separately reported per W-2/1099. Married taxpayers must file JOINTLY —
 * MFS receives $0 (§§ 224/225). MAGI approximated as AGI.
 * Amounts are NOT inflation-indexed.
 */

import type { Citation, Expr, Rule } from "@invaro/opentax-core";

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

/** min(qualified, cap) − $100 × floor(excess MAGI / $1,000), floored at 0. */
function cappedPhasedDeduction(
  qualifiedFactId: string,
  cap: Expr,
  // ineligibility guard: MFS for overtime; the full § 224 eligibility
  // determination (occupation list, voluntariness, SSTB, MFS) for tips
  ineligible: Expr = isStatus("mfs"),
): Expr {
  return {
    kind: "if",
    // LAZY FIRST: with no qualified amount, no eligibility facts are ever
    // demanded — a taxpayer without tips is never asked their occupation
    cond: { kind: "cmp", op: "gt", left: fact(qualifiedFactId), right: zero },
    then: {
      kind: "if",
      cond: ineligible,
      then: zero,
      else: {
        kind: "max0",
        arg: {
          kind: "sub",
          left: {
            kind: "min",
            args: [fact(qualifiedFactId), cap],
          },
          right: {
            kind: "mulInt",
            base: money("10000"), // $100 per step
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
              mode: "floor", // whole $1,000s only — IRS Schedule 1-A: "round down"
            },
          },
        },
      },
    },
    else: zero,
  };
}

const WINDOW = { effectiveFrom: "2025-01-01", effectiveTo: "2029-01-01" };
const THRESHOLD_PARAMS = {
  magiThreshold: { value: "15000000", type: "money" as const }, // $150,000
  magiThresholdJoint: { value: "30000000", type: "money" as const }, // $300,000
};

export const tipsOvertimeRules: Rule[] = [
  {
    id: "us.federal.tips_deduction",
    version: 2, // v1 assumed occupation-list qualification; now determined by the eligibility predicate
    jurisdiction: "us.federal",
    title:
      "Deduction for qualified tips (OBBBA; eligibility fully determined; MAGI ≈ AGI)",
    citation: {
      source:
        "26 U.S.C. § 224; Treas. Reg. § 1.224-1 (final, IR-2026-49, Apr. 10, 2026)",
      section: "§ 224",
      url: "https://www.law.cornell.edu/uscode/text/26/224",
      excerpt:
        "The amount allowed as a deduction under this section for any taxable year shall not exceed $25,000… reduced (but not below zero) by $100 for each $1,000 by which the taxpayer's modified adjusted gross income exceeds $150,000 ($300,000 in the case of a joint return). Eligibility (Treasury occupation list, voluntary non-negotiated tips, no SSTB, joint return if married) is determined by us.federal.eligible.tips_deduction. [Whole $1,000s per IRS Schedule 1-A instructions; SSN assumed satisfied.]",
    },
    ...WINDOW,
    output: { type: "money" },
    parameters: {
      cap: { value: "2500000", type: "money" }, // $25,000 (all eligible statuses)
      ...THRESHOLD_PARAMS,
    },
    formula: cappedPhasedDeduction("qualifiedTips", param("cap"), {
      kind: "not",
      arg: { kind: "rule", ruleId: "us.federal.eligible.tips_deduction" },
    }),
  },
  {
    id: "us.federal.overtime_deduction",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Deduction for qualified overtime compensation (OBBBA; simplified: MAGI approximated as AGI)",
    citation: {
      source: "26 U.S.C. § 225, added by Pub. L. 119-21 (OBBBA)",
      section: "§ 225",
      url: "https://www.law.cornell.edu/uscode/text/26/225",
      excerpt:
        "…shall not exceed $12,500 ($25,000 in the case of a joint return)… reduced (but not below zero) by $100 for each $1,000 by which the taxpayer's modified adjusted gross income exceeds $150,000 ($300,000 in the case of a joint return). Qualified overtime compensation means the FLSA § 7 premium in excess of the regular rate. [Married taxpayers must file jointly — MFS gets $0. SSN assumed satisfied.]",
    },
    ...WINDOW,
    output: { type: "money" },
    parameters: {
      cap: { value: "1250000", type: "money" }, // $12,500
      capJoint: { value: "2500000", type: "money" }, // $25,000 (joint return)
      ...THRESHOLD_PARAMS,
    },
    formula: cappedPhasedDeduction("qualifiedOvertimePremium", {
      kind: "if",
      cond: isStatus("mfj"),
      then: param("capJoint"),
      else: param("cap"),
    }),
  },
];
