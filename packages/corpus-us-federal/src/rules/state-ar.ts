import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";
import {
  AR_LOW_INCOME_HOH_QSS_0_1_DEP,
  AR_LOW_INCOME_HOH_QSS_2_PLUS_DEP,
  AR_LOW_INCOME_MFJ_0_1_DEP,
  AR_LOW_INCOME_MFJ_2_PLUS_DEP,
  AR_LOW_INCOME_SINGLE,
  type LowIncomeRow,
} from "./state-ar-tables.js";

/**
 * Arkansas deep pack — TY2025 Form AR1000F (full-year resident). Every amount
 * verified from the printed 2025 Arkansas Individual Income Tax booklet
 * (AR1000F/AR1000NR instructions, 38 pp — the Low Income Tax Tables pp. 24-25,
 * the Regular Income Tax Table pp. 26-30, the Additional Tax Credit worksheet
 * p. 21), the printed 2025 AR1000F/AR3/AR1000D/AR2441/AR1000TC, DFA's "2025
 * Indexed Tax Brackets" and "2025 Tax Tables" sheets, Ark. Code §§ 26-51-201,
 * -301, -307, -430, -501, -502, -815, Act 1 of the 2024 2nd Ex. Sess. (3.9%),
 * and Acts 1-2 of the 2026 1st Ex. Sess. (3.7% for TY2026).
 *
 * Load-bearing findings:
 *  - ONE rate schedule for every filing status (no joint brackets). Married
 *    couples instead may file STATUS 4 (separately on the same return) and
 *    tax each spouse's own column; the composer compares status 2 and 4.
 *  - The Regular Income Tax Table is the statutory schedule evaluated at the
 *    ROW MIDPOINT and rounded to whole dollars ("If you use a formula to
 *    calculate Arkansas income tax, the results must match the table exactly.
 *    The calculations in the table are made at the midpoint of each income
 *    level"). Rows are [100k, 100k+100) up to the row [74,900, 75,001), then
 *    [100k+1, 100k+101) — so the midpoint is 100k+50 below $75,001 and
 *    100k+51 above. All 950 printed rows reproduce for every whole dollar.
 *  - Above $100,000 the table's own note governs: "$3,809 + 3.9% of the
 *    excess over $100,000" ($3,809 is the LAST ROW's midpoint value; the exact
 *    upper schedule at $100,000 would be $3,810.70).
 *  - The Low Income Tax Tables are a transcribed lookup on AGI (line 25) with
 *    the standard deduction built in; only statuses 1, 2, 3, 6 may use them.
 *  - TY2026: Acts 1-2 of the 2026 First Extraordinary Session cut the top rate
 *    to 3.7% (approved 5/6/2026). Because the brackets, standard deduction,
 *    low-income tables, and additional-credit table are all CPI-indexed by
 *    DFA each fall and the 2026 sheets are unpublished, every 2025 rule ends
 *    2026-01-01 (see us.ar.parameters).
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
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
const isMfj: Expr = isStatus("mfj"); // a married couple on ONE return: Arkansas status 2 (joint) or 4 (separately on the same return)
const isStatus2: Expr = and(isMfj, not(fact("arStatus4")));
const isHohQss: Expr = or(isStatus("hoh"), isStatus("qss")); // Arkansas statuses 3 and 6
const isMfs: Expr = isStatus("mfs"); // Arkansas status 5 (separate returns)
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

// DFA "2025 Indexed Tax Brackets": the standard table's "minus adjustment" column
// ($111.98 / $223.97 / $287.97 / $419.96) is exactly the cumulative schedule with
// kinks at $5,599 / $11,199 / $15,999 / $26,399 — so this schedule IS the table.
const STANDARD_TABLE_2025 = [
  { thresholdCents: "0", rateNum: "0" }, // $0 – $5,599: 0%
  { thresholdCents: "559900", rateNum: "200" }, // $5,600 – $11,199: 2%
  { thresholdCents: "1119900", rateNum: "300" }, // $11,200 – $15,999: 3%
  { thresholdCents: "1599900", rateNum: "340" }, // $16,000 – $26,399: 3.4%
  { thresholdCents: "2639900", rateNum: "390" }, // $26,400 – $94,700: 3.9%
];
// § 26-51-201(a)(3)(B) as indexed for 2025: 2% on the first $4,700, 3.9% above
// (DFA's "$89.30" adjustment for $97,801 and over = $4,700 × 1.9%)
const UPPER_TABLE_2025 = [
  { thresholdCents: "0", rateNum: "200" },
  { thresholdCents: "470000", rateNum: "390" },
];

const BOOKLET_URL = "https://www.dfa.arkansas.gov/wp-content/uploads/2025_AR1000F_and_AR1000NR_Instructions.pdf";
const BRACKETS_URL = "https://www.dfa.arkansas.gov/wp-content/uploads/2025_TaxBrackets.pdf";

/** Nested lookup over inclusive [from, to] dollar rows; below the first row → $0; above the last → not modeled */
const lowIncomeLookup = (rows: readonly LowIncomeRow[], label: string): Expr => {
  const agi = rd(fact("arAgi")); // the tables are whole-dollar rows on a whole-dollar line 25 ("Round all amounts to the nearest dollar")
  let expr: Expr = {
    kind: "unsupported",
    reason: `Arkansas Low Income Tax Table (${label}) ends at $${rows[rows.length - 1][1].toLocaleString("en-US")}: "Above $${rows[rows.length - 1][1].toLocaleString("en-US")}, use Standard or Itemized Deductions and Regular Income Tax Table" (us.ar.income_tax)`,
  };
  for (let i = rows.length - 1; i >= 0; i--) expr = iff(le(agi, dollars(rows[i][1])), dollars(rows[i][2]), expr);
  return iff(lt(agi, dollars(rows[0][0])), money("0"), expr);
};

export const arRules: Rule[] = [
  {
    id: "us.ar.income_tax",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas income tax — 2025 Regular Income Tax Table (0% / 2% / 3% / 3.4% / 3.9% at $5,600 / $11,200 / $16,000 / $26,400, the upper table with bracket adjustments from $94,701, midpoint rows) and '$3,809 + 3.9% of the excess over $100,000' above the table; one schedule for every filing status (AR1000F line 29)",
    citation: {
      source: "Ark. Code § 26-51-201(a)(3) (as amended by Act 1 of the Second Extraordinary Session of 2024) and § 26-51-201(d) (annual indexing); DFA '2025 Indexed Tax Brackets' (2025_TaxBrackets.pdf); 2025 Arkansas Individual Income Tax booklet: line 29 p. 14, 2025 Regular Income Tax Table pp. 26-30 (Rev 09/29/2025); DFA '2025 Tax Tables' (R 10/17/2025)",
      section: "§ 26-51-201(a)(3), (d); AR1000F line 29; 2025 Regular Income Tax Table",
      url: BRACKETS_URL,
      excerpt:
        "DFA 2025 INDEXED TAX BRACKETS (verbatim table 'From / Less Than or Equal To / Percentage / Minus Adjustment'): '$0 $5,599 0.00%; $5,600 $11,199 2.00% $111.98; $11,200 $15,999 3.00% $223.97; $16,000 $26,399 3.40% $287.97; $26,400 $94,700 3.90% $419.96; $94,701 $94,800 3.90% $399.30; $94,801 $94,900 3.90% $389.30; … [minus $10.00 per $100 row] … $97,701 $97,800 3.90% $99.30; $97,801 and over 3.90% $89.30. For $100,001 and over, $3,809 + 3.9% of the excess over $100,000. If you use a formula to calculate Arkansas income tax, the results must match the table exactly. The calculations in the table are made at the midpoint of each income level. EXAMPLE 1: For income level $75,900 to $76,000. ($75,900+$76,000)/2=$75,950 x .039 = $2,962.05 - $419.96 = $2,542.09 rounded to $2,542.00 Tax from table: $2,542.00 EXAMPLE 2: For income level $14,800 to $14,900. ($14,800 + $14,900)/2=$14,850 x .030 = $445.50 – $223.97 = $221.53 rounded to $222.00 Tax from table: $222.00'. STATUTE (§ 26-51-201(a)(3), 2024 base amounts before indexing, verbatim from Act 1 of 2024 2nd Ex. Sess. § 1): '(A) Every resident, individual, trust, or estate having net income less than or equal to … ($89,600) shall determine the amount of income tax due … in accordance with the table set forth below: $0 $5,299 0%; $5,300 $10,599 2%; $10,600 $15,099 3%; $15,100 $24,999 3.4%; $25,000 $89,600 3.9% (B) … net income greater than … ($89,600) … : $0 $4,500 2%; $4,501 and above 3.9% (C) … net income greater than or equal to … ($89,601) but not greater than … ($92,700) shall reduce the amount of income tax due as determined under subdivision (a)(3)(B) … by deducting a bracket adjustment amount …: $89,601 $89,700 $310; … [minus $10 per $100] …; $92,601 $92,700 $10; $92,701 and up $0'; § 26-51-201(d)(1): 'The secretary shall increase the minimum and maximum dollar amounts for each rate bracket, rounding to the nearest one hundred dollars ($100), … by the cost-of-living adjustment for each calendar year' (2025 indexed: $5,600 / $11,200 / $16,000 / $26,400 / $94,700; upper table $4,700; bracket adjustment $310 → $10 over $94,701 – $97,800 — DFA's $399.30 = $89.30 + $310). BOOKLET (line 29, verbatim): 'Using the appropriate tax table locate the tax for your income and enter here.' TABLE STRUCTURE (pp. 26-30): header 'If Your Income is / As Much As / But Less Than / YOUR TAX IS'; first row '0 5,100 0', then $100 rows … '74,900 75,001 2,503' then '75,001 75,101 2,507' — from $75,001 the printed rows run [100k+1, 100k+101) instead of [100k, 100k+100), so the midpoint is 100k+50 below $75,001 and 100k+51 from $75,001 up; every one of the 950 printed rows equals the schedule at that midpoint (either the standard table for midpoints ≤ $94,700 or the upper table minus the bracket adjustment for midpoints ≥ $94,701), rounded half-up to whole dollars — verified for all 100,000 whole-dollar incomes. ABOVE THE TABLE (p. 30, verbatim): 'PLEASE NOTE: For $100,001 and over, your tax is $3,809 + 3.9% of the excess over $100,000' — encoded as printed ($3,809 is the last row's value; the exact upper schedule at $100,000 is $3,810.70), rounded to whole dollars. STATUS: the same table applies to every filing status — 'Married couples must use the same filing status and tax table' (p. 26); a status-4 couple looks up each spouse's own line 28. Nonresidents/part-year residents (AR1000NR) prorate on lines 38A-38D — not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "200", type: "int" },
      rate2Bps: { value: "300", type: "int" },
      rate3Bps: { value: "340", type: "int" },
      topRateBps: { value: "390", type: "int" },
      bracket1Top: { value: "559900", type: "money" }, // $5,599 (0% through)
      bracket2Top: { value: "1119900", type: "money" }, // $11,199
      bracket3Top: { value: "1599900", type: "money" }, // $15,999
      bracket4Top: { value: "2639900", type: "money" }, // $26,399
      standardTableTop: { value: "9470000", type: "money" }, // $94,700
      upperTableLowBand: { value: "470000", type: "money" }, // $4,700 at 2%
      bracketAdjustmentStart: { value: "31000", type: "money" }, // $310 at $94,701-$94,800, −$10 per $100 row, $0 from $97,801
      tableTop: { value: "10000000", type: "money" }, // $100,000
      overTableBase: { value: "380900", type: "money" }, // $3,809 + 3.9% of the excess over $100,000
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      // printed-row midpoint: [100k, 100k+100) → 100k+50 through the row [74,900, 75,001); [100k+1, 100k+101) → 100k+51 from $75,001
      const unitsHi = stepUnits(sub(x, money("100")), "10000", "floor");
      const midHi: Expr = add(mulInt(money("10000"), unitsHi), money("5100"));
      const unitsLo = stepUnits(minE(x, money("7499900")), "10000", "floor");
      const midLo: Expr = add(mulInt(money("10000"), unitsLo), money("5000"));
      const mid: Expr = iff(ge(x, money("7500100")), midHi, midLo);
      // bracket adjustment (statutory form): $310 for the $100 row starting $94,701, −$10 per row, floor $0 (from $97,801)
      const k = stepUnits(sub(mid, money("9470100")), "10000", "floor");
      const bracketAdjustment: Expr = max0(sub(money("31000"), mulInt(money("1000"), k)));
      const upper: Expr = sub(scaledSchedule(mid, UPPER_TABLE_2025), times(bracketAdjustment, "10000"));
      const table: Expr = iff(
        le(mid, money("9470000")),
        dollarsFromScaled(scaledSchedule(mid, STANDARD_TABLE_2025), "1000000"),
        dollarsFromScaled(upper, "1000000"),
      );
      // "$3,809 + 3.9% of the excess over $100,000", one rounding to whole dollars
      const overTable: Expr = dollarsFromScaled(add(times(money("380900"), "10000"), times(sub(x, money("10000000")), "390")), "1000000");
      return iff(gt(x, money("10000000")), overTable, table);
    })(),
  },
  {
    id: "us.ar.low_income_tax",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas Low Income Tax Tables — tax looked up on ADJUSTED GROSS INCOME (line 25) with the standard deduction built in; five tables (single; HOH/surviving spouse with 0-1 or 2+ dependents; MFJ with 0-1 or 2+ dependents); statuses 4 and 5 and itemizers excluded (AR1000F line 29 with line 27 = 0)",
    citation: {
      source: "Ark. Code § 26-51-301 (low-income tax credit tables, indexed); 2025 Arkansas Individual Income Tax booklet: 2025 Low Income Tax Tables pp. 24-25 (p. 24 Rev 12/12/2025, p. 25 Rev 09/29/2025), line 26-27 instructions p. 14; DFA '2025 Tax Tables' (R 10/17/2025, row-for-row identical)",
      section: "§ 26-51-301; AR1000F lines 26, 27, 29; 2025 Low Income Tax Tables",
      url: BOOKLET_URL,
      excerpt:
        "QUALIFICATIONS (p. 24, verbatim): '1. Your total income from all sources (regardless of whether the income is taxable to Arkansas) must fall within the limits of the appropriate table based on your filing status. 2. Married couples must file a joint return (Filing Status 2) to qualify to use these tables. 3. If you use an exemption for military compensation, military retirement or employment related pension income, you do not qualify. 4. If you itemize your deductions, you must use the Regular Income Tax Table. 5. Find your Adjusted Gross Income from line 25, AR1000F/AR1000NR, in the appropriate table below. Your tax is to the right of this amount. Enter the tax on line 29, AR1000F/AR1000NR.' LINE 26 (p. 14, verbatim): 'If you use an exclusion for active-duty military compensation, employer-sponsored pension income, or a qualified traditional IRA distribution, you do not qualify for a Low Income Tax Table. You may elect NOT TO USE the exclusion(s) to which you are entitled and use a Low Income Tax Table if you fall within the income limits. CAUTION: If you qualify to use a Low-Income Tax Table, enter zero (0) on line 27, column A. (The Standard Deduction is already built into the table.)' TABLES (columns 'IF YOUR ADJUSTED GROSS INCOME IS FROM / TO / YOUR TAX IS', $100 rows after a short first row; verbatim first, second and last rows): Single (FILING STATUS 1): '0 14,643 0; 14,644 14,700 29; 14,701 14,800 33; … 17,401 17,500 222 *Above $17,500, use Standard or Itemized Deductions and Regular Income Tax Table'. Head of Household/Surviving Spouse with 1 or No Dependents (FILING STATUS 3 or 6): '0 20,820 0; 20,821 20,900 67; 20,901 21,000 77; … 25,201 25,300 481 *Above $25,300 …'. Head of Household/Surviving Spouse with 2 or More Dependents (FILING STATUS 3 or 6): '0 24,818 0; 24,819 24,900 94; 24,901 25,000 107; … 28,901 29,000 603 *Above $29,000 …'. Married Filing Joint (FILING STATUS 2) With One or No Dependents: '0 24,695 0; 24,696 24,700 77; 24,701 24,800 87; … 28,901 29,000 524 *Above $29,000 …'. Married Filing Joint (FILING STATUS 2) With Two or More Dependents: '0 29,722 0; 29,723 29,800 111; 29,801 29,900 122; … 36,001 36,100 790 *Above $36,100 use Standard or Itemized Deductions and Regular Income Tax Table'. All 224 rows are transcribed in state-ar-tables.ts and proven against the booklet AND the standalone DFA sheet (test/ar-tables.test.ts). The tables are NOT a formula: the statute publishes them as a 'low-income tax credit' schedule indexed under § 26-51-301(e). AGI is rounded to whole dollars before the lookup (booklet p. 12: 'Round all amounts to the nearest dollar'). Statuses 4 and 5 (married filing separately on the same or different returns) and AGI above a table's last row are refused (NOT_MODELED) — use us.ar.income_tax on line 28. A federal QSS is Arkansas Filing Status 6 (Surviving Spouse) and shares the HOH tables. NOTE the booklet's 'Who Must File' threshold for MFJ with 2+ dependents prints $28,723 (p. 10) while this table's first taxable row starts at $29,723 — the table governs the tax.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      singleTop: { value: "1750000", type: "money" }, // $17,500
      hohQss01DepTop: { value: "2530000", type: "money" }, // $25,300
      hohQss2PlusDepTop: { value: "2900000", type: "money" }, // $29,000
      mfj01DepTop: { value: "2900000", type: "money" }, // $29,000
      mfj2PlusDepTop: { value: "3610000", type: "money" }, // $36,100
      singleZeroRowTop: { value: "1464300", type: "money" }, // $14,643
      hohQss01DepZeroRowTop: { value: "2082000", type: "money" },
      hohQss2PlusDepZeroRowTop: { value: "2481800", type: "money" },
      mfj01DepZeroRowTop: { value: "2469500", type: "money" },
      mfj2PlusDepZeroRowTop: { value: "2972200", type: "money" },
    },
    formula: (() => {
      const twoPlus: Expr = ge(fact("arDependents"), int("2"));
      const refused: Expr = {
        kind: "unsupported",
        reason:
          "Arkansas Low Income Tax Tables are for Filing Status 1, 2, 3, and 6 only — 'Married couples must file a joint return (Filing Status 2) to qualify'; status 4 (separately on the same return) and status 5 (separate returns) use the Regular Income Tax Table (us.ar.income_tax)",
      };
      return iff(
        isStatus("single"),
        lowIncomeLookup(AR_LOW_INCOME_SINGLE, "Single"),
        iff(
          isHohQss,
          iff(twoPlus, lowIncomeLookup(AR_LOW_INCOME_HOH_QSS_2_PLUS_DEP, "HOH/Surviving Spouse, 2+ dependents"), lowIncomeLookup(AR_LOW_INCOME_HOH_QSS_0_1_DEP, "HOH/Surviving Spouse, 0-1 dependents")),
          iff(isStatus2, iff(twoPlus, lowIncomeLookup(AR_LOW_INCOME_MFJ_2_PLUS_DEP, "MFJ, 2+ dependents"), lowIncomeLookup(AR_LOW_INCOME_MFJ_0_1_DEP, "MFJ, 0-1 dependents")), refused),
        ),
      );
    })(),
  },
  {
    id: "us.ar.standard_deduction",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas standard deduction — $2,470 per taxpayer ($4,940 on a status-2 joint return; $2,470 per column for status 4; $2,470 for single, HOH, surviving spouse, and separate returns), limited to the column's AGI (AR1000F line 27)",
    citation: {
      source: "Ark. Code § 26-51-430(b)-(c) ($2,200 per taxpayer indexed by CPI, rounded to $10); 2025 Arkansas Individual Income Tax booklet, 'Standard Deduction' table p. 14; printed AR1000F line 26-27",
      section: "§ 26-51-430; AR1000F line 27",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (p. 14, verbatim): 'The Standard Deduction for your filing status is shown below. (If the amount on line 25 is less than the Standard Deduction, enter the amount from line 25 on line 27.) Filing Status / Standard Deduction: 1 Single $2,470; 2 Married Filing Joint $4,940; 3 Head of Household $2,470; 4 Married Filing Separately on Same Return $2,470 each; 5 Married Filing Separately on Different Returns $2,470; 6 Surviving Spouse $2,470. NOTE: The $2,470 Standard Deduction does not apply to taxpayer's dependent(s).' STATUTE (verbatim): '(a)(1) In lieu of itemizing deductions, each taxpayer may elect to use the standard deduction. (2) In the case of a married couple, both spouses must elect to use the standard deduction or both spouses must claim itemized deductions, without regard to whether the spouses file separate returns or file separately on the same return. (b)(1) The standard deduction shall be: … (B) For tax years beginning on and after January 1, 2015, two thousand two hundred dollars ($2,200) per taxpayer. … (c)(1) The Secretary of the Department of Finance and Administration shall increase annually the standard deduction provided under subsection (b) of this section by the cost-of-living adjustment for the current calendar year, rounding the amount to the nearest ten dollars ($10.00). (2)(A)(i) … the percentage, if any, by which the Consumer Price Index for the current calendar year exceeds the Consumer Price Index for the preceding calendar year, not to exceed three percent (3%)' — indexed to $2,470 for TY2025 (DFA's 2026 withholding formula also carries $2,470, but the 2026 AR1000F amount is unpublished). The rule caps at the column's AGI per the parenthetical; a status-4 return evaluates each spouse's column with arStatus4 = true (the joint $4,940 applies only to status 2).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perTaxpayer: { value: "247000", type: "money" },
      jointStatus2: { value: "494000", type: "money" },
    },
    formula: minE(iff(isStatus2, money("494000"), money("247000")), max0(fact("arAgi"))),
  },
  {
    id: "us.ar.personal_tax_credits",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas personal tax credits — $29 for yourself, $29 for a spouse on the same return (status 2 or 4), $29 for head of household or surviving spouse, $29 per 65-or-over / 65 Special / blind / deaf box, and $29 per dependent (AR1000F lines 7A-7C → 34)",
    citation: {
      source: "Ark. Code § 26-51-501(a)(1)-(3), (d), (e) ($20 'adjusted individual credit' / $40 'adjusted joint credit', indexed to $29 / $58) and § 26-51-307(d) ('65 Special'); 2025 Arkansas Individual Income Tax booklet, lines 7A-7C p. 12; printed AR1000F page 1",
      section: "§ 26-51-501; § 26-51-307(d); AR1000F lines 7A, 7B, 7C, 34",
      url: BOOKLET_URL,
      excerpt:
        "FORM (page 1, verbatim): '7A. Yourself / 65 or over / 65 Special / Blind / Deaf / Head of household/surviving spouse (Filing status 3 only) (Filing status 6 only); Spouse / 65 or over / 65 Special / Blind / Deaf — Multiply number of boxes checked … X $29 = … 7B. Multiply number of DEPENDENTS from above … X $29 = … 7C. TOTAL PERSONAL TAX CREDITS: (Add lines 7A and 7B. Enter total here and on line 34)'. BOOKLET (p. 12, verbatim): 'LINE 7A. Each taxpayer and spouse is entitled to one personal tax credit. You can claim additional personal tax credits if you can answer \"Yes\" to any of these questions: Is your filing status Head of Household or Surviving Spouse? On January 1, 2026, were you age 65 or over? On December 31, 2025, were you deaf? On December 31, 2025, were you blind? Check the box or boxes that apply to you and/or your spouse. You CANNOT claim any of these credits for your children or dependents. … Any taxpayer age 65 or over not claiming a retirement income exemption on line 18 is eligible for an additional $29 (per taxpayer) tax credit. Check the box(es) marked \"65 Special\". Add the number of boxes you checked on line 7A. Write the total in the box provided. Multiply the number by $29 … LINE 7B. List the name(s) of your dependent(s) … DO NOT INCLUDE YOURSELF AND/OR YOUR SPOUSE. … Multiply the number by $29'. STATUTE (§ 26-51-501, verbatim): '(a)(1)(A) For a single individual, the adjusted individual credit. (B) However, a taxpayer who was blind or deaf at any time during the income year shall be entitled to an additional tax credit of twenty dollars ($20.00). … (D) A single individual of sixty-five (65) years of age or older shall be entitled to an additional tax credit of twenty dollars ($20.00); (2)(A)(i)(a) For the head of household, surviving spouse, or married spouses living together, the adjusted joint credit. (b) Spouses living together and filing either jointly or separately on the same income tax form shall receive only one (1) adjusted joint credit against their aggregate tax. … (C) However, a spouse filing a separate return on a separate tax form shall receive the adjusted individual credit on each return so filed … (3)(A) For each individual, other than a spouse, who … is dependent upon and receives his or her chief support from the taxpayer, the adjusted individual credit. … (d)(1) \"Adjusted individual credit\" shall be twenty dollars ($20.00); and (2) \"Adjusted joint credit\" shall be forty dollars ($40.00). (e)(1)(A) Not later than July 15 of each calendar year, the Secretary … shall increase the adjusted individual credit and adjusted joint credit by the cost-of-living adjustment … rounding each amount to the nearest dollar' (indexed: $29 / $58). § 26-51-307(d)(1): 'An individual who is sixty-five (65) years of age or older and who does not claim an exemption under subsection (a) of this section is entitled to an additional state income tax credit of twenty dollars ($20.00)' (the '65 Special' box, indexed to $29). ENCODING: $29 × (1 + [married, status 2 or 4] + [HOH or surviving spouse] + arCreditBoxes + arDependents); arCreditBoxes counts the 65-or-over / 65 Special / blind / deaf boxes for the taxpayer and spouse (at most 4 per person; the rule clamps an unmarried filer at 4). Nonrefundable: 'If Total Credits on line 37 is more than \"Total Tax\" on line 33, the difference is not refundable' (p. 15).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perCredit: { value: "2900", type: "money" }, // $29
      jointCredit: { value: "5800", type: "money" }, // $58 (self + spouse, or self + HOH/QSS)
    },
    formula: (() => {
      const boxes: Expr = iff(and(not(isMfj), gt(fact("arCreditBoxes"), int("4"))), int("4"), fact("arCreditBoxes"));
      return add(
        money("2900"),
        iff(isMfj, money("2900"), money("0")),
        iff(isHohQss, money("2900"), money("0")),
        mulInt(money("2900"), boxes),
        mulInt(money("2900"), fact("arDependents")),
      );
    })(),
  },
  {
    id: "us.ar.additional_tax_credit",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas additional tax credit for qualified individuals — $60 when net taxable income (line 28) is $26,500 or less, minus $5 per $100 (or fraction) above $26,500, $0 from $27,601; doubled on a status-2 joint return, per column for status 4 (AR1000TC line 6 → AR1000F line 36)",
    citation: {
      source: "Ark. Code § 26-51-501(a)(6) (Act 1 of the Second Extraordinary Session of 2021 § 10; table indexed under § 26-51-201(d)); 2025 Arkansas Individual Income Tax booklet, 'Additional Tax Credit for Qualified Individuals Worksheet' and table p. 21 (R 10/10/2025), 'Special Information for Tax Year 2025' p. 6; 2025 AR1000TC line 6 and instructions",
      section: "§ 26-51-501(a)(6); AR1000TC line 6; AR1000F line 36",
      url: BOOKLET_URL,
      excerpt:
        "WORKSHEET (p. 21, verbatim): 'An individual taxpayer having a net income up to $27,600 and who timely files a tax return is allowed an additional tax credit. If your net income amount on line 28 is $27,600 or less, fill out the worksheet below to determine amount of credit. Filing Status 1,3,5, and 6: 1. Enter amount from line 28 of your AR1000F or AR1000NR. 2. Find income range in the table below. Enter corresponding credit here and on line 6 of the AR1000TC. Filing Status 2: 1. Enter amount from line 28 … 2. Find your net taxable income in the table below. Enter corresponding credit here. 3. Double the credit from line 2. Enter the amount here and on line 6 of the AR1000TC. Filing Status 4: 1. Enter amount from line 28 … [1A Primary / 1B Spouse] 2. Find your net taxable income in the table below. Enter corresponding credit for each spouse here … 3. Add primary and spouse columns from line 2 above. Enter the amount here and on line 6 of the AR1000TC.' TABLE (verbatim): 'Income Range / Credit: $0 - $26,500 $60; $26,501 - $26,600 $55; $26,601 - $26,700 $50; $26,701 - $26,800 $45; $26,801 - $26,900 $40; $26,901 - $27,000 $35; $27,001 - $27,100 $30; $27,101 - $27,200 $25; $27,201 - $27,300 $20; $27,301 - $27,400 $15; $27,401 - $27,500 $10; $27,501 - $27,600 $5; $27,601 and up $0'. STATUTE (verbatim): '(6)(A) An individual taxpayer having net income up to twenty-four thousand seven hundred dollars ($24,700) who timely files a tax return is allowed an income tax credit … in accordance with the table set forth below … (B) The amount of the income tax credit … that may be claimed by the taxpayer in a tax year shall not exceed the amount of income tax due by the taxpayer. (C) The table in subdivision (a)(6)(A) of this section shall be adjusted annually in accordance with the method set forth in § 26-51-201(d).' ENCODING: per taxpayer = max($0, $60 − $5 × ceil((line 28 − $26,500) / $100)); status 2 doubles it (filingStatus mfj with arStatus4 false); for status 4 evaluate each column with arStatus4 = true and add. TIMELY FILING is a condition the composer notes. The 'shall not exceed the amount of income tax due' cap is applied by the composer through AR1000F line 38 ('If line 37 is greater than line 33, enter 0').",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxCredit: { value: "6000", type: "money" }, // $60
      fullCreditThrough: { value: "2650000", type: "money" }, // $26,500
      stepDown: { value: "500", type: "money" }, // $5 per $100
      zeroFrom: { value: "2760100", type: "money" }, // $27,601
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const steps = stepUnits(max0(sub(x, money("2650000"))), "10000", "ceil");
      const per: Expr = max0(sub(money("6000"), mulInt(money("500"), steps)));
      return iff(isStatus2, mulInt(per, int("2")), per);
    })(),
  },
  {
    id: "us.ar.child_care_credit",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas child and dependent care credit — AR2441: expenses capped at $3,000 / $6,000, limited to the smaller earned income, times the 2013-law § 21 percentage (35% falling 1 point per $2,000 of federal AGI over $15,000 to 20%), times 20% (AR1000F line 35; refundable on line 43 for an approved early childhood program)",
    citation: {
      source: "Ark. Code § 26-51-502 (§ 21 as in effect January 2, 2013; 20% of the federal credit allowable; the 20% early-childhood credit is refundable); 2025 Form AR2441 Part II lines 3-10 (R 4/28/2025); 2025 Arkansas Individual Income Tax booklet, lines 35 and 43 p. 15",
      section: "§ 26-51-502(b), (c); AR2441 lines 3-10; AR1000F lines 35, 43",
      url: "https://www.dfa.arkansas.gov/wp-content/uploads/2025_AR2441_Child_andDependentCareExpenses.pdf",
      excerpt:
        "AR2441 PART II (verbatim): '3 Add the amounts in column (c) of line 2. Do not enter more than $3,000 for one qualifying person or $6,000 for two or more persons. If you completed Part III, enter the amount from line 30. 4 Enter your earned income. See instructions. 5 If married filing status 2 or 4, enter your spouse's earned income (if you or your spouse was a student or was disabled, see the instructions); all others, enter the amount from line 4. 6 Enter the smallest of line 3, 4, or 5. 7 Enter the amount from Form 1040, 1040-SR, or 1040-NR, line 11. 8 Enter on line 8 the decimal amount shown below that applies to the amount on line 7. If line 7 is: Over / But not over / Decimal amount is: $0 – 15,000 .35; 15,000 – 17,000 .34; 17,000 – 19,000 .33; 19,000 – 21,000 .32; 21,000 – 23,000 .31; 23,000 – 25,000 .30; 25,000 – 27,000 .29; 27,000 – 29,000 .28; 29,000 – 31,000 .27; 31,000 – 33,000 .26; 33,000 – 35,000 .25; 35,000 – 37,000 .24; 37,000 – 39,000 .23; 39,000 – 41,000 .22; 41,000 – 43,000 .21; 43,000 – No limit .20. 9 Multiply line 6 by the decimal amount on line 8. 10 Multiply line 9 by .20. Enter this amount on line 35 and/or line 43 of AR1000F/AR1000NR.' Header: 'You cannot claim a credit for child and dependent care expenses if you're filing status 5 (married filing separately on different returns) unless you meet the requirements listed in the instructions under \"Married Filing Separately on Different Returns.\"' STATUTE (verbatim): '(b)(1) Title 26 U. S. C. § 21, as in effect on January 2, 2013, is adopted for purposes of determining the allowable credit … (2) The amount of credit shall be twenty percent (20%) of the federal credit allowable. (c)(1)(A)(i) A credit, which is equal to twenty percent (20%) of the federal childcare credit as allowed under 26 U. S. C. § 21, as in effect on January 2, 2013, shall be allowed to qualified individuals … (ii) The twenty-percent childcare credit is refundable. … (B) \"Qualified individual\" means a taxpayer who has a dependent child … and who incurs childcare expenses necessary for gainful employment at an approved childcare facility … (2) A taxpayer cannot claim both the credit allowed in subsections (a) and (b) of this section and the credit allowed in subsection (c) of this section.' BOOKLET (p. 15): 'If you are claiming the Early Childhood Credit on line 43, the total amounts from lines 35 and 43 cannot exceed the amount allowed on Form AR2441.' ENCODING: line 3 = min(expenses, $3,000 or $6,000 by arChildCareQualifyingPersons); line 6 = min(line 3, earned income, spouse's earned income when filingStatus is mfj); percentage = 35 − ceil(max(0, federal AGI − $15,000) / $2,000), floored at 20 (the 2013 § 21(a)(2) reduction); line 9 rounded to whole dollars, then line 10 = 20% of line 9 rounded. This is 20% of the OLD-LAW federal computation, not 20% of the current federal Form 2441 credit. Status 5 filers are refused by the composer unless considered unmarried.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pct: { value: "20", type: "int" },
      expenseCapOne: { value: "300000", type: "money" },
      expenseCapTwoPlus: { value: "600000", type: "money" },
      maxPercentage: { value: "35", type: "int" },
      minPercentage: { value: "20", type: "int" },
      phaseStart: { value: "1500000", type: "money" }, // $15,000
      phaseStep: { value: "200000", type: "money" }, // 1 point per $2,000
    },
    formula: (() => {
      const cap: Expr = iff(ge(fact("arChildCareQualifyingPersons"), int("2")), money("600000"), money("300000"));
      const l3: Expr = minE(max0(fact("arChildCareExpenses")), cap);
      const earned: Expr = max0(fact("arEarnedIncome"));
      const l6: Expr = iff(isMfj, minE(l3, earned, max0(fact("arSpouseEarnedIncome"))), minE(l3, earned));
      // percentage points as cents-denominated integers: 35 − 1 per $2,000 (or fraction) of AGI over $15,000, floor 20
      const steps = stepUnits(max0(sub(fact("arFederalAgi"), money("1500000"))), "200000", "ceil");
      const pct: Expr = maxE(sub(money("35"), mulInt(money("1"), steps)), money("20"));
      const l9: Expr = rd({ kind: "mulDiv", a: l6, b: pct, c: money("100"), round: "half-up" });
      return rd({ kind: "mulRate", base: l9, rate: { num: "20", den: "100" }, round: "half-up" });
    })(),
  },
  {
    id: "us.ar.retirement_exclusion",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas $6,000 retirement exclusion — the first $6,000 of taxable employer-plan pension and qualified traditional IRA distributions per taxpayer, reduced by any military retirement exemption claimed (AR1000F lines 18A/18B 'Less $6,000')",
    citation: {
      source: "Ark. Code § 26-51-307(a), (b), (e), (f) (as amended by Act 141 of 2017); 2025 Arkansas Individual Income Tax booklet, exempt income items 12-13 p. 11, lines 17-18B p. 13; printed AR1000F lines 18A-18B",
      section: "§ 26-51-307; AR1000F lines 17, 18A, 18B",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(a)(1) The first six thousand dollars ($6,000) of benefits received by a resident of this state from an individual retirement account or the first six thousand dollars ($6,000) of retirement benefits received by a resident of this state from public or private employment-related retirement systems, plans, or programs, regardless of the method of funding for these systems, plans, or programs, is exempt from the state income tax. (2)(A) Only individual retirement account benefits received by an individual retirement account participant after reaching fifty-nine and one-half (59½) years of age qualify for the exemption. (B) The only other distributions or withdrawals from an individual retirement account that qualify for the exemption before … 59½ … are those made on account of the participant's death or disability. … (b)(1)(B) Except as provided in subsection (e) of this section, a taxpayer shall not receive an exemption greater than six thousand dollars ($6,000) during any tax year under this section. … (e)(1) The following are exempt from the income tax imposed under this chapter: (A) Retirement benefits received by a member of the uniformed services … (f)(1) Except as provided in subdivision (f)(2) of this section, a taxpayer claiming an exemption under subsection (e) of this section is not eligible for an exemption under subsection (a) of this section. (2) A taxpayer claiming an exemption of less than six thousand dollars ($6,000) for income from military retirement or survivor benefits under subsection (e) of this section may claim as exempt additional retirement benefits under subsection (a) of this section in an amount equal to the difference between the exemption claimed under subsection (e) of this section and six thousand dollars ($6,000).' BOOKLET (p. 13, verbatim): 'LINE 18A. … Enter the federal taxable amount from box 2a of your 1099-R(s) in the space provided. … You are entitled to a $6,000 exemption from the taxable amount; the balance is taxable to Arkansas. Enter the balance on line 18A, column A.' 'Military retirees cannot claim the $6,000 exemption for traditional or employer-sponsored distributions if their military retirement exemption exceeds $6,000. If the military retirement exemption is less than $6,000, the remaining amount of the exemption may be taken for traditional or employer-sponsored distributions.' p. 11: 'NOTE: Total exemptions from all plans described under 12 and 13 cannot exceed $6,000 per taxpayer, not including recovery of cost.' 'A surviving spouse qualifies for the exemption; however he/she is limited to a single $6,000 exemption.' ENCODING (one taxpayer): min(qualified taxable pension/IRA, max($0, $6,000 − military retirement exempted)). Premature IRA distributions and annuities go on line 16 with no exclusion; military retirement itself is 100% exempt (line 17 is informational).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { exclusion: { value: "600000", type: "money" } },
    formula: minE(max0(fact("arPensionTaxable")), max0(sub(money("600000"), max0(fact("arMilitaryRetirement"))))),
  },
  {
    id: "us.ar.capital_gains",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas taxable capital gain — AR1000D: 50% of the net long-term gain (after netting a short-term loss; gain over $10,000,000 exempt) plus 100% of a net short-term gain; net loss limited to $3,000 ($1,500 per taxpayer for statuses 4 and 5) (AR1000F line 14)",
    citation: {
      source: "Ark. Code § 26-51-815(a)-(b) (50% of net capital gain exempt; the excess over $10,000,000 exempt); 2025 Form AR1000D lines 1-12 (R 4/25/2025); 2025 Arkansas Individual Income Tax booklet, line 14 p. 13",
      section: "§ 26-51-815; AR1000D lines 1-12; AR1000F line 14",
      url: "https://www.dfa.arkansas.gov/wp-content/uploads/2025_AR1000D_CapitalGains.pdf",
      excerpt:
        "AR1000D (verbatim): 'In Arkansas, only 50% of the net long-term capital gain is taxed. 100% of the short-term capital gain is taxed. Per Act 1488 of 2013, the amount of net capital gain in excess of ten million dollars ($10,000,000) from a gain realized on or after January 1, 2014 is exempt from state tax. … The amount of capital loss that can be deducted after offsetting capital gains is limited to $3,000 ($1,500 per taxpayer for filing status 4 or 5). 1. Enter federal long-term capital gain or loss reported on line 15, federal Schedule D or Form 1040, line 7 … 3. Arkansas long-term capital gain or loss. Add (or subtract) line 1 and line 2. 4. Enter federal net short-term capital loss, if any, reported on line 7, federal Schedule D … 6. Arkansas net short-term capital loss. … 7a. Arkansas net capital gain or loss. (If gain, subtract line 6 from 3. If loss, add lines 6 and 3.) 7b. If the amount on line 7a is over $10,000,000, only enter $10,000,000. If less than $10,000,000, enter the total amount. 8. Arkansas taxable amount. If a gain multiply line 7b by 50 percent (.50), otherwise enter loss. 9. Enter federal short-term capital gain, if any, reported on line 7, federal Schedule D … 11. Arkansas short-term capital gain. … 12. Total taxable Arkansas capital gain or loss. Add lines 8 and 11. (Loss limited to $3,000 for filing status 1,2,3,5 and 6; $1,500 per taxpayer if filing status 4 or 5.) Enter here. Filing status 1,2,3,5 and 6: Add line 12, columns A and B and enter on AR1000F/AR1000NR, line 14. Filing status 4: Enter line 12, column A on AR1000F/AR1000NR, line 14, column A. Enter line 12, column B on AR1000F/AR1000NR, line 14, column B.' STATUTE (verbatim): '(b)(2) If a taxpayer has a net capital gain, the following portion of the gain is exempt from state income tax: … (C) Beginning on and after July 1, 2016, fifty percent (50%). (3) The amount of net capital gain in excess of ten million dollars ($10,000,000) from a gain realized on or after January 1, 2014, is exempt from the state income tax.' ENCODING (one column): line 7a = long-term ± short-term LOSS; line 8 = 50% of min(line 7a, $10,000,000) when a gain (half-dollars rounded half-up), else the loss; line 12 = line 8 + short-term GAIN; floor −$3,000, or −$1,500 when filingStatus is mfs (status 5) or arStatus4 (each column). Depreciation-difference adjustments (lines 2, 5, 10) are folded into the inputs; Arkansas did not adopt federal bonus depreciation. Personal residence gain exclusion $250,000 / $500,000 (booklet p. 13) is applied before the input.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      longTermExclusionPct: { value: "50", type: "int" },
      gainExemptOver: { value: "1000000000", type: "money" }, // $10,000,000
      lossLimit: { value: "-300000", type: "money" },
      lossLimitPerSpouseSeparate: { value: "-150000", type: "money" },
    },
    formula: (() => {
      const longTerm: Expr = fact("arLongTermGain");
      const shortTerm: Expr = fact("arShortTermGain");
      const shortTermLoss: Expr = minE(shortTerm, money("0"));
      const shortTermGain: Expr = max0(shortTerm);
      const l7a: Expr = add(longTerm, shortTermLoss);
      const l7b: Expr = minE(l7a, money("1000000000"));
      const l8: Expr = iff(gt(l7a, money("0")), rd({ kind: "mulRate", base: l7b, rate: { num: "50", den: "100" }, round: "half-up" }), l7a);
      const l12: Expr = add(l8, shortTermGain);
      const floor: Expr = iff(or(isMfs, fact("arStatus4")), money("-150000"), money("-300000"));
      return maxE(l12, floor);
    })(),
  },
  {
    id: "us.ar.itemized_deductions",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas itemized deductions (AR3) — medical over 10% of AGI, real estate and other deductible taxes (no state income or sales taxes), home mortgage and investment interest, contributions, casualty losses, post-secondary tuition, miscellaneous deductions over 2% of AGI, and other miscellaneous deductions (AR3 line 30 → AR1000F line 27)",
    citation: {
      source: "Ark. Code § 26-51-430(a) (election; both spouses must match); 2025 Form AR3 lines 1-35 (R 4/25/2025); 2025 Arkansas Individual Income Tax booklet, AR3 instructions pp. 17-18 and line 27 p. 14",
      section: "AR3 lines 1-30 (31-35 status 4/5 proration); AR1000F line 27",
      url: "https://www.dfa.arkansas.gov/wp-content/uploads/2025_AR3_ItemizedDeduction.pdf",
      excerpt:
        "AR3 (verbatim): 'MEDICAL AND DENTAL EXPENSES: 1. Medical and dental expenses; 2. Enter amount from Form AR1000F/AR1000NR, line 25A and 25B; 3. Multiply line 2 by 10% (.10), otherwise enter 0; 4. TOTAL MEDICAL EXPENSES: (Subtract line 3 from line 1; if more than line 1, enter 0). TAXES: 5. Real estate tax; 6. Personal property tax or other taxes; 7. TOTAL TAXES. INTEREST EXPENSES: 8. Home mortgage interest paid to financial institutions; 9. Home mortgage interest paid to an individual; 10. Deductible points; 11. Investment interest (Attach federal Form 4952); 12. TOTAL INTEREST EXPENSE. CONTRIBUTIONS: 13. Cash contributions; 14. Art and literary contributions; 15. Other; 16. Carryover contributions; 17. TOTAL CONTRIBUTIONS. 18. TOTAL CASUALTY AND THEFT LOSSES (Attach Form AR4684). 19. TOTAL POST-SECONDARY EDUCATION TUITION DEDUCTION(S) [Attach AR1075(s)]. MISCELLANEOUS DEDUCTIONS SUBJECT TO 2% AGI LIMIT: 20. Unreimbursed employee business expenses (Attach Form AR2106); 21. Other expenses; 22. Add the amounts on lines 20 and 21; 23. Enter amount from Form AR1000F/AR1000NR, line 25A and 25B; 24. Multiply line 23 above by 2% (.02); 25. TOTAL MISCELLANEOUS DEDUCTIONS: (Subtract line 24 from line 22; If line 24 is more than line 22, enter 0). OTHER MISCELLANEOUS DEDUCTIONS: 26. Volunteer firefighter expenses; 27. Gambling Losses; 28. Other miscellaneous deductions; 29. TOTAL … (Add lines 26 through 28). 30. Add amounts on lines 4, 7, 12, 17, 18, 19, 25, and 29 and enter the total here. Complete lines 31 - 35 ONLY if Filing Status 4 or 5. 31. Enter adjusted gross income … line 25A and 25B; 32. Total Arkansas adjusted gross income; 33. Divide the amount on line 31A above by the amount on line 32. Enter the percentage here; 34. Multiply line 30 by the percentage on line 33. Enter here and on … line 27, col. (A); 35. Subtract line 34 from line 30. Enter here and on … line 27, column (B).' BOOKLET (p. 17-18): taxes you CANNOT deduct include 'Arkansas income taxes … Federal income taxes … Sales taxes'; you may deduct 'City income taxes, Mississippi gambling taxes, Personal property taxes, Taxes paid to a foreign country on income taxed on this return'; casualty losses 'must exceed ten percent (10%) of your adjusted gross income' with the $100 exclusion (computed on AR4684 — input here); contributions over 60% of AGI carry forward five years; line 33 'Round to the nearest whole percent'. Line 27 (p. 14): 'enter the larger of your itemized deductions (from Form AR3) or your Standard Deduction' — the election is independent of the federal return; 'If you are filing status 4 or 5 and one spouse itemizes, then both spouses must itemize.' ENCODING: total = max0(medical − 10% of AGI) + taxes + interest + contributions + casualty + tuition + max0(miscellaneous − 2% of AGI) + other miscellaneous, the two floors rounded to whole dollars; arAgi is the COMBINED line 25A + 25B. The status-4/5 proration (lines 31-35) is composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      medicalFloorPct: { value: "10", type: "int" },
      miscFloorPct: { value: "2", type: "int" },
    },
    formula: (() => {
      const agi: Expr = max0(fact("arAgi"));
      const medical: Expr = max0(sub(max0(fact("arMedicalExpenses")), rd({ kind: "mulRate", base: agi, rate: { num: "10", den: "100" }, round: "half-up" })));
      const misc: Expr = max0(sub(max0(fact("arMiscExpenses")), rd({ kind: "mulRate", base: agi, rate: { num: "2", den: "100" }, round: "half-up" })));
      return add(
        medical,
        max0(fact("arTaxesPaid")),
        max0(fact("arInterestPaid")),
        max0(fact("arContributions")),
        max0(fact("arCasualtyLosses")),
        max0(fact("arTuitionDeduction")),
        misc,
        max0(fact("arOtherMiscDeductions")),
      );
    })(),
  },
  {
    id: "us.ar.parameters",
    version: 1,
    jurisdiction: "us.ar",
    title: "Arkansas 2025 Form AR1000F parameters — line structure, filing statuses 1-6 (status 4 columns), AR1000TC credits, adjustments, penalties, and the TY2026 3.7% enactment awaiting DFA's indexed 2026 tables",
    citation: {
      source: "2025 Arkansas Individual Income Tax booklet (AR1000F/AR1000NR instructions; AR3, AR1000ADJ, AR1000TC, AR2441, AR1000D, AR1000TD, AR1000CO forms and instructions); Ark. Code §§ 26-51-201, -301, -307, -430, -501, -502, -815; Act 1 of the 2024 2nd Ex. Sess.; Acts 1 and 2 of the 2026 1st Ex. Sess. (approved 5/6/2026) and the DFA Fiscal Impact Statement for SB1 (4/30/2026); web-verified September 2026",
      section: "Form AR1000F lines 1-52C",
      url: BOOKLET_URL,
      excerpt:
        "STRUCTURE (printed 2025 AR1000F): filing status 1 Single / 2 Married filing joint / 3 Head of household / 4 Married filing separately on the same return (columns A and B) / 5 Married filing separately on different returns / 6 Surviving spouse with dependent child; 7A-7C personal tax credits (→ us.ar.personal_tax_credits); INCOME 8 wages; 9 military pay (exempt, informational); 10 interest (AR4 if over $1,500); 11 dividends; 12 alimony received; 13 business income (Sch. C); 14 capital gains (AR1000D → us.ar.capital_gains); 15 other gains (4797); 16 non-qualified IRA distributions and taxable annuities; 17 military retirement (exempt, informational); 18A/18B employer pension and qualified IRA — gross, taxable, 'Less $6,000' (→ us.ar.retirement_exclusion per taxpayer); 19 rents/royalties/partnerships (Sch. E); 20 farm; 21 unemployment (taxable since TY2018); 22 other income / depreciation differences (AR-OI); 23 TOTAL INCOME; 24 TOTAL ADJUSTMENTS (AR1000ADJ: border city, tuition savings $5,000, IRA, MSA, HSA, student loan interest ≤ $2,500 with the $85,000-$100,000 / $170,000-$200,000 phase-out, intergenerational trust $4,000, moving, self-employed health insurance, Keogh/SEP/SIMPLE, early-withdrawal penalty, alimony paid, disabled-individual support $500, organ donor ≤ $10,000, reserve expenses, reforestation, teacher classroom expense, ABLE $5,000); 25 AGI; 26 select ONE table: low income / standard / itemized; 27 = 0 (low income) or the LARGER of the standard deduction (→ us.ar.standard_deduction) or AR3 itemized (→ us.ar.itemized_deductions; status 4/5 prorated by the whole-percent AGI share); 28 NET TAXABLE INCOME = 25 − 27; 29 tax (→ us.ar.low_income_tax on line 25, or us.ar.income_tax on line 28, per column); 30 combined tax (A + B); 31 lump-sum distribution averaging tax (AR1000TD); 32 = 10% of the federal Form 5329 Part I (and Coverdell Part II) additional tax; 33 TOTAL TAX; 34 personal credits (7C); 35 child care credit (AR2441 → us.ar.child_care_credit; nonrefundable); 36 other credits (AR1000TC: 1 political contributions ≤ $50 per taxpayer / $100 joint; 2 other state tax credit = the lesser of the tax actually paid to the other state or the Arkansas tax attributable to that income — 'redo the AR1000F … with all the other states' income/losses removed' and subtract; 3 adoption 20% of the federal credit; 4 phenylketonuria; 5 stillborn child ≤ $500; 6 additional tax credit for qualified individuals (→ us.ar.additional_tax_credit); 7 developmental disabilities $500 per certified dependent; 8 business incentive credits); 37 TOTAL CREDITS; 38 NET TAX = max0(33 − 37) — credits are not refundable; PAYMENTS 39A W-2 withholding; 39B 1099/AR-K1 withholding (new split for 2025); 40 estimated tax paid or credit brought forward from 2024; 41 extension payment; 42 amended: previous payments; 43 early childhood program credit (AR1000EC + AR2441 — the refundable 20% credit for an APPROVED facility; lines 35 + 43 cannot exceed the AR2441 amount); 44 TOTAL PAYMENTS; 45 amended: previous refund; 46 = 44 − 45; 47 OVERPAYMENT = 46 − 38; 48 applied to 2026 estimated tax; 49 check-off contributions (AR1000CO, whole dollars); 50 REFUND = 47 − 48 − 49; 51 AMOUNT DUE = 38 − 46 ('If over $1,000, continue to 52A'); 52A/52B underestimate penalty (AR2210/AR2210A; 10% when net tax ≥ $1,000 and withholding under 90%); 52C TOTAL DUE = 51 + 52B. EXEMPT INCOME (pp. 10-11): Social Security, VA, workers' compensation, Railroad Retirement, U.S./Arkansas obligation interest, active-duty military pay, military retirement, PSLF discharges, the first $6,000 of pension/IRA, personal residence gain up to $250,000 / $500,000. STATUS 4 (p. 12): 'columns A and B must be used. Write the primary's income in column A and the spouse's income in column B'; 'IF ONE SPOUSE HAD A TOTAL NEGATIVE INCOME, YOU MUST FILE MARRIED FILING JOINTLY'; business and farm income 'may not be split between you and your spouse unless a partnership was legally established'. PENALTIES (p. 16): failure to pay 1% per month, failure to file 5% per month, maximum 35%; interest 10% per year. TY2026 STATUS: Acts 1 (HB1001) and 2 (SB1) of the First Extraordinary Session of 2026, approved 5/6/2026, rewrite § 26-51-201(a)(4) 'For tax years beginning on or after January 1, 2026': standard table '$0 $5,599 0%; $5,600 $11,199 2%; $11,200 $15,999 3%; $16,000 $26,399 3.4%; $26,400 $94,700 3.7%'; upper table '$0 $4,700 2%; $4,701 and above 3.7%'; bracket adjustment '$94,701 $94,800 $290 … $97,501 $97,600 $10; $97,601 and over $0'; '(5) The tables set forth in subdivisions (a)(1)-(4) of this section shall be adjusted annually in accordance with the method set forth in subsection (d)'. DFA's 2026 withholding formula (effective 01/01/2026) carries those thresholds, a $367.16 adjustment for the 3.7% band, $2,470, and $29 — but the 2026 AR1000F indexed brackets, standard deduction, low-income tables, and additional-credit table were unpublished when verified (September 2026; 2026_TaxBrackets.pdf returns 404), so every TY2025 rule ends 2026-01-01 and TY2026 is refused until DFA publishes. 2025 Regular Session: no enacted act changed the AR1000F rates, deduction, or credits (HB1065 indexing-cap repeal and HB1066 standard-deduction increase died in committee). Full-year residents only — AR1000NR (nonresident / part-year) is a separate form and is not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      politicalContributionCreditPerTaxpayer: { value: "5000", type: "money" }, // $50
      adoptionCreditPctOfFederal: { value: "20", type: "int" },
      stillbornChildCreditMax: { value: "50000", type: "money" }, // $500
      developmentalDisabilityCreditPerDependent: { value: "50000", type: "money" }, // $500
      earlyWithdrawalTaxPctOfFederal: { value: "10", type: "int" },
      tuitionSavingsDeductionPerTaxpayer: { value: "500000", type: "money" },
      ableDeductionPerTaxpayer: { value: "500000", type: "money" },
      studentLoanInterestMax: { value: "250000", type: "money" },
      failureToPayPctPerMonth: { value: "1", type: "int" },
      failureToFilePctPerMonth: { value: "5", type: "int" },
      penaltyMaxPct: { value: "35", type: "int" },
      interestPctPerYear: { value: "10", type: "int" },
      underestimatePenaltyNetTaxFloor: { value: "100000", type: "money" }, // $1,000
      filingThresholdSingle: { value: "1464400", type: "money" },
      filingThresholdMfj01Dep: { value: "2469600", type: "money" },
      filingThresholdMfs: { value: "947000", type: "money" },
      topRate2026Bps: { value: "370", type: "int" }, // Acts 1-2 of 2026 1st Ex. Sess.
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Arkansas Form AR1000F composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ar.income_tax, us.ar.low_income_tax, us.ar.standard_deduction, us.ar.personal_tax_credits, us.ar.additional_tax_credit, us.ar.child_care_credit, us.ar.retirement_exclusion, us.ar.capital_gains, and us.ar.itemized_deductions",
    },
  },
];
