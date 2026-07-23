/**
 * Residential rental depreciation — 26 U.S.C. § 168 GDS, 27.5-year
 * straight-line, mid-month convention (§ 168(b)(3)(B), (c), (d)(2)).
 *
 * Percentages are the printed Pub 946 Table A-6 rates (verified 2026-07
 * against Pub 946/Pub 527 and the (12.5 − month)/12 ÷ 27.5 derivation —
 * the printed table rounds to three decimals, and the printed table is
 * what returns use):
 *   year 1 by month: 3.485 3.182 2.879 2.576 2.273 1.970
 *                    1.667 1.364 1.061 0.758 0.455 0.152
 *   steady-state years: 3.636
 *
 * Scope, disclosed: GDS residential rental (§ 168(e)(2)(A)) building basis
 * only — land excluded by the fact's definition; ADS elections, additions/
 * improvements with separate in-service dates, the final-year stub, and
 * mid-year dispositions are NOT modeled and the facts cannot express them.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // § 168 GDS percentages are statutory, unindexed

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const int = (value: string): Expr => ({ kind: "int", value });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");

/** Pub 946 Table A-6 year-1 rates by placed-in-service month, in 1/100,000. */
const YEAR1_RATE_PER_100K: readonly string[] = [
  "3485", // Jan
  "3182", // Feb
  "2879", // Mar
  "2576", // Apr
  "2273", // May
  "1970", // Jun
  "1667", // Jul
  "1364", // Aug
  "1061", // Sep
  "758", // Oct
  "455", // Nov
  "152", // Dec
];
const STEADY_RATE_PER_100K = "3636"; // 3.636%

const rateOf = (per100k: string): Expr => ({
  kind: "mulRate",
  base: fact("rentalDepreciableBasis"),
  rate: { num: per100k, den: "100000" },
  round: "half-up",
});

/** month 0 → steady state; months 1-12 → Table A-6 row 1. */
const monthTable = (): Expr => {
  let expr: Expr = rateOf(STEADY_RATE_PER_100K); // month 0 default
  for (let m = 12; m >= 1; m--) {
    expr = {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "eq",
        left: fact("rentalPlacedInServiceMonth"),
        right: int(String(m)),
      },
      then: rateOf(YEAR1_RATE_PER_100K[m - 1]),
      else: expr,
    };
  }
  return expr;
};

const CITE_BASE = {
  source: "26 U.S.C. § 168; IRS Pub 946 Table A-6; IRS Pub 527 ch. 2",
  url: "https://www.irs.gov/publications/p946",
};

export const rentalRules: Rule[] = [
  {
    id: "us.federal.rental.depreciation",
    version: 1,
    jurisdiction: J,
    title: "Residential rental depreciation (§ 168 GDS: 27.5-yr straight line, mid-month)",
    citation: {
      ...CITE_BASE,
      section: "§ 168(b)(3)(B), (c), (d)(2)",
      excerpt:
        "In the case of residential rental property… the applicable depreciation method is the straight line method… the applicable recovery period is 27.5 years… the applicable convention is the mid-month convention. [Pub 946 Table A-6 year-1 percentages by placed-in-service month: 3.485, 3.182, 2.879, 2.576, 2.273, 1.970, 1.667, 1.364, 1.061, 0.758, 0.455, 0.152; full years thereafter 3.636 — the printed three-decimal table, which is what filed returns use. Basis is the BUILDING only (land never depreciates, § 167). Not modeled, disclosed: ADS elections, separately-dated improvements, the final recovery year's stub, and mid-year dispositions.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "eq", left: fact("rentalDepreciableBasis"), right: zero },
      then: zero,
      else: monthTable(),
    },
  },
  {
    id: "us.federal.rental.net_income",
    version: 1,
    jurisdiction: J,
    title: "Net rental income: Schedule E result before depreciation minus § 168 depreciation",
    citation: {
      ...CITE_BASE,
      section: "§ 62(a)(4); Schedule E (Form 1040) line 18",
      excerpt:
        "Deductions attributable to rents… are allowed in arriving at adjusted gross income (§ 62(a)(4)); Schedule E line 18: 'Depreciation expense or depletion.' [When the computed depreciation EXCEEDS the pre-depreciation rental result, the year is a rental LOSS governed by the § 469 passive-activity rules — enter it through rentalActiveParticipationLosses (the $25,000 allowance machinery) instead; this rule refuses rather than route a loss around § 469.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "gt",
        left: ruleRef("us.federal.rental.depreciation"),
        right: fact("rentalIncomeBeforeDepreciation"),
      },
      then: {
        kind: "if",
        cond: { kind: "cmp", op: "eq", left: fact("rentalIncomeBeforeDepreciation"), right: zero },
        then: zero, // depreciation facts present but no income routed through this path: nothing to net
        else: {
          kind: "unsupported",
          reason:
            "depreciation exceeds the pre-depreciation rental result — this year is a rental LOSS subject to the § 469 passive-activity limits: enter it via rentalActiveParticipationLosses (the $25,000 active-participation allowance applies) rather than through this income path",
        },
      },
      else: {
        kind: "sub",
        left: fact("rentalIncomeBeforeDepreciation"),
        right: ruleRef("us.federal.rental.depreciation"),
      },
    },
  },
];
