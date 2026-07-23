/**
 * Investment-side taxes:
 *
 * NIIT (§ 1411): 3.8% × min(net investment income, max0(MAGI − threshold)).
 * Thresholds STATUTORY, not indexed: $250,000 joint/QSS, $125,000 MFS,
 * $200,000 otherwise. Investment income ≈ taxable interest + LTCG/qualified
 * dividends (simplified, disclosed).
 *
 * Additional Medicare Tax (§ 3101(b)(2) / § 1401(b)(2)): 0.9% ×
 * max0(wages + SE net earnings − threshold). Thresholds STATUTORY:
 * $250,000 joint, $125,000 MFS, $200,000 otherwise. (Technically wages and
 * SE earnings have a coordinated threshold — this combined form matches
 * Form 8959's arithmetic for our covered inputs.)
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, not indexed: open-ended

/** joint 250k / MFS 125k / others 200k — shared by both taxes. */
const threshold: Expr = {
  kind: "match",
  on: fact("filingStatus"),
  cases: [
    { when: "mfj", value: money("25000000") }, // $250,000
    { when: "qss", value: money("25000000") }, // $250,000 (§ 1411(b): surviving spouse)
    { when: "mfs", value: money("12500000") }, // $125,000
    { when: "single", value: money("20000000") }, // $200,000
    { when: "hoh", value: money("20000000") }, // $200,000
  ],
};

// Additional Medicare threshold: QSS is NOT a joint return -> $200,000
const amThreshold: Expr = {
  kind: "match",
  on: fact("filingStatus"),
  cases: [
    { when: "mfj", value: money("25000000") },
    { when: "qss", value: money("20000000") },
    { when: "mfs", value: money("12500000") },
    { when: "single", value: money("20000000") },
    { when: "hoh", value: money("20000000") },
  ],
};

export const investmentTaxRules: Rule[] = [
  {
    id: "us.federal.niit",
    version: 6, // v5 read the raw gain facts; § 1411 net investment income now takes the schedule_d netted results (losses reduce gains before NIIT)
    jurisdiction: "us.federal",
    title:
      "Net investment income tax (investment income = interest + capital gains (LT/ST) + dividends (qualified/ordinary) − allocable deductions; MAGI ≈ AGI)",
    citation: {
      source: "26 U.S.C. § 1411",
      section: "§ 1411(a)(1), (b), (c)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/1411",
      excerpt:
        "…a tax equal to 3.8 percent of the lesser of (A) net investment income… or (B) the excess (if any) of modified adjusted gross income… over the threshold amount [$250,000 joint return or surviving spouse; $125,000 married filing separately; $200,000 otherwise — not indexed]. Net investment income is the excess of the gross investment income items 'over (B) the deductions allowed by this subtitle which are properly allocable to such gross income or net gain' (§ 1411(c)(1), verbatim) — investment interest expense, allocable state tax, and other Form 8960 line 9–10 amounts enter through niitInvestmentExpenses.",
    },
    ...FROM,
    output: { type: "money" },
    formula: (() => {
      const tax: Expr = {
        kind: "mulRate",
        base: {
          kind: "min",
          args: [
            {
              kind: "max0",
              arg: {
                kind: "sub",
                left: {
                  kind: "add",
                  args: [
                    fact("taxableInterest"),
                    ruleRef("us.federal.schedule_d.preferential_lt_gain"),
                    fact("qualifiedDividends"),
                    ruleRef("us.federal.schedule_d.ordinary_st_gain"),
                    fact("ordinaryDividends"),
                  ],
                },
                right: fact("niitInvestmentExpenses"),
              },
            },
            {
              kind: "max0",
              arg: { kind: "sub", left: ruleRef("us.federal.agi"), right: threshold },
            },
          ],
        },
        rate: { num: "38", den: "1000" },
        round: "half-up",
      };
      return {
        kind: "if",
        cond: fact("useFormulaMethod"),
        then: tax,
        else: { kind: "roundToDollar", value: tax, mode: "half-up" }, // Form 8960 line 17, whole dollars
      };
    })(),
  },
  {
    id: "us.federal.additional_medicare_tax",
    version: 3, // v2 rounded once combined; the printed Form 8959 rounds Parts I and II per line
    jurisdiction: "us.federal",
    title:
      "Additional Medicare Tax (0.9%; Form 8959 uses medicareWages box 5 when given, else box-1 wages)",
    citation: {
      source: "26 U.S.C. § 3101(b)(2); § 1401(b)(2); Form 8959",
      section: "§ 3101(b)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/3101",
      excerpt:
        "…an additional tax equal to 0.9 percent of wages… in excess of $250,000 in the case of a joint return, $125,000 in the case of a married taxpayer filing separately, [and] $200,000 in any other case [not indexed; SE earnings coordinate via § 1401(b)(2)]. Form 8959's wage base is W-2 BOX 5 Medicare wages — approximated by box 1 when medicareWages is not supplied (box 5 is often higher: pre-tax 401(k) deferrals reduce box 1 only). Reconciled on Form 8959 as part of total tax; employer-withheld Additional Medicare Tax (box 6 over 1.45% of box 5) belongs in withholding via Form 8959 Part IV.",
    },
    ...FROM,
    output: { type: "money" },
    formula: (() => {
      const mw: Expr = {
        kind: "if",
        cond: { kind: "cmp", op: "gt", left: fact("medicareWages"), right: money("0") },
        then: fact("medicareWages"),
        else: fact("wages"),
      };
      const pct09 = (base: Expr): Expr => ({
        kind: "mulRate",
        base,
        rate: { num: "9", den: "1000" },
        round: "half-up",
      });
      // Form 8959 Part I: wages over the threshold
      const wagesPart = pct09({ kind: "max0", arg: { kind: "sub", left: mw, right: amThreshold } });
      // Part II: SE earnings over the threshold REDUCED by Medicare wages
      const sePart = pct09({
        kind: "max0",
        arg: {
          kind: "sub",
          left: ruleRef("us.federal.se_net_earnings"),
          right: { kind: "max0", arg: { kind: "sub", left: amThreshold, right: mw } },
        },
      });
      const combined = pct09({
        kind: "max0",
        arg: {
          kind: "sub",
          left: { kind: "add", args: [mw, ruleRef("us.federal.se_net_earnings")] },
          right: amThreshold,
        },
      });
      return {
        kind: "if",
        cond: fact("useFormulaMethod"),
        then: combined,
        else: {
          // printed Form 8959: Parts I and II each entered in whole dollars
          kind: "add",
          args: [
            { kind: "roundToDollar", value: wagesPart, mode: "half-up" },
            { kind: "roundToDollar", value: sePart, mode: "half-up" },
          ],
        },
      };
    })(),
  },
  {
    id: "us.federal.other_taxes",
    version: 4, // v3 predated the § 223(f) HSA distribution taxes
    jurisdiction: "us.federal",
    title: "Other taxes (SE tax + Additional Medicare + NIIT + \u00a7 72(t) + excess APTC + Schedule H)",
    citation: {
      source: "26 U.S.C. §§ 1401, 1411, 3101(b)(2); Form 1040 Schedule 2",
      section: "Schedule 2, Part II",
      url: "https://www.irs.gov/forms-pubs/about-schedule-2-form-1040",
      excerpt:
        "Self-employment tax, Additional Medicare Tax (Form 8959), net investment income tax (Form 8960), and the \u00a7 72(t) 10-percent additional tax on early distributions (exceptions — age 59\u00bd, disability, SEPP, \u00a7 72(t)(2) list — attested by entering only the penalized amount) , the \u00a7 36B(f)(2) excess advance premium tax credit repayment (Schedule 2 line 2), household employment taxes (Schedule H, Schedule 2 line 9), and the § 223(f)(4) 20-percent additional tax on nonqualified HSA distributions (Form 8889 Part II; waived at 65+/death/disability) are added to income tax in computing total tax.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.se_tax"),
        ruleRef("us.federal.additional_medicare_tax"),
        ruleRef("us.federal.niit"),
        // § 223(f)(4): 20% additional tax on nonqualified HSA distributions
        // (waived after 65 / death / disability via hsaDistributionPenaltyExempt)
        {
          kind: "if",
          cond: fact("hsaDistributionPenaltyExempt"),
          then: { kind: "money", cents: "0" },
          else: {
            kind: "mulRate",
            base: {
              kind: "max0",
              arg: {
                kind: "sub",
                left: fact("hsaDistributions"),
                right: fact("hsaQualifiedMedicalExpenses"),
              },
            },
            rate: { num: "20", den: "100" },
            round: "half-up",
          },
        },
        {
          kind: "mulRate",
          base: fact("earlyDistributionSubjectToPenalty"),
          rate: { num: "10", den: "100" },
          round: "half-up",
        },
        ruleRef("us.federal.ptc.excess_aptc_repayment"),
        ruleRef("us.federal.household_employment_taxes"),
      ],
    },
  },
];
