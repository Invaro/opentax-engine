import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Delaware deep pack — TY2025 Form PIT-RES (full-year resident). Every amount
 * verified from the 2025 PIT-RES Instructions (15 pp, "Revised 03/26/26"), the
 * printed 2025 Form PIT-RES ("Revision 20260407"), Form PIT-RSA, the 2025 State
 * Income Tax Table (TY25_taxtable.pdf, 3 pp), the 2026 Form PIT-EST
 * Instructions ("Revised 11/10/25"), and Title 30 of the Delaware Code
 * (§§ 1102, 1105, 1106, 1108, 1109, 1110) at delcode.delaware.gov.
 *
 * NAMING: Delaware retired the "200-01" form number. The TY2025 resident return
 * is Form PIT-RES; the non-resident return is PIT-NON.
 *
 * Load-bearing findings:
 *  - ONE rate schedule for every filing status (§ 1102(a)(14)): 0% to $2,000,
 *    then 2.2% / 3.9% / 4.8% / 5.2% / 5.55% at $5,000 / $10,000 / $20,000 /
 *    $25,000 / $60,000, and $2,943.50 + 6.6% above $60,000. Filing status moves
 *    the standard deduction and the personal credits, never the rate. The
 *    rates have been untouched since 79 Del. Laws c. 10 (2013) and the brackets
 *    are NOT indexed.
 *  - Below $60,000 the printed Tax Table governs (§ 1102(d)(1)); at $60,000 or
 *    more the schedule does. The table is the statutory schedule at the row
 *    midpoint, half-up — proved on all 1,162 printed rows with NO exceptions
 *    (two $1,000 rows below $2,000, both $0, then $50 rows to $60,000).
 *  - Delaware grants a personal CREDIT, not an exemption deduction: $110 per
 *    federal exemption plus $110 for each person 60 or over (§ 1110(b)),
 *    nonrefundable and capped at the tax (§ 1110(c)), and ZERO for a filer
 *    claimed as a dependent on another return.
 *  - The standard deduction is $3,250 ($6,500 only on a joint return), unindexed
 *    since TY2000, plus $2,500 per checked box for 65-or-over and blindness
 *    (up to $5,000 per person) — but ONLY for non-itemizers.
 *  - Filing status 4 is "Married & Filing Combined Separate on this form": two
 *    independent returns printed side by side, Column A the spouse and Column B
 *    the taxpayer. Each column gets its own $3,250 deduction and its own trip
 *    through the bracket structure. The composer runs it as two returns.
 *
 * Where the sources disagree, and what is encoded:
 *  - The Tax Table's schedule prints the $60,000 hinge as $2,943.50, which is
 *    the exact statutory cumulative amount (66 + 195 + 480 + 260 + 1,942.50);
 *    the 2026 PIT-EST estimated-tax worksheet rounds it to $2,943.00. The
 *    exact $2,943.50 is encoded — the estimated-tax sheet is a planning aid,
 *    and it is the filing-season table that governs the return.
 *  - The Line 11 exclusion: § 1106(b)(2) says "over 60 years of age" while the
 *    printed Line 11 worksheet asks "at least 60 years old". The form's test is
 *    encoded (a person who turns exactly 60 qualifies), consistent with the
 *    age-60 test the personal credit and pension exclusion both use.
 *  - The booklet cites the federal early-withdrawal penalty at "Schedule 2,
 *    Line 8" under the pension exclusion and "Schedule 2, Line 6" under the
 *    lump-sum text, for the same test. Neither line number is encoded.
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
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** Delaware filing status 2 — the ONLY status with a doubled standard deduction */
const isJointReturn: Expr = isStatus("mfj");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents x 10^4) -> whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");

/**
 * The § 1102(a)(14) schedule as a scaled-integer accumulation: the printed
 * cumulative anchor plus the marginal rate on the excess, ONE half-up rounding
 * to whole dollars. Anchors are exact, not rounded — 66 / 261 / 741 / 1,001 /
 * 2,943.50 all fall out of the statute without any truncation.
 */
type Band = { floorCents: string; anchorCents: string; rateBps: string };
const BANDS_2025: Band[] = [
  { floorCents: "200000", anchorCents: "0", rateBps: "220" }, // 2.2% over $2,000
  { floorCents: "500000", anchorCents: "6600", rateBps: "390" }, // $66.00 + 3.9% over $5,000
  { floorCents: "1000000", anchorCents: "26100", rateBps: "480" }, // $261.00 + 4.8% over $10,000
  { floorCents: "2000000", anchorCents: "74100", rateBps: "520" }, // $741.00 + 5.2% over $20,000
  { floorCents: "2500000", anchorCents: "100100", rateBps: "555" }, // $1,001.00 + 5.55% over $25,000
  { floorCents: "6000000", anchorCents: "294350", rateBps: "660" }, // $2,943.50 + 6.6% over $60,000
];
const scheduleTax = (x: Expr, bands: Band[]): Expr => {
  let expr: Expr = money("0"); // the zero bracket: no tax on the first $2,000
  for (const b of bands) {
    const row = dollarsFromScaled(add(times(money(b.anchorCents), "10000"), times(sub(x, money(b.floorCents)), b.rateBps)));
    expr = iff(gt(x, money(b.floorCents)), row, expr);
  }
  return expr;
};

/**
 * Form PIT-RES line 24. Below $60,000 the printed Tax Table governs: the same
 * schedule evaluated at the row midpoint. Rows are $1,000 wide below $2,000
 * (both print $0, which the schedule already gives) and $50 wide above it.
 */
const line24Tax = (x: Expr, bands: Band[]): Expr => {
  const mid = add(mulInt(money("5000"), stepUnits(x, "5000", "floor")), money("2500"));
  const table = iff(lt(x, money("200000")), money("0"), scheduleTax(mid, bands));
  return iff(fact("deUseRateSchedule"), scheduleTax(x, bands), iff(lt(x, money("6000000")), table, scheduleTax(x, bands)));
};

const FORMS = "https://revenuefiles.delaware.gov/2025/PITForms_Instructions/";
const INSTR_URL = FORMS + "Instructions/PIT-RES_Instructions_2025-01.pdf";
const FORM_URL = FORMS + "PIT-RES_2025-01_PaperInteractiveIPM.pdf";
const TABLE_URL = "https://revenuefiles.delaware.gov/2025/TY25_taxtable.pdf";
const DELC = (sub: string) => `https://delcode.delaware.gov/title30/c011/${sub}/index.html`;

export const deRules: Rule[] = [
  {
    id: "us.de.income_tax",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware income tax 2025 — one schedule for every filing status: no tax on the first $2,000, then 2.2% / 3.9% / 4.8% / 5.2% / 5.55% at $5,000 / $10,000 / $20,000 / $25,000 / $60,000, and $2,943.50 plus 6.6% above $60,000; the printed Tax Table (row midpoint) below $60,000 (Form PIT-RES line 24)",
    citation: {
      source:
        "30 Del. C. § 1102(a)(14) (rates, as enacted by 79 Del. Laws c. 10 (2013) and unamended since) and § 1102(d)(1) (the Director's tax table); 2025 Delaware State Income Tax Table (TY25_taxtable.pdf) pages 1-3 and its '2025 STATE INCOME TAX SCHEDULE'; 2025 PIT-RES Instructions (Revised 03/26/26) p. 7 line 24; printed 2025 Form PIT-RES (Revision 20260407) line 24",
      section: "30 Del. C. § 1102(a)(14), (d)(1); Form PIT-RES line 24",
      url: TABLE_URL,
      excerpt:
        "STATUTE (§ 1102(a)(14), verbatim): 'For taxable years beginning after December 31, 2013, the amount of tax shall be determined as follows: 2.2% of taxable income in excess of $2,000 but not in excess of $5,000; 3.9% of taxable income in excess of $5,000 but not in excess of $10,000; 4.8% of taxable income in excess of $10,000 but not in excess of $20,000; 5.2% of taxable income in excess of $20,000 but not in excess of $25,000; 5.55% of taxable income in excess of $25,000 but not in excess of $60,000; and 6.6% of taxable income in excess of $60,000.' TABLE AUTHORITY (§ 1102(d)(1), verbatim): 'In lieu of the tax imposed by subsection (a) of this section there is imposed for each taxable year on the tax table income of every individual whose tax table income for the taxable year does not exceed $60,000 … a tax determined under tables … which shall be prescribed by the Director of Revenue. The amounts of tax prescribed in such tables shall be computed on the basis of the rates prescribed by subsection (a) of this section.' (3): 'This subsection shall not apply to an estate or trust.' TABLE (header, verbatim): '2025 STATE INCOME TAX TABLE — BASED ON TABLE INCOME FOR PERSONS WITH TAXABLE INCOMES OF LESS THAN $60,000', columns 'At least / But less than / Tax due'. SCHEDULE (table p. 3, verbatim): 'If taxable income on Line 23 of DE PIT-RES or Line 42 of DE PIT-NON is $60,000 or [more,] your tax is: $2,943.50 plus 6.60% (.066) over, for the portion over $60,000.' with the worked EXAMPLE: 'Taxable income of $67,751: Tax on $60,000 . . . $2,943.50; Income over $60,000 . . . $7,751; Tax Rate over $60,000 . . . x .066; Tax on $7,751 . . . + $511.56; Total Tax . . . $3,455.06 (Round to $3,455.)' — the Division truncates 511.566 to $511.56 on its own worked line, so its printed total reads $3,455.06 where a single rounding of 3,455.066 gives the same $3,455 INSTRUCTIONS (p. 7 line 24, verbatim): 'If Line 23 is less than $60,000, use the tax table to compute your tax liability. If line 23 is $60,000 or greater, use the tax schedule at the end of the tax table to compute your tax liability.' STRUCTURE (verified on the printed table): 1,162 rows — '0 | 1,000 | 0' and '1,000 | 2,000 | 0' at the bottom, then $50 rows from '2,000 | 2,050 | 1' to '59,950 | 60,000 | 2,942'. CONVENTION (verified on ALL 1,162 rows, zero exceptions): each cell is the statutory schedule at the row midpoint, rounded half-up — 5,875 gives 66 + 3.9% x 875 = 100.13 -> $100; 59,975 gives 2,943.50 - 5.55% x 25 = 2,942.11 -> $2,942. ONE table serves EVERY filing status: there is a single 'Tax due' column and § 1102(a) draws no distinction by status — filing status moves only the standard deduction (line 20), the additional standard deduction (line 21) and the personal credits (lines 27a-27b). ANCHORS: the cumulative amounts are EXACT, not rounded ($66, $261, $741, $1,001, $2,943.50 all fall out of the statute); the 2026 PIT-EST estimated-tax worksheet prints the last one as '$2,943.00', but the filing-season table's exact $2,943.50 is encoded. deUseRateSchedule applies the schedule below $60,000 as well (it differs from the table by at most the value of half a row). The rates and brackets are NOT indexed and have been unchanged since 79 Del. Laws c. 10 (2013).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      zeroBracketTop: { value: "200000", type: "money" },
      bracket2: { value: "500000", type: "money" },
      bracket3: { value: "1000000", type: "money" },
      bracket4: { value: "2000000", type: "money" },
      bracket5: { value: "2500000", type: "money" },
      bracket6: { value: "6000000", type: "money" },
      topAnchor: { value: "294350", type: "money" },
      topRateBps: { value: "660", type: "int" },
      tableTop: { value: "6000000", type: "money" },
    },
    formula: line24Tax(max0(fact("stateTaxableIncome")), BANDS_2025),
  },
  {
    id: "us.de.standard_deduction",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware standard deduction 2025 — $3,250, or $6,500 on a joint return, plus $2,500 for each checked box for age 65 or over and blindness (maximum $5,000 per person); not available to itemizers (Form PIT-RES lines 20a and 21)",
    citation: {
      source:
        "30 Del. C. § 1108(a)(3) (the $3,250 / $6,500 amounts, unamended since 72 Del. Laws 1st Sp. Sess. c. 241 (1999)) and § 1108(b)-(c) (the $2,500 additions and the blindness definition); 2025 PIT-RES Instructions p. 7 lines 20a and 21; printed 2025 Form PIT-RES lines 20a and 21",
      section: "30 Del. C. § 1108; Form PIT-RES lines 20a, 21",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (§ 1108(a)(3), verbatim): 'For taxable periods beginning after December 31, 1999, the standard deduction of a resident individual shall be $3,250, and the standard deduction of resident spouses shall be $6,500 if they file a joint return and $3,250 each if they file separate returns.' (b), verbatim: 'The sum of $2,500 shall be added to the standard deduction determined under subsection (a) of this section in each of the following circumstances: (1) For the taxpayer who has attained the age of 65 before the close of the taxable year; … (3) For the taxpayer who is blind at the close of the taxable year'. FORM (line 20a, verbatim): 'Filing Statuses 1, 3, & 5 enter $3250 in Column B; Filing Status 2 enter $6500 in Column B; Filing Status 4 enter $3250 in Column A and in Column B'. FORM (line 21, verbatim): 'ADDITIONAL STANDARD DEDUCTIONS (Not Allowed with Itemized Deductions) … Multiply the number of boxes checked below by $2500. … Column A - if Spouse was: 65 or over / blind   Column B - if You were: 65 or over / blind'. INSTRUCTIONS (p. 7, verbatim): 'Multiply the number of boxes checked on Line 21 by $2,500 and determine the total (a maximum of $5,000 per individual).' and '($5,000 per spouse age 65 or over and blind; $2,500 per spouse age 65 and over or blind)'. And: 'NOTE: If you elect to itemize your deductions, you do not qualify for the additional standard deduction even though you may be 65 years of age or older and/or blind. If you itemize deductions, do not check the \"65 or over\" box.' NOTE THE AGE SPLIT: the additional standard deduction uses 65, while the personal credit (§ 1110(b)(2)) and the pension exclusion (§ 1106(b)(3)b.) both use 60. The base amounts are NOT indexed and have stood at $3,250 / $6,500 since TY2000. ENCODING: the $6,500 belongs to filing status 2 (joint) ALONE — statuses 1, 3, 4 and 5 each take $3,250, and on a combined separate return (status 4) each COLUMN takes its own $3,250. The composer runs status 4 as two returns.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { base: { value: "325000", type: "money" }, joint: { value: "650000", type: "money" }, perBox: { value: "250000", type: "money" }, maxBoxesPerPerson: { value: "2", type: "int" } },
    formula: (() => {
      const base = iff(isJointReturn, money("650000"), money("325000"));
      // "a maximum of $5,000 per individual" — two boxes (65-or-over and blind) per person.
      // Four boxes on a JOINT return, and also on a married-filing-SEPARATE return (status 3):
      // § 1108(b)(2) and (b)(4) add $2,500 "for the spouse of the taxpayer if a joint return is
      // not made" when that spouse is 65 or over (or blind), "has no gross income and is not the
      // dependent of another taxpayer", and the printed line 21 offers "Column A - if Spouse
      // was: 65 or over / blind" for exactly that case. Single, head of household and qualifying
      // widow(er) are one person and cap at two. A combined separate return (status 4) is two
      // one-person columns — the composer clamps each column to two before calling this rule.
      const hasSpouseColumn: Expr = { kind: "or", args: [isJointReturn, { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfs" } }] };
      const boxes = iff(hasSpouseColumn, minE(fact("deAdditionalDeductionBoxes"), int("4")), minE(fact("deAdditionalDeductionBoxes"), int("2")));
      return iff(fact("deItemizes"), money("0"), add(base, mulInt(money("250000"), boxes)));
    })(),
  },
  {
    id: "us.de.personal_credits",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware personal credits 2025 — $110 for each federal exemption plus $110 for each person 60 or over; nonrefundable and capped at the tax otherwise due; zero for a filer claimed as a dependent on another return (Form PIT-RES lines 27a and 27b)",
    citation: {
      source: "30 Del. C. § 1110(b)-(c); 2025 PIT-RES Instructions p. 9 lines 27a and 27b; printed 2025 Form PIT-RES lines 27a, 27b and 33",
      section: "30 Del. C. § 1110(b), (c); Form PIT-RES lines 27a-27b",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (§ 1110(b), verbatim): 'For tax years beginning after December 31, 1995, resident individuals shall be allowed a personal credit against the individual's tax otherwise due under this chapter in the amount of: (1) $110 for each personal exemption to which such individual is entitled for the taxable year for federal income tax purposes; plus (2) An additional $110 in the case of each resident person age 60 or over.' (c), verbatim: 'In no event shall the credit allowed under subsection (b) of this section exceed the tax otherwise due under this chapter.' FORM (line 27a, verbatim): 'PERSONAL CREDITS / Enter number of exemptions ___ x $110 / If you are Filing Status 3, see instructions. If you use Filing Status 4, enter the total for each appropriate column. All others enter total in Column B.' FORM (line 27b, verbatim): 'CHECK BOXES — Spouse 60 or over (Column A) / Self 60 or over (Column B) / Enter number of boxes checked on Line 27b ___ x $110'. INSTRUCTIONS (p. 9, verbatim): 'Enter the total number of dependents listed on your federal return, multiply by $110 and enter the total on Line 27a. If you are married and filing a combined separate return (Filing Status 4), split the total between Columns A and B in increments of $110. You are still eligible for this credit even though you do not recognize personal exemptions on your federal return.' 'NOTE: You are not entitled to a Delaware Personal Credit if you are listed as a dependent on another individual's Federal return. Enter \"0\" in the space provided on Line 27a.' 'Example: If you filed your federal return as married filing jointly and have no dependents, enter $220.' 'If you and/or your spouse were 60 years of age or over on December 31, 2025, check the appropriate box(es), multiply the number of boxes checked by $110, and enter the total on Line 27b.' ENCODING: Delaware grants a CREDIT, not an exemption deduction — § 1110(a)'s $1,250 exemption applies only to 'tax years ending before January 1, 1996'. The count on line 27a is the federal exemption count (the taxpayer, the spouse on a joint return, and dependents), which is why a childless joint return enters $220. The age-60 credit is one per qualifying person. The cap is applied by the composer at line 33 ('If Line 32 is greater than Line 26, enter 0'), not here, so this rule reports the credit earned. The $110 amounts are NOT indexed and have stood since 72 Del. Laws 1st Sp. Sess. c. 247 (1999).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "11000", type: "money" }, perAge60: { value: "11000", type: "money" } },
    formula: iff(
      fact("isClaimedAsDependent"),
      money("0"),
      add(mulInt(money("11000"), fact("deExemptions")), mulInt(money("11000"), minE(fact("deAge60Persons"), int("2")))),
    ),
  },
  {
    id: "us.de.pension_exclusion",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware pension exclusion 2025 — $12,500 of pension and eligible retirement income at age 60 or over; under 60, $12,500 of a United States military pension or $2,000 of any other pension; one exclusion per taxpayer (Form PIT-RES line 6)",
    citation: {
      source: "30 Del. C. § 1106(b)(3)b. and f.; 2025 PIT-RES Instructions p. 6 line 6 and the 60-or-over worksheet; printed 2025 Form PIT-RES line 6",
      section: "30 Del. C. § 1106(b)(3); Form PIT-RES line 6",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (§ 1106(b)(3)b., verbatim): 'For taxable years beginning on January 1, 2022, and ending before January 1, 2027: 1. For persons under age 60, the greater of: A. Amounts received, not to exceed $2,000, as pensions from employers, the United States, this State, or any subdivision of this State; or B. Amounts received, not to exceed $12,500, as a United States military pension. 2. For persons age 60 or older, amounts received, not to exceed $12,500, as pensions from employers, the United States, this State, or any subdivision of this State, or as eligible retirement income.' INSTRUCTIONS (p. 6, verbatim): 'IF YOU WERE UNDER 60 on December 31, 2025 and retired from the United States military and received pension income during the year, your exclusion equals $12,500 or the amount of your pension, whichever is less.' 'IF YOU WERE UNDER 60 on December 31, 2025, and you receive a non-military pension, your exclusion equals $2,000 or the amount of your pension, whichever is less.' 'IF YOU WERE 60 OR OVER on December 31, 2025, your exclusion is determined as follows: 1. Amount of pension … 2. Amount of eligible retirement income … 3. Total (add lines 1 and 2) … 4. Enter Line 3 or $12,500, whichever is less here and on Line 6.' 'Eligible retirement income includes dividends, capital gains net of capital losses, interest, net rental income from real property and qualified retirement plans (IRC Sec. 4974), such as IRA, 401(k), Keogh plans, and government deferred compensation plans (IRC Sec. 457).' 'NOTE: Each taxpayer may receive ONLY ONE pension exclusion, even if he or she is receiving more than one pension or other retirement distribution. Spouses who each receive pensions are entitled to one exclusion each.' DISQUALIFIERS (verbatim): 'An early distribution from an IRA or pension fund for emergency reasons or following a separation from employment does not qualify for the pension exclusion. If the distribution code listed in Box 7 of your 1099 R is a 1 (one), or if you were assessed an early withdrawal penalty on federal 1040, Schedule 2, Line 8 for the distribution, then that distribution DOES NOT qualify.' Employer-paid disability pension income before minimum retirement age also fails. AGE TEST: 60 or over ON DECEMBER 31 of the tax year — the 'eligible retirement income' broadening belongs ONLY to the 60-or-over tier; an under-60 filer gets $2,000 of pension (or $12,500 of a military pension) and nothing for interest, dividends or capital gains. NOT ENCODED, and named here because the form does not surface it: § 1106(b)(3)f.4. conditions the 60-or-over exclusion on 3 years of Delaware legal domicile for a person domiciled here before January 1, 2027 (5 years for one domiciled here on or after that date) — an eligibility gate that appears nowhere on Form PIT-RES. This rule computes the amount and the composer discloses the domicile test. § 1106(b)(3)b. by its terms ends before January 1, 2027; 85 Del. Laws c. 426 (Senate Bill 219 with Senate Amendment 1, approved August 17, 2026) replaces it with a military-pension phase-in of $15,000 for TY2027, $20,000 for TY2028 and $25,000 for TY2029 and after, applying at ANY age, while the non-military 60-or-over exclusion stays at $12,500 and the general under-60 amount stays at $2,000 — none of those caps reaches TY2025 or TY2026, so this rule ends 2027-01-01. OPEN QUESTION, deliberately not resolved here: Senate Amendment 1 added § 1106(b)(3)f.3.-f.4., which apply 'for the purposes of this paragraph (b)(3)' — wording that reaches subparagraph b., the TY2022-2026 window — and impose a per-spouse cap ('The total subtraction modification may not exceed twice the relevant limit') and a DOMICILE test: 3 years of Delaware legal domicile for a person 60 or older domiciled here before January 1, 2027, and 5 years for one domiciled here on or after that date. The Act carries no effective-date section and was approved August 17, 2026, so whether the domicile test reaches a TY2026 return is genuinely unsettled on the face of the statute. This rule does NOT apply it to TY2025 or TY2026 — no TY2025 or TY2026 form asks the question — and the composer discloses it. The § 1106(b)(3)c. definition of a United States military pension was expanded by 84 Del. Laws c. 437 (Senate Bill 329, approved September 26, 2024) to cover the Army, Navy, Air Force, Marine Corps, Space Force, Coast Guard, the commissioned corps of the National Oceanic and Atmospheric Administration, the commissioned corps of the Public Health Service, and the National Guard.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { cap60: { value: "1250000", type: "money" }, capMilitaryUnder60: { value: "1250000", type: "money" }, capUnder60: { value: "200000", type: "money" } },
    formula: (() => {
      const pension = max0(fact("dePensionIncome"));
      const eligible = max0(fact("deEligibleRetirementIncome"));
      const over60 = minE(add(pension, eligible), money("1250000"));
      const under60 = iff(fact("deMilitaryPension"), minE(pension, money("1250000")), minE(pension, money("200000")));
      return iff(fact("deAge60OrOver"), over60, under60);
    })(),
  },
  {
    id: "us.de.pension_exclusion",
    version: 2,
    jurisdiction: "us.de",
    title:
      "Delaware pension exclusion TY2026 — the same $12,500 / $12,500 military / $2,000 tiers, but a person 60 or over qualifies ONLY if legally domiciled in Delaware for at least three years (85 Del. Laws c. 426, § 1106(b)(3)f.4, effective August 17, 2026) (Form PIT-RES line 6)",
    citation: {
      source: "30 Del. C. § 1106(b)(3)b. and f.4 as amended by 85 Del. Laws c. 426 (Senate Bill 219 with Senate Amendment 1, signed and effective August 17, 2026)",
      section: "30 Del. C. § 1106(b)(3)f.4; Form PIT-RES line 6",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (§ 1106(b)(3)f.4, verbatim, as it now reads on delcode.delaware.gov): '4. A. A person who is age 60 or older is eligible for the subtraction under this paragraph (b)(3) only if 1 of the following applies: I. For a person who is age 60 or older and legally domiciled in this State before January 1, 2027, the person is legally domiciled in this State for at least 3 years. II. For a person who is age 60 or older and legally domiciled in this State on or after January 1, 2027, the person is legally domiciled in this State for at least 5 years. B. For purposes of this paragraph (b)(3)f.4. of this section, a person is legally domiciled in this State if the person is a \"resident individual\" under § 1103 of this title.' ENACTMENT: 85 Del. Laws c. 426 = Senate Bill 219 with Senate Amendment 1, signed August 17, 2026, effective on signature; the Act carries NO tax-year applicability section, and the codified text is in force for returns filed after that date. TY2025 returns were due April 30, 2026 and are untouched (version 1). For TY2026 the gate is ENCODED: the 60-or-over tier pays only when deDomiciledForPensionExclusion is attested (the person has been a Delaware resident individual for at least three years — the five-year test applies only to someone who first became domiciled on or after January 1, 2027, i.e. never to a 2026 return). The gate covers the whole of paragraph (b)(3), so a 60-or-over person who fails it gets NO exclusion — not the under-60 tier. The under-60 tiers (including the $12,500 military tier) are unchanged. The same Act raises the MILITARY pension exclusion to $15,000 for 2027, $20,000 for 2028 and $25,000 for 2029 and after — outside this rule's window. RE-VERIFY against the 2026 PIT-RES instructions when they publish (~January 2027): if the Division applies f.4 only from TY2027, drop the gate.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap60: { value: "1250000", type: "money" }, capMilitaryUnder60: { value: "1250000", type: "money" }, capUnder60: { value: "200000", type: "money" }, domicileYears: { value: "3", type: "int" } },
    formula: (() => {
      const pension = max0(fact("dePensionIncome"));
      const eligible = max0(fact("deEligibleRetirementIncome"));
      const over60 = minE(add(pension, eligible), money("1250000"));
      const under60 = iff(fact("deMilitaryPension"), minE(pension, money("1250000")), minE(pension, money("200000")));
      return iff(fact("deAge60OrOver"), iff(fact("deDomiciledForPensionExclusion"), over60, money("0")), under60);
    })(),
  },
  {
    id: "us.de.elderly_disabled_exclusion",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware exclusion for certain persons 60 or over or disabled 2025 — $2,000 ($4,000 on a joint return where both qualify) when earned income is under $2,500 ($5,000) and adjusted gross income before this exclusion is $10,000 or less ($20,000) (Form PIT-RES line 11)",
    citation: {
      source: "30 Del. C. § 1106(b)(2); 2025 PIT-RES Instructions p. 7 'LINE 11 WORKSHEET, PERSONS 60 OR OVER OR DISABLED'; printed 2025 Form PIT-RES line 11",
      section: "30 Del. C. § 1106(b)(2); Form PIT-RES line 11",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (§ 1106(b)(2), verbatim): 'The amount of $2,000 by any person who has a total and permanent disability or by a person who is over 60 years of age, and (i) whose earned income in the taxable year is less than $2,500 and (ii) whose adjusted gross income (without reduction by this exclusion) does not exceed $10,000. For purposes of this paragraph (2), in the case of spouses filing a joint return, the amount of the exclusion shall be $4,000 if (i) both are either over 60 years of age or have total and permanent disabilities or 1 is over 60 years of age and the other has a total and permanent disability and (ii) their total earned income in the taxable year is less than $5,000 and their adjusted gross income does not exceed $20,000.' WORKSHEET (Instructions p. 7, verbatim, single/married filing separate column): 'Were you at least 60 years old or totally and permanently disabled on 12/31/2025?' / 'Did your earned income (i.e., wages, tips, farm, or business income) total less than $2,500?' / 'Is Line 10 $10,000 or less?' / 'If you answered YES to all, enter $2,000 on Line 11.' (joint column): 'Were both spouses at least 60 years old or totally and permanently disabled on 12/31/2025?' / 'Is combined earned income … less than $5,000?' / 'Is Line 10 $20,000 or less?' / 'If you answered YES to all, enter $4,000 on Line 11.' And: 'NOTE: If you are filing a joint return and only one spouse qualifies for this exclusion, you should consider filing separate returns (Filing Status 3 or 4).' STATUTE-FORM DIVERGENCE: § 1106(b)(2) says 'over 60 years of age' while the printed worksheet asks 'at least 60 years old' — the FORM's test is encoded, matching the age-60 test the personal credit and the pension exclusion both use. ENCODING: three all-or-nothing CLIFFS, not phase-outs. The income test runs against Form PIT-RES LINE 10 — after the Section B subtractions but before this exclusion — which is exactly the statute's 'without reduction by this exclusion'. Earned income is strictly LESS THAN the limit; the AGI test is 'or less'. The $4,000 tier needs a JOINT return with BOTH spouses qualifying. A JOINT return on which only ONE spouse qualifies gets NOTHING, not $2,000: the printed worksheet offers exactly two columns ('Single, married filing separate returns' and 'Married filing joint returns'), the joint column's first question is 'Were BOTH spouses at least 60 years old or totally and permanently disabled', and the booklet's own note settles it — 'If you are filing a joint return and only one spouse qualifies for this exclusion, you should consider filing separate returns (Filing Status 3 or 4)', advice that would be pointless if the joint return already produced $2,000. A reader of § 1106(b)(2) alone might grant the single $2,000 to the qualifying spouse on a joint return; the form does not, and the form is what is filed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { single: { value: "200000", type: "money" }, joint: { value: "400000", type: "money" }, earnedIncomeLimit: { value: "250000", type: "money" }, earnedIncomeLimitJoint: { value: "500000", type: "money" }, agiLimit: { value: "1000000", type: "money" }, agiLimitJoint: { value: "2000000", type: "money" } },
    formula: (() => {
      const agi = fact("deAgiBeforeExclusion");
      const earned = max0(fact("deEarnedIncome"));
      const bothQualify = and(isJointReturn, fact("deQualifiesElderlyDisabled"), fact("deSpouseQualifiesElderlyDisabled"));
      const jointOk = and(bothQualify, lt(earned, money("500000")), le(agi, money("2000000")));
      const singleOk = and(not(isJointReturn), fact("deQualifiesElderlyDisabled"), lt(earned, money("250000")), le(agi, money("1000000")));
      return iff(jointOk, money("400000"), iff(singleOk, money("200000"), money("0")));
    })(),
  },
  {
    id: "us.de.eitc",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware earned income tax credit 2025 — the taxpayer may claim either 20% of the federal credit limited to the tax, or 4.5% of it fully refundable; the Division's worksheet picks whichever is larger (Form PIT-RES line 34, DE Schedule II)",
    citation: {
      source: "30 Del. C. \u00a7 1117(a)(2) (enacted by 83 Del. Laws c. 118, effective for tax years beginning on or after January 1, 2022, unamended since); 2025 Form PIT-RSS 'DE SCHEDULE II - EARNED INCOME TAX CREDIT' lines 12-17; printed 2025 Form PIT-RES line 34",
      section: "30 Del. C. \u00a7 1117(a)(2); Form PIT-RES line 34",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (\u00a7 1117(a)(2), verbatim): 'The individual may claim either of the following amounts: a. 20% of the corresponding federal earned income tax credit, not to exceed the tax otherwise due under this chapter. b. 4.5% of the corresponding federal earned income tax credit, of which the amount that exceeds the tax otherwise due under this chapter is refundable.' SCHEDULE II (Form PIT-RSS, verbatim): line 12 is the Form PIT-RES line 33 tax less non-refundable credits; line 13 the federal earned income credit; line 14 that credit x .045; line 15 that credit x .20; 'If Line 14 is greater than or equal to Line 12' the refundable branch applies; 'If Line 14 is less than Line 12, compare Line 12 to Line 15, enter the smaller amount' as the non-refundable branch. Form PIT-RES line 34 carries REFUNDABLE and NON-REFUNDABLE checkboxes. ENCODING: the statute grants an ELECTION, but the Division's prescribed comparison is provably the taxpayer-optimal branch in every case, so it is encoded deterministically rather than as a user choice. When 4.5% of the federal credit is at least the remaining tax, the refundable 4.5% is taken in full (it exceeds the non-refundable branch, which cannot pay more than that tax); otherwise the smaller of the remaining tax and 20% of the federal credit is taken, which always beats 4.5%. The election is annual and binds nothing across years. NOTE: Schedule II line 13 cites federal 'Form 1040 or 1040-SR, Line 27' while the instructions say line 28 — line 27 is the federal earned income credit and is the correct reference. deEitcTaxAfterCredits is the Form PIT-RES line 33 amount (the tax after ALL other non-refundable credits), not the line 24 tax.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { nonrefundablePct: { value: "20", type: "int" }, refundablePctBps: { value: "450", type: "int" } },
    formula: (() => {
      const fed = max0(fact("deFederalEic"));
      const remaining = max0(fact("deEitcTaxAfterCredits"));
      // whole-dollar boxes: ONE half-up rounding each. Rounding to cents first and then to
      // dollars double-rounds — 4.5% of $4,011 is 180.495, which is $180, not $181.
      const refundable = dollarsFromScaled(times(fed, "450"));
      const nonrefundable = minE(remaining, dollarsFromScaled(times(fed, "2000")));
      return iff(ge(refundable, remaining), refundable, nonrefundable);
    })(),
  },
  {
    id: "us.de.child_care_credit",
    version: 1,
    jurisdiction: "us.de",
    title: "Delaware child and dependent care credit 2025 — 50% of the federal credit, not more than $3,000 and not more than the tax otherwise due; nonrefundable (Form PIT-RES line 31)",
    citation: {
      source: "30 Del. C. \u00a7 1114(a); 2025 PIT-RES Instructions p. 10 line 31 and its worksheet; printed 2025 Form PIT-RES line 31",
      section: "30 Del. C. \u00a7 1114(a); Form PIT-RES line 31",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (\u00a7 1114(a), verbatim): '50 percent of the child and dependent care expense credit allowable for federal income tax purposes \u2026 In no event shall the allowable credit under this subsection exceed the tax otherwise due'. FORM (line 31, verbatim): 'CHILD CARE CREDIT (Enter 50% of Federal credit)'. WORKSHEET: federal Form 2441 line 11 x .50, and 'Do not enter an amount in excess of $3,000.' ENCODING: NONREFUNDABLE and capped at the tax; the composer applies the tax cap across the whole line 27a-31 block as the instructions require ('The total of all non-refundable credits (Lines 27a through 31) is limited to the amount of your Delaware tax liability on Line 26'), so this rule reports the credit earned before that block cap. On a combined separate return the credit is applied against the spouse with the LOWER taxable income \u2014 the opposite of the earned income credit, which uses the higher.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "50", type: "int" }, cap: { value: "300000", type: "money" } },
    formula: minE(dollarsFromScaled(times(max0(fact("deFederalChildCareCredit")), "5000")), money("300000")),
  },
  {
    id: "us.de.other_state_credit",
    version: 1,
    jurisdiction: "us.de",
    title:
      "Delaware credit for tax imposed by another state 2025 — the tax times the ratio of income from the other state to Delaware adjusted gross income (capped at 100%), limited to the tax actually paid to that state; computed per state (Form PIT-RES line 28, DE Schedule I)",
    citation: {
      source: "30 Del. C. \u00a7 1111; 2025 PIT-RES Instructions p. 9 line 28 and its worksheet; 2025 Form PIT-RSS 'DE SCHEDULE I - CREDIT FOR INCOME TAXES PAID TO ANOTHER STATE'",
      section: "30 Del. C. \u00a7 1111; Form PIT-RES line 28",
      url: DELC("sc02"),
      excerpt:
        "STATUTE (\u00a7 1111(b)): the credit is limited 'with respect to the income tax imposed upon the taxpayer for the taxable year by each other taxing jurisdiction' \u2014 PER STATE \u2014 by a fraction of TAXABLE income. WORKSHEET (Instructions p. 9, verbatim): line 1 'adjusted gross income from the other state return'; line 2 'Delaware adjusted gross income (Line 12 of return)'; line 3 'divide Line 1 by Line 2 \u2026 If Line 1 is greater than Line 2: enter 100%'; line 5 = line 3 x the line 24 tax; line 6 the taxes paid net of credits, excluding city and county taxes; line 7 'the lesser of 5 or 6'. STATUTE-FORM DIVERGENCE: \u00a7 1111(b) frames the limiting fraction in terms of TAXABLE income, while the printed worksheet uses ADJUSTED GROSS income (its line 2 is Form PIT-RES line 12, Delaware AGI). The printed worksheet is encoded \u2014 it is what filers compute and what the Division processes. NO ROUNDING CONVENTION IS PRINTED anywhere on the worksheet or the schedule, so this rule carries the ratio at full precision and rounds ONCE to whole dollars at the product; that is the most conservative reading and it is disclosed here rather than inferred. PER STATE: DE Schedule I provides five state lines, 'Enter the credit in the highest to lowest amount order', summed on line 6 \u2014 this rule computes ONE state and the composer sums. The District of Columbia counts as a state; political subdivisions (city and county taxes) do not qualify.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioCap: { value: "1", type: "int" } },
    formula: (() => {
      const deAgi = fact("deAdjustedGrossIncome");
      const otherAgi = max0(fact("deOtherStateIncome"));
      const capped = minE(otherAgi, deAgi);
      // scale to cents x 10^4 BEFORE dividing so the ratio is not rounded to cents first:
      // 1,100 x 5,359/30,000 is 196.4967, which is $196, not $197.
      const share = dollarsFromScaled({ kind: "mulDiv", a: times(max0(fact("deIncomeTax")), "10000"), b: capped, c: deAgi, round: "half-up" });
      return iff(gt(deAgi, money("0")), minE(share, max0(fact("deOtherStateTaxPaid"))), money("0"));
    })(),
  },
  {
    id: "us.de.volunteer_firefighter_credit",
    version: 1,
    jurisdiction: "us.de",
    title: "Delaware volunteer firefighter credit 2025 — $1,000 for each qualifying volunteer firefighter, ambulance or rescue squad member; nonrefundable (Form PIT-RES line 29)",
    citation: {
      source: "30 Del. C. \u00a7 1113; 2025 PIT-RES Instructions p. 10 line 29; printed 2025 Form PIT-RES line 29",
      section: "30 Del. C. \u00a7 1113; Form PIT-RES line 29",
      url: DELC("sc02"),
      excerpt:
        "FORM (line 29, verbatim): 'VOLUNTEER FIREFIGHTER CREDIT'. \u00a7 1113 allows $1,000 against the tax for an active volunteer firefighter or member of a volunteer fire company auxiliary, ambulance or rescue squad. ONE credit per qualifying person, so a joint return on which both spouses qualify claims $2,000; on a combined separate return each column claims its own. Nonrefundable and swept into the line 27a-31 block that the instructions limit to the line 26 tax. The Division verifies this credit before processing \u2014 the booklet warns 'Credits such as firefighter and business credits are verified before return is processed' \u2014 so it is gated on an explicit attestation and defaults to not claimed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perPerson: { value: "100000", type: "money" } },
    formula: mulInt(money("100000"), minE(fact("deVolunteerFirefighters"), int("2"))),
  },
  {
    id: "us.de.parameters",
    version: 1,
    jurisdiction: "us.de",
    title: "Delaware 2025 Form PIT-RES parameters — line structure, the five filing statuses and the combined separate two-column return, modifications, credits, and the enacted TY2026-TY2027 position",
    citation: {
      source:
        "2025 PIT-RES Instructions (Revised 03/26/26); printed 2025 Form PIT-RES (Revision 20260407) and Form PIT-RSA; 2025 State Income Tax Table; 2026 Form PIT-EST Instructions (Revised 11/10/25); 30 Del. C. §§ 1102, 1105-1111; 85 Del. Laws c. 231 (House Bill 255, approved November 19, 2025) and c. 426 (Senate Bill 219, approved August 17, 2026); web-verified September 2026",
      section: "Form PIT-RES lines 1-40",
      url: INSTR_URL,
      excerpt:
        "FILING STATUS (printed on Form PIT-RES p. 1, verbatim): '1. Single, Divorced, Widow(er)  2. Joint  3. Married & Filing Separate Forms  4. Married & Filing Combined Separate on this form  5. Head of Household'. COLUMN RULE (banner above Section A on pages 1 and 2, verbatim): 'Column A is for Spouse information, Filing status 4 only. All other filing status use Column B.' INSTRUCTIONS (p. 5, verbatim): 'FILING STATUS 2, 3, AND 4 - MARRIED TAXPAYERS. You may file Joint, Separate, or Combined Separate Delaware returns. If you use Filing Status 4, you are in fact filing two separate returns which have been combined on the same form for convenience.' 'NOTE: Generally, separate returns (filing status 3 or 4) will be advantageous if both spouses have Delaware adjusted gross income in excess of $9,400.' 'If you elect to use Filing Status 3 or 4, both you and your spouse must compute your taxable income the same way. This means if one itemizes deductions, the other must itemize. If one takes the standard deduction, the other must take the standard deduction in computing taxable income.' 'For Filing Status 3 or 4, you must each report your own income, personal credits, deductions, and one-half of the income derived from securities, bank accounts, real estate, etc., which are titled or registered in joint names.' (§ 1109(b): 'Spouses, both of whom are required to file returns under this chapter, shall be allowed to itemize their deductions only if both elect to do so.') STRUCTURE (printed Form PIT-RES, verbatim): 'SECTION A - ADDITIONS: 1. FEDERAL AGI AMOUNT FROM FEDERAL FORM 1040; 2. INTEREST ON STATE & LOCAL OBLIGATIONS OTHER THAN DELAWARE; 3. FIDUCIARY ADJUSTMENT, OIL DEPLETION; 4. TOTAL - Add Lines 1 through 3. SECTION B - SUBTRACTIONS: 5. INTEREST RECEIVED ON U.S. OBLIGATIONS; 6. PENSION/RETIREMENT EXCLUSIONS; 7. DELAWARE STATE TAX REFUND, FIDUCIARY ADJUSTMENT, WORK OPPORTUNITY TAX CREDIT, DELAWARE NOL CARRYFORWARD, ETC.; 8a. TAXABLE SOCIAL SECURITY/RR RETIREMENT BENEFITS/HIGHER EDUCATION EXCLUSION/CERTAIN LUMP SUM DISTRIBUTIONS; 8b. 529 CONTRIBUTION TO DELAWARE-SPONSORED TUITION PROGRAM OR ABLE PROGRAM; 9. Add Lines 5 through 8b; 10. Subtract Line 9 from Line 4; 11. EXCLUSION FOR CERTAIN PERSONS 60 AND OVER OR DISABLED; 12. DELAWARE ADJUSTED GROSS INCOME. Subtract Line 11 from Line 10.' Then lines 13-19 the itemized detail, 20a the standard deduction, 20b itemized, 21 the additional standard deduction, 22 total deductions, 23 taxable income, 24 the tax, 27a-27b the personal credits, 33 the credit cap, and the payments and refund block through line 40. SOCIAL SECURITY (§ 1106(b)(4), verbatim): 'Social Security benefits paid by the United States and all payments received under the Railroad Retirement Act of 1974 … to the extent included in federal adjusted gross income' — fully excluded on line 8a, no cap, no age test, no phase-out, and INDEPENDENT of the line 6 pension exclusion. Instructions p. 7: 'Social Security and Railroad Retirement benefits are not taxable in Delaware and, therefore, should not be included in taxable income.' OTHER SUBTRACTIONS: interest on U.S. obligations (§ 1106(b)(1)); the higher-education exclusion for plan distributions applied to books, tuition or fees (§ 1106(b)(8)); DE529 contributions up to $1,000 ($2,000 joint), phased out entirely above $100,000 of federal AGI ($200,000 joint) and not available for K-12 tuition (§ 1106(b)(11)); Delaware ABLE contributions up to $5,000 ($10,000 joint) (§ 1106(b)(12)); Travelink benefits (§ 1106(b)(6)); the Work Opportunity Tax Credit wage disallowance (§ 1106(b)(5)); and the Delaware net operating loss carryforward of losses blocked by the $30,000 carryback cap (§ 1106(a)(3), (b)(7)). ADDITIONS: non-Delaware state and municipal bond interest (§ 1106(a)(1)), percentage depletion above cost depletion (§ 1106(a)(2)), and the fiduciary adjustment (§ 1106(c)). ITEMIZED DEDUCTIONS are allowed and are DECOUPLED from the federal election — Instructions p. 7: 'If you claimed a standard deduction on your federal return, you may still elect to itemize your deductions on the Delaware return. In this case, complete and attach Form PIT-RSA.' They are reduced by Delaware income tax and by other-state tax taken as a § 1111 credit, and increased by foreign taxes paid, the charitable mileage differential (Instructions p. 7: 'Miles driven 1/1/2025-12/31/2025 ____ x .26'), and up to $500 of active labor organization dues (§ 1109(a)(2)d., new for TY2024). PIT-RSA carries the federal SALT structure: 'Enter the smaller of line 5e … or $40,000 ($20,000 if married filing separately)'. TY2026: the rates, brackets, standard deduction, additional standard deduction, personal credits and pension exclusion are ALL UNCHANGED — the 2026 PIT-EST Instructions (Revised 11/10/25) print the identical schedule, '$3,250 single, divorced or widow(er), head of household … $6,500 if married filing jointly', '$2,500 for taxpayer &/or spouse. If 65 years old or over or blind', 'Pension Exclusions - per person ($2,000 under 60 years of age/$12,500 if 60 or over /$12,500 if from qualified military pension)' and 'Personal Credits ($110.00 X total number of Federal Exemptions and exemptions for being 60 or older)', and §§ 1102, 1108 and 1110 were not amended. The 2026 tax table and the TY2026 PIT-RES form are NOT yet published. The bracket-restructuring bills of the 153rd General Assembly (House Bill 13 and both substitutes, which would have added 6. TWO 153rd General Assembly enactments DO touch § 1106 and are not modeled as rules: 85 Del. Laws c. 231 (House Bill 255 with House Amendments 2 and 3, approved November 19, 2025) adds § 1106(d), decoupling from the P.L. 119-21 (OBBBA) § 70301 expensing and § 70307 qualified production property depreciation for property placed in service after December 31, 2025 and before January 1, 2031 — a TY2026 addition or subtraction that belongs in the generic additions/subtractions inputs; and 85 Del. Laws c. 426 (Senate Bill 219 with Senate Amendment 1, August 17, 2026), which adds the § 1106(b)(3)f.4 domicile gate on the 60-or-over pension exclusion (encoded as us.de.pension_exclusion version 2) and raises the military pension exclusion for 2027 and after.75% and 6.95% tiers) DIED in House Revenue & Finance; House Bill 108 (pension exclusion to $25,000) likewise. What WAS enacted across the 152nd and 153rd General Assemblies, exhaustively — the complete set of 84 and 85 Del. Laws citations in the credit lines of Chapter 11 subchapters I and II: 84 Del. Laws c. 192 (Senate Substitute 2 for Senate Bill 72, approved August 31, 2023) added the § 1109(a)(2)d. labor-organization dues deduction 'For tax years beginning on or after January 1, 2024'; c. 233 (Senate Bill 125, approved September 21, 2023) repealed § 1116, the Delaware investment credit; c. 366 (House Bill 324, approved August 15, 2024) RELOCATED the organ and bone marrow donation credit from § 20E-103 to § 1118 (83 Del. Laws c. 440 created it) and added § 1109(a)(1)c.; c. 437 (Senate Bill 329, approved September 26, 2024) expanded the military pension definition; and 85 Del. Laws c. 231 (House Bill 255, approved November 19, 2025) adds § 1106(d) decoupling Delaware from the P.L. 119-21 bonus depreciation and qualified production property provisions, whose section 3 reads 'Section 1 of this Act is effective upon enactment and applies to tax years beginning on or after January 1, 2022. Section 2 of this Act is effective January 1, 2026', so the personal side first applies TY2026 — a Schedule-level modification, not a rate or credit change; and 85 Del. Laws c. 426 (Senate Bill 219, approved August 17, 2026) raises the MILITARY pension exclusion to $15,000 for TY2027, $20,000 for TY2028 and $25,000 for TY2029 and after, and adds the 3-year / 5-year Delaware domicile requirement — first applying to TY2027. OUT OF SCOPE: nonresident and part-year returns (Form PIT-NON), the separate tax on lump-sum distributions (Form PIT-STC, § 1102(b)), the itemized-deduction detail on Form PIT-RSA, Delaware S corporation payments (Schedule V), and county or school district levies (Delaware has no local income tax).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      de529Cap: { value: "100000", type: "money" },
      de529CapJoint: { value: "200000", type: "money" },
      de529AgiPhaseout: { value: "10000000", type: "money" },
      de529AgiPhaseoutJoint: { value: "20000000", type: "money" },
      deAbleCap: { value: "500000", type: "money" },
      deAbleCapJoint: { value: "1000000", type: "money" },
      nolCarrybackCap: { value: "3000000", type: "money" },
      laborDuesCap: { value: "50000", type: "money" },
      charitableMileageRateCents: { value: "26", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Delaware Form PIT-RES composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.de.income_tax, us.de.standard_deduction, us.de.personal_credits, us.de.pension_exclusion, and us.de.elderly_disabled_exclusion",
    },
  },
];
