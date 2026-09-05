import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Connecticut deep pack — TY2025 Form CT-1040 (+ the enacted TY2026 change
 * to the IRA subtraction). Every amount verified from the 2025 Form CT-1040
 * instruction booklet (Rev. 12/25, 28pp: the Tax Calculation Schedule with
 * Tables A-E, the Property Tax Credit Table, the Social Security and Pension
 * worksheets), the printed 2025 Form CT-1040 and Schedule CT-EITC, the DRS
 * 2025 income tax tables, and the Connecticut General Statutes chapter 229
 * (§§ 12-700, 12-701, 12-702, 12-703, 12-704c, 12-704e) plus OLR's summary
 * of PA 25-168.
 *
 * Load-bearing findings:
 *  - Connecticut's tax is a ten-line schedule keyed to CONNECTICUT AGI, not a
 *    bracket lookup: exemption (Table A, phased $1,000 per $1,000), the rate
 *    schedule (Table B), a 2% "phase-out add-back" (Table C), a benefit
 *    recapture (Table D), and a personal CREDIT percentage (Table E) — every
 *    one keyed to AGI. All five tables are statutory step functions ("for
 *    each $X or fraction thereof") and are encoded from the statute, then
 *    checked cell-by-cell against the printed tables.
 *  - The DRS tax tables ("all exemptions and credits are included", CT AGI up
 *    to $102,000) are the schedule evaluated at each $50 row's MIDPOINT with a
 *    single final rounding — no line-level rounding — while the printed
 *    schedule rounds line 4 to whole dollars (its own example: $25,000 x
 *    .0699 = $1,748). Both are legal; the filer "may" use the tables.
 *  - The Connecticut EITC is 40% of the federal credit PLUS a flat $250 when
 *    the filer has a qualifying child (PA 25-168 § 371, TY2025+).
 *  - For TY2026 the IRA subtraction rises from 75% to 100% (§ 12-701(a)(20)(B)(xxviii)-(xxix)).
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const ge = (l: Expr, r: Expr): Expr => cmp("ge", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const int = (value: string): Expr => ({ kind: "int", value });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** "for each $unit or fraction thereof" over `start`, capped at `maxUnits` */
const stepsOver = (agi: Expr, startCents: string, unitCents: string, maxUnits: string): Expr => {
  const units: Expr = { kind: "stepUnits", value: max0(sub(agi, money(startCents))), unitCents, mode: "ceil" };
  return iff(gt(units, int(maxUnits)), int(maxUnits), units);
};
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents × 10^k) → whole-dollar money with ONE half-up rounding */
const dollarsFromScaled = (n: Expr, denCents: string): Expr =>
  times({ kind: "mulDiv", a: n, b: money("1"), c: money(denCents), round: "half-up" }, "100");
/** Σ rate_i × (portion of base inside bracket i), scaled ×10,000 (rate numerators per 10,000). */
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
/** band lookup: rows [upperBoundCents, value] ascending; value for agi ≤ upper; `beyond` otherwise */
const bands = (agi: Expr, rows: [string, string][], beyond: Expr, wrap: (v: string) => Expr): Expr => {
  let expr = beyond;
  for (let i = rows.length - 1; i >= 0; i--) expr = iff(le(agi, money(rows[i][0])), wrap(rows[i][1]), expr);
  return expr;
};

type Status = "single" | "mfj" | "mfs" | "hoh";
const statusOf = (single: Expr, mfj: Expr, mfs: Expr, hoh: Expr): Expr =>
  iff({ kind: "or", args: [isStatus("mfj"), isStatus("qss")] }, mfj, iff(isStatus("mfs"), mfs, iff(isStatus("hoh"), hoh, single)));

// ---- Table A: personal exemption (§ 12-702) ------------------------------
const EXEMPTION: Record<Status, { amount: string; phaseStart: string }> = {
  single: { amount: "1500000", phaseStart: "3000000" }, // $15,000, reduced $1,000 per $1,000 over $30,000
  mfj: { amount: "2400000", phaseStart: "4800000" }, // $24,000 over $48,000 (also QSS)
  mfs: { amount: "1200000", phaseStart: "2400000" }, // $12,000 over $24,000
  hoh: { amount: "1900000", phaseStart: "3800000" }, // $19,000 over $38,000
};
const exemptionFor = (agi: Expr, s: Status): Expr =>
  max0(sub(money(EXEMPTION[s].amount), mulInt(money("100000"), stepsOver(agi, EXEMPTION[s].phaseStart, "100000", String(BigInt(EXEMPTION[s].amount) / 100000n)))));
const exemption = (agi: Expr): Expr => statusOf(exemptionFor(agi, "single"), exemptionFor(agi, "mfj"), exemptionFor(agi, "mfs"), exemptionFor(agi, "hoh"));

// ---- Table B: rate schedule (§ 12-700(a)(10), TY2024+) — rate per 10,000 ----
const SCHED: Record<Status, { thresholdCents: string; rateNum: string }[]> = {
  single: [
    { thresholdCents: "0", rateNum: "200" },
    { thresholdCents: "1000000", rateNum: "450" },
    { thresholdCents: "5000000", rateNum: "550" },
    { thresholdCents: "10000000", rateNum: "600" },
    { thresholdCents: "20000000", rateNum: "650" },
    { thresholdCents: "25000000", rateNum: "690" },
    { thresholdCents: "50000000", rateNum: "699" },
  ],
  mfj: [
    { thresholdCents: "0", rateNum: "200" },
    { thresholdCents: "2000000", rateNum: "450" },
    { thresholdCents: "10000000", rateNum: "550" },
    { thresholdCents: "20000000", rateNum: "600" },
    { thresholdCents: "40000000", rateNum: "650" },
    { thresholdCents: "50000000", rateNum: "690" },
    { thresholdCents: "100000000", rateNum: "699" },
  ],
  mfs: [
    { thresholdCents: "0", rateNum: "200" },
    { thresholdCents: "1000000", rateNum: "450" },
    { thresholdCents: "5000000", rateNum: "550" },
    { thresholdCents: "10000000", rateNum: "600" },
    { thresholdCents: "20000000", rateNum: "650" },
    { thresholdCents: "25000000", rateNum: "690" },
    { thresholdCents: "50000000", rateNum: "699" },
  ],
  hoh: [
    { thresholdCents: "0", rateNum: "200" },
    { thresholdCents: "1600000", rateNum: "450" },
    { thresholdCents: "8000000", rateNum: "550" },
    { thresholdCents: "16000000", rateNum: "600" },
    { thresholdCents: "32000000", rateNum: "650" },
    { thresholdCents: "40000000", rateNum: "690" },
    { thresholdCents: "80000000", rateNum: "699" },
  ],
};

// ---- Table C: 2% phase-out add-back (§ 12-700(a)(10)(A)-(D)(ii)) ----------
// the 2% bracket shrinks by $X for each $Y (or fraction) of AGI over the start,
// up to 10 steps; each lost dollar of 2% income is taxed at 4.5% instead → the
// add-back is 2.5% × X per step
const ADDBACK: Record<Status, { startCents: string; unitCents: string; perStepCents: string }> = {
  single: { startCents: "5650000", unitCents: "500000", perStepCents: "2500" }, // $25 per $5,000 over $56,500, max $250
  mfj: { startCents: "10050000", unitCents: "500000", perStepCents: "5000" }, // $50 per $5,000 over $100,500, max $500
  mfs: { startCents: "5025000", unitCents: "250000", perStepCents: "2500" }, // $25 per $2,500 over $50,250, max $250
  hoh: { startCents: "7850000", unitCents: "400000", perStepCents: "4000" }, // $40 per $4,000 over $78,500, max $400
};
const addbackFor = (agi: Expr, s: Status): Expr => mulInt(money(ADDBACK[s].perStepCents), stepsOver(agi, ADDBACK[s].startCents, ADDBACK[s].unitCents, "10"));

// ---- Table D: benefit recapture (§ 12-700(a)(10)(A)-(D)(iii)-(v)) --------
const RECAPTURE: Record<Status, { startCents: string; unitCents: string; perStepCents: string; maxUnits: string }[]> = {
  single: [
    { startCents: "10500000", unitCents: "500000", perStepCents: "2500", maxUnits: "10" }, // $25 per $5,000 over $105,000, max $250
    { startCents: "20000000", unitCents: "500000", perStepCents: "9000", maxUnits: "30" }, // $90 per $5,000 over $200,000, max $2,700
    { startCents: "50000000", unitCents: "500000", perStepCents: "5000", maxUnits: "9" }, // $50 per $5,000 over $500,000, max $450
  ],
  mfj: [
    { startCents: "21000000", unitCents: "1000000", perStepCents: "5000", maxUnits: "10" }, // $50 per $10,000 over $210,000, max $500
    { startCents: "40000000", unitCents: "1000000", perStepCents: "18000", maxUnits: "30" }, // $180 per $10,000 over $400,000, max $5,400
    { startCents: "100000000", unitCents: "1000000", perStepCents: "10000", maxUnits: "9" }, // $100 per $10,000 over $1,000,000, max $900
  ],
  mfs: [
    { startCents: "10500000", unitCents: "500000", perStepCents: "2500", maxUnits: "10" },
    { startCents: "20000000", unitCents: "500000", perStepCents: "9000", maxUnits: "30" },
    { startCents: "50000000", unitCents: "500000", perStepCents: "5000", maxUnits: "9" },
  ],
  hoh: [
    { startCents: "16800000", unitCents: "800000", perStepCents: "4000", maxUnits: "10" }, // $40 per $8,000 over $168,000, max $400
    { startCents: "32000000", unitCents: "800000", perStepCents: "14000", maxUnits: "30" }, // $140 per $8,000 over $320,000, max $4,200
    { startCents: "80000000", unitCents: "800000", perStepCents: "8000", maxUnits: "9" }, // $80 per $8,000 over $800,000, max $720
  ],
};
const recaptureFor = (agi: Expr, s: Status): Expr =>
  add(...RECAPTURE[s].map((p) => mulInt(money(p.perStepCents), stepsOver(agi, p.startCents, p.unitCents, p.maxUnits))));

// ---- Table E: personal tax credit percentage (§ 12-703) — [AGI upper bound, %] ----
const CREDIT_PCT: Record<Status, [string, string][]> = {
  single: [
    ["1880000", "75"], ["1930000", "70"], ["1980000", "65"], ["2030000", "60"], ["2080000", "55"], ["2130000", "50"], ["2180000", "45"], ["2230000", "40"],
    ["2500000", "35"], ["2550000", "30"], ["2600000", "25"], ["2650000", "20"], ["3130000", "15"], ["3180000", "14"], ["3230000", "13"], ["3280000", "12"],
    ["3330000", "11"], ["6000000", "10"], ["6050000", "9"], ["6100000", "8"], ["6150000", "7"], ["6200000", "6"], ["6250000", "5"], ["6300000", "4"],
    ["6350000", "3"], ["6400000", "2"], ["6450000", "1"],
  ],
  mfj: [
    ["3000000", "75"], ["3050000", "70"], ["3100000", "65"], ["3150000", "60"], ["3200000", "55"], ["3250000", "50"], ["3300000", "45"], ["3350000", "40"],
    ["4000000", "35"], ["4050000", "30"], ["4100000", "25"], ["4150000", "20"], ["5000000", "15"], ["5050000", "14"], ["5100000", "13"], ["5150000", "12"],
    ["5200000", "11"], ["9600000", "10"], ["9650000", "9"], ["9700000", "8"], ["9750000", "7"], ["9800000", "6"], ["9850000", "5"], ["9900000", "4"],
    ["9950000", "3"], ["10000000", "2"], ["10050000", "1"],
  ],
  mfs: [
    ["1500000", "75"], ["1550000", "70"], ["1600000", "65"], ["1650000", "60"], ["1700000", "55"], ["1750000", "50"], ["1800000", "45"], ["1850000", "40"],
    ["2000000", "35"], ["2050000", "30"], ["2100000", "25"], ["2150000", "20"], ["2500000", "15"], ["2550000", "14"], ["2600000", "13"], ["2650000", "12"],
    ["2700000", "11"], ["4800000", "10"], ["4850000", "9"], ["4900000", "8"], ["4950000", "7"], ["5000000", "6"], ["5050000", "5"], ["5100000", "4"],
    ["5150000", "3"], ["5200000", "2"], ["5250000", "1"],
  ],
  hoh: [
    ["2400000", "75"], ["2450000", "70"], ["2500000", "65"], ["2550000", "60"], ["2600000", "55"], ["2650000", "50"], ["2700000", "45"], ["2750000", "40"],
    ["3400000", "35"], ["3450000", "30"], ["3500000", "25"], ["3550000", "20"], ["4400000", "15"], ["4450000", "14"], ["4500000", "13"], ["4550000", "12"],
    ["4600000", "11"], ["7400000", "10"], ["7450000", "9"], ["7500000", "8"], ["7550000", "7"], ["7600000", "6"], ["7650000", "5"], ["7700000", "4"],
    ["7750000", "3"], ["7800000", "2"], ["7850000", "1"],
  ],
};
// Table E applies only above the exemption's full-amount threshold (the
// first row is "More than $15,000"); at or under it the tax is $0 anyway
const creditPctFor = (agi: Expr, s: Status): Expr => bands(agi, CREDIT_PCT[s], int("0"), (v) => int(v));

/**
 * The Tax Calculation Schedule for one status, two methods:
 *  - schedule: line 4 rounded to whole dollars (the printed example: $25,000 ×
 *    .0699 = $1,748), line 9 = line 7 × decimal rounded to whole dollars,
 *    line 10 = line 7 − line 9.
 *  - table: the DRS tax table's method — everything evaluated at the $50 row
 *    midpoint in exact arithmetic and rounded ONCE ("all exemptions and
 *    credits are included").
 */
const tcsFor = (agi: Expr, s: Status, method: "schedule" | "table"): Expr => {
  const taxable = max0(sub(agi, exemptionFor(agi, s)));
  const scaledTax = scaledSchedule(taxable, SCHED[s]); // cents × 10,000
  const cAndD = add(addbackFor(agi, s), recaptureFor(agi, s));
  const pct = creditPctFor(agi, s);
  if (method === "schedule") {
    const line4 = dollarsFromScaled(scaledTax, "1000000");
    const line7 = add(line4, cAndD);
    const line9 = rd({ kind: "mulDiv", a: line7, b: mulInt(money("1"), pct), c: money("100"), round: "half-up" });
    return sub(line7, line9);
  }
  // table: (schedule + C + D) × (100 − pct) / 100, single rounding
  const totalScaled = add(scaledTax, times(cAndD, "10000"));
  const keep: Expr = sub(int("100"), pct);
  const scaledAfterCredit = mulInt(totalScaled, keep); // cents × 10,000 × 100
  return dollarsFromScaled(scaledAfterCredit, "100000000");
};
const tcs = (agi: Expr, method: "schedule" | "table"): Expr =>
  statusOf(tcsFor(agi, "single", method), tcsFor(agi, "mfj", method), tcsFor(agi, "mfs", method), tcsFor(agi, "hoh", method));

const BOOKLET_URL = "https://portal.ct.gov/-/media/drs/forms/2025/income/2025-ct-1040-instructions_1225.pdf";

// ---- pension/annuity phase-out (§ 12-701(a)(20)(B)(xxi)/(xxii)/(xxviii)) — per mille ----
const PENSION_PHASEOUT_OTHER: [string, string][] = [
  ["7499999", "1000"], ["7749999", "850"], ["7999999", "700"], ["8249999", "550"], ["8499999", "400"], ["8749999", "250"], ["8999999", "100"], ["9499999", "50"], ["9999999", "25"],
];
const PENSION_PHASEOUT_MFJ: [string, string][] = [
  ["9999999", "1000"], ["10499999", "850"], ["10999999", "700"], ["11499999", "550"], ["11999999", "400"], ["12499999", "250"], ["12999999", "100"], ["13999999", "50"], ["14999999", "25"],
];
const pensionRule = (version: number, iraPct: string, from: string, to: string, iraText: string): Rule => ({
  id: "us.ct.pension_annuity_subtraction",
  version,
  jurisdiction: "us.ct",
  title: `Connecticut pension and annuity subtraction — 100% of pensions/annuities and ${iraPct}% of IRA distributions, phased out by federal AGI from $75,000 to $100,000 (single/MFS/HOH) or $100,000 to $150,000 (MFJ) (Schedule 1 line 48b)`,
  citation: {
    source: `Conn. Gen. Stat. § 12-701(a)(20)(B)(xxi), (xxii) (pension and annuity schedules) and (xxviii)-(xxix) (IRA distributions: single/MFS/HOH and MFJ); 2025 Form CT-1040 instructions, Line 48b p. 10 and the Pension and Annuity Worksheet / Phase-Out Table pp. 24-25`,
    section: "§ 12-701(a)(20)(B)(xxi)-(xxii), (xxviii)-(xxix); Schedule 1 line 48b",
    url: BOOKLET_URL,
    excerpt: `WORKSHEET (pp. 24-25, verbatim structure): line 1 federal AGI; if under $75,000 (single, MFS, HOH) or under $100,000 (MFJ) the FULL amount is subtracted without the worksheet ('enter as a subtraction modification ${iraPct}% of the amount of such [IRA] distribution, reported on federal Form 1040, Line 4b' and 'the amount of pension and annuity reported on federal Form 1040, Line 5b. From the amount on Line 5b, subtract military retirement pay, Tier 1 and Tier 2 railroad retirement benefits, and Connecticut teachers' retirement pay'); otherwise line 2 = ${iraPct}% of the IRA amount (line 4b, other than Roth) + 100% of pensions/annuities (line 5b less military/RRB/teachers), line 3 = the phase-out decimal, line 4 = line 2 × line 3 → Schedule 1 line 48b. PHASE-OUT TABLE (verbatim, by federal AGI): single/MFS/HOH — $0-$74,999 1; $75,000-$77,499 .85; $77,500-$79,999 .70; $80,000-$82,499 .55; $82,500-$84,999 .40; $85,000-$87,499 .25; $87,500-$89,999 .10; $90,000-$94,999 .05; $95,000-$99,999 .025; $100,000 and up 0. MFJ — $0-$99,999 1; $100,000-$104,999 .85; $105,000-$109,999 .70; $110,000-$114,999 .55; $115,000-$119,999 .40; $120,000-$124,999 .25; $125,000-$129,999 .10; $130,000-$139,999 .05; $140,000-$149,999 .025; $150,000 and up 0. STATUTE (the MFJ schedule is the parallel clause (xxix)): ${iraText} Excluded from line 5b before the subtraction: military retirement pay (line 44, 100%), Tier 1/2 Railroad Retirement (line 43), Connecticut teachers' retirement (line 45 takes 50% instead — a teacher whose AGI is under the threshold may instead take the pension subtraction, never both). Not included at all: disability pensions before minimum retirement age, corrective distributions, Roth IRA distributions. QSS follows MFJ. Whole-dollar result. [Inputs: ctFederalAgi, ctPensionAnnuityIncome, ctIraDistributions, filingStatus.]`,
  },
  effectiveFrom: from,
  effectiveTo: to,
  output: { type: "money" },
  parameters: {
    iraPct: { value: iraPct, type: "int" },
    phaseoutStartOther: { value: "7500000", type: "money" },
    phaseoutEndOther: { value: "10000000", type: "money" },
    phaseoutStartMfj: { value: "10000000", type: "money" },
    phaseoutEndMfj: { value: "15000000", type: "money" },
  },
  formula: (() => {
    const fagi = fact("ctFederalAgi");
    const line2 = add(max0(fact("ctPensionAnnuityIncome")), { kind: "mulRate", base: max0(fact("ctIraDistributions")), rate: { num: iraPct, den: "100" }, round: "half-up" });
    const perMille = (rows: [string, string][]): Expr => bands(fagi, rows, int("0"), (v) => int(v));
    const pm = iff({ kind: "or", args: [isStatus("mfj"), isStatus("qss")] }, perMille(PENSION_PHASEOUT_MFJ), perMille(PENSION_PHASEOUT_OTHER));
    return rd({ kind: "mulDiv", a: line2, b: mulInt(money("1"), pm), c: money("1000"), round: "half-up" });
  })(),
});

export const ctRules: Rule[] = [
  {
    id: "us.ct.personal_exemption",
    version: 1,
    jurisdiction: "us.ct",
    title: "Connecticut personal exemption (Table A) — $15,000 single / $24,000 MFJ-QSS / $12,000 MFS / $19,000 HOH, reduced $1,000 for each $1,000 or fraction of Connecticut AGI over $30,000 / $48,000 / $24,000 / $38,000",
    citation: {
      source: "Conn. Gen. Stat. § 12-702(a)-(c); 2025 Form CT-1040 instructions, Tax Calculation Schedule Table A p. 19",
      section: "§ 12-702; Tax Calculation Schedule line 2 / Table A",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim, single, § 12-702(a)(2)(I)): 'fifteen thousand dollars. In the case of any such taxpayer whose Connecticut adjusted gross income for the taxable year exceeds thirty thousand dollars, the exemption amount shall be reduced by one thousand dollars for each one thousand dollars, or fraction thereof, by which the taxpayer's Connecticut adjusted gross income for the taxable year exceeds said amount. In no event shall the reduction exceed one hundred per cent of the exemption.' MFS (§ 12-702(a)(1)): $12,000, reduced over $24,000; HOH (§ 12-702(b)): $19,000, reduced over $38,000; MFJ and surviving spouse (§ 12-702(c)): $24,000, reduced over $48,000. TABLE A (booklet p. 19) prints the same steps in 'More Than / Less Than or Equal To' rows: single $0-$30,000 → $15,000, $30,000-$31,000 → $14,000 … $44,000 and up → $0; MFJ/QSS $48,000 → $24,000 … $71,000 and up → $0; MFS $24,000 → $12,000 … $35,000 and up → $0; HOH $38,000 → $19,000 … $56,000 and up → $0. Keyed to CONNECTICUT AGI (Form CT-1040 line 5), not federal AGI. Not indexed — identical for 2026. [Inputs: ctAgi, filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "1500000", type: "money" },
      mfjQss: { value: "2400000", type: "money" },
      mfs: { value: "1200000", type: "money" },
      hoh: { value: "1900000", type: "money" },
      phaseStartSingle: { value: "3000000", type: "money" },
      phaseStartMfj: { value: "4800000", type: "money" },
      phaseStartMfs: { value: "2400000", type: "money" },
      phaseStartHoh: { value: "3800000", type: "money" },
    },
    formula: exemption(fact("ctAgi")),
  },
  {
    id: "us.ct.income_tax",
    version: 1,
    jurisdiction: "us.ct",
    title:
      "Connecticut income tax — the Tax Calculation Schedule on Connecticut AGI: Table A exemption, Table B rates 2%/4.5%/5.5%/6%/6.5%/6.9%/6.99%, Table C 2% phase-out add-back, Table D recapture, Table E personal credit percentage (Form CT-1040 line 6)",
    citation: {
      source:
        "Conn. Gen. Stat. § 12-700(a)(10) (rates, 2% phase-out, recapture — TY2024+), § 12-702 (exemptions), § 12-703 (credits); 2025 Form CT-1040 instructions, Tax Calculation Schedule and Tables A-E pp. 19-23; DRS 2025 Connecticut Income Tax Tables (10pp, CT AGI to $102,000)",
      section: "§§ 12-700(a)(10), 12-702, 12-703; Form CT-1040 line 6; Tax Calculation Schedule lines 1-10",
      url: BOOKLET_URL,
      excerpt:
        "SCHEDULE (p. 19, verbatim): '1. Enter Connecticut adjusted gross income (AGI) from Form CT-1040, Line 5. 2. Enter the exemption amount from Table A, Personal Exemptions. 3. Connecticut Taxable Income: Subtract Line 2 from Line 1. If less than zero, enter \"0.\" 4. Enter amount from Table B, Initial Tax Calculation. 5. Enter amount from Table C, 2% Tax Rate Phase-Out Add-Back. 6. Enter amount from Table D, Tax Recapture. 7. Add Lines 4, 5, and 6. 8. Enter the decimal amount from Table E, Personal Tax Credits. 9. Multiply amount on Line 7 by the decimal amount on Line 8. 10. Connecticut Income Tax: Subtract Line 9 from Line 7.' NO TAX when Connecticut AGI is at or under $12,000 MFS / $15,000 single / $19,000 HOH / $24,000 MFJ-QSS (line 6 instructions). TABLE B (§ 12-700(a)(10), verbatim single/MFS): 'Not over $10,000 2.0%; Over $10,000 but not over $50,000 $200.00, plus 4.5% of the excess over $10,000; Over $50,000 but not over $100,000 $2,000, plus 5.5% …; Over $100,000 but not over $200,000 $4,750, plus 6.0% …; Over $200,000 but not over $250,000 $10,750, plus 6.5% …; Over $250,000 but not over $500,000 $14,000, plus 6.9% …; Over $500,000 $31,250, plus 6.99% of the excess over $500,000.' MFJ/QSS: $20,000 2.0%; $400 + 4.5% to $100,000; $4,000 + 5.5% to $200,000; $9,500 + 6.0% to $400,000; $21,500 + 6.5% to $500,000; $28,000 + 6.9% to $1,000,000; $62,500 + 6.99% over $1,000,000. HOH: $16,000 2.0%; $320 + 4.5% to $80,000; $3,200 + 5.5% to $160,000; $7,600 + 6.0% to $320,000; $17,200 + 6.5% to $400,000; $22,400 + 6.9% to $800,000; $50,000 + 6.99% over $800,000. Printed examples: single $13,000 → $335; $525,000 → $32,998 ('$25,000 x .0699 = $1,748' — line 4 is rounded to whole dollars); MFJ $22,500 → $513; $1,100,000 → $69,490; HOH $20,000 → $500; $825,000 → $51,748. TABLE C (§ 12-700(a)(10)(ii), verbatim single): 'for each taxpayer whose Connecticut adjusted gross income exceeds fifty-six thousand five hundred dollars, the amount of the taxpayer's Connecticut taxable income to which the two-per-cent tax rate applies shall be reduced by one thousand dollars for each five thousand dollars, or fraction thereof' — i.e. $25 (2.5% × $1,000) per step, max $250 (printed: $56,500-$61,500 → $25 … $101,500 and up → $250); MFJ/QSS $2,000 per $5,000 over $100,500 → $50 per step, max $500 ($145,500 and up); MFS $25 per $2,500 over $50,250, max $250 ($72,750 and up); HOH $1,600 per $4,000 over $78,500 → $40 per step, max $400 ($114,500 and up). TABLE D recapture (§ 12-700(a)(10)(iii)-(v), verbatim single/MFS): 'twenty-five dollars for each five thousand dollars, or fraction thereof, by which the taxpayer's Connecticut adjusted gross income exceeds one hundred five thousand dollars, up to a maximum payment of two hundred fifty dollars', plus 'ninety dollars for each five thousand dollars … exceeds two hundred thousand dollars, up to … two thousand seven hundred dollars', plus 'fifty dollars for each five thousand dollars … exceeds five hundred thousand dollars, up to … four hundred fifty dollars' (printed: $105,000-$110,000 → $25 … $540,000 and up → $3,400); MFJ/QSS $50 per $10,000 over $210,000 (max $500) + $180 per $10,000 over $400,000 (max $5,400) + $100 per $10,000 over $1,000,000 (max $900) → $6,800 at $1,080,000 and up; HOH $40 per $8,000 over $168,000 (max $400) + $140 per $8,000 over $320,000 (max $4,200) + $80 per $8,000 over $800,000 (max $720) → $5,320 at $864,000 and up. TABLE E (§ 12-703, 27 rows per status, 'More Than / Less Than or Equal To' AGI): single .75 to $18,800, then .70/.65/.60/.55/.50/.45/.40 in $500 steps to $22,300, .35 to $25,000, .30/.25/.20 to $26,500, .15 to $31,300, .14/.13/.12/.11 to $33,300, .10 to $60,000, then .09 … .01 in $500 steps to $64,500, .00 above; MFJ/QSS .75 to $30,000 … .10 $52,000-$96,000 … .01 to $100,500; MFS .75 to $15,000 … .10 $27,000-$48,000 … .01 to $52,500; HOH .75 to $24,000 … .10 $46,000-$74,000 … .01 to $78,500 — every row encoded. ROUNDING: line 4 and line 9 whole dollars (the form's boxes and the printed example). TAX TABLES (DRS, CT AGI ≤ $102,000, 'ALL EXEMPTIONS AND CREDITS ARE INCLUDED', columns Single / Married Filing Jointly [*also QSS] / Married Filing Separately / Head of Household, $50 rows): 'you may use the Tax Tables' — decoded as the whole schedule evaluated at the ROW MIDPOINT in exact arithmetic with ONE final half-up rounding (verified cells: single $18,000-$18,050 → $15; MFS → $72; $100,000-$100,050 → $4,977 / $3,961 / $5,002 / $4,541; $12,100-$12,150 MFS → $1). ctUseTaxTable=true selects that method (AGI over $102,000 falls back to the schedule). Not indexed — TY2026 identical (no 2026 act changed §§ 12-700/702/703). Statuses: MFS shares the single rate schedule but has its own Tables A, C, D(=single), E; QSS = MFJ everywhere. [Inputs: ctAgi, filingStatus, ctUseTaxTable.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      noTaxAgiSingle: { value: "1500000", type: "money" },
      noTaxAgiMfjQss: { value: "2400000", type: "money" },
      noTaxAgiMfs: { value: "1200000", type: "money" },
      noTaxAgiHoh: { value: "1900000", type: "money" },
      topRateBps: { value: "699", type: "int" },
      topBracketSingleMfs: { value: "50000000", type: "money" },
      topBracketMfjQss: { value: "100000000", type: "money" },
      topBracketHoh: { value: "80000000", type: "money" },
      addbackMaxSingleMfs: { value: "25000", type: "money" },
      addbackMaxMfj: { value: "50000", type: "money" },
      addbackMaxHoh: { value: "40000", type: "money" },
      recaptureMaxSingleMfs: { value: "340000", type: "money" },
      recaptureMaxMfj: { value: "680000", type: "money" },
      recaptureMaxHoh: { value: "532000", type: "money" },
      taxTableTop: { value: "10200000", type: "money" },
    },
    formula: (() => {
      const agi = fact("ctAgi");
      // table rows are "More Than lo / Less Than or Equal To lo + $50": the
      // midpoint of the row containing agi is 50 × ceil(agi / 50) − 25
      const mid: Expr = max0(sub(mulInt(money("5000"), { kind: "stepUnits", value: max0(agi), unitCents: "5000", mode: "ceil" }), money("2500")));
      const tableMethod: Expr = iff(le(agi, money("10200000")), tcs(mid, "table"), tcs(agi, "schedule"));
      return max0(iff(fact("ctUseTaxTable"), tableMethod, tcs(agi, "schedule")));
    })(),
  },
  {
    id: "us.ct.property_tax_credit",
    version: 1,
    jurisdiction: "us.ct",
    title: "Connecticut property tax credit — up to $300 of property tax paid on the primary residence and/or motor vehicle(s), reduced 15% for each $10,000 ($5,000 MFS) or fraction of Connecticut AGI over $49,500 single / $70,500 MFJ-QSS / $35,250 MFS / $54,500 HOH; nonrefundable (Form CT-1040 line 11 / Schedule 3)",
    citation: {
      source: "Conn. Gen. Stat. § 12-704c(a)-(c); 2025 Form CT-1040 instructions, Schedule 3 pp. 14-15 and the Property Tax Credit Table p. 27",
      section: "§ 12-704c; Form CT-1040 line 11; Schedule 3 lines 60-68",
      url: BOOKLET_URL,
      excerpt:
        "SCHEDULE 3 (printed lines): 60 primary residence; 61 auto 1; 62 auto 2 ('Married filing jointly or qualifying surviving spouse only'); 63 total; 64 'Maximum property tax credit allowed' $300; 65 lesser of 63 or 64; 66 the decimal from the Property Tax Credit Table (0 when AGI is at or under $49,500 single / $70,500 MFJ-QSS / $35,250 MFS / $54,500 HOH); 67 = 65 × 66; 68 = 65 − 67 → line 11. STATUTE (§ 12-704c(c), verbatim single): 'whose Connecticut adjusted gross income exceeds forty-nine thousand five hundred dollars, the amount of the credit shall be reduced by fifteen per cent for each ten thousand dollars, or fraction thereof, by which the taxpayer's Connecticut adjusted gross income exceeds said amount'; MFS: over $35,250, 15% per $5,000 or fraction; HOH: over $54,500, 15% per $10,000; MFJ: over $70,500, 15% per $10,000. PRINTED TABLE (verbatim single): $0-$49,500 → 0; $49,500-$59,500 → .15; -$69,500 → .30; -$79,500 → .45; -$89,500 → .60; -$99,500 → .75; -$109,500 → .90; $109,500 and up → 1.00 (MFJ/QSS $70,500 → $130,500 and up 1.00; MFS $35,250 in $5,000 steps → $65,250 and up 1.00; HOH $54,500 → $114,500 and up 1.00). CAP (§ 12-704c(b)(1)(C)): $300 for TY2022 and after, 'in the aggregate' per return regardless of status. ELIGIBLE (2025, all residents — the 2017-2021 age-65/dependent restriction expired): qualifying property tax bills due and paid during 2025 on the primary residence and a privately owned or leased motor vehicle (one vehicle for single/MFS/HOH, two for MFJ/QSS; lease term over one year); late payments, interest, and fees do not count. NONREFUNDABLE: 'cannot exceed … the amount of tax entered on Form CT-1040, Line 10' and 'may not carry this credit forward' — the composer caps it. Keyed to CONNECTICUT AGI (line 5). Not indexed — TY2026 identical. [Inputs: ctPropertyTaxPaid (Schedule 3 line 63 qualifying total), ctAgi, filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      maxCredit: { value: "30000", type: "money" }, // $300
      phaseStartSingle: { value: "4950000", type: "money" },
      phaseStartMfjQss: { value: "7050000", type: "money" },
      phaseStartMfs: { value: "3525000", type: "money" },
      phaseStartHoh: { value: "5450000", type: "money" },
      reductionPctPerStep: { value: "15", type: "int" },
    },
    formula: (() => {
      const agi = fact("ctAgi");
      const steps = (start: string, unit: string): Expr => stepsOver(agi, start, unit, "7"); // 7 steps × 15% ≥ 100%
      const stepCount: Expr = statusOf(steps("4950000", "1000000"), steps("7050000", "1000000"), steps("3525000", "500000"), steps("5450000", "1000000"));
      // Schedule 3: line 65 = lesser of the tax paid (whole dollars) or $300;
      // line 66 = 15 percentage points per step, at most 1.00; line 67 = 65 ×
      // 66 rounded to whole dollars; line 68 = 65 − 67
      const line65 = min(rd(max0(fact("ctPropertyTaxPaid"))), money("30000"));
      const decimalPct: Expr = min(mulInt(money("15"), stepCount), money("100")); // as cents-of-percent
      const line67 = rd({ kind: "mulDiv", a: line65, b: decimalPct, c: money("100"), round: "half-up" });
      return sub(line65, line67);
    })(),
  },
  {
    id: "us.ct.eitc",
    version: 1,
    jurisdiction: "us.ct",
    title: "Connecticut earned income tax credit — 40% of the federal EIC (prorated by separate ÷ joint federal AGI when a joint federal filer must file separately for Connecticut) plus a flat $250 with at least one qualifying child (PA 25-168); refundable (Form CT-1040 line 20a / Schedule CT-EITC)",
    citation: {
      source: "Conn. Gen. Stat. § 12-704e as amended by 2025 Conn. Acts 25-168, § 371 (the $250 increase, tax years beginning on or after January 1, 2025); 2025 Schedule CT-EITC lines 1-16 and its instructions pp. 16-17; OLR 2025-R-0093 'Acts Affecting Taxes' p. 6",
      section: "§ 12-704e(a)-(c); PA 25-168 § 371; Schedule CT-EITC",
      url: "https://portal.ct.gov/-/media/drs/forms/2025/income/schedule-ct-eitc_1225.pdf",
      excerpt:
        "STATUTE (§ 12-704e(a), verbatim): 'a credit … in an amount equal to the applicable percentage of the earned income credit claimed and allowed for the same taxable year under Section 32 of the Internal Revenue Code … \"applicable percentage\" means … (3) forty per cent for taxable years commencing on or after January 1, 2023.' (b): 'If the amount of the credit … exceeds the taxpayer's liability … the Commissioner … shall refund the amount of such excess, without interest.' (c): a joint federal filer required to file separately for Connecticut receives the credit 'multiplied by a fraction, the numerator of which is such individual's federal adjusted gross income … and the denominator of which is the federal adjusted gross income reported on the joint return'. PA 25-168 § 371 (OLR, verbatim): 'increases the credit's amount by $250 for eligible taxpayers with at least one qualifying child for federal income tax purposes … applicable to tax years beginning on or after January 1, 2025.' SCHEDULE CT-EITC (printed): 1 claimed the 2025 federal EIC (else stop); 2 investment income over $11,950 → stop (the federal § 32(i) limit); 4-5 qualifying children listed; 8 federal EIC (1040 line 27a); 9 rate '40% (.40)'; 10 = 8 × 9; 11-14 the MFS-for-Connecticut proration ('Divide Line 12 by Line 13. If Line 12 is equal to or greater than Line 13, enter 1.0000' — four decimals); 15 = 10 × 14; 15a 'If you list a qualifying child on Line 5, enter $250. Otherwise, enter $0'; 16 = 10 + 15a, or 15 + 15a → Form CT-1040 line 20a (Part 3 payments — REFUNDABLE). The $250 is NOT prorated and does not vary with the number of children. Full-year residents only (part-year/nonresidents 'do not qualify … and must file Form CT-1040NR/PY'); valid SSNs required by the due date (no amended claim after obtaining one). Whole dollars. TY2026: 40% + $250 continue (no 2026 act changed § 12-704e). [Inputs: ctFederalEic, ctEitcQualifyingChild, ctEitcSeparateFagi and ctEitcJointFagi (both 0 = no proration).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      pct: { value: "40", type: "int" },
      childAddOn: { value: "25000", type: "money" }, // $250
      investmentIncomeLimit2025: { value: "1195000", type: "money" },
    },
    formula: (() => {
      const line10 = rd({ kind: "mulRate", base: max0(fact("ctFederalEic")), rate: { num: "40", den: "100" }, round: "half-up" });
      const sep = fact("ctEitcSeparateFagi");
      const joint = fact("ctEitcJointFagi");
      // line 14: separate ÷ joint federal AGI to four decimals, not more than 1.0000
      const ratio4: Expr = iff(ge(sep, joint), int("10000"), {
        kind: "stepUnits",
        value: { kind: "mulDiv", a: max0(sep), b: money("10000"), c: joint, round: "half-up" },
        unitCents: "1",
        mode: "floor",
      });
      // truncate to cents, then round to whole dollars = ONE half-up rounding
      const line15 = rd({ kind: "mulDiv", a: line10, b: mulInt(money("1"), ratio4), c: money("10000"), round: "floor" });
      const base: Expr = iff(gt(joint, money("0")), line15, line10);
      return add(base, iff(fact("ctEitcQualifyingChild"), money("25000"), money("0")));
    })(),
  },
  {
    id: "us.ct.social_security_adjustment",
    version: 1,
    jurisdiction: "us.ct",
    title: "Connecticut Social Security benefit adjustment — all federally taxable benefits subtracted when federal AGI is under $75,000 (single/MFS) or $100,000 (MFJ/QSS/HOH); otherwise taxable benefits minus 25% of the lesser of total benefits or the § 86(b)(1) excess (Schedule 1 line 41)",
    citation: {
      source: "Conn. Gen. Stat. § 12-701(a)(20)(B)(x)(III)-(IV) (TY2019+); 2025 Form CT-1040 instructions, Line 41 p. 8 and the Social Security Benefit Adjustment Worksheet p. 24",
      section: "§ 12-701(a)(20)(B)(x); Schedule 1 line 41",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'Your Social Security benefits are fully exempt from Connecticut income tax if your required filing status is single or married filing separately and the amount reported on Form CT-1040, Line 1, is less than $75,000; or married filing jointly, qualifying surviving spouse, or head of household and the amount reported on Form CT-1040, Line 1, is less than $100,000. If this is the case, enter on Line 41 the amount of federally taxable Social Security benefits reported on federal Form 1040, Line 6b.' WORKSHEET (p. 24, at or above the threshold): 'A. Enter the amount reported on your 2025 federal Social Security Benefits Worksheet, Line 1 [total benefits]. If Line A is zero or less, stop here and enter \"0\" on Line 41. B. Enter the amount reported on your 2025 federal Social Security Benefits Worksheet, Line 9 [the excess of provisional income over the base amount]. However, if filing separately and you lived with your spouse at any time during 2025, enter the amount reported on Line 7. If Line B is zero or less, stop here. C. Enter the lesser of Line A or Line B. D. Multiply Line C by 25% (.25). E. Taxable amount of Social Security benefits reported on your 2025 federal Social Security Benefits Worksheet, Line 18. F. Social Security Benefit Adjustment - Subtract Line D from Line E … If Line D is greater than or equal to Line E, enter \"0.\"' STATUTE (§ 12-701(a)(20)(B)(x)(IV), verbatim): 'an amount equal to the difference between the amount of Social Security benefits includable for federal income tax purposes and the lesser of twenty-five per cent of the Social Security benefits received during the taxable year, or twenty-five per cent of the excess described in Section 86(b)(1) of the Internal Revenue Code'. Keyed to FEDERAL AGI (line 1); thresholds not indexed (TY2026 identical). Tier 1 Railroad Retirement already subtracted here is not repeated on line 43. [Inputs: ctFederalAgi, ctSsTotalBenefits (worksheet line A), ctSsProvisionalExcess (worksheet line B), ctTaxableSs (worksheet line E = 1040 line 6b), filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      thresholdSingleMfs: { value: "7500000", type: "money" },
      thresholdMfjQssHoh: { value: "10000000", type: "money" },
      pct: { value: "25", type: "int" },
    },
    formula: (() => {
      const fagi = fact("ctFederalAgi");
      const taxable = max0(fact("ctTaxableSs"));
      const threshold: Expr = iff({ kind: "or", args: [isStatus("single"), isStatus("mfs")] }, money("7500000"), money("10000000"));
      const a = fact("ctSsTotalBenefits");
      const b = fact("ctSsProvisionalExcess");
      const d = rd({ kind: "mulRate", base: min(a, b), rate: { num: "25", den: "100" }, round: "half-up" });
      const worksheet: Expr = iff({ kind: "or", args: [le(a, money("0")), le(b, money("0"))] }, money("0"), max0(sub(taxable, d)));
      return iff(lt(fagi, threshold), taxable, worksheet);
    })(),
  },
  pensionRule(
    1,
    "75",
    "2025-01-01",
    "2026-01-01",
    "§ 12-701(a)(20)(B)(xxviii) (verbatim): '(II) for the taxable year commencing January 1, 2025, seventy-five per cent of any distribution from an individual retirement account other than a Roth individual retirement account, and (III) for the taxable year commencing January 1, 2026, and each taxable year thereafter, any distribution from an individual retirement account other than a Roth individual retirement account.' Pensions and annuities: § 12-701(a)(20)(B)(xxi)-(xxii) 'any pension or annuity income for the taxable year commencing on or after January 1, 2024, and each taxable year thereafter, in accordance with the following schedule' (the same phase-out schedule).",
  ),
  pensionRule(
    2,
    "100",
    "2026-01-01",
    "2027-01-01",
    "§ 12-701(a)(20)(B)(xxviii)(III) (verbatim): 'for the taxable year commencing January 1, 2026, and each taxable year thereafter, any distribution from an individual retirement account other than a Roth individual retirement account' — the IRA percentage rises from 75% (TY2025) to 100%; the phase-out schedule and the 100% pension/annuity treatment (§ 12-701(a)(20)(B)(xxi)-(xxii)) are unchanged. Re-verify against the 2026 booklet's worksheet when it publishes (~January 2027).",
  ),
  {
    id: "us.ct.parameters",
    version: 1,
    jurisdiction: "us.ct",
    title: "Connecticut 2025 Form CT-1040 parameters — line structure, Schedule 1 modifications, Schedule 2 other-jurisdiction credit mechanics, CHET/ABLE caps, use tax rates, penalties, and TY2026 changes",
    citation: {
      source: "2025 Form CT-1040 (4pp, Rev. 12/25) and instructions (28pp); Conn. Gen. Stat. chapter 229; OLR 2025-R-0093; DRS 2026 State Tax Developments page; web-verified September 2026",
      section: "Form CT-1040 lines 1-30; Schedules 1-5",
      url: BOOKLET_URL,
      excerpt:
        "STRUCTURE: 1 federal AGI (1040 line 11); 2 additions (Schedule 1 line 38: 31 non-Connecticut state/municipal bond interest; 32 non-Connecticut exempt-interest dividends; 33 lump-sum distributions taxed on Form 4972; 34 fiduciary adjustment (positive); 35 loss on sale of Connecticut bonds; 36 100% of § 168(k) bonus depreciation; 36a 80% of the § 179 deduction; 37 other incl. Connecticut income tax deducted federally above the line); 3 = 1 + 2; 4 subtractions (Schedule 1 line 50: 39 US obligation interest [not Fannie/Ginnie/Freddie]; 40 US-obligation mutual fund dividends; 41 SOCIAL SECURITY adjustment (→ us.ct.social_security_adjustment); 42 taxable state/local income tax refunds (Schedule 1 line 1); 43 Tier 1 and Tier 2 Railroad Retirement and RRB unemployment/sickness; 44 MILITARY RETIREMENT PAY 100% (§ 12-701(a)(20)(B)(xvi) — armed forces or National Guard retirees and survivor-option beneficiaries; NOT a former spouse's court-ordered share); 45 50% of Connecticut Teachers' Retirement System income (§ 12-701(a)(20)(B)(xix); or the pension subtraction instead when under the AGI threshold — never both); 46 fiduciary adjustment (negative); 47 gain on sale of Connecticut bonds; 48 CHET contributions — 'the lesser of (1) the amount of contributions to all CHET accounts during the taxable year; or (2)(A) $5,000 for each individual taxpayer (… single, head of household, filing separately, or (B) $10,000 for … filing jointly or qualifying surviving spouse', excess carried forward five years, current-year contributions used before carryovers; 48a 25% of § 168(k) bonus depreciation added back in the four preceding years; 48b PENSION/ANNUITY (→ us.ct.pension_annuity_subtraction); 48c cannabis-licensee (Chapter 420f/420h) business expenses; 48d ABLE contributions, same $5,000/$10,000 caps; 49 other incl. Mashantucket Pequot/Mohegan Indian-country income); 5 CONNECTICUT AGI = 3 − 4; 6 TAX (→ us.ct.income_tax; 'If your Connecticut adjusted gross income is less than or equal to $102,000, you may use the Tax Tables'); 7 credit for income taxes paid to qualifying jurisdictions (Schedule 2: 51 modified Connecticut AGI (= line 5 plus any net loss from the qualifying jurisdiction; 'You must first complete Form CT-1040, Schedule 3 … before completing Schedule 2' because line 55 nets line 11); 53 non-Connecticut income taxed by the other jurisdiction (Schedule 2 Worksheet); 54 = 53 ÷ 51 'May not exceed 1.0000'; 55 = line 6 − line 11; 56 = 54 × 55; 57 tax paid to the jurisdiction; 58 lesser of 56 or 57; 59 total → line 7; a copy of the other return must be attached); 8 = max0(6 − 7); 9 Connecticut AMT (Form CT-6251 line 23, required when federal AMT was paid — transcribed); 10 = 8 + 9; 11 PROPERTY TAX CREDIT (→ us.ct.property_tax_credit; skipped when line 10 is $0; cannot exceed line 10); 12 = max0(10 − 11); 13 Schedule CT-IT credits (transcribed, nonrefundable); 14 = max0(12 − 13); 15 individual USE TAX (Schedule 4: 1% computer/data processing, 6.35% general, 7.75% luxury — vehicles over $50,000, jewelry over $5,000, clothing/footwear/handbags over $1,000 — 2.99% vessels; 'You must enter \"0\" if no Connecticut use tax is due'); 16 = 17 = 14 + 15. PAYMENTS: 18 withholding (Schedule of W-2/1099 rows); 19 estimated payments INCLUDING prior-year overpayments applied; 20 extension payment (CT-1040 EXT); 20a CT EITC (→ us.ct.eitc); 20b claim of right credit (CT-1040 CRC, repayments over $3,000); 20c pass-through entity tax credit (Schedule CT-PE); 20d historic homes rehabilitation credit; 21 total. SETTLE: 22 overpayment = 21 − 17; 23 applied to 2026 estimated tax (irrevocable); 24 CHET contribution of the refund (Schedule CT-CHET); 24a designated charities (Schedule 5: AIDS research, organ transplant, endangered species, breast cancer, safety net, military relief, Baby Bond Trust, mental health); 25 REFUND = 22 − 23 − 24 − 24a; 26 tax due = 17 − 21; 27 late penalty 10% of line 26 (or $50 late-filing when no tax due); 28 interest 1% per month or fraction; 29 CT-2210 underpayment interest (applies when line 14 − withholding − line 20c is $1,000 or more; safe harbors per CT-2210); 30 total due. WHOLE DOLLARS throughout. Due April 15, 2026. FILING STATUS: same as federal, except a resident with a nonresident (or differently-resident part-year) spouse must file MFS for Connecticut unless both elect resident treatment; QSS uses the MFJ column of every table. NOT ON THIS RETURN: Form CT-1040NR/PY (part-year/nonresident, refused), Form CT-6251 mechanics, Schedule CT-IT credits, Schedule CT-PE. TY2026 CHANGES: IRA subtraction 75% → 100% (us.ct.pension_annuity_subtraction v2); PA 25-168 § 372 $500 refundable credit for owners of a state-licensed family child care home (TY2026+, transcribed); PA 25-168 § 373 refundable 20% farm investment credit for eligible farmers (TY2026+, transcribed); 2026 session (PA 26-68 § 277, PA 26-35 §§ 18-19): military-retirement subtraction extended to U.S. Public Health Service commissioned-corps retirement pay (TY2026+), honor-guard funeral compensation subtraction (TY2026+ per the act text), National Guard active-service pay subtraction (TY2027); the 2026 Form CT-1040ES prints Tables A-E cell-for-cell identical to 2025 and '100% of the amount of IRA' on its pension worksheet; no 2025/2026 act changed the rates, exemptions, Tables C-E, the property tax credit, or the EITC percentage; the proposed state child tax credit (§ 12-704h plan) was NOT enacted for TY2025 or TY2026. PA 25-172 § 2 (retroactive to TY2020): a credit of 60% of the additional Connecticut tax caused by re-adjusting the other-jurisdiction credit after a resident wins a refund from a state that taxed Connecticut-earned income under a 'convenience of the employer' rule — no CT-1040 line; transcribed via amended returns. Federal conformity: rolling (Connecticut AGI starts from federal AGI 'as amended'); OBBBA's below-the-line deductions do not reach Connecticut AGI.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      chetCapSingle: { value: "500000", type: "money" }, // $5,000
      chetCapJoint: { value: "1000000", type: "money" }, // $10,000
      ableCapSingle: { value: "500000", type: "money" },
      ableCapJoint: { value: "1000000", type: "money" },
      teachersRetirementPct: { value: "50", type: "int" },
      useTaxGeneralRateBps: { value: "635", type: "int" },
      useTaxLuxuryRateBps: { value: "775", type: "int" },
      latePenaltyPct: { value: "10", type: "int" },
      lateInterestPctPerMonth: { value: "1", type: "int" },
      underpaymentInterestFloor: { value: "100000", type: "money" }, // $1,000
      taxTableAgiTop: { value: "10200000", type: "money" },
      familyChildCareHomeCredit2026: { value: "50000", type: "money" }, // $500 (PA 25-168 § 372)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Connecticut Form CT-1040 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ct.income_tax, us.ct.personal_exemption, us.ct.property_tax_credit, us.ct.eitc, us.ct.social_security_adjustment, and us.ct.pension_annuity_subtraction",
    },
  },
];
