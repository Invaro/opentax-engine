/**
 * Traditional IRA deduction — 26 U.S.C. § 219, verified July 2026.
 *
 * Dollar amounts (from the IRS notices, NOT indexed-by-memory):
 *   TY2025 (Notice 2024-80): limit $7,000, age-50 catch-up $1,000;
 *     active-participant phase-out: $79,000–$89,000 single/HoH,
 *     $126,000–$146,000 MFJ (and QSS per Pub 590-A), $0–$10,000 MFS;
 *     spouse-is-participant threshold $236,000 (range $10,000).
 *   TY2026 (Notice 2025-67): limit $7,500 (FIRST base increase since 2024),
 *     catch-up $1,100 (first indexed catch-up increase, § 219(b)(5)(C));
 *     $81,000–$91,000 single/HoH, $129,000–$149,000 MFJ/QSS,
 *     $0–$10,000 MFS; spousal threshold $242,000.
 *
 * Mechanics (§ 219(g), quoted from the statute):
 *   reduction = limit × excess-MAGI / range ($10,000; $20,000 joint),
 *   "rounded to the next lowest $10"; the reduced limit is not reduced
 *   "below $200 unless (without regard to this subparagraph) such
 *   limitation is reduced to zero."
 *   MAGI (§ 219(g)(3)(A)): AGI without regard to § 221 and § 219 itself —
 *   exactly our agi_before_student_loan chain node (computed before both).
 *
 * The deduction is above-the-line (§ 62(a)(7)) and feeds AGI; the § 221
 * student-loan MAGI is computed after it (§ 221 disregards only itself).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

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

// § 219(g)(3)(A) MAGI: without §§ 221 and 219 — gross income minus the
// pre-§221/§219 adjustments (½ SE tax + HSA). Foreign add-backs ≈ 0.
const magi: Expr = {
  kind: "sub",
  left: ruleRef("us.federal.gross_income"),
  right: ruleRef("us.federal.above_the_line_adjustments"),
};

// compensation ≈ wages + SE earned income (profit − ½ SE tax) — disclosed
const compensation: Expr = {
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

function iraRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  yearLabel: string,
  p: {
    base: string; catchUp: string;
    thresholdSingle: string; thresholdJoint: string; thresholdSpousal: string;
  },
  source: string,
  amountsNote: string,
): Rule {
  const limit: Expr = {
    kind: "add",
    args: [
      param("base"),
      { kind: "if", cond: fact("isAge50OrOlder"), then: param("catchUp"), else: zero },
    ],
  };

  /** limit reduced per § 219(g)(2): floor-$10 rounding + the $200 floor. */
  const phasedLimit = (threshold: Expr, range: Expr): Expr => {
    const excess: Expr = {
      kind: "max0",
      arg: { kind: "sub", left: magi, right: threshold },
    };
    const reduction: Expr = {
      // floor to the next lowest $10: floor-÷$10, then × $10
      kind: "mulInt",
      base: money("1000"), // $10
      count: {
        kind: "stepUnits",
        value: { kind: "mulDiv", a: limit, b: excess, c: range, round: "floor" },
        unitCents: "1000",
        mode: "floor",
      },
    };
    return {
      kind: "if",
      cond: { kind: "cmp", op: "ge", left: excess, right: range },
      then: zero, // fully phased: the $200 floor does not apply
      else: {
        kind: "max",
        args: [money("20000"), { kind: "sub", left: limit, right: reduction }], // $200 floor
      },
    };
  };

  const rangeJoint = money("2000000"); // $20,000 (joint return)
  const range10 = money("1000000"); // $10,000

  // taxpayer IS an active participant: per-status threshold
  const coveredLimit: Expr = {
    kind: "match",
    on: fact("filingStatus"),
    cases: [
      { when: "single", value: phasedLimit(param("thresholdSingle"), range10) },
      { when: "hoh", value: phasedLimit(param("thresholdSingle"), range10) },
      { when: "mfj", value: phasedLimit(param("thresholdJoint"), rangeJoint) },
      // Pub 590-A groups QSS with MFJ for this range (the § 219(g)(3)(B)(i)
      // text says "joint return"; IRS guidance controls filing practice —
      // disclosed in the excerpt)
      { when: "qss", value: phasedLimit(param("thresholdJoint"), rangeJoint) },
      {
        when: "mfs",
        value: {
          kind: "if",
          // § 219(g)(4): lived apart at all times -> NOT treated as married;
          // the single phase-out range applies instead of $0-$10,000
          cond: fact("mfsLivedApartAllYear"),
          then: phasedLimit(param("thresholdSingle"), range10),
          else: phasedLimit(zero, range10), // $0–$10,000
        },
      },
    ],
  };

  // taxpayer is NOT an active participant: phase-out only if the spouse is
  const notCoveredLimit: Expr = {
    kind: "match",
    on: fact("filingStatus"),
    cases: [
      { when: "single", value: limit },
      { when: "hoh", value: limit },
      { when: "qss", value: limit },
      {
        when: "mfj",
        value: {
          kind: "if",
          cond: fact("spouseIsActivePlanParticipant"),
          then: phasedLimit(param("thresholdSpousal"), range10), // § 219(g)(7)
          else: limit,
        },
      },
      {
        when: "mfs",
        value: {
          kind: "if",
          // § 219(g)(4): lived apart all year -> not married, no spousal attribution
          cond: fact("mfsLivedApartAllYear"),
          then: limit,
          else: {
            kind: "if",
            cond: fact("spouseIsActivePlanParticipant"),
            then: phasedLimit(zero, range10), // § 219(g)(3)(B)(iii): $0
            else: limit,
          },
        },
      },
    ],
  };

  return {
    id: "us.federal.ira_deduction",
    version,
    jurisdiction: J,
    title: `Traditional IRA deduction (TY${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 219; ${source}`,
      section: "§ 219(b), (g)",
      url: "https://www.law.cornell.edu/uscode/text/26/219",
      excerpt:
        `${amountsNote} Phase-out per § 219(g)(2): the limit is reduced by the amount bearing the same ratio to it as excess MAGI bears to $10,000 ($20,000 joint), the reduction "rounded to the next lowest $10"; the limit is not reduced "below $200 unless… reduced to zero." MAGI is AGI without regard to §§ 221 and 219 (§ 219(g)(3)(A)). Deduction capped at includible compensation (§ 219(b)(1)(B)) — compensation ≈ wages + SE earnings net of ½ SE tax, and the § 219(c) spousal-compensation rule is assumed satisfied on joint returns; disclosed. Pub 590-A groups qualifying surviving spouses with joint filers for the covered range (the statutory text says "joint return" — IRS guidance controls filing practice; disclosed). Not modeled, disclosed: the § 219(g)(4) living-apart-all-year MFS exception (conservative), nondeductible-contribution basis (Form 8606), Roth IRAs, and the 6% excess-contribution excise.`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      base: { value: p.base, type: "money" },
      catchUp: { value: p.catchUp, type: "money" },
      thresholdSingle: { value: p.thresholdSingle, type: "money" },
      thresholdJoint: { value: p.thresholdJoint, type: "money" },
      thresholdSpousal: { value: p.thresholdSpousal, type: "money" },
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("iraContribution"), right: zero },
      then: {
        kind: "min",
        args: [
          fact("iraContribution"),
          {
            kind: "if",
            cond: fact("isActivePlanParticipant"),
            then: coveredLimit,
            else: notCoveredLimit,
          },
          compensation,
        ],
      },
      else: zero,
    },
  };
}

export const iraRules: Rule[] = [
  iraRule(
    2, "2025-01-01", "2026-01-01", "2025",
    {
      base: "700000", catchUp: "100000", // $7,000 + $1,000
      thresholdSingle: "7900000", // $79,000
      thresholdJoint: "12600000", // $126,000
      thresholdSpousal: "23600000", // $236,000
    },
    "Notice 2024-80; Pub 590-A (2025)",
    "For 2025 the deductible amount is $7,000 ($8,000 if age 50+); active-participant phase-out ranges $79,000–$89,000 (single/HoH), $126,000–$146,000 (joint/QSS), $0–$10,000 (MFS — but § 219(g)(4): an MFS filer who lived apart from the spouse at ALL times during the year is not treated as married, so the single range applies and no spousal attribution occurs; set mfsLivedApartAllYear); $236,000–$246,000 where only the spouse participates.",
  ),
  iraRule(
    3, "2026-01-01", "2027-01-01", "2026",
    {
      base: "750000", catchUp: "110000", // $7,500 + $1,100 (Notice 2025-67)
      thresholdSingle: "8100000", // $81,000
      thresholdJoint: "12900000", // $129,000
      thresholdSpousal: "24200000", // $242,000
    },
    "Notice 2025-67",
    "For 2026 the deductible amount rises to $7,500 ($8,600 if age 50+ — the $1,100 catch-up is the first indexed increase under § 219(b)(5)(C)); phase-out ranges $81,000–$91,000 (single/HoH), $129,000–$149,000 (joint/QSS), $0–$10,000 (MFS — but § 219(g)(4): an MFS filer who lived apart from the spouse at ALL times during the year is not treated as married, so the single range applies and no spousal attribution occurs; set mfsLivedApartAllYear); $242,000–$252,000 where only the spouse participates.",
  ),
];
