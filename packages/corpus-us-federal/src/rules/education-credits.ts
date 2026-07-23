/**
 * Education credits — 26 U.S.C. § 25A (American Opportunity Tax Credit +
 * Lifetime Learning Credit), verified from the amended statute July 2026.
 *
 * AOTC (§ 25A(b)) — PER STUDENT: 100% of the first $2,000 of qualified
 * tuition and related expenses + 25% of the next $2,000 (max $2,500).
 * Modeled through three per-student expense slots (a fourth simultaneous
 * AOTC student is not representable — understates conservatively, disclosed).
 *
 * LLC (§ 25A(c)) — PER RETURN: 20% of up to $10,000 of expenses.
 *
 * Phase-out (§ 25A(d), post-2020 consolidation, NOT indexed): both credits
 * reduced by the ratio of (MAGI − $80,000 [$160,000 joint]) to $10,000
 * [$20,000 joint]. Exact statutory ratio (Form 8863 rounds the ratio to
 * three decimals; differences are sub-dollar).
 *
 * Married filing separately (§ 25A(g)(6)): a married taxpayer gets the
 * credit "only if the taxpayer and the taxpayer's spouse file a joint
 * return" — MFS is $0. QSS is not a joint return: single amounts apply.
 *
 * Refundability (§ 25A(i)): 40% of the AOTC is refundable (effectively up
 * to $1,000/student) — EXCEPT for "a child to whom subsection (g) of
 * section 1 applies" (the kiddie tax), who gets no refundable portion.
 *
 * Ordering (§ 26(a); Form 8812 Credit Limit Worksheet): the nonrefundable
 * education credits reduce tax BEFORE the CTC liability limit — which can
 * push displaced CTC into the refundable ACTC.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

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

const CITE = {
  source: "26 U.S.C. § 25A (SSN/EIN requirements as amended by Pub. L. 119-21)",
  url: "https://www.law.cornell.edu/uscode/text/26/25A",
};

/** 100% of the first $2,000 + 25% of the next $2,000, for one student. */
const perStudent = (factId: string): Expr => ({
  kind: "add",
  args: [
    { kind: "min", args: [fact(factId), money("200000")] },
    {
      kind: "mulRate",
      base: {
        kind: "min",
        args: [
          { kind: "max0", arg: { kind: "sub", left: fact(factId), right: money("200000") } },
          money("200000"),
        ],
      },
      rate: { num: "25", den: "100" },
      round: "half-up",
    },
  ],
});

/**
 * § 25A(d) phase-out + § 25A(g)(6) MFS denial, applied to a tentative
 * credit: credit − credit × min(max0(MAGI − threshold), range) / range.
 * MAGI ≈ AGI (§ 911/931/933 add-backs not modeled — disclosed).
 */
function phased(tentative: Expr): Expr {
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
  return {
    kind: "if",
    cond: isStatus("mfs"),
    then: zero,
    else: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: tentative,
        right: {
          kind: "mulDiv",
          a: tentative,
          b: {
            kind: "min",
            args: [
              {
                kind: "max0",
                arg: {
                  kind: "sub",
                  left: ruleRef("us.federal.agi"),
                  right: threshold,
                },
              },
              range,
            ],
          },
          c: range,
          round: "half-up",
        },
      },
    },
  };
}

const PHASE_PARAMS = {
  threshold: { value: "8000000", type: "money" as const }, // $80,000
  thresholdJoint: { value: "16000000", type: "money" as const }, // $160,000
  range: { value: "1000000", type: "money" as const }, // $10,000
  rangeJoint: { value: "2000000", type: "money" as const }, // $20,000
};

export const educationCreditRules: Rule[] = [
  {
    id: "us.federal.education.aotc_tentative",
    version: 1,
    jurisdiction: J,
    title: "American Opportunity Tax Credit before phase-out (per student, up to 3 students)",
    citation: {
      ...CITE,
      section: "§ 25A(b)(1)",
      excerpt:
        "Per eligible student: 100 percent of so much of the qualified tuition and related expenses… as does not exceed $2,000, plus 25 percent of such expenses… as exceeds $2,000 but does not exceed $4,000 (maximum $2,500/student). [Assumed satisfied per student with expenses entered, and disclosed: enrolled at least half-time in one of the first 4 years of postsecondary education, AOTC not claimed for 4 prior years, no felony drug conviction, and the § 25A(g) SSN/EIN requirements (as amended by Pub. L. 119-21). A fourth simultaneous AOTC student is not representable — conservative.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        perStudent("aotcExpensesStudent1"),
        perStudent("aotcExpensesStudent2"),
        perStudent("aotcExpensesStudent3"),
      ],
    },
  },
  {
    id: "us.federal.education.aotc",
    version: 1,
    jurisdiction: J,
    title: "American Opportunity Tax Credit after the MAGI phase-out",
    citation: {
      ...CITE,
      section: "§ 25A(d), (g)(6)",
      excerpt:
        "The credit is reduced by the amount which bears the same ratio as the excess of MAGI over $80,000 ($160,000 joint) bears to $10,000 ($20,000 joint) — amounts NOT indexed (post-2020 consolidation). In the case of a married individual, allowed only on a joint return (MFS: $0); a surviving-spouse return is not a joint return, so the single amounts apply. Exact statutory ratio (Form 8863 rounds the ratio to 3 decimals; sub-dollar difference). MAGI ≈ AGI — disclosed.",
    },
    ...FROM,
    output: { type: "money" },
    parameters: { ...PHASE_PARAMS },
    formula: phased(ruleRef("us.federal.education.aotc_tentative")),
  },
  {
    id: "us.federal.education.aotc_refundable",
    version: 1,
    jurisdiction: J,
    title: "Refundable portion of the AOTC (40%; none for a kiddie-tax child)",
    citation: {
      ...CITE,
      section: "§ 25A(i)",
      excerpt:
        "40 percent of so much of the credit allowed under subsection (a) as is attributable to the American Opportunity Tax Credit… shall be treated as a credit allowable under subpart C [refundable — effectively up to $1,000 per student]. The preceding sentence shall not apply… if such taxpayer is a child to whom subsection (g) of section 1 applies [the kiddie tax].",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: fact("isSubjectToKiddieTax"),
      then: zero,
      else: {
        kind: "mulRate",
        base: ruleRef("us.federal.education.aotc"),
        rate: { num: "40", den: "100" },
        round: "half-up",
      },
    },
  },
  {
    id: "us.federal.education.llc",
    version: 1,
    jurisdiction: J,
    title: "Lifetime Learning Credit after the MAGI phase-out (per return)",
    citation: {
      ...CITE,
      section: "§ 25A(c), (d), (g)(6)",
      excerpt:
        "20 percent of so much of the qualified tuition and related expenses paid… as does not exceed $10,000 — per RETURN, not per student; phased out over the same unindexed $80,000/$160,000 MAGI range; married taxpayers only on a joint return. [Disclosed: § 25A(c)(2)(A) — expenses used for the AOTC cannot also be taken into account here; the two expense inputs are assumed to be for different students/expenses.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: { ...PHASE_PARAMS, cap: { value: "1000000", type: "money" } }, // $10,000
    formula: phased({
      kind: "mulRate",
      base: { kind: "min", args: [fact("llcQualifiedExpenses"), param("cap")] },
      rate: { num: "20", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.federal.education.nonrefundable",
    version: 3, // v2 predated the § 21 CDCC ahead of it in the credit ordering
    jurisdiction: J,
    title:
      "Nonrefundable education credits (60% of the AOTC + all of the LLC), limited to remaining tax",
    citation: {
      source: "26 U.S.C. § 25A(i); § 26(a); Schedule 3 (Form 1040) line 3; Form 8863 Credit Limit Worksheet",
      section: "§ 25A(i); § 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/25A",
      excerpt:
        "The AOTC net of its 40% refundable portion, plus the Lifetime Learning Credit, allowed as nonrefundable credits limited to the regular tax liability (§ 26(a)) remaining after the § 21 dependent-care credit (the Form 8863 worksheet subtracts it first).",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        {
          kind: "add",
          args: [
            {
              kind: "max0",
              arg: {
                kind: "sub",
                left: ruleRef("us.federal.education.aotc"),
                right: ruleRef("us.federal.education.aotc_refundable"),
              },
            },
            ruleRef("us.federal.education.llc"),
          ],
        },
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: {
              kind: "add",
              args: [
                ruleRef("us.federal.income_tax_before_credits"),
                ruleRef("us.federal.amt"),
              ],
            },
            right: ruleRef("us.federal.cdcc"),
          },
        },
      ],
    },
  },
];
