import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Nebraska deep pack — TY2025 Form 1040N (resident). Every amount verified
 * from the printed 2025 Nebraska Individual Income Tax Booklet (51 pp: Form
 * 1040N and Schedule I/II/III instructions, the 2025 Nebraska Tax Table pp.
 * 46-49 with its over-$77,760 worksheet, the 2025 Tax Calculation Schedule),
 * the printed 2025 Form 1040N, Schedules I-III, Form 2441N, and Form PTC, and
 * Neb. Rev. Stat. §§ 77-2715, 77-2715.03, 77-2715.07, 77-2716, 77-2716.01,
 * 77-2730 (nebraskalegislature.gov, as amended through the 2025 session).
 *
 * Load-bearing findings:
 *  - Two sanctioned methods for line 15: "Paper filers may use the Nebraska
 *    Tax Table. Electronic filers must use the Nebraska Tax Calculation
 *    Schedule." The Calculation Schedule is the § 77-2715.03 schedule with
 *    ROUNDED printed anchors ($99.14 / $804.30 / $1,543.28 …); the Tax Table
 *    is the EXACT marginal schedule (unrounded anchors) at the midpoint of
 *    each "(over lo, but not over lo+100]" row — all 777 rows × 4 columns
 *    reproduce only with unrounded anchors — and its over-$77,760 worksheet
 *    chains from the table's endpoint ($3,566 / $3,088 / $3,276 + 5.2%).
 *    The Calculation Schedule is the default (e-filers must use it);
 *    neUseTaxTable selects the paper table.
 *  - LB 754 (2023) schedules the rates: rate four is 5.20% for 2025, and BOTH
 *    rate three and rate four fall to 4.55% for 2026 and 3.99% for 2027. The
 *    brackets, standard deduction, and $171 personal exemption credit are
 *    CPI-indexed each year. DOR has published the 2026 amounts twice (the
 *    2026 Form 1040N-ES rate schedule / deduction page and the Nebraska Tax
 *    Rate Chronologies Rev. 2-2026), so those three rules carry a version 2
 *    for 2026 (to 2027-01-01) pending the 2026 booklet; the unindexed
 *    credits run to 2027-01-01.
 *  - § 77-2715(1): a filer whose net Schedule I adjustments are under $5,000
 *    cannot owe more Nebraska tax after nonrefundable credits than their
 *    federal tax before credits — the line 35 Federal Tax Liability Worksheet.
 *  - Social Security and military retirement are 100% excluded (§ 77-2716(14),
 *    (15)); the school district property tax credit ended after 2023 (LB 34
 *    moved the relief onto the property tax statement) — Form PTC now carries
 *    only the community college credit, at 100% of the tax paid.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const minE = (...args: Expr[]): Expr => ({ kind: "min", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
const isJoint: Expr = or(isStatus("mfj"), isStatus("qss")); // "Married, filing jointly *" — "A qualifying surviving spouse must also use this column"
const isHoh: Expr = isStatus("hoh");
const isSingleSched: Expr = or(isStatus("single"), isStatus("mfs")); // single and MFS share one schedule
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents × 10^4 = dollars × 10^6) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr, denCents: string): Expr =>
  times({ kind: "mulDiv", a: n, b: money("1"), c: money(denCents), round: "half-up" }, "100");
/** Σ rate_i × portion in bracket i, scaled ×10,000 (rate numerators per 10,000) — the EXACT marginal schedule */
const scaledSchedule = (base: Expr, rows: { thresholdCents: string; rateNum: string }[]): Expr =>
  add(
    ...rows.map((r, i) => {
      const excess = sub(base, money(r.thresholdCents));
      const portion: Expr =
        i + 1 < rows.length
          ? { kind: "clamp", value: excess, lo: money("0"), hi: money(String(BigInt(rows[i + 1].thresholdCents) - BigInt(r.thresholdCents))) }
          : max0(excess);
      return times(portion, r.rateNum);
    }),
  );
/** the printed Tax Calculation Schedule: fixed (rounded, as printed) + rate × excess over the bracket floor, ONE rounding */
const calcSchedule = (base: Expr, rows: { thresholdCents: string; fixedCents: string; rateNum: string }[]): Expr => {
  let expr: Expr = dollarsFromScaled(add(times(money(rows[0].fixedCents), "10000"), times(sub(base, money(rows[0].thresholdCents)), rows[0].rateNum)), "1000000");
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    expr = iff(gt(base, money(r.thresholdCents)), dollarsFromScaled(add(times(money(r.fixedCents), "10000"), times(sub(base, money(r.thresholdCents)), r.rateNum)), "1000000"), expr);
  }
  return expr;
};

// 2025 Tax Calculation Schedule (8-460-2025) — § 77-2715.03 brackets indexed for 2025, rates 2.46 / 3.51 / 5.01 / 5.20%
const CALC_SINGLE = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
  { thresholdCents: "403000", fixedCents: "9914", rateNum: "351" }, // $99.14 + 3.51% over $4,030
  { thresholdCents: "2412000", fixedCents: "80430", rateNum: "501" }, // $804.30 + 5.01% over $24,120
  { thresholdCents: "3887000", fixedCents: "154328", rateNum: "520" }, // $1,543.28 + 5.20% over $38,870
];
const CALC_JOINT = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
  { thresholdCents: "804000", fixedCents: "19778", rateNum: "351" }, // $197.78 + 3.51% over $8,040
  { thresholdCents: "4825000", fixedCents: "160915", rateNum: "501" }, // $1,609.15 + 5.01% over $48,250
  { thresholdCents: "7773000", fixedCents: "308610", rateNum: "520" }, // $3,086.10 + 5.20% over $77,730
];
const CALC_HOH = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
  { thresholdCents: "751000", fixedCents: "18475", rateNum: "351" }, // $184.75 + 3.51% over $7,510
  { thresholdCents: "3859000", fixedCents: "127566", rateNum: "501" }, // $1,275.66 + 5.01% over $38,590
  { thresholdCents: "5763000", fixedCents: "222956", rateNum: "520" }, // $2,229.56 + 5.20% over $57,630
];
const exactRows = (rows: { thresholdCents: string; rateNum: string }[]) => rows.map((r) => ({ thresholdCents: r.thresholdCents, rateNum: r.rateNum }));

const BOOKLET_URL = "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_Individual_Income_Tax_Booklet.pdf";
const CALC_URL = "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/2025_Tax_Calculation_Schedule.pdf";
const TABLE_URL = "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/2025_Tax_Tables.pdf";

export const neRules: Rule[] = [
  {
    id: "us.ne.income_tax",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska income tax — 2025 Tax Calculation Schedule (2.46 / 3.51 / 5.01 / 5.20% at $4,030 / $24,120 / $38,870 single and MFS; $8,040 / $48,250 / $77,730 MFJ and QSS; $7,510 / $38,590 / $57,630 HOH), or the paper Tax Table (row midpoints, exact anchors) and its over-$77,760 worksheet (Form 1040N line 15)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715.03(2)-(5) (LB 754, 2023: rate four 5.20% for 2025; brackets indexed by CPI-U, rounded to $10); 2025 Nebraska Tax Calculation Schedule (8-460-2025); 2025 Nebraska Tax Table pp. 46-49 of the booklet and the 'Over $77,760' worksheet; 2025 booklet line 15 instructions p. 14",
      section: "§ 77-2715.03; Form 1040N line 15; Tax Calculation Schedule; Tax Table",
      url: CALC_URL,
      excerpt:
        "STATUTE (§ 77-2715.03(2)(a)-(c), verbatim): bracket table 'Single Individuals $0-2,999 / $3,000-17,999 / $18,000-28,999 / $29,000 and Over; Married, Filing Jointly $0-5,999 / $6,000-35,999 / $36,000-57,999 / $58,000 and Over; Head of Household $0-5,599 / $5,600-28,799 / $28,800-42,999 / $43,000 and Over; Married, Filing Separate $0-2,999 / $3,000-17,999 / $18,000-28,999 / $29,000 and Over' at '2.46%', '3.51%', 'Rate Three', 'Rate Four'; '(b) … rate three shall be: (i) 5.01% for taxable years beginning or deemed to begin on or after January 1, 2014, and before January 1, 2026; (ii) 4.55% … on or after January 1, 2026, and before January 1, 2027; and (iii) 3.99% … on or after January 1, 2027. (c) … rate four shall be: … (iv) 5.20% for taxable years beginning or deemed to begin on or after January 1, 2025, and before January 1, 2026; (v) 4.55% … 2026 …; and (vi) 3.99% … 2027.' '(3)(a) For taxable years beginning or deemed to begin on or after January 1, 2015, the minimum and maximum dollar amounts for each income tax bracket … shall be adjusted for inflation … rounded to the nearest ten-dollar amount.' '(5) The Tax Commissioner shall prepare, from the rate schedules, tax tables … The difference in tax between two tax table brackets shall not exceed fifteen dollars.' 2025 TAX CALCULATION SCHEDULE (verbatim): 'Single Taxpayers: $0 – $4,030: 2.46% of Nebraska Taxable Income, line 14, Form 1040N; 4,030 – 24,120: $99.14 + 3.51% of the excess over $4,030; 24,120 – 38,870: $804.30 + 5.01% of the excess over $24,120; 38,870 – ––: $1,543.28 + 5.20% of the excess over $38,870. Married Taxpayers, Filing Jointly and Qualifying Surviving Spouses: $0 – $8,040: 2.46%; 8,040 – 48,250: $197.78 + 3.51% of the excess over $8,040; 48,250 – 77,730: $1,609.15 + 5.01% of the excess over $48,250; 77,730 – ––: $3,086.10 + 5.20% of the excess over $77,730. Married Taxpayers, Filing Separately: [same as Single]. Head of Household Taxpayers: $0 – $7,510: 2.46%; 7,510 – 38,590: $184.75 + 3.51% of the excess over $7,510; 38,590 – 57,630: $1,275.66 + 5.01% of the excess over $38,590; 57,630 – ––: $2,229.56 + 5.20% of the excess over $57,630.' BOOKLET (line 15, verbatim): 'Paper filers may use the Nebraska Tax Table. Electronic filers must use the Nebraska Tax Calculation Schedule.' 'Enter All Amounts as Whole Dollars … Round any amount from 50 cents to 99 cents to the next higher dollar. Round any amount less than 50 cents to the next lower dollar.' TAX TABLE (verbatim header): 'Use your Nebraska taxable income found on line 14, Form 1040N. Only taxpayers filing paper returns may use the Nebraska Tax Table. If your Nebraska taxable income is more than the highest amount in the tax table, see instructions at the end of the table. If Nebraska taxable income is — Over / But not over — And you are — Single / Married, filing jointly * / Married, filing separately / Head of a household — Your Nebraska tax is —'; '* A qualifying surviving spouse must also use this column'; first rows '60 160 $3 $3 $3 $3', '160 260 $5 $5 $5 $5'; last row '77660 77760 $3,563 $3,085 $3,563 $3,274'. CONVENTION (verified on all 777 rows × 4 columns): each cell is the EXACT § 77-2715.03 marginal schedule (unrounded anchors: 2.46% × $8,040 = $197.784, not the schedule's $197.78) at the row midpoint (lo + 50), rounded half-up — the rounded-anchor schedule misses 12 cells (e.g. MFJ row 10,660-10,760: exact $291.501 → $292 printed; rounded anchors give $291.497 → $291). WORKSHEET (verbatim): 'Over $77,760 — Use the following worksheet if your Nebraska taxable income is more than the maximum amount included in the 2025 Nebraska Tax Table. The tax table shown above calculates tax to the midpoint of the bracket. The amounts shown below represent tax calculated on $77,760, the endpoint of the bracket. Single: Add $3,566 plus 5.20% of the amount over $77,760. Married, filing jointly or qualifying surviving spouse: Add $3,088 plus 5.20% of the amount over $77,760. Married, filing separately: Add $3,566 plus 5.20% of the amount over $77,760. Head of household: Add $3,276 plus 5.20% of the amount over $77,760.' ENCODING: default = the Tax Calculation Schedule as printed (rounded anchors + rate × excess, one whole-dollar rounding — the method e-filers must use); neUseTaxTable = true → the paper table (midpoint of the (lo, lo+100] row on the exact schedule for $61-$77,760; the exact schedule on the income itself at $60 or less, where no row is printed) and the endpoint worksheet above $77,760. The two methods differ by up to $3 (the table prices the row midpoint, up to $50 from the income; its worksheet base $3,566 vs the schedule's $3,565.55 at $77,760). MFS uses the single schedule; a federal QSS uses the joint column. 2026: version 2 of this rule (LB 754's 4.55% / 4.55% rates on the DOR-published 2026 brackets). Nonresidents and partial-year residents apportion on Schedule III (not composed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "246", type: "int" },
      rate2Bps: { value: "351", type: "int" },
      rate3Bps: { value: "501", type: "int" },
      rate4Bps: { value: "520", type: "int" },
      singleBracket1: { value: "403000", type: "money" },
      singleBracket2: { value: "2412000", type: "money" },
      singleBracket3: { value: "3887000", type: "money" },
      jointBracket1: { value: "804000", type: "money" },
      jointBracket2: { value: "4825000", type: "money" },
      jointBracket3: { value: "7773000", type: "money" },
      hohBracket1: { value: "751000", type: "money" },
      hohBracket2: { value: "3859000", type: "money" },
      hohBracket3: { value: "5763000", type: "money" },
      tableTop: { value: "7776000", type: "money" }, // $77,760
      tableWorksheetBaseSingleMfs: { value: "356600", type: "money" },
      tableWorksheetBaseJoint: { value: "308800", type: "money" },
      tableWorksheetBaseHoh: { value: "327600", type: "money" },
      rate3Bps2026: { value: "455", type: "int" },
      rate4Bps2026: { value: "455", type: "int" },
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const calc: Expr = iff(isJoint, calcSchedule(x, CALC_JOINT), iff(isHoh, calcSchedule(x, CALC_HOH), calcSchedule(x, CALC_SINGLE)));
      // paper table: rows (60 + 100k, 160 + 100k] → midpoint 110 + 100k; exact schedule at the midpoint
      const k = stepUnits(sub(x, money("6000")), "10000", "ceil");
      const mid: Expr = add(mulInt(money("10000"), k), money("1000"));
      const exactAt = (b: Expr): Expr =>
        iff(
          isJoint,
          dollarsFromScaled(scaledSchedule(b, exactRows(CALC_JOINT)), "1000000"),
          iff(isHoh, dollarsFromScaled(scaledSchedule(b, exactRows(CALC_HOH)), "1000000"), dollarsFromScaled(scaledSchedule(b, exactRows(CALC_SINGLE)), "1000000")),
        );
      const worksheetBase: Expr = iff(isJoint, money("308800"), iff(isHoh, money("327600"), money("356600")));
      const worksheet: Expr = dollarsFromScaled(add(times(worksheetBase, "10000"), times(sub(x, money("7776000")), "520")), "1000000");
      const table: Expr = iff(le(x, money("6000")), exactAt(x), iff(le(x, money("7776000")), exactAt(mid), worksheet));
      return iff(fact("neUseTaxTable"), table, calc);
    })(),
  },
  {
    id: "us.ne.standard_deduction",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska standard deduction — $8,600 single and MFS, $17,200 MFJ and QSS, $12,600 HOH, plus $2,000 (single, HOH) or $1,650 (married, QSS) per 65-or-older/blind box; a dependent filer gets the smaller of the federal standard deduction and the Nebraska amount (Form 1040N line 6)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2716.01(3) ($6,750 / $9,900 base and $1,300 / $1,600 additional amounts indexed by CPI-U from 2019, rounded down to $50); 2025 booklet, line 6 instructions and 'Nebraska Standard Deduction Chart' p. 13; printed Form 1040N line 6",
      section: "§ 77-2716.01(3); Form 1040N lines 2a, 2b, 6",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(3)(a) For tax years beginning or deemed to begin on or after January 1, 2018, every individual who did not itemize deductions on his or her federal return shall be allowed to subtract from federal adjusted gross income a standard deduction based on the filing status used on the federal return. The standard deduction shall be the smaller of the federal standard deduction actually allowed or (i) six thousand seven hundred fifty dollars for single taxpayers and (ii) nine thousand nine hundred dollars for head of household taxpayers. The standard deduction for married filing jointly taxpayers or qualifying widows or widowers shall be double the standard deduction for single taxpayers, and the standard deduction for married filing separately taxpayers shall be the same as the standard deduction for single taxpayers. Taxpayers who are allowed additional federal standard deduction amounts because of age or blindness shall be allowed an increase in the Nebraska standard deduction for each additional amount allowed on the federal return. The additional amounts shall be one thousand three hundred dollars for married taxpayers and one thousand six hundred dollars for single or head of household taxpayers. (b) For tax years beginning or deemed to begin on or after January 1, 2019, the standard deduction amounts, including the additional standard deduction amounts, in this subsection shall be adjusted for inflation … If any amount is not a multiple of fifty dollars, the amount shall be rounded to the next lowest multiple of fifty dollars.' BOOKLET (line 6, verbatim): 'If you use the standard deduction on the federal return, you must use the Nebraska standard deduction on the Nebraska return. All taxpayers that claimed itemized deductions on their federal return are allowed the larger of the Nebraska standard deduction or federal itemized deductions, minus state and local income taxes claimed on Federal Schedule A. … If you or your spouse can be claimed by another taxpayer for federal child tax credit or dependent tax credit purposes, your standard deduction is the smaller of the federal standard deduction allowed on line 12e of the Federal Form 1040 or 1040-SR, or the Nebraska standard deduction from the following chart.' CHART (verbatim, 'Filing Status / Number of Boxes Checked on Line 2a / Standard Deduction'): 'Single 0 $8,600; 1 $10,600; 2 $12,600. Married, Filing Jointly 0 $17,200; 1 $18,850; 2 $20,500; 3 $22,150; 4 $23,800. Qualifying surviving spouse 0 $17,200; 1 $18,850; 2 $20,500. Married, Filing Separately 0 $8,600; 1 $10,250; 2 $11,900; 3 $13,550; 4 $15,200. If married, filing separately, the additional amounts for spouse 65 and over and blind apply only if the primary taxpayer can claim a personal exemption for his or her spouse. Head of Household 0 $12,600; 1 $14,600; 2 $16,600.' ENCODING: base + per-box amount × boxes (single/HOH $2,000, MFJ/QSS/MFS $1,650), boxes clamped at 2 for single, QSS, and HOH and 4 for MFJ and MFS; when isClaimedAsDependent, the smaller of that and neFederalStandardDeduction. Version 2 carries the DOR-published 2026 amounts.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "860000", type: "money" },
      joint: { value: "1720000", type: "money" },
      hoh: { value: "1260000", type: "money" },
      perBoxSingleHoh: { value: "200000", type: "money" },
      perBoxMarried: { value: "165000", type: "money" },
    },
    formula: (() => {
      const base: Expr = iff(isJoint, money("1720000"), iff(isHoh, money("1260000"), money("860000")));
      const perBox: Expr = iff(or(isStatus("single"), isHoh), money("200000"), money("165000"));
      const maxBoxes: Expr = iff(or(isStatus("mfj"), isStatus("mfs")), int("4"), int("2"));
      const boxes: Expr = iff(gt(fact("neAgeBlindBoxes"), maxBoxes), maxBoxes, fact("neAgeBlindBoxes"));
      const ne = add(base, mulInt(perBox, boxes));
      return iff(fact("isClaimedAsDependent"), minE(ne, max0(fact("neFederalStandardDeduction"))), ne);
    })(),
  },
  {
    id: "us.ne.itemized_deductions",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska itemized deductions — federal Schedule A total minus the state and local INCOME taxes on Schedule A line 5a (before the federal cap); a federal itemizer takes the larger of this and the Nebraska standard deduction (Form 1040N lines 7-10)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2716.01(4); 2025 booklet, lines 7-10 instructions p. 14",
      section: "§ 77-2716.01(4); Form 1040N lines 7, 8, 9, 10",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(4) Every individual who itemized deductions on his or her federal return shall be allowed to subtract from federal adjusted gross income the greater of either the standard deduction allowed in this section or his or her federal itemized deductions as defined in section 63(d) of the Internal Revenue Code of 1986, as amended, except for the amount for state or local income taxes included in federal itemized deductions before any federal disallowance.' BOOKLET (verbatim): 'Line 7 Total Itemized Deductions. If you itemized deductions on your federal return, enter the amount from line 17 of Schedule A, Federal Form 1040. If you did not itemize deductions on your federal return, skip lines 7 through 9 and enter the line 6 amount on line 10. … Line 8 State and Local Income Taxes. If you itemized deductions on your federal return, you must enter the amount of state and local income taxes reported on Federal Schedule A, line 5a even if the total amount of state and local taxes was limited to $40,000 ($20,000 married, filing separately) on Federal Schedule A, line 5e. If you entered general sales taxes on Federal Schedule A, line 5a, do not enter an amount on line 8. Line 9 Nebraska Itemized Deductions. Line 7 minus line 8. Line 10 Nebraska Deductions. Enter line 6 or line 9, whichever is greater.' ENCODING: max0(federal itemized total − state and local income taxes on 5a); the composer takes the larger of this and us.ne.standard_deduction only when the filer itemized federally (a federal standard-deduction filer must use the Nebraska standard deduction). Pass neSaltIncomeTaxes = 0 when line 5a is general sales tax.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {},
    formula: max0(sub(max0(fact("neFederalItemizedDeductions")), max0(fact("neSaltIncomeTaxes")))),
  },
  {
    id: "us.ne.personal_exemption_credit",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska personal exemption credit — $171 per Nebraska personal exemption (yourself and spouse unless claimable as another's dependent, plus federal child tax credit / other dependent credit dependents) (Form 1040N line 18)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2716.01(1)(b) ($134 for 2018, indexed by CPI-U, rounded to the dollar); 2025 booklet, lines 4a-4c p. 12 and line 18 p. 14; printed Form 1040N lines 4 and 18",
      section: "§ 77-2716.01(1)(b); Form 1040N lines 4a, 4b, 4c, 18",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(b) Beginning with tax year 2018, every individual, except an individual that can be claimed for a child credit or dependent credit on the federal return of another taxpayer, shall be allowed to subtract from his or her income tax liability an amount for personal exemptions. The amount allowed to be subtracted shall be the credit amount for the year as provided in this subdivision multiplied by the sum of the number of child credits and dependent credits taken on the federal return, plus two for a married filing jointly return or plus one for any other return. For tax year 2018, the credit amount shall be one hundred thirty-four dollars. For tax year 2019 and each tax year thereafter, the credit amount shall be adjusted for inflation … If any credit amount is not an even dollar amount, the amount shall be rounded to the nearest dollar.' BOOKLET (verbatim): 'Line 4a Enter 1 in line 4a for yourself. You cannot enter a 1 in line 4a if you are claimed by another taxpayer for child tax credit or dependent tax credit purposes. … Line 4b If your status is married, filing jointly enter 1 in line 4b for your spouse. You cannot enter a 1 in line 4b if your spouse is claimed by another taxpayer … Line 4c Enter the dependents' names and social security numbers listed in columns 1 and 2 of the Federal Form 1040 or 1040-SR that qualify for the child tax credit or dependent tax credit. … Line 18 Nebraska Personal Exemption Credit for Residents Only. Residents may claim a $171 credit for each Nebraska personal exemption reported on line 4, Form 1040N. Multiply $171 by the number of Nebraska exemptions on line 4, Form 1040N.' Form line 18: 'NE personal exemption credit for residents only ($171 times the number on line 4)'. Nonrefundable (line 35: 'if line 34 is more than line 17, enter -0-'). Version 2 carries the DOR-published 2026 amount ($176).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "17100", type: "money" } },
    formula: mulInt(money("17100"), fact("neExemptions")),
  },
  {
    id: "us.ne.other_tax",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska other tax — 29.6% of the federal tax on lump-sum distributions (Form 4972) and on early distributions (Form 5329) (Form 1040N line 16)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715(2)(b) and § 77-2715.03(6); 2025 booklet, line 16 instructions p. 14; printed Form 1040N lines 16a-16c",
      section: "§ 77-2715.03(6); Form 1040N line 16",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): § 77-2715(2)(b) 'the tax for each resident individual shall be a percentage of such individual's federal adjusted gross income as modified …, plus a percentage of the federal tax on premature or lump-sum distributions from qualified retirement plans.' § 77-2715.03(6): 'For taxable years beginning or deemed to begin on or after January 1, 2013, the tax rate applied to other federal taxes included in the computation of the Nebraska individual income tax shall be 29.6 percent.' BOOKLET (line 16, verbatim): 'Nebraska Other Tax. You are required to calculate Nebraska other tax if you were required to pay: Federal tax on lump-sum distributions of qualified retirement plans; and/or Federal tax on early distributions of qualified retirement plans. The Nebraska other tax is 29.6% of the federal other tax on the items shown above.' FORM: '16a Federal Tax on Lump-Sum Distributions (Federal Form 4972); 16b Federal tax on early distributions (lesser of Federal Form 5329 or line 8, Sch 2, Federal Form 1040 or 1040-SR); 16c Total (add lines 16a and 16b); Residents multiply line 16c by 29.6% (x .296) and enter the result on line 16.' Input neFederalOtherTax = line 16c.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pctTimes10: { value: "296", type: "int" } },
    // Form 1040N line 16: "multiply line 16c by 29.6% (x .296)" into a whole-dollar box — ONE rounding.
    // 29.6% is not an integer-cent rate: 76 x 0.296 = 22.496 prints $22, but cents-first gives 22.50 -> $23.
    formula: times({ kind: "mulDiv", a: max0(fact("neFederalOtherTax")), b: money("296"), c: money("100000"), round: "half-up" }, "100"),
  },
  {
    id: "us.ne.child_care_credit_nonrefundable",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska child/dependent care nonrefundable credit — 25% of the federal § 21 credit when federal AGI is over $29,000 (Form 1040N line 23)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715.07(2)(a); 2025 booklet, line 23 instructions p. 15; printed Form 1040N line 23",
      section: "§ 77-2715.07(2)(a); Form 1040N line 23",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(2) There shall be allowed to qualified resident individuals against the income tax imposed by the Nebraska Revenue Act of 1967: (a) For returns filed reporting federal adjusted gross incomes of greater than twenty-nine thousand dollars, a nonrefundable credit equal to twenty-five percent of the federal credit allowed under section 21 of the Internal Revenue Code of 1986, as amended, except that for taxable years beginning or deemed to begin on or after January 1, 2015, such nonrefundable credit shall be allowed only if the individual would have received the federal credit allowed under section 21 of the code after adding back in any carryforward of a net operating loss …' BOOKLET (line 23, verbatim): 'Resident taxpayers with AGI greater than $29,000 can claim this credit (if AGI is $29,000 or less, see line 48 instructions). Multiply the amount on line 2 of Schedule 3, Federal Form 1040 by 25% (.25). … Include a copy of Federal Form 2441. … Taxpayers who are filing married, filing jointly federally, but filing married, filing separately on their Nebraska return cannot claim this Nebraska credit.' Form line 23: 'Nebraska child/dependent care nonrefundable credit, only if line 5 is more than $29,000'. Input neFederalChildCareCredit = Schedule 3 line 2 (the federal credit as allowed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "25", type: "int" }, agiFloor: { value: "2900000", type: "money" } },
    formula: iff(gt(fact("neAgi"), money("2900000")), rd(pct(max0(fact("neFederalChildCareCredit")), "25", "100")), money("0")),
  },
  {
    id: "us.ne.child_care_credit_refundable",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska child/dependent care refundable credit — Form 2441N when federal AGI is $29,000 or less: the § 21 expense base × the federal percentage (35% to 28%) × the state percentage (100% to 30%, down 10 points per $1,000 over $22,000) (Form 1040N line 42)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715.07(2)(b); 2025 Form 2441N Part II lines 3-11; 2025 booklet, line 42 instructions p. 18",
      section: "§ 77-2715.07(2)(b); Form 2441N lines 3-11; Form 1040N line 42",
      url: "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_2441N.pdf",
      excerpt:
        "STATUTE (verbatim): '(b) For returns filed reporting federal adjusted gross income of twenty-nine thousand dollars or less, a refundable credit equal to a percentage of the federal credit allowable under section 21 of the Internal Revenue Code of 1986, as amended, whether or not the federal credit was limited by the federal tax liability. The percentage of the federal credit shall be one hundred percent for incomes not greater than twenty-two thousand dollars, and the percentage shall be reduced by ten percent for each one thousand dollars, or fraction thereof, by which the reported federal adjusted gross income exceeds twenty-two thousand dollars …' FORM 2441N (verbatim): 'File Form 2441N ONLY if your federal adjusted gross income (AGI) is $29,000 or less … 3 Add the amounts in Column (C) of line 2. Do not enter more than $3,000 for one qualifying person, or $6,000 for two or more persons. … 4 Enter your earned income … 5 If married, filing jointly, enter your spouse's earned income. If you or your spouse was a student or was disabled, see instructions; all others, enter the amount from line 4. 6 Enter the smallest of line 3, 4, or 5. 7 Enter federal AGI from Nebraska Form 1040N, line 5. If the amount is over $29,000, do not file this form … 8 Enter the federal decimal amount shown below that applies to the dollar amount on line 7: $0 – 15,000 .35; 15,000 – 17,000 .34; 17,000 – 19,000 .33; 19,000 – 21,000 .32; 21,000 – 23,000 .31; 23,000 – 25,000 .30; 25,000 – 27,000 .29; 27,000 – 29,000 .28. 9 Enter the state decimal amount below that applies to the dollar amount on line 7: $0 or less – 22,000 1.00; 22,000 – 23,000 .90; 23,000 – 24,000 .80; 24,000 – 25,000 .70; 25,000 – 26,000 .60; 26,000 – 27,000 .50; 27,000 – 28,000 .40; 28,000 – 29,000 .30. 10 Multiply line 6 by the decimal amount on line 8 … 11 Multiply line 10 by the decimal amount on line 9. Residents enter result here and on line 42, Form 1040N.' BOOKLET (line 42): 'Nebraska Child/Dependent Care Refundable Credit (AGI $29,000 or Less and Full-Year or Partial-Year Resident). Attach the Nebraska Child And Dependent Care Expenses, Form 2441N … Taxpayers who file married, filing jointly federally, but file married, filing separately on their Nebraska return cannot claim this Nebraska credit.' ENCODING: $0 when AGI > $29,000; line 3 = min(expenses, $3,000 or $6,000 by qualifying persons); line 6 = min(line 3, earned income, spouse's earned income when filingStatus is mfj); federal percentage = 35 − ceil(max0(AGI − $15,000) / $2,000) (28 at $27,001-$29,000); state percentage = 100 − 10 × ceil(max0(AGI − $22,000) / $1,000); lines 10 and 11 each rounded to whole dollars as the form prints them.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      agiLimit: { value: "2900000", type: "money" },
      fullStatePctThrough: { value: "2200000", type: "money" },
      expenseCapOne: { value: "300000", type: "money" },
      expenseCapTwoPlus: { value: "600000", type: "money" },
    },
    formula: (() => {
      const agi = fact("neAgi");
      const cap: Expr = iff(cmp("ge", fact("neChildCareQualifyingPersons"), int("2")), money("600000"), money("300000"));
      const l3 = minE(max0(fact("neChildCareExpenses")), cap);
      const earned = max0(fact("neEarnedIncome"));
      const l6: Expr = iff(isStatus("mfj"), minE(l3, earned, max0(fact("neSpouseEarnedIncome"))), minE(l3, earned));
      const fedSteps = stepUnits(max0(sub(agi, money("1500000"))), "200000", "ceil");
      const fedPct: Expr = sub(money("35"), mulInt(money("1"), fedSteps)); // percentage points, cents-denominated
      const stateSteps = stepUnits(max0(sub(agi, money("2200000"))), "100000", "ceil");
      const statePct: Expr = max0(sub(money("100"), mulInt(money("10"), stateSteps)));
      const l10 = rd({ kind: "mulDiv", a: l6, b: fedPct, c: money("100"), round: "half-up" });
      const l11 = rd({ kind: "mulDiv", a: l10, b: statePct, c: money("100"), round: "half-up" });
      return iff(gt(agi, money("2900000")), money("0"), l11);
    })(),
  },
  {
    id: "us.ne.eitc",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska earned income credit — 10% of the federal EIC, refundable (Form 1040N line 44)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715.07(2)(e); 2025 booklet, line 44 instructions p. 18 and the 'Nebraska Earned Income Worksheet for Taxpayers Claiming a Net Operating Loss Deduction'; printed Form 1040N line 44",
      section: "§ 77-2715.07(2)(e); Form 1040N line 44",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(e) A refundable credit equal to ten percent of the federal credit allowed under section 32 of the Internal Revenue Code of 1986, as amended, except that for taxable years beginning or deemed to begin on or after January 1, 2015, such refundable credit shall be allowed only if the individual would have received the federal credit allowed under section 32 of the code after adding back in any carryforward of a net operating loss that was deducted pursuant to such section in determining eligibility for the federal credit'. BOOKLET (line 44, verbatim): 'Nebraska residents and partial-year residents who have a federal earned income credit are allowed a state credit equal to 10% of the federal credit. Complete the federal credit information from line 27a (Form 1040 or 1040-SR, page 2). Enter the number of qualifying children using information from Federal Schedule EIC (Form 1040). If you are a nonresident, you cannot claim this credit.' Form line 44: 'Nebraska earned income credit … Federal credit $ ____ x .10 (10%)'. The NOL add-back worksheet (earned income + federal NOL carryforward against the 2025 federal EIC limits $19,104 / $26,214 … $61,555 / $68,675) is a composer note; input neFederalEic = Form 1040 line 27a.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "10", type: "int" } },
    formula: rd(pct(max0(fact("neFederalEic")), "10", "100")),
  },
  {
    id: "us.ne.tax_after_credits",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska tax after nonrefundable credits — line 17 minus line 34 (not below zero), and when net Schedule I adjustments are under $5,000, not more than the federal tax before credits (Form 1040N line 35 and the Federal Tax Liability Worksheet)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715(1); 2025 booklet, line 35 instructions and 'Federal Tax Liability Worksheet' p. 17; printed Form 1040N line 35",
      section: "§ 77-2715(1); Form 1040N line 35",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(1) A tax is hereby imposed for each taxable year on the entire income of every resident individual …, except that any individual who has additions to adjusted gross income pursuant to section 77-2716 of less than five thousand dollars shall not have an individual income tax liability after nonrefundable credits under the Nebraska Revenue Act of 1967 that exceeds his or her individual income tax liability before credits under the Internal Revenue Code of 1986.' BOOKLET (line 35, verbatim): 'Nebraska Tax After Nonrefundable Credits. Do not complete the worksheet below if the result of line 12 minus line 13 is $5,000 or more. Otherwise, if your federal tax liability is -0- or is less than your Nebraska tax, complete the Federal Tax Liability Worksheet below. On line 35, enter the smaller of the amounts from line 2 or line 3 of the worksheet. If entering federal tax liability, attach a copy of your federal return.' WORKSHEET (verbatim): '1. Nebraska Adjustments to AGI: a. Amount of adjustments increasing federal AGI (line 12, Form 1040N); b. Amount of adjustments decreasing federal AGI (line 13, Form 1040N); Net adjustments to federal AGI (line 1a minus line 1b). If the amount on line 1 is $5,000 or more Stop. Line 35 of Form 1040N must be the mathematical result of line 17 minus line 34. 2. Nebraska Tax after Nonrefundable Credits: a. Nebraska tax, line 17 of Form 1040N; b. Total Nonrefundable Credits, line 34 of Form 1040N; Line 2a minus line 2b. If the amount on line 2 is zero or less, enter -0- on line 35 of Form 1040N; and Stop here. 3. Federal tax before credits: a. Line 16 of Form 1040 or 1040-SR, page 2; b. Line 2 of Form 1040 Schedule 2; c. Line 8 of Form 1040 Schedule 2; d. Total tax–Form 1040 or 1040-SR (add lines 3a, 3b, and 3c). On line 35, enter the smaller of the amounts from line 2 or line 3 of this worksheet, and check the federal tax box if line 3 is used.' Form line 35: 'Subtract line 34 from line 17 (if line 34 is more than line 17, enter -0-). If the result is greater than your federal tax liability, see instructions. If entering federal tax, check box'. ENCODING: max0(neTaxBeforeCredits − neNonrefundableCredits), then min with neFederalTaxBeforeCredits (1040 line 16 + Schedule 2 lines 2 and 8) when neNetAdjustments (line 12 − line 13, may be negative) is less than $5,000 — a federal liability of $0 zeroes the Nebraska tax after credits.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { adjustmentThreshold: { value: "500000", type: "money" } },
    formula: (() => {
      const net = max0(sub(fact("neTaxBeforeCredits"), fact("neNonrefundableCredits")));
      return iff(lt(fact("neNetAdjustments"), money("500000")), minE(net, max0(fact("neFederalTaxBeforeCredits"))), net);
    })(),
  },
  {
    id: "us.ne.other_state_credit",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska credit for tax paid to another state — Schedule II: the least of the total Nebraska tax, that tax × (other-state AGI ÷ Nebraska-adjusted federal AGI, to five decimals), and the tax paid to the other state (Form 1040N line 19)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2730(1)-(2); 2025 Nebraska Schedule II lines 1-6 and instructions p. 29; printed Form 1040N line 19",
      section: "§ 77-2730; Schedule II lines 1-6; Form 1040N line 19",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(1) A resident individual … shall be allowed a credit against the income tax otherwise due for the amount of any income tax imposed on him or her … by another state of the United States or a political subdivision thereof or the District of Columbia on income derived from sources therein and which is also subject to income tax under sections 77-2714 to 77-27,123. (2) The credit … shall not exceed the proportion of the income tax otherwise due under such sections that the amount of the taxpayer's adjusted gross income or total income derived from sources in the other taxing jurisdiction bears to federal adjusted gross income or total federal income.' SCHEDULE II (verbatim): '1 Total Nebraska tax (line 17, Form 1040N) … 2 Adjusted gross income derived from another state (do not enter amount of taxable income from the other state – use Conversion Chart on the DOR's website) … 3 Ratio: Line 2 ÷ (Form 1040N, Line 5 + Line 12 – Line 13) … 4 Calculated tax credit. Line 1 multiplied by line 3 ratio … 5 Tax due and paid to another state (do not enter amount withheld for the other state) … 6 Allowable tax credit (line 1, 4, or 5, whichever is least). Enter amount here and on line 19, Form 1040N.' INSTRUCTIONS (verbatim): 'Line 3 Calculate the Ratio. Calculate the ratio to six decimal places, and then round to five decimals. For example, if your division result is .123467, round to .12347 (12.347%).' 'A separate Schedule II must be completed for each state where income tax was paid. The total credits cannot exceed the Nebraska tax liability. … Nebraska law does not allow credit for taxes paid to a foreign country or its political subdivisions.' ENCODING: ratio = round-half-up(other-state AGI ÷ (federal AGI + line 12 − line 13), 5 decimals); line 4 = round(line 1 × ratio); credit = min(line 1, line 4, tax paid); $0 when the denominator is not positive.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "5", type: "int" } },
    formula: (() => {
      const l1 = max0(fact("neTaxBeforeCredits"));
      const denom = add(fact("neAgi"), fact("neAdjustmentsIncreasing"), { kind: "sub", left: money("0"), right: fact("neAdjustmentsDecreasing") });
      // ratio × 100,000 as an integer number of cents (money("100000") = 100,000 cents)
      const ratio: Expr = { kind: "mulDiv", a: max0(fact("neOtherStateAgi")), b: money("100000"), c: denom, round: "half-up" };
      // Schedule II line 4: "Multiply the ratio (line 3) by the total Nebraska tax" — one whole-dollar rounding
      const l4 = times({ kind: "mulDiv", a: l1, b: ratio, c: money("10000000"), round: "half-up" }, "100");
      return iff(gt(denom, money("0")), minE(l1, l4, max0(fact("neOtherStateTaxPaid"))), money("0"));
    })(),
  },
  {
    id: "us.ne.use_tax",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska individual use tax — 5.5% state plus the local rate (0.5% to 2%) on untaxed purchases, each rounded to whole dollars (Form 1040N line 58)",
    citation: {
      source: "2025 booklet, line 58 instructions pp. 20-21 and the 'Nebraska Local Sales and Use Tax Codes and Rates' schedule p. 50; printed Form 1040N line 58",
      section: "Form 1040N line 58",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (line 58, verbatim): 'Use tax is due on all taxable purchases when Nebraska and any applicable local sales tax is not paid. … Enter your total taxable 2025 purchases if Nebraska sales tax was not collected by the seller. Multiply this amount by 5.5% (.055). If local tax applies, enter your local code from the local sales and use tax codes and rates schedule on page 50 of these instructions, and multiply your total taxable purchases by the local rate (.005, .010, .015, .0175, or .02). Add the state and local tax amounts together and enter on line 58. … Example. You purchase a computer from a seller in South Dakota over the Internet for $1,470 plus $30 shipping and handling charges. Both charges are taxable. The computer is shipped to you in Scottsbluff, Nebraska and no tax is charged or collected by the seller. Your state tax is $83 ($1,500 X 5.5% = $83) and the local tax is $23 ($1,500 X 1.5% = $23). The total use tax owed is $106 ($83 + $23 = $106). When calculating state and local tax, round your results, and then add them together …' FORM: 'Enter purchases subject to state tax $___ State tax $___ (purchases x 5.5%); Enter purchases subject to local tax $___ Local tax $___ (purchases x local rate of ___%); Local code ___'. ENCODING: round(5.5% × purchases) + round(local bps × purchases); neLocalUseTaxRateBps is the local rate in basis points (0, 50, 100, 150, 175, or 200). Purchases in more than one local jurisdiction or in a Good Life District go on Form 3 instead.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { stateRateBps: { value: "550", type: "int" } },
    formula: (() => {
      const p = max0(fact("neUseTaxPurchases"));
      // whole-dollar box: ONE half-up rounding. 5.5% of $209 is 11.495, which the booklet
      // prints as $11; rounding to cents first (11.50) and then to dollars gives $12.
      const state = dollarsFromScaled(times(p, "550"), "1000000");
      // the local box rounds ONCE too: 1.5% of $33 is 0.495, which the booklet prints as $0
      // ("round your results, and then add them together"); a cent-then-dollar chain gives $1.
      const local = dollarsFromScaled({ kind: "mulDiv", a: p, b: mulInt(money("1"), fact("neLocalUseTaxRateBps")), c: money("1"), round: "half-up" }, "1000000");
      return add(state, local);
    })(),
  },
  {
    id: "us.ne.parameters",
    version: 1,
    jurisdiction: "us.ne",
    title: "Nebraska 2025 Form 1040N parameters — line structure, Schedule I adjustments, the credit lines, the 2026 LB 754 rates, and the property tax credit status",
    citation: {
      source: "2025 Nebraska Individual Income Tax Booklet (Form 1040N, Schedules I-III, Forms 2441N and PTC instructions; 'What's New' pp. 1-5); Neb. Rev. Stat. §§ 77-2715, 77-2715.03, 77-2715.07, 77-2716, 77-2716.01, 77-2730; LB 754 (2023), LB 34 (2024 special session), LB 650 (2025); web-verified September 2026",
      section: "Form 1040N lines 1-64; Schedule I lines 1-44; Schedule II lines 1-6",
      url: BOOKLET_URL,
      excerpt:
        "STRUCTURE (printed 2025 Form 1040N): 1 federal filing status ('Your Nebraska filing status is the same as your federal filing status'); 2a 65-or-older / blind boxes (you, spouse); 2b claimable as a dependent; 3 resident / partial-year / nonresident; 4a-4c Nebraska personal exemptions (→ us.ne.personal_exemption_credit); 5 federal AGI (1040 line 11); 6 Nebraska standard deduction (→ us.ne.standard_deduction); 7 federal itemized total (Schedule A line 17); 8 state and local income taxes (Schedule A line 5a); 9 = 7 − 8 (→ us.ne.itemized_deductions); 10 the larger of 6 or 9 (federal itemizers only); 11 = 5 − 10; 12 Schedule I Part A additions (line 13: non-Nebraska state and local bond interest net of Nebraska bonds, financial institution tax credit claimed, 529 and Enable recapture, federal NOL deduction, S corporation/LLC non-Nebraska loss, PTET deducted, Relocation Incentive Act recapture, bullion loss, food donation add-back); 13 Schedule I Part B subtractions (line 44: 14 state income tax refund (Schedule 1 line 1), 15-17 U.S. government obligation interest and RIC dividends, 18 Railroad Retirement Board benefits, 19 special capital gains election (Form 4797N), 20 Nebraska College Savings (NEST) contributions ≤ $10,000 ($5,000 MFS), 21 employer NEST contributions ≤ $10,000, 22 Enable contributions ≤ $10,000, 23 S corporation/LLC non-Nebraska income, 24 nonresident military pay, 25 Native American income in Indian country, 26 claim of right, 27 Nebraska NOL carryforward, 28-30 Nebraska agricultural revenue / NIFA / Build America bond interest, 31 Social Security — 'The entire social security benefit amount included in the federal AGI can be excluded and no longer has a federal AGI threshold' (§ 77-2716(14): 100% from 2024), 32 military retirement — 'All military retirees are allowed to exclude 100%' (§ 77-2716(15)(b)), 33 foreign corporation dividends, 34 Segal AmeriCorps award, 35 firefighter cancer benefits, 36 retired law enforcement / firefighter health premiums, 37 Nebraska Highway Bond interest, 38 CSRS annuities, 39-40 Medical Debt Relief Act, 41 Nebraska National Guard Title 32 / state active duty pay, 42 Relocation Incentive Act wage exclusion, 43 bullion gain); 14 NEBRASKA TAXABLE INCOME = max0(11 + 12 − 13); 15 tax (→ us.ne.income_tax); 16 other tax (→ us.ne.other_tax); 17 = 15 + 16; 18 personal exemption credit; 19 credit for tax paid to another state (→ us.ne.other_state_credit); 20 credit for the elderly or disabled = the federal Schedule R credit (§ 77-2715.07(1)(a): 'equal to the federal credit allowed under section 22'); 21 CDAA; 22 Form 3800N nonrefundable; 23 child/dependent care nonrefundable (→ us.ne.child_care_credit_nonrefundable); 24 financial institution tax; 25 TANF employer; 26 extremely blighted area $5,000; 27 convicted felons employer; 28 School Readiness provider; 29 Child Care Tax Credit contributor; 30 Opportunity Scholarships carryforward; 31 CHIEF; 32 Family Caregiver; 33 Pregnancy Help (≤ 50% of line 15); 34 total nonrefundable credits; 35 tax after nonrefundable credits (→ us.ne.tax_after_credits); 36 W-2 withholding; 37 W-2G/1099 withholding; 38 Schedule K-1N withholding; 39 PTET credit; 40 estimated payments incl. the 2024 carryover and extension payments; 41 Form 3800N refundable; 42 child/dependent care refundable (→ us.ne.child_care_credit_refundable); 43 beginning farmer; 44 Nebraska EIC (→ us.ne.eitc); 45 community college property tax credit — Form PTC line 1 = line 2a, 100% of the community college property taxes paid in 2025 (the booklet, p. 43, Form PTC instructions: 'LB 34 enacted in the 2024 special session created the School District Property Tax Relief Act … For tax years beginning on or after January 1, 2024, the Form PTC will only be used to claim a credit for community college property taxes paid'); 46 volunteer emergency responders $250 each; 47 stillborn child $2,000 each; 48 Child Care Tax Credit for a parent (certified; AGI ≤ $150,000); 49 School Readiness staff member; 50 reverse osmosis; 51 direct support professional $500; 52 amended: paid with original; 53 total payments and refundable credits; 54 amended: prior overpayment; 55 = 53 − 54; 56 Form 2210N underpayment penalty; 57 = 35 + 56; 58 use tax (→ us.ne.use_tax); 59 amount due = 57 + 58 − 55 ('A balance due of less than $2 need not be paid'); 60 overpayment = 55 − 57 − 58; 61 applied to 2026 estimated tax; 62 Wildlife Conservation Fund donation; 63 refund = 60 − 61 − 62 ('Amounts less than $2 will not be refunded'). ROUNDING: 'Enter All Amounts as Whole Dollars … Round any amount from 50 cents to 99 cents to the next higher dollar.' INTEREST: 8% per year on unpaid tax from the due date. TY2025 CHANGES (booklet pp. 1-5): rate four 5.20%; new refundable direct support professional credit and nonrefundable Pregnancy Help, Shortline Rail, Relocation Incentive, and food donation credits; Nebraska National Guard and Relocation Incentive Act wage exclusions; bullion gain/loss adjustments; amended returns now filed on Form 1040N with the box checked. TY2026 (§ 77-2715.03(2)(b)-(c), LB 754): rates three and four both 4.55% for taxable years beginning in 2026 (3.99% for 2027 and after); the brackets, standard deduction chart, and $171 credit re-index — DOR has published the 2026 amounts (2026 Form 1040N-ES pp. 4-6 and the Tax Rate Chronologies Rev. 2-2026: brackets $4,130 / $24,760 / $39,900 single and MFS, $8,250 / $49,530 / $79,800 MFJ and QSS, $7,700 / $39,620 / $59,160 HOH; standard deduction $8,850 / $17,700 / $12,950 with $2,050 / $1,700 additional amounts; $176 credit), encoded as version 2 of those rules; this parameters rule still ends 2026-01-01 because the 2026 Form 1040N line structure (a new Adoption Tax Credit line under § 77-2715.07(2)(d)) is unpublished; § 77-2716(21) National Guard exclusion adds Title 10 duty from 2027; § 77-2716(27) first-time home buyer savings deduction from 2027. RESIDENCY: nonresidents and partial-year residents complete Schedule III (income ratio) — not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      nestContributionCap: { value: "1000000", type: "money" },
      nestContributionCapMfs: { value: "500000", type: "money" },
      volunteerResponderCredit: { value: "25000", type: "money" },
      stillbornChildCredit: { value: "200000", type: "money" },
      childCareTaxCreditAgiLimit: { value: "15000000", type: "money" },
      pregnancyHelpCreditPctOfTax: { value: "50", type: "int" },
      minimumDueOrRefund: { value: "200", type: "money" },
      interestPctPerYear: { value: "8", type: "int" },
      communityCollegeCreditPct: { value: "100", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Nebraska Form 1040N composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ne.income_tax, us.ne.standard_deduction, us.ne.itemized_deductions, us.ne.personal_exemption_credit, us.ne.other_tax, us.ne.child_care_credit_nonrefundable, us.ne.child_care_credit_refundable, us.ne.eitc, us.ne.tax_after_credits, us.ne.other_state_credit, and us.ne.use_tax",
    },
  },

  // ---- TY2026 versions: DOR-published 2026 indexed amounts (2026 Form 1040N-ES; Nebraska Tax Rate Chronologies Rev. 2-2026) ----
  {
    id: "us.ne.income_tax",
    version: 2,
    jurisdiction: "us.ne",
    title: "Nebraska income tax TY2026 — LB 754 rates 2.46 / 3.51 / 4.55 / 4.55% on the DOR-published 2026 brackets ($4,130 / $24,760 / $39,900 single and MFS; $8,250 / $49,530 / $79,800 MFJ and QSS; $7,700 / $39,620 / $59,160 HOH) (Form 1040N line 15)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2715.03(2)(b)(ii), (2)(c)(v) (LB 754, 2023); Nebraska DOR, 'Nebraska Tax Rate Chronologies, Table 1' (Rev. 2-2026), 2026 bracket table; 2026 Nebraska Individual Estimated Income Tax Payment Vouchers, Form 1040N-ES (8-014-2025 Rev. 11-2025) p. 6, '2026 Nebraska Estimated Income Tax Rate Schedule'",
      section: "§ 77-2715.03; DOR Tax Rate Chronologies (2026); Form 1040N-ES 2026 p. 6",
      url: "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf",
      excerpt:
        "STATUTE (verbatim): 'rate three shall be: … (ii) 4.55% for taxable years beginning or deemed to begin on or after January 1, 2026, and before January 1, 2027'; 'rate four shall be: … (v) 4.55% for taxable years beginning or deemed to begin on or after January 1, 2026, and before January 1, 2027'. DOR CHRONOLOGY (Rev. 2-2026, verbatim): 'Effective for tax years beginning on or after January 1, 2026, the individual income tax brackets are as follows: Bracket No. / Married, Filing Jointly / Head of Household / Single Individuals/Married, Filing Separately — 1 $0 - 8,250 / $0 - 7,700 / $0 - 4,130; 2 $8,250 - 49,530 / $7,700 - 39,620 / $4,130 - 24,760; 3 $49,530 - 79,800 / $39,620 - 59,160 / $24,760 - 39,900; 4 Over $79,800 / Over $59,160 / Over $39,900'; rate row 'Jan. 1, 2026 … 2.46% 3.51% 4.55% 4.55% $176 $8,850 $17,700'. FORM 1040N-ES 2026 p. 6 (verbatim): 'Single: $0 – $4,130 2.46% of the income; 4,130 – 24,760 $101.60 + 3.51% of the excess over $4,130; 24,760 – 39,900 825.71 + 4.55% of the excess over $24,760; 39,900 —— 1,514.58 + 4.55% of the excess over $39,900. Head of Household: $0 – $7,700 2.46% of the income; 7,700 – 39,620 $189.42 + 3.51% of the excess over $7,700; 39,620 – 59,160 1,309.81 + 4.55% of the excess over $39,620; 59,160 —— 2,198.88 + 4.55% of the excess over $59,160. Married, Filing Jointly and Surviving Spouses: $0 – $8,250 2.46% of the income; 8,250 – 49,530 $202.95 + 3.51% of the excess over $8,250; 49,530 – 79,800 1,651.88 + 4.55% of the excess over $49,530; 79,800 —— 3,029.16 + 4.55% of the excess over $79,800. Married, Filing Separately: [same as Single].' 'Note: The tax year 2026 individual income tax rates for the third and fourth brackets are at the same rate of 4.55% per Neb. Rev. Stat. § 77-2715.03(2)(c)(v).' Anchors recompute exactly (4,130 × 2.46% = 101.598 → $101.60; 101.60 + 3.51% × 20,630 = 825.713 → $825.71; 825.71 + 4.55% × 15,140 = 1,514.58). CAVEAT: the ES booklet says 'Use this rate schedule only for computing 2026 estimated income tax … Do not use it to compute an amount for any tax returns' — the 2026 Tax Calculation Schedule, Tax Table, and booklet are not yet published (checked September 2026); this version encodes the two DOR publications of the same 2026 brackets and rates and should be re-verified against the 2026 Tax Calculation Schedule when it appears. No 2026 Tax Table exists yet, so neUseTaxTable is ignored for 2026 (the schedule is used).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "246", type: "int" },
      rate2Bps: { value: "351", type: "int" },
      rate3Bps: { value: "455", type: "int" },
      rate4Bps: { value: "455", type: "int" },
      singleBracket1: { value: "413000", type: "money" },
      singleBracket2: { value: "2476000", type: "money" },
      singleBracket3: { value: "3990000", type: "money" },
      jointBracket1: { value: "825000", type: "money" },
      jointBracket2: { value: "4953000", type: "money" },
      jointBracket3: { value: "7980000", type: "money" },
      hohBracket1: { value: "770000", type: "money" },
      hohBracket2: { value: "3962000", type: "money" },
      hohBracket3: { value: "5916000", type: "money" },
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const S26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
        { thresholdCents: "413000", fixedCents: "10160", rateNum: "351" },
        { thresholdCents: "2476000", fixedCents: "82571", rateNum: "455" },
        { thresholdCents: "3990000", fixedCents: "151458", rateNum: "455" },
      ];
      const J26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
        { thresholdCents: "825000", fixedCents: "20295", rateNum: "351" },
        { thresholdCents: "4953000", fixedCents: "165188", rateNum: "455" },
        { thresholdCents: "7980000", fixedCents: "302916", rateNum: "455" },
      ];
      const H26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "246" },
        { thresholdCents: "770000", fixedCents: "18942", rateNum: "351" },
        { thresholdCents: "3962000", fixedCents: "130981", rateNum: "455" },
        { thresholdCents: "5916000", fixedCents: "219888", rateNum: "455" },
      ];
      return iff(isJoint, calcSchedule(x, J26), iff(isHoh, calcSchedule(x, H26), calcSchedule(x, S26)));
    })(),
  },
  {
    id: "us.ne.standard_deduction",
    version: 2,
    jurisdiction: "us.ne",
    title: "Nebraska standard deduction TY2026 — $8,850 single and MFS, $17,700 MFJ and QSS, $12,950 HOH, plus $2,050 (single, HOH) or $1,700 (married, QSS) per 65-or-older/blind box; dependent filers capped at the federal standard deduction (Form 1040N line 6)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2716.01(3); 2026 Form 1040N-ES (8-014-2025 Rev. 11-2025) p. 4 line 5 and p. 5 'Additional Standard Deduction for Elderly and/or Blind'; DOR Tax Rate Chronologies (Rev. 2-2026) row 'Jan. 1, 2026 … $8,850 $17,700'",
      section: "§ 77-2716.01(3); Form 1040N-ES 2026 pp. 4-5",
      url: "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf",
      excerpt:
        "FORM 1040N-ES 2026 (verbatim): '5 Nebraska standard deduction: Single $8,850; Married, Filing Jointly $17,700; Head of Household $12,950; Married, Filing Separately $8,850; or 65 or older and/or blind (see page 5)'. 'Additional Standard Deduction for Elderly and/or Blind — Your Nebraska standard deduction is increased by this amount if, at the end of 2026, you will be: An unmarried individual (single or head of household), and 65 or older, or blind $2,050; 65 or older, and blind 4,100. Qualifying surviving spouse, and 65 or older, or blind $1,700; 65 or older, and blind $3,400. A married individual (filing jointly or separately) and 65 or older, or blind $1,700; 65 or older, and blind 3,400; Both spouses are 65 or older 3,400; And one spouse is also blind 5,100; Both spouses are blind 3,400; And one spouse is also 65 or older 5,100; Both spouses are 65 or older, and both are blind 6,800. If married, filing separately, these amounts apply only if you can claim a Nebraska personal exemption for your spouse.' DOR CHRONOLOGY row 'Jan. 1, 2026 … $176 $8,850 $17,700'. Same structure as 2025 (base + per-box amount, boxes clamped at 2 for single/QSS/HOH and 4 for MFJ/MFS; a dependent filer takes the smaller of this and the federal standard deduction allowed). Re-verify against the 2026 booklet's Standard Deduction Chart when published.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "885000", type: "money" },
      joint: { value: "1770000", type: "money" },
      hoh: { value: "1295000", type: "money" },
      perBoxSingleHoh: { value: "205000", type: "money" },
      perBoxMarried: { value: "170000", type: "money" },
    },
    formula: (() => {
      const base: Expr = iff(isJoint, money("1770000"), iff(isHoh, money("1295000"), money("885000")));
      const perBox: Expr = iff(or(isStatus("single"), isHoh), money("205000"), money("170000"));
      const maxBoxes: Expr = iff(or(isStatus("mfj"), isStatus("mfs")), int("4"), int("2"));
      const boxes: Expr = iff(gt(fact("neAgeBlindBoxes"), maxBoxes), maxBoxes, fact("neAgeBlindBoxes"));
      const ne = add(base, mulInt(perBox, boxes));
      return iff(fact("isClaimedAsDependent"), minE(ne, max0(fact("neFederalStandardDeduction"))), ne);
    })(),
  },
  {
    id: "us.ne.personal_exemption_credit",
    version: 2,
    jurisdiction: "us.ne",
    title: "Nebraska personal exemption credit TY2026 — $176 per Nebraska personal exemption (Form 1040N line 18)",
    citation: {
      source: "Neb. Rev. Stat. § 77-2716.01(1)(b); 2026 Form 1040N-ES (8-014-2025 Rev. 11-2025) p. 6 worksheet instructions; DOR Tax Rate Chronologies (Rev. 2-2026) row 'Jan. 1, 2026 … $176'",
      section: "§ 77-2716.01(1)(b); Form 1040N-ES 2026 p. 6",
      url: "https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/2025/f_1040N-ES.pdf",
      excerpt:
        "FORM 1040N-ES 2026 (verbatim): 'Include $176 for each Nebraska personal exemption allowed on line 14 of the [worksheet]'. DOR CHRONOLOGY (Rev. 2-2026): personal exemption credit column 'Jan. 1, 2026 … $176' (2025: $171; 2024: $166). Statute: § 77-2716.01(1)(b) indexes the $134 (2018) credit by CPI-U, rounded to the nearest dollar. Re-verify against the 2026 Form 1040N line 18 when published.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "17600", type: "money" } },
    formula: mulInt(money("17600"), fact("neExemptions")),
  },
];
