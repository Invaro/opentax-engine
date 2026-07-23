/**
 * Employer-side targets — verified July 2026.
 *
 * Payroll tax per employee (§§ 3111, 3301–3302): the employer's 6.2%
 * social security share up to the SSA wage base ($176,100 for 2025;
 * $184,500 for 2026), 1.45% Medicare on all wages, and FUTA — 6.0% on the
 * first $7,000 less the full 5.4% state credit = 0.6% (the wage base is
 * unchanged since 1983; a full-credit, non-credit-reduction state is
 * assumed and disclosed).
 *
 * Research credit (§ 41(c)(4)): the alternative simplified credit — 14%
 * of qualified research expenses over 50% of the prior-3-year average,
 * or 6% of current QREs when the taxpayer had none in any prior year.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const param = (name: string): Expr => ({ kind: "param", name });
const rate = (num: string, den: string, base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den },
  round: "half-up",
});

function payrollRule(
  version: number,
  from: string,
  to: string,
  wageBaseCents: string,
  yearLabel: string,
  baseLabel: string,
): Rule {
  return {
    id: "us.federal.employer.payroll_tax",
    version,
    jurisdiction: J,
    title: `Employer payroll tax per employee (FICA + FUTA, TY${yearLabel})`,
    citation: {
      source: "26 U.S.C. §§ 3111(a)–(b), 3301, 3302; SSA wage base announcement",
      section: "§ 3111; §§ 3301–3302",
      url: "https://www.law.cornell.edu/uscode/text/26/3111",
      excerpt: `The employer share: 6.2 percent of wages up to the ${baseLabel} contribution and benefit base for ${yearLabel}, plus 1.45 percent of all wages (the employer does not match the employee's 0.9% Additional Medicare), plus FUTA at 6.0 percent of the first $7,000 less the 5.4 percent credit for timely state unemployment contributions — net 0.6 percent ($42 maximum; full credit and no § 3302(c) credit-reduction state assumed, disclosed).`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      ssWageBase: { value: wageBaseCents, type: "money" },
      futaWageBase: { value: "700000", type: "money" }, // $7,000 (since 1983)
    },
    formula: {
      kind: "add",
      args: [
        rate("62", "1000", {
          kind: "min",
          args: [fact("employeeAnnualWages"), param("ssWageBase")],
        }),
        rate("145", "10000", fact("employeeAnnualWages")),
        rate("6", "1000", {
          kind: "min",
          args: [fact("employeeAnnualWages"), param("futaWageBase")],
        }),
      ],
    },
  };
}

export const employerRules: Rule[] = [
  payrollRule(1, "2025-01-01", "2026-01-01", "17610000", "2025", "$176,100"),
  payrollRule(2, "2026-01-01", "2027-01-01", "18450000", "2026", "$184,500"),
  {
    id: "us.federal.credit.research_asc",
    version: 1,
    jurisdiction: J,
    title: "Research credit — alternative simplified credit (§ 41(c)(4))",
    citation: {
      source: "26 U.S.C. § 41(c)(4); Form 6765",
      section: "§ 41(c)(4)(A)–(B)",
      url: "https://www.law.cornell.edu/uscode/text/26/41",
      excerpt:
        "…the alternative simplified credit equals 14 percent of so much of the qualified research expenses… as exceeds 50 percent of the average qualified research expenses for the 3 taxable years preceding — or, if the taxpayer has no qualified research expenses in any one of the 3 preceding taxable years, 6 percent of the current year's QREs. [This is the GROSS credit: the § 38 general-business-credit limitation and the § 280C(c) interaction with the § 174A deduction (reduced-credit election) are not modeled — disclosed. Qualified-research (§ 41(d)) qualification of the expenses is attested by the inputs.]",
    },
    effectiveFrom: "2025-01-01", // statutory, unindexed: open-ended
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "eq",
        left: fact("qreAvgPrior3Years"),
        right: money("0"),
      },
      then: rate("6", "100", fact("qreCurrentYear")),
      else: rate("14", "100", {
        kind: "max0",
        arg: {
          kind: "sub",
          left: fact("qreCurrentYear"),
          right: rate("50", "100", fact("qreAvgPrior3Years")),
        },
      }),
    },
  },
];
