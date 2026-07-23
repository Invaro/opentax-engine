/**
 * The personal credit block — §§ 21 (child & dependent care), 25B (saver's),
 * 23 (adoption) — verified from the amended statutes and the year documents
 * July 2026.
 *
 * § 21 CDCC: applicable percentage × capped employment-related expenses.
 *   2025 (pre-OBBBA): 35% − 1pt per $2,000 (or fraction) of AGI over
 *   $15,000, floor 20%. 2026 (OBBBA § 70405): starts at 50%, phases to a
 *   35% floor the same way, then a SECOND phase-down of 1pt per $2,000
 *   ($4,000 joint) of AGI over $75,000 ($150,000 joint), overall floor 20%.
 *   Expenses capped at $3,000/$6,000 (unindexed, § 129 exclusion netted by
 *   the input) and by earned income — on a joint return by the LOWER
 *   earner's income (§ 21(d)(1)(B), the secondaryEarnedIncome fact).
 *   MFS: denied (§ 21(e)(2); the § 21(e)(4) living-apart exception and the
 *   § 21(d)(2) deemed student-spouse income are not modeled — conservative).
 *
 * § 25B saver's credit: 50/20/10% of up to $2,000 of contributions per
 *   individual, by AGI tier (Notice 2024-80 for 2025; Notice 2025-67 for
 *   2026 — NOT the inflation Rev. Procs.). HoH tiers are 75% of joint; all
 *   other statuses 50% of joint (QSS is not a joint return → "all other").
 *   Full-time students and claimed dependents are ineligible; attaining
 *   age 18 is assumed (§ 25B(c)(1) — disclosed). TY2027+ becomes the
 *   § 6433 Saver's Match (SECURE 2.0 § 103, as re-scoped by OBBBA § 70116).
 *
 * § 23 adoption credit: expenses (or the deemed special-needs maximum)
 *   up to the year cap, phased ratably over the $40,000 MAGI band; the
 *   OBBBA (§ 70402, effective TY2025) makes up to $5,000 REFUNDABLE
 *   ($5,120 in 2026, Rev. Proc. 2025-32 § 3.04(3)); only the nonrefundable
 *   remainder carries forward (5 years, § 23(c) — carryforward exposed as
 *   its own target, prior years not tracked). MFS: denied (§ 23(f)(1),
 *   rules similar to § 21(e)(2)).
 *
 * Ordering (§ 26(a); the forms' credit-limit worksheets): CDCC →
 * education → saver's → adoption(nonrefundable) → CTC, each limited to
 * the tax remaining after the ones before it.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // structural: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

/** § 26(a) base: regular tax + AMT (Schedule 2 line 1 joins line 16). */
const limitBase: Expr = {
  kind: "add",
  args: [
    ruleRef("us.federal.income_tax_before_credits"),
    ruleRef("us.federal.amt"),
  ],
};

/** earned income ≈ wages + SE net earnings after ½ SE tax (house approximation). */
const earnedIncome: Expr = {
  kind: "add",
  args: [
    fact("wages"),
    {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("selfEmploymentNetProfit"),
        right: ruleRef("us.federal.se_tax_half_deduction"),
      },
    },
  ],
};

/** whole-or-fraction $-step count over a threshold, as money cents (1¢ = 1 point). */
const stepPoints = (over: Expr, unitCents: string): Expr => ({
  kind: "mulInt",
  base: money("1"),
  count: {
    kind: "stepUnits",
    value: { kind: "max0", arg: over },
    unitCents,
    mode: "ceil", // "or fraction thereof"
  },
});

/** § 21(c)/(d): expenses capped at $3,000/$6,000 and by earned income(s). */
const cdccExpenseBase: Expr = {
  kind: "min",
  args: [
    fact("dependentCareExpenses"),
    {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "ge",
        left: fact("careQualifyingIndividuals"),
        right: { kind: "int", value: "2" },
      },
      then: money("600000"), // $6,000
      else: {
        kind: "if",
        cond: {
          kind: "cmp",
          op: "ge",
          left: fact("careQualifyingIndividuals"),
          right: { kind: "int", value: "1" },
        },
        then: money("300000"), // $3,000
        else: zero,
      },
    },
    earnedIncome,
    {
      kind: "if",
      cond: isStatus("mfj"),
      then: fact("secondaryEarnedIncome"),
      else: earnedIncome,
    },
  ],
};

/** credit = expenses × pct, where pct is carried in cents (35 → 35%). */
const pctOf = (base: Expr, pctCents: Expr): Expr => ({
  kind: "mulDiv",
  a: base,
  b: pctCents,
  c: money("100"),
  round: "half-up",
});

function cdccTentativeRule(
  version: number,
  from: string,
  to: string,
  pctExpr: Expr,
  yearLabel: string,
  mechanicsExcerpt: string,
): Rule {
  return {
    id: "us.federal.cdcc.tentative",
    version,
    jurisdiction: J,
    title: `Child and dependent care credit before the liability limit (${yearLabel})`,
    citation: {
      source:
        version > 1
          ? "26 U.S.C. § 21, as amended by Pub. L. 119-21 (OBBBA) § 70405"
          : "26 U.S.C. § 21 (pre-OBBBA text, per the § 70405(b) effective date)",
      section: "§ 21(a)–(e)",
      url: "https://www.law.cornell.edu/uscode/text/26/21",
      excerpt: mechanicsExcerpt,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "or",
        args: [
          isStatus("mfs"),
          { kind: "not", arg: gt0(fact("dependentCareExpenses")) },
        ],
      },
      then: zero,
      else: pctOf(cdccExpenseBase, pctExpr),
    },
  };
}

// 2025: 35% − 1pt/$2,000 over $15,000, floor 20%
const pct2025: Expr = {
  kind: "max",
  args: [
    money("20"),
    {
      kind: "sub",
      left: money("35"),
      right: stepPoints(
        { kind: "sub", left: ruleRef("us.federal.agi"), right: money("1500000") },
        "200000",
      ),
    },
  ],
};

// 2026 (OBBBA): 50% − 1pt/$2,000 over $15,000 (floor 35%), further −1pt per
// $2,000 ($4,000 joint) over $75,000 ($150,000 joint), overall floor 20%
const pct2026: Expr = {
  kind: "max",
  args: [
    money("20"),
    {
      kind: "sub",
      left: {
        kind: "max",
        args: [
          money("35"),
          {
            kind: "sub",
            left: money("50"),
            right: stepPoints(
              {
                kind: "sub",
                left: ruleRef("us.federal.agi"),
                right: money("1500000"),
              },
              "200000",
            ),
          },
        ],
      },
      right: {
        kind: "if",
        cond: isStatus("mfj"),
        then: stepPoints(
          {
            kind: "sub",
            left: ruleRef("us.federal.agi"),
            right: money("15000000"), // $150,000 joint
          },
          "400000", // $4,000 joint
        ),
        else: stepPoints(
          {
            kind: "sub",
            left: ruleRef("us.federal.agi"),
            right: money("7500000"), // $75,000
          },
          "200000", // $2,000
        ),
      },
    },
  ],
};

/** § 25B tier thresholds by filing status: mfj / hoh / all other. */
const saversTier = (mfjCents: string, hohCents: string, otherCents: string): Expr => ({
  kind: "match",
  on: fact("filingStatus"),
  cases: [
    { when: "mfj", value: money(mfjCents) },
    { when: "hoh", value: money(hohCents) },
  ],
  else: money(otherCents),
});

function saversTentativeRule(
  version: number,
  from: string,
  to: string,
  tiers: { t50: Expr; t20: Expr; t10: Expr },
  yearLabel: string,
  noticeLabel: string,
  tableExcerpt: string,
): Rule {
  const eligibleContributions: Expr = {
    kind: "add",
    args: [
      {
        kind: "if",
        cond: {
          kind: "or",
          args: [fact("isFullTimeStudent"), fact("isClaimedAsDependent")],
        },
        then: zero,
        else: { kind: "min", args: [fact("saversContributions"), money("200000")] },
      },
      {
        kind: "if",
        cond: {
          kind: "and",
          args: [isStatus("mfj"), { kind: "not", arg: fact("spouseIsFullTimeStudent") }],
        },
        then: {
          kind: "min",
          args: [fact("saversContributionsSpouse"), money("200000")],
        },
        else: zero,
      },
    ],
  };
  const agi = ruleRef("us.federal.agi");
  return {
    id: "us.federal.savers.tentative",
    version,
    jurisdiction: J,
    title: `Saver's credit before the liability limit (§ 25B, ${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 25B; ${noticeLabel}`,
      section: "§ 25B(a)–(c)",
      url: "https://www.law.cornell.edu/uscode/text/26/25B",
      excerpt: `A credit equal to the applicable percentage of so much of the qualified retirement savings contributions of the eligible individual… as do not exceed $2,000 — per individual (spouse separately on a joint return). ${tableExcerpt} Head-of-household tiers are 75 percent and all other statuses 50 percent of the joint amounts (§ 25B(b)(2)) — a surviving-spouse return is not a joint return, so the "all other" tiers apply. Ineligible: full-time students and claimed dependents (§ 25B(c)(2)); attainment of age 18 (§ 25B(c)(1)) is assumed — disclosed. Contributions are net of § 25B(d)(2) testing-period distributions — attested by the input. [For taxable years after 2026 the credit is replaced by the § 6433 Saver's Match (SECURE 2.0 § 103; OBBBA § 70116).]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "le", left: agi, right: tiers.t50 },
      then: {
        kind: "mulRate",
        base: eligibleContributions,
        rate: { num: "50", den: "100" },
        round: "half-up",
      },
      else: {
        kind: "if",
        cond: { kind: "cmp", op: "le", left: agi, right: tiers.t20 },
        then: {
          kind: "mulRate",
          base: eligibleContributions,
          rate: { num: "20", den: "100" },
          round: "half-up",
        },
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "le", left: agi, right: tiers.t10 },
          then: {
            kind: "mulRate",
            base: eligibleContributions,
            rate: { num: "10", den: "100" },
            round: "half-up",
          },
          else: zero,
        },
      },
    },
  };
}

function adoptionAllowedRule(
  version: number,
  from: string,
  to: string,
  maxCents: string,
  thresholdCents: string,
  yearLabel: string,
  amountsExcerpt: string,
): Rule {
  const deemedExpenses: Expr = {
    kind: "if",
    cond: fact("adoptionIsSpecialNeeds"),
    then: param("maxCredit"),
    else: { kind: "min", args: [fact("qualifiedAdoptionExpenses"), param("maxCredit")] },
  };
  const phaseFraction: Expr = {
    kind: "min",
    args: [
      {
        kind: "max0",
        arg: {
          kind: "sub",
          left: ruleRef("us.federal.agi"),
          right: param("phaseoutStart"),
        },
      },
      param("phaseoutRange"),
    ],
  };
  return {
    id: "us.federal.adoption.allowed",
    version,
    jurisdiction: J,
    title: `Adoption credit after the MAGI phase-out (§ 23, ${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 23, as amended by Pub. L. 119-21 (OBBBA) § 70402; ${yearLabel === "TY2025" ? "Rev. Proc. 2024-40 § 2.04" : "Rev. Proc. 2025-32 § 3.04"}`,
      section: "§ 23(a)–(b), (f)",
      url: "https://www.law.cornell.edu/uscode/text/26/23",
      excerpt: `${amountsExcerpt} A special-needs adoption is treated as having paid the maximum regardless of actual expenses (§ 23(a)(3)). The credit is reduced by the ratio of the MAGI excess over the threshold to $40,000 (§ 23(b)(2)(A) — the $40,000 span is NOT indexed; MAGI is AGI without §§ 911/931/933, § 23(b)(2)(B) — MAGI ≈ AGI here, disclosed). Married taxpayers only on a joint return (§ 23(f)(1), rules similar to § 21(e)(2)) — MFS: $0; the living-apart exception is not modeled (conservative). The § 23(a)(2) expense-timing rules (year after payment for pre-final years; foreign adoptions only when final) are attested by the input.`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      maxCredit: { value: maxCents, type: "money" },
      phaseoutStart: { value: thresholdCents, type: "money" },
      phaseoutRange: { value: "4000000", type: "money" }, // $40,000, unindexed
    },
    formula: {
      kind: "if",
      cond: {
        kind: "or",
        args: [
          isStatus("mfs"),
          {
            kind: "not",
            arg: {
              kind: "or",
              args: [gt0(fact("qualifiedAdoptionExpenses")), fact("adoptionIsSpecialNeeds")],
            },
          },
        ],
      },
      then: zero,
      else: {
        kind: "max0",
        arg: {
          kind: "sub",
          left: deemedExpenses,
          right: {
            kind: "mulDiv",
            a: deemedExpenses,
            b: phaseFraction,
            c: param("phaseoutRange"),
            round: "half-up",
          },
        },
      },
    },
  };
}

function adoptionRefundableRule(
  version: number,
  from: string,
  to: string,
  capCents: string,
  capLabel: string,
  sourceLabel: string,
): Rule {
  return {
    id: "us.federal.adoption.refundable",
    version,
    jurisdiction: J,
    title: `Refundable portion of the adoption credit (§ 23(a)(4), ${capLabel})`,
    citation: {
      source: `26 U.S.C. § 23(a)(4) (added by Pub. L. 119-21 (OBBBA) § 70402, effective TY2025); ${sourceLabel}`,
      section: "§ 23(a)(4)",
      url: "https://www.law.cornell.edu/uscode/text/26/23",
      excerpt: `So much of the credit allowed under paragraph (1) as does not exceed ${capLabel} shall be treated as a credit allowed under subpart C [refundable] and not as a credit allowed under this subpart. [Indexed after 2025 per § 23(h)(3); only the NONREFUNDABLE remainder carries forward under § 23(c) as conformed by OBBBA § 70402(c).]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: { refundableCap: { value: capCents, type: "money" } },
    formula: {
      kind: "min",
      args: [ruleRef("us.federal.adoption.allowed"), param("refundableCap")],
    },
  };
}

export const creditBlockRules: Rule[] = [
  cdccTentativeRule(
    1,
    "2025-01-01",
    "2026-01-01",
    pct2025,
    "TY2025: 35% → 20%",
    "The applicable percentage is '35 percent reduced (but not below 20 percent) by 1 percentage point for each $2,000 (or fraction thereof) by which the taxpayer's adjusted gross income for the taxable year exceeds $15,000' (pre-OBBBA text, in force for taxable years beginning before 2026 per OBBBA § 70405(b)). Expenses capped at $3,000 (one qualifying individual) / $6,000 (two or more), § 21(c), net of the § 129 exclusion (netted by the input); limited to earned income — on a joint return, to the lesser spouse's earned income (§ 21(d)(1)). Married only on a joint return (§ 21(e)(2)) — MFS: $0; the § 21(e)(4) living-apart exception and § 21(d)(2) deemed student-spouse income are not modeled (conservative). Qualifying-individual status (§ 21(b)(1): dependent under 13, or incapable of self-care) is attested by the count input.",
  ),
  cdccTentativeRule(
    2,
    "2026-01-01",
    "2027-01-01",
    pct2026,
    "TY2026: OBBBA 50% → 35% → 20%",
    "OBBBA § 70405 (taxable years beginning after December 31, 2025): the applicable percentage 'means 50 percent— (A) reduced (but not below 35 percent) by 1 percentage point for each $2,000 or fraction thereof by which the taxpayer's adjusted gross income for the taxable year exceeds $15,000, and (B) further reduced (but not below 20 percent) by 1 percentage point for each $2,000 ($4,000 in the case of a joint return) or fraction thereof by which the taxpayer's adjusted gross income for the taxable year exceeds $75,000 ($150,000 in the case of a joint return).' Expense caps $3,000/$6,000 (§ 21(c), unindexed, unchanged by the OBBBA), limited to earned income — joint returns to the lesser spouse's earned income (§ 21(d)(1)). Married only on a joint return (§ 21(e)(2)) — MFS: $0; § 21(e)(4) and § 21(d)(2) not modeled (conservative). Qualifying-individual status attested by the count input.",
  ),
  {
    id: "us.federal.cdcc",
    version: 1,
    jurisdiction: J,
    title: "Child and dependent care credit, limited to tax (§ 26(a))",
    citation: {
      source: "26 U.S.C. § 21; § 26(a); Form 2441",
      section: "§ 21(a); § 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/21",
      excerpt:
        "The § 21 credit is a nonrefundable personal credit limited to the § 26(a) tax liability (Form 2441 Credit Limit Worksheet) — the first credit in this corpus's ordering, so limited to the full regular tax + AMT.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [ruleRef("us.federal.cdcc.tentative"), { kind: "max0", arg: limitBase }],
    },
  },
  saversTentativeRule(
    1,
    "2025-01-01",
    "2026-01-01",
    {
      t50: saversTier("4750000", "3562500", "2375000"),
      t20: saversTier("5100000", "3825000", "2550000"),
      t10: saversTier("7900000", "5925000", "3950000"),
    },
    "TY2025",
    "Notice 2024-80",
    "For 2025 (Notice 2024-80): joint 50% to $47,500, 20% to $51,000, 10% to $79,000; head of household $35,625/$38,250/$59,250; all other statuses $23,750/$25,500/$39,500 — zero above.",
  ),
  saversTentativeRule(
    2,
    "2026-01-01",
    "2027-01-01",
    {
      t50: saversTier("4850000", "3637500", "2425000"),
      t20: saversTier("5250000", "3937500", "2625000"),
      t10: saversTier("8050000", "6037500", "4025000"),
    },
    "TY2026",
    "Notice 2025-67",
    "For 2026 (Notice 2025-67): joint 50% to $48,500, 20% to $52,500, 10% to $80,500; head of household $36,375/$39,375/$60,375; all other statuses $24,250/$26,250/$40,250 — zero above.",
  ),
  {
    id: "us.federal.savers_credit",
    version: 1,
    jurisdiction: J,
    title: "Saver's credit, limited to remaining tax (§ 26(a) after CDCC + education)",
    citation: {
      source: "26 U.S.C. § 25B; § 26(a); Form 8880 Credit Limit Worksheet",
      section: "§ 25B(a); § 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/25B",
      excerpt:
        "Nonrefundable, limited to the tax remaining after the credits the Form 8880 worksheet subtracts first — here the § 21 dependent-care and § 25A education credits.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.savers.tentative"),
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: limitBase,
            right: {
              kind: "add",
              args: [
                ruleRef("us.federal.cdcc"),
                ruleRef("us.federal.education.nonrefundable"),
              ],
            },
          },
        },
      ],
    },
  },
  adoptionAllowedRule(
    1,
    "2025-01-01",
    "2026-01-01",
    "1728000",
    "25919000",
    "TY2025",
    "For taxable years beginning in 2025, the credit allowed for an adoption of a child with special needs is $17,280; the maximum credit allowed for other adoptions is the amount of qualified adoption expenses up to $17,280; phase-out begins at modified adjusted gross income in excess of $259,190 and is complete at $299,190 (Rev. Proc. 2024-40 § 2.04, verbatim).",
  ),
  adoptionAllowedRule(
    2,
    "2026-01-01",
    "2027-01-01",
    "1767000",
    "26508000",
    "TY2026",
    "For taxable years beginning in 2026, the credit allowed for an adoption of a child with special needs is $17,670; the maximum credit allowed for other adoptions is the amount of qualified adoption expenses up to $17,670; phase-out begins at modified adjusted gross income in excess of $265,080 and is complete at $305,080 (Rev. Proc. 2025-32 § 3.04, verbatim).",
  ),
  adoptionRefundableRule(1, "2025-01-01", "2026-01-01", "500000", "$5,000", "statutory, unindexed for 2025"),
  adoptionRefundableRule(2, "2026-01-01", "2027-01-01", "512000", "$5,120", "Rev. Proc. 2025-32 § 3.04(3)"),
  {
    id: "us.federal.adoption.nonrefundable",
    version: 1,
    jurisdiction: J,
    title:
      "Nonrefundable adoption credit, limited to remaining tax (§ 26(a) after CDCC + education + saver's)",
    citation: {
      source: "26 U.S.C. § 23(a), (b)(4); § 26(a); Form 8839",
      section: "§ 23(b)(4); § 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/23",
      excerpt:
        "The credit allowed net of its § 23(a)(4) refundable portion, limited to the tax remaining after the credits the Form 8839 worksheet subtracts first — here the §§ 21, 25A, and 25B credits.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.adoption.allowed"),
            right: ruleRef("us.federal.adoption.refundable"),
          },
        },
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: limitBase,
            right: {
              kind: "add",
              args: [
                ruleRef("us.federal.cdcc"),
                ruleRef("us.federal.education.nonrefundable"),
                ruleRef("us.federal.savers_credit"),
              ],
            },
          },
        },
      ],
    },
  },
  {
    id: "us.federal.adoption.carryforward",
    version: 1,
    jurisdiction: J,
    title: "Adoption credit carryforward generated (§ 23(c), nonrefundable portion only)",
    citation: {
      source: "26 U.S.C. § 23(c), as conformed by Pub. L. 119-21 (OBBBA) § 70402(c)",
      section: "§ 23(c)(1)–(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/23",
      excerpt:
        "The nonrefundable portion in excess of the § 26(a) limitation carries to the succeeding taxable year — 'No credit may be carried forward under this subsection to any taxable year following the fifth taxable year after the taxable year in which the credit arose.' The refundable § 23(a)(4) portion never carries. [This target reports the carryforward generated this year; prior-year carryforwards are not tracked.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.adoption.allowed"),
            right: ruleRef("us.federal.adoption.refundable"),
          },
        },
        right: ruleRef("us.federal.adoption.nonrefundable"),
      },
    },
  },
];
