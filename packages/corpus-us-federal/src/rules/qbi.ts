/**
 * Qualified business income deduction — 26 U.S.C. § 199A, FULL mechanics
 * (below threshold, the phase-in band, and above — the former above-
 * threshold refusal is gone). Verified July 2026.
 *
 * QBI ≈ (SE net profit − ½ SE tax − SEP/solo-401(k) deduction − SE health
 * insurance) + K-1 pass-through ordinary income (Reg. § 1.199A-3(b)(1)(vi)
 * requires reducing QBI by the attributable ½-SE/§ 404/§ 162(l)
 * deductions; the shareholder's reasonable-comp W-2 wages are already
 * excluded because they live in the wages fact).
 *
 * Thresholds (Rev. Procs.) and the phase-in BAND — an OBBBA trap:
 *   2025: threshold $394,600 MFJ / $197,300 others; band $50,000
 *         ($100,000 joint) — § 199A(b)(3)(B) as enacted by the TCJA
 *   2026: threshold $403,500 MFJ / $201,775 MFS / $201,750 others;
 *         band WIDENED by OBBBA § 70105 to $75,000 ($150,000 joint)
 *
 * Above the threshold (§ 199A(b)(2)–(3), (d)(3); Form 8995-A):
 *   wage limit = greater of 50% of the business's W-2 wages, or
 *                25% of W-2 wages + 2.5% of UBIA
 *   in the band: the tentative 20% is reduced by (tentative − wage limit)
 *                × excess/band (no reduction if the wage limit is higher);
 *                an SSTB first scales QBI, W-2 wages, and UBIA by the
 *                applicable percentage (1 − excess/band)
 *   past the band: min(20% QBI, wage limit); an SSTB gets ZERO.
 * Exact ratios via mulDiv (Form 8995-A's rounded percentages may differ
 * sub-dollar — same disclosure class as the § 221 ratio).
 *
 * Single trade or business assumed (no aggregation election, no REIT/PTP
 * component) — disclosed. OBBBA § 70105 $400 minimum (TY2026+) retained.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

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
const pctOf = (num: string, den: string, base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den },
  round: "half-up",
});

// QBI base per Reg. § 1.199A-3(b)(1)(vi), net of external QBI losses
// (Reg. § 1.199A-1(d)(2)(iii): negative QBI from one business offsets the
// others' — the qbiLossOffset fact carries e.g. an allowed nonpassive
// § 469(c)(7) rental loss into the pool)
const qbi: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: {
      kind: "add",
      args: [
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: fact("selfEmploymentNetProfit"),
            right: {
              kind: "add",
              args: [
                ruleRef("us.federal.se_tax_half_deduction"),
                ruleRef("us.federal.sep_deduction"),
                ruleRef("us.federal.sehi_deduction"),
              ],
            },
          },
        },
        fact("k1OrdinaryBusinessIncome"),
      ],
    },
    right: fact("qbiLossOffset"),
  },
};

const hasBusinessIncome: Expr = {
  kind: "or",
  args: [
    { kind: "cmp", op: "gt", left: fact("selfEmploymentNetProfit"), right: zero },
    { kind: "cmp", op: "gt", left: fact("k1OrdinaryBusinessIncome"), right: zero },
  ],
};

const taxableBeforeQbi = ruleRef("us.federal.taxable_income_before_qbi");

/** the § 199A(b)(2)(B) W-2/UBIA limit over arbitrary wage/UBIA exprs */
const wageLimitOf = (w2: Expr, ubia: Expr): Expr => ({
  kind: "max",
  args: [
    pctOf("50", "100", w2),
    { kind: "add", args: [pctOf("25", "100", w2), pctOf("25", "1000", ubia)] }, // 2.5%
  ],
});

/** tentative − (tentative − wageLimit) × excess/band, floored at wageLimit */
function phasedReduction(tentative: Expr, wageLimit: Expr, excess: Expr, band: Expr): Expr {
  return {
    kind: "sub",
    left: tentative,
    right: {
      kind: "mulDiv",
      a: { kind: "max0", arg: { kind: "sub", left: tentative, right: wageLimit } },
      b: excess,
      c: band,
      round: "half-up",
    },
  };
}

function qbiRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  yearLabel: string,
  threshold: Expr,
  bandSingleCents: string,
  bandJointCents: string,
  source: string,
  withMinimum: boolean,
): Rule {
  const band: Expr = {
    kind: "if",
    cond: isStatus("mfj"),
    then: param("bandJoint"),
    else: param("band"),
  };
  const excess: Expr = {
    kind: "max0",
    arg: { kind: "sub", left: taxableBeforeQbi, right: threshold },
  };
  const excessCapped: Expr = { kind: "min", args: [excess, band] };

  const tentative = pctOf("20", "100", qbi);
  const w2 = fact("qbiW2Wages");
  const ubia = fact("qbiUBIA");

  // non-SSTB: in-band phase-in, past-band hard wage limit
  const nonSstb: Expr = {
    kind: "if",
    cond: { kind: "cmp", op: "ge", left: excess, right: band },
    then: { kind: "min", args: [tentative, wageLimitOf(w2, ubia)] },
    else: phasedReduction(tentative, wageLimitOf(w2, ubia), excessCapped, band),
  };

  // SSTB: scale QBI/W-2/UBIA by the applicable percentage first (§ 199A(d)(3))
  const remaining: Expr = { kind: "max0", arg: { kind: "sub", left: band, right: excess } };
  const scale = (e: Expr): Expr => ({
    kind: "mulDiv",
    a: e,
    b: remaining,
    c: band,
    round: "half-up",
  });
  const sstb: Expr = {
    kind: "if",
    cond: { kind: "cmp", op: "ge", left: excess, right: band },
    then: zero,
    else: phasedReduction(
      pctOf("20", "100", scale(qbi)),
      wageLimitOf(scale(w2), scale(ubia)),
      excessCapped,
      band,
    ),
  };

  const businessPart: Expr = {
    kind: "if",
    cond: { kind: "cmp", op: "eq", left: excess, right: zero },
    then: tentative, // at or below the threshold: no SSTB question, no limits
    else: { kind: "if", cond: fact("businessIsSSTB"), then: sstb, else: nonSstb },
  };

  // overall § 199A(a)(2) limit: 20% of (taxable income − net capital gain),
  // and § 199A(e)(3) treats qualified dividend income as net capital gain here
  const overall: Expr = pctOf("20", "100", {
    kind: "max0",
    arg: {
      kind: "sub",
      left: taxableBeforeQbi,
      right: { kind: "add", args: [fact("longTermCapitalGains"), fact("qualifiedDividends")] },
    },
  });
  const limited: Expr = { kind: "min", args: [businessPart, overall] };

  const withFloor: Expr = withMinimum
    ? {
        // OBBBA § 70105: $400 minimum when QBI ≥ $1,000 (TY2026+)
        kind: "if",
        cond: { kind: "cmp", op: "ge", left: qbi, right: param("minQbiFloor") },
        then: { kind: "max", args: [limited, param("minDeduction")] },
        else: limited,
      }
    : limited;

  return {
    id: "us.federal.qbi_deduction",
    version,
    jurisdiction: "us.federal",
    title: `Qualified business income deduction (TY${yearLabel}; full W-2/UBIA + SSTB mechanics)`,
    citation: {
      source: `26 U.S.C. § 199A; ${source}`,
      section: "§ 199A(a)–(d)",
      url: "https://www.law.cornell.edu/uscode/text/26/199A",
      excerpt: `20 percent of qualified business income — QBI reduced by the attributable ½-SE-tax, SEP, and SE-health-insurance deductions (Reg. § 1.199A-3(b)(1)(vi)) — limited to 20 percent of taxable income (without this deduction) less net capital gain. Above the § 199A(e)(2) threshold the deduction is limited to the greater of 50 percent of the business's W-2 wages or 25 percent of W-2 wages plus 2.5 percent of UBIA, phased in over the ${yearLabel === "2025" ? "$50,000 ($100,000 joint) band" : "OBBBA-widened $75,000 ($150,000 joint) band (§ 70105, taxable years after 2025)"}; a specified service trade or business scales its items by the applicable percentage and gets nothing past the band.${withMinimum ? " OBBBA § 70105 $400 minimum deduction with at least $1,000 of QBI (active participation assumed — disclosed)." : ""} [Single trade or business — no aggregation, no REIT/PTP component; W-2 wages and UBIA default to $0, which is conservative; exact ratios where Form 8995-A rounds percentages — disclosed.]`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      band: { value: bandSingleCents, type: "money" },
      bandJoint: { value: bandJointCents, type: "money" },
      ...(withMinimum
        ? {
            minDeduction: { value: "40000", type: "money" as const }, // $400
            minQbiFloor: { value: "100000", type: "money" as const }, // $1,000
          }
        : {}),
    },
    formula: {
      kind: "if",
      cond: hasBusinessIncome,
      then: withFloor,
      else: zero,
    },
  };
}

export const qbiRules: Rule[] = [
  qbiRule(
    7, // v3 refused above the threshold; v5 added the W-2/UBIA + SSTB mechanics; v7 counts qualifiedDividends in the § 199A(a)(2)/(e)(3) overall limit
    "2025-01-01", "2026-01-01", "2025",
    {
      kind: "if",
      cond: isStatus("mfj"),
      then: money("39460000"), // $394,600
      else: money("19730000"), // $197,300 (incl. MFS)
    },
    "5000000", "10000000", // $50,000 / $100,000 band (TCJA)
    "Rev. Proc. 2024-40 § 2.27",
    false,
  ),
  qbiRule(
    8, // v4 refused above the threshold; v6 added the mechanics + OBBBA band; v8 counts qualifiedDividends in the overall limit
    "2026-01-01", "2027-01-01", "2026",
    {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        { when: "mfj", value: money("40350000") }, // $403,500
        { when: "mfs", value: money("20177500") }, // $201,775
        { when: "single", value: money("20175000") }, // $201,750
        { when: "hoh", value: money("20175000") },
        { when: "qss", value: money("20175000") },
      ],
    },
    "7500000", "15000000", // $75,000 / $150,000 band (OBBBA § 70105)
    "Rev. Proc. 2025-32 § 4.26; OBBBA § 70105 (band + $400 minimum)",
    true,
  ),
];
