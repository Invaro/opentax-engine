/**
 * Pension/annuity Simplified Method — 26 U.S.C. § 72(d) (mandatory for
 * qualified-plan annuities with post-Nov-18-1996 starting dates; Pub 575
 * Simplified Method Worksheet).
 *
 * Monthly exclusion = investment in the contract ÷ the statutory
 * anticipated-payments number; annual exclusion = monthly × months paid,
 * capped at the unrecovered cost (§ 72(d)(1)(E)+(b)(4)-style lifetime cap
 * confirmed by Pub 575: total exclusions "can't exceed your total cost").
 * The monthly division keeps cents, matching Pub 575's own worked example
 * ($12,000 ÷ 310 = $38.71).
 *
 * Tables verified 2026-07 against the statute (Cornell LII § 72(d)(1)(B))
 * and Pub 575 Tables 1-2:
 *   single life, age at starting date: ≤55→360, ≤60→310, ≤65→260, ≤70→210, else 160
 *   combined ages (multi-life, post-1997 start): ≤110→410, ≤120→360, ≤130→310, ≤140→260, else 210
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory tables, unindexed

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const int = (value: string): Expr => ({ kind: "int", value });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");

const cost = fact("pensionCostBasis");
const months = fact("pensionMonthsThisYear");

/** monthly = cost/N (exact rational, half-up at cents), annual = monthly × months. */
const annualAt = (n: string): Expr => ({
  kind: "mulInt",
  base: { kind: "mulRate", base: cost, rate: { num: "1", den: n }, round: "half-up" },
  count: months,
});

/** ladder over an int fact: bands [limit, payments] ascending, last is the else. */
const ladder = (on: Expr, bands: [string, string][], last: string): Expr => {
  let expr: Expr = annualAt(last);
  for (let i = bands.length - 1; i >= 0; i--) {
    const [limit, n] = bands[i];
    expr = {
      kind: "if",
      cond: { kind: "cmp", op: "le", left: on, right: int(limit) },
      then: annualAt(n),
      else: expr,
    };
  }
  return expr;
};

const needsAge = (ageFact: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact(ageFact),
  right: int("0"),
});

export const pensionRules: Rule[] = [
  {
    id: "us.federal.pension.simplified_method_exclusion",
    version: 1,
    jurisdiction: J,
    title: "Simplified Method tax-free portion (§ 72(d): cost ÷ anticipated payments × months, capped at unrecovered cost)",
    citation: {
      source: "26 U.S.C. § 72(d); IRS Pub 575 (Simplified Method Worksheet, Tables 1-2)",
      section: "§ 72(d)(1)(B)(iii)-(iv)",
      url: "https://www.law.cornell.edu/uscode/text/26/72",
      excerpt:
        "Gross income shall not include so much of any monthly annuity payment… as does not exceed the amount obtained by dividing (I) the investment in the contract (as of the annuity starting date), by (II) the number of anticipated payments… Age at annuity starting date: not more than 55 → 360; more than 55 but not more than 60 → 310; more than 60 but not more than 65 → 260; more than 65 but not more than 70 → 210; more than 70 → 160. Combined ages (more than one life): not more than 110 → 410; …120 → 360; …130 → 310; …140 → 260; more than 140 → 210. [Lifetime recovery capped at total cost (Pub 575); monthly division keeps cents per the Pub 575 worked example. The rule refuses when the basis is set but the required age fact is not.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "eq", left: cost, right: zero },
      then: zero,
      else: {
        kind: "if",
        cond: fact("pensionIsJointAndSurvivor"),
        then: {
          kind: "if",
          cond: needsAge("pensionCombinedAgesAtStart"),
          then: {
            kind: "unsupported",
            reason:
              "a joint-and-survivor simplified-method annuity needs pensionCombinedAgesAtStart (combined ages at the annuity starting date) — refusing rather than assume a § 72(d)(1)(B)(iv) band",
          },
          else: {
            kind: "min",
            args: [
              ladder(
                fact("pensionCombinedAgesAtStart"),
                [
                  ["110", "410"],
                  ["120", "360"],
                  ["130", "310"],
                  ["140", "260"],
                ],
                "210",
              ),
              { kind: "max0", arg: { kind: "sub", left: cost, right: fact("pensionBasisPreviouslyRecovered") } },
            ],
          },
        },
        else: {
          kind: "if",
          cond: needsAge("pensionAgeAtStart"),
          then: {
            kind: "unsupported",
            reason:
              "a simplified-method annuity needs pensionAgeAtStart (age at the annuity starting date, NOT current age) — refusing rather than assume a § 72(d)(1)(B)(iii) band",
          },
          else: {
            kind: "min",
            args: [
              ladder(
                fact("pensionAgeAtStart"),
                [
                  ["55", "360"],
                  ["60", "310"],
                  ["65", "260"],
                  ["70", "210"],
                ],
                "160",
              ),
              { kind: "max0", arg: { kind: "sub", left: cost, right: fact("pensionBasisPreviouslyRecovered") } },
            ],
          },
        },
      },
    },
  },
  {
    id: "us.federal.pension.simplified_method_taxable",
    version: 1,
    jurisdiction: J,
    title: "Taxable pension under the Simplified Method (gross payments minus the § 72(d) exclusion)",
    citation: {
      source: "26 U.S.C. § 72(a), (d); IRS Pub 575",
      section: "§ 72(a), (d)(1)(B)(i)",
      url: "https://www.law.cornell.edu/uscode/text/26/72",
      excerpt:
        "Except as otherwise provided in this chapter, gross income includes any amount received as an annuity… gross income shall not include so much of any monthly annuity payment… as does not exceed [the § 72(d) exclusion]. [Feeds gross income alongside the already-taxable taxablePensionsAndAnnuities fact — the two inputs are additive for separate pensions.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("pensionGrossPayments"),
        right: ruleRef("us.federal.pension.simplified_method_exclusion"),
      },
    },
  },
];
