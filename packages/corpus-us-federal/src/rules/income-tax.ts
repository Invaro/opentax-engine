/**
 * Income tax before credits — 26 U.S.C. § 1(j) ordinary rate tables plus
 * the § 1(h)/§ 1(j)(5) preferential capital-gains stack.
 *
 * Computation (the Qualified Dividends and Capital Gain Tax Worksheet):
 *   ordinary part  = taxable income − preferential gains
 *   tax = tax on the ordinary part (line 22: Tax Table under $100,000,
 *         § 1 brackets at or above)
 *       + 15% × gains landing between the 0% and 15% breakpoints
 *       + 20% × gains above the 15% breakpoint
 *   (gains stack ON TOP of ordinary income; the 0% bracket absorbs gains
 *    up to the zero-rate breakpoint of TAXABLE income)
 *
 * Bracket tables and gains breakpoints per year, one rule VERSION per year:
 *   v3 TY2025 — Rev. Proc. 2024-40 §§ 2.01, 2.03
 *   v4 TY2026 — Rev. Proc. 2025-32 §§ 4.01, 4.03
 *   v5 TY2027 — Rev. Proc. 2026-35 §§ 3.01, 3.03
 * (v1/v2 were the ordinary-only formulas, superseded in git history.)
 *
 * Method note: the ordinary part follows worksheet line 22 (Tax Table under
 * $100,000); useFormulaMethod switches it to the exact formula.
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

// Rev. Proc. 2026-35 §§ 3.01, 3.03 (2027)
const B27 = {
  single: table([0, 12800, 52025, 109125, 208325, 264550, 661375]),
  mfj: table([0, 25600, 104050, 218250, 416650, 529100, 793650]),
  hoh: table([0, 18250, 69650, 109100, 208300, 264550, 661350]),
  mfs: table([0, 12800, 52025, 109125, 208325, 264550, 396825]),
};
export const TY2027: YearTables = {
  single: { brackets: B27.single, zeroMax: 51050, fifteenMax: 563200 },
  mfj: { brackets: B27.mfj, zeroMax: 102100, fifteenMax: 633600 },
  qss: { brackets: B27.mfj, zeroMax: 102100, fifteenMax: 633600 },
  hoh: { brackets: B27.hoh, zeroMax: 68350, fifteenMax: 598400 },
  mfs: { brackets: B27.mfs, zeroMax: 51050, fifteenMax: 316800 },
};

/** The rate tables for a supported tax year. */
export const TABLES_BY_YEAR = { "2025": TY2025, "2026": TY2026, "2027": TY2027 } as const;
export type TaxYear = keyof typeof TABLES_BY_YEAR;

const taxableRef = ruleRef("us.federal.taxable_income");
const ordinaryRef = ruleRef("us.federal.ordinary_taxable_income");
const taxable = taxableRef;
const ordinary = ordinaryRef;

/** brackets(ordinary) + 15%/20% stack for one status-year. */
function statusTax(sy: StatusYear, taxable: Expr = taxableRef, ordinary: Expr = ordinaryRef): Expr {
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
      ordinaryPartTax(sy, ordinary),
      { kind: "mulRate", base: gain15, rate: { num: "15", den: "100" }, round: "half-up" },
      { kind: "mulRate", base: gain20, rate: { num: "20", den: "100" }, round: "half-up" },
    ],
  };
}

/**
 * Tax on the ordinary part (QDCGT worksheet line 22): the Tax Table when the
 * ordinary part is under $100,000, even when taxable income is $100,000 or
 * more; the exact § 1 formula at or above, or under useFormulaMethod.
 */
function ordinaryPartTax(sy: StatusYear, ordinary: Expr = ordinaryRef): Expr {
  return {
    kind: "if",
    cond: {
      kind: "and",
      args: [
        { kind: "cmp", op: "lt", left: ordinary, right: money("10000000") }, // < $100,000
        { kind: "not", arg: fact("useFormulaMethod") },
      ],
    },
    then: {
      kind: "roundToDollar",
      value: { kind: "brackets", base: bandMidpoint(ordinary), table: sy.brackets },
      mode: "half-up",
    },
    else: { kind: "brackets", base: ordinary, table: sy.brackets },
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
  year: TaxYear,
): Expr {
  const tables = TABLES_BY_YEAR[year];
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

/**
 * The regular tax (Form 1040 line 16 by the Tax Table / Qualified Dividends and Capital Gain
 * Tax Worksheet method) on an arbitrary taxable income, with the return's preferential income
 * (net capital gain and qualified dividends) capped at that amount — the "tax on line A / line C"
 * computations Form 8582-CR prescribes. Equals us.federal.income_tax_before_credits at the
 * return's taxable income unless another method (e.g. § 911(f) stacking) overrides it.
 */
export function regularTaxOnExpr(ti: Expr, year: TaxYear): Expr {
  const tables = TABLES_BY_YEAR[year];
  const pref: Expr = {
    kind: "add",
    args: [ruleRef("us.federal.schedule_d.preferential_lt_gain"), fact("qualifiedDividends")],
  };
  const ord: Expr = { kind: "max0", arg: { kind: "sub", left: ti, right: pref } };
  return {
    kind: "match",
    on: fact("filingStatus"),
    cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((s) => ({
      when: s,
      value: statusTax(tables[s], ti, ord),
    })),
  };
}

/**
 * Schedule D Tax Worksheet (2025 Instructions for Schedule D), lines 1–47, for a return with
 * unrecaptured § 1250 gain (Schedule D line 19). No 28% rate gain and no Form 4952 line 4g
 * election are modeled, so lines 3–5, 8 and 41–43 are zero. Line 19 is the top of the 24%
 * bracket — "taxable income taxed at a rate below 28 percent" (§ 1(h)(1)(B)(ii)(I), with
 * § 1(j)) — which the printed 2025 worksheet shows as $197,300 / $394,600.
 */
function scheduleDWorksheetTax(sy: StatusYear): Expr {
  const add = (...args: Expr[]): Expr => ({ kind: "add", args });
  const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
  const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
  const min = (...args: Expr[]): Expr => ({ kind: "min", args });
  const max = (...args: Expr[]): Expr => ({ kind: "max", args });
  const pctOf = (e: Expr, n: string): Expr => ({ kind: "mulRate", base: e, rate: { num: n, den: "100" }, round: "half-up" });
  const top24 = sy.brackets.find((b) => b.rate.num === "32")!.threshold;
  const ordTax = (base: Expr): Expr => ({
    kind: "if",
    cond: {
      kind: "and",
      args: [
        { kind: "cmp", op: "lt", left: base, right: money("10000000") }, // Tax Table under $100,000
        { kind: "not", arg: fact("useFormulaMethod") },
      ],
    },
    then: { kind: "roundToDollar", value: { kind: "brackets", base: bandMidpoint(base), table: sy.brackets }, mode: "half-up" },
    else: { kind: "brackets", base, table: sy.brackets },
  });
  const L1 = taxable;
  const L6 = fact("qualifiedDividends");
  const L9 = ruleRef("us.federal.schedule_d.preferential_lt_gain"); // line 7 = smaller of Schedule D lines 15 and 16
  const L10 = add(L6, L9);
  const unrecap = ruleRef("us.federal.schedule_d.unrecaptured_1250");
  const L12 = min(L9, unrecap); // line 11 = lines 18 + 19 of Schedule D (no 28% gain)
  const L13 = sub(L10, L12);
  const L14 = max0(sub(L1, L13));
  const L16 = min(L1, d(sy.zeroMax));
  const L17 = min(L14, L16);
  const L18 = max0(sub(L1, L10));
  const L20 = min(L14, min(L1, money(top24)));
  const L21 = max(L18, L20);
  const L22 = sub(L16, L17);
  const L23 = min(L1, L13);
  const L25 = max0(sub(L23, L22));
  const L29 = max0(sub(min(L1, d(sy.fifteenMax)), add(L21, L22)));
  const L30 = min(L25, L29);
  const L32 = add(L22, L30);
  const L33 = max0(sub(L23, L32));
  const L38 = max0(sub(add(L10, L21), L1));
  const L39 = max0(sub(min(L9, unrecap), L38));
  const L45 = add(pctOf(L30, "15"), pctOf(L33, "20"), pctOf(L39, "25"), ordTax(L21));
  return min(L45, ordTax(L1));
}

function scheduleDWorksheetRule(version: number, from: string, to: string, tables: YearTables, yearLabel: string): Rule {
  return {
    id: "us.federal.income_tax_before_credits.schedule_d_worksheet",
    version,
    jurisdiction: "us.federal",
    title: `Schedule D Tax Worksheet — tax with unrecaptured § 1250 gain at up to 25% (${yearLabel})`,
    citation: {
      source: "26 U.S.C. § 1(h)(1)(E), (h)(6); 2025 Instructions for Schedule D (Form 1040), Schedule D Tax Worksheet",
      section: "§ 1(h)(1); Schedule D Tax Worksheet lines 1–47",
      url: "https://www.irs.gov/forms-pubs/about-schedule-d-form-1040",
      excerpt: `"Complete this worksheet only if line 18 or line 19 of Schedule D is more than zero and lines 15 and 16 of Schedule D are gains". "11. Add lines 18 and 19 of Schedule D"; "12. Enter the smaller of line 9 or line 11"; "13. Subtract line 12 from line 10"; "19. Enter the smaller of line 1 or: $197,300 if single or married filing separately; $394,600 if married filing jointly or qualifying surviving spouse; or $197,300 if head of household"; "35. Enter the smaller of line 9 above or Schedule D, line 19"; "38. Subtract line 37 from line 36"; "39. Subtract line 38 from line 35"; "40. Multiply line 39 by 25% (0.25)"; "44. Figure the tax on the amount on line 21. If the amount on line 21 is less than $100,000, use the Tax Table"; "47. Tax on all taxable income ... Enter the smaller of line 45 or line 46." § 1(h)(1)(E): "25 percent of the excess (if any) of— (i) the unrecaptured section 1250 gain (or, if less, the net capital gain (determined without regard to paragraph (11))), over (ii) the excess (if any) of— (I) the sum of the amount on which tax is determined under subparagraph (A) plus the net capital gain, over (II) taxable income". [Line 19 for ${yearLabel} is the start of the 32% bracket in the year’s rate table. Not modeled: 28% rate gain (Schedule D line 18) and the Form 4952 line 4g election.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    applicability: {
      kind: "and",
      args: [
        { kind: "cmp", op: "gt", left: ruleRef("us.federal.schedule_d.unrecaptured_1250"), right: money("0") },
        { kind: "cmp", op: "gt", left: ruleRef("us.federal.schedule_d.preferential_lt_gain"), right: money("0") },
      ],
    },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((s) => ({ when: s, value: scheduleDWorksheetTax(tables[s]) })),
    },
    overrides: { ruleId: "us.federal.income_tax_before_credits", priority: 12 }, // above the Tax Table (10); FEIE stacking (15) and kiddie (20) refuse capital gains
  };
}

export const incomeTaxRules: Rule[] = [
  {
    id: "us.federal.ordinary_taxable_income",
    version: 3, // v2 read the raw longTermCapitalGains fact; the § 1(h) amount is now the § 1222(11) netted result from schedule_d
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
        right: {
          kind: "add",
          args: [ruleRef("us.federal.schedule_d.preferential_lt_gain"), fact("qualifiedDividends")],
        },
      },
    },
  },
  incomeTaxRule(3, "2025-01-01", "2026-01-01", TY2025, "2025", {
    source: "26 U.S.C. § 1(h), (j); Rev. Proc. 2024-40",
    section: "§ 1(j)(2), (j)(5); Rev. Proc. 2024-40 §§ 2.01, 2.03",
    url: "https://www.irs.gov/pub/irs-drop/rp-24-40.pdf",
    excerpt:
      "2025 ordinary rate tables (10–37%); maximum zero rate amounts $48,350/$96,700/$64,750/$48,350 and maximum 15% rate amounts $533,400/$600,050/$566,700/$300,000 by filing status. Qualified Dividends and Capital Gain Tax Worksheet line 22: tax on the ordinary part from the Tax Table if it is less than $100,000, otherwise the Tax Computation Worksheet.",
  }),
  incomeTaxRule(4, "2026-01-01", "2027-01-01", TY2026, "2026", {
    source: "26 U.S.C. § 1(h), (j); Rev. Proc. 2025-32",
    section: "§ 1(j)(2), (j)(5); Rev. Proc. 2025-32 §§ 4.01, 4.03",
    url: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    excerpt:
      "2026 ordinary rate tables (10–37%); maximum zero rate amounts $49,450/$98,900/$66,200/$49,450 and maximum 15% rate amounts $545,500/$613,700/$579,600/$306,850 by filing status. Qualified Dividends and Capital Gain Tax Worksheet line 22: tax on the ordinary part from the Tax Table if it is less than $100,000, otherwise the Tax Computation Worksheet.",
  }),
  incomeTaxRule(5, "2027-01-01", "2028-01-01", TY2027, "2027", {
    source: "26 U.S.C. § 1(h), (j); Rev. Proc. 2026-35",
    section: "§ 1(j)(2), (j)(5); Rev. Proc. 2026-35 §§ 3.01, 3.03",
    url: "https://www.irs.gov/pub/irs-drop/rp-26-35.pdf",
    excerpt:
      "2027 ordinary rate tables (10–37%): single 10% to $12,800, 12% to $52,025, 22% to $109,125, 24% to $208,325, 32% to $264,550, 35% to $661,375, 37% above ($396,825 MFS; joint $25,600 / $104,050 / $218,250 / $416,650 / $529,100 / $793,650; head of household $18,250 / $69,650 / $109,100 / $208,300 / $264,550 / $661,350). Maximum zero rate amounts $51,050/$102,100/$68,350/$51,050 and maximum 15% rate amounts $563,200/$633,600/$598,400/$316,800 (single/joint/head of household/MFS). Qualified Dividends and Capital Gain Tax Worksheet line 22: tax on the ordinary part from the Tax Table if it is less than $100,000, otherwise the Tax Computation Worksheet.",
  }),
  taxTableRule(
    1, "2025-01-01", "2026-01-01", TY2025, "2025",
    "Sampled entries verified against the printed 2025 Publication 1040 table.",
  ),
  taxTableRule(
    2, "2026-01-01", "2027-01-01", TY2026, "2026",
    "The official 2026 table publishes with the 2026 filing season; entries here are computed by the same published method over the 2026 brackets.",
  ),
  taxTableRule(
    3, "2027-01-01", "2028-01-01", TY2027, "2027",
    "The official 2027 table publishes with the 2027 filing season; entries here are computed by the same published method over the 2027 brackets (Rev. Proc. 2026-35 § 3.01).",
  ),
  scheduleDWorksheetRule(1, "2025-01-01", "2026-01-01", TY2025, "2025"),
  scheduleDWorksheetRule(2, "2026-01-01", "2027-01-01", TY2026, "2026"),
  scheduleDWorksheetRule(3, "2027-01-01", "2028-01-01", TY2027, "2027"),
];
