/**
 * Residual guards — the last silent-gap killers. Verified July 2026.
 *
 * Schedule H (§§ 3101/3111 via § 3121(a)(7)(B), (x)): FICA attaches to a
 * household employee's cash wages only once they reach the SSA-indexed
 * threshold — $2,800 for 2025 (89 FR 85276; 2025 Schedule H instructions)
 * and $3,000 for 2026 (90 FR 49047) — then applies from dollar one.
 * Combined employer+employee FICA = 15.3%. FUTA: 6.0% on the first
 * $7,000 if $1,000+ was paid in any calendar quarter (§ 3306(c)(2)),
 * with the full 5.4% state credit assumed (net 0.6%) — attested.
 * Modeled for ONE household employee — disclosed.
 *
 * § 6654(i) farmers/fishermen: the safe harbor substitutes 66⅔% for 90%
 * and drops the 110% high-AGI prong; one installment, due January 15.
 * Qualification (⅔ of gross income from farming/fishing this year or
 * last) is attested by the flag.
 *
 * § 280A home office, simplified method (Rev. Proc. 2013-13): $5 per
 * square foot up to 300 sq ft, limited by business gross income —
 * exposed as a STANDALONE target (net it into --se-profit yourself: it
 * changes SE tax and QBI). The actual-expense method is not modeled.
 *
 * REIT/RIC (§§ 857/852): entity tax is § 11 on income NET of the
 * dividends-paid deduction with 90% distribution requirements — ordinary
 * 1120 logic would be silently wrong, so REIT/RIC returns REFUSE.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

function householdRule(
  version: number,
  from: string,
  to: string,
  thresholdCents: string,
  thresholdLabel: string,
  sourceLabel: string,
): Rule {
  return {
    id: "us.federal.household_employment_taxes",
    version,
    jurisdiction: J,
    title: `Household employment taxes — Schedule H (${thresholdLabel} FICA threshold)`,
    citation: {
      source: `26 U.S.C. §§ 3101, 3111, 3121(a)(7)(B), (x), 3306(c)(2); ${sourceLabel}`,
      section: "§ 3121(a)(7)(B), (x); § 3306(c)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/3121",
      excerpt: `Cash remuneration for domestic service in the employer's private home is excluded from FICA wages 'if the cash remuneration paid in such year… is less than the applicable dollar threshold' — ${thresholdLabel} for this year (${sourceLabel}); at or above it, the combined employer and employee FICA (12.4% OASDI + 2.9% Medicare = 15.3%) applies to ALL the wages. FUTA applies if $1,000+ was paid in any calendar quarter of this or the prior year (§ 3306(c)(2), attested by the flag): 6.0% of the first $7,000, net 0.6% with the full 5.4% state-contribution credit assumed — attested. [ONE household employee modeled; the § 3121(b)(3) family exclusions (spouse, child under 21, certain parents, under-18 students) and the OASDI wage base are attested/assumed by the input; income-tax withholding for the employee is not modeled.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      ficaThreshold: { value: thresholdCents, type: "money" },
      futaWageCap: { value: "700000", type: "money" }, // $7,000
    },
    formula: {
      kind: "add",
      args: [
        {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "ge",
            left: fact("householdEmployeeCashWages"),
            right: param("ficaThreshold"),
          },
          then: {
            kind: "mulRate",
            base: fact("householdEmployeeCashWages"),
            rate: { num: "153", den: "1000" },
            round: "half-up",
          },
          else: zero,
        },
        {
          kind: "if",
          cond: fact("householdFutaTestMet"),
          then: {
            kind: "mulRate",
            base: {
              kind: "min",
              args: [fact("householdEmployeeCashWages"), param("futaWageCap")],
            },
            rate: { num: "6", den: "1000" }, // net 0.6% (full state credit attested)
            round: "half-up",
          },
          else: zero,
        },
      ],
    },
  };
}

export const residualRules: Rule[] = [
  householdRule(
    1, "2025-01-01", "2026-01-01",
    "280000", "$2,800",
    "89 FR 85276; 2025 Instructions for Schedule H",
  ),
  householdRule(
    2, "2026-01-01", "2027-01-01",
    "300000", "$3,000",
    "90 FR 49047",
  ),
  {
    id: "us.federal.estimated.required_annual_payment.farmer",
    version: 1,
    jurisdiction: J,
    title: "Required annual payment — farmers and fishermen (66⅔%, § 6654(i))",
    citation: {
      source: "26 U.S.C. § 6654(i)",
      section: "§ 6654(i)(1)–(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/6654",
      excerpt:
        "If an individual is a farmer or fisherman… there shall be only 1 required installment… the due date… shall be January 15 of the following taxable year… the amount… shall be equal to the required annual payment determined under subsection (d)(1)(B) by substituting '66⅔ percent' for '90 percent' and without regard to subparagraph (C) of subsection (d)(1) [the 110% high-AGI prong]. Qualification — gross income from farming or fishing (including oyster farming) at least 66⅔ percent of total gross income this year or the preceding year — is ATTESTED by the isFarmerOrFisherman flag. [Filing and paying in full by March 1 avoids the addition entirely (§ 6654(i)(1)(D)); the single installment equals this full amount, not 25% of it.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    applicability: fact("isFarmerOrFisherman"),
    formula: {
      kind: "min",
      args: [
        {
          kind: "mulRate",
          base: ruleRef("us.federal.net_tax"),
          rate: { num: "2", den: "3" }, // 66⅔ percent, exact
          round: "half-up",
        },
        {
          kind: "mulRate",
          base: fact("priorYearTax"),
          rate: { num: "1", den: "1" },
          round: "half-up",
        },
      ],
    },
    overrides: {
      ruleId: "us.federal.estimated.required_annual_payment",
      priority: 20, // beats the 110% high-AGI override — § 6654(i)(1)(C) disregards (d)(1)(C)
    },
  },
  {
    id: "us.federal.home_office_simplified",
    version: 1,
    jurisdiction: J,
    title: "Home office deduction — simplified safe harbor ($5/sq ft, 300 sq ft cap)",
    citation: {
      source: "26 U.S.C. § 280A(c); Rev. Proc. 2013-13",
      section: "Rev. Proc. 2013-13 § 4.01",
      url: "https://www.irs.gov/pub/irs-drop/rp-13-13.pdf",
      excerpt:
        "The allowable square footage is the portion of a home used in a qualified business use of the home, but not to exceed 300 square feet… The prescribed rate is $5.00 (Rev. Proc. 2013-13 § 4.01, verbatim). Limited to gross income from the business use (§ 280A(c)(5) — approximated by the SE net profit input; no carryover under the safe harbor). [A STANDALONE determination: subtract the result from your --se-profit yourself — it changes SE tax and § 199A QBI. Exclusive-and-regular use and the § 280A(c)(1) principal-place-of-business tests are attested by the input; the actual-expense method (depreciation, allocation, carryovers) is not modeled.]",
    },
    effectiveFrom: "2025-01-01", // Rev. Proc. 2013-13 rate, unchanged
    output: { type: "money" },
    parameters: {
      ratePerSqFt: { value: "500", type: "money" }, // $5.00
      sqFtCap: { value: "300", type: "int" },
    },
    formula: {
      kind: "if",
      cond: gt0AsInt(fact("homeOfficeSquareFeet")),
      then: {
        kind: "min",
        args: [
          {
            kind: "mulInt",
            base: param("ratePerSqFt"),
            count: {
              kind: "min",
              args: [fact("homeOfficeSquareFeet"), param("sqFtCap")],
            },
          },
          fact("selfEmploymentNetProfit"),
        ],
      },
      else: zero,
    },
  },
];

/** int > 0 comparison (int facts compare against int literals). */
function gt0AsInt(e: Expr): Expr {
  return { kind: "cmp", op: "gt", left: e, right: { kind: "int", value: "0" } };
}
