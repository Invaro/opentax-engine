import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Rhode Island deep pack — TY2025 Form RI-1040 (full-year resident). Every
 * amount verified from the 2025 RI-1040 Resident Instructions (13 pp,
 * Rev. 11/2025 with the Tax Computation Worksheet on p. I-13), the printed
 * 2025 Form RI-1040 with Schedules I, II, EIC, W and E, RI Schedule M, RI
 * Schedule CR, RI Schedule U, Form RI-1040H, Form RI-1040MU, the Taxable
 * Social Security Income Worksheet, the Division's "2025 RI Tax Tables"
 * (pages T-1 to T-7) and "Tax Rate Schedule, Deduction and Exemption
 * Worksheets", Advisories ADV 2024-26 (October 31, 2024: the TY2025
 * inflation-adjusted amounts) and ADV 2025-22 (November 3, 2025: the TY2026
 * amounts and the TY2025 Social Security / pension / RI-1040H figures), the
 * Division's July 22, 2026 "Summary of Legislative Changes", and R.I. Gen.
 * Laws §§ 44-30-2.6, 44-30-12, 44-30-18, 44-33-3, 44-33-9 (webserver.
 * rilegislature.gov, as amended through P.L. 2025, ch. 278).
 *
 * Load-bearing findings:
 *  - One uniform rate schedule for every filing status (§ 44-30-2.6(c)(3)(A)):
 *    3.75% to $79,900, 4.75% to $181,650, 5.99% above, for 2025. The return
 *    computes tax with the Tax Computation Worksheet (rate × taxable income
 *    minus $0 / $799.00 / $3,051.46) at $100,000 and over and the Tax Table
 *    ($50 rows, the same arithmetic at the row midpoint) under $100,000 —
 *    verified on all 2,000 rows; the first row prints $0.
 *  - Standard deduction $10,900 / $21,800 / $16,350 / $10,900 and a $5,100
 *    exemption, both phased out above $254,250 of modified federal AGI in
 *    $7,250 steps of 20 points (zero past $29,000 of excess) — the indexed
 *    § 44-30-2.6(c)(3)(B)(III) / (D) $175,000 and $5,000 figures. No itemized
 *    deductions ("Rhode Island does not allow the use of federal itemized
 *    deductions"), no age or blindness addition.
 *  - Modifications (§ 44-30-12): the Social Security modification (full
 *    retirement age — born on or before March 1, 1959 — and federal AGI under
 *    $107,000 / $133,750), the pension/annuity modification raised to $50,000
 *    per eligible person for 2025 (P.L. 2024, ch. 117), the military service
 *    pension modification, $500 / $1,000 529 contributions, and the 2025
 *    OBBBA add-back (§ 44-30-12(b)(9), RI Schedule HR1: §§ 163(j), 174A,
 *    179(b), 181).
 *  - Credits are a closed list (§ 44-30-2.6(c)(3)(F)): 25% of the federal
 *    child and dependent care credit (nonrefundable), the other-state credit
 *    (§ 44-30-18, Schedule II), the 16% refundable earned income credit, the
 *    RI-1040H property tax relief credit (65+ or disabled, household income
 *    ≤ $40,730, up to $700), the lead paint credit, and certificate credits.
 *  - TY2026 (ADV 2025-22): brackets $82,050 / $186,450, standard deduction
 *    $11,200 / $22,400 / $16,800, exemption $5,250, phase-out $261,000 in
 *    $7,450 steps — version 2 of those rules. The FY2027 budget (H 7127 Sub A,
 *    approved June 12, 2026; Division "Summary of Legislative Changes",
 *    July 22, 2026) adds a High-Income Surtax over $1,000,000 (1% for 2027,
 *    2% for 2028, 3% for 2029 and after), a refundable $330 child tax credit
 *    (§ 44-30-104), and drops the Social Security age test — all of that
 *    first applies to TY2027, so none of it reaches the rates, deductions,
 *    exemptions or credits computed here. The one 2026-session change that
 *    does reach TY2026 is the permanent H.R. 1 decoupling: § 174A from tax
 *    years beginning on or after 1/1/2026 (§§ 163(j) and 1202 from 2027).
 *    That is a Schedule M modification, an input to this pack rather than a
 *    computed rule. TY2025 was untouched by the 2026 session.
 *
 * Where the Division's own sources disagree, and what is encoded:
 *  - Statute § 44-30-12(c)(8)/(c)(9) and the Social Security worksheet (line 7)
 *    both condition the modifications on federal AGI "less than" the limit;
 *    the booklet's pension question 2 (p. I-9) and PUB 2026-01 say "less than
 *    or equal to" / "$107,000 or less". The statute governs — encoded strict.
 *  - PUB 2026-01 (Retirement Income Guide) prints the joint pension/Social
 *    Security threshold as $133,500; ADV 2025-22, the booklet table and the
 *    worksheet all print $133,750. Encoded $133,750 (three sources to one).
 *  - The instructions p. I-4 point line 4 at the "Exemption Worksheet"; the
 *    printed form and the worksheet page both say Standard Deduction
 *    Worksheet. Encoded per the form.
 *  - Tax Tables p. T-1 says the worksheet is for income "larger than
 *    $100,000", leaving exactly $100,000 unassigned; the p. T-2 header and the
 *    p. T-7 sidebar both say "$100,000 or more" / "$100,000 or over", and the
 *    table itself stops at the 99,950-100,000 row. Encoded ≥ $100,000.
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
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
const isJoint: Expr = or(isStatus("mfj"), isStatus("qss")); // shared AMOUNTS: the $21,800 deduction and the $133,750 modification threshold
const isMfjOnly: Expr = isStatus("mfj"); // SPOUSE COLUMNS: a qualifying widow(er) has no spouse to claim
const isHoh: Expr = isStatus("hoh");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents × 10^4) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** Tax Computation Worksheet row: (a) × (b) − (d), one rounding to whole dollars */
const worksheetRow = (x: Expr, rateBps: string, subtractionCents: string): Expr => dollarsFromScaled(sub(times(x, rateBps), times(money(subtractionCents), "10000")));
/** ratio to four decimals, half-up, capped at 1.0000 — an int 0..10000 in cents units */
const ratio4 = (num: Expr, den: Expr): Expr => minE({ kind: "mulDiv", a: max0(num), b: money("10000"), c: den, round: "half-up" }, money("10000"));
/** base × a four-decimal ratio, ONE half-up rounding to whole dollars — the printed line is a single
 *  whole-dollar box ("Multiply line 23 by line 26"); rounding to cents first and then to dollars turns
 *  $1 × 0.4950 = 0.495 -> $0 into $0.50 -> $1 */
const applyRatio = (base: Expr, r: Expr): Expr => times({ kind: "mulDiv", a: base, b: r, c: money("1000000"), round: "half-up" }, "100");

/** the uniform schedule as the Tax Computation Worksheet computes it: rate × taxable income − subtraction amount */
type Row = { thresholdCents: string; rateBps: string; subtractionCents: string };
const worksheetTax = (x: Expr, rows: Row[]): Expr => {
  let expr: Expr = worksheetRow(x, rows[0].rateBps, rows[0].subtractionCents);
  for (let i = 1; i < rows.length; i++) expr = iff(gt(x, money(rows[i].thresholdCents)), worksheetRow(x, rows[i].rateBps, rows[i].subtractionCents), expr);
  return expr;
};
/** Form RI-1040 line 8: the Tax Table ($50-row midpoint, first row $0) under $100,000, the worksheet at $100,000 or more; riUseRateSchedule applies the worksheet arithmetic at any income */
const line8Tax = (x: Expr, rows: Row[]): Expr => {
  const mid: Expr = add(mulInt(money("5000"), stepUnits(x, "5000", "floor")), money("2500"));
  const table: Expr = iff(lt(x, money("5000")), money("0"), iff(lt(x, money("10000000")), worksheetTax(mid, rows), worksheetTax(x, rows)));
  return iff(fact("riUseRateSchedule"), worksheetTax(x, rows), table);
};
const ROWS_2025: Row[] = [
  { thresholdCents: "0", rateBps: "375", subtractionCents: "0" },
  { thresholdCents: "7990000", rateBps: "475", subtractionCents: "79900" }, // $799.00
  { thresholdCents: "18165000", rateBps: "599", subtractionCents: "305146" }, // $3,051.46
];
/** TY2026: the published schedule evaluated EXACTLY. ADV 2025-22 prints the "Pay" anchors as
 * $3,076.88 / $8,035.88, but those are display roundings of half-cents — 82,050 x 3.75% =
 * 3,076.875 and 3,076.875 + 104,400 x 4.75% = 8,035.875. Applying the rounded anchor carries a
 * +$0.005 bias into every income above $82,050 and overstates the tax by $1 at 1,589 of the
 * 400,001 whole-dollar incomes to $400,000. The Division's filed-return method is the Tax
 * Computation Worksheet, whose subtraction constants are exact by construction (threshold x the
 * rate step): TY2025 proves it — the printed $799.00 / $3,051.46 are exact while the same
 * year's schedule anchor $7,829.38 is rounded from 7,829.375. So the 2026 constants below are
 * the exact schedule, not an invention: 82,050 x 1.00% = $820.50 and 820.50 + 186,450 x 1.24% =
 * $3,132.48. Re-verify against the printed 2026 worksheet when it publishes (~December 2026). */
const ROWS_2026: Row[] = [
  { thresholdCents: "0", rateBps: "375", subtractionCents: "0" },
  { thresholdCents: "8205000", rateBps: "475", subtractionCents: "82050" }, // $820.50
  { thresholdCents: "18645000", rateBps: "599", subtractionCents: "313248" }, // $3,132.48
];

/** the § 44-30-2.6(c)(3)(B)(III) / (D) phase-out: 20 points per step of the excess over the threshold, zero past four steps */
const phaseoutPct = (agi: Expr, thresholdCents: string, stepCents: string): Expr => {
  const steps = stepUnits(max0(sub(agi, money(thresholdCents))), stepCents, "ceil");
  return max0(sub(money("10000"), mulInt(money("2000"), steps))); // basis points × 100 → an int 0..10000 in cents units
};

const FORMS = "https://tax.ri.gov/sites/g/files/xkgbur541/files/";
const INSTR_URL = FORMS + "2025-12/2025%201040R%20Instructions%20122025.pdf";
const FORM_URL = FORMS + "2026-01/2025_1040WE_w.pdf";
/** R.I.G.L. chapter 44-30 lives under PART directories (44-I for §§ 44-30-1 to -11, 44-II for the
 *  modifications and credits); the URL without the part segment returns 404 with an EMPTY body. */
const RIGL = (part: "44-I" | "44-II", s: string) => `https://webserver.rilegislature.gov/Statutes/TITLE44/44-30/${part}/44-30-${s}.htm`;

export const riRules: Rule[] = [
  {
    id: "us.ri.income_tax",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island income tax — 2025 uniform rate schedule for every filing status (3.75% to $79,900, 4.75% to $181,650, 5.99% above); the Tax Computation Worksheet (rate × taxable income less $0 / $799.00 / $3,051.46) at $100,000 or more and the Tax Table ($50-row midpoint) under $100,000 (Form RI-1040 line 8)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(A)(I) ($55,000 / $125,000 base brackets, 3.75% / 4.75% / 5.99%) indexed under § 44-30-2.6(c)(3)(E); Division of Taxation ADV 2024-26 (October 31, 2024) 'Uniform tax rate schedule for Tax Year 2025'; 2025 RI-1040 Instructions p. I-13 'Rhode Island Tax Computation Worksheet'; '2025 RI Tax Tables' pp. T-1 to T-7; 'Tax Rate Schedule, Deduction and Exemption Worksheets' (2025)",
      section: "§ 44-30-2.6(c)(3)(A)(I), (E); Form RI-1040 line 8",
      url: FORMS + "2026-01/2025%20RI%20Tax%20Tables_Full.pdf",
      excerpt:
        "STATUTE (§ 44-30-2.6(c)(3)(A)(I), verbatim): 'There is hereby imposed on the taxable income of married individuals filing joint returns, qualifying widow(er), every head of household, unmarried individuals, married individuals filing separate returns and bankruptcy estates, a tax determined in accordance with the following table: RI Taxable Income Over / But not over — RI Income Tax Pay + % on Excess / on the amount over: $0 - $55,000 — $0 + 3.75% — $0; 55,000 - 125,000 — 2,063 + 4.75% — 55,000; 125,000 - — 5,388 + 5.99% — 125,000.' (E): 'The dollar amount contained in subparagraphs 44-30-2.6(c)(3)(A), 44-30-2.6(c)(3)(B) and 44-30-2.6(c)(3)(C) shall be increased annually by an amount equal to: (I) Such dollar amount … adjusted for inflation using a base tax year of 2000, multiplied by; (II) The cost-of-living adjustment with a base year of 2000 … (V) If any increase determined under this section is not a multiple of fifty dollars ($50.00), such increase shall be rounded to the next lower multiple of fifty dollars ($50.00).' ADV 2024-26 (verbatim): 'Uniform tax rate schedule for Tax Year 2025 (Personal Income Tax) — Taxable income: Over $0 But not over $79,900 Pay -- + 3.75% of the amount over $0; 79,900 / 181,650 / 2,996.25 / 4.75% / 79,900; 181,650 / -- / 7,829.38 / 5.99% / 181,650.' 'The Division of Taxation has recalculated tax bracket ranges for Tax Year 2025, as required by statute. The changes were made to the Rhode Island Personal Income Tax's uniform tax rate schedule, which is used by all filers.' TAX COMPUTATION WORKSHEET (p. I-13, verbatim): 'Use for all filing status types. If Taxable Income — RI-1040, line 7 … is: Over $0 But not over $79,900 — (b) Multiplication amount 3.75% — (d) Subtraction amount $0.00; $79,900 / $181,650 — 4.75% — $799.00; Over $181,650 — 5.99% — $3,051.46. (c) Multiply (a) by (b). TAX: Subtract (d) from (c). Enter here and on RI-1040, line 8.' TAX TABLE (p. T-1, verbatim): 'CAUTION! The Rhode Island Tax Rate Schedule is shown so you can see the tax rate that applies to all levels of taxable income. DO NOT use to figure your Rhode Island tax. Instead, if your taxable income is less than $100,000 use the Rhode Island Tax Table located on pages T-2 through T-7. If your taxable income is larger than $100,000, use the Rhode Island Tax Computation Worksheet located on page T-1.' (p. T-2): 'Use if your Rhode Island taxable income is less than $100,000. If your taxable income is $100,000 or more, use the Tax Rate Schedules located on page T-1.' EXAMPLE (verbatim): '(1) Your taxable income from RI-1040 …, line 7 is $25,300.00. (2) Find the $25,300 - 25,350 income line on this table. (3) The tax amount shown in the column \"TAX\" is $950.00.' Rows (verbatim): '0 50 0', '50 100 3', '100 150 5', '25,300 25,350 950', '79,900 79,950 2,997', '99,950 100,000 3,950'. CONVENTION (verified on all 2,000 $50 rows): each cell is the worksheet arithmetic (rate × the row midpoint, at-least + $25, less the subtraction amount) rounded half-up — 25,325 × 3.75% = 949.69 → $950; 99,975 × 4.75% − 799 = 3,949.81 → $3,950 — except the first row, which prints $0 (the midpoint would give $1). One column serves every filing status. ENCODING: default = the table under $100,000 (first row $0, then the midpoint arithmetic) and the worksheet at $100,000 or more; riUseRateSchedule = true applies the worksheet arithmetic at any income (differs from the table by at most $2). The worksheet subtraction amounts are exact ($799.00 = 1.00% × 79,900; $3,051.46 = 799 + 1.24% × 181,650), so the schedule's rounded 'Pay' anchors ($2,996.25, $7,829.38) never enter the computation. Indexed annually — this rule ends 2026-01-01 (TY2026 is version 2).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "375", type: "int" },
      rate2Bps: { value: "475", type: "int" },
      rate3Bps: { value: "599", type: "int" },
      bracket1: { value: "7990000", type: "money" },
      bracket2: { value: "18165000", type: "money" },
      subtraction2: { value: "79900", type: "money" },
      subtraction3: { value: "305146", type: "money" },
      tableTop: { value: "10000000", type: "money" },
    },
    formula: line8Tax(max0(fact("stateTaxableIncome")), ROWS_2025),
  },
  {
    id: "us.ri.standard_deduction",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island standard deduction 2025 — $10,900 single and MFS, $21,800 MFJ and qualifying widow(er), $16,350 HOH; reduced 20 points for each $7,250 (or fraction) of modified federal AGI over $254,250, zero past $283,250 (Form RI-1040 line 4, Standard Deduction Worksheet)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(B)(I), (III) ($7,500 / $15,000 / $7,500 / $11,250 base amounts, $175,000 threshold, $5,000 steps) indexed under (E); ADV 2024-26 (October 31, 2024); 2025 RI-1040 Instructions p. I-4 (line 4); 'Tax Rate Schedule, Deduction and Exemption Worksheets' (2025), Standard Deduction Worksheet lines 1-8; printed Form RI-1040 left margin and line 4",
      section: "§ 44-30-2.6(c)(3)(B); Form RI-1040 line 4",
      url: FORMS + "2026-01/2025%20Tax%20Rate%20and%20Worksheets.pdf",
      excerpt:
        "STATUTE (verbatim): '(B) Deductions: (I) Rhode Island Basic Standard Deduction. Only the Rhode Island standard deduction shall be allowed in accordance with the following table: Filing status — Amount: Single $7,500; Married filing jointly or qualifying widow(er) $15,000; Married filing separately $7,500; Head of Household $11,250. (II) Nonresident alien individuals, estates and trusts are not eligible for standard deductions. (III) In the case of any taxpayer whose adjusted gross income, as modified for Rhode Island purposes pursuant to § 44-30-12, for the taxable year exceeds one hundred seventy-five thousand dollars ($175,000), the standard deduction amount shall be reduced by the applicable percentage. The term \"applicable percentage\" means twenty (20) percentage points for each five thousand dollars ($5,000) (or fraction thereof) by which the taxpayer's adjusted gross income for the taxable year exceeds one hundred seventy-five thousand dollars ($175,000).' ADV 2024-26 (verbatim): 'Rhode Island standard deduction amounts by Tax Year — Filing status 2025: Single $10,900; Married filing jointly* $21,800; Head of household $16,350; Married filing separately $10,900. *Or qualifying widow or widower.' 'Phase-out range for standard deduction, exemption amounts by Tax Year — 2025: $254,250 to $283,250. Phaseout increment (amount used in computing phaseout), which was $7,050 for 2024, will be $7,250 for 2025.' INSTRUCTIONS (p. I-4, verbatim): 'Line 4 – Deductions: Enter your Rhode Island standard deduction from the list in the next column. Rhode Island does not allow the use of federal itemized deductions. Single $10,900; Married Joint $21,800; Qualifying Widow(er) $21,800; Married Separate $10,900; Head of Household $16,350. However, if line 3 is more than $254,250 see the Exemption Worksheet on the inside of the back cover'. WORKSHEET (verbatim): '1. Enter applicable standard deduction amount from the chart below; 2. Enter your modified federal AGI from RI-1040 …, page 1, line 3; 3. Is the amount on line 2 more than $254,250? Yes. Continue to line 4. No. STOP HERE! Enter the amount from line 1 on form RI-1040 …, line 4; 4. Standard deduction phaseout amount $254,250; 5. Subtract line 4 from line 2. If the result is more than $29,000, STOP HERE. Your standard deduction amount is zero ($0); 6. Divide line 5 by $7,250. If the result is not a whole number, increase it to the next higher whole number (for example, increase 0.0004 to 1); 7. Enter the applicable percentage from the chart below: If the number on line 6 is 1 — 0.8000; 2 — 0.6000; 3 — 0.4000; 4 — 0.2000; 8. Deduction amount. Multiply line 1 by line 7.' No age or blindness addition and no dependent-filer limitation exist on the 2011-and-later return (the § 44-30-2.6(c)(2)(C)(4)-(5) amounts belong to the pre-2011 regime). ENCODING: steps = ceil(max0(modified AGI − $254,250) ÷ $7,250); deduction × max0(1 − 0.2 × steps). TY2026 (ADV 2025-22): $11,200 / $22,400 / $16,800, $261,000 and $7,450 — version 2.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { single: { value: "1090000", type: "money" }, joint: { value: "2180000", type: "money" }, hoh: { value: "1635000", type: "money" }, mfs: { value: "1090000", type: "money" }, phaseoutThreshold: { value: "25425000", type: "money" }, phaseoutStep: { value: "725000", type: "money" }, phaseoutEnd: { value: "28325000", type: "money" } },
    formula: (() => {
      const base: Expr = iff(isJoint, money("2180000"), iff(isHoh, money("1635000"), money("1090000")));
      return applyRatio(base, phaseoutPct(fact("riModifiedAgi"), "25425000", "725000"));
    })(),
  },
  {
    id: "us.ri.exemption",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island exemption 2025 — $5,100 × the RI Schedule E exemptions (yourself, spouse on a joint return, dependents), reduced 20 points for each $7,250 (or fraction) of modified federal AGI over $254,250, zero past $283,250; zero for a filer claimable by another (Form RI-1040 line 6, Exemption Worksheet)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(C)(I)-(II), (D) ($3,500 base, § 151/§ 152 pre-TCJA exemption count, $175,000 threshold, $5,000 steps) indexed under (E); ADV 2024-26; 2025 RI-1040 Instructions pp. I-4 to I-5 (line 6), I-7 (RI Schedule E); 'Tax Rate Schedule, Deduction and Exemption Worksheets' (2025), Exemption Worksheet lines 1-8; printed Form RI-1040 line 6 and RI Schedule E lines 1a-5",
      section: "§ 44-30-2.6(c)(3)(C), (D); Form RI-1040 line 6; RI Schedule E",
      url: FORMS + "2026-01/2025%20Tax%20Rate%20and%20Worksheets.pdf",
      excerpt:
        "STATUTE (verbatim): '(C) Exemption Amount: (I) The term \"exemption amount\" means three thousand five hundred dollars ($3,500) multiplied by the number of exemptions allowed for the taxable year for federal income tax purposes. For tax years beginning on or after 2018, the term \"exemption amount\" means the same as it does in 26 U.S.C. § 151 and 26 U.S.C. § 152 just prior to the enactment of the Tax Cuts and Jobs Act (Pub. L. No. 115-97) on December 22, 2017. (II) Exemption amount disallowed in case of certain dependents. In the case of an individual with respect to whom a deduction under this section is allowable to another taxpayer for the same taxable year, the exemption amount applicable to such individual for such individual's taxable year shall be zero. … (D) In the case of any taxpayer whose adjusted gross income, as modified for Rhode Island purposes pursuant to § 44-30-12, for the taxable year exceeds one hundred seventy-five thousand dollars ($175,000), the exemption amount shall be reduced by the applicable percentage. The term \"applicable percentage\" means twenty (20) percentage points for each five thousand dollars ($5,000) (or fraction thereof) by which the taxpayer's adjusted gross income for the taxable year exceeds one hundred seventy-five thousand dollars ($175,000).' ADV 2024-26 (verbatim): 'Rhode Island personal and dependency exemption amounts by Tax Year — 2025: $5,100.' FORM (line 6, verbatim): 'Enter # of exemptions from RI Sch E, line 5 in box, multiply by $5,100 and enter result on line 6. If line 3 is over $254,250, see Exemption Worksheet'. INSTRUCTIONS (verbatim): 'Exemption Amount: Multiply the number of exemptions in the box by $5,100. However, if line 3 is more than $254,250 see the Exemption Worksheet … NOTE: If someone else can claim you on their return, your exemption amount is zero.' RI SCHEDULE E (verbatim): '1a Yourself; b Spouse; 2a-2m [dependents: name, social security number, date of birth, relationship]; 3 Enter the number of boxes checked on lines 1a and 1b; 4a Enter the number of children from lines 2a through 2m who lived with you; b Enter the number of children from lines 2a through 2m who did not live with you due to divorce or separation; c Enter the number of other dependents from lines 2a through 2m not included on lines 4a or 4b; 5 Add the numbers from lines 3 through 4c. Enter here and in the box on RI-1040/NR, pg 1, line 6.' 'Line 1a - Check the \"Yourself\" checkbox. Line 1b - If filing a joint return, also check the \"Spouse\" checkbox. Lines 2a - 2m - Use pages 17 - 22 of the IRS 1040 Instructions to determine eligible dependents'. EXEMPTION WORKSHEET (verbatim): '1. Multiply $5,100 by the total number of exemptions; … 4. Exemption phaseout amount $254,250; 5. … If the result is more than $29,000, STOP HERE. Your exemption amount is zero ($0); 6. Divide line 5 by $7,250 …; 7. … 1 — 0.8000; 2 — 0.6000; 3 — 0.4000; 4 — 0.2000; 8. Exemption amount. Multiply line 1 by line 7.' ENCODING: riExemptions is the Schedule E line 5 count (the composer counts yourself unless claimable by another, the spouse only on a joint return, and the dependents). TY2026 (ADV 2025-22): $5,250, $261,000, $7,450 — version 2.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "510000", type: "money" }, phaseoutThreshold: { value: "25425000", type: "money" }, phaseoutStep: { value: "725000", type: "money" } },
    formula: applyRatio(mulInt(money("510000"), fact("riExemptions")), phaseoutPct(fact("riModifiedAgi"), "25425000", "725000")),
  },
  {
    id: "us.ri.social_security_modification",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island Social Security modification 2025 — the taxable Social Security in federal AGI (the share attributable to a person who has reached full retirement age, born on or before March 1, 1959) when federal AGI is under $107,000 (single, HOH, MFS) or $133,750 (MFJ, qualifying widow(er)) (RI Schedule M line 1s, Taxable Social Security Income Worksheet)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-12(c)(8) ($80,000 / $100,000 base amounts indexed with a base year of 2000, $50 / $25 rounding); ADV 2025-22 (November 3, 2025) 'Social Security modification – income limits by Tax Year'; 2025 'Modification Worksheet — Taxable Social Security Income Worksheet' (RI-1040 booklet p. 18) Steps 1-2, lines 1-13; 2025 RI-1040 Instructions p. I-9 (line 1s)",
      section: "§ 44-30-12(c)(8); RI Schedule M line 1s",
      url: FORMS + "2026-01/Social%20Security%20Worksheet_b.pdf",
      excerpt:
        "STATUTE (verbatim): '(8) Modification for taxable Social Security income. (i) For tax years beginning on or after January 1, 2016: (A) For a person who has attained the age used for calculating full or unreduced Social Security retirement benefits who files a return as an unmarried individual, head of household, or married filing separate whose federal adjusted gross income for the taxable year is less than eighty thousand dollars ($80,000); or (B) A married individual filing jointly or individual filing qualifying widow(er) who has attained the age used for calculating full or unreduced Social Security retirement benefits whose joint federal adjusted gross income for the taxable year is less than one hundred thousand dollars ($100,000), an amount equal to the Social Security benefits includible in federal adjusted gross income. (ii) Adjustment for inflation. The dollar amount contained in subsections (c)(8)(i)(A) and (c)(8)(i)(B) of this section shall be increased annually … (v) If any increase … is not a multiple of fifty dollars ($50.00), such increase shall be rounded to the next lower multiple of fifty dollars ($50.00). In the case of a married individual filing separate return, … the next lower multiple of twenty-five dollars ($25.00)'. ADV 2025-22 (verbatim): 'Social Security modification – income limits by Tax Year — Filing status 2025: Single $107,000; Married filing jointly* $133,750; Head of household $107,000; Married filing separately $107,000. *Or qualifying widow or widower.' WORKSHEET (verbatim): 'STEP 1: Eligibility — 1 Enter your date of birth; 2 Enter your spouse's date of birth, if applicable; 3 Enter your Federal AGI from RI-1040 …, line 1; 4 Enter your Filing Status; 5 Were either you or your spouse born on or before 03/01/1959? If yes, check the box; 6 Filing status amount. Enter the amount from below that corresponds to your filing status on line 4: Single or head of household - $107,000; Married filing separately - $107,000; Married filing jointly or qualifying widow(er) - $133,750; 7 Is your Federal AGI on line 3 less than the filing status amount on line 6? If yes, check the box. If you answered yes to both questions 5 and 7, continue to Step 2. Otherwise, STOP, you are not eligible for this modification. STEP 2: Modification Amount — If you AND your spouse, if applicable, were born on or before 03/01/1959, enter 1.0000 on line 12 and skip lines 8 through 10. 8 Amount of social security benefits from Federal Form 1040 …, line 6a; 9 Amount of line 8 attributed to the person born on or before 03/01/1959; 10 Eligible percentage of social security benefits. Divide line 9 by line 8; 11 Taxable amount of social security from Federal Form 1040 …, line 6b; 12 Eligible percentage. Enter the percentage from line 10, or 1.0000, whichever applies; 13 Modification Amount. Multiply line 11 by line 12. Enter here and on Schedule M - page 1, line 1s.' 'Do not include amounts from Railroad Retirement Benefits on this worksheet.' ENCODING: riTaxpayerFullRetirementAge / riSpouseFullRetirementAge = born on or before March 1, 1959 (the Division's 2025 full-retirement-age cutoff); the joint ratio (line 10) is taken to four decimals half-up and the result rounded to whole dollars; the spouse's status matters only on a joint return. The thresholds index yearly and the 2026 figures are unpublished (~November 2026) — this rule ends 2026-01-01. TY2027: H 7127 Sub A (June 12, 2026) drops the age requirement.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { agiLimitSingleHohMfs: { value: "10700000", type: "money" }, agiLimitJoint: { value: "13375000", type: "money" }, fullRetirementAgeBornOnOrBefore: { value: "1959-03-01", type: "enum" } },
    formula: (() => {
      const limit: Expr = iff(isJoint, money("13375000"), money("10700000"));
      const tpFra = fact("riTaxpayerFullRetirementAge");
      const spFra = and(isMfjOnly, fact("riSpouseFullRetirementAge"));
      const eligible = and(or(tpFra, spFra), lt(fact("riFederalAgi"), limit));
      const taxable = max0(fact("riTaxableSocialSecurity"));
      const total = max0(fact("riSocialSecurityBenefits"));
      const partial: Expr = iff(gt(total, money("0")), applyRatio(taxable, ratio4(fact("riSocialSecurityBenefitsFraPerson"), total)), money("0"));
      const bothOrSingle = or(not(isMfjOnly), and(tpFra, fact("riSpouseFullRetirementAge")));
      return iff(eligible, iff(bothOrSingle, taxable, partial), money("0"));
    })(),
  },
  {
    id: "us.ri.pension_modification",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island pension and annuity modification 2025 — up to $50,000 of the federally taxable pension and annuity income (Form 1040 line 5b, not IRAs) of each person born on or before March 1, 1959, when federal AGI is under $107,000 (single, HOH, MFS) or $133,750 (MFJ, qualifying widow(er)) (RI Schedule M line 1t)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-12(c)(9)(i) as amended by P.L. 2024, ch. 117, art. 6, § 21 ('up to fifty thousand dollars ($50,000)' for tax years beginning on or after January 1, 2025), (vi) (thresholds equal the (c)(8) Social Security amounts); ADV 2025-22 'Pension/401(k)/Annuity modification – income limits by Tax Year'; 2025 RI-1040 Instructions pp. I-9 to I-10 (line 1t and its table)",
      section: "§ 44-30-12(c)(9); RI Schedule M line 1t",
      url: RIGL("44-II", "12"),
      excerpt:
        "STATUTE (verbatim): '(9) Modification of taxable retirement income from certain pension plans or annuities. (i) For tax years beginning on or after January 1, 2017, until the tax year beginning January 1, 2022, a modification shall be allowed for up to fifteen thousand dollars ($15,000), and for tax years beginning on or after January 1, 2023, until the tax year beginning January 1, 2024, a modification shall be allowed for up to twenty thousand dollars ($20,000), and for tax years beginning on or after January 1, 2025, a modification shall be allowed for up to fifty thousand dollars ($50,000), of taxable pension and/or annuity income that is included in federal adjusted gross income for the taxable year: (A) For a person who has attained the age used for calculating full or unreduced Social Security retirement benefits who files a return as an unmarried individual, head of household, or married filing separate whose federal adjusted gross income for such taxable year is less than the amount used for the modification contained in subsection (c)(8)(i)(A) …; or (B) For a married individual filing jointly or individual filing qualifying widow(er) who has attained the age … whose joint federal adjusted gross income for such taxable year is less than the amount used for the modification contained in subsection (c)(8)(i)(B) …'. ADV 2025-22 (verbatim): 'Pension/401(k)/Annuity modification – income limits by Tax Year — 2025: Single $107,000; Married filing jointly* $133,750; Head of household $107,000; Married filing separately $107,000. Note: Starting with Tax Year 2025, if the taxpayer meets all requirements, he or she may reduce federal AGI, for Rhode Island tax purposes, by up to $50,000 of federally taxable pension/401(k)/403(b)/annuity income (via the Rhode Island modification).' INSTRUCTIONS (verbatim): 'Line 1t - Modification up to $50,000 for taxable retirement income from certain pension plans or annuities under R.I. Gen. Laws § 44-30-12(c)(9). For those taxpayers who have reached full retirement age, if you answer YES to the following two questions, complete the table on the next page … 1) Were you or your spouse (if applicable) born on or before March 1, 1959? NOTE: Only retirement income received by the taxpayer born on or before March 1, 1959 qualifies for this modification. AND 2) Is your Federal AGI less than or equal to the amount listed below for your filing status? Single $107,000; Married Joint $133,750; Qualifying Widow(er) $133,750; Married Separate $107,000; Head of Household $107,000'. TABLE (verbatim): '(a) Primary (b) Spouse — 1) Date of birth; 2) For each column, if the date of birth on line 1 is on or before March 1, 1959, enter the amount from Federal Form 1040 …, line 5b attributable to that person AND ONLY attributable to pensions and annuities. DO NOT include any amounts relating to IRAs included on Federal Form 1040 …, line 4b; 3) For each person, enter the amount from line 2 or $50,000, whichever is less; 4) Add the amounts from lines 3a and 3b together. Enter this amount and date(s) of birth on Schedule M, line 1t.' 'Military Service Pension: … do not include any amount related to a military service pension on this line. These amounts should be reported on line 1v'. DISCREPANCY: the instructions' question 2 says 'less than or equal to' while § 44-30-12(c)(9)(i) and the Social Security worksheet say 'less than' — the statute's 'less than' is encoded (a federal AGI of exactly $107,000 does not qualify). PUB 2026-01 'Rhode Island Retirement Income Tax Guide' (Publication 2026-01) repeats the looser test ('$107,000 or less') and prints the JOINT threshold as $133,500, which contradicts ADV 2025-22, the booklet table and the Social Security worksheet — all three print $133,750, and $133,750 is encoded. The same publication confirms the per-person cap in terms: 'Under the Rhode Island Pension and Annuity Income Modification, the $50,000 limit applies on an individual basis' and 'the annual $50,000 limit per individual', with 'For a married couple filing joint return, \"full retirement age\" requirement applies to each spouse. If only one spouse has reached full retirement age, the Rhode Island Pension and Annuity Income Modification applies only to that spouse's taxable pension and annuity income.' ENCODING: per person, min(pension for that person, $50,000) when that person has full retirement age; the spouse column only on a joint return. Thresholds index yearly — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "5000000", type: "money" }, agiLimitSingleHohMfs: { value: "10700000", type: "money" }, agiLimitJoint: { value: "13375000", type: "money" } },
    formula: (() => {
      const limit: Expr = iff(isJoint, money("13375000"), money("10700000"));
      const a: Expr = iff(fact("riTaxpayerFullRetirementAge"), minE(max0(fact("riTaxpayerPensionIncome")), money("5000000")), money("0"));
      const b: Expr = iff(and(isMfjOnly, fact("riSpouseFullRetirementAge")), minE(max0(fact("riSpousePensionIncome")), money("5000000")), money("0"));
      return iff(lt(fact("riFederalAgi"), limit), add(a, b), money("0"));
    })(),
  },
  {
    id: "us.ri.child_dependent_care_credit",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island credit for child and dependent care expenses — 25% of the federal credit (Schedule 3 line 2), not more than the Rhode Island income tax; nonrefundable (RI Schedule I lines 19-22, Form RI-1040 line 9a)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(F)(I)(g); 2025 RI-1040 Instructions p. I-6 (RI Schedule I lines 19-22); printed Form RI-1040 page 3, RI Schedule I",
      section: "§ 44-30-2.6(c)(3)(F)(I)(g); RI Schedule I; Form RI-1040 line 9a",
      url: FORM_URL,
      excerpt:
        "STATUTE (verbatim): '(g) Child and Dependent Care: Credit shall be allowed for twenty-five percent (25%) of the federal child and dependent care credit allowable for the taxable year for federal purposes; provided, however, such credit shall not exceed the Rhode Island tax liability.' SCHEDULE I (verbatim): '19 RI income tax from page 1, line 8; 20 Credit for child and dependent care expenses from Federal Form 1040 or 1040-SR, Schedule 3, line 2; 21 Tentative allowable federal credit. Multiply line 20 by 25% (0.2500); 22 MAXIMUM CREDIT. Line 19 or 21, whichever is SMALLER. Enter here and on page 1, line 9a.' INSTRUCTIONS: 'Line 9a – Rhode Island Percentage of Allowable Federal Credit: Enter the amount of allowable federal credit from page 3, RI Schedule I, line 22.' ENCODING: min(round(25% × federal credit), line 8 tax). Unindexed — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "25", type: "int" } },
    formula: minE(rd(pct(max0(fact("riFederalChildCareCredit")), "1", "4")), max0(fact("riIncomeTax"))),
  },
  {
    id: "us.ri.other_state_credit",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island credit for income taxes paid to another state — the smallest of the Rhode Island tax after the Schedule I credit, that tax × (income derived from the other state ÷ modified federal AGI, four decimals, ≤ 1.0000), and the tax due and paid to the other state (RI Schedule II lines 23-29, Form RI-1040 line 9b)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-18(a)-(b); § 44-30-2.6(c)(3)(F)(I)(d); 2025 RI-1040 Instructions p. I-6 (RI Schedule II lines 23-29); printed Form RI-1040 page 3, RI Schedule II; Form RI-1040MU (multiple states)",
      section: "§ 44-30-18; RI Schedule II; Form RI-1040 line 9b",
      url: RIGL("44-II", "18"),
      excerpt:
        "STATUTE (verbatim): '(a) General. A resident shall be allowed a credit, against the Rhode Island personal income tax otherwise due for the taxable year, for the aggregate of net income taxes imposed on him or her for the taxable year by other states (including the District of Columbia) of the United States if the taxes are imposed irrespective of the residence or domicile of the taxpayer. (b) Limitation of credit. The credit shall not exceed the proportion of the taxpayer's Rhode Island personal income tax that the taxpayer's Rhode Island income derived from the other taxing states bears to his or her entire Rhode Island income for the same taxable year.' SCHEDULE II (verbatim): '23 RI income tax from RI-1040, page 1, line 8 less allowable federal credit from RI-1040, page 3, line 22; 24 Income derived from other state. If more than one state, see instructions; 25 Modified federal AGI from page 1, line 3; 26 Divide line 24 by line 25 [_ . _ _ _ _]; 27 Tentative credit. Multiply line 23 by line 26; 28 Tax due and paid to other state (see specific instructions). Insert abbreviation for state paid; 29 MAXIMUM TAX CREDIT. Line 23, 27 or 28, whichever is the SMALLEST. Enter here and on pg 1, line 9b.' INSTRUCTIONS (verbatim): 'Line 26 – Divide line 24 by line 25. If greater than 1.0000, enter 1.0000.' 'Out-of-state gross income is determined in the same manner as that which would be used for Federal purposes and generally includes the net amounts of income that appear on the face of the other state's return'. 'If you owe no tax to the other state(s) and are to be refunded all the taxes withheld or paid to the other state(s), enter $0.00 on line 28.' 'NOTE: You must attach a signed copy of each state return for which you are claiming credit.' Multiple states: one Form RI-1040MU part per state, the line 29 income total and the line 30 credit total flow to Schedule II lines 24 and 28 with 'MU'. ENCODING: ratio to four decimals half-up capped at 1.0000; line 27 rounded to whole dollars; $0 when modified federal AGI is not positive. Unindexed — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "4", type: "int" } },
    formula: (() => {
      const l23 = max0(fact("riIncomeTaxAfterFederalCredit"));
      const l25 = fact("riModifiedAgi");
      const l27 = applyRatio(l23, ratio4(fact("riOtherStateIncome"), l25));
      return iff(gt(l25, money("0")), minE(l23, l27, max0(fact("riOtherStateTaxPaid"))), money("0"));
    })(),
  },
  {
    id: "us.ri.eitc",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island earned income credit — 16% of the federal earned income credit; fully refundable (RI Schedule EIC lines 39-41, Form RI-1040 line 14d)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(2)(N)(1)-(2) (16% for tax years beginning on or after January 1, 2024; the excess over the tax is 100% refundable from 2015); 2025 RI-1040 Instructions p. I-7 (RI Schedule EIC lines 39-41); printed Form RI-1040 page 3, RI Schedule EIC",
      section: "§ 44-30-2.6(c)(2)(N); RI Schedule EIC; Form RI-1040 line 14d",
      url: RIGL("44-I", "2.6"),
      excerpt:
        "STATUTE (verbatim): 'For tax years beginning on or after January 1, 2024, a taxpayer entitled to a federal earned-income credit shall be allowed a Rhode Island earned-income credit equal to sixteen percent (16%) of the federal earned-income credit. Such credit shall not exceed the amount of the Rhode Island income tax. (2) Refundable portion. In the event the Rhode Island earned-income credit allowed under paragraph (N)(1) of this section exceeds the amount of Rhode Island income tax, a refundable earned-income credit shall be allowed as follows. … (ii) For tax years beginning on or after January 1, 2015, for purposes of paragraph (2) refundable earned-income credit means one hundred percent (100%) of the amount by which the Rhode Island earned-income credit exceeds the Rhode Island income tax.' SCHEDULE EIC (verbatim): '39 Federal earned income credit from Federal Form 1040 or 1040-SR, line 27a; 40 Rhode Island percentage 16%; 41 RI EARNED INCOME CREDIT. Multiply line 39 by line 40. Enter here and on RI-1040, page 2, line 14d.' Form RI-1040 line 14d sits among 'PAYMENTS AND PROPERTY TAX RELIEF CREDIT' ('d RI earned income credit from page 3, RI Schedule EIC, line 41'), so the whole credit is refundable through line 14g. ENCODING: round(16% × federal EIC). The FY2027 budget did not change the rate — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "16", type: "int" } },
    formula: rd(pct(max0(fact("riFederalEic")), "16", "100")),
  },
  {
    id: "us.ri.property_tax_relief_credit",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island property tax relief credit 2025 (Form RI-1040H) — for a claimant 65 or older or disabled with household income of $40,730 or less: property taxes (or 20% of rent) over 3% to 6% of household income by income band and household size, up to $700; refundable; not for a dependent of another (Form RI-1040 line 14c)",
    citation: {
      source: "R.I. Gen. Laws §§ 44-33-3(1)-(3), (6)-(7), 44-33-9 (income ranges and the $600 maximum indexed by CPI-U from 2023, rounded up to $5), 44-33-16; ADV 2025-22 'Property tax relief credit – income ranges by tax year' and 'maximum credit amount' (2025: $700); 2025 Form RI-1040H Parts 1-5 and the Computation Table; 2025 RI-1040 Instructions p. I-5 (line 14c)",
      section: "§§ 44-33-3, 44-33-9; Form RI-1040H lines 1-13; Form RI-1040 line 14c",
      url: FORMS + "2026-01/2025%201040H_w.pdf",
      excerpt:
        "STATUTE (§ 44-33-9, verbatim): '(1) For any taxable year, a claimant is entitled to a credit against his or her tax liability equal to the amount by which the property taxes accrued or rent constituting property taxes accrued upon the claimant's homestead for the taxable year exceeds a certain percentage of the claimant's total household income for that taxable year, which percentage is based upon income level and household size. The credit shall be computed in accordance with the following table: Income Range — 1 Person — 2 or More Persons: less than $6000 3% 3%; $6001-9000 4% 4%; $9001-12000 5% 5%; $12001-15000 6% 5%; $15001-35000 6% 6%. (2) … For tax years beginning on or after January 1, 2022, the maximum credit shall be six hundred dollars ($600). For tax years beginning on or after January 1, 2023, the income range provided pursuant to subsection (1) of this section and the maximum credit granted pursuant to subsection (2) of this section shall be adjusted by the percentage increase in the Consumer Price Index for all Urban Consumers (CPI-U) … Said adjustment shall be compounded annually and shall be rounded up to the nearest five dollar ($5.00) increment.' § 44-33-3: '(1) \"Claimant\" means a homeowner or renter, sixty-five (65) years of age or older, and/or disabled, who has filed a claim under this chapter and was domiciled in this state for the entire calendar year … Claimant shall not mean or include any person claimed as a dependent by any taxpayer under the Internal Revenue Code'; '(2) \"Disabled\" means those persons who are receiving a social security disability benefit.'; '(3) … Twenty percent (20%) of the annual gross rental plus the space rental fees paid during the year are the annual \"property taxes accrued.\"'; '(7) \"Income\" means the sum of federal adjusted gross income … and all non-taxable income'. ADV 2025-22 (verbatim): 'Property tax relief credit – income ranges by tax year — 2025 Household income / Percentage of income allowable as credit (1 person / 2 or more): Less than $6,991 3% 3%; $6,991 - $10,480 4% 4%; $10,481 - $13,970 5% 5%; $13,971 - $17,460 6% 5%; $17,461 - $40,730 6% 6%.' 'Property tax relief credit – maximum credit amount by tax year — 2025: $700.' FORM RI-1040H (verbatim): 'PART 1 ELIGIBILITY … A Were you domiciled in Rhode Island for all of 2025?; B In 2025 did you live in a household or rent a dwelling that was subject to property tax?; C Are you current for property taxes or rent due on the homestead for 2025 and all prior years?; D Were you or your spouse 65 years of age or older and/or disabled as of December 31, 2025?; E Was your 2025 total household income from page 2, line 32 $40,730 or less?' 'PART 3 HOMEOWNERS: 2 Enter the amount of property taxes you paid or will pay for 2025; 3 Using your household income from line 1b enter percentage from the computation table located on pg 3; 4 Multiply amount on line 1b by percentage on line 3; 5 Tentative credit. Subtract line 4 from line 2. If line 4 is greater than line 2, enter zero; 6 PROPERTY TAX RELIEF. Line 5 or $700.00, whichever is LESS.' 'PART 4 RENTERS: 7 Enter the amount of rent you paid in 2025; 8 Multiply the amount on line 7 by twenty (20) percent (0.2000); 9 Using your household income from line 1b enter percentage from the computation table …; 10 Multiply amount on line 1b by percentage on line 9; 11 Tentative credit. Subtract line 10 from line 8. If line 10 is greater than line 8, enter zero; 12 PROPERTY TAX RELIEF. Line 11 or $700.00, whichever is LESS. 13 PROPERTY TAX RELIEF. Line 6 or line 12, whichever applies. Enter here and on Form RI-1040, line 14c.' 'RENTED LAND: If you live on land that is rented and your home or trailer is subject to property tax. Multiply the amount of rent you paid in 2025 by 20% and add the amount to the property tax paid. Then enter the total on RI-1040H, line 2.' 'The maximum amount of credit allowable under Chapter 44-33, Property Tax Relief Act, for calendar year 2025 is $700.00.' ENCODING: base = property tax paid + 20% of rent (covers homeowners, renters, and rented land); income × percentage rounded to whole dollars; credit = min(max0(base − income × pct), $700); $0 unless riAge65OrDisabled, household income ≤ $40,730, and not claimable by another; riHouseholdMembers ≥ 2 selects the '2 or more' column. Indexed — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maximumCredit: { value: "70000", type: "money" },
      incomeLimit: { value: "4073000", type: "money" },
      band1Top: { value: "699100", type: "money" },
      band2Top: { value: "1048000", type: "money" },
      band3Top: { value: "1397000", type: "money" },
      band4Top: { value: "1746000", type: "money" },
      rentPct: { value: "20", type: "int" },
    },
    formula: (() => {
      const income = max0(fact("riHouseholdIncome"));
      const two = ge(fact("riHouseholdMembers"), int("2"));
      const pctPoints: Expr = iff(lt(income, money("699100")), money("3"), iff(le(income, money("1048000")), money("4"), iff(le(income, money("1397000")), money("5"), iff(le(income, money("1746000")), iff(two, money("5"), money("6")), money("6")))));
      const floor = rd({ kind: "mulDiv", a: income, b: pctPoints, c: money("100"), round: "half-up" });
      const base = add(max0(fact("riPropertyTaxPaid")), rd(pct(max0(fact("riRentPaid")), "20", "100")));
      const credit = minE(max0(sub(base, floor)), money("70000"));
      const ok = and(fact("riAge65OrDisabled"), le(income, money("4073000")), not(fact("isClaimedAsDependent")));
      return iff(ok, credit, money("0"));
    })(),
  },
  {
    id: "us.ri.use_tax",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island individual use tax — 7% of untaxed purchases less sales tax paid to other states, or the safe-harbor lookup table on federal AGI ($5 under $8,350 … $60 under $100,300, then 0.08% of federal AGI) plus 7% on each single purchase of $1,000 or more (RI Schedule U, Form RI-1040 line 12a)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-100; 2025 RI Schedule U lines 1-8 and the Use Tax Table; 2025 RI-1040 Instructions p. I-11 (RI Schedule U)",
      section: "§ 44-30-100; RI Schedule U; Form RI-1040 line 12a",
      url: FORMS + "2026-01/2025%20RI%20Schedule%20U_w.pdf",
      excerpt:
        "INSTRUCTIONS (verbatim): 'Pursuant to R.I. Gen. Laws § 44-30-100, when reporting the amount of use tax obligation on the Rhode Island personal income return, the taxpayer shall list either the actual amount (from books, records, and other sources), or an amount using a lookup table established by the tax administrator. … To determine the amount of use tax from the lookup table, the taxpayer shall multiply 0.0008 by the amount of the taxpayer's federal AGI as listed on the Rhode Island personal income tax return before modifications, adjustments, or other changes. If a taxpayer uses the lookup table, the taxpayer shall list on the return not only the result from the lookup table, but also the actual amount of each single purchase whose purchase price equals or exceeds one thousand dollars ($1,000). … the use of the lookup table as described in this section is, for the taxpayer, a \"safe harbor\" alternative'. SCHEDULE U (verbatim): 'Option #1 - Actual Use Tax Due: 1 Enter the total price of purchases subject to the use tax; 2 Use tax due. Multiply line 1 by 7% (0.07); 3 Enter the amount of sales taxes paid in other states for the purchases on line 1; 4 Net use tax due. Subtract line 3 from line 2. Enter here and on RI-1040, pg 1, line 12a. Option #2 - Rhode Island Use Tax Lookup Table: 5 Enter your 2025 Federal AGI from Form RI-1040 …, line 1; 6 Use tax due. Multiply line 5 by 0.0008 or enter the amount from the Rhode Island Use Tax Lookup Table below; 7 … list the actual amount of each single purchase greater than or equal to $1,000.00 [Product Cost, Tax Due (Cost x 7%), Sales Tax Paid, Sales Tax Due]; 7e Net use tax due on purchases equal to or greater than $1,000; 8 Use tax due. Add lines 6 and 7e.' USE TAX TABLE (verbatim, 'Federal AGI … At least / Less than / Use Tax Amount'): '$0 8,350 $5; 8,350 16,700 10; 16,700 25,050 15; 25,050 33,400 20; 33,400 41,750 25; 41,750 50,150 30; 50,150 58,500 35; 58,500 66,850 40; 66,850 75,200 45; 75,200 83,550 50; 83,550 91,950 55; 91,950 100,300 60. If your Federal AGI is $100,300 or greater, multiply Form RI-1040/NR, line 1 by 0.08% (0.0008)'. 'In Rhode Island the sales and use tax rate is 7%.' 'Clothing and footwear costing $250 or less are not taxable.' ENCODING: riUseTaxLookupTable = true applies the printed table (or 0.08% at $100,300 and over) plus riLargePurchasesNetUseTax (the line 7e net); otherwise round(7% × riUseTaxPurchases) − riSalesTaxPaidOtherStates, not below zero. The table bands are the Division's 2025 figures — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { rateBps: { value: "700", type: "int" }, lookupBps: { value: "8", type: "int" }, lookupTop: { value: "10030000", type: "money" }, largePurchaseThreshold: { value: "100000", type: "money" } },
    formula: (() => {
      const agi = max0(fact("riFederalAgi"));
      const bands: [string, string][] = [["835000", "500"], ["1670000", "1000"], ["2505000", "1500"], ["3340000", "2000"], ["4175000", "2500"], ["5015000", "3000"], ["5850000", "3500"], ["6685000", "4000"], ["7520000", "4500"], ["8355000", "5000"], ["9195000", "5500"], ["10030000", "6000"]];
      // 0.08% of federal AGI, ONE half-up rounding to whole dollars — rounding to cents
      // first double-rounds (0.0008 x $100,619 = 80.4952, which the form prints as $80)
      let table: Expr = dollarsFromScaled(times(agi, "8"));
      for (let i = bands.length - 1; i >= 0; i--) table = iff(lt(agi, money(bands[i][0])), money(bands[i][1]), table);
      const lookup = add(table, max0(fact("riLargePurchasesNetUseTax")));
      const actual = max0(sub(rd(pct(max0(fact("riUseTaxPurchases")), "7", "100")), max0(fact("riSalesTaxPaidOtherStates"))));
      return iff(fact("riUseTaxLookupTable"), lookup, actual);
    })(),
  },
  {
    id: "us.ri.parameters",
    version: 1,
    jurisdiction: "us.ri",
    title: "Rhode Island 2025 Form RI-1040 parameters — line structure, RI Schedule M modifications, the closed credit list, payments, and the enacted TY2026-2027 position (ADV 2025-22; FY2027 budget H 7127 Sub A)",
    citation: {
      source: "2025 RI-1040 Resident Instructions (Rev. 11/2025); printed 2025 Form RI-1040 with RI Schedules I, II, EIC, W, E; RI Schedules M, CR, U, HR1; Form RI-1040H; R.I. Gen. Laws §§ 44-30-2.6, 44-30-12, 44-30-18, 44-30-100, 44-33-1 et seq.; Division of Taxation ADV 2024-26, ADV 2025-22, 'Summary of Legislative Changes' (July 22, 2026); web-verified September 2026",
      section: "Form RI-1040 lines 1-18",
      url: INSTR_URL,
      excerpt:
        "STRUCTURE (printed 2025 Form RI-1040): filing status Single / Married filing jointly / Married filing separately / Head of household / Qualifying widow(er) ('Taxpayers using the filing status of Qualifying Surviving Spouse on their Federal return should use the filing status of Qualifying Widow(er) on their Rhode Island return'); 1 'Federal AGI from Federal Form 1040 or 1040-SR, line 11a'; 2 'Net modifications to Federal AGI from RI Sch M, line 3'; 3 'Modified Federal AGI. Combine lines 1 and 2'; 4 standard deduction (→ us.ri.standard_deduction); 5 = 3 − 4, not below zero; 6 exemptions × $5,100 (→ us.ri.exemption); 7 'RI TAXABLE INCOME. Subtract line 6 from line 5. If zero or less, enter 0'; 8 'RI income tax from Rhode Island Tax Table or Tax Computation Worksheet' (→ us.ri.income_tax); 9a Schedule I credit (→ us.ri.child_dependent_care_credit); 9b Schedule II other-state credit (→ us.ri.other_state_credit); 9c 'Other Rhode Island Credits from RI Schedule CR, line 9' (RI-0715 historic homeowner carryforwards, RI-2276 scholarship organizations, RI-286B historic structures, RI-5442 low income housing, RI-6754 qualified jobs, RI-7253 Rebuild RI, RI-8201 motion picture and musical/theatrical, RI-9283 Wavemaker — certificate credits); 9d total credits; 10a 'Rhode Island income tax after credits. Subtract line 9d from line 8 (not less than zero)'; 10b 'Recapture of Prior Year Other Rhode Island Credits from RI Schedule CR, line 12'; 11 'RI checkoff contributions from page 3, RI Checkoff Schedule, line 38' (lines 30-37: Drug program account, Olympic contribution ($1 / $2 joint), RI Organ Transplant Fund, RI Council on the Arts, RI Nongame Wildlife Fund, Childhood Disease Victim's Fund, RI Military Family Relief Fund, Behavioral health education fund — 'These checkoff contributions will increase your tax due or reduce your refund'); 12a use/sales tax (→ us.ri.use_tax); 12b 'Individual Mandate Penalty' (Form IND-HEALTH / Shared Responsibility Worksheet line 15 — transcribed); 13a 'TOTAL RI TAX AND CHECKOFF CONTRIBUTIONS. Add lines 10a, 10b, 11, 12a and 12b'; 13b = 13a; 14a 'RI 2025 income tax withheld from RI Schedule W, line 16' (W-2 box 17, 1099s, RI K-1 PTE/PTW amounts); 14b '2025 estimated tax payments and amount applied from 2024 return'; 14c 'Property tax relief credit from RI-1040H, line 13' (→ us.ri.property_tax_relief_credit); 14d 'RI earned income credit from page 3, RI Schedule EIC, line 41' (→ us.ri.eitc); 14e 'RI Residential Lead Paint Credit from RI-6238, line 7' (transcribed); 14f 'Other payments' (Form RI-4868 extension payment); 14g total payments and credits; 14h 'Previously issued overpayments (if filing an amended return)'; 14i net payments; 15a 'AMOUNT DUE. If line 13b is LARGER than line 14i, subtract line 14i from line 13b'; 15b underestimating interest (Form RI-2210 / RI-2210A) 'added to line 15a or subtracted from line 16'; 15c total amount due ('An amount due of less than five dollars ($5) need not be paid'); 16 'AMOUNT OVERPAID. If line 14i is LARGER than line 13b, subtract line 13b from line 14i'; 17 refund ('Refunds of less than $5.00 will not be paid unless specifically requested'); 18 overpayment applied to 2026. RI SCHEDULE M (decreasing, lines 1a-1x): U.S. obligation interest less related investment interest (§ 44-30-12(c)(1)), fiduciary adjustment, R&D facilities, Railroad Retirement benefits, venture capital, Family Education Accounts, 529 contributions 'Not to exceed $500 ($1,000 if joint return)' (§ 44-30-12(c)(4)), artists in economic development zones, bonus depreciation and § 179 recovery (§§ 44-61-1, 44-61-1.1), Jobs Growth Act compensation, qualifying options / securities, employer tax incentives, exempt tax credit income, nonresident military pay, Scituate MSA, dependent/domestic partner insurance benefits, organ donation up to $10,000, 1s Social Security (→ us.ri.social_security_modification), 1t pensions and annuities up to $50,000 (→ us.ri.pension_modification), 1u cash-basis PTE refund, 1v military service pensions in full (§ 44-30-12(c)(11)), 1w cannabis § 280E expenses, 1x § 174A amortization; (increasing, 2a-2l): out-of-state state and municipal bond interest (§ 44-30-12(b)(1)-(2)), fiduciary adjustment, Family Education Account recapture, bonus depreciation (§ 44-61-1: 'any bonus depreciation taken for federal purposes must be added back'), 529 recapture, tax credit income recapture, Scituate MSA recapture, 2h pass-through entity tax elected to be paid (§ 44-11-2.3), 2i unemployment compensation not in federal AGI, 2j PPP loan forgiveness over $250,000, 2k 'Add back of Federal P.L. 119-21, H.R.1 Provisions from 2025 RI Schedule HR1 - Individual, line 1f' (§ 44-30-12(b)(9): §§ 163(j), 174A, 179(b), 181 — the 2025 Instructions: 'Section 179 depreciation will remain limited to $25,000 for Rhode Island income tax purposes'). CREDITS: § 44-30-2.6(c)(3)(F)(I) — 'the only credits allowed against a tax imposed under this chapter shall be as follows: (a) Rhode Island earned-income credit …; (b) Property Tax Relief Credit …; (c) Lead Paint Credit …; (d) Credit for income taxes of other states …; (e) Historic Structures Tax Credit …; (f) Motion Picture Productions Tax Credit …; (g) Child and Dependent Care: … twenty-five percent (25%) …; (h) … Scholarship Organizations …; (i) Credit for tax withheld …; (j) Stay Invested in RI Wavemaker Fellowship …; (k) Rebuild Rhode Island …; (l) Rhode Island Qualified Jobs Incentive Program …; (m) Historic homeownership assistance act … carryforward'. ROUNDING: whole dollars (the printed return has no cents boxes); a $5 de minimis on amounts due and refunds. SCOPE: full-year residents; part-year and nonresidents file RI-1040NR (Schedules II/III — not composed); no county or municipal income tax. DEADLINES: April 15, 2026 (automatic six-month extension for filing, not payment); Form RI-1040H and RI-6238 must be filed by April 15, 2026 regardless. TY2026 (ADV 2025-22, November 3, 2025): brackets $82,050 / $186,450 ('Uniform tax rate schedule for Tax Year 2026: 0 - 82,050 3.75%; 82,050 - 186,450 3,076.88 + 4.75%; 186,450 - 8,035.88 + 5.99%'), standard deduction $11,200 / $22,400 / $16,800 / $11,200, exemption $5,250, phase-out $261,000 to $290,800 in $7,450 steps — versions 2; the Social Security / pension thresholds and the RI-1040H amounts for 2026 publish ~November 2026. TY2027 (H 7127 Sub A, approved June 12, 2026, Division summary July 22, 2026): a High-Income Surtax of 1% on personal income over $1,000,000 (indexed; 2% for 2028, 3% for 2029 and after) 'applies to all personal income tax filers'; a refundable $330 Child Tax Credit per child 18 or under, phased out 20 points per $2,875 over $88,500 ($3,590 over $110,640 joint); the Social Security modification's age test is eliminated ('while keeping the income threshold'); the H.R. 1 decoupling becomes permanent (§ 174A from 2026; §§ 163(j) and 1202 from 2027). TY2025 was untouched by the 2026 session.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tuitionSavingsCap: { value: "50000", type: "money" },
      tuitionSavingsCapJoint: { value: "100000", type: "money" },
      organDonationCap: { value: "1000000", type: "money" },
      section179Cap: { value: "2500000", type: "money" },
      deMinimisDueOrRefund: { value: "500", type: "money" },
      olympicCheckoff: { value: "100", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Rhode Island Form RI-1040 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ri.income_tax, us.ri.standard_deduction, us.ri.exemption, us.ri.social_security_modification, us.ri.pension_modification, us.ri.child_dependent_care_credit, us.ri.other_state_credit, us.ri.eitc, us.ri.property_tax_relief_credit, and us.ri.use_tax",
    },
  },

  // ---- TY2026 versions: ADV 2025-22 (November 3, 2025) and the 2026 Form RI-1040ES ----
  {
    id: "us.ri.income_tax",
    version: 2,
    jurisdiction: "us.ri",
    title: "Rhode Island income tax TY2026 — uniform rate schedule 3.75% to $82,050, 4.75% to $186,450, 5.99% above (worksheet subtraction amounts $820.50 / $3,132.48) (Form RI-1040 line 8)",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(A)(I) indexed under (E); Division of Taxation ADV 2025-22 (November 3, 2025) 'Uniform tax rate schedule for Tax Year 2026'; 2026 Form RI-1040ES '2026 Tax Rate Schedule - FOR ALL FILING STATUS TYPES'",
      section: "§ 44-30-2.6(c)(3)(A)(I), (E)",
      url: FORMS + "2025-11/ADV_2025_22_Inflation_Adjustments.pdf",
      excerpt:
        "ADV 2025-22 (verbatim): 'Uniform tax rate schedule for Tax Year 2026 (Personal Income Tax) — Taxable income: Over $0 But not over $82,050 Pay -- + 3.75% of the amount over $0; 82,050 / 186,450 / 3,076.88 / 4.75% / 82,050; 186,450 / / 8,035.88 / 5.99% / 186,450.' 2026 FORM RI-1040ES (verbatim): '2026 Tax Rate Schedule - FOR ALL FILING STATUS TYPES: $0 - $82,050 — 3.75% — $0; 82,050 - 186,450 — 3,076.88 + 4.75% — 82,050; 186,450 - .......... — 8,035.88 + 5.99% — 186,450'. ENCODING: the schedule evaluated EXACTLY at the taxable income, in the Tax Computation Worksheet's form (rate x taxable income minus a subtraction constant), one half-up rounding to whole dollars. The printed 'Pay' anchors $3,076.88 and $8,035.88 are display roundings of 3,076.875 (= 82,050 x 3.75%) and 8,035.875 (= 3,076.875 + 104,400 x 4.75%); applying the ROUNDED anchor plus the rate on the excess carries a +$0.005 bias into every income above $82,050 and overstates the tax by $1 at 1,589 of the 400,001 whole-dollar incomes to $400,000 (first at $82,421: exact 3,094.4975 -> $3,094, rounded-anchor method 3,094.5025 -> $3,095). The Division's filed-return method is the worksheet, whose constants are exact by construction — TY2025 proves it: the printed worksheet constants $799.00 and $3,051.46 are exact while that year's schedule anchor $7,829.38 is rounded from 7,829.375, and the 2025 worksheet governs the filed return. The 2026 constants are therefore 82,050 x (4.75% - 3.75%) = $820.50 and 820.50 + 186,450 x (5.99% - 4.75%) = $3,132.48 — arithmetic on published thresholds and rates, not an invented figure. Neither the 2026 Tax Table nor the 2026 Tax Computation Worksheet is published yet (both ~December 2026): this rule does not reproduce a $50-row table, so expect at most half a row of divergence from the eventual printed table below $100,000, and re-verify the worksheet constants when it publishes.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { bracket1: { value: "8205000", type: "money" }, bracket2: { value: "18645000", type: "money" }, subtraction2: { value: "82050", type: "money" }, subtraction3: { value: "313248", type: "money" }, publishedAnchor2: { value: "307688", type: "money" }, publishedAnchor3: { value: "803588", type: "money" } },
    formula: worksheetTax(max0(fact("stateTaxableIncome")), ROWS_2026),
  },
  {
    id: "us.ri.standard_deduction",
    version: 2,
    jurisdiction: "us.ri",
    title: "Rhode Island standard deduction TY2026 — $11,200 single and MFS, $22,400 MFJ and qualifying widow(er), $16,800 HOH; phased out over $261,000 in $7,450 steps, zero past $290,800",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(B) indexed under (E); ADV 2025-22 (November 3, 2025); 2026 Form RI-1040ES Deduction Worksheet lines 15-22",
      section: "§ 44-30-2.6(c)(3)(B)",
      url: FORMS + "2025-11/ADV_2025_22_Inflation_Adjustments.pdf",
      excerpt:
        "ADV 2025-22 (verbatim): 'Rhode Island standard deduction amounts by Tax Year — 2026: Single $11,200; Married filing jointly* $22,400; Head of household $16,800; Married filing separately $11,200.' 'Phase-out range for standard deduction, exemption amounts by Tax Year — 2026: $261,000 to $290,800. Phaseout increment (amount used in computing phaseout), which was $7,250 for 2025, will be $7,450 for 2026.' 2026 FORM RI-1040ES DEDUCTION WORKSHEET (verbatim): '16. Is the amount on line 1 more than $261,000? … 18. Deduction Phaseout Amount $261,000; 19. Subtract line 18 from line 17. If the result is more than $29,800, STOP HERE. Your standard deduction amount is zero ($0); 20. Divide line 19 by $7,450. If the result is not a whole number, increase it to the next higher whole number; 21. … 1 — 0.8000; 2 — 0.6000; 3 — 0.4000; 4 — 0.2000; 22. Deduction amount - Multiply line 15 by line 21.'",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { single: { value: "1120000", type: "money" }, joint: { value: "2240000", type: "money" }, hoh: { value: "1680000", type: "money" }, phaseoutThreshold: { value: "26100000", type: "money" }, phaseoutStep: { value: "745000", type: "money" } },
    formula: (() => {
      const base: Expr = iff(isJoint, money("2240000"), iff(isHoh, money("1680000"), money("1120000")));
      return applyRatio(base, phaseoutPct(fact("riModifiedAgi"), "26100000", "745000"));
    })(),
  },
  {
    id: "us.ri.exemption",
    version: 2,
    jurisdiction: "us.ri",
    title: "Rhode Island exemption TY2026 — $5,250 per exemption, phased out over $261,000 in $7,450 steps, zero past $290,800",
    citation: {
      source: "R.I. Gen. Laws § 44-30-2.6(c)(3)(C), (D) indexed under (E); ADV 2025-22 (November 3, 2025); 2026 Form RI-1040ES Exemption Worksheet lines 23-30",
      section: "§ 44-30-2.6(c)(3)(C), (D)",
      url: FORMS + "2025-11/ADV_2025_22_Inflation_Adjustments.pdf",
      excerpt:
        "ADV 2025-22 (verbatim): 'Rhode Island personal and dependency exemption amounts by Tax Year — 2026: $5,250.' 2026 FORM RI-1040ES EXEMPTION WORKSHEET (verbatim): '23. Multiply $5,250 by the total number of exemptions; 24. Is the amount on line 1 more than $261,000? … 26. Exemption Phaseout Amount $261,000; 27. Subtract line 26 from line 25. If the result is more than $29,800, STOP HERE. Your exemption amount is zero ($0); 28. Divide line 27 by $7,450 …; 29. … 1 — 0.8000; 2 — 0.6000; 3 — 0.4000; 4 — 0.2000; 30. Exemption amount - Multiply line 23 by line 29.'",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "525000", type: "money" }, phaseoutThreshold: { value: "26100000", type: "money" }, phaseoutStep: { value: "745000", type: "money" } },
    formula: applyRatio(mulInt(money("525000"), fact("riExemptions")), phaseoutPct(fact("riModifiedAgi"), "26100000", "745000")),
  },
];
