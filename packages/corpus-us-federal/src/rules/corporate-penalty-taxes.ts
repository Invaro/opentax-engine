/**
 * The two corporate penalty regimes — verified July 2026 (both statutory,
 * unindexed, unchanged by the OBBBA).
 *
 * Accumulated earnings tax (§§ 531–537): 20% of accumulated taxable
 * income — taxable income adjusted under § 535(b) (federal income tax
 * subtracted; the DRD and NOL deductions added back, § 535(b)(3)–(4)),
 * minus the dividends-paid deduction, minus the accumulated earnings
 * credit: the GREATER of retained amounts for the reasonable needs of the
 * business or the $250,000 minimum ($150,000 for health/law/engineering/
 * architecture/accounting/actuarial/performing-arts/consulting service
 * corporations) less accumulated E&P at year start.
 *
 * Personal holding company tax (§§ 541–547): 20% of undistributed PHC
 * income, when BOTH § 542 tests hold: at least 60% of adjusted ordinary
 * gross income is PHC income (dividends, interest, royalties, rents…),
 * and more than 50% of the stock (by value) was owned by 5 or fewer
 * individuals during the last half of the year.
 *
 * § 532(b)(1): the AET does not apply to a personal holding company —
 * evaluate the PHC target for a PHC; both taxes never stack.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const pct20 = (base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num: "20", den: "100" },
  round: "half-up",
});

export const corporatePenaltyTaxRules: Rule[] = [
  {
    id: "us.federal.corp.accumulated_earnings_tax",
    version: 1,
    jurisdiction: J,
    title: "Accumulated earnings tax — 20% of accumulated taxable income (§ 531)",
    citation: {
      source: "26 U.S.C. §§ 531, 535",
      section: "§ 531; § 535(a)–(c)",
      url: "https://www.law.cornell.edu/uscode/text/26/531",
      excerpt:
        "…a tax equal to 20 percent of the accumulated taxable income: taxable income adjusted under § 535(b) — federal income taxes accrued are subtracted, and the special deductions of part VIII [the DRD] and the § 172 NOL deduction are not allowed (added back) — minus the dividends paid deduction and the accumulated earnings credit. The credit is not 'less than the amount by which $250,000 exceeds the accumulated earnings and profits… at the close of the preceding taxable year' ($150,000 for health, law, engineering, architecture, accounting, actuarial-science, performing-arts, or consulting service corporations), and not less than amounts retained for the reasonable needs of the business (§ 537 — attested by the retention fact). [Not modeled, disclosed: the § 535(b)(2) unlimited-charitable and (b)(5)–(6) capital gain/loss adjustments; § 532(b)(1) — this tax does NOT apply to a personal holding company.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      minimumCredit: { value: "25000000", type: "money" }, // $250,000
      minimumCreditService: { value: "15000000", type: "money" }, // $150,000
    },
    formula: pct20({
      kind: "max0",
      arg: {
        kind: "sub",
        left: {
          // § 535(b): TI + DRD addback + NOL addback − federal income tax
          kind: "sub",
          left: {
            kind: "add",
            args: [
              ruleRef("us.federal.corp.taxable_income"),
              ruleRef("us.federal.corp.dividends_received_deduction"),
              ruleRef("us.federal.corp.nol_deduction"),
            ],
          },
          right: ruleRef("us.federal.corp.income_tax"),
        },
        right: {
          kind: "add",
          args: [
            fact("corpDividendsPaid"),
            {
              // accumulated earnings credit: greater of reasonable-needs
              // retention or the $250k/$150k minimum less starting E&P
              kind: "max",
              args: [
                fact("corpReasonableNeedsRetention"),
                {
                  kind: "max0",
                  arg: {
                    kind: "sub",
                    left: {
                      kind: "if",
                      cond: fact("corpIsPersonalServiceCorp"),
                      then: { kind: "param", name: "minimumCreditService" },
                      else: { kind: "param", name: "minimumCredit" },
                    },
                    right: fact("corpAccumulatedEandPStart"),
                  },
                },
              ],
            },
          ],
        },
      },
    }),
  },
  {
    id: "us.federal.corp.is_personal_holding_company",
    version: 1,
    jurisdiction: J,
    title: "Personal holding company determination (§ 542 income + ownership tests)",
    citation: {
      source: "26 U.S.C. § 542(a)",
      section: "§ 542(a)(1)–(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/542",
      excerpt:
        "…'personal holding company' means any corporation if (1) at least 60 percent of its adjusted ordinary gross income… is personal holding company income [dividends, interest, royalties, annuities, certain rents — § 543], and (2) at any time during the last half of the taxable year more than 50 percent in value of its outstanding stock is owned, directly or indirectly, by or for not more than 5 individuals. [The § 542(c) excluded classes (banks, insurance…) and § 544 constructive-ownership attribution are attested by the input facts — disclosed.]",
    },
    ...FROM,
    output: { type: "bool" },
    formula: {
      kind: "and",
      args: [
        {
          kind: "cmp",
          op: "ge",
          left: fact("corpPHCIncome"),
          right: {
            kind: "mulRate",
            base: fact("corpAdjustedOrdinaryGrossIncome"),
            rate: { num: "60", den: "100" },
            round: "half-up",
          },
        },
        fact("corpOwnedByFiveOrFewer"),
      ],
    },
  },
  {
    id: "us.federal.corp.phc_tax",
    version: 1,
    jurisdiction: J,
    title: "Personal holding company tax — 20% of undistributed PHC income (§ 541)",
    citation: {
      source: "26 U.S.C. §§ 541, 545",
      section: "§ 541; § 545",
      url: "https://www.law.cornell.edu/uscode/text/26/541",
      excerpt:
        "…a personal holding company tax equal to 20 percent of the undistributed personal holding company income — taxable income adjusted under § 545 (federal taxes and the dividends-paid deduction subtracted; provide the adjusted amount as the input fact). Zero when the § 542 tests fail. [In addition to the § 11 tax; the AET never stacks with it (§ 532(b)(1)).]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: ruleRef("us.federal.corp.is_personal_holding_company"),
      then: pct20(fact("corpUndistributedPHCIncome")),
      else: money("0"),
    },
  },
];
