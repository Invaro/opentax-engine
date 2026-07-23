/**
 * § 36B Premium Tax Credit — the 2026 subsidy-cliff return. Verified from
 * the statute (both editions), Rev. Proc. 2024-35 (2025 table), Rev. Proc.
 * 2025-25 (2026 table), Rev. Proc. 2024-40 § 2.07 (2025 repayment caps),
 * Rev. Proc. 2025-32 § 2.04 (repayment cap REPEALED for 2026), and the
 * HHS poverty guidelines (89 FR 2961 for 2024; 90 FR 5917 for 2025).
 *
 * TY2025 (ARPA/IRA enhanced, § 36B(b)(3)(A)(iii), sunset "before January
 * 1, 2026"): 0% → 8.5% applicable percentages, NO 400% FPL cliff
 * (§ 36B(c)(1)(E)), and excess-APTC repayment capped by the
 * § 36B(f)(2)(B) table below 400% FPL.
 *
 * TY2026 (post-sunset): the indexed statutory table (Rev. Proc. 2025-25:
 * 2.10% under 133% FPL up to 9.96% at 300–400%), the 400% CLIFF is back
 * (§ 36B(c)(1)(A): "does not exceed 400 percent"), and the repayment cap
 * is GONE (OBBBA § 71305 struck § 36B(f)(2)(B), effective TY2026).
 *
 * Household income (§ 36B(d)(2)): MAGI of the taxpayer (+ spouse) — AGI
 * increased by the § 911 exclusion, tax-exempt interest, and nontaxable
 * social security. Dependents' MAGI (only those required to file) is not
 * modeled — disclosed. Poverty line: the 48-contiguous-states guidelines
 * (linear per printed table: first person + increment per additional);
 * Alaska/Hawaii have higher guidelines — using the lower table understates
 * the FPL ratio only if... no: a LOWER poverty line RAISES income-as-%-FPL,
 * which LOWERS the credit — conservative, disclosed.
 *
 * The applicable percentage is applied "on a sliding scale in a linear
 * manner" (§ 36B(b)(3)(A)(i)) — encoded as exact linear interpolation on
 * the floor-to-hundredths FPL ratio. Form 8962 rounds the ratio down to a
 * whole percent and reads a 4-decimal printed table; differences are
 * sub-dollar and disclosed.
 *
 * MFS refuses the credit (§ 36B(c)(1)(C): joint return required; the
 * Reg. § 1.36B-2(b)(2) domestic-abuse/abandonment exception is not
 * modeled — conservative). Below 100% FPL: not an applicable taxpayer —
 * $0 (the lawfully-present-immigrant special rule, § 36B(c)(1)(B), was
 * struck by OBBBA § 71302 for 2026 and is not modeled for 2025 —
 * conservative, disclosed).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

/**
 * Household income (§ 36B(d)(2)): AGI + § 911 exclusion + tax-exempt
 * interest + nontaxable social security (taxpayer + spouse; dependents'
 * MAGI not modeled — disclosed).
 */
const householdIncome: Expr = {
  kind: "add",
  args: [
    ruleRef("us.federal.agi"),
    ruleRef("us.federal.feie.exclusion"),
    fact("taxExemptInterest"),
    {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("socialSecurityBenefits"),
        right: ruleRef("us.federal.taxable_social_security"),
      },
    },
  ],
};

/** poverty line = firstPerson + increment × (household size − 1) */
const povertyLine: Expr = {
  kind: "add",
  args: [
    param("fplFirstPerson"),
    {
      kind: "mulInt",
      base: param("fplPerAdditional"),
      count: {
        kind: "sub",
        left: fact("ptcHouseholdSize"),
        right: { kind: "int", value: "1" },
      },
    },
  ],
};

/**
 * Income as % of the poverty line, in "percent-cents" (150.00% → 15000),
 * floored — e.g. household income $33,000 with a $15,650 FPL → 21086
 * (210.86%).
 */
const fplPercentCents: Expr = {
  kind: "mulDiv",
  a: householdIncome,
  b: money("10000"),
  c: povertyLine,
  round: "floor",
};

interface PctTier {
  /** tier bounds in percent-cents, [lo, hi) */
  lo: string;
  hi: string;
  /** initial/final applicable percentages in percent-cents (9.96% → "996") */
  initial: string;
  final: string;
}

/**
 * Linear interpolation within a tier (§ 36B(b)(3)(A): "increases, on a
 * sliding scale in a linear manner"):
 *   pct = initial + (final − initial) × (fpl% − lo) / (hi − lo)
 */
function tierChain(fplPct: Expr, tiers: PctTier[], above400: Expr): Expr {
  let chain: Expr = above400;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i];
    const width = String(Number(t.hi) - Number(t.lo));
    const span = String(Number(t.final) - Number(t.initial));
    const interpolated: Expr =
      t.initial === t.final
        ? money(t.initial)
        : {
            kind: "add",
            args: [
              money(t.initial),
              {
                kind: "mulDiv",
                a: money(span),
                b: {
                  kind: "sub",
                  left: fplPct,
                  right: money(t.lo),
                },
                c: money(width),
                round: "half-up",
              },
            ],
          };
    chain = {
      kind: "if",
      cond: { kind: "cmp", op: "lt", left: fplPct, right: money(t.hi) },
      then: interpolated,
      else: chain,
    };
  }
  return chain;
}

/** contribution amount = applicable% × household income (annual). */
const contribution = (pctCents: Expr): Expr => ({
  kind: "mulDiv",
  a: householdIncome,
  b: pctCents,
  c: money("10000"),
  round: "half-up",
});

/** PTC = min(premiums paid, max0(benchmark − contribution)) — § 36B(b)(2). */
const assistanceAmount = (pctCents: Expr): Expr => ({
  kind: "min",
  args: [
    fact("marketplacePremiumsPaid"),
    {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("slcspAnnualPremium"),
        right: contribution(pctCents),
      },
    },
  ],
});

function ptcRule(
  version: number,
  from: string,
  to: string,
  fplFirstPersonCents: string,
  fplPerAdditionalCents: string,
  tiers: PctTier[],
  above400: Expr | "cliff",
  yearLabel: string,
  excerpt: string,
): Rule {
  // over 400% FPL: 2025 keeps the 8.5% percentage (no cliff); 2026 the
  // taxpayer is NOT an applicable taxpayer at all — the CREDIT is zero,
  // never a zero-percentage contribution (which would wrongly hand back
  // the full benchmark)
  const inRange: Expr =
    above400 === "cliff"
      ? {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "gt",
            left: fplPercentCents,
            right: money("40000"), // 400.00%
          },
          then: zero,
          else: assistanceAmount(tierChain(fplPercentCents, tiers, zero /* unreachable */)),
        }
      : assistanceAmount(tierChain(fplPercentCents, tiers, above400));
  const core: Expr = {
    kind: "if",
    // § 36B(c)(1)(A): household income must be at least 100% of the
    // poverty line — below it, not an applicable taxpayer
    cond: { kind: "cmp", op: "lt", left: fplPercentCents, right: money("10000") },
    then: zero,
    else: inRange,
  };
  return {
    id: "us.federal.ptc",
    version,
    jurisdiction: J,
    title: `Premium tax credit (§ 36B, ${yearLabel})`,
    citation: {
      source:
        version > 1
          ? "26 U.S.C. § 36B (post-ARPA-sunset); Rev. Proc. 2025-25 § 3.01; 90 FR 5917 (2025 HHS poverty guidelines)"
          : "26 U.S.C. § 36B(b)(3)(A)(iii), (c)(1)(E) (ARPA/IRA, sunset before 2026); Rev. Proc. 2024-35 § 2.01; 89 FR 2961 (2024 HHS poverty guidelines)",
      section: "§ 36B(b), (c)(1), (d)",
      url: "https://www.law.cornell.edu/uscode/text/26/36B",
      excerpt,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      fplFirstPerson: { value: fplFirstPersonCents, type: "money" },
      fplPerAdditional: { value: fplPerAdditionalCents, type: "money" },
    },
    formula: {
      kind: "if",
      cond: { kind: "not", arg: gt0(fact("slcspAnnualPremium")) },
      then: {
        kind: "if",
        cond: gt0(fact("advancePTC")),
        then: {
          kind: "unsupported",
          reason:
            "advance PTC was paid but no SLCSP benchmark premium was provided — the § 36B(f) reconciliation cannot be computed without slcspAnnualPremium (Form 1095-A line 33B)",
        },
        else: zero,
      },
      else: {
        kind: "if",
        cond: {
          kind: "and",
          args: [
            isStatus("mfs"),
            // Reg. § 1.36B-2(b)(2): abuse/abandonment relief waives § 36B(c)(1)(C)
            { kind: "not", arg: fact("mfsAbuseOrAbandonmentException") },
          ],
        },
        then: zero, // § 36B(c)(1)(C): MFS without the relief attestation gets no PTC
        else: core,
      },
    },
  };
}

// TY2025 enhanced table (§ 36B(b)(3)(A)(iii); Rev. Proc. 2024-35 § 2.01):
// up to 150%: 0; 150–200: 0→2; 200–250: 2→4; 250–300: 4→6; 300–400: 6→8.5;
// 400%+: 8.5 (no cliff)
const TIERS_2025: PctTier[] = [
  { lo: "10000", hi: "15000", initial: "0", final: "0" },
  { lo: "15000", hi: "20000", initial: "0", final: "200" },
  { lo: "20000", hi: "25000", initial: "200", final: "400" },
  { lo: "25000", hi: "30000", initial: "400", final: "600" },
  { lo: "30000", hi: "40000", initial: "600", final: "850" },
];

// TY2026 indexed statutory table (Rev. Proc. 2025-25 § 3.01):
// <133%: 2.10; 133–150: 3.14→4.19; 150–200: 4.19→6.60; 200–250: 6.60→8.44;
// 250–300: 8.44→9.96; 300–400: 9.96; >400%: NOT an applicable taxpayer
const TIERS_2026: PctTier[] = [
  { lo: "10000", hi: "13300", initial: "210", final: "210" },
  { lo: "13300", hi: "15000", initial: "314", final: "419" },
  { lo: "15000", hi: "20000", initial: "419", final: "660" },
  { lo: "20000", hi: "25000", initial: "660", final: "844" },
  { lo: "25000", hi: "30000", initial: "844", final: "996" },
  { lo: "30000", hi: "40001", initial: "996", final: "996" }, // "but not more than 400%" — inclusive
];

function repayment2025(): Rule {
  // § 36B(f)(2)(B) caps (Rev. Proc. 2024-40 § 2.07): by FPL band;
  // the halved column applies to § 1(c) unmarried filers (single here —
  // NOT MFS (§ 1(d)), NOT HoH (§ 1(b)), NOT surviving spouses)
  const capFor = (unmarriedCents: string, otherCents: string): Expr => ({
    kind: "if",
    cond: isStatus("single"),
    then: money(unmarriedCents),
    else: money(otherCents),
  });
  const cappedBand: Expr = {
    kind: "if",
    cond: { kind: "cmp", op: "lt", left: fplPercentCents, right: money("20000") },
    then: capFor("37500", "75000"),
    else: {
      kind: "if",
      cond: { kind: "cmp", op: "lt", left: fplPercentCents, right: money("30000") },
      then: capFor("97500", "195000"),
      else: capFor("162500", "325000"),
    },
  };
  const excess: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: fact("advancePTC"),
      right: ruleRef("us.federal.ptc"),
    },
  };
  return {
    id: "us.federal.ptc.excess_aptc_repayment",
    version: 1,
    jurisdiction: J,
    title: "Excess advance PTC repayment, limited (§ 36B(f)(2)(B), TY2025)",
    citation: {
      source: "26 U.S.C. § 36B(f)(2) (2024 ed.); Rev. Proc. 2024-40 § 2.07",
      section: "§ 36B(f)(2)(B)",
      url: "https://www.law.cornell.edu/uscode/text/26/36B",
      excerpt:
        "Advance payments in excess of the allowed credit increase the tax imposed — but for a taxpayer whose household income is less than 400 percent of the poverty line, the increase is capped by the applicable dollar amount: for 2025, $750 (under 200% FPL), $1,950 (200–300%), $3,250 (300–400%), 'one-half of such amount in the case of a taxpayer whose tax is determined under section 1(c)' [unmarried other than surviving spouses and heads of household] (Rev. Proc. 2024-40 § 2.07: $375/$975/$1,625). At or above 400% FPL the excess is repaid in full.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      // the same TY2025 poverty-line parameters as the credit rule —
      // the FPL band selects the repayment cap
      fplFirstPerson: { value: "1506000", type: "money" }, // $15,060
      fplPerAdditional: { value: "538000", type: "money" }, // $5,380
    },
    formula: {
      kind: "if",
      cond: gt0(fact("advancePTC")),
      then: {
        kind: "if",
        cond: { kind: "cmp", op: "lt", left: fplPercentCents, right: money("40000") },
        then: { kind: "min", args: [excess, cappedBand] },
        else: excess,
      },
      else: zero,
    },
  };
}

export const ptcRules: Rule[] = [
  ptcRule(
    2,
    "2025-01-01",
    "2026-01-01",
    "1506000", // $15,060 (2024 guidelines, used for TY2025)
    "538000", // $5,380 per additional person
    TIERS_2025,
    // 400%+ in 2025: 8.5%, no cliff (§ 36B(c)(1)(E))
    money("850"),
    "TY2025: ARPA/IRA 0–8.5%, no 400% cliff",
    "For taxable years beginning after December 31, 2020, and before January 1, 2026, the enhanced table applies (§ 36B(b)(3)(A)(iii); Rev. Proc. 2024-35: 0% to 150% FPL, rising linearly to 8.5% at 300–400%) and subparagraph (A) is applied 'without regard to \"but does not exceed 400 percent\"' (§ 36B(c)(1)(E)) — 8.5% with NO income cliff. Premium assistance is the lesser of enrollment premiums or the excess of the SLCSP benchmark over the applicable percentage of household income (§ 36B(b)(2)). Household income = MAGI + tax-exempt interest + the § 911 exclusion + nontaxable social security (§ 36B(d)(2)(B)); poverty line per the 2024 HHS guidelines (89 FR 2961: $15,060 + $5,380/person, 48 contiguous states — Alaska/Hawaii's higher guidelines not modeled, conservative). Below 100% FPL: not an applicable taxpayer — $0 (§ 36B(c)(1)(A); the (c)(1)(B) immigrant special rule not modeled, conservative). Married filing separately: $0 (§ 36B(c)(1)(C); the abuse/abandonment exception not modeled). [Monthly computation annualized; dependents' MAGI and the § 36B(c)(2) employer-coverage/affordability disqualifications attested by the inputs; Form 8962's whole-percent and 4-decimal table rounding may differ sub-dollar — statutory linear interpolation encoded.]",
  ),
  ptcRule(
    3,
    "2026-01-01",
    "2027-01-01",
    "1565000", // $15,650 (2025 guidelines, used for TY2026)
    "550000", // $5,500 per additional person
    TIERS_2026,
    // the 2026 cliff: over 400% FPL → not an applicable taxpayer → $0 credit
    "cliff",
    "TY2026: indexed statutory table, the 400% cliff returns",
    "For taxable years beginning in 2026 the ARPA/IRA enhancements have sunset by their own terms: the applicable percentage comes from the indexed statutory table (Rev. Proc. 2025-25 § 3.01: 2.10% under 133% FPL; 3.14→4.19 at 133–150; 4.19→6.60 at 150–200; 6.60→8.44 at 200–250; 8.44→9.96 at 250–300; 9.96 at 300–400), and the term 'applicable taxpayer' again requires household income that 'does not exceed 400 percent of… the poverty line' (§ 36B(c)(1)(A)) — one dollar past 400% FPL destroys the entire credit. Premium assistance is the lesser of enrollment premiums or the SLCSP benchmark minus the applicable percentage of household income (§ 36B(b)(2)). Household income = MAGI + tax-exempt interest + the § 911 exclusion + nontaxable social security (§ 36B(d)(2)(B)); poverty line per the 2025 HHS guidelines (90 FR 5917: $15,650 + $5,500/person, 48 contiguous states — AK/HI not modeled, conservative). Below 100% FPL: $0 (§ 36B(c)(1)(A); OBBBA § 71302 struck the (c)(1)(B) special rule). MFS: $0 (§ 36B(c)(1)(C)). [Monthly computation annualized; dependents' MAGI and employer-coverage disqualifications attested; Form 8962 rounding may differ sub-dollar.]",
  ),
  {
    id: "us.federal.ptc.net",
    version: 1,
    jurisdiction: J,
    title: "Net premium tax credit (credit in excess of advance payments)",
    citation: {
      source: "26 U.S.C. § 36B(f)(1); Schedule 3 (Form 1040) line 9",
      section: "§ 36B(f)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/36B",
      excerpt:
        "The credit allowed is reduced (but not below zero) by the advance payments made on the taxpayer's behalf — the remainder is the refundable net premium tax credit; advance payments in excess of the credit are an addition to tax (the excess-APTC repayment target).",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.ptc"),
        right: fact("advancePTC"),
      },
    },
  },
  repayment2025(),
  {
    id: "us.federal.ptc.excess_aptc_repayment",
    version: 2,
    jurisdiction: J,
    title: "Excess advance PTC repayment — UNCAPPED (OBBBA repealed § 36B(f)(2)(B), TY2026+)",
    citation: {
      source:
        "26 U.S.C. § 36B(f)(2), as amended by Pub. L. 119-21 (OBBBA) § 71305; Rev. Proc. 2025-32 § 2.04",
      section: "§ 36B(f)(2); OBBBA § 71305",
      url: "https://www.law.cornell.edu/uscode/text/26/36B",
      excerpt:
        "Section 71305 of the OBBBA removes § 36B(f)(2)(B), which limited the tax increase from excess advance payments for certain households, effective for taxable years beginning after December 31, 2025 (Rev. Proc. 2025-32 § 2.04, verbatim) — the FULL excess of advance payments over the allowed credit is repaid regardless of income.",
    },
    effectiveFrom: "2026-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("advancePTC"),
        right: ruleRef("us.federal.ptc"),
      },
    },
  },
];
