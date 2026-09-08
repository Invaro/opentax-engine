import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * West Virginia deep pack — TY2025 Form IT-140 (full-year resident). Every
 * amount verified from the 2025 West Virginia Personal Income Tax Forms &
 * Instructions booklet (56 pp: IT-140 pp. 1-2, Schedule M pp. 3-4, Tax Credit
 * Recap pp. 5-6, HEPTC-1 p. 9, FTC-1 pp. 10-12, Schedule E p. 14, general
 * information pp. 15-23, line instructions pp. 24-29, SCTC information p. 34,
 * Rate Schedules p. 35, Tax Table pp. 36-40, Schedule UT pp. 43-44) and the
 * West Virginia Code (code.wvlegislature.gov: §§ 11-21-4i, 4j, 4h, 10, 12, 16,
 * 20, 21, 22, 23, 26; 11-13MM-3/4/5; enrolled 2026 SB 392).
 *
 * Load-bearing findings:
 *  - TY2025 rates are § 11-21-4i (2024 2nd Ex. Sess. SB 2033): 2.22 / 2.96 /
 *    3.33 / 4.44 / 4.82% on $10k / $25k / $40k / $60k (Schedule I: single,
 *    HOH, MFJ, widow(er)); Schedule II (MFS) halves the brackets. The printed
 *    Tax Table (statuses 1, 2, 3, 5 under $100,000) is Schedule I at the row
 *    midpoint rounded half-up — verified on all 1,702 rows ($25 rows to $100,
 *    $100 rows to $25,000, $60 rows to $40,000, $50 rows to $100,000). MFS
 *    and incomes of $100,000 or more use the schedule.
 *  - TY2026: 2026 SB 392 (§ 11-21-4j, effective June 12, 2026, "for taxable
 *    years beginning on and after January 1, 2026") cuts every rate 5%:
 *    2.11 / 2.81 / 3.16 / 4.22 / 4.58%. § 11-21-4h's revenue trigger next
 *    runs August 15, 2026 for TY2027.
 *  - No standard or itemized deduction (only gambling losses); $2,000 personal
 *    exemptions ($500 when none); Social Security 100% exempt when federal AGI
 *    is $100,000 (MFJ) / $50,000 (others) or less, otherwise 65% for 2025 and
 *    100% from 2026 (§ 11-21-12(c)(8)); $8,000 senior/disability
 *    modification net of the retirement-type subtractions; Family Tax Credit
 *    percentages from the 2025 poverty guideline ($15,650 + $5,500/person,
 *    $300 steps; MFS half with $150 steps).
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
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
const isMfs: Expr = isStatus("mfs");
const isMfj: Expr = isStatus("mfj");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents × 10^4) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** Σ rate_i × portion in bracket i, scaled ×10,000 (rates per 10,000) — the exact statutory schedule */
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
type Sched = { thresholdCents: string; rateNum: string }[];
const sched = (rates: string[], mfs: boolean): Sched => {
  const th = mfs ? ["0", "500000", "1250000", "2000000", "3000000"] : ["0", "1000000", "2500000", "4000000", "6000000"];
  return th.map((t, i) => ({ thresholdCents: t, rateNum: rates[i] }));
};
const RATES_2025 = ["222", "296", "333", "444", "482"];
const RATES_2026 = ["211", "281", "316", "422", "458"];
const scheduleTax = (x: Expr, rates: string[]): Expr => iff(isMfs, dollarsFromScaled(scaledSchedule(x, sched(rates, true))), dollarsFromScaled(scaledSchedule(x, sched(rates, false))));
/** 2025 Tax Table row midpoint: [lo, hi) rows of $25 (to $100), $100 (to $25,000), $60 (to $40,000), $50 (to $100,000) */
const tableMidpoint = (x: Expr): Expr => {
  const band = (unitCents: string, offsetCents: string, from: string): Expr =>
    add(money(from), mulInt(money(unitCents), stepUnits(sub(x, money(from)), unitCents, "floor")), money(offsetCents));
  return iff(lt(x, money("10000")), band("2500", "1250", "0"), iff(lt(x, money("2500000")), band("10000", "5000", "0"), iff(lt(x, money("4000000")), band("6000", "3000", "2500000"), band("5000", "2500", "4000000"))));
};

const BOOKLET_URL = "https://tax.wv.gov/Documents/PIT/2025/it140.PersonalIncomeTaxFormsAndInstructions.2025.pdf";
const CODE = (s: string) => `https://code.wvlegislature.gov/${s}/`;

export const wvRules: Rule[] = [
  {
    id: "us.wv.income_tax",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia income tax — 2025 Rate Schedule I (2.22 / 2.96 / 3.33 / 4.44 / 4.82% at $10,000 / $25,000 / $40,000 / $60,000; single, HOH, MFJ, widow(er)) and Schedule II (MFS, half brackets); the printed Tax Table (statuses 1, 2, 3, 5 under $100,000) is Schedule I at the row midpoint (Form IT-140 line 8)",
    citation: {
      source: "W. Va. Code § 11-21-4i (2024 2nd Ex. Sess. SB 2033: 'Rate of tax — Taxable years beginning on and after January 1, 2025'); 2025 booklet p. 35 '2025 TAX RATE SCHEDULES' and pp. 36-40 '2025 WEST VIRGINIA TAX TABLE'; line 8 instructions p. 24",
      section: "§ 11-21-4i; Form IT-140 line 8; Rate Schedules I and II; Tax Table",
      url: CODE("11-21-4I"),
      excerpt:
        "STATUTE (verbatim): '(a) … every individual (except married individuals filing separate returns); every individual who is a head of a household …; every husband and wife who file a joint return under this article; every individual who is entitled to file his or her federal income tax return for the taxable year as a surviving spouse … shall be determined in accordance with the following table: Not over $10,000 — 2.22% of the taxable income; Over $10,000 but not over $25,000 — $222 plus 2.96% of excess over $10,000; Over $25,000 but not over $40,000 — $666 plus 3.33% of excess over $25,000; Over $40,000 but not over $60,000 — $1,165.50 plus 4.44% of excess over $40,000; Over $60,000 — $2,053.50 plus 4.82% of excess over $60,000. (b) Rate of tax on married individuals filing separate returns. — … Not over $5,000 — 2.22% of the taxable income; Over $5,000 but not over $12,500 — $111 plus 2.96% of excess over $5,000; Over $12,500 but not over $20,000 — $333 plus 3.33% of excess over $12,500; Over $20,000 but not over $30,000 — $582.75 plus 4.44% of excess over $20,000; Over $30,000 — $1,026.75 plus 4.82% of excess over $30,000.' '(e) … shall apply for all taxable years beginning on and after January 1, 2025, and shall be in lieu of the rates of tax specified in §11-21-4g of this code and as those rates were modified by the application of §11-21-4h of this code in 2024.' BOOKLET p. 35 (verbatim): 'RATE SCHEDULE I — Use this schedule if you checked 1 (Single), 2 (Head of household), 3 (Married filing joint), or 5 (Widow[er] with dependent child) under \"FILING STATUS\". Less than $10,000 … 2.22% of the taxable income; $10,000–$25,000 $222.00 plus 2.96% of excess over $10,000; $25,000–$40,000 $666.00 plus 3.33% of excess over $25,000; $40,000–$60,000 $1,165.50 plus 4.44% of excess over $40,000; $60,000 $2,053.50 plus 4.82% of excess over $60,000. EXAMPLE With a taxable income of $117,635: $57,635.00 Income in excess of $60,000 × .0482 = $2,778.01 … + 2,053.50 … $4,831.51 Total Tax on $117,635 (Round to nearest whole dollar). RATE SCHEDULE II — Use this schedule if you checked box 4 (Married filing separately) … Less than $5,000 … 2.22% …; $5,000–$12,500 $111.00 plus 2.96% of excess over $5,000; $12,500–$20,000 $333 plus 3.33% of excess over $12,500; $20,000–$30,000 $582.75 plus 4.44% of excess over $20,000; $30,000 $1,026.75 plus 4.82% of excess over $30,000. EXAMPLE With a taxable income of $118,460 … $5,290.52 Total Tax on $118,460 (Round to nearest whole dollar).' LINE 8 (pp. 24-25, verbatim): 'If your filing status is single, head of household, widow(er) with a dependent child or married filing jointly and your taxable income is less than $100,000, apply the amount of taxable income shown on line 7 to the Tax Table on page 36 and enter your tax on this line. … and your taxable income is over $100,000, use Rate Schedule I on page 35 to compute your tax. If your filing status is Married Filling Separately you MUST use RATE SCHEDULE II to compute your tax.' TAX TABLE notes (p. 36, verbatim): '4. If your filing status is Married Filing Separately, you cannot use this table. Use Rate Schedule II on page 35. 5. Make sure your taxable income is LESS than and NOT equal to the income shown in the \"LESS THAN\" column. 6. If your taxable income is over $100,000 refer to the Tax Rate Schedules on page 35.' Rows (verbatim): '25 50 $1', '50 75 $1', '75 100 $2', '100 200 $3', '12,300 12,400 $292', '25,000 25,060 $667', '25,060 25,120 $669', '99,950 100,000 $3,980'. CONVENTION (verified on all 1,702 rows): each cell is Rate Schedule I at the row midpoint (rows [lo, hi): $25 wide to $100, $100 wide to $25,000, $60 wide to $40,000, $50 wide to $100,000), rounded half-up — the schedule's anchors are exact, so the table is the statute at the midpoint. ENCODING: default for single/HOH/MFJ/QSS under $100,000 = the table (the line 8 instruction); taxable income under $25 (no printed row) and $100,000 or more use Schedule I on the income; MFS always uses Schedule II; wvUseRateSchedule = true applies the schedule at any income (the electronic computation; differs from the table by up to about $2). A federal QSS files as 'Widow(er) with dependent child' (status 5, Schedule I). Nonresidents and part-year residents apportion on Schedule A (not composed). TY2026: version 2 (§ 11-21-4j).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "222", type: "int" },
      rate2Bps: { value: "296", type: "int" },
      rate3Bps: { value: "333", type: "int" },
      rate4Bps: { value: "444", type: "int" },
      rate5Bps: { value: "482", type: "int" },
      bracket1: { value: "1000000", type: "money" },
      bracket2: { value: "2500000", type: "money" },
      bracket3: { value: "4000000", type: "money" },
      bracket4: { value: "6000000", type: "money" },
      mfsBracket1: { value: "500000", type: "money" },
      mfsBracket2: { value: "1250000", type: "money" },
      mfsBracket3: { value: "2000000", type: "money" },
      mfsBracket4: { value: "3000000", type: "money" },
      tableTop: { value: "10000000", type: "money" },
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const schedule = scheduleTax(x, RATES_2025);
      const table = dollarsFromScaled(scaledSchedule(tableMidpoint(x), sched(RATES_2025, false)));
      const useTable = and(not(fact("wvUseRateSchedule")), not(isMfs), ge(x, money("2500")), lt(x, money("10000000")));
      return iff(useTable, table, schedule);
    })(),
  },
  {
    id: "us.wv.income_tax",
    version: 2,
    jurisdiction: "us.wv",
    title: "West Virginia income tax TY2026 — § 11-21-4j (2026 SB 392, 5% cut): 2.11 / 2.81 / 3.16 / 4.22 / 4.58% at $10,000 / $25,000 / $40,000 / $60,000 (Schedule I) and half brackets for MFS (Schedule II)",
    citation: {
      source: "W. Va. Code § 11-21-4j ('Rate of tax — Taxable years beginning on and after January 1, 2026'), added by Enrolled Committee Substitute for SB 392 (2026 Regular Session, passed March 14, 2026, in effect June 12, 2026); WV Tax Division, '2026 Income Tax Rate Cut' page; § 11-21-4h as amended (next trigger determination August 15, 2026 for taxable years beginning on and after January 1, 2027)",
      section: "§ 11-21-4j; § 11-21-4h(b), (e)",
      url: CODE("11-21-4J"),
      excerpt:
        "STATUTE (verbatim): '(a) … For taxable years beginning on and after January 1, 2026, the tax … shall be determined in accordance with the following table: Not over $10,000 — 2.11% of the taxable income; Over $10,000 but not over $25,000 — $211 plus 2.81% of excess over $10,000; Over $25,000 but not over $40,000 — $632.50 plus 3.16% of excess over $25,000; Over $40,000 but not over $60,000 — $1,106.50 plus 4.22% of excess over $40,000; Over $60,000 — $1,950.50 plus 4.58% of excess over $60,000. (b) Rate of tax on married individuals filing separate returns. — For taxable years beginning on and after January 1, 2026 … Not over $5,000 — 2.11% of the taxable income; Over $5,000 but not over $12,500 — $105.50 plus 2.81% of excess over $5,000; Over $12,500 but not over $20,000 — $316.25 plus 3.16% of excess over $12,500; Over $20,000 but not over $30,000 — $553.25 plus 4.22% of excess over $20,000; Over $30,000 — $975.25 plus 4.58% of excess over $30,000.' '(e) … shall apply for all taxable years beginning on and after January 1, 2026, and shall be in lieu of the rates of tax specified in §11-21-4i of this code.' SB 392 title (verbatim): 'AN ACT to amend and reenact §11-21-4h … and to amend the code by adding a new section, designated §11-21-4j, relating to providing a reduction in personal income tax; … applying reduced rates beginning on and after January 1, 2026; providing for contingent additional future reductions in the personal income tax rates when certain criteria have been met'; '[Passed March 14, 2026; in effect 90 days from passage (June 12, 2026)]'. § 11-21-4h(b) (verbatim): 'Beginning on August 15, 2026, and every August 15 thereafter, the Secretary of Revenue will determine whether the total fiscal year adjusted general revenue fund collections from the immediately preceding fiscal year are in excess of the inflation adjusted base year revenues. If … then there will be a reduction in the personal income tax rates as determined under this section beginning the second taxable year following the determination.' '(e) … shall apply for all taxable years beginning on and after January 1, 2027, and shall be in lieu of the rates of tax specified in §11-21-4j of this code.' TAX DIVISION (verbatim): 'During the 2026 Legislative Session, Governor Morrisey promoted SB 392 to deliver an across the board income tax rate cut. It was passed and signed into law on March 31, 2026.' The 2026 Tax Table is unpublished — this version applies the schedule for every filer (the Tax Table's row-midpoint rounding is not available for 2026; wvUseRateSchedule is moot). Any August 2026 trigger certification affects TY2027, not this rule.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "211", type: "int" },
      rate2Bps: { value: "281", type: "int" },
      rate3Bps: { value: "316", type: "int" },
      rate4Bps: { value: "422", type: "int" },
      rate5Bps: { value: "458", type: "int" },
    },
    formula: scheduleTax(max0(fact("stateTaxableIncome")), RATES_2026),
  },
  {
    id: "us.wv.exemption_deduction",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia personal exemptions — $2,000 per exemption (yourself, spouse, dependents, and the surviving-spouse extra exemption for two years); $500 when no exemption can be claimed (Form IT-140 line 6)",
    citation: {
      source: "W. Va. Code § 11-21-16(a), (c), (d); 2025 booklet, EXEMPTIONS pp. 19 and 24; printed Form IT-140 exemption boxes (a)-(e) and line 6",
      section: "§ 11-21-16; Form IT-140 boxes (a)-(e), line 6",
      url: CODE("11-21-16"),
      excerpt:
        "STATUTE (verbatim): '(a) … with respect to any taxable year beginning on or after January 1, 1987, said exemption shall be $2,000.' '(c) Surviving spouse. -- For taxable years beginning after December 31, 1986, a surviving spouse shall be allowed one additional exemption of $2,000 for the two taxable years beginning after the year of death of the deceased spouse. … a surviving spouse means a taxpayer whose spouse died during the taxable year prior to the taxable year for which the annual return is being filed and who has not remarried at any time before the end of the taxable year for which the annual return is being filed.' '(d) Certain dependents. -- … a resident individual whose exemption amount for federal tax purposes is zero by virtue of section 151(d)(2) of the Internal Revenue Code of 1986, shall be allowed a single West Virginia exemption in the amount of $500.' FORM (verbatim): '(a) YOURSELF — To claim an exemption for yourself, enter 1. If someone can claim you as a dependent, leave box (a) blank. (b) SPOUSE — To claim an exemption for your spouse, enter 1. They may not be claimed as an exemption by anyone else. (c) DEPENDENTS … (d) SURVIVING SPOUSE (See page 21) … (e) Total Exemptions (add boxes a, b, c, and d). Enter here and on line 6 below. If box e is zero, enter $500 on line 6 below.' '6. Total Exemptions as shown above on Exemption Box (e) ____ x $2,000'. BOOKLET p. 24: '(b) SPOUSE - Enter \"1\" in box (b) for your spouse only if your filing status is married filing jointly and your spouse can't be claimed as a dependent on another person's return.' 'You cannot claim any dependents if you can be claimed as a dependent on another person's return.' p. 19: 'You can no longer claim personal exemptions on your federal income tax return. West Virginia has retained personal exemptions under the same rules applicable under federal law in prior years.' 'The State of West Virginia does not recognize most itemized deductions for personal income tax purposes. Consequently, the only itemized deductions allowed … are gambling losses.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "200000", type: "money" }, zeroExemptionAllowance: { value: "50000", type: "money" } },
    formula: iff(cmp("eq", fact("wvExemptions"), int("0")), money("50000"), mulInt(money("200000"), fact("wvExemptions"))),
  },
  {
    id: "us.wv.low_income_exclusion",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia low-income earned income exclusion — up to $10,000 ($5,000 MFS) of earned income when federal AGI is $10,000 ($5,000) or less (Form IT-140 line 5 worksheet)",
    citation: {
      source: "W. Va. Code § 11-21-10(a)-(c); 2025 booklet, 'WEST VIRGINIA LOW-INCOME EARNED INCOME EXCLUSION WORKSHEET' p. 29 and line 5 instruction p. 24",
      section: "§ 11-21-10; Form IT-140 line 5",
      url: CODE("11-21-10"),
      excerpt:
        "STATUTE (verbatim): '(a) Earned income exclusion. -- In the case of an eligible taxpayer, there shall be allowed as a deduction from federal adjusted gross income the amount of his or her earned income included therein, not to exceed $10,000, except that when a husband and wife file separate returns under this article this exclusion shall not exceed $5,000 per separate return … (b) \"Eligible taxpayer\" defined. -- The term \"eligible taxpayer\" means: (1) Any unmarried individual and any husband and wife filing a joint return under this article who has or have federal adjusted gross income of $10,000 or less for the taxable year; or (2) Any husband or wife filing a separate return under this article who has federal adjusted gross income of $5,000 or less. (c) \"Earned income\" defined. -- (1) The term \"earned income\" means: (A) Wages, salaries, tips, and other employee compensation; plus (B) The amount of the taxpayer's net earnings from self-employment … (B) No amount received as pension or annuity shall be taken into account; and (c) No amount received for services provided by an individual while the individual is an inmate at a penal institution shall be taken into account.' WORKSHEET (verbatim): 'A. Enter your Federal Adjusted Gross income from line 1 of Form IT-140. STOP — If Line A is greater than $10,000 ($5,000 if married filing separate returns), you are not eligible for the exclusion. B. List the source and amount of your earned income. Enter the total amount on Line B. C. Maximum exclusion. Enter $5,000 if your filing status is married filing separately; otherwise enter $10,000. D. Enter the smaller of the amounts shown on Line A, Line B, or Line C here and on Line 5 of Form IT-140.' 'This exclusion may be taken even if you are claimed as a dependent on someone else's return.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "1000000", type: "money" }, capMfs: { value: "500000", type: "money" } },
    formula: (() => {
      const cap: Expr = iff(isMfs, money("500000"), money("1000000"));
      const agi = fact("wvAgi");
      return iff(gt(agi, cap), money("0"), minE(max0(agi), max0(fact("wvEarnedIncome")), cap));
    })(),
  },
  {
    id: "us.wv.social_security_modification",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia Social Security decreasing modification — 100% of federally taxable benefits when federal AGI is $100,000 (MFJ) / $50,000 (single, HOH, widow(er), MFS) or less, otherwise 65% for TY2025 (Schedule M line 34)",
    citation: {
      source: "W. Va. Code § 11-21-12(c)(8)(A)-(F) (as amended 2024 HB 4880); 2025 booklet, Schedule M line 34 instructions p. 26 and 'IMPORTANT INFORMATION FOR 2025' p. 15; printed Schedule M line 34",
      section: "§ 11-21-12(c)(8); Schedule M line 34",
      url: CODE("11-21-12"),
      excerpt:
        "STATUTE (verbatim): '(8) Decreasing modification for social security income. (A) For taxable years beginning on or after January 1, 2022, 100 percent of the social security benefits received pursuant to Chapter 7 of Title 42 of the United States Code … included in federal adjusted gross income for the taxable year shall be allowed as a decreasing modification … subject to the limitation in §11-21-12(c)(8)(B) of this code. (B) The deduction allowed by §11-21-12(c)(8)(A) of this code are allowable only when the federal adjusted gross income of a married couple filing a joint return does not exceed $100,000, or $50,000 in the case of a single individual or a married individual filing a separate return. … (D) For taxable years beginning on or after January 1, 2025, 65 percent of the social security benefits received … included in federal adjusted gross income for the taxable year shall be allowed as a decreasing modification … subject to the limitation in §11-21-12(c)(8)(F) of this code. (E) For taxable years beginning on or after January 1, 2026, 100 percent … (F) The deduction allowed by §11-21-12(c)(8)(C), §11-21-12(c)(8)(D), and §11-21-12(c)(8)(E) of this code are allowable only when the federal adjusted gross income of a married couple filing a joint return exceeds $100,000, or $50,000 in the case of a single individual or a married individual filing a separate return.' SCHEDULE M (verbatim): '34. Social Security Benefits (a) TOTAL Social Security Benefits (b) Benefits exempt for Federal tax purposes (c) Benefits taxable for Federal tax purposes (line a minus line b) … Multiply 34(c) by 0.65 if your Federal AGI exceeds $50,000 for SINGLE or MARRIED SEPARATE filers $100,000 for MARRIED JOINT filers. Enter 34(c) on Line 34 below.' INSTRUCTIONS (p. 26, verbatim): '… 100 percent (100%) of the amount of social security benefits received and included in federal adjusted gross income … The deduction may be claimed only when the federal adjusted gross income of a married couple filing a joint return does not exceed $100,000, or $50,000 in the case of a single, head of household, widow(er), or a married individual filing a separate return. Additionally, for taxable year 2025, 65% of social security benefits received and included in the federal adjusted gross income shall be allowed as a decreasing modification … when the federal adjusted gross income of a married couple filing jointly exceeds $100,000 or $50,000 in the case of a single, head of household, widow(er), or married individual filing a separate return.' ENCODING: the fact is the federally taxable amount (Form 1040 line 6b, Schedule M 34(c)) for the column; 65% is rounded to whole dollars. TY2026: version 2 (100% at any income).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { agiLimitJoint: { value: "10000000", type: "money" }, agiLimitOther: { value: "5000000", type: "money" }, pctOverLimit: { value: "65", type: "int" } },
    formula: (() => {
      const limit: Expr = iff(isMfj, money("10000000"), money("5000000"));
      const ss = max0(fact("wvTaxableSocialSecurity"));
      return iff(le(fact("wvAgi"), limit), ss, rd(pct(ss, "65", "100")));
    })(),
  },
  {
    id: "us.wv.social_security_modification",
    version: 2,
    jurisdiction: "us.wv",
    title: "West Virginia Social Security decreasing modification TY2026 — 100% of federally taxable benefits at any income (Schedule M line 34)",
    citation: {
      source: "W. Va. Code § 11-21-12(c)(8)(A)-(B), (E)-(F) (2024 HB 4880 phase-in complete)",
      section: "§ 11-21-12(c)(8)(E)",
      url: CODE("11-21-12"),
      excerpt:
        "STATUTE (verbatim): '(E) For taxable years beginning on or after January 1, 2026, 100 percent of the social security benefits received pursuant to Chapter 7 of Title 42 of the United States Code … included in federal adjusted gross income for the taxable year shall be allowed as a decreasing modification from federal adjusted gross income when determining West Virginia taxable income subject to the tax imposed by this article, subject to the limitation in §11-21-12(c)(8)(F) of this code. (F) The deduction allowed by … §11-21-12(c)(8)(E) of this code are allowable only when the federal adjusted gross income of a married couple filing a joint return exceeds $100,000, or $50,000 …' Together with (A)-(B) (100% at or below the thresholds), every filer subtracts 100% of federally taxable Social Security for taxable years beginning in 2026.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "100", type: "int" } },
    formula: max0(fact("wvTaxableSocialSecurity")),
  },
  {
    id: "us.wv.senior_citizen_modification",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia senior citizen or disability modification — up to $8,000 of a 65-or-older or permanently and totally disabled person's income, reduced by that person's Schedule M lines 29-34 subtractions (Schedule M line 47, per column)",
    citation: {
      source: "W. Va. Code § 11-21-12(c)(9); 2025 booklet, Schedule M line 47 instructions and 'EXAMPLE OF SENIOR CITIZEN DEDUCTION CALCULATION' pp. 27-28; printed Schedule M line 47 columns (a)-(d)",
      section: "§ 11-21-12(c)(9); Schedule M line 47",
      url: CODE("11-21-12"),
      excerpt:
        "STATUTE (verbatim): '(9) Federal adjusted gross income in the amount of $8,000 received from any source after December 31, 1986, by any person who has attained the age of 65 on or before the last day of the taxable year, or by any person certified by proper authority as permanently and totally disabled, regardless of age, on or before the last day of the taxable year, to the extent includable in federal adjusted gross income for federal tax purposes: … Provided, however, That: (i) Where the total modification under subdivisions (1), (2), (5), (6), (7), and (8) of this subsection is $8,000 per person or more, no deduction shall be allowed under this subdivision; and (ii) Where the total modification under subdivisions (1), (2), (5), (6), (7), and (8) of this subsection is less than $8,000 per person, the total modification allowed under this subdivision for all gross income received by that person shall be limited to the difference between $8,000 and the sum of modifications under subdivisions (1), (2), (5), (6), (7), and (8) of this subsection'. SCHEDULE M line 47 (verbatim): '(a) Year of birth (65 or older) (b) Year of disability (c) Income not included in lines 35 to 46 (NOT TO EXCEED $8000) (d) Add lines 29 through 34 — Subtract line 47 column (d) from (c) (If less than zero, enter zero)'. INSTRUCTIONS (verbatim): 'Taxpayers MUST be at least age 65 OR certified as permanently and totally disabled to receive this deduction. … Joint income must be divided between spouses with regard to their respective percentage of ownership. ONLY THE INCOME OF THE SPOUSE WHO MEETS THE ELIGIBILITY REQUIREMENTS QUALIFIES FOR THE MODIFICATION. … Box (c) Enter all income (for each spouse, if joint return) not reported on lines 35 through 48. Box (d) Add lines 29 through 34 for each spouse and enter on this line. Subtract BOX (d) from BOX (c) for each. If BOX (d) is larger than BOX(c), enter zero.' EXAMPLE (verbatim): 'John Doe, age 69, and Mary Doe, age 65, file a joint tax return … Mr. Doe reported his police pension on line 31 and his share of their joint savings bond interest on line 29. He enters $7,500 in column (d). … Mrs. Doe … enters $500 in column (d). … Therefore, Mr. Doe enters $500 in column A and Mrs. Doe enters $7,500 in column B.' ENCODING per person: eligible ? max0(min($8,000, income not on lines 35-46) − lines 29-34) : $0.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "800000", type: "money" } },
    formula: iff(fact("wvSeniorOrDisabled"), max0(sub(minE(money("800000"), max0(fact("wvIncomeNotOnLines35to46"))), max0(fact("wvLines29to34")))), money("0")),
  },
  {
    id: "us.wv.surviving_spouse_modification",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia surviving spouse modification — one-time subtraction of up to $8,000 in the year after the death of a spouse who was 65 or disabled, reduced by the Schedule M lines 29-34 subtractions (Schedule M line 48)",
    citation: {
      source: "W. Va. Code § 11-21-12(c)(10); 2025 booklet, Schedule M line 48 instructions p. 28 and 'SURVIVING SPOUSE' p. 21",
      section: "§ 11-21-12(c)(10); Schedule M line 48",
      url: CODE("11-21-12"),
      excerpt:
        "STATUTE (verbatim): '(10) Federal adjusted gross income in the amount of $8,000 received from any source after December 31, 1986, by the surviving spouse of any person who had attained the age of 65 or who had been certified as permanently and totally disabled, to the extent includable in federal adjusted gross income for federal tax purposes: Provided, That: (i) Where the total modification under subdivisions (1), (2), (5), (6), (7), and (8) of this subsection is $8,000 or more, no deduction shall be allowed under this subdivision; and (ii) Where the total modification under subdivisions (1), (2), (5), (6), (7), and (8) of this subsection is less than $8,000 per person, the total modification allowed under this subdivision for all gross income received by that person shall be limited to the difference between $8,000 and the sum of subdivisions (1), (2), (5), (6), (7), and (8) of this subsection'. BOOKLET (line 48, verbatim): 'The surviving spouse may claim a one-time subtraction from his/her income of up to $8,000 for the taxable year following the year of the spouse's death if all of the following conditions are met: The decedent was 65 years of age or older OR was certified as permanently and totally disabled prior to his death. The surviving spouse did not remarry before the end of the taxable year. The total deductions from income shown on lines 29 through 34 and line 49 of Schedule M are less than $8,000. If under $8,000, enter only the difference on the Surviving Spouse Line. The combined total of Line 49 and 50 can not exceed $8,000.' (The instructions' Schedule M line numbers run two higher than the printed 2025 form — 'line 49' is the printed line 47 senior citizen modification and 'Line 49 and 50' are printed lines 47 and 48.) p. 21: 'Regardless of age, a surviving spouse of a decedent may be eligible for a modification reducing his/her income up to $8,000 provided he/she did not remarry before the end of the taxable year.' ENCODING: eligible ? max0($8,000 − wvLines29to34) : $0, where the composer passes lines 29-34 PLUS the line 47 modification so that lines 47 and 48 together never exceed $8,000 (the booklet's combined cap; § 11-21-12(c)(10) itself lists only subdivisions (1), (2), (5), (6), (7), (8) = lines 29-34). Schedule H (p. 13) also lets the surviving spouse of a certified-disabled decedent who died during 2025 take a modification; the composer follows line 48's 'taxable year following the year of the spouse's death'.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "800000", type: "money" } },
    formula: iff(fact("wvSurvivingSpouseEligible"), max0(sub(money("800000"), max0(fact("wvLines29to34")))), money("0")),
  },
  {
    id: "us.wv.family_tax_credit",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia Family Tax Credit — a percentage of the line 8 tax from the 2025 tables: 100% at or below the poverty guideline ($15,650 + $5,500 per family member), falling 10 points per $300 of modified federal AGI above it (MFS: half the guideline, $150 steps); none with zero exemptions or federal AMT (Schedule FTC-1)",
    citation: {
      source: "W. Va. Code § 11-21-22; 2025 Schedule FTC-1 lines 1-8 (p. 11) and '2025 FAMILY TAX CREDIT TABLES' Table 1 and Table 2 (p. 12); Tax Credit Recap line 2",
      section: "§ 11-21-22; Schedule FTC-1; Recap line 2",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): 'In order to eliminate West Virginia personal income tax on families with incomes below the federal poverty guidelines and to reduce the West Virginia personal income tax on families with incomes that are immediately above the federal poverty guidelines, there is hereby created a nonrefundable tax credit, to be known as the low-income family tax credit … The low-income family tax credit is based upon family size and the federal poverty guidelines. … Provided, That for tax years beginning on and after January 1, 2009, any person who is required to pay the federal alternative minimum income tax in the current tax year is disqualified from receiving any tax credit provided under this section.' FTC-1 (verbatim): 'Individuals who file their income tax return with zero exemptions cannot claim the credit. Persons who pay the federal alternative minimum tax are not eligible to claim this credit. … If filing status is married filing separate use Family Tax Credit Table 2. 1. Federal Adjusted Gross Income (enter the amount from line 1 of Form IT-140); 2. Increasing West Virginia modifications (enter the amount from line 2 of Form IT-140); 3. Tax-exempt interest reported on federal tax return (enter the amount shown on Federal Form 1040 that is not already included on line 2 of Form IT-140); 4. Add lines 1 through 3. This is your Modified Federal Adjusted Gross Income for the Family Tax Credit; 5. Enter the number of exemptions claimed from Form IT-140, sum of boxes a, b, and c (This is your Family Size for the Family Tax Credit); 6. Enter the Family Tax Credit Percentage for your family size AND Modified Federal Adjusted Gross Income level from the tables on page 12. If the exemptions on line 5 are greater than 8, use the table for a family size of 8; 7. Enter your income tax due from line 8 of Form IT-140; 8. Multiply the amount on line 7 by the percentage shown on line 6. This is your Family Tax Credit.' TABLE 1 (verbatim, family size 1): 'Greater Than $0 Equal To or Less Than $15,650 100%; $15,650 $15,950 90%; $15,950 $16,250 80%; $16,250 $16,550 70%; $16,550 $16,850 60%; $16,850 $17,150 50%; $17,150 $17,450 40%; $17,450 $17,750 30%; $17,750 $18,050 20%; $18,050 $18,350 10%; $18,350 0%'; size 2 starts '$0 $21,150 100%', size 3 '$26,650', size 4 '$32,150', size 5 '$37,650', size 6 '$43,150', size 7 '$48,650', '8 or More' '$54,150'. TABLE 2 (Married Filing Separately, verbatim, size 1): '$0 $7,825 100%; $7,825 $7,975 90%; … $9,025 $9,175 10%; $9,175 0%'; sizes 2-8 start at $10,575 / $13,325 / $16,075 / $18,825 / $21,575 / $24,325 / $27,075. STRUCTURE (verified on all 176 printed cells): Table 1's 100% ceiling is the 2025 HHS poverty guideline ($15,650 for one person plus $5,500 for each additional person) and each 10-point step is $300 of modified federal AGI ('Greater Than' exclusive, 'Equal To or Less Than' inclusive); Table 2 is exactly half ($150 steps). ENCODING: pct = 100 − 10 × ceil(max0(MFAGI − ceiling) ÷ step), floored at 0; credit = round(line 8 tax × pct). The tables follow the annual poverty guidelines — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      povertyGuidelineOne: { value: "1565000", type: "money" },
      povertyGuidelinePerAdditional: { value: "550000", type: "money" },
      step: { value: "30000", type: "money" },
      stepMfs: { value: "15000", type: "money" },
      maxFamilySize: { value: "8", type: "int" },
    },
    formula: (() => {
      const size: Expr = iff(gt(fact("wvFamilySize"), int("8")), int("8"), fact("wvFamilySize"));
      const ceilingFull = add(money("1565000"), mulInt(money("550000"), sub(size, int("1"))));
      const ceiling: Expr = iff(isMfs, pct(ceilingFull, "1", "2"), ceilingFull);
      const steps: Expr = iff(isMfs, stepUnits(max0(sub(fact("wvModifiedAgi"), ceiling)), "15000", "ceil"), stepUnits(max0(sub(fact("wvModifiedAgi"), ceiling)), "30000", "ceil"));
      const pctPoints: Expr = max0(sub(money("100"), mulInt(money("10"), steps))); // percentage points, cents-denominated
      const credit = rd({ kind: "mulDiv", a: max0(fact("wvTaxBeforeCredits")), b: pctPoints, c: money("100"), round: "half-up" });
      return iff(or(cmp("eq", fact("wvFamilySize"), int("0")), fact("wvFederalAmt")), money("0"), credit);
    })(),
  },
  {
    id: "us.wv.other_state_credit",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia credit for income tax paid to another state — Schedule E: the smallest of the other state's tax, the West Virginia tax, the tax × (other-state income ÷ West Virginia AGI), the tax minus the tax on income excluding the other-state income, and the tax minus the other Recap credits (Recap line 1)",
    citation: {
      source: "W. Va. Code § 11-21-20(a)-(c); 2025 Schedule E lines 1-10 (p. 14); Tax Credit Recap line 1",
      section: "§ 11-21-20; Schedule E lines 1-10",
      url: CODE("11-21-20"),
      excerpt:
        "STATUTE (verbatim): '(a) General. — A resident shall be allowed a credit against the tax otherwise due under this article for any income tax paid to another state of the United States or by the District of Columbia for the taxable year … upon income both derived therefrom and subject to tax under this article. … (b) Limitations. — (1) The credit under this section shall not exceed the percentage of the tax otherwise due under this article determined by dividing the portion of the taxpayer's West Virginia income subject to taxation by such other jurisdiction by the total amount of the taxpayer's West Virginia income. (2) The credit under this section shall not reduce the tax otherwise due under this article to an amount less than would have been due if the income subject to taxation by such other jurisdiction were excluded from the taxpayer's West Virginia income. (c) Exception. — No credit shall be allowed under this section for a tax of a jurisdiction which allows residents of this state a credit against the taxes imposed by such other jurisdiction for the tax under this article …' SCHEDULE E (verbatim): 'A Separate Schedule E must be completed for each state for which credit is claimed. … No credit is allowed for income tax imposed by a city, township, borough, or any other political subdivision of a state or any other country. 1 INCOME TAX COMPUTED ON YOUR 2025 [state] RETURN. DO NOT REPORT TAX WITHHELD; 2 WEST VIRGINIA TOTAL INCOME TAX DUE (LINE 8 OF FORM IT-140); 3 NET INCOME DERIVED FROM ABOVE STATE INCLUDED IN WEST VIRGINIA TOTAL INCOME; 4 TOTAL WEST VIRGINIA ADJUSTED GROSS INCOME (RESIDENTS–FORM IT-140, LINE 4 …); 5 LIMITATION OF CREDIT (LINE 2 MULTIPLIED BY LINE 3 DIVIDED BY LINE 4); 6 ALTERNATIVE WEST VIRGINIA TAXABLE INCOME (RESIDENTS – SUBTRACT LINE 3 FROM LINE 7, FORM IT-140); 7 ALTERNATIVE WEST VIRGINIA TOTAL INCOME TAX (APPLY THE TAX RATE SCHEDULE TO THE AMOUNT SHOWN ON LINE 6); 8 LIMITATION OF CREDIT (LINE 2 MINUS LINE 7); 9 MAXIMUM CREDIT (LINE 2 MINUS THE SUM OF LINES 2 THROUGH 26 OF THE TAX CREDIT RECAP SCHEDULE); 10 TOTAL CREDIT (SMALLEST OF LINES 1,2, 5, 8, OR 9) ENTER HERE AND ON LINE 1 OF THE TAX CREDIT RECAP SCHEDULE'. ENCODING: line 5 = round(line 2 × line 3 ÷ line 4); line 7 (wvAlternativeTax) is supplied by the composer from us.wv.income_tax applied with the RATE SCHEDULE (as the form directs) to line 7 minus line 3; credit = min(lines 1, 2, 5, 8, 9), $0 when line 4 is not positive.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {},
    formula: (() => {
      const l1 = max0(fact("wvOtherStateTax"));
      const l2 = max0(fact("wvTaxBeforeCredits"));
      const l3 = max0(fact("wvOtherStateIncome"));
      const l4 = fact("wvAdjustedGrossIncome");
      const l5 = rd({ kind: "mulDiv", a: l2, b: l3, c: l4, round: "half-up" });
      const l8 = max0(sub(l2, max0(fact("wvAlternativeTax"))));
      const l9 = max0(sub(l2, max0(fact("wvOtherRecapCredits"))));
      return iff(gt(l4, money("0")), minE(l1, l2, l5, l8, l9), money("0"));
    })(),
  },
  {
    id: "us.wv.child_care_credit",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia child and dependent care credit — 50% of the federal § 21 credit, nonrefundable (Tax Credit Recap line 18)",
    citation: {
      source: "W. Va. Code § 11-21-26 (2024); 2025 Tax Credit Recap line 18; booklet 'IMPORTANT INFORMATION FOR 2025' p. 15",
      section: "§ 11-21-26; Recap line 18",
      url: CODE("11-21-26"),
      excerpt:
        "STATUTE (verbatim): 'For tax years beginning on and after January 1, 2024, a person who is allowed a federal tax credit for child and dependent care pursuant to 26 U.S.C. § 21 is also allowed a nonrefundable credit against the tax imposed by §11-21-1 et seq of this code. The amount of the credit allowed to the person claiming the credit under this section is 50 percent of the federal child and dependent care tax credit allowed to the person under the provisions of 26 U.S.C. § 21. This section shall have retrospective effect to apply to taxable years beginning on and after January 1, 2024.' RECAP (verbatim): '18. Child and Dependent Care Expenses Credit (§11-21-26) — Must have a copy of federal form 2441'. BOOKLET p. 15: 'The Child and Dependent Care Credit can be claimed on Line 18 of Tax Credit Recap Schedule (RECAP). The allowable credit is 50% of the credit taken on Form 2441 of the federal return. Paper filers will need to submit the federal Form 2441 in order to take this credit.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "50", type: "int" } },
    formula: rd(pct(max0(fact("wvFederalChildCareCredit")), "1", "2")),
  },
  {
    id: "us.wv.senior_citizens_tax_credit",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia Senior Citizens Tax Credit — the property tax paid on up to the first $20,000 of taxable assessed value of a Homestead Exemption home (from the mailed Schedule SCTC-A), refundable, when federal AGI is at or below 150% of the poverty guideline ($23,475 + $8,250 per additional household member) (Form IT-140 line 18)",
    citation: {
      source: "W. Va. Code § 11-21-21(a)(2)-(3), (b)(1); 2025 booklet, 'SENIOR CITIZENS TAX CREDIT INFORMATION' p. 34 and pp. 19-20; Form IT-140 line 18",
      section: "§ 11-21-21; Form IT-140 line 18; Schedule SCTC-A",
      url: CODE("11-21-21"),
      excerpt:
        "STATUTE (verbatim): '(2) For tax years beginning on or after January 1, 2007, a low-income person who is allowed a $20,000 homestead exemption from the assessed value of his or her homestead for ad valorem property tax purposes … shall be allowed a refundable credit against the taxes imposed by this article equal to the amount of ad valorem property taxes paid on up to the first $20,000 of taxable assessed value of the homestead … Provided, That for tax years beginning on and after January 1, 2009, any person who is required to pay the federal alternative minimum income tax in the current tax year is disqualified … (3) Due to the administrative cost of processing, the refundable credit authorized by this section may not be refunded if less than $10.' '(b)(1) \"Low income\" means federal adjusted gross income for the taxable year that is one hundred fifty percent or less of the federal poverty guideline for the year in which property tax was paid, based upon the number of individuals in the family unit residing in the homestead'. BOOKLET p. 34 (verbatim): 'The credit is based on the amount of ad valorem property taxes paid (Class II) on the first $20,000, or portion thereof, of the taxable assessed value over the $20,000 Homestead Exemption. … # OF PEOPLE IN HOUSEHOLD / 150% OF POVERTY GUIDELINES: 1 $23,475; 2 $31,725; 3 $39,975; 4 $48,225 **FOR EACH ADDITIONAL PERSON, ADD $8,250'. p. 19: 'Credit eligibility is restricted to taxpayers who participate in the Homestead Exemption program (administered by the county assessor's office), who incur and pay property taxes and whose federal adjusted gross income is less than 150% of federal poverty guidelines. … You will receive form WV SCTC-A by mail if you participate in the Homestead Exemption program. … If you are claiming the Disabled Veteran Property Tax Credit, you cannot take the Senior Citizen Tax Credit or the Homestead Excess Property Tax Credit.' ENCODING: the credit amount (SCTC-A Part III line 2) is an input; the rule returns it when household income is at or below the 150% guideline for the household size and the filer is not claiming the disabled veteran credit or paying federal AMT, else $0. The guideline changes yearly — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { limitOne: { value: "2347500", type: "money" }, limitPerAdditional: { value: "825000", type: "money" }, minimumRefund: { value: "1000", type: "money" } },
    formula: (() => {
      const size: Expr = iff(lt(fact("wvHouseholdSize"), int("1")), int("1"), fact("wvHouseholdSize"));
      const limit = add(money("2347500"), mulInt(money("825000"), sub(size, int("1"))));
      return iff(and(le(fact("wvHouseholdIncome"), limit), not(fact("wvFederalAmt")), not(fact("wvDisabledVeteranCreditClaimed"))), max0(fact("wvSeniorCitizenCreditAmount")), money("0"));
    })(),
  },
  {
    id: "us.wv.homestead_excess_property_tax_credit",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia Homestead Excess Property Tax Credit — owner-occupied real property tax (less the Senior Citizens Tax Credit) above 4% of gross household income, up to $1,000, refundable, when federal AGI is at or below 300% of the poverty guideline ($46,950 + $16,500 per additional person) (Schedule HEPTC-1, Form IT-140 line 19)",
    citation: {
      source: "W. Va. Code § 11-21-23(a), (b), (d), (f), (g), (h); 2025 Schedule HEPTC-1 Parts I-II (p. 9); booklet p. 19",
      section: "§ 11-21-23; Schedule HEPTC-1; Form IT-140 line 19",
      url: CODE("11-21-23"),
      excerpt:
        "STATUTE (verbatim): '(a) … for the tax years beginning on or after January 1, 2012, any low income homeowner living in his or her homestead in this state shall be allowed a refundable credit against the taxes imposed by this article equal to the amount by which the difference between West Virginia real property taxes paid for the tax year, minus the amount of credit authorized in section twenty-one of this article, exceeds four percent of the taxpayer's gross household income for the tax year … (b) Due to the administrative cost of processing, the refundable credit authorized by this section may not be refunded if less than $10. … (d)(1) \"Gross household income\" is defined as federal adjusted gross income plus the sum of the following: (A) Modifications in subsection (b), section twelve of this article increasing federal adjusted gross income; (B) Federal tax-exempt interest reported on federal tax return; (C) Workers' compensation and loss of earnings insurance; and (D) Nontaxable Social Security benefits … (f) No homeowner may receive a refundable tax credit imposed by this article in excess of $1,000. … (g) … no credit may be taken under this section for any homestead which is owned, in whole or in part, by any person who is not a low income person. (h)(2) \"Low income\" means federal adjusted gross income for the tax year that is three hundred percent or less of the federal poverty guideline'. SCHEDULE HEPTC-1 (verbatim): 'Part I … YES – Your federal adjusted gross income reported to the IRS must meet the following guidelines for you to qualify for this credit: If there is only 1 person living in your home, your federal adjusted gross income must be $46,950 or less. If there are 2 people … $63,450 or less. If there are 3 people … $79,950 or less. If there are 4 people … $96,450 or less. **For each additional person add $16,500. Part II … 1. Enter the total West Virginia property tax paid on your OWNER-OCCUPIED home during 2025 (Amount to be used is after discount and before interest is added); 2. If eligible for the Senior Citizen Tax Credit enter allowable credit from line 2 of Form SCTC-A; 3. Subtract line 2 from line 1 …; 4. Enter your Federal Adjusted Gross Income; a. Enter the amount of increasing income modifications reported on line 61 of Schedule M; b. Enter federal tax-exempt interest income; c. Enter amount received in 2025 in the form of earnings replacement insurance (Workers' Compensation Benefits); d. Enter the amount of Social Security benefits, including SSI and SSDI, received that are NOT included in your Federal Adjusted Gross Income; e. Enter the income of all individuals living in the household but would file a separate tax return; 5. Add amounts on lines 4a, 4b, 4c, 4d, and 4e; 6. Total Gross Income: Add amount entered on line 4 and line 5; 7. Multiply amount on line 6 by 4% (0.04); 8. Is the amount on line 3 greater than the amount on line 7? Yes. Continue to line 9 below. No. Stop — you are not eligible for this tax credit; 9. Subtract the amount on line 7 from the amount on line 3 and enter the result or $1,000, whichever is lower, and enter on line 19 of IT-140.' 'Check here if you were required to pay Federal Alternative Minimum Tax.' 'If you are claiming the Disabled Veterans Property Credit, you are not eligible to also claim this credit.' The guideline changes yearly — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { limitOne: { value: "4695000", type: "money" }, limitPerAdditional: { value: "1650000", type: "money" }, pctOfIncome: { value: "4", type: "int" }, cap: { value: "100000", type: "money" }, minimumRefund: { value: "1000", type: "money" } },
    formula: (() => {
      const size: Expr = iff(lt(fact("wvHouseholdSize"), int("1")), int("1"), fact("wvHouseholdSize"));
      const limit = add(money("4695000"), mulInt(money("1650000"), sub(size, int("1"))));
      const l3 = max0(sub(max0(fact("wvPropertyTaxPaid")), max0(fact("wvSeniorCitizenCredit"))));
      const l6 = add(fact("wvAgi"), max0(fact("wvAdditions")), max0(fact("wvTaxExemptInterest")), max0(fact("wvWorkersCompensation")), max0(fact("wvNontaxableSocialSecurity")), max0(fact("wvOtherHouseholdIncome")));
      const l7 = rd(pct(max0(l6), "4", "100"));
      const eligible = and(le(fact("wvHouseholdIncome"), limit), not(fact("wvFederalAmt")), not(fact("wvDisabledVeteranCreditClaimed")), gt(l3, l7));
      return iff(eligible, minE(money("100000"), sub(l3, l7)), money("0"));
    })(),
  },
  {
    id: "us.wv.use_tax",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia purchaser's use tax — 6% state use tax on untaxed purchases plus the municipal use tax (0.5% or 1%) on purchases used in a municipality that imposes it (Schedule UT, Form IT-140 line 13)",
    citation: {
      source: "2025 Schedule UT Parts I-III (p. 44) and Schedule UT instructions (p. 43); Form IT-140 line 13",
      section: "Schedule UT; Form IT-140 line 13",
      url: BOOKLET_URL,
      excerpt:
        "SCHEDULE UT (verbatim): 'Part I State Use Tax Calculation: 1. Amount of purchases subject to West Virginia Use Tax; 2. West Virginia Use Tax Rate; 3. West Virginia State Use Tax (Multiply line 1 by rate on line 2. Enter amount here and on line 9 below). Part II Municipal Use Tax Calculation: City/Town Name / Purchases Subject to Municipal Use Tax / Tax Rate / Municipal Tax Due (Purchases multiplied by rate) …' INSTRUCTIONS (verbatim): 'LINE 1 Enter the total dollar amount of all purchases made during the 2025 tax year that are subject to the 6% use tax rate. LINE 3 Multiply the amount on line 1 by the use tax rate on line 2. PART II. MUNICIPAL USE TAX CALCULATION — You owe municipal use tax on the total purchase price of taxable tangible personal property or taxable services that you used, stored, or consumed in a municipality that has imposed sales and use tax upon which you have not previously paid sales or use tax. … LINE 4C - 7C. Enter the tax rate. See www.tax.wv.gov for a complete list of municipalities and rates. LINE 4D - 7D. Multiply total purchases by the tax rate and enter total. … LINE 11 Enter total Use Tax due. Add lines 9 and 10 and enter total here and on line 13 of Form IT 140.' Example: '2. 6.0% West Virginia State use tax ($10,000 x .06) 600.00 … 2. 1.0% Municipality A sales/use tax ($10,000 x .01) 100.00'. Credit for sales tax paid to another state or municipality is netted before entry (the 'measure of tax' worksheet) — supply the net measure as the purchases. ENCODING: round(6% × purchases) + round(municipal bps × municipal purchases).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { stateRateBps: { value: "600", type: "int" } },
    formula: add(
      rd(pct(max0(fact("wvUseTaxPurchases")), "6", "100")),
      rd({ kind: "mulDiv", a: max0(fact("wvMunicipalUseTaxPurchases")), b: mulInt(money("1"), fact("wvMunicipalUseTaxRateBps")), c: money("10000"), round: "half-up" }),
    ),
  },
  {
    id: "us.wv.parameters",
    version: 1,
    jurisdiction: "us.wv",
    title: "West Virginia 2025 Form IT-140 parameters — line structure, Schedule M lines and caps, the Recap credits, the property tax adjustment credits, and the enacted TY2026 position",
    citation: {
      source: "2025 West Virginia Personal Income Tax Forms & Instructions (IT-140, Schedules M, Recap, HEPTC-1, FTC-1, E, UT); W. Va. Code §§ 11-21-4i, 4j, 4h, 10, 12, 16, 20, 21, 22, 23, 26; 11-13MM-3, -4, -5; 2026 SB 392; web-verified September 2026",
      section: "Form IT-140 lines 1-28; Schedule M lines 29-59; Recap lines 1-27",
      url: BOOKLET_URL,
      excerpt:
        "STRUCTURE (printed 2025 IT-140): filing status 1 Single, 2 Head of Household, 3 Married Filing Joint, 4 Married Filing Separate, 5 Widow(er) with dependent child ('Your filing status is generally the same filing status shown on your federal return'; a joint federal return may elect state MFS under Rate Schedule II); exemptions (a)-(e) (→ us.wv.exemption_deduction); 1 federal AGI ('or income to claim senior citizen tax credit from Schedule SCTC-A'); 2 additions (Schedule M line 59 — the printed IT-140 line 2 caption says 'line 61 of Schedule M' and line 3 says 'line 52', two higher than the printed Schedule M: 51 interest on federal obligations taxable by the state, 52 non-West Virginia state and local bond interest, 53 interest on debt carrying exempt bonds, 54 § 402(e) lump sums, 55 other income excluded federally, 56-58 nonqualified SMART529 / ABLE / Jumpstart withdrawals); 3 subtractions (Schedule M line 50, columns A (You) and B (Spouse): 29 U.S. and West Virginia obligation interest, 30 federal law enforcement retirement, 31 West Virginia police / deputy sheriff / firemen's retirement (100%), 32 military retirement (100%, § 11-21-12(c)(7)(C)), 33 PERS / Teachers' Retirement and federal retirement — combined 'not to exceed $2,000' per person (§ 11-21-12(c)(5)), 34 Social Security (→ us.wv.social_security_modification), 35 S corporation bank assets, 36 active duty military pay (Title 10 contingency operations), 37 active military separation pay, 38 state and local income tax refunds in federal income, 39 SMART529 / Prepaid Tuition contributions (no cap), 40 Railroad Retirement Board income (100%), 41 long-term care insurance premiums, 42 IRC 1341 repayments over $3,000, 43 ABLE contributions, 44 Jumpstart Savings deposits 'not to exceed $25,000', 45 PBGC modification, 46 gambling losses (≤ winnings, itemizers only), 47 senior citizen / disability modification (→ us.wv.senior_citizen_modification), 48 surviving spouse (→ us.wv.surviving_spouse_modification)); 4 West Virginia AGI = 1 + 2 − 3; 5 low-income earned income exclusion (→ us.wv.low_income_exclusion); 6 exemptions × $2,000; 7 taxable income (not below zero); 8 tax — Tax Table / Rate Schedule (→ us.wv.income_tax); 9 Recap credits (1 other state → us.wv.other_state_credit; 2 Family Tax Credit → us.wv.family_tax_credit; 3-17 and 19-26 business/certificated credits; 18 child and dependent care → us.wv.child_care_credit; 27 total); 10 = 8 − 9 (not below zero); 11 amended: prior refund; 12 Form IT-210 underpayment penalty ('If line 8 minus line 9, 15, 17, 18, 19, 20 and 21 is greater than $600, you may be subject to a penalty'); 13 use tax (→ us.wv.use_tax); 14 total due = 10 + 11 + 12 + 13; 15 withholding; 16 estimated payments and WV-4868 payments; 17 Non-Family Adoption credit (NFA-1); 18 Senior Citizens Tax Credit (→ us.wv.senior_citizens_tax_credit); 19 HEPTC (→ us.wv.homestead_excess_property_tax_credit); 20 Build WV property value adjustment credit (PVA-2); 21 property tax adjustment credits — A motor vehicle (§ 11-13MM-3: 'the amount of West Virginia ad valorem property tax timely paid … on the value of a motor vehicle owned by the eligible taxpayer', refundable), B disabled veteran real property (§ 11-13MM-4: 'equal to the amount of West Virginia ad valorem real property taxes timely paid … on a homestead', refundable; bars the SCTC and HEPTC), C small business (§ 11-13MM-5: '50% of the amount of West Virginia ad valorem property tax due and owing and timely paid … on personal property', aggregate appraised value ≤ $1 million); 22 amended: paid with original; 23 payments and refundable credits = 15-22; 24 balance due = 14 − 23; 25 overpayment = 23 − 14; 26 donations (Children's Trust Fund, Division of Veterans Assistance, Donel C. Kinnard Memorial State Veterans Cemetery); 27 credited to 2026 estimated tax; 28 refund = 25 − 26 − 27 ('To receive a refund of $2 or less, you must enclose a signed statement with your return requesting that the refund be sent to you'). ROUNDING: 'Round off amounts to WHOLE DOLLARS – NO CENTS.' RESIDENCY: nonresidents and part-year residents complete Schedule A (income ratio × Rate Schedule tax) — not composed; Special Nonresidents (KY, MD, OH, PA, VA wage earners) use Schedule A Part II. PENALTIES: late filing 5% per month to 25%; late payment ½% per month to 25%; interest at prime + 3. TY2026 (enacted): § 11-21-4j rates 2.11 / 2.81 / 3.16 / 4.22 / 4.58% (SB 392, effective June 12, 2026, retroactive to January 1, 2026) — version 2 of us.wv.income_tax; Social Security 100% exempt at any income (§ 11-21-12(c)(8)(E)) — version 2 of us.wv.social_security_modification; the Family Tax Credit, SCTC, and HEPTC guidelines re-index to the 2026 poverty guidelines (unpublished) — those rules end 2026-01-01; the § 11-21-4h trigger determination on August 15, 2026 can only change TY2027.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      persTrsFederalRetirementCap: { value: "200000", type: "money" },
      jumpstartDepositCap: { value: "2500000", type: "money" },
      irc1341Minimum: { value: "300000", type: "money" },
      motorVehicleCreditPct: { value: "100", type: "int" },
      disabledVeteranCreditPct: { value: "100", type: "int" },
      smallBusinessCreditPct: { value: "50", type: "int" },
      underpaymentPenaltyThreshold: { value: "60000", type: "money" },
      smallRefundStatementThreshold: { value: "200", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: West Virginia Form IT-140 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.wv.income_tax, us.wv.exemption_deduction, us.wv.low_income_exclusion, us.wv.social_security_modification, us.wv.senior_citizen_modification, us.wv.surviving_spouse_modification, us.wv.family_tax_credit, us.wv.other_state_credit, us.wv.child_care_credit, us.wv.senior_citizens_tax_credit, us.wv.homestead_excess_property_tax_credit, and us.wv.use_tax",
    },
  },
];
