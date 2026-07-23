/**
 * Annualized-income installment method — 26 U.S.C. § 6654(d)(2), encoded
 * from the printed 2025 Form 2210 Schedule AI (read from the PDF):
 *
 *   periods 1/1–3/31, –5/31, –8/31, –12/31
 *   line 2/5 annualization amounts: 4 · 2.4 · 1.5 · 1
 *   line 7: the standard deduction in FULL each column
 *   line 20 applicable percentages: 22.5% · 45% · 67.5% · 90%
 *   lines 22–27 recapture: 23 = max0(21 − Σ prior line 27);
 *     26 = 25% of the RAP + the prior column's unused limit, which
 *     telescopes to (column# × 25%RAP − Σ prior 27); 27 = min(23, 26)
 *   Part II (annualized SE tax): line 28 = 92.35% of the period's net
 *     profit; line 29 prorated social security limits (2025 printed:
 *     $44,025 / $73,375 / $117,400 / $176,100 = the wage base × 1/4,
 *     5/12, 2/3, 1 — the 2026 schedule publishes with the 2026 filing
 *     season; its limits are computed here by the same printed method
 *     from the SSA-announced $184,500 base: $46,125 / $76,875 /
 *     $123,000 / $184,500); line 32 rates 0.496/0.2976/0.186/0.124
 *     (12.4% × factor) on the capped amount; line 34 rates
 *     0.116/0.0696/0.0435/0.029 (2.9% × factor) on all net earnings.
 *   The ½-SE-tax deduction inside each period's AGI is the period's
 *   annualized SE tax divided back by the annualization factor, halved.
 *
 * SCOPE (refuses beyond it, never approximates silently): the wage + SE
 * freelancer core — any interest, capital gains/losses, tips, overtime,
 * car-loan/charity/SALT/mortgage/medical, HSA, student-loan, IRA,
 * education, children, senior/blind/dependent/kiddie facts make this
 * method refuse. Per-column credits (Schedule AI line 18) are not
 * modeled — omitting them can only OVERSTATE an installment
 * (conservative for penalty avoidance). Exact cents throughout; the
 * paper form's whole-dollar line rounding may differ by small amounts.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { ordinaryRateTaxExpr } from "./income-tax.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

// the modeled-scope guard: any of these present → refuse loudly
const OUT_OF_SCOPE: Expr = {
  kind: "or",
  args: [
    gt0(fact("taxableInterest")),
    gt0(fact("longTermCapitalGains")),
    gt0(fact("netCapitalLoss")),
    gt0(fact("shortTermCapitalLoss")),
    gt0(fact("longTermCapitalLoss")),
    gt0(fact("qualifiedTips")),
    gt0(fact("qualifiedOvertimePremium")),
    gt0(fact("carLoanInterest")),
    gt0(fact("charitableCashContributions")),
    gt0(fact("stateAndLocalTaxesPaid")),
    gt0(fact("mortgageInterestPaid")),
    gt0(fact("medicalExpenses")),
    gt0(fact("hsaContribution")),
    gt0(fact("studentLoanInterest")),
    gt0(fact("iraContribution")),
    gt0(fact("aotcExpensesStudent1")),
    gt0(fact("aotcExpensesStudent2")),
    gt0(fact("aotcExpensesStudent3")),
    gt0(fact("llcQualifiedExpenses")),
    {
      kind: "cmp",
      op: "gt",
      left: fact("qualifyingChildren"),
      right: { kind: "int", value: "0" },
    },
    fact("isAge65OrOlder"),
    fact("isBlind"),
    fact("isClaimedAsDependent"),
    fact("isSubjectToKiddieTax"),
  ],
};

interface Quarter {
  n: 1 | 2 | 3 | 4;
  /** annualization factor as a rational */
  num: string;
  den: string;
  pct: { num: string; den: string };
  oasdi: { num: string; den: string }; // 12.4% × factor (printed line 32)
  medicare: { num: string; den: string }; // 2.9% × factor (printed line 34)
  /** cumulative-facts ids; null = use the full-year facts */
  wagesFact: string | null;
  seFact: string | null;
}

const QUARTERS: Quarter[] = [
  { n: 1, num: "4", den: "1", pct: { num: "225", den: "1000" }, oasdi: { num: "496", den: "1000" }, medicare: { num: "116", den: "1000" }, wagesFact: "wagesThroughMar31", seFact: "seProfitThroughMar31" },
  { n: 2, num: "12", den: "5", pct: { num: "45", den: "100" }, oasdi: { num: "2976", den: "10000" }, medicare: { num: "696", den: "10000" }, wagesFact: "wagesThroughMay31", seFact: "seProfitThroughMay31" },
  { n: 3, num: "3", den: "2", pct: { num: "675", den: "1000" }, oasdi: { num: "186", den: "1000" }, medicare: { num: "435", den: "10000" }, wagesFact: "wagesThroughAug31", seFact: "seProfitThroughAug31" },
  { n: 4, num: "1", den: "1", pct: { num: "90", den: "100" }, oasdi: { num: "124", den: "1000" }, medicare: { num: "29", den: "1000" }, wagesFact: null, seFact: null },
];

/** cumulative period fact, demanded only when the year fact is nonzero */
function cumulative(yearFactId: string, periodFactId: string | null): Expr {
  if (periodFactId === null) return fact(yearFactId);
  return {
    kind: "if",
    cond: gt0(fact(yearFactId)),
    then: fact(periodFactId),
    else: zero,
  };
}

function quarterRule(
  q: Quarter,
  year: "2025" | "2026",
  from: string,
  to: string,
  proratedLimitCents: string,
  proratedLabel: string,
  withQbiMinimum: boolean,
): Rule {
  const cumWages = cumulative("wages", q.wagesFact);
  const cumSE = cumulative("selfEmploymentNetProfit", q.seFact);

  // Part II — annualized self-employment tax
  const netEarn: Expr = {
    kind: "mulRate",
    base: cumSE,
    rate: { num: "9235", den: "10000" },
    round: "half-up",
  };
  const ssRoom: Expr = {
    kind: "max0",
    arg: { kind: "sub", left: money(proratedLimitCents), right: cumWages },
  };
  const seTax: Expr = {
    kind: "add",
    args: [
      {
        kind: "mulRate",
        base: { kind: "min", args: [netEarn, ssRoom] },
        rate: q.oasdi,
        round: "half-up",
      },
      { kind: "mulRate", base: netEarn, rate: q.medicare, round: "half-up" },
    ],
  };
  // the period's ½-SE deduction: annualized SE tax ÷ factor, halved
  const halfSePeriod: Expr = {
    kind: "mulDiv",
    a: seTax,
    b: money(String(BigInt(q.den))), // × den
    c: money(String(2n * BigInt(q.num))), // ÷ 2·num
    round: "half-up",
  };

  const factorRate = { num: q.num, den: q.den };
  const agiPeriod: Expr = {
    kind: "sub",
    left: { kind: "add", args: [cumWages, cumSE] },
    right: halfSePeriod,
  };
  const annualizedAgi: Expr = {
    kind: "mulRate",
    base: agiPeriod,
    rate: factorRate,
    round: "half-up",
  };
  const tiBeforeQbi: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: annualizedAgi,
      right: ruleRef("us.federal.standard_deduction"), // line 7: in FULL
    },
  };
  const qbiBase: Expr = {
    kind: "mulRate",
    base: { kind: "max0", arg: { kind: "sub", left: cumSE, right: halfSePeriod } },
    rate: factorRate,
    round: "half-up",
  };
  const qbiCore: Expr = {
    kind: "min",
    args: [
      { kind: "mulRate", base: qbiBase, rate: { num: "20", den: "100" }, round: "half-up" },
      { kind: "mulRate", base: tiBeforeQbi, rate: { num: "20", den: "100" }, round: "half-up" },
    ],
  };
  const qbi: Expr = withQbiMinimum
    ? {
        kind: "if",
        cond: { kind: "cmp", op: "ge", left: qbiBase, right: money("100000") },
        then: { kind: "max", args: [qbiCore, money("40000")] }, // OBBBA $400 min
        else: qbiCore,
      }
    : qbiCore;
  const ti: Expr = { kind: "max0", arg: { kind: "sub", left: tiBeforeQbi, right: qbi } };

  const line17: Expr = {
    kind: "add",
    args: [ordinaryRateTaxExpr(ti, "filingStatus", year), seTax],
  };
  const line21: Expr = { kind: "mulRate", base: line17, rate: q.pct, round: "half-up" };
  const line24: Expr = {
    kind: "mulRate",
    base: ruleRef("us.federal.estimated.required_annual_payment"),
    rate: { num: "25", den: "100" },
    round: "half-up",
  };
  const priorSum: Expr =
    q.n === 1
      ? zero
      : {
          kind: "add",
          args: Array.from({ length: q.n - 1 }, (_, j) =>
            ruleRef(`us.federal.estimated.annualized_installment_q${j + 1}`),
          ),
        };
  const line27: Expr = {
    kind: "min",
    args: [
      { kind: "max0", arg: { kind: "sub", left: line21, right: priorSum } }, // line 23
      {
        // line 26, telescoped: column# × 25%RAP − Σ prior installments
        kind: "sub",
        left: { kind: "mulInt", base: line24, count: { kind: "int", value: String(q.n) } },
        right: priorSum,
      },
    ],
  };

  return {
    id: `us.federal.estimated.annualized_installment_q${q.n}`,
    version: year === "2025" ? 3 : 4, // v1/v2 predated the per-bucket capital-loss facts in the scope guard
    jurisdiction: J,
    title: `Annualized-income required installment #${q.n} (§ 6654(d)(2), TY${year})`,
    citation: {
      source: `26 U.S.C. § 6654(d)(2); ${year} Form 2210 Schedule AI`,
      section: "§ 6654(d)(2); Schedule AI",
      url: "https://www.irs.gov/forms-pubs/about-form-2210",
      excerpt: `Installment #${q.n}: annualize the period's income by ${q.num === q.den ? "1" : Number(q.num) / Number(q.den)} (Schedule AI line 2), standard deduction in full (line 7), annualized SE tax per Part II (prorated social security limit ${proratedLabel}; printed factor-embedded rates), take ${Number(q.pct.num) / (Number(q.pct.den) / 100)}% of the resulting tax (line 20), subtract earlier columns' installments, and cap at 25% of the required annual payment plus amounts saved in earlier columns (lines 22–27). [Scope: the wage + self-employment core; anything else refuses. Per-column credits (line 18) not modeled — can only overstate an installment, conservative. Exact cents; the paper form's whole-dollar rounding may differ by small amounts. Cumulative period facts are demanded only for nonzero year amounts.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: OUT_OF_SCOPE,
      then: {
        kind: "unsupported",
        reason:
          "the annualized-income installment method is modeled for the wage + self-employment core only — remove the other income/deduction/credit facts or use the even quarterly_payment",
      },
      else: line27,
    },
  };
}

const P2025 = ["4402500", "7337500", "11740000", "17610000"]; // printed on the 2025 form
const L2025 = ["$44,025", "$73,375", "$117,400", "$176,100"];
const P2026 = ["4612500", "7687500", "12300000", "18450000"]; // $184,500 × 1/4, 5/12, 2/3, 1
const L2026 = ["$46,125 (from the $184,500 base)", "$76,875", "$123,000", "$184,500"];

export const annualizedInstallmentRules: Rule[] = [
  ...QUARTERS.map((q) =>
    quarterRule(q, "2025", "2025-01-01", "2026-01-01", P2025[q.n - 1], L2025[q.n - 1], false),
  ),
  ...QUARTERS.map((q) =>
    quarterRule(q, "2026", "2026-01-01", "2027-01-01", P2026[q.n - 1], L2026[q.n - 1], true),
  ),
];
