/**
 * Income tax before credits — 26 U.S.C. § 1(j) ordinary rate tables plus
 * the § 1(h)/§ 1(j)(5) preferential capital-gains stack.
 *
 * Computation (the Qualified Dividends and Capital Gain Tax Worksheet):
 *   ordinary part  = taxable income − preferential gains
 *   tax = ordinary brackets(ordinary part)
 *       + 15% × gains landing between the 0% and 15% breakpoints
 *       + 20% × gains above the 15% breakpoint
 *   (gains stack ON TOP of ordinary income; the 0% bracket absorbs gains
 *    up to the zero-rate breakpoint of TAXABLE income)
 *
 * Bracket tables and gains breakpoints per year, one rule VERSION per year:
 *   v3 TY2025 — Rev. Proc. 2024-40 §§ 2.01, 2.03
 *   v4 TY2026 — Rev. Proc. 2025-32 §§ 4.01, 4.03
 * (v1/v2 were the ordinary-only formulas, superseded in git history.)
 *
 * Method note: exact formula; the IRS Tax Table ($50 ranges below $100k)
 * can differ by a few dollars on filed returns.
 */

import type { BracketRow, Citation, Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });

const RATES = ["10", "12", "22", "24", "32", "35", "37"];

/** Build a bracket table from dollar lower bounds + the fixed rate ladder. */
function table(lowerBoundsDollars: number[]): BracketRow[] {
  return lowerBoundsDollars.map((dollars, i) => ({
    threshold: String(BigInt(dollars) * 100n),
    rate: { num: RATES[i], den: "100" },
  }));
}

const d = (dollars: number): Expr => money(String(BigInt(dollars) * 100n));

export interface StatusYear {
  brackets: BracketRow[];
  zeroMax: number; // maximum zero-rate amount (§ 1(j)(5)(B)(i))
  fifteenMax: number; // maximum 15%-rate amount
}
export type YearTables = Record<"single" | "mfj" | "hoh" | "mfs" | "qss", StatusYear>;

// Rev. Proc. 2024-40 §§ 2.01, 2.03 (2025)
const B25 = {
  single: table([0, 11925, 48475, 103350, 197300, 250525, 626350]),
  mfj: table([0, 23850, 96950, 206700, 394600, 501050, 751600]),
  hoh: table([0, 17000, 64850, 103350, 197300, 250500, 626350]),
  mfs: table([0, 11925, 48475, 103350, 197300, 250525, 375800]),
};
export const TY2025: YearTables = {
  single: { brackets: B25.single, zeroMax: 48350, fifteenMax: 533400 },
  mfj: { brackets: B25.mfj, zeroMax: 96700, fifteenMax: 600050 },
  qss: { brackets: B25.mfj, zeroMax: 96700, fifteenMax: 600050 },
  hoh: { brackets: B25.hoh, zeroMax: 64750, fifteenMax: 566700 },
  mfs: { brackets: B25.mfs, zeroMax: 48350, fifteenMax: 300000 },
};

// Rev. Proc. 2025-32 §§ 4.01, 4.03 (2026)
const B26 = {
  single: table([0, 12400, 50400, 105700, 201775, 256225, 640600]),
  mfj: table([0, 24800, 100800, 211400, 403550, 512450, 768700]),
  hoh: table([0, 17700, 67450, 105700, 201750, 256200, 640600]),
  mfs: table([0, 12400, 50400, 105700, 201775, 256225, 384350]),
};
export const TY2026: YearTables = {
  single: { brackets: B26.single, zeroMax: 49450, fifteenMax: 545500 },
  mfj: { brackets: B26.mfj, zeroMax: 98900, fifteenMax: 613700 },
  qss: { brackets: B26.mfj, zeroMax: 98900, fifteenMax: 613700 },
  hoh: { brackets: B26.hoh, zeroMax: 66200, fifteenMax: 579600 },
  mfs: { brackets: B26.mfs, zeroMax: 49450, fifteenMax: 306850 },
};

const taxable = ruleRef("us.federal.taxable_income");
const ordinary = ruleRef("us.federal.ordinary_taxable_income");

/** brackets(ordinary) + 15%/20% stack for one status-year. */
function statusTax(sy: StatusYear): Expr {
  // preferential amount actually inside taxable income
  const pref: Expr = { kind: "sub", left: taxable, right: ordinary };
  const gain0: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: { kind: "min", args: [d(sy.zeroMax), taxable] },
      right: ordinary,
    },
  };
  const gain15: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: {
        kind: "sub",
        left: { kind: "min", args: [d(sy.fifteenMax), taxable] },
        right: ordinary,
      },
      right: gain0,
    },
  };
  const gain20: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: { kind: "sub", left: pref, right: gain0 },
      right: gain15,
    },
  };
  return {
    kind: "add",
    args: [
      { kind: "brackets", base: ordinary, table: sy.brackets },
      { kind: "mulRate", base: gain15, rate: { num: "15", den: "100" }, round: "half-up" },
      { kind: "mulRate", base: gain20, rate: { num: "20", den: "100" }, round: "half-up" },
    ],
  };
}

function incomeTaxRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  tables: YearTables,
  yearLabel: string,
  citation: Citation,
): Rule {
  return {
    id: "us.federal.income_tax_before_credits",
    version,
    jurisdiction: "us.federal",
    title: `Income tax before credits (${yearLabel} rate tables + capital gains stack)`,
    citation,
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((s) => ({
        when: s,
        value: statusTax(tables[s]),
      })),
    },
  };
}

/**
 * IRS Tax Table midpoint: the printed table's entry for a band equals the
 * bracket formula evaluated at the band midpoint, rounded half-up to the
 * dollar. Band structure (verified against the printed 2025 Publication
 * 1040): [0,5) [5,15) [15,25), $25 bands to $3,000, $50 bands to $100,000.
 */
function bandMidpoint(o: Expr): Expr {
  const lt = (cents: string): Expr => ({
    kind: "cmp",
    op: "lt",
    left: o,
    right: money(cents),
  });
  const banded = (unit: string, half: string): Expr => ({
    kind: "add",
    args: [
      {
        kind: "mulInt",
        base: money(unit),
        count: { kind: "stepUnits", value: o, unitCents: unit, mode: "floor" },
      },
      money(half),
    ],
  });
  return {
    kind: "if",
    cond: lt("500"), // under $5
    then: money("250"),
    else: {
      kind: "if",
      cond: lt("1500"), // $5–15
      then: money("1000"),
      else: {
        kind: "if",
        cond: lt("2500"), // $15–25
        then: money("2000"),
        else: {
          kind: "if",
          cond: lt("300000"), // $25 bands to $3,000
          then: banded("2500", "1250"),
          else: banded("5000", "2500"), // $50 bands to $100,000
        },
      },
    },
  };
}

/** Table-method tax for one status-year: table lookup on the ordinary part
 *  (midpoint + half-up dollar rounding) + the exact gains stack. */
function statusTableTax(sy: StatusYear): Expr {
  const pref: Expr = { kind: "sub", left: taxable, right: ordinary };
  const gain0: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: { kind: "min", args: [d(sy.zeroMax), taxable] },
      right: ordinary,
    },
  };
  const gain15: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: {
        kind: "sub",
        left: { kind: "min", args: [d(sy.fifteenMax), taxable] },
        right: ordinary,
      },
      right: gain0,
    },
  };
  const gain20: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: { kind: "sub", left: pref, right: gain0 },
      right: gain15,
    },
  };
  return {
    kind: "add",
    args: [
      {
        kind: "roundToDollar",
        value: { kind: "brackets", base: bandMidpoint(ordinary), table: sy.brackets },
        mode: "half-up",
      },
      { kind: "mulRate", base: gain15, rate: { num: "15", den: "100" }, round: "half-up" },
      { kind: "mulRate", base: gain20, rate: { num: "20", den: "100" }, round: "half-up" },
    ],
  };
}

function taxTableRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  tables: YearTables,
  yearLabel: string,
  methodNote: string,
): Rule {
  return {
    id: "us.federal.income_tax_before_credits.tax_table",
    version,
    jurisdiction: "us.federal",
    title: `IRS Tax Table method for taxable income under $100,000 (${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 3(a); ${yearLabel} Form 1040 instructions (Tax Table)`,
      section: "§ 3(a); Tax Table",
      url: "https://www.irs.gov/pub/irs-pdf/p1040.pdf",
      excerpt: `Filers with taxable income under $100,000 must use the Tax Table, whose entries equal the § 1 bracket formula evaluated at each income band's midpoint ($0–5, $5–15, $15–25, $25 bands to $3,000, then $50 bands), rounded to the nearest dollar (halves up). Capital gains keep the exact QDCGT-worksheet percentages. ${methodNote}`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    applicability: {
      kind: "and",
      args: [
        { kind: "cmp", op: "lt", left: taxable, right: money("10000000") }, // < $100,000
        { kind: "not", arg: fact("useFormulaMethod") },
      ],
    },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((s) => ({
        when: s,
        value: statusTableTax(tables[s]),
      })),
    },
    overrides: { ruleId: "us.federal.income_tax_before_credits", priority: 10 },
  };
}

/**
 * Ordinary-rates tax on an arbitrary base expression, per the filing status
 * held in `statusFactId` — Tax Table method (band midpoint, half-up dollar)
 * below $100,000, exact § 1 formula at or above. This is the sub-computation
 * Form 8615 (kiddie tax) prescribes for both the child's and the parent's
 * recomputed taxes. Ordinary rates only — callers must guard preferential
 * income out before using it.
 */
export function ordinaryRateTaxExpr(
  base: Expr,
  statusFactId: string,
  year: "2025" | "2026",
): Expr {
  const tables = year === "2025" ? TY2025 : TY2026;
  const perStatus = (sy: StatusYear): Expr => ({
    kind: "if",
    cond: { kind: "cmp", op: "lt", left: base, right: money("10000000") }, // < $100,000
    then: {
      kind: "roundToDollar",
      value: { kind: "brackets", base: bandMidpoint(base), table: sy.brackets },
      mode: "half-up",
    },
    else: { kind: "brackets", base, table: sy.brackets },
  });
  return {
    kind: "match",
    on: fact(statusFactId),
    cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((s) => ({
      when: s,
      value: perStatus(tables[s]),
    })),
  };
}

export const incomeTaxRules: Rule[] = [
  {
    id: "us.federal.ordinary_taxable_income",
    version: 2, // v1 predated the standalone qualifiedDividends fact (dividends had to be folded into longTermCapitalGains)
    jurisdiction: "us.federal",
    title: "Taxable income taxed at ordinary rates (excludes preferential gains and qualified dividends)",
    citation: {
      source: "26 U.S.C. § 1(h)(1)(A), (h)(11)",
      section: "§ 1(h)(1)(A), (h)(11)",
      url: "https://www.law.cornell.edu/uscode/text/26/1",
      excerpt:
        "…a tax computed at the rates… on the greater of taxable income reduced by the net capital gain… § 1(h)(11)(A): qualified dividend income shall be treated as net capital gain for purposes of this subsection.",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: taxable,
        right: { kind: "add", args: [fact("longTermCapitalGains"), fact("qualifiedDividends")] },
      },
    },
  },
  incomeTaxRule(3, "2025-01-01", "2026-01-01", TY2025, "2025", {
    source: "26 U.S.C. § 1(h), (j); Rev. Proc. 2024-40",
    section: "§ 1(j)(2), (j)(5); Rev. Proc. 2024-40 §§ 2.01, 2.03",
    url: "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf",
    excerpt:
      "2025 ordinary rate tables (10–37%); maximum zero rate amounts $48,350/$96,700/$64,750/$48,350 and maximum 15% rate amounts $533,400/$600,050/$566,700/$300,000 by filing status.",
  }),
  incomeTaxRule(4, "2026-01-01", "2027-01-01", TY2026, "2026", {
    source: "26 U.S.C. § 1(h), (j); Rev. Proc. 2025-32",
    section: "§ 1(j)(2), (j)(5); Rev. Proc. 2025-32 §§ 4.01, 4.03",
    url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    excerpt:
      "2026 ordinary rate tables (10–37%); maximum zero rate amounts $49,450/$98,900/$66,200/$49,450 and maximum 15% rate amounts $545,500/$613,700/$579,600/$306,850 by filing status.",
  }),
  taxTableRule(
    1, "2025-01-01", "2026-01-01", TY2025, "2025",
    "Sampled entries verified against the printed 2025 Publication 1040 table.",
  ),
  taxTableRule(
    2, "2026-01-01", "2027-01-01", TY2026, "2026",
    "The official 2026 table publishes with the 2026 filing season; entries here are computed by the same published method over the 2026 brackets.",
  ),
];
