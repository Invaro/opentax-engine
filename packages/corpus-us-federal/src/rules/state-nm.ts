import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";
import { NM_CHILD_CREDIT_2025, NM_COUNTY_PROPERTY_REBATE_PCT_2025, NM_LICTR_2025, NM_PROPERTY_TAX_LIABILITY_2025 } from "./state-nm-tables.js";

/**
 * New Mexico deep pack — TY2025 Form PIT-1 (resident). Every amount verified
 * from the printed 2025 PIT-1, PIT-ADJ, and PIT-RC instructions (Taxation and
 * Revenue Department, tax.newmexico.gov), the printed 2025 PIT-1 / PIT-ADJ /
 * PIT-RC / PIT-CR, the 2025 Tax Rate Table (PIT-TRT, pp. T-1 to T-7), TRD's
 * "Personal Income Tax Rates for Tax Years Starting 2025" sheet, and NMSA 1978
 * §§ 7-2-2, 7-2-5.2, 7-2-5.8, 7-2-5.9, 7-2-5.11, 7-2-5.13, 7-2-5.14, 7-2-7,
 * 7-2-7.1, 7-2-13, 7-2-14, 7-2-18, 7-2-18.1, 7-2-18.13, 7-2-18.15, 7-2-18.16,
 * 7-2-18.34, 7-2-34, 7-2-39 (as amended through Laws 2025, ch. 130) and the
 * TRD 2026 Legislative Summary (LS-2026).
 *
 * Load-bearing findings:
 *  - HB 252 (Laws 2024, ch. 67) rewrote § 7-2-7 for TY2025: six brackets
 *    (1.5 / 3.2 / 4.3 / 4.7 / 4.9 / 5.9%) on three schedules — MFJ, head of
 *    household, and surviving spouse share one; single; MFS. A federal QSS is
 *    a New Mexico "surviving spouse" and uses the joint schedule everywhere.
 *  - The printed Tax Rate Table is the statute evaluated at the MIDPOINT of
 *    each "(more than lo, but not over hi]" $100 row (first rows (0, 60] and
 *    (60, 100]), rounded half-up — all 1,001 rows × 4 columns reproduce. Over
 *    $100,000 the printed worksheet chains from the LAST ROW's midpoint value
 *    ($4,356 single / $4,087 joint / $4,492 MFS), so it sits $2 under the
 *    statute at $100,000 and above; encoded as printed, with useFormulaMethod
 *    giving the exact statute (§ 7-2-7.1 lets TRD publish tables "computed
 *    substantially on the basis of the rates").
 *  - New Mexico taxable income starts from federal AGI and subtracts the
 *    FEDERAL standard or itemized deduction (§ 7-2-2(N)); post-TCJA the $4,000
 *    "deduction for certain dependents" (§ 7-2-39) stands in for the lost
 *    federal exemptions, but only for head of household and MFJ — not single,
 *    not surviving spouse.
 *  - The LICTR (§ 7-2-14) and child income tax credit (§ 7-2-18.34) tables are
 *    inflation-adjusted each year (rounded DOWN), so their 2025 tables are
 *    transcribed and those two rules end 2026-01-01; the statutory rates,
 *    exemptions, and deductions are unindexed and unchanged by the 2025 and
 *    2026 sessions (Laws 2025, ch. 130 only rewrote reporting clauses; LS-2026
 *    added only new PIT-CR-type credits), so they run through 2027-01-01.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const ge = (l: Expr, r: Expr): Expr => cmp("ge", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const minE = (...args: Expr[]): Expr => ({ kind: "min", args });
const maxE = (...args: Expr[]): Expr => ({ kind: "max", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** § 7-2-7(A): "married individuals filing joint returns, heads of household and surviving spouses" — one schedule */
const isJointSchedule: Expr = or(isStatus("mfj"), isStatus("hoh"), isStatus("qss"));
const isMfs: Expr = isStatus("mfs");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents × 10^4 = dollars × 10^6) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr, denCents: string): Expr =>
  times({ kind: "mulDiv", a: n, b: money("1"), c: money(denCents), round: "half-up" }, "100");
/** Σ rate_i × portion in bracket i, scaled ×10,000 (rate numerators per 10,000) */
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
const dollars = (d: number): Expr => money(String(d) + "00");
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });

// § 7-2-7 (Laws 2024, ch. 67, § 5) — taxable years beginning on or after January 1, 2025
const SCHED_JOINT = [
  { thresholdCents: "0", rateNum: "150" }, // 1.5% of the first $8,000
  { thresholdCents: "800000", rateNum: "320" }, // $120 + 3.2% over $8,000
  { thresholdCents: "2500000", rateNum: "430" }, // $664 + 4.3% over $25,000
  { thresholdCents: "5000000", rateNum: "470" }, // $1,739 + 4.7% over $50,000
  { thresholdCents: "10000000", rateNum: "490" }, // $4,089 + 4.9% over $100,000
  { thresholdCents: "31500000", rateNum: "590" }, // $14,624 + 5.9% over $315,000
];
const SCHED_SINGLE = [
  { thresholdCents: "0", rateNum: "150" }, // 1.5% of the first $5,500
  { thresholdCents: "550000", rateNum: "320" }, // $82.50 + 3.2% over $5,500
  { thresholdCents: "1650000", rateNum: "430" }, // $434.50 + 4.3% over $16,500
  { thresholdCents: "3350000", rateNum: "470" }, // $1,165.50 + 4.7% over $33,500
  { thresholdCents: "6650000", rateNum: "490" }, // $2,716.50 + 4.9% over $66,500
  { thresholdCents: "21000000", rateNum: "590" }, // $9,748 + 5.9% over $210,000
];
const SCHED_MFS = [
  { thresholdCents: "0", rateNum: "150" }, // 1.5% of the first $4,000
  { thresholdCents: "400000", rateNum: "320" }, // $60 + 3.2% over $4,000
  { thresholdCents: "1250000", rateNum: "430" }, // $332 + 4.3% over $12,500
  { thresholdCents: "2500000", rateNum: "470" }, // $869.50 + 4.7% over $25,000
  { thresholdCents: "5000000", rateNum: "490" }, // $2,044.50 + 4.9% over $50,000
  { thresholdCents: "15750000", rateNum: "590" }, // $7,312 + 5.9% over $157,500
];

const PIT1_URL = "https://klvg4oyd4j.execute-api.us-west-2.amazonaws.com/prod/PublicFiles/34821a9573ca43e7b06dfad20f5183fd/2d774fd0-be97-4b57-8dae-68aed999da0f/2025pit-1-ins.pdf";
const PITADJ_URL = "https://klvg4oyd4j.execute-api.us-west-2.amazonaws.com/prod/PublicFiles/34821a9573ca43e7b06dfad20f5183fd/61f8c5b0-b391-49b5-9d66-6605ef1f0c13/2025pit-adj-ins.pdf";
const PITRC_URL = "https://klvg4oyd4j.execute-api.us-west-2.amazonaws.com/prod/PublicFiles/34821a9573ca43e7b06dfad20f5183fd/60712e95-e253-4b88-9283-36b2484e541e/2025pit-rc-ins.pdf";

/** "over lo but not over hi" row lookup on a money fact (rows [lo, hi] in whole dollars, contiguous) — above the last row → fallback */
const rowLookup = (value: Expr, rows: readonly (readonly number[])[], pick: (row: readonly number[]) => Expr, above: Expr): Expr => {
  let expr: Expr = above;
  for (let i = rows.length - 1; i >= 0; i--) expr = iff(le(value, dollars(rows[i][1])), pick(rows[i]), expr);
  return expr;
};

export const nmRules: Rule[] = [
  {
    id: "us.nm.income_tax",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico income tax — § 7-2-7 six-bracket schedules (1.5% to 5.9%) for MFJ/HOH/surviving spouse, single, and MFS, via the 2025 Tax Rate Table (row midpoints) to $100,000 and the printed over-$100,000 worksheet above (PIT-1 line 18)",
    citation: {
      source: "NMSA 1978 § 7-2-7 (Laws 2024, ch. 67, § 5, applicable to taxable years beginning on or after January 1, 2025) and § 7-2-7.1 (tax tables); 2025 New Mexico Tax Rate Table (PIT-TRT pp. T-1 to T-7); TRD 'Personal Income Tax Rates for Tax Years Starting 2025'; 2025 PIT-1 instructions, lines 17-18 pp. PIT-1-27",
      section: "§ 7-2-7(A)-(C); § 7-2-7.1; PIT-1 lines 17, 18, 18a; PIT-TRT",
      url: PIT1_URL,
      excerpt:
        "STATUTE (§ 7-2-7, verbatim): 'The tax imposed by Section 7-2-3 NMSA 1978 shall be at the following rates for any taxable year beginning on or after January 1, 2025: A. For married individuals filing joint returns, heads of household and surviving spouses: Not over $8,000 — 1.5% of taxable income; Over $8,000 but not over $25,000 — $120 plus 3.2% of excess over $8,000; Over $25,000 but not over $50,000 — $664 plus 4.3% of excess over $25,000; Over $50,000 but not over $100,000 — $1,739 plus 4.7% of excess over $50,000; Over $100,000 but not over $315,000 — $4,089 plus 4.9% of excess over $100,000; Over $315,000 — $14,624 plus 5.9% of excess over $315,000. B. For single individuals and for estates and trusts: Not over $5,500 — 1.5% of taxable income; Over $5,500 but not over $16,500 — $82.50 plus 3.2% of excess over $5,500; Over $16,500 but not over $33,500 — $434.50 plus 4.3% of excess over $16,500; Over $33,500 but not over $66,500 — $1,165.50 plus 4.7% of excess over $33,500; Over $66,500 but not over $210,000 — $2,716.50 plus 4.9% of excess over $66,500; Over $210,000 — $9,748 plus 5.9% of excess over $210,000. C. For married individuals filing separate returns: Not over $4,000 — 1.5% of taxable income; Over $4,000 but not over $12,500 — $60.00 plus 3.2% of excess over $4,000; Over $12,500 but not over $25,000 — $332 plus 4.3% of excess over $12,500; Over $25,000 but not over $50,000 — $869.50 plus 4.7% of excess over $25,000; Over $50,000 but not over $157,500 — $2,044.50 plus 4.9% of excess over $50,000; Over $157,500 — $7,312 plus 5.9% of excess over $157,500.' § 7-2-7.1: 'In lieu of the tax rate computations required in Section 7-2-7 NMSA 1978, the secretary may adopt regulations requiring taxpayers to pay taxes in accordance with tax rate tables. The tax tables may be established either by regulation or by instruction but shall be computed substantially on the basis of the rates prescribed in Section 7-2-7 NMSA 1978.' PIT-1 (line 18, verbatim): 'Unless you qualify for Schedule CC, calculate your New Mexico tax by using one of these methods and then complete line 18a: If you have income from sources inside and outside New Mexico, use your entry on PIT-B, line 14 or; Use the rate tables from the PIT-1 instructions, starting on page 1T. … If you use the rate tables, make sure to use the taxable income amount on line 17.' TAX RATE TABLE (PIT-TRT, verbatim header): 'If line 17 of Form PIT-1 (Taxable Income) is: More Than / But Not Over — And you are: Single / Married Filing Jointly* / Married Filing Separately / Head of Household — Your tax is:' with '* This column must also be used by surviving spouse'; first rows '0 60 0 0 0 0', '60 100 1 1 1 1', '100 200 2 2 2 2', then $100 rows to '99,900 100,000 4,356 4,087 4,492 4,087'. Worked example (T-1): 'Mr. and Mrs. Brown are filing a joint return. Their New Mexico Taxable Income on line 17 of the Form PIT-1 is $25,325. First they find the $25,300-$25,400 income line. Next they find the column for Married Filing Jointly … The amount shown … is $679.' CONVENTION (verified on all 1,001 rows × 4 columns): each cell is the § 7-2-7 schedule at the row midpoint ($25,350 × 4.3% − … = $679.05 → $679; the (0, 60] row at $30; (60, 100] at $80; (lo, lo+100] at lo + 50), rounded half-up (half-even fails 22 cells); the Head of Household column equals the Married Filing Jointly column throughout. OVER $100,000 (T-7, verbatim): 'If line 17 of Form PIT-1 (Taxable Income) is over $100,000 use the following table to compute your tax. If you are: Single — and your taxable income is not over: $210,000 — Your Tax is… $4,356 plus 4.9% of taxable income in excess of $100,000; Married Filing Jointly — $315,000 — $4,087 plus 4.9% … $100,000; Married Filing Separately — $157,500 — $4,492 plus 4.9% … $100,000; Head of Household — $315,000 — $4,087 plus 4.9% … $100,000. If you are: Single — and your taxable income is over: $210,000 — $9,746 plus 5.9% of taxable income in excess of $210,000; Married Filing Jointly — $315,000 — $14,622 plus 5.9% … $315,000; Married Filing Separately — $157,500 — $7,310 plus 5.9% … $157,500; Head of Household — $315,000 — $14,622 plus 5.9% … $315,000.' The worksheet bases are the last table row's midpoint values (statute: $4,358 / $4,089 / $4,494.50 at $100,000; $9,748 / $14,624 / $7,312 at the top thresholds), so the printed method sits about $2 under the statute above $100,000 — encoded AS PRINTED, rounded to whole dollars ('Round all numbers and enter only whole dollar amounts', PIT-1-21); useFormulaMethod=true evaluates the exact § 7-2-7 schedule instead. A federal QSS files as a New Mexico 'surviving spouse' (§ 7-2-2(W): 'as generally defined for federal income tax purposes') and uses the joint column. Nonresidents and part-year residents apportion on Schedule PIT-B (line 18a = B) — not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "150", type: "int" },
      rate2Bps: { value: "320", type: "int" },
      rate3Bps: { value: "430", type: "int" },
      rate4Bps: { value: "470", type: "int" },
      rate5Bps: { value: "490", type: "int" },
      topRateBps: { value: "590", type: "int" },
      jointBracket1: { value: "800000", type: "money" },
      jointBracket2: { value: "2500000", type: "money" },
      jointBracket3: { value: "5000000", type: "money" },
      jointBracket4: { value: "10000000", type: "money" },
      jointBracket5: { value: "31500000", type: "money" },
      singleBracket1: { value: "550000", type: "money" },
      singleBracket2: { value: "1650000", type: "money" },
      singleBracket3: { value: "3350000", type: "money" },
      singleBracket4: { value: "6650000", type: "money" },
      singleBracket5: { value: "21000000", type: "money" },
      mfsBracket1: { value: "400000", type: "money" },
      mfsBracket2: { value: "1250000", type: "money" },
      mfsBracket3: { value: "2500000", type: "money" },
      mfsBracket4: { value: "5000000", type: "money" },
      mfsBracket5: { value: "15750000", type: "money" },
      tableTop: { value: "10000000", type: "money" }, // $100,000
      worksheetBaseSingle: { value: "435600", type: "money" }, // $4,356 as printed (statute $4,358)
      worksheetBaseJoint: { value: "408700", type: "money" }, // $4,087 (statute $4,089)
      worksheetBaseMfs: { value: "449200", type: "money" }, // $4,492 (statute $4,494.50)
      worksheetTopSingle: { value: "974600", type: "money" }, // $9,746 over $210,000
      worksheetTopJoint: { value: "1462200", type: "money" }, // $14,622 over $315,000
      worksheetTopMfs: { value: "731000", type: "money" }, // $7,310 over $157,500
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const sched = (b: Expr): Expr =>
        iff(
          isJointSchedule,
          dollarsFromScaled(scaledSchedule(b, SCHED_JOINT), "1000000"),
          iff(isMfs, dollarsFromScaled(scaledSchedule(b, SCHED_MFS), "1000000"), dollarsFromScaled(scaledSchedule(b, SCHED_SINGLE), "1000000")),
        );
      // table rows (lo, lo+100] → midpoint lo + 50; the first two rows are (0, 60] → $30 and (60, 100] → $80
      const k = stepUnits(x, "10000", "ceil");
      const mid100: Expr = sub(mulInt(money("10000"), k), money("5000"));
      const mid: Expr = iff(le(x, money("6000")), money("3000"), iff(le(x, money("10000")), money("8000"), mid100));
      // printed worksheet: base + 4.9% of the excess over $100,000 to the top threshold, then top base + 5.9%
      const ws = (baseCents: string, topCents: string, topBaseCents: string): Expr =>
        iff(
          le(x, money(topCents)),
          dollarsFromScaled(add(times(money(baseCents), "10000"), times(sub(x, money("10000000")), "490")), "1000000"),
          dollarsFromScaled(add(times(money(topBaseCents), "10000"), times(sub(x, money(topCents)), "590")), "1000000"),
        );
      const worksheet: Expr = iff(isJointSchedule, ws("408700", "31500000", "1462200"), iff(isMfs, ws("449200", "15750000", "731000"), ws("435600", "21000000", "974600")));
      return iff(fact("useFormulaMethod"), sched(x), iff(le(x, money("10000000")), sched(mid), worksheet));
    })(),
  },
  {
    id: "us.nm.salt_addback",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico itemized state and local tax add-back — the federal Schedule A state and local INCOME tax deduction, prorated by the SALT cap and limited to the excess of itemized deductions over the standard deduction (PIT-1 line 10 worksheet)",
    citation: {
      source: "NMSA 1978 § 7-2-2(N)(2) (net income excludes itemized deductions 'less the amount of state and local income and sales taxes included in the taxpayer's itemized deductions'); 2025 PIT-1 instructions, line 10 and 'Line 10. Worksheet for Calculating Line 10 Amount' p. PIT-1-24",
      section: "§ 7-2-2(N)(2); PIT-1 line 10 worksheet lines 1-10",
      url: PIT1_URL,
      excerpt:
        "PIT-1 (line 10, verbatim): 'If you itemized deductions on your 2025 federal income tax return, on your PIT-1 Return you must add back all or part of the amount shown for Taxes You Paid (state and local) on federal Schedule A, line 5a. The amount to enter on line 10 is bound by the following two conditions: The amount on line 10 of the worksheet cannot be larger than the difference between your itemized deduction and the federal standard deduction amount you would have qualified for had you not itemized. If the total amount of the itemized deduction for state and local taxes on line 5e of federal Schedule A, is limited by the new thresholds as a result of the changes made by the Federal Tax Cuts and Jobs Act of 2017, your state and local tax deduction add-back for state tax purposes is also reduced. The add-back amount on line 10 is proportioned by a percentage equal to the amount on line 5d of your federal Schedule A, before the limitation is applied.' WORKSHEET (verbatim): '1. Enter the amount of state and local income taxes claimed on federal Schedule A, line 5a. 2. Enter the total amount of state and local taxes on federal Schedule A, line 5d. 3. Divide line 1 by line 2. Round to 4 decimal places. 4. Enter the amount of state and local taxes claimed on federal Schedule A, line 5e. 5. Multiply line 4 by line 3. 6. Enter the lesser of line 4 and line 5. If they are the same, enter that number here. 7. Enter the standard deduction amount you could have claimed on federal Form 1040 or 1040SR, line 12, if you had not itemized your federal allowable deductions. 8. Enter your total itemized deductions from federal Form 1040 or 1040SR, line 12. Also enter this amount on PIT-1, line 12, and mark the box on line 12a. 9. Subtract line 7 from line 8. If less than zero, please enter 0. 10. Enter the lesser of lines 6 and 9. Also enter this amount on PIT-1, line 10.' ENCODING: $0 unless nmFederalItemized; ratio = round(line 5a ÷ line 5d, 4 decimals); line 5 = line 5e × ratio; line 6 = min(5e, line 5); line 9 = max0(itemized − standard); line 10 = min(6, 9), whole dollars. A filer who took the federal standard deduction adds back nothing (line 10 = 0).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "4", type: "int" } },
    formula: (() => {
      const a = max0(fact("nmSaltIncomeTaxes"));
      const d = max0(fact("nmSaltTotal"));
      const e = max0(fact("nmSaltAllowed"));
      // ratio × 10,000 as an integer number of cents: 5a × 10,000 ÷ 5d (money("10000") = 10,000 cents)
      const ratio10000: Expr = { kind: "mulDiv", a, b: money("10000"), c: d, round: "half-up" };
      const l5: Expr = { kind: "mulDiv", a: e, b: ratio10000, c: money("10000"), round: "half-up" };
      const l6 = minE(e, l5);
      const l9 = max0(sub(max0(fact("nmFederalItemizedDeductions")), max0(fact("nmFederalStandardDeduction"))));
      return iff(and(fact("nmFederalItemized"), gt(d, money("0"))), rd(minE(l6, l9)), money("0"));
    })(),
  },
  {
    id: "us.nm.dependents_deduction",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico deduction for certain dependents — $4,000 × (dependents − 1) for a head of household or married-filing-jointly filer who is not someone's dependent (PIT-1 line 13)",
    citation: {
      source: "NMSA 1978 § 7-2-39 (Laws 2019, ch. 270, § 15; reporting clause amended by Laws 2025, ch. 130, § 51 effective January 1, 2026); 2025 PIT-1 instructions, line 13 and 'Line 13. Worksheet for Calculating Deduction for Certain Dependents' p. PIT-1-25",
      section: "§ 7-2-39; PIT-1 line 13",
      url: PIT1_URL,
      excerpt:
        "STATUTE (verbatim): 'A. As long as the exemption amount pursuant to Section 151 of the Internal Revenue Code means zero, a taxpayer who is not a dependent of another individual and files a return as a head of household or married filing jointly may claim a deduction from net income in an amount equal to the product of four thousand dollars ($4,000) multiplied by the difference between the number of dependents claimed on the taxpayer's return and one. … D. As used in this section, \"dependent\" means \"dependent\" as defined in Section 152 of the Internal Revenue Code.' PIT-1 (line 13, verbatim): 'A taxpayer who is not a dependent of another individual and files a return as a head of household or married filing jointly may claim a deduction from net income in an amount of $4000 for certain dependents. NOTE: Deduction is valid beginning tax year 2019, as long as the exemption amount pursuant to Section 151 of the Internal Revenue Code is zero (0).' WORKSHEET: '1. Add the number of dependents and other dependents entered on PIT-1, line 8. 2. Add the number of dependents and other dependents entered on PIT-S. If none, enter \"0\". 3. Total dependents. Add lines 1 and 2. 4. Qualified dependents. Subtract \"1\" from total dependents entered in line 3 … 5. Multiply the qualified dependents entered in line 4 by $4000. Enter the amount here and on PIT-1, line 13.' ENCODING: $4,000 × max(0, dependents − 1) when filingStatus is hoh or mfj and the filer is not claimed as a dependent; $0 for single, married filing separately, and a federal QSS (the statute names only head of household and married filing jointly — a surviving spouse is a distinct filing status under § 7-2-2(F) and is NOT listed). The § 151 exemption amount is zero through 2025 (TCJA, made permanent by P.L. 119-21).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perDependent: { value: "400000", type: "money" } },
    formula: iff(
      and(or(isStatus("hoh"), isStatus("mfj")), not(fact("isClaimedAsDependent"))),
      max0(sub(mulInt(money("400000"), fact("nmDependents")), money("400000"))),
      money("0"),
    ),
  },
  {
    id: "us.nm.low_middle_income_exemption",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico low- and middle-income exemption — up to $2,500 per federal exemption, phased down 15% (single) / 20% (MFS) / 10% (MFJ, HOH, surviving spouse) of AGI over $20,000 / $15,000 / $30,000, none above $36,667 / $27,500 / $55,000 (PIT-1 line 14)",
    citation: {
      source: "NMSA 1978 § 7-2-5.8 (Laws 2005, ch. 104, § 5; 2007, ch. 45, § 8); 2025 PIT-1 instructions, line 14 p. PIT-1-25 and 'New Mexico Low- and Middle-Income Tax Exemption Worksheet' p. PIT-1-26; line 5 worksheet p. PIT-1-22",
      section: "§ 7-2-5.8(A)-(D); PIT-1 lines 5, 14",
      url: PIT1_URL,
      excerpt:
        "STATUTE (verbatim): 'A. An individual may claim an exemption in an amount specified in Subsections B through D of this section not to exceed an amount equal to the number of federal exemptions multiplied by two thousand five hundred dollars ($2,500) of income includable, except for this exemption, in net income. B. For a married individual filing a separate return with adjusted gross income up to twenty-seven thousand five hundred dollars ($27,500): (1) if the adjusted gross income is not over fifteen thousand dollars ($15,000), the amount of the exemption … shall be two thousand five hundred dollars ($2,500) for each federal exemption; and (2) if the adjusted gross income is over fifteen thousand dollars ($15,000) but not over twenty-seven thousand five hundred dollars ($27,500), the amount of the exemption … for each federal exemption shall be calculated as follows: (a) two thousand five hundred dollars ($2,500); less (b) twenty percent of the amount obtained by subtracting fifteen thousand dollars ($15,000) from the adjusted gross income. C. For single individuals with adjusted gross income up to thirty-six thousand six hundred sixty-seven dollars ($36,667): (1) … not over twenty thousand dollars ($20,000) … $2,500 …; (2) … (b) fifteen percent of the amount obtained by subtracting twenty thousand dollars ($20,000) from the adjusted gross income. D. For married individuals filing joint returns, surviving spouses or for heads of households with adjusted gross income up to fifty-five thousand dollars ($55,000): (1) … not over thirty thousand dollars ($30,000) … $2,500 …; (2) … (b) ten percent of the amount obtained by subtracting thirty thousand dollars ($30,000) from the adjusted gross income.' WORKSHEET (PIT-1-26, verbatim): '1. Enter the amount reported on PIT-1, line 9. If your federal adjusted gross income is greater than the amount listed in the table above for your filing status, do not complete this form because you do not qualify for this exemption. 2. If your filing status … is: Single, enter $20,000. Married filing jointly or Surviving Spouse, enter $30,000. Head of household, enter $30,000. Married filing separately, enter $15,000. 3. Subtract line 2 from line 1. If the result is negative, enter zero here, skip line 4, and enter zero on line 5. 4. … Single, enter 0.15. Married filing jointly or Surviving Spouse, enter 0.10. Head of household, enter 0.10. Married filing separately, enter 0.20. 5. Multiply line 3 by line 4 and enter the result. 6. Subtract line 5 from $2,500. 7. Enter the number of exemptions* reported on PIT-1, line 5. 8. Multiply line 6 by line 7. Enter this amount here and on PIT-1, line 14. * Exemptions include the taxpayer, spouse, dependents, and other dependents reported on federal Form 1040 or 1040SR for federal income tax purposes.' LINE 5 (verbatim): '1. Yourself. Enter \"1\" if you can't be claimed as an other dependent, otherwise, enter \"0\". 2. Spouse. Enter \"1\" if married filing jointly and can't be claimed as an other dependent, otherwise, enter \"0\". 3. Enter total number of dependents and other dependents as reported on your federal return.' ENCODING (line by line as printed, whole dollars at each line): line 5 = round(pct × max0(AGI − threshold)); line 6 = max0($2,500 − line 5); line 8 = line 6 × nmExemptions; $0 when AGI exceeds the status limit (at exactly $36,667 the single line 5 is $2,500 → $0). Because line 5 is rounded before the multiplication, a filer with several exemptions can get up to a few dollars more than an unrounded computation — the printed worksheet governs. The § 7-2-5.8(A) cap ('income includable … in net income') is met by PIT-1 line 17's floor at zero.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "250000", type: "money" },
      limitSingle: { value: "3666700", type: "money" },
      limitMfs: { value: "2750000", type: "money" },
      limitJoint: { value: "5500000", type: "money" },
      thresholdSingle: { value: "2000000", type: "money" },
      thresholdMfs: { value: "1500000", type: "money" },
      thresholdJoint: { value: "3000000", type: "money" },
    },
    formula: (() => {
      const agi = fact("nmAgi");
      const limit: Expr = iff(isJointSchedule, money("5500000"), iff(isMfs, money("2750000"), money("3666700")));
      const threshold: Expr = iff(isJointSchedule, money("3000000"), iff(isMfs, money("1500000"), money("2000000")));
      const over = max0(sub(agi, threshold));
      // worksheet line 5 is a whole-dollar entry ("Round all numbers and enter only whole dollar amounts") before line 6 subtracts it from $2,500
      const phase: Expr = rd(iff(isJointSchedule, pct(over, "10", "100"), iff(isMfs, pct(over, "20", "100"), pct(over, "15", "100"))));
      const per = max0(sub(money("250000"), phase));
      return iff(gt(agi, limit), money("0"), rd(mulInt(per, fact("nmExemptions"))));
    })(),
  },
  {
    id: "us.nm.age65_blind_exemption",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico exemption for persons 65 or older or blind — up to $8,000 per qualifying taxpayer, falling $1,000 per $3,000 (MFJ/HOH/surviving spouse) or $1,500 (single, MFS) of AGI over $30,000 / $18,000 / $15,000, none above $51,000 / $28,500 / $25,500 (PIT-ADJ line 13)",
    citation: {
      source: "NMSA 1978 § 7-2-5.2 (Laws 1985, ch. 114, § 1; 1987, ch. 264, § 6); 2025 PIT-ADJ instructions, line 13 and 'Table 1. Exemptions for Persons 65 or Older or Blind' pp. ADJ-4 to ADJ-5",
      section: "§ 7-2-5.2(A)-(C); PIT-ADJ line 13, Table 1",
      url: PITADJ_URL,
      excerpt:
        "STATUTE (verbatim): 'Any individual sixty-five years of age or older or who, for federal income tax purposes, is blind may claim an exemption in an amount specified in Subsections A through C of this section not to exceed eight thousand dollars ($8,000) of income includable except for this exemption in net income. … A. for married individuals filing separate returns …: Not over $15,000 — $8,000; Over $15,000 but not over $16,500 — $7,000; Over $16,500 but not over $18,000 — $6,000; Over $18,000 but not over $19,500 — $5,000; Over $19,500 but not over $21,000 — $4,000; Over $21,000 but not over $22,500 — $3,000; Over $22,500 but not over $24,000 — $2,000; Over $24,000 but not over $25,500 — $1,000; Over $25,500 — 0. B. for heads of household, surviving spouses and married individuals filing joint returns …: Not over $30,000 — $8,000; Over $30,000 but not over $33,000 — $7,000; Over $33,000 but not over $36,000 — $6,000; Over $36,000 but not over $39,000 — $5,000; Over $39,000 but not over $42,000 — $4,000; Over $42,000 but not over $45,000 — $3,000; Over $45,000 but not over $48,000 — $2,000; Over $48,000 but not over $51,000 — $1,000; Over $51,000 — 0. C. for single individuals …: Not over $18,000 — $8,000; Over $18,000 but not over $19,500 — $7,000; Over $19,500 but not over $21,000 — $6,000; Over $21,000 but not over $22,500 — $5,000; Over $22,500 but not over $24,000 — $4,000; Over $24,000 but not over $25,500 — $3,000; Over $25,500 but not over $27,000 — $2,000; Over $27,000 but not over $28,500 — $1,000; Over $28,500 — 0.' PIT-ADJ (line 13, verbatim): 'You may be eligible for an exemption of up to $8,000 based on your filing status and your federal adjusted gross income from PIT-1, line 9, if: You are 65 or older, or You are not yet 65, but considered blind for federal income tax purposes. … When both persons in a married couple are either 65 or older or blind on the last day of the tax year, the amount in the table applies to each taxpayer on a joint return. … NOTE: The Department allows only one deduction per person. You cannot take deductions for being both 65 or older and blind. EXAMPLE: A married couple files jointly and both people are 65 or older. Their federal adjusted gross income is $35,000. According to Table 1, the exemption amount is $12,000 or $6,000 x 2. If the same couple is also blind, the exemption is still $12,000. EXAMPLE: A married couple files jointly. The primary taxpayer is 65 and the spouse is 45 and blind. Their federal adjusted gross income is $28,000. According to Table 1, the exemption is $16,000 or $8,000 x 2.' Table 1 prints the same ranges as $30,001-$33,000 etc. ENCODING: per person = max0($8,000 − $1,000 × ceil(max0(AGI − base) ÷ step)) with base/step $30,000/$3,000 (joint schedule), $18,000/$1,500 (single), $15,000/$1,500 (MFS); × nmAge65OrBlindPersons (0-2; one per person; at most 1 for single/HOH/MFS). 'You may not claim the centenarian exemption AND the deduction for 65 and older or blind.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      maxPerPerson: { value: "800000", type: "money" },
      stepDown: { value: "100000", type: "money" },
      baseJoint: { value: "3000000", type: "money" },
      stepJoint: { value: "300000", type: "money" },
      baseSingle: { value: "1800000", type: "money" },
      baseMfs: { value: "1500000", type: "money" },
      stepSingleMfs: { value: "150000", type: "money" },
    },
    formula: (() => {
      const agi = fact("nmAgi");
      const base: Expr = iff(isJointSchedule, money("3000000"), iff(isMfs, money("1500000"), money("1800000")));
      const over = max0(sub(agi, base));
      const steps: Expr = iff(isJointSchedule, stepUnits(over, "300000", "ceil"), stepUnits(over, "150000", "ceil"));
      const per = max0(sub(money("800000"), mulInt(money("100000"), steps)));
      const persons: Expr = iff(and(not(isStatus("mfj")), gt(fact("nmAge65OrBlindPersons"), int("1"))), int("1"), fact("nmAge65OrBlindPersons"));
      return mulInt(per, persons);
    })(),
  },
  {
    id: "us.nm.social_security_exemption",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico Social Security exemption — the federally taxable Social Security in AGI, when AGI is not over $100,000 (single) / $75,000 (MFS) / $150,000 (MFJ, HOH, surviving spouse) (PIT-ADJ line 25)",
    citation: {
      source: "NMSA 1978 § 7-2-5.14 (Laws 2022, ch. 47, § 7, taxable years beginning on or after January 1, 2022); 2025 PIT-ADJ instructions, line 25 and 'Table 2. AGI Threshold for Social Security Income Exemption' p. ADJ-7",
      section: "§ 7-2-5.14; PIT-ADJ line 25",
      url: PITADJ_URL,
      excerpt:
        "STATUTE (verbatim): 'An individual may claim an exemption in an amount equal to the amount included in adjusted gross income pursuant to Section 86 of the Internal Revenue Code, as that section may be amended or renumbered, of income includable except for this exemption in net income; provided that the individual's adjusted gross income shall not exceed: A. seventy-five thousand dollars ($75,000) for married individuals filing separate returns; B. one hundred fifty thousand dollars ($150,000) for heads of household, surviving spouses and married individuals filing joint returns; and C. one hundred thousand dollars ($100,000) for single individuals.' PIT-ADJ (line 25, verbatim): 'If your federal Adjusted Gross Income (AGI) does not exceed the maximum for your filing status, as listed in Table 2 (below), enter the amount of social security income included in your AGI. Table 2. AGI Threshold for Social Security Income Exemption: Single $100,000; Married Filing Separate $75,000; Married Filing Joint, Head of Household, and Surviving Spouse $150,000. Example 1. Taxpayer A is filing single and has an AGI of $99,500 which includes taxable social security income of $60,000. The taxpayer is able to claim an exemption for the $60,000 … Example 2. Taxpayer B is filing single and has an AGI of $150,000 which includes taxable social security income of $60,000. No part of the taxpayer's social security income qualifies … because their AGI is over the $100,000 maximum for their filing status.' A CLIFF: one dollar over the limit forfeits the whole exemption. Input nmTaxableSocialSecurity = Form 1040 line 6b.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      limitSingle: { value: "10000000", type: "money" },
      limitMfs: { value: "7500000", type: "money" },
      limitJoint: { value: "15000000", type: "money" },
    },
    formula: (() => {
      const limit: Expr = iff(isJointSchedule, money("15000000"), iff(isMfs, money("7500000"), money("10000000")));
      return iff(le(fact("nmAgi"), limit), rd(max0(fact("nmTaxableSocialSecurity"))), money("0"));
    })(),
  },
  {
    id: "us.nm.capital_gains_deduction",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico net capital gain deduction — the greater of the net capital gain up to $2,500 or 40% of up to $1,000,000 of net capital gain from the sale of a New Mexico business; MFS halves both caps (PIT-ADJ line 16)",
    citation: {
      source: "NMSA 1978 § 7-2-34 (as amended by Laws 2024, ch. 67, § 8, applicable to taxable years beginning on or after January 1, 2025); 2025 PIT-ADJ instructions, line 16 p. ADJ-5",
      section: "§ 7-2-34(A)-(C); PIT-ADJ line 16",
      url: PITADJ_URL,
      excerpt:
        "STATUTE (verbatim): 'A. A taxpayer may claim a deduction from net income in an amount equal to the greater of: (1) the taxpayer's net capital gain income for the taxable year for which the deduction is being claimed, but not to exceed two thousand five hundred dollars ($2,500); or (2) forty percent of up to one million dollars ($1,000,000) of the taxpayer's net capital gain income from the sale of a business that is allocated or apportioned to New Mexico pursuant to Section 7-2-11 NMSA 1978 for the taxable year for which the deduction is being claimed. B. Married individuals who file separate returns for a taxable year in which they could have filed a joint return may each claim only one-half of the deduction provided by this section that would have been allowed on the joint return. C. As used in this section, \"net capital gain\" means \"net capital gain\" as defined in Section 1222 (11) of the Internal Revenue Code.' (The 2024 amendment 'limited the capital gains deduction to twenty-five hundred dollars' — the prior law allowed the greater of $1,000 or 40% of ALL net capital gain.) PIT-ADJ (line 16, verbatim): 'You may deduct the greater of: 100% of your net capital gains, not to exceed $2,500; or 40% of up to $1,000,000 of your net capital gain income from the sale of a business that is allocated or apportioned to New Mexico … \"net capital gains\" are defined by Section 1222(11) of the Internal Revenue Code as the excess of net long-term capital gains over short-term capital losses for the tax year. \"Net capital gains\" do not include short-term capital gains.' ENCODING: max(min(net capital gain, $2,500), 40% × min(business-sale gain, net capital gain, $1,000,000)) — the business-sale gain cannot exceed the § 1222(11) net capital gain it is part of; for MFS the two caps are halved ($1,250 and $500,000) as the one-half-of-the-joint-amount rule applied to the filer's own gains — disclose when the spouses' gains are uneven.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      generalCap: { value: "250000", type: "money" },
      businessPct: { value: "40", type: "int" },
      businessGainCap: { value: "100000000", type: "money" }, // $1,000,000
    },
    formula: (() => {
      const ncg = max0(fact("nmNetCapitalGain"));
      const biz = max0(fact("nmBusinessSaleGain"));
      const general: Expr = iff(isMfs, minE(ncg, money("125000")), minE(ncg, money("250000")));
      // the business-sale gain is a subset of the § 1222(11) net capital gain ("forty percent of up to one million dollars … of the taxpayer's net capital gain income from the sale of a business")
      const bizGain = minE(biz, ncg);
      const business: Expr = iff(isMfs, pct(minE(bizGain, money("50000000")), "40", "100"), pct(minE(bizGain, money("100000000")), "40", "100"));
      return rd(maxE(general, business));
    })(),
  },
  {
    id: "us.nm.armed_forces_retirement_exemption",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico armed forces retirement pay exemption — $30,000 of retirement pay per armed forces retiree or surviving spouse of a retiree, each spouse on a joint return (PIT-ADJ line 24)",
    citation: {
      source: "NMSA 1978 § 7-2-5.13 (Laws 2022, ch. 47, § 6; as amended by Laws 2024, ch. 67, § 32 — sunset removed, surviving spouses added, applicable January 1, 2025); 2025 PIT-ADJ instructions, line 24 p. ADJ-7",
      section: "§ 7-2-5.13; PIT-ADJ line 24",
      url: PITADJ_URL,
      excerpt:
        "STATUTE (verbatim): 'A. An individual who is an armed forces retiree or the surviving spouse of an armed forces retiree may claim an exemption in an amount equal to thirty thousand dollars ($30,000) of armed forces retirement pay includable, except for this exemption, in net income. B. As used in this section, \"armed forces retiree\" means a former member of the armed forces of the United States who has qualified by years of service or disability to separate from military service with lifetime benefits.' PIT-ADJ (line 24, verbatim): 'Each qualifying armed forces retiree or surviving spouse of an armed forces retiree may claim an exemption in an amount equal to $30,000 of armed forces retirement pay includable, except for this exemption, in net income. If you are married filing jointly and both spouses qualify, each qualifying armed forces retiree may claim an exemption in an amount equal to $30,000 …' ENCODING: min(primary's armed forces retirement pay, $30,000) + (filingStatus mfj ? min(spouse's, $30,000) : 0). Active-duty pay is a separate 100% exemption (§ 7-2-5.11, PIT-ADJ line 17 — transcribed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perRetiree: { value: "3000000", type: "money" } },
    formula: add(minE(max0(fact("nmArmedForcesRetirementPay")), money("3000000")), iff(isStatus("mfj"), minE(max0(fact("nmArmedForcesRetirementPaySpouse")), money("3000000")), money("0"))),
  },
  {
    id: "us.nm.medical_expense_exemption_65",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico medical care expense exemption for persons 65 or older — $3,000 when unreimbursed medical care expenses paid in the year are $28,000 or more (PIT-ADJ line 18)",
    citation: {
      source: "NMSA 1978 § 7-2-5.9 (Laws 2005, ch. 104, § 6); 2025 PIT-ADJ instructions, line 18 pp. ADJ-5 to ADJ-6",
      section: "§ 7-2-5.9(A); PIT-ADJ line 18",
      url: PITADJ_URL,
      excerpt:
        "STATUTE (verbatim): 'A. Any individual sixty-five years of age or older may claim an additional exemption from income includable, except for this exemption, in net income in an amount equal to three thousand dollars ($3,000) for medical care expenses paid by the individual for that individual or for the individual's spouse or dependent during the taxable year if those medical care expenses exceed twenty-eight thousand dollars ($28,000) and if the medical care expenses are not reimbursed or compensated for by insurance or otherwise.' PIT-ADJ (line 18, verbatim): 'If you or your spouse are 65 years of age or older, and you paid unreimbursed and uncompensated medical care expenses of $28,000 or more during tax year 2025, you may be eligible to claim an exemption of $3,000. … enter $3,000 on line 18 to claim the exemption … If you are eligible to claim this exemption, you are also eligible to claim the refundable medical care credit for persons 65 years or older reported on Schedule PIT-RC, line 23.' ENCODING: $3,000 (one amount per return, as the form prints) when nmAge65Count ≥ 1 and nmMedicalExpenses ≥ $28,000 (the instructions' '$28,000 or more'; the statute says 'exceed'). Eligible expenses include amounts also itemized on federal Schedule A.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { exemption: { value: "300000", type: "money" }, expenseFloor: { value: "2800000", type: "money" } },
    formula: iff(and(ge(fact("nmAge65Count"), int("1")), ge(fact("nmMedicalExpenses"), money("2800000"))), money("300000"), money("0")),
  },
  {
    id: "us.nm.medical_care_credit_65",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico refundable medical care credit for persons 65 or older — $2,800 ($1,400 MFS) when unreimbursed medical care expenses are $28,000 or more and the filer is not someone's dependent (PIT-RC line 23)",
    citation: {
      source: "NMSA 1978 § 7-2-18.13 (Laws 2005, ch. 267, § 1); 2025 PIT-RC instructions, line 23 pp. RC-9 to RC-10",
      section: "§ 7-2-18.13(A)-(C); PIT-RC line 23",
      url: PITRC_URL,
      excerpt:
        "STATUTE (verbatim): 'A. A taxpayer who files an individual New Mexico income tax return, who is sixty-five years of age or older and who is not a dependent of another taxpayer may claim a credit in an amount equal to two thousand eight hundred dollars ($2,800) for medical care expenses paid by the taxpayer for that taxpayer or for the taxpayer's spouse or dependent if those expenses equal twenty-eight thousand dollars ($28,000) or more within a taxable year and if those expenses are not reimbursed or compensated for by insurance or otherwise. B. A husband and wife who file separate returns for a taxable year in which they could have filed a joint return may each claim only one-half of the credit that would have been allowed on a joint return. C. The credit provided in this section may be deducted from the taxpayer's income tax liability. If the credit exceeds the income tax liability for the taxable year, the excess shall be refunded to the taxpayer.' PIT-RC (line 23, verbatim): 'If you or your spouse are 65 years of age or older, and you paid unreimbursed and uncompensated medical care expenses of $28,000 or more during tax year 2025, you may claim a tax credit of $2,800. … To qualify … You are not eligible to be claimed as a dependent of another taxpayer for 2025. If you qualify for the credit, enter $2,800. Married couples filing separate returns may each claim one-half of the credit ($1400) that would have been allowed on a joint return.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { credit: { value: "280000", type: "money" }, creditMfs: { value: "140000", type: "money" }, expenseFloor: { value: "2800000", type: "money" } },
    formula: iff(
      and(ge(fact("nmAge65Count"), int("1")), ge(fact("nmMedicalExpenses"), money("2800000")), not(fact("isClaimedAsDependent"))),
      iff(isMfs, money("140000"), money("280000")),
      money("0"),
    ),
  },
  {
    id: "us.nm.lictr",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico low income comprehensive tax rebate — 2025 Table 1 by modified gross income ($36,000 or less) and total exemptions (1 to 6 or more), refundable; MFS claims half (PIT-RC line 14)",
    citation: {
      source: "NMSA 1978 § 7-2-14 (as amended by Laws 2021, ch. 116, § 1 — table increased and indexed from TY2022 under subsection F, rounded down); 2025 PIT-RC instructions, Section 2 line 14 and 'Table 1. 2025 Low-Income Comprehensive Tax Rebate Table' p. RC-5; lines 1-3, 13, 13a pp. RC-3, RC-5",
      section: "§ 7-2-14(A)-(H); PIT-RC lines 1-3, 13, 13a, 14",
      url: PITRC_URL,
      excerpt:
        "STATUTE (verbatim): 'A. … any resident who files an individual New Mexico income tax return and who is not a dependent of another individual may claim a tax rebate for a portion of state and local taxes to which the resident has been subject during the taxable year … The tax rebate may be claimed even though the resident has no income taxable under the Income Tax Act. Married individuals who file separate returns for a taxable year in which they could have filed a joint return may each claim only one-half of the tax rebate that would have been allowed on a joint return. B. No claim … shall be filed by a resident who was an inmate of a public institution for more than six months during the taxable year … or who was not physically present in New Mexico for at least six months during the taxable year … C. … the total number of exemptions for which a tax rebate may be claimed or allowed is determined by adding the number of federal exemptions allowable … for each individual included in the return who is domiciled in New Mexico plus two additional exemptions for each individual … who is sixty-five years of age or older plus one additional exemption for each individual … who, for federal income tax purposes, is blind … E. If a taxpayer's modified gross income is zero, the taxpayer may claim a credit in the amount shown in the first row of the table … F. For the 2022 taxable year and each subsequent taxable year, the amount of rebate shown in the table in Subsection D of this section shall be adjusted to account for inflation. … The result of the multiplication shall be rounded down to the nearest one dollar ($1.00) … G. … If the tax rebates exceed the taxpayer's income tax liability, the excess shall be refunded to the taxpayer.' The statute's 2021 base row is '$0 $1,000: $195 $260 $325 $390 $455 $520'. PIT-RC 2025 TABLE 1 (verbatim rows, 'Modified gross Income … But not over' × 'Number of Exemptions … 1 2 3 4 5 6 or more'): '0 1,000: 224 298 373 448 522 597; 1,001 1,500: 252 362 465 580 655 775; 1,501 2,500: 252 362 465 580 655 810; 2,501 7,500: 252 362 465 580 655 839; 7,501 8,000: 235 356 448 568 660 839; 8,001 9,000: 212 327 431 551 660 804; 9,001 10,000: 195 287 390 488 586 764; 10,001 11,500: 166 241 316 413 511 689; 11,501 13,000: 149 212 270 339 419 551; 13,001 14,500: 132 195 252 316 362 448; 14,501 16,500: 120 178 212 270 327 385; 16,501 18,000: 114 149 189 241 287 344; 18,001 19,500: 103 132 166 206 252 298; 19,501 21,000: 91 120 160 189 212 264; 21,001 23,000: 91 120 160 189 212 264; 23,001 24,500: 86 114 137 166 195 224; 24,501 26,000: 74 103 132 160 178 206; 26,001 27,500: 63 91 120 149 160 195; 27,501 29,500: 57 86 114 132 149 178; 29,501 31,000: 45 63 91 114 132 149; 31,001 32,500: 40 57 74 91 114 120; 32,501 34,000: 28 45 57 74 91 103; 34,001 36,000: 17 40 45 63 74 86' (each cell = the 2021 statutory cell × the CPI ratio, rounded down). PIT-RC (line 14, verbatim): 'To qualify for this rebate, all of the following must be true: You have a modified gross income of $36,000 or less. You were a resident of New Mexico during the tax year. You were physically present in New Mexico for at least six months in 2025. You are not eligible to be claimed as a dependent of another taxpayer for 2025. You were not an inmate of a public institution for more than six months in 2025. … Married couples filing separate returns divide this amount by 2 and then enter the result on PIT-RC, line 14.' MODIFIED GROSS INCOME (§ 7-2-2(L)-(M); PIT-RC lines 4-12): 'all income of the taxpayer and, if any, the taxpayer's spouse and dependents, undiminished by losses and from whatever source' incl. Social Security, public assistance, gifts — a transcribed input (nmModifiedGrossIncome). EXEMPTIONS (line 13a = line 3): PIT-1 line 5 exemptions minus non-qualifying household members, plus 1 per blind person and 2 per person 65 or older (nmRebateExemptions). ENCODING: $0 when MGI > $36,000, when nmRebateExemptions is 0, or when the filer is claimed as a dependent; the column is min(exemptions, 6); MFS takes half, rounded half-up to whole dollars. The 2026 table (CPI-adjusted) is unpublished — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { mgiLimit: { value: "3600000", type: "money" }, maxExemptionsColumn: { value: "6", type: "int" } },
    formula: (() => {
      const ex = fact("nmRebateExemptions");
      const pick = (row: readonly number[]): Expr => {
        // columns for 1, 2, 3, 4, 5, 6-or-more exemptions
        let e: Expr = dollars(row[7]);
        for (let n = 5; n >= 1; n--) e = iff(le(ex, int(String(n))), dollars(row[n + 1]), e);
        return e;
      };
      const table = rowLookup(fact("nmModifiedGrossIncome"), NM_LICTR_2025, pick, money("0"));
      const eligible = and(not(fact("isClaimedAsDependent")), ge(ex, int("1")), le(fact("nmModifiedGrossIncome"), money("3600000")));
      return iff(eligible, iff(isMfs, rd(pct(table, "1", "2")), table), money("0"));
    })(),
  },
  {
    id: "us.nm.working_families_credit",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico working families tax credit — 25% of the federal earned income credit (or the EIC the filer would get but for the SSN or age-25 rules), refundable (PIT-1 line 25)",
    citation: {
      source: "NMSA 1978 § 7-2-18.15 (as amended by Laws 2021, ch. 116, § 2: 25% for taxable years beginning on or after January 1, 2023); 2025 PIT-1 instructions, lines 25, 25a, 25b pp. PIT-1-29",
      section: "§ 7-2-18.15(A)-(E); PIT-1 lines 25, 25a, 25b",
      url: PIT1_URL,
      excerpt:
        "STATUTE (verbatim): 'A. A taxpayer who is a resident and who files an individual New Mexico income tax return may claim a credit in an amount equal to twenty percent for taxable years beginning on or after January 1, 2021, and twenty-five percent for taxable years beginning on or after January 1, 2023, of the federal earned income tax credit for which that taxpayer is eligible for the same taxable year or would have been eligible but for the identification number requirement pursuant to 26 U.S.C. 32(m) … B. A taxpayer who is a resident … may claim a credit in an amount equal to … twenty-five percent … of the federal earned income tax credit for which that taxpayer would have been eligible for the same taxable year but for the age requirement pursuant to 26 U.S.C. 32(c)(1)(A)(ii)(II) …; provided that the taxpayer is at least eighteen years of age but has not reached the age of twenty-five. … D. … If the credit exceeds the individual's income tax liability for the taxable year, the excess shall be refunded to the individual.' PIT-1 (verbatim): 'The credit is 25% of the Earned Income Credit (EIC) … for which you are eligible the same tax year. … Line 25a. Enter the amount of federal earned income credit (EIC) reported on your 2025 federal income tax return or calculated under NM Expansion … Line 25. Multiply the amount on line 25a by 0.25 (25%) and round the result to the nearest dollar.' Input nmFederalEic = Form 1040 line 27 (or the NM Expansion amount from the federal EIC worksheet).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "25", type: "int" } },
    formula: rd(pct(max0(fact("nmFederalEic")), "25", "100")),
  },
  {
    id: "us.nm.child_income_tax_credit",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico child income tax credit — 2025 amount per qualifying child by AGI ($637 to $25,000, $424 to $50,000, $212 to $75,000, $106 to $100,000, $79 to $200,000, $53 to $350,000, $26 above), refundable; MFS claims half (PIT-RC line 25)",
    citation: {
      source: "NMSA 1978 § 7-2-18.34 (Laws 2022, ch. 47, § 5; as amended by Laws 2023, ch. 211, § 9 — $600/$400/$200 base rows and annual inflation adjustment from TY2024, rounded down); 2025 PIT-RC instructions, line 25 worksheet and 'Table 4. 2025 Child Income Tax Credit Income Table' pp. RC-10 to RC-11",
      section: "§ 7-2-18.34(A)-(G), (J); PIT-RC line 25",
      url: PITRC_URL,
      excerpt:
        "STATUTE (verbatim): 'A. For taxable years prior to January 1, 2032, a taxpayer who is a resident and is not a dependent of another individual may apply for, and the department may allow, a credit … for each qualifying child of the taxpayer. … B. … Adjusted gross income is Over / But not over — Amount of credit per qualifying child is: $0 $25,000 $600; 25,000 50,000 400; 50,000 75,000 200; 75,000 100,000 100; 100,000 200,000 75; 200,000 350,000 50; 350,000 — 25. C. If a taxpayer's adjusted gross income is less than zero, the taxpayer may claim a tax credit in the amount shown in the first row … D. For the 2024 taxable year and each subsequent taxable year, the amount of credit shown in the table … shall be adjusted to account for inflation. … rounded down to the nearest one dollar ($1.00) … F. That portion of a child income tax credit that exceeds a taxpayer's tax liability in the taxable year in which the credit is claimed shall be refunded. G. Married individuals filing separate returns … may each claim only one-half of the child income tax credit that would have been claimed on a joint return. … J. (2) \"qualifying child\" means \"qualifying child\" as defined by Section 152(c) of the Internal Revenue Code … but includes any minor child or stepchild of the taxpayer who would be a qualifying child … if the public assistance contributing to the support of the child or stepchild was considered to have been contributed by the taxpayer.' PIT-RC TABLE 4 (verbatim, 2025 inflation-adjusted): 'Adjusted Gross Income from PIT-1, Line 9 — But Not Over — Amount of credit per qualifying child is: $0 $25,000 $637; 25,001 50,000 424; 50,001 75,000 212; 75,001 100,000 106; 100,001 200,000 79; 200,001 350,000 53; 350,001 — 26'. WORKSHEET: '1. Enter Adjusted Gross Income from PIT-1, Line 9. 2. Using Table 4 … find the row that includes the adjusted gross income … If the adjusted gross income is less than zero, use the amount shown in the first row of the table. If the adjusted gross income is more than $350,000 use the amount shown in the last row of the table. 3. Enter total number of qualifying children. 4. Multiply line 2 by line 3. This is your Child Income Tax Credit.' 'To qualify … You were a resident of New Mexico during the tax year. You are not eligible to be claimed as a dependent of another taxpayer for 2025.' Statuses: the same table for every filing status; MFS halves the result. The 2026 table (CPI-adjusted) is unpublished — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      row1: { value: "63700", type: "money" },
      row2: { value: "42400", type: "money" },
      row3: { value: "21200", type: "money" },
      row4: { value: "10600", type: "money" },
      row5: { value: "7900", type: "money" },
      row6: { value: "5300", type: "money" },
      row7: { value: "2600", type: "money" },
    },
    formula: (() => {
      const agi = fact("nmAgi");
      let per: Expr = dollars(NM_CHILD_CREDIT_2025[NM_CHILD_CREDIT_2025.length - 1][2]);
      for (let i = NM_CHILD_CREDIT_2025.length - 2; i >= 0; i--) per = iff(le(agi, dollars(NM_CHILD_CREDIT_2025[i][1] as number)), dollars(NM_CHILD_CREDIT_2025[i][2]), per);
      const total = mulInt(per, fact("nmQualifyingChildren"));
      return iff(fact("isClaimedAsDependent"), money("0"), iff(isMfs, rd(pct(total, "1", "2")), total));
    })(),
  },
  {
    id: "us.nm.property_tax_rebate_65",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico property tax rebate for persons 65 or older — property tax billed (plus 6% of rent) over the maximum liability for the filer's modified gross income (MGI $16,000 or less), capped at $250 ($125 MFS), refundable (PIT-RC lines 15-17c)",
    citation: {
      source: "NMSA 1978 § 7-2-18(A)-(F), (H)-(I); 2025 PIT-RC instructions, Section 3 lines 15-17c and 'Table 2. 2025 Maximum Property Tax Liability Table' pp. RC-5 to RC-6",
      section: "§ 7-2-18; PIT-RC lines 15, 16a-16c, 17a-17c",
      url: PITRC_URL,
      excerpt:
        "STATUTE (verbatim): 'A. Any resident who has attained the age of sixty-five and files an individual New Mexico income tax return and is not a dependent of another individual may claim a tax rebate … The tax rebate shall be the amount of property tax due on the resident's principal place of residence for the taxable year that exceeds the property tax liability indicated by the table in Subsection F … based upon the taxpayer's modified gross income. B. Any resident otherwise qualified under this section who rents a principal place of residence from another person may calculate the amount of property tax due by multiplying the gross rent for the taxable year by six percent. … E. A husband and wife who file separate returns … may each claim only one-half of the tax rebate that would have been allowed on a joint return. F. … ELDERLY HOMEOWNERS' MAXIMUM PROPERTY TAX LIABILITY TABLE — Taxpayers' Modified Gross Income Over / But Not Over — Property Tax Liability: $0 $1,000 $20; 1,000 2,000 25; 2,000 3,000 30; 3,000 4,000 35; 4,000 5,000 40; 5,000 6,000 45; 6,000 7,000 50; 7,000 8,000 55; 8,000 9,000 60; 9,000 10,000 75; 10,000 11,000 90; 11,000 12,000 105; 12,000 13,000 120; 13,000 14,000 135; 14,000 15,000 150; 15,000 16,000 180. … H. If a taxpayer's modified gross income is zero, the taxpayer may claim a tax rebate based upon the amount shown in the first row of the appropriate table. The tax rebate provided for in this section shall not exceed two hundred fifty dollars ($250) per return, and, if a return is filed separately that could have been filed jointly, the tax rebate shall not exceed one hundred twenty-five dollars ($125). No tax rebate shall be allowed any taxpayer whose modified gross income exceeds sixteen thousand dollars ($16,000) …' PIT-RC (verbatim): 'LINE 16c. Multiply line 16a by 0.06, and enter the product in 16c. … LINE 17c. Subtract the amount on line 17b from the amount on line 17a. … If the amount is less than zero, enter 0. If the amount is $250 or over, enter $250 (the maximum allowed). Married Couples Filing Separately … Subtract line 17b … from line 17a …, and then divide the difference by 2. Enter this amount on line 17c. If the amount is less than zero, enter 0. If the amount is $125 or over, enter $125.' Table 2 prints the ranges as 0-1,000, 1,001-2,000, …, 15,001-16,000. The Subsection G county-resolution table ($300 liability to $25,000 MGI) is not used on the 2025 PIT-RC. ENCODING: $0 unless nmAge65Count ≥ 1, MGI ≤ $16,000, and not claimed as a dependent; line 17a = property tax billed + round(6% × rent); rebate = min(max0(17a − liability), $250), or for MFS min(round((17a − liability) ÷ 2), $125).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { mgiLimit: { value: "1600000", type: "money" }, rentPct: { value: "6", type: "int" }, cap: { value: "25000", type: "money" }, capMfs: { value: "12500", type: "money" } },
    formula: (() => {
      const mgi = fact("nmModifiedGrossIncome");
      const l17a = add(rd(max0(fact("nmPropertyTaxBilled"))), dollarsFromScaled(times(max0(fact("nmRentPaid")), "600"), "1000000")); // line 16c: 6% of rent, ONE rounding to whole dollars
      const liability = rowLookup(mgi, NM_PROPERTY_TAX_LIABILITY_2025, (row) => dollars(row[2]), money("0"));
      const diff = max0(sub(l17a, liability));
      const eligible = and(ge(fact("nmAge65Count"), int("1")), le(mgi, money("1600000")), not(fact("isClaimedAsDependent")));
      return iff(eligible, iff(isMfs, minE(rd(pct(diff, "1", "2")), money("12500")), minE(diff, money("25000"))), money("0"));
    })(),
  },
  {
    id: "us.nm.county_property_tax_rebate",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico additional low income property tax rebate for Los Alamos, Santa Fe, Doña Ana, or Bernalillo County residents — 75% to 35% of property tax billed by modified gross income (MGI $24,000 or less), capped at $350 ($175 MFS), refundable (PIT-RC lines 18a-18c)",
    citation: {
      source: "NMSA 1978 § 7-2-14.3 (local option low-income property tax rebate; the county funding election is § 7-2-14.4); 2025 PIT-RC instructions, Section 4 lines 18a-18c and 'Table 3. 2025 Low Income Property Tax Rebate Table for Los Alamos County, Santa Fe County, Doña Ana County, or Bernalillo County Residents Only' pp. RC-6 to RC-7",
      section: "§ 7-2-14.3; PIT-RC lines 18a, 18b, 18c",
      url: PITRC_URL,
      excerpt:
        "PIT-RC (verbatim): 'This low income property tax rebate is for property tax paid during tax year 2025 on your principal place of residence … in Los Alamos County, Santa Fe County, Doña Ana County, or Bernalillo County. This property tax rebate may not exceed $350 or, for a married taxpayer filing a separate return, $175. … No Age Limit … To qualify for the rebate, all of the following must be true: You have a principal place of residence in Los Alamos County, Santa Fe County, Doña Ana County, or Bernalillo County. You have a modified gross income of $24,000 or less. You were a resident of New Mexico during the tax year. You were physically present in New Mexico for at least six months in 2025. You were not eligible to be claimed as an other dependent of another taxpayer for 2025. You were not an inmate of a public institution for more than six months in 2025. … a principal place of residence does not include rented land or structures. Table 3 … Modified Gross Income from PIT-RC, Line 13 — But Not Over — Property Tax Rebate Percentage (of property tax liability): 0 8,000 75%; 8,001 10,000 70%; 10,001 12,000 65%; 12,001 14,000 60%; 14,001 16,000 55%; 16,001 18,000 50%; 18,001 20,000 45%; 20,001 22,000 40%; 22,001 24,000 35%. LINE 18c. Multiply the percentage on line 18b … by the amount on line 18a (allowable property tax billed). … If the amount is $350 or over, enter $350 (the maximum allowed). Married Couples Filing Separately … Multiply 18a by 18b, and then divide the product by 2. … If the amount is $175 or over, enter $175. Example. The property tax billed to Los Alamos County Resident A on her principal place of residence was $800 … Because her modified gross income for 2025 was $19,000, Resident A enters on line 18b the property tax rebate percentage of 45%. … $800 by 0.45 … The result is $360, but because the maximum rebate allowable is $350, she enters $350 on line 18c.' ENCODING: $0 unless nmRebateCounty (a principal residence OWNED in one of the four counties) and MGI ≤ $24,000 and not claimed as a dependent; rebate = min(round(pct × tax billed), $350) or for MFS min(round(pct × tax ÷ 2), $175). Stacks with the 65-or-older rebate (§ 7-2-18).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { mgiLimit: { value: "2400000", type: "money" }, cap: { value: "35000", type: "money" }, capMfs: { value: "17500", type: "money" } },
    formula: (() => {
      const mgi = fact("nmModifiedGrossIncome");
      const billed = max0(fact("nmPropertyTaxBilled"));
      const amount = rowLookup(mgi, NM_COUNTY_PROPERTY_REBATE_PCT_2025, (row) => pct(billed, String(row[2]), "100"), money("0"));
      const eligible = and(fact("nmRebateCounty"), le(mgi, money("2400000")), not(fact("isClaimedAsDependent")));
      return iff(eligible, iff(isMfs, minE(rd(pct(amount, "1", "2")), money("17500")), minE(rd(amount), money("35000"))), money("0"));
    })(),
  },
  {
    id: "us.nm.parameters",
    version: 1,
    jurisdiction: "us.nm",
    title: "New Mexico 2025 Form PIT-1 parameters — line structure, PIT-ADJ additions and deductions, PIT-RC rebates and credits, PIT-CR, lump-sum averaging, the other-state credit worksheet, penalties, and the 2026 status",
    citation: {
      source: "2025 PIT-1, PIT-ADJ, PIT-RC, PIT-CR instructions and forms; NMSA 1978 §§ 7-2-2, 7-2-7(D), 7-2-13, 7-2-18.1, 7-2-18.16, 7-2-12.2; TRD Legislative Summaries 2025 (LS-2025, Rev 12/10/2025) and 2026 (LS-2026, 04/13/2026); Laws 2025, ch. 130 (HB 218: due date, reporting clauses, repealed credits); Laws 2026, ch. 69 (new PIT credits from TY2027); web-verified September 2026",
      section: "Form PIT-1 lines 1-42; PIT-ADJ lines 1-28; PIT-RC lines 1-26",
      url: PIT1_URL,
      excerpt:
        "STRUCTURE (printed 2025 PIT-1): 5 EXEMPTIONS ('Taxpayer, spouse, dependents, and other dependents reported on federal Form 1040. If you are a dependent or other dependent of another taxpayer, enter 00'); 7 FILING STATUS (1) Single (2) Married filing jointly (3) Married filing separately (4) Head of household (5) Surviving Spouse — 'Use the same filing status on your PIT-1 that you used on your federal return'; 8 dependents; 9 FEDERAL ADJUSTED GROSS INCOME (1040 line 11); 10 itemized state and local tax add-back (→ us.nm.salt_addback); 11 total additions (PIT-ADJ line 6: federal tax-exempt bond interest, federal NOL carryover, refunded/rolled-out NM 529 contributions, land-conservation charitable deduction, PTE withholding paid); 12 federal standard or itemized deduction (1040 line 12; mark 12a if itemized); 13 deduction for certain dependents (→ us.nm.dependents_deduction); 14 low- and middle-income exemption (→ us.nm.low_middle_income_exemption); 15 total deductions and exemptions (PIT-ADJ line 28: 7 NM tax-exempt interest, 8 NM NOL carryforward, 9 U.S. obligation interest, 10 Railroad Retirement, 11 tribal-land income, 12 centenarians, 13 65-or-older/blind (→ us.nm.age65_blind_exemption), 14 NM medical savings account, 15 NM 529 contributions, 16 net capital gains (→ us.nm.capital_gains_deduction), 17 active-duty pay (100%, § 7-2-5.11), 18 medical expense exemption 65+ (→ us.nm.medical_expense_exemption_65), 19 organ donation ≤ $10,000, 20 National Guard life insurance reimbursement, 21 taxable state/local refunds (Schedule 1 line 1), 22 nonresident USPHS pay, 23 liquor license lessor ≤ $50,000 (§ 7-2-40: available only for taxable years prior to January 1, 2026), 24 armed forces retirement (→ us.nm.armed_forces_retirement_exemption), 25 Social Security (→ us.nm.social_security_exemption), 26 cannabis § 280E expenses, 27 teacher school supplies ≤ $1,000); 16 reserved; 17 NEW MEXICO TAXABLE INCOME = 9 + 10 + 11 − 12 − 13 − 14 − 15, not less than zero; 18 tax (→ us.nm.income_tax; 18a R = rate tables, B = PIT-B); 19 lump-sum distribution tax — 'Line 19. Worksheet': 1 taxable income; 2 lump-sum amount from federal Form 4972; 3 = 20% of 2; 4 = 1 + 3; 5 tax on 4; 6 tax on 1; 7 = 5 − 6; 8 = 7 × 5 (§ 7-2-7(D): 'five multiplied by the difference'); 20 credit for taxes paid to another state — 'Line 20. Worksheet': column 1 New Mexico / column 2 the other state: 1 tax due to the state; 2 taxable income on which it was computed (New Mexico: PIT-1 line 17); 3 = 1 ÷ 2 'to four decimal places'; 4 the income taxed in both states, 'but not more than the amount on line 2'; 5 = 3 × 4; 6 = 'the lesser of line 5, column 1 and line 5, column 2, but not more than the amount in column 1, line 1' (§ 7-2-13: not for taxes paid to a municipality, county, or other political subdivision); 21 PIT-CR nonrefundable business credits (line A) — 'The sum of credits claimed on this PIT-CR and the credit for taxes paid to another state … may not exceed the sum of PIT-1, lines 18 and 19'; 22 NET NEW MEXICO INCOME TAX = max0(18 + 19 − 20 − 21); 23 = 22; 24 PIT-RC total (line 26 = 14 LICTR (→ us.nm.lictr) + 17c property tax rebate 65+ (→ us.nm.property_tax_rebate_65) + 18c county rebate (→ us.nm.county_property_tax_rebate) + 22 child day care credit (40% of caregiver compensation ≤ $8 per day per child, ≤ $480 per child and $1,200 total, minus the federal child care credit; MGI ≤ $30,160; § 7-2-18.1) + 23 medical care credit 65+ (→ us.nm.medical_care_credit_65) + 24 special needs adopted child credit $1,500 per child ($750 MFS; § 7-2-18.16) + 25 child income tax credit (→ us.nm.child_income_tax_credit)); 25 working families tax credit (→ us.nm.working_families_credit; 25a federal EIC, 25b NM Expansion box); 26 PIT-CR refundable credits (line B); 27 New Mexico income tax withheld (W-2, W-2G, 1099); 28 oil and gas proceeds withholding; 29 pass-through entity withholding / entity-level tax; 30 2025 estimated payments incl. the 2024 overpayment applied; 31 other payments (PIT-EXT extension and PIT-PV return payments); 32 TOTAL PAYMENTS AND CREDITS = 24 through 31; 33 TAX DUE = 22 − 32 when positive; 34 underpayment-of-estimated-tax penalty (RPD-41272; § 7-2-12.2: required annual payment = lesser of 90% of this year's tax or 100% of last year's); 35 special method 1-5; 36 penalty 'multiplying the unpaid amount of tax due on line 33 by 0.02 (2%) … by the number of months or partial months … cannot exceed 20%'; 37 interest 'calculated on a daily basis at the rate established for individual income tax purposes by the IRC'; 38 TAX, PENALTY, AND INTEREST DUE = 33 + 34 + 36 + 37; 39 OVERPAYMENT = 32 − 23 when positive, reduced by lines 34, 36, 37; 40 PIT-D voluntary contributions; 41 applied to 2026 estimated tax; 42 REFUND = 39 − 40 − 41 (refunds of $1 or less are not issued without a signed request). ROUNDING: 'Round all numbers and enter only whole dollar amounts' (PIT-1-21). RESIDENCY: domiciled in New Mexico or physically present 185 days or more (§ 7-2-2(S)); part-year and nonresidents file the same PIT-1 with Schedule PIT-B (not composed). TY2026: § 7-2-7 rates, § 7-2-5.2 / 5.8 / 5.13 / 5.14 exemptions, § 7-2-34, § 7-2-39, § 7-2-18, and § 7-2-18.15 are unindexed and unchanged (Laws 2025, ch. 130 §§ 38, 51 rewrote only reporting/tax-expenditure-budget clauses effective January 1, 2026; LS-2026's personal income tax items are Laws 2026, ch. 69's new local-journalist, physician, and local-news-printer credits (applicable to taxable years beginning on or after January 1, 2027) and technical clean-ups of existing business credits — all PIT-CR inputs, none touching the PIT-1 computation), so those rules run to 2027-01-01; TY2026 form changes: the § 7-2-40 liquor license lessor deduction ends, and the ALS research check-off leaves PIT-D (Laws 2025, ch. 130); the LICTR and child income tax credit tables are CPI-adjusted (rounded down) each fall and the 2026 tables are unpublished, so us.nm.lictr and us.nm.child_income_tax_credit end 2026-01-01. Federal amounts (standard deduction, EIC, taxable Social Security) flow through as inputs, so the 2025 federal law (P.L. 119-21) is reflected automatically.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      lumpSumMultiplier: { value: "5", type: "int" },
      lumpSumInclusionPct: { value: "20", type: "int" },
      childDayCareCreditPct: { value: "40", type: "int" },
      childDayCareDailyCap: { value: "800", type: "money" },
      childDayCarePerChildCap: { value: "48000", type: "money" },
      childDayCareTotalCap: { value: "120000", type: "money" },
      childDayCareMgiLimit: { value: "3016000", type: "money" },
      specialNeedsAdoptedChildCredit: { value: "150000", type: "money" },
      organDonationDeductionCap: { value: "1000000", type: "money" },
      teacherSuppliesDeduction: { value: "100000", type: "money" },
      latePenaltyPctPerMonth: { value: "2", type: "int" },
      latePenaltyMaxPct: { value: "20", type: "int" },
      minimumRefundIssued: { value: "100", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: New Mexico Form PIT-1 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.nm.income_tax, us.nm.salt_addback, us.nm.dependents_deduction, us.nm.low_middle_income_exemption, us.nm.age65_blind_exemption, us.nm.social_security_exemption, us.nm.capital_gains_deduction, us.nm.armed_forces_retirement_exemption, us.nm.medical_expense_exemption_65, us.nm.medical_care_credit_65, us.nm.lictr, us.nm.working_families_credit, us.nm.child_income_tax_credit, us.nm.property_tax_rebate_65, and us.nm.county_property_tax_rebate",
    },
  },
];
