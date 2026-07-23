/**
 * Corporate annualized-income installments — 26 U.S.C. § 6655(e).
 *
 * A corporation with uneven income may pay each installment as the
 * applicable percentage (25/50/75/100) of the tax on ANNUALIZED taxable
 * income for the statutory periods — the first 3 months (installments 1
 * and 2), 6 months (installment 3), and 9 months (installment 4),
 * annualized ×4, ×4, ×2, ×4/3 (§ 6655(e)(2)(A)) — with any shortfall
 * against the regular installment recaptured in the next one
 * (§ 6655(e)(1)(B)); the recapture telescopes to
 * (installment# × 25% of the required annual payment − Σ prior).
 *
 * The tax on annualized income is the flat § 11 21% — the § 250
 * deduction, credits, and the § 6655(e)(2)(C) elective 2/4/7/10-month
 * periods are not annualized here (disclosed); exact cents where the
 * form rounds dollars.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });

interface CorpQuarter {
  n: 1 | 2 | 3 | 4;
  tiFact: string;
  factor: { num: string; den: string };
  pct: { num: string; den: string };
  periodLabel: string;
}

const QUARTERS: CorpQuarter[] = [
  { n: 1, tiFact: "corpTIThrough3Months", factor: { num: "4", den: "1" }, pct: { num: "25", den: "100" }, periodLabel: "first 3 months ×4, 25%" },
  { n: 2, tiFact: "corpTIThrough3Months", factor: { num: "4", den: "1" }, pct: { num: "50", den: "100" }, periodLabel: "first 3 months ×4, 50%" },
  { n: 3, tiFact: "corpTIThrough6Months", factor: { num: "2", den: "1" }, pct: { num: "75", den: "100" }, periodLabel: "first 6 months ×2, 75%" },
  { n: 4, tiFact: "corpTIThrough9Months", factor: { num: "4", den: "3" }, pct: { num: "100", den: "100" }, periodLabel: "first 9 months ×4/3, 100%" },
];

export const corporateAnnualizedRules: Rule[] = QUARTERS.map((q): Rule => {
  const annualizedTax: Expr = {
    kind: "mulRate",
    base: {
      kind: "mulRate",
      base: fact(q.tiFact),
      rate: q.factor,
      round: "half-up",
    },
    rate: { num: "21", den: "100" },
    round: "half-up",
  };
  const line: Expr = {
    kind: "mulRate",
    base: annualizedTax,
    rate: q.pct,
    round: "half-up",
  };
  const regular25: Expr = {
    kind: "mulRate",
    base: ruleRef("us.federal.corp.estimated.required_annual_payment"),
    rate: { num: "25", den: "100" },
    round: "half-up",
  };
  const priorSum: Expr =
    q.n === 1
      ? money("0")
      : {
          kind: "add",
          args: Array.from({ length: q.n - 1 }, (_, j) =>
            ruleRef(`us.federal.corp.annualized_installment_q${j + 1}`),
          ),
        };
  return {
    id: `us.federal.corp.annualized_installment_q${q.n}`,
    version: 1,
    jurisdiction: J,
    title: `Corporate annualized required installment #${q.n} (§ 6655(e): ${q.periodLabel})`,
    citation: {
      source: "26 U.S.C. § 6655(e); Form 1120-W (historical) method",
      section: "§ 6655(e)(1), (2)(A)",
      url: "https://www.law.cornell.edu/uscode/text/26/6655",
      excerpt: `Installment #${q.n}: annualize taxable income for the ${q.periodLabel.split(",")[0]} period, take 21 percent, apply the ${q.pct.num}% applicable percentage, subtract earlier installments, and cap at installment# × 25% of the required annual payment minus earlier installments (the § 6655(e)(1)(B) recapture, telescoped). [The § 250 deduction and credits are not annualized; the elective alternative monthly periods of § 6655(e)(2)(C) are not modeled — disclosed. Exact cents.]`,
    },
    effectiveFrom: "2025-01-01", // statutory method: open-ended
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        { kind: "max0", arg: { kind: "sub", left: line, right: priorSum } },
        {
          kind: "sub",
          left: {
            kind: "mulInt",
            base: regular25,
            count: { kind: "int", value: String(q.n) },
          },
          right: priorSum,
        },
      ],
    },
  };
});
