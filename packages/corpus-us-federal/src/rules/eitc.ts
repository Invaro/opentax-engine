/**
 * Earned Income Tax Credit — 26 U.S.C. § 32.
 *
 * credit = min(phaseInRate × earned, maxCredit)
 *          − phaseOutRate × max0(max(AGI, earned) − threshold)
 * floored at zero. Statutory rates (§ 32(b)(1)): phase-in 7.65/34/40/45%,
 * phase-out 7.65/15.98/21.06/21.06% for 0/1/2/3+ qualifying children.
 * Dollar parameters are per-year (Rev. Proc. 2024-40 § 2.06;
 * Rev. Proc. 2025-32 § 4.06).
 *
 * Eligibility encoded: not claimable as a dependent; investment income
 * (approximated by taxableInterest) within the § 32(i) limit; childless
 * filers must be 25–64. Guard ORDER matters: income-based disqualification
 * is tested FIRST so high earners are never asked age questions
 * (and() short-circuits without demanding facts).
 *
 * Disclosed simplifications (see excerpt): earned income ≈ wages;
 * EITC qualifying children approximated by the CTC child count (§ 32(c)(3)
 * age limits differ); § 32(d)(2) separated-spouse exception IS modeled via
 * mfsConsideredUnmarried (default false: MFS gets $0 unless the tests are met);
 * joint-return childless age test applied to the taxpayer only.
 */

import type { Expr, RateLit, Rule, RuleParameter } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const intLit = (n: string): Expr => ({ kind: "int", value: n });
const zero = money("0");
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

// § 32(b)(1) statutory percentages (identical both years)
const PHASE_IN: RateLit[] = [
  { num: "765", den: "10000" },
  { num: "34", den: "100" },
  { num: "40", den: "100" },
  { num: "45", den: "100" },
];
const PHASE_OUT: RateLit[] = [
  { num: "765", den: "10000" },
  { num: "1598", den: "10000" },
  { num: "2106", den: "10000" },
  { num: "2106", den: "10000" },
];

/** Per-year dollar parameters, in whole dollars as read from the Rev. Procs. */
interface YearParams {
  eia: [number, number, number, number]; // earned income amount by kids 0..3+
  max: [number, number, number, number]; // maximum credit
  thresholdOther0: number; // childless threshold, non-joint
  thresholdMFJ0: number;
  thresholdOtherKids: number; // with-kids threshold (same for 1/2/3+)
  thresholdMFJKids: number;
  completedOther0: number; // childless completed phaseout (income short-circuit)
  completedMFJ0: number;
  investmentLimit: number; // § 32(i)
}

const TY2025: YearParams = {
  eia: [8490, 12730, 17880, 17880],
  max: [649, 4328, 7152, 8046],
  thresholdOther0: 10620,
  thresholdMFJ0: 17730,
  thresholdOtherKids: 23350,
  thresholdMFJKids: 30470,
  completedOther0: 19104,
  completedMFJ0: 26214,
  investmentLimit: 11950,
};

const TY2026: YearParams = {
  eia: [8680, 13020, 18290, 18290],
  max: [664, 4427, 7316, 8231],
  thresholdOther0: 10860,
  thresholdMFJ0: 18140,
  thresholdOtherKids: 23890,
  thresholdMFJKids: 31160,
  completedOther0: 19540,
  completedMFJ0: 26820,
  investmentLimit: 12200,
};

const dollars = (d: number): string => (BigInt(d) * 100n).toString();

// § 32(c)(2): earned income = wages + net self-employment earnings
// (approximated as SE net profit minus the § 164(f) half-SE-tax deduction,
// per the Schedule EIC worksheet; disclosed)
const earned: Expr = {
  // A Schedule C net loss reduces § 32(c)(2) earned income (Pub. 596 worksheet:
  // combine ALL Schedule C profits and losses), floored at zero.
  kind: "max0",
  arg: {
    kind: "sub",
    left: {
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
    },
    right: fact("scheduleCNetLoss"),
  },
};
// § 32(a)(2)(B): phase out against the GREATER of AGI or earned income
const phaseoutIncome: Expr = {
  kind: "max",
  args: [ruleRef("us.federal.agi"), earned],
};

/** Midpoint of the $50 table bracket containing x (§ 32(f)(2)): ⌊x/50⌋·50 + 25. */
function bracketMidpoint(x: Expr): Expr {
  return {
    kind: "add",
    args: [
      {
        kind: "mulInt",
        base: money("5000"), // $50
        count: { kind: "stepUnits", value: x, unitCents: "5000", mode: "floor" },
      },
      money("2500"), // $25
    ],
  };
}

/** The § 32(a)-(b) amount at income x: min(phaseIn × x, max) − phaseOut × excess, floored. */
function statutoryAmount(kids: 0 | 1 | 2 | 3, threshold: Expr, x: Expr): Expr {
  return {
    kind: "max0",
    arg: {
      kind: "sub",
      left: {
        kind: "min",
        args: [
          { kind: "mulRate", base: x, rate: PHASE_IN[kids], round: "half-up" },
          param(`max${kids}`),
        ],
      },
      right: {
        kind: "mulRate",
        base: { kind: "max0", arg: { kind: "sub", left: x, right: threshold } },
        rate: PHASE_OUT[kids],
        round: "half-up",
      },
    },
  };
}

/** One EIC Table lookup: the statutory amount at the bracket midpoint, whole dollars. */
function tableLookup(kids: 0 | 1 | 2 | 3, threshold: Expr, x: Expr): Expr {
  return {
    kind: "roundToDollar",
    value: statutoryAmount(kids, threshold, bracketMidpoint(x)),
    mode: "half-up",
  };
}

/**
 * The Form 1040 EIC Worksheet: look up EARNED income in the table; if AGI
 * reaches the phase-out threshold, also look up AGI and take the smaller.
 * The table method is the DEFAULT (it is what § 32(f) mandates for filed
 * returns); useFormulaMethod opts back to the continuous statutory formula
 * (apples-to-apples with PolicyEngine, like the Tax Table).
 */
function creditFormula(kids: 0 | 1 | 2 | 3, threshold: Expr): Expr {
  const continuous: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: {
        kind: "min",
        args: [
          { kind: "mulRate", base: earned, rate: PHASE_IN[kids], round: "half-up" },
          param(`max${kids}`),
        ],
      },
      right: {
        kind: "mulRate",
        base: { kind: "max0", arg: { kind: "sub", left: phaseoutIncome, right: threshold } },
        rate: PHASE_OUT[kids],
        round: "half-up",
      },
    },
  };
  const table: Expr = {
    kind: "if",
    cond: { kind: "cmp", op: "gt", left: earned, right: zero }, // table starts at $1
    then: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "ge",
        left: ruleRef("us.federal.agi"),
        right: threshold,
      },
      then: {
        kind: "min",
        args: [
          tableLookup(kids, threshold, earned),
          tableLookup(kids, threshold, ruleRef("us.federal.agi")),
        ],
      },
      else: tableLookup(kids, threshold, earned),
    },
    else: zero,
  };
  return { kind: "if", cond: fact("useFormulaMethod"), then: continuous, else: table };
}

function eitcRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  p: YearParams,
  yearLabel: string,
  revProc: string,
  opts: { ruleId?: string; ageGate?: boolean; titleSuffix?: string; extraExcerpt?: string } = {},
): Rule {
  const ruleId = opts.ruleId ?? "us.federal.eitc";
  const ageGate = opts.ageGate ?? true;
  const parameters: Record<string, RuleParameter> = {
    investmentLimit: { value: dollars(p.investmentLimit), type: "money" },
    thresholdOther0: { value: dollars(p.thresholdOther0), type: "money" },
    thresholdMFJ0: { value: dollars(p.thresholdMFJ0), type: "money" },
    thresholdOtherKids: { value: dollars(p.thresholdOtherKids), type: "money" },
    thresholdMFJKids: { value: dollars(p.thresholdMFJKids), type: "money" },
    completedOther0: { value: dollars(p.completedOther0), type: "money" },
    completedMFJ0: { value: dollars(p.completedMFJ0), type: "money" },
  };
  for (const k of [0, 1, 2, 3] as const) {
    parameters[`eia${k}`] = { value: dollars(p.eia[k]), type: "money" };
    parameters[`max${k}`] = { value: dollars(p.max[k]), type: "money" };
  }

  // § 32(c)(3) qualifying children: the CTC under-17 count PLUS children who
  // qualify only for the EIC (under 19 / student under 24 / disabled any age)
  const kids: Expr = {
    kind: "add",
    args: [fact("qualifyingChildren"), fact("eitcAdditionalQualifyingChildren")],
  };
  const kidsEq = (n: string): Expr => ({
    kind: "cmp",
    op: "eq",
    left: kids,
    right: intLit(n),
  });

  // § 32(i) disqualified income includes interest, capital gain net income
  // (long AND short term, § 32(i)(2)(A)), AND dividends (qualified and
  // ordinary — § 32(i)(2)(B) references § 1(h)(11) dividends generally)
  const investmentOK: Expr = {
    kind: "cmp",
    op: "le",
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
    right: param("investmentLimit"),
  };
  const notDependent: Expr = { kind: "not", arg: fact("isClaimedAsDependent") };

  const thresholdKids: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("thresholdMFJKids"),
    else: param("thresholdOtherKids"),
  };
  const threshold0: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("thresholdMFJ0"),
    else: param("thresholdOther0"),
  };
  const completed0: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("completedMFJ0"),
    else: param("completedOther0"),
  };

  const childlessBranch: Expr = {
    kind: "if",
    cond: {
      kind: "and",
      args: [
        // income disqualification FIRST — high earners are never asked
        // the childless age question (and() short-circuits on false)
        { kind: "cmp", op: "lt", left: phaseoutIncome, right: completed0 },
        notDependent,
        // § 32(c)(1)(A)(ii)(II) childless age floor/ceiling — OMITTED when
        // ageGate is false (us.federal.eitc_no_age_gate, for state decoupling
        // statutes like 35 ILCS 5/212(b-5)/(b-10) that recompute the federal
        // credit "without regard to" this age requirement). Omitting the
        // fact references entirely (not just short-circuiting on a default)
        // means the engine never demands isAge65OrOlder/isAtLeastAge25 to
        // evaluate this variant.
        ...(ageGate
          ? [
              { kind: "not", arg: fact("isAge65OrOlder") } as Expr, // must be under 65
              fact("isAtLeastAge25"), // must be 25+
            ]
          : []),
        investmentOK,
      ],
    },
    then: creditFormula(0, threshold0),
    else: zero,
  };

  const kidsBranch: Expr = {
    kind: "if",
    cond: { kind: "and", args: [notDependent, investmentOK] },
    then: {
      kind: "if",
      cond: kidsEq("1"),
      then: creditFormula(1, thresholdKids),
      else: {
        kind: "if",
        cond: kidsEq("2"),
        then: creditFormula(2, thresholdKids),
        else: creditFormula(3, thresholdKids), // 3 or more
      },
    },
    else: zero,
  };

  return {
    id: ruleId,
    version,
    jurisdiction: "us.federal",
    title:
      opts.titleSuffix ??
      `Earned income credit (TY${yearLabel}; EIC Table method — § 32(f) $50 brackets at midpoints; § 32(d) separated spouses not modeled)`,
    citation: {
      source: `26 U.S.C. § 32; ${revProc}; Form 1040 instructions (EIC Worksheet and EIC Table)`,
      section: `§ 32(a)-(b), (f), (i); ${revProc}`,
      url: "https://www.law.cornell.edu/uscode/text/26/32",
      excerpt: `Credit = phase-in percentage of earned income up to the maximum, reduced by the phase-out percentage of AGI (or, if greater, earned income) above the threshold; denied entirely if investment income exceeds the § 32(i) limit. 'The amount of the credit allowed by this section shall be determined under tables prescribed by the Secretary… [which] shall reflect the provisions of subsections (a) and (b) and shall have income brackets of not greater than $50 each' (§ 32(f), verbatim) — the DEFAULT here is that table method (statutory amounts computed at each $50 bracket's midpoint, whole dollars; the EIC Worksheet looks up earned income, and also AGI when AGI reaches the phase-out threshold, taking the smaller); useFormulaMethod opts back to the continuous formula. Married taxpayers must file jointly (§ 32(d)) — UNLESS the MFS filer meets the § 32(d)(2) separation requirements (set mfsConsideredUnmarried: qualifying child in the home > half year, > half household cost furnished, legally separated or spouse absent the last 6 months), in which case the credit computes normally. Earned income approximated as wages + SE net earnings; § 32(c)(3) qualifying children = the CTC child count plus eitcAdditionalQualifyingChildren (children under 19, students under 24, or permanently and totally disabled at ANY age, who miss the CTC's under-17 cut). TY${yearLabel} dollar amounts per ${revProc}.${opts.extraExcerpt ?? ""}`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters,
    formula: {
      kind: "if",
      // § 32(d): married must file jointly — EXCEPT an MFS filer meeting the
      // § 32(d)(2) separation requirements (considered unmarried), who qualifies.
      cond: {
        kind: "and",
        args: [isStatus("mfs"), { kind: "not", arg: fact("mfsConsideredUnmarried") }],
      },
      then: zero,
      else: {
        kind: "if",
        cond: kidsEq("0"),
        then: childlessBranch,
        else: kidsBranch,
      },
    },
  };
}

const NO_AGE_GATE_EXCERPT =
  " NO AGE GATE VARIANT (us.federal.eitc_no_age_gate): recomputes this SAME § 32(a)-(b), (f), (i) credit with the § 32(c)(1)(A)(ii) childless-filer age requirement (25-64) removed entirely — i.e. the isAge65OrOlder/isAtLeastAge25 facts are never consulted, so a childless filer of ANY age reaches the ordinary table/formula math. Exists solely to feed STATE statutes that expressly decouple from the federal age floor, e.g. Illinois (35 ILCS 5/212(b-5) for 18-24, (b-10) for 65+, P.A. 102-700: 'based on the federal tax credit for which the taxpayer would have been eligible without regard to any age requirements... in Section 32(c)(1)(A)(ii)'). This rule's own federal answer is NOT a valid federal EITC — it is an intermediate for us.il.eitc (and any other state with an identical decoupling statute) and must never be substituted for us.federal.eitc on the federal return itself.";

export const eitcRules: Rule[] = [
  // v5/v6: table method default (§ 32(f)) + eitcAdditionalQualifyingChildren
  // v8/v9: § 32(i) investment-income limit also counts the standalone qualifiedDividends fact
  // v10/v11: § 32(i) investment-income limit also counts shortTermCapitalGains/ordinaryDividends
  // v12/v13 read the raw gain facts; the § 32(i) test now takes the schedule_d
  // netted results ("capital gain net income", § 32(i)(1)(C))
  eitcRule(14, "2025-01-01", "2026-01-01", TY2025, "2025", "Rev. Proc. 2024-40 § 2.06"),
  eitcRule(15, "2026-01-01", "2027-01-01", TY2026, "2026", "Rev. Proc. 2025-32 § 4.06"),
  // us.federal.eitc_no_age_gate (new): the same § 32(a)-(b),(f),(i) formula with
  // the childless § 32(c)(1)(A)(ii) age gate removed, for state EITC statutes
  // that decouple from it (35 ILCS 5/212(b-5)/(b-10), IL P.A. 102-700) — see
  // us.il.eitc, which is 20% of THIS rule's answer, not us.federal.eitc's.
  eitcRule(3, "2025-01-01", "2026-01-01", TY2025, "2025", "Rev. Proc. 2024-40 § 2.06", {
    ruleId: "us.federal.eitc_no_age_gate",
    ageGate: false,
    titleSuffix: "Earned income credit, § 32(c)(1)(A)(ii) childless age gate REMOVED (TY2025; for state decoupling statutes only)",
    extraExcerpt: NO_AGE_GATE_EXCERPT,
  }),
  eitcRule(4, "2026-01-01", "2027-01-01", TY2026, "2026", "Rev. Proc. 2025-32 § 4.06", {
    ruleId: "us.federal.eitc_no_age_gate",
    ageGate: false,
    titleSuffix: "Earned income credit, § 32(c)(1)(A)(ii) childless age gate REMOVED (TY2026; for state decoupling statutes only)",
    extraExcerpt: NO_AGE_GATE_EXCERPT,
  }),
];

/** Exported for the parameter-identity test (threshold + max/rate ≈ completed). */
export const EITC_PARAMS = { TY2025, TY2026, PHASE_OUT };
