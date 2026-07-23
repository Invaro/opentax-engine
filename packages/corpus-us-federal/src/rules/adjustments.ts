/**
 * Above-the-line adjustments: HSA (§ 223) and student loan interest (§ 221).
 *
 * HSA limits (verified): 2025 $4,300 self / $8,550 family (Rev. Proc.
 * 2024-25); 2026 $4,400 / $8,750 (Rev. Proc. 2025-19); 55+ catch-up
 * $1,000 (statutory, § 223(b)(3), not indexed). HDHP eligibility assumed.
 *
 * Student loan interest (verified): $2,500 cap (not indexed); phase-out
 * ratio × (MAGI − threshold)/range per § 221(b)(2)(B):
 *   2025: $85,000–$100,000 ($170,000–$200,000 joint) — Rev. Proc. 2024-40 § 2.30
 *   2026: $85,000–$100,000 ($175,000–$205,000 joint) — Rev. Proc. 2025-32 § 4.29
 * MFS may not claim it (§ 221(e)(2)). MAGI here = AGI computed BEFORE this
 * deduction (§ 221(b)(2)(C)) — the rule chain reflects that ordering.
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

function hsaRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  selfCents: string,
  familyCents: string,
  source: string,
  yearLabel: string,
): Rule {
  return {
    id: "us.federal.hsa_deduction",
    version,
    jurisdiction: "us.federal",
    title: `HSA deduction (TY${yearLabel}; HDHP eligibility assumed)`,
    citation: {
      source: `26 U.S.C. § 223; ${source}`,
      section: "§ 223(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/223",
      excerpt: `Deduction for HSA contributions limited to the annual limitation by coverage type, plus the $1,000 additional amount for individuals who have attained age 55 (§ 223(b)(3)). Excess contributions are not deducted (and their 6% excise tax is not modeled).`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      limitSelf: { value: selfCents, type: "money" },
      limitFamily: { value: familyCents, type: "money" },
      catchUp: { value: "100000", type: "money" }, // $1,000, statutory
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("hsaContribution"), right: zero },
      then: {
        kind: "min",
        args: [
          fact("hsaContribution"),
          {
            kind: "add",
            args: [
              {
                kind: "match",
                on: fact("hsaCoverage"),
                cases: [
                  { when: "self", value: param("limitSelf") },
                  { when: "family", value: param("limitFamily") },
                ],
              },
              {
                kind: "if",
                cond: fact("isAge55OrOlder"),
                then: param("catchUp"),
                else: zero,
              },
            ],
          },
        ],
      },
      else: zero,
    },
  };
}

function studentLoanRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  jointThresholdCents: string,
  jointRangeCents: string,
  source: string,
  yearLabel: string,
): Rule {
  const magi = ruleRef("us.federal.agi_before_student_loan");
  const threshold: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("thresholdJoint"),
    else: param("threshold"),
  };
  const range: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("rangeJoint"),
    else: param("range"),
  };
  const capped: Expr = {
    kind: "min",
    args: [fact("studentLoanInterest"), param("cap")],
  };
  return {
    id: "us.federal.student_loan_interest_deduction",
    version,
    jurisdiction: "us.federal",
    title: `Student loan interest deduction (TY${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 221; ${source}`,
      section: "§ 221(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/221",
      excerpt: `$2,500 maximum, reduced by the amount which bears the same ratio as MAGI in excess of the threshold bears to the phase-out range. Married taxpayers filing separately may not claim it (§ 221(e)(2)). MAGI computed before this deduction (§ 221(b)(2)(C)).`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      cap: { value: "250000", type: "money" }, // $2,500, not indexed
      threshold: { value: "8500000", type: "money" }, // $85,000
      range: { value: "1500000", type: "money" }, // $15,000
      thresholdJoint: { value: jointThresholdCents, type: "money" },
      rangeJoint: { value: jointRangeCents, type: "money" },
    },
    formula: {
      kind: "if",
      cond: isStatus("mfs"),
      then: zero,
      else: {
        kind: "if",
        cond: { kind: "cmp", op: "gt", left: fact("studentLoanInterest"), right: zero },
        then: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: capped,
            right: {
              // capped × min(excess, range) / range — the § 221(b)(2) ratio
              kind: "mulDiv",
              a: capped,
              b: {
                kind: "min",
                args: [
                  { kind: "max0", arg: { kind: "sub", left: magi, right: threshold } },
                  range,
                ],
              },
              c: range,
              round: "half-up",
            },
          },
        },
        else: zero,
      },
    },
  };
}

/** § 404(h)/415(c) SEP or solo-401(k) employer contribution for the self-employed. */
function sepRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  limitCents: string,
  source: string,
  yearLabel: string,
  limitLabel: string,
): Rule {
  return {
    id: "us.federal.sep_deduction",
    version,
    jurisdiction: "us.federal",
    title: `SEP / solo-401(k) employer contribution deduction (TY${yearLabel})`,
    citation: {
      source: `26 U.S.C. §§ 404(a)(8), (h), 415(c); ${source}`,
      section: "§ 404(h); § 415(c)(1)(A)",
      url: "https://www.law.cornell.edu/uscode/text/26/404",
      excerpt: `Employer contributions for a self-employed individual are deductible up to 25 percent of net earnings computed AFTER the ½-SE-tax deduction and after the contribution itself — algebraically 20 percent of (net profit − ½ SE tax) — and never more than the § 415(c) annual addition limit (${limitLabel} for ${yearLabel}, per the notice). [Employee elective deferrals to a solo 401(k) are not separately modeled; excess contributions are not deducted and the 10% § 4972 excise is not modeled — disclosed.]`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      annualAdditionLimit: { value: limitCents, type: "money" },
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("sepContribution"), right: zero },
      then: {
        kind: "min",
        args: [
          fact("sepContribution"),
          // 25% of (profit − ½SE − contribution) ⇒ 20% of (profit − ½SE)
          {
            kind: "mulRate",
            base: {
              kind: "max0",
              arg: {
                kind: "sub",
                left: fact("selfEmploymentNetProfit"),
                right: ruleRef("us.federal.se_tax_half_deduction"),
              },
            },
            rate: { num: "20", den: "100" },
            round: "half-up",
          },
          param("annualAdditionLimit"),
        ],
      },
      else: zero,
    },
  };
}

export const adjustmentRules: Rule[] = [
  hsaRule(1, "2025-01-01", "2026-01-01", "430000", "855000", "Rev. Proc. 2024-25", "2025"),
  hsaRule(2, "2026-01-01", "2027-01-01", "440000", "875000", "Rev. Proc. 2025-19", "2026"),
  sepRule(1, "2025-01-01", "2026-01-01", "7000000", "Notice 2024-80", "2025", "$70,000"),
  sepRule(2, "2026-01-01", "2027-01-01", "7200000", "Notice 2025-67", "2026", "$72,000"),
  {
    id: "us.federal.sehi_deduction",
    version: 1,
    jurisdiction: "us.federal",
    title: "Self-employed health insurance deduction (§ 162(l))",
    citation: {
      source: "26 U.S.C. § 162(l)",
      section: "§ 162(l)(1), (2)",
      url: "https://www.law.cornell.edu/uscode/text/26/162",
      excerpt:
        "…there shall be allowed as a deduction… the amount paid during the taxable year for insurance which constitutes medical care for the taxpayer, the taxpayer's spouse, and dependents — not to exceed the earned income derived from the trade or business (here: net profit − ½ SE tax − the SEP deduction). [Assumed and disclosed: not eligible for any month to participate in an employer-subsidized plan (§ 162(l)(2)(B)); the >2%-S-corporation-shareholder W-2 route is not modeled — this rule keys on self-employment profit.]",
    },
    effectiveFrom: "2025-01-01", // statutory, unindexed: open-ended
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "gt",
        left: fact("selfEmployedHealthPremiums"),
        right: zero,
      },
      then: {
        kind: "min",
        args: [
          fact("selfEmployedHealthPremiums"),
          {
            kind: "max0",
            arg: {
              kind: "sub",
              left: fact("selfEmploymentNetProfit"),
              right: {
                kind: "add",
                args: [
                  ruleRef("us.federal.se_tax_half_deduction"),
                  ruleRef("us.federal.sep_deduction"),
                ],
              },
            },
          },
        ],
      },
      else: zero,
    },
  },
  studentLoanRule(
    1, "2025-01-01", "2026-01-01",
    "17000000", "3000000", // $170,000 threshold, $30,000 range
    "Rev. Proc. 2024-40 § 2.30", "2025",
  ),
  studentLoanRule(
    2, "2026-01-01", "2027-01-01",
    "17500000", "3000000", // $175,000 threshold, $30,000 range ($175k–$205k)
    "Rev. Proc. 2025-32 § 4.29", "2026",
  ),
];
