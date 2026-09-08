import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Maine deep pack — TY2025 Form 1040ME (full-year resident). Every amount
 * verified from the 2025 Maine Resident Individual Income Tax Booklet
 * (Form 1040ME general instructions, 13 pp incl. the Standard Deduction
 * Chart, the deduction and exemption phase-out worksheets, the tax table
 * through $52,000, and the rate schedules), MRS's standalone "2025 Maine
 * Income Tax Table" (5 pp, to $100,000) and "State of Maine - Individual
 * Income Tax 2025 Rates" sheet, the printed 2025 Form 1040ME, Schedules 1A,
 * 1S (with the Pension Income Deduction Worksheet), 2, A, PTFC/STFC, the
 * Dependent Exemption, Child Care, Adult Dependent Care, Earned Income, and
 * Other Jurisdiction credit worksheets, and 36 M.R.S. §§ 5111, 5111-A, 5122,
 * 5124-C, 5125, 5126-A, 5213-A, 5217-A, 5218, 5218-A, 5219-KK, 5219-S,
 * 5219-SS, 5403 (legislature.maine.gov snapshot of October 20, 2025, read together
 * with the chaptered 2026-session acts P.L. 2025, c. 650 and c. 752).
 *
 * Load-bearing findings:
 *  - The 2025 rate schedules index § 5111's 2017 tables (factor 1.274 on the
 *    low bracket, 1.269 on the high): single/MFS $26,800 / $63,450 with
 *    printed anchors $1,554 / $4,028; HOH $40,200 / $95,150 ($2,332 /
 *    $6,041); MFJ/QSS $53,600 / $126,900 ($3,109 / $8,057). The tax table
 *    ($100 rows to $100,000) is the PRINTED-ANCHOR schedule at the row
 *    midpoint rounded half-up — all 1,000 rows × 3 columns reproduce; the
 *    exact statutory schedule misses 680 cells.
 *  - Maine conforms to the IRC as of December 31, 2024, so the 2025 standard
 *    deduction is the pre-OBBBA federal amount ($15,000 / $30,000 / $22,500
 *    plus $1,600 / $2,000 age-blind amounts), phased out above $100,000 /
 *    $150,000 / $200,050 of Maine AGI; the $5,150 personal exemption phases
 *    out above $333,450 / $366,750 / $400,100 ($200,050 MFS).
 *  - 2025 changes (P.L. 2025, c. 271 and c. 388): the $48,216 pension
 *    deduction phases out above $125,000 / $187,500 / $250,000 of federal
 *    AGI; the dependent exemption credit is $305 ($610 under age 6) and
 *    phases out $20 per $500 over $100,000 / $125,000 / $150,000 ($75,000
 *    MFS); the Sales Tax Fairness Credit tables are exactly the § 5213-A
 *    formula on indexed bases ($155; $215 / $250 / $280) and thresholds
 *    ($25,450 / $38,200 / $50,950) — verified on all 50 printed rows.
 *  - TY2026 (P.L. 2025, c. 650 and MRS's May 2026 rate sheet): brackets
 *    $27,400 / $64,850 etc., a new 2% surcharge over $1,000,000 ($750,000
 *    MFS; $1,500,000 HOH and joint), a fixed $15,700 basic standard deduction
 *    (× 1.5 / × 2), $5,300 exemption, $37,100 itemized cap — version 2 of
 *    those rules; the pension, dependent credit, PTFC, and STFC amounts are
 *    unpublished for 2026, so those rules end 2026-01-01.
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
const isJoint: Expr = or(isStatus("mfj"), isStatus("qss")); // "*This column must also be used by a surviving spouse with dependent child"
const isHoh: Expr = isStatus("hoh");
const isMfs: Expr = isStatus("mfs");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents × 10^4) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** printed rate schedule: fixed (rounded, as printed) + rate × excess over the bracket floor, one rounding */
const printedSchedule = (base: Expr, rows: { thresholdCents: string; fixedCents: string; rateNum: string }[]): Expr => {
  let expr: Expr = dollarsFromScaled(add(times(money(rows[0].fixedCents), "10000"), times(sub(base, money(rows[0].thresholdCents)), rows[0].rateNum)));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    expr = iff(ge(base, money(r.thresholdCents)), dollarsFromScaled(add(times(money(r.fixedCents), "10000"), times(sub(base, money(r.thresholdCents)), r.rateNum))), expr);
  }
  return expr;
};
/** ratio to four decimals, half-up, capped at 1.0000 — returned as basis points ×100 (an int 0..10000) in cents units */
const ratio4 = (num: Expr, den: string): Expr => minE({ kind: "mulDiv", a: max0(num), b: money("10000"), c: money(den), round: "half-up" }, money("10000"));
const applyRatio = (base: Expr, r: Expr): Expr => rd({ kind: "mulDiv", a: base, b: r, c: money("10000"), round: "half-up" });

// 2025 Rate Schedules (MRS "2025 Rates", February 3, 2026; booklet p. 12)
const SCHED_SINGLE = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
  { thresholdCents: "2680000", fixedCents: "155400", rateNum: "675" }, // $1,554 plus 6.75% of excess over $26,800
  { thresholdCents: "6345000", fixedCents: "402800", rateNum: "715" }, // $4,028 plus 7.15% of excess over $63,450
];
const SCHED_HOH = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
  { thresholdCents: "4020000", fixedCents: "233200", rateNum: "675" }, // $2,332 plus 6.75% over $40,200
  { thresholdCents: "9515000", fixedCents: "604100", rateNum: "715" }, // $6,041 plus 7.15% over $95,150
];
const SCHED_JOINT = [
  { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
  { thresholdCents: "5360000", fixedCents: "310900", rateNum: "675" }, // $3,109 plus 6.75% over $53,600
  { thresholdCents: "12690000", fixedCents: "805700", rateNum: "715" }, // $8,057 plus 7.15% over $126,900
];
const scheduleTax = (x: Expr): Expr => iff(isJoint, printedSchedule(x, SCHED_JOINT), iff(isHoh, printedSchedule(x, SCHED_HOH), printedSchedule(x, SCHED_SINGLE)));

const BOOKLET_URL = "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_1040me_gen_instr_w_cover_pg.pdf";
const RATES_URL = "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/ind_tax_rate_sched_2025.pdf";
const TABLE_URL = "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_tax_tables.pdf";
const FORMS = "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/";
const MRS = (s: string) => `https://legislature.maine.gov/statutes/36/title36sec${s}.html`;

export const meRules: Rule[] = [
  {
    id: "us.me.income_tax",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine income tax — 2025 rate schedules (5.8 / 6.75 / 7.15% at $26,800 / $63,450 single and MFS; $40,200 / $95,150 HOH; $53,600 / $126,900 MFJ and QSS) and the 2025 tax table (printed-anchor schedule at the $100 row midpoint, to $100,000) (Form 1040ME line 20)",
    citation: {
      source: "36 M.R.S. § 5111(1-F), (2-F), (3-F) (2017 tables) as indexed under § 5403(1) (factors 1.274 and 1.269 for 2025); § 5111-A (tax tables 'approximating as near as practicable'); MRS 'State of Maine - Individual Income Tax 2025 Rates' (Feb. 3, 2026); '2025 Maine Income Tax Table' (5 pp); 2025 booklet pp. 11-12; Form 1040ME line 20",
      section: "§§ 5111, 5111-A, 5403(1); Form 1040ME line 20",
      url: RATES_URL,
      excerpt:
        "STATUTE (§ 5111(1-F), verbatim): 'For tax years beginning on or after January 1, 2017, for single individuals and married persons filing separate returns: Less than $21,050 — 5.8% of the Maine taxable income; At least $21,050 but less than $50,000 — $1,221 plus 6.75% of the excess over $21,050; $50,000 or more — $3,175 plus 7.15% of the excess over $50,000.' (2-F) heads of households: '$31,550 … $75,000 … $1,830 … $4,763'; (3-F) married joint returns or surviving spouses: '$42,100 … $100,000 … $2,442 … $6,350'. § 5403(1): 'A. Beginning in 2016 and each year thereafter, by the lowest dollar amounts of the tax rate tables … the \"cost-of-living adjustment\" is the Chained Consumer Price Index for the 12-month period ending June 30th of the preceding calendar year divided by the Chained Consumer Price Index for the 12-month period ending June 30, 2015; and B. Beginning in 2017 and each year thereafter, by the highest taxable income dollar amount of each tax rate table … divided by the Chained Consumer Price Index for the 12-month period ending June 30, 2016'. § 5111-A: 'In lieu of a tax computed exactly according to the rates set forth in section 5111, taxpayers may utilize a tax table. The State Tax Assessor shall prepare and issue tables approximating as near as practicable the tax computed using section 5111 for this express purpose.' MRS 2025 RATES (verbatim): 'For tax years beginning in 2025, an inflation adjustment is made by multiplying the cost-of-living adjustment, 1.274, by the lowest dollar amounts of the tax rate tables … and by multiplying the cost-of-living adjustment, 1.269, by the highest dollar amounts … Tax Rate Schedule #1 For Single Individuals and Married Persons Filing Separate Returns: Less than $26,800 — 5.8% of Maine taxable income; $26,800 but less than $63,450 — $1,554 plus 6.75% of excess over $26,800; $63,450 or more — $4,028 plus 7.15% of excess over $63,450. Tax Rate Schedule #2 For Unmarried or Legally Separated Individuals who Qualify as Heads of Household: Less than $40,200 — 5.8%; $40,200 but less than $95,150 — $2,332 plus 6.75% of excess over $40,200; $95,150 or more — $6,041 plus 7.15% of excess over $95,150. Tax Rate Schedule #3 For Married Individuals and Surviving Spouses Filing Joint Returns: Less than $53,600 — 5.8%; $53,600 but less than $126,900 — $3,109 plus 6.75% of excess over $53,600; $126,900 or more — $8,057 plus 7.15% of excess over $126,900.' FORM (line 20, verbatim): 'INCOME TAX. (Find the tax for the amount on line 19 in the tax table in this booklet or compute your tax using the tax table or tax rate schedules available at maine.gov/revenue/tax-return-forms.)' ROUNDING (p. 3): 'Use whole dollar amounts. Round down to the next lower dollar any amount less than 50 cents. Round up to the next higher dollar any amount 50 cents or more.' TAX TABLE (verbatim rows, columns 'Single or Married-Filing Separately / Married Filing Jointly* / Head of Household', '*This column must also be used by a surviving spouse with dependent child'): '0 100 3 3 3', '100 200 9 9 9', '200 300 15 15 15', '26,900 27,000 1,564 1,563 1,563', '50,000 50,100 3,123 2,903 2,997', '99,900 100,000 6,638 6,238 6,384' (the booklet's page 11 splits the first row as '0 50 0 0 0' / '50 100 3 3 3' while the standalone 5-page table prints '0 100 3 3 3' — the booklet's $0 for taxable income under $50 is followed, so a $0 taxable income owes $0). CONVENTION (verified on all 1,000 rows × 3 columns): each cell is the printed rate schedule (rounded anchors $1,554 / $4,028 etc., not the exact 5.8% × $26,800 = $1,554.40) at the row midpoint (lo + 50), rounded half-up — the exact statutory schedule misses 680 cells (e.g. single 26,900-27,000 prints $1,564; the exact schedule gives $1,565). HAND-OFF (verbatim, last table row): '100,000 and over — 6,638 plus 7.15% of excess over 100,000 [Single or Married-Filing Separately] / See the tax rate schedule below. [Married Filing Jointly*] / 6,384 plus 7.15% of excess over 100,000 [Head of Household]'. ENCODING: default = the table method — under $100,000 the midpoint of the [lo, lo+100) row on the printed schedule; from $100,000 the printed hand-off for single/MFS ($6,638 + 7.15%) and HOH ($6,384 + 7.15%), and Rate Schedule #3 for joint filers; meUseRateSchedule = true applies the rate schedule at any income (the § 5111 computation; differs from the table by up to about $4 — the hand-off constants are the last row's midpoint values, $3 under the schedule at $100,000). MFS uses the single schedule/column; a federal QSS uses the joint one. Nonresidents and part-year residents apply Schedule NR (not composed). 2026 brackets re-index — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "580", type: "int" },
      rate2Bps: { value: "675", type: "int" },
      rate3Bps: { value: "715", type: "int" },
      singleBracket1: { value: "2680000", type: "money" },
      singleBracket2: { value: "6345000", type: "money" },
      hohBracket1: { value: "4020000", type: "money" },
      hohBracket2: { value: "9515000", type: "money" },
      jointBracket1: { value: "5360000", type: "money" },
      jointBracket2: { value: "12690000", type: "money" },
      tableTop: { value: "10000000", type: "money" },
      lowBracketCola: { value: "1274", type: "int" },
      highBracketCola: { value: "1269", type: "int" },
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const mid: Expr = add(mulInt(money("10000"), stepUnits(x, "10000", "floor")), money("5000"));
      // printed hand-off row "100,000 and over": single/MFS "6,638 plus 7.15% of excess over 100,000"; HOH "6,384 plus 7.15% …"; joint "See the tax rate schedule below."
      const handoff = (baseCents: string): Expr => dollarsFromScaled(add(times(money(baseCents), "10000"), times(sub(x, money("10000000")), "715")));
      // booklet p. 11 prints the first $100 as two rows: '0 50 0 0 0' and '50 100 3 3 3' (the standalone table prints '0 100 3'); taxable income under $50 owes nothing
      const under100: Expr = iff(lt(x, money("5000")), money("0"), money("300"));
      const tableMethod: Expr = iff(lt(x, money("10000")), under100, iff(lt(x, money("10000000")), scheduleTax(mid), iff(isJoint, scheduleTax(x), iff(isHoh, handoff("638400"), handoff("663800")))));
      return iff(fact("meUseRateSchedule"), scheduleTax(x), tableMethod);
    })(),
  },
  {
    id: "us.me.standard_deduction",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine standard deduction 2025 — $15,000 single and MFS, $30,000 MFJ and QSS, $22,500 HOH (§ 5124-C(1-B) as amended by P.L. 2025, c. 650 and c. 752: a $15,000 basic amount, × 1.5 HOH, × 2 joint) plus the federal $1,600 (married, QSS) or $2,000 (single, HOH) per 65-or-older/blind box; the same chart amount for a filer claimable as a dependent (Form 1040ME line 17, before the phase-out)",
    citation: {
      source: "36 M.R.S. § 5124-C(1-B) as amended by P.L. 2025, c. 650, Pt. K, § 13 (L.D. 2212, approved April 10, 2026) and c. 752, § 1 (April 16, 2026) — for tax years beginning in 2025 the sum of a $15,000 basic standard deduction (× 1.5 HOH, × 2 joint) and the Code § 63(c)(3) additional amounts; before those acts § 5124-C(1-A) read 'equal to the federal standard deduction' (Code as of December 31, 2024); 2025 booklet, 'Maine Standard Deduction Chart for line 17' p. 4 and '2025 Tax Year Quick Facts' p. 10; MRS 2025 Rates sheet",
      section: "§ 5124-C(1-A); Form 1040ME lines 12a-12d, 17",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (§ 5124-C as amended by P.L. 2025, c. 650, Pt. K, §§ 12-13 and c. 752, § 1): subsection 1-A ('equal to the federal standard deduction') now ends 'before January 1, 2025', and subsection 1-B covers 'tax years beginning on or after January 1, 2025 and before January 1, 2026': 'the standard deduction of a resident individual is equal to the sum of the basic standard deduction and the additional standard deduction, subject to the phase-out under subsection 2. A. The basic standard deduction is: (1) For single individuals and married persons filing separate returns, $15,000 [c. 752 struck $12,000]; (2) For individuals filing as heads of households, the amount allowed under subparagraph (1) multiplied by 1.5; and (3) For individuals filing married joint returns or surviving spouses, the amount allowed under subparagraph (1) multiplied by 2. B. The additional standard deduction is the amount allowed under the Code, Section 63(c)(3).' (MRS 2026 Tax Law Changes: the TY2025 basic standard deduction is '$15,000 for single individuals and married persons filing separate returns; $22,500 for individuals filing as heads of households; and $30,000 for individuals filing married joint returns or surviving spouses'.) The pre-amendment text (10/20/2025 snapshot) read: '1-A. Amount; before January 1, 2026. … equal to the federal standard deduction, subject to the phase-out under subsection 2.' QUICK FACTS (verbatim): 'Maine standard deduction base amounts: $15,000 single or married filing separately; $22,500 head of household; $30,000 married filing jointly or qualifying surviving spouse.' CHART (verbatim, 'Enter the number of boxes checked on Form 1040ME, lines 12a, 12b, 12c, and 12d … If your Filing Status is / AND the number in the box above is / Enter on Form 1040ME, line 17'): 'Single None $15,000; 1 $17,000; 2 $19,000. Married filing Jointly or Qualifying Surviving Spouse None $30,000; 1 $31,600; 2 $33,200; 3 $34,800; 4 $36,400. Married filing Separately* None $15,000; 1* $16,600; 2* $18,200; 3* $19,800; 4* $21,400. Head of Household None $22,500; 1 $24,500; 2 $26,500.' '*The additional deduction amounts for your spouse (boxes 12c and 12d) apply only if you can claim an exemption for your spouse.' MRS RATES SHEET: 'Additional Amount for Age or Blindness: $1,600 if married (whether filing jointly or separately) or a qualified surviving spouse … $2,000 if unmarried (single or head of household).' The 2025 IMPORTANT UPDATE (cover): 'Under current law, Maine conforms to the Internal Revenue Code … as of December 31, 2024' — so the pre-OBBBA 2025 federal amounts (Rev. Proc. 2024-40: $15,000 / $30,000 / $22,500; dependent limitation $1,350 / earned income + $450) apply, not the federal $15,750 / $31,500 / $23,625. ENCODING: base by status + boxes × $2,000 (single, HOH) or $1,600 (MFJ, QSS, MFS); no dependent-filer limitation — the amended statute incorporates only the § 63(c)(3) age/blind amounts, and the booklet's chart has no dependent row. The § 5124-C(2) phase-out is us.me.deduction_phaseout. TY2026: § 5124-C(1-C) fixes a $15,700 basic amount — version 2.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "1500000", type: "money" },
      joint: { value: "3000000", type: "money" },
      hoh: { value: "2250000", type: "money" },
      perBoxSingleHoh: { value: "200000", type: "money" },
      perBoxMarried: { value: "160000", type: "money" },
    },
    formula: (() => {
      const base: Expr = iff(isJoint, money("3000000"), iff(isHoh, money("2250000"), money("1500000")));
      const perBox: Expr = iff(or(isStatus("single"), isHoh), money("200000"), money("160000"));
      return add(base, mulInt(perBox, fact("meAgeBlindBoxes")));
    })(),
  },
  {
    id: "us.me.itemized_deductions",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine itemized deductions — Schedule 2: federal Schedule A total less taxes (line 5e), Maine-exempt-income costs, and medical expenses, plus real estate and personal property taxes (lines 5b, 5c) and Maine-taxable-exempt-income costs, capped at $36,300, plus medical expenses added back uncapped (Form 1040ME line 17, before the phase-out)",
    citation: {
      source: "36 M.R.S. § 5125(1), (3), (4) ($28,350 indexed under § 5403(3) to $36,300 for 2025); 2025 Form 1040ME Schedule 2 lines 1-7 and instructions p. 24; booklet Quick Facts p. 10",
      section: "§ 5125; Schedule 2 lines 1-7",
      url: FORMS + "25_1040me_sch_2_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): '3. Amount. The sum of an individual's itemized deductions from federal adjusted gross income must be: A. Reduced by any amount attributable to income taxes or sales and use taxes imposed by this State or any other taxing jurisdiction; A-1. Increased by the amount of property taxes not claimed under the Code, Section 164(a)(1) and (2) as a result of the limitation under the Code, Section 164(b)(6)(B); B. Increased by any amount of interest or expense incurred in the production of income taxable under this Part but exempt from federal income tax …; C. Reduced by any amount of deduction attributable to income taxable to financial institutions under chapter 819; and D. Reduced by any amount attributable to interest or expenses incurred in the production of income exempt from tax under this Part. 4. Limitation. The total itemized deductions from Maine adjusted gross income claimed on a return may not exceed $28,350, except the limitation does not apply to medical and dental expenses included in an individual's itemized deductions from federal adjusted gross income.' SCHEDULE 2 (verbatim): '1. Total itemized deductions from federal Form 1040 or 1040-SR, Schedule A, line 17; 2. a. Taxes you paid included in line 1 above from federal Form 1040 or 1040-SR, Schedule A, line 5e; or Form 1040-NR, Schedule A, line 1b; b. Deductible costs, included in line 1 above, incurred in the production of Maine exempt income; c. Amount included in line 1 attributable to income from an ownership interest in a pass-through entity financial institution; d. Medical and dental expenses included in line 1 above from federal Form 1040 or 1040-SR, Schedule A, line 4; e. Other. This line is reserved for future use; f. Total. Add lines 2a, 2b, 2c, 2d, and 2e. 3. a. Deductible costs of producing income exempt from federal income tax, but taxable by Maine; b. State and local real estate taxes you paid from federal Form 1040 or 1040-SR, Schedule A, line 5b; c. Personal property taxes you paid from federal Form 1040 or 1040-SR, Schedule A, line 5c; d. Other …; e. Total. Add lines 3a, 3b, 3c, and 3d. 4. Line 1 minus line 2f plus line 3e. 5. Maximum allowable itemized deduction — 36,300.00. 6. Enter the smaller of line 4 or line 5. 7. Add line 2d and line 6. Enter the result here and on Form 1040ME, line 17.* *Note: If the amount on line 7 above is less than your allowable standard deduction, use the standard deduction. If married filing separately, however, both spouses must either itemize or use the standard deduction.' QUICK FACTS: 'Maine itemized deductions are limited to $36,300, except medical expenses are not subject to the limit.' The § 5125(7) phase-out is us.me.deduction_phaseout. The cap indexes — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "3630000", type: "money" } },
    formula: (() => {
      const l2f = add(max0(fact("meSaltTaxes5e")), max0(fact("meExemptIncomeCosts")), max0(fact("meFinancialInstitutionCosts")), max0(fact("meMedicalDeduction")));
      const l3e = add(max0(fact("meMaineTaxableIncomeCosts")), max0(fact("meRealEstateTaxes5b")), max0(fact("mePersonalPropertyTaxes5c")));
      const l4 = max0(add(sub(max0(fact("meFederalItemizedDeductions")), l2f), l3e));
      return add(max0(fact("meMedicalDeduction")), minE(l4, money("3630000")));
    })(),
  },
  {
    id: "us.me.deduction_phaseout",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine standard / itemized deduction phase-out — the deduction reduced by itself × (Maine AGI − $100,000 / $150,000 / $200,050) ÷ $75,000 / $112,500 / $150,000, ratio to four decimals capped at 1.0000 (Form 1040ME line 17 worksheet)",
    citation: {
      source: "36 M.R.S. §§ 5124-C(2), 5125(7) ($80,000 / $120,000 / $160,000 indexed under § 5403(4)); 2025 booklet, 'Worksheet for Standard / Itemized Deductions (for Form 1040ME, line 17)' p. 4",
      section: "§§ 5124-C(2), 5125(7); Form 1040ME line 17 worksheet",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (§ 5124-C(2), verbatim): 'The standard deduction of the taxpayer must be reduced by an amount equal to the total standard deduction multiplied by the following fraction: A. For single individuals and married persons filing separate returns, the numerator is the taxpayer's Maine adjusted gross income less $80,000, except that the numerator may not be less than zero, and the denominator is $75,000. In no case may the fraction calculated pursuant to this paragraph produce a result that is more than one. …; B. For individuals filing as heads of households, the numerator is the taxpayer's Maine adjusted gross income less $120,000 … and the denominator is $112,500 …; or C. For individuals filing married joint returns or surviving spouses permitted to file a joint return, the numerator is the taxpayer's Maine adjusted gross income less $160,000 … and the denominator is $150,000.' (§ 5125(7) is identical for itemized deductions.) WORKSHEET (verbatim): 'Use this worksheet to calculate your standard deduction or itemized deduction if your Maine adjusted gross income for 2025 is greater than $100,000 if single or married filing separately; $150,000 if head of household; or $200,050 if married filing jointly or qualifying surviving spouse. 1. Enter your 2025 Maine adjusted gross income (Form 1040ME, line 16); 2. Enter $100,000 if single or married filing separately; $150,000 if head of household; or $200,050 if married filing jointly or qualifying surviving spouse; 3. Subtract line 2 from line 1. If zero or less, STOP here. Your deduction is not limited; 4. Enter $75,000 if single or married filing separately; $112,500 if head of household; or $150,000 if married filing jointly or qualifying surviving spouse; 5. Divide line 3 by line 4. If one or more, enter 1.0000; 6. Enter your 2025 standard deduction from the chart above or your 2025 Maine itemized deductions from Form 1040ME, Schedule 2, line 7, whichever applies; 7. Multiply line 6 by line 5; 8. 2025 Maine itemized deductions or standard deduction. Subtract line 7 from line 6. Enter this amount on Form 1040ME, line 17.' ENCODING: ratio to four decimals (half-up), line 7 rounded to whole dollars. The thresholds index — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      thresholdSingleMfs: { value: "10000000", type: "money" },
      thresholdHoh: { value: "15000000", type: "money" },
      thresholdJoint: { value: "20005000", type: "money" },
      rangeSingleMfs: { value: "7500000", type: "money" },
      rangeHoh: { value: "11250000", type: "money" },
      rangeJoint: { value: "15000000", type: "money" },
    },
    formula: (() => {
      const agi = fact("meAgi");
      const ded = max0(fact("meDeductionBeforePhaseout"));
      const r: Expr = iff(isJoint, ratio4(sub(agi, money("20005000")), "15000000"), iff(isHoh, ratio4(sub(agi, money("15000000")), "11250000"), ratio4(sub(agi, money("10000000")), "7500000")));
      return max0(sub(ded, applyRatio(ded, r)));
    })(),
  },
  {
    id: "us.me.personal_exemption",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine personal exemption deduction — $5,150 per exemption on line 13 (yourself, and your spouse on a joint return or an MFS return where the spouse has no income), phased out by Maine AGI over $333,450 / $366,750 / $400,100 / $200,050 across $125,000 ($62,500 MFS) (Form 1040ME line 18)",
    citation: {
      source: "36 M.R.S. § 5126-A(1)-(2) ($4,150 and $266,700 / $293,350 / $320,000 indexed under § 5403(7)-(8); factor 1.25 for 2025 per the MRS rates sheet); 2025 booklet, line 13 chart and line 18 'Worksheet for Phaseout of Personal Exemption Deduction Amount' pp. 4-5",
      section: "§ 5126-A; Form 1040ME lines 13, 18",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '1. Amount. For income tax years beginning on or after January 1, 2018, a resident individual is allowed a personal exemption deduction for the taxable year equal to $4,150, unless the individual may be claimed as a dependent on another return. A resident individual is allowed an additional personal exemption deduction for the taxable year equal to $4,150 if the individual is married filing a joint return. For income tax years beginning on or after January 1, 2020, a resident individual is allowed an additional personal exemption deduction … if the individual is married and does not file a joint return, as long as the individual's spouse has no federal gross income during the taxable year and … an exemption deduction would be allowed for the individual's spouse under the Code … No additional personal exemption deduction is allowed under this section if the individual's spouse may be claimed as a dependent on another return. 2. Phase-out. The personal exemption deduction amount … must be reduced by an amount equal to the total personal exemption deduction amount multiplied by a fraction. The numerator of the fraction is the taxpayer's Maine adjusted gross income less the applicable amount, except that the numerator may not be less than zero, and the denominator is $62,500 in the case of a married individual filing a separate return and $125,000 in all other cases. In no case may the fraction contained in this subsection produce a result that is more than one. … \"applicable amount\" means: A. For single individuals, $266,700; B. For individuals filing as heads of households, $293,350; C. For individuals filing married joint returns or surviving spouses, $320,000; or D. For married individuals filing separate returns, 1/2 of the applicable amount under paragraph C.' BOOKLET (verbatim): 'Line 13. Personal exemptions. If your Filing Status on lines 3 through 7 is: Single*; Married filing separately*; Head of household; or*; Qualifying surviving spouse* — Enter 1. *Except, if you may be claimed as a dependent on another person's return — 0. *If married filing separately AND you would claim a federal personal exemption for your spouse, if not for the suspension of the federal personal exemption deduction — 2. Married filing jointly** — 2. **Except, if married filing jointly AND BOTH you and your spouse may be claimed as dependents on another person's return — 0. **If married filing jointly AND only ONE spouse may be claimed as a dependent on another person's return — 1.' 'Line 18. Exemption. Multiply the amount shown on line 13 by $5,150. CAUTION: If the amount on Form 1040ME, line 16 is more than $333,450 if filing single; $366,750 if head of household; $400,100 if married filing jointly or qualifying surviving spouse; or $200,050 if married filing separately, you must complete the Worksheet for Phaseout of Personal Exemption Deduction Amount'. WORKSHEET: '… 4. Enter $125,000 if single or head of household or married filing jointly or qualifying surviving spouse; $62,500 if married filing separately; 5. Divide line 3 by line 4. If one or more, enter 1.0000; 6. Enter the 2025 personal exemption deduction amount (multiply the amount on Form 1040ME, line 13 by $5,150); 7. Multiply line 6 by line 5; 8. … Subtract line 7 from line 6.' Indexed — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "515000", type: "money" },
      thresholdSingle: { value: "33345000", type: "money" },
      thresholdHoh: { value: "36675000", type: "money" },
      thresholdJoint: { value: "40010000", type: "money" },
      thresholdMfs: { value: "20005000", type: "money" },
      range: { value: "12500000", type: "money" },
      rangeMfs: { value: "6250000", type: "money" },
    },
    formula: (() => {
      const ex = mulInt(money("515000"), fact("meExemptions"));
      const agi = fact("meAgi");
      const r: Expr = iff(isJoint, ratio4(sub(agi, money("40010000")), "12500000"), iff(isHoh, ratio4(sub(agi, money("36675000")), "12500000"), iff(isMfs, ratio4(sub(agi, money("20005000")), "6250000"), ratio4(sub(agi, money("33345000")), "12500000"))));
      return max0(sub(ex, applyRatio(ex, r)));
    })(),
  },
  {
    id: "us.me.pension_deduction",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine pension income deduction — per recipient: eligible non-military retirement plan and IRA benefits up to $48,216 less all Social Security and railroad retirement received, phased out by federal AGI over $125,000 / $187,500 / $250,000 ($62,500 MFS) across $100,000 ($50,000 MFS), plus 100% of military retirement pay (Schedule 1S line 4 worksheet)",
    citation: {
      source: "36 M.R.S. § 5122(2)(M-2), (M-3) (P.L. 2025, c. 271, Pt. C and c. 388, Pt. H); 2025 Schedule 1S 'Worksheet for Pension Income Deduction' lines P1-P10 and 'Worksheet for Phaseout of Non-Military Pension Income Deduction' p. 22; booklet Schedule 1S line 4 instructions p. 7 and Important Changes p. 2",
      section: "§ 5122(2)(M-2), (M-3); Schedule 1S line 4",
      url: MRS("5122"),
      excerpt:
        "STATUTE (verbatim): 'M-2. For tax years beginning on or after January 1, 2016: (1) For each individual who is a primary recipient of retirement plan benefits, the reduction is the sum of: (a) Excluding military retirement plan benefits, an amount that is the lesser of: (i) The aggregate of retirement plan benefits under employee retirement plans or individual retirement accounts included in the individual's federal adjusted gross income; and (ii) The pension deduction amount reduced by the total amount of the individual's social security benefits and railroad retirement benefits paid by the United States, but not less than $0; and (b) An amount equal to the aggregate of retirement benefits under military retirement plans included in the individual's federal adjusted gross income … (d) \"Pension deduction amount\" means: … (iv) For tax years beginning on or after January 1, 2024, the maximum annual benefit that an individual eligible to retire at the retirement age, as defined in 42 United States Code, Section 416(l), as of January 1st of the tax year may receive under the federal Social Security Act'. 'M-3. For tax years beginning on or after January 1, 2025, the amount in paragraph M-2, subparagraph (1), division (a) must be reduced by an amount equal to the total amount … multiplied by a fraction, the numerator of which is the taxpayer's federal adjusted gross income less the applicable amount, except that the numerator may not be less than zero, and the denominator of which is $50,000 in the case of a married individual filing a separate return and $100,000 in all other filing cases. The fraction … may not produce a result that is more than one. … \"applicable amount\" means: (1) For individuals filing as single individuals, $125,000; (2) For individuals filing as heads of households, $187,500; (3) For individuals filing married joint returns or as surviving spouses, $250,000; or (4) For married individuals filing separate returns, 1/2 of the applicable amount under subparagraph (3)'. WORKSHEET (verbatim): 'P1. Total eligible non-military pension income (both Maine and non-Maine sources) included in your federal adjusted gross income …; P2. Maximum allowable deduction 48,216.00; P3. Total social security and railroad retirement benefits you received - whether taxable or not; P4. Subtract line P3 from line P2 (if zero or less, enter zero); P5. Enter the smaller of line P1 or line P4; P6. If applicable, enter the amount from the Worksheet for Phaseout of Non-Military Pension Income Deduction, line 5. Otherwise, skip lines P6 and P7 and enter the amount from line P5 on line P8; P7. Non-military pension income deduction phaseout amount (multiply line P5 by line P6); P8. Non-military pension income deduction amount (subtract line P7 from line P5); P9. Total eligible military retirement pay included in your federal adjusted gross income …; P10. Add lines P8 and P9. Enter the total for both spouses on Schedule 1S, line 4. *Use this column only if you are married filing jointly and only if your spouse separately earned an eligible pension.' PHASEOUT WORKSHEET: '2. Enter $125,000 if single or married filing separately; $187,500 if head of household; or $250,000 if married filing jointly or surviving spouse … 4. Enter $100,000 if single or head of household or married filing jointly or qualifying surviving spouse; $50,000 if married filing separately. 5. Divide line 3 by line 4. If one or more, enter 1.0000.' INSTRUCTIONS (p. 7): 'you and your spouse (if married) may each deduct up to $48,216 of other eligible pension income … The $48,216 cap must be reduced by any social security and railroad retirement benefits received, whether taxable or not.' 'The benefits received under a United States military retirement plan, including survivor benefits, are fully exempt from Maine income tax.' Distributions before age 55 not in a series of substantially equal periodic payments do not qualify. ENCODING per recipient; the $48,216 (2025 Social Security maximum at full retirement age) and the thresholds change yearly — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pensionDeductionAmount: { value: "4821600", type: "money" },
      thresholdSingleMfs: { value: "12500000", type: "money" },
      thresholdHoh: { value: "18750000", type: "money" },
      thresholdJoint: { value: "25000000", type: "money" },
      range: { value: "10000000", type: "money" },
      rangeMfs: { value: "5000000", type: "money" },
    },
    formula: (() => {
      const p4 = max0(sub(money("4821600"), max0(fact("meSocialSecurityReceived"))));
      const p5 = minE(max0(fact("meNonMilitaryPension")), p4);
      const agi = fact("meFederalAgi");
      const r: Expr = iff(isJoint, ratio4(sub(agi, money("25000000")), "10000000"), iff(isHoh, ratio4(sub(agi, money("18750000")), "10000000"), iff(isMfs, ratio4(sub(agi, money("12500000")), "5000000"), ratio4(sub(agi, money("12500000")), "10000000"))));
      const p8 = max0(sub(p5, applyRatio(p5, r)));
      return add(p8, max0(fact("meMilitaryRetirement")));
    })(),
  },
  {
    id: "us.me.dependent_exemption_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine dependent exemption tax credit — $305 per qualifying child or dependent age 6 or older, $610 under age 6, reduced by $20 for each $500 (or fraction) of Maine AGI over $100,000 / $125,000 / $150,000 / $75,000 MFS; refundable for residents (Schedule A line 1, Dependent Exemption Tax Credit Worksheet)",
    citation: {
      source: "36 M.R.S. § 5219-SS(1), (4), (5) (P.L. 2025, c. 113, Pt. C and c. 388, Pt. Q; $300 indexed under § 5403(9) to $305); 2025 Dependent Exemption Tax Credit Worksheet lines 1-11; booklet Important Changes p. 2 and Quick Facts p. 10",
      section: "§ 5219-SS; Schedule A line 1",
      url: FORMS + "25_dependent_exemption_tx_cr_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): '1. Resident taxpayer; tax years beginning before 2026. For tax years beginning on or after January 1, 2018 and before January 1, 2026, a resident individual is allowed a credit against the tax otherwise due under this Part equal to $300 for each qualifying child and dependent of the taxpayer for whom the taxpayer was eligible to claim the federal child tax credit pursuant to the Code, Section 24 for the same taxable year, subject to the phase-out provisions under subsection 4.' '4. … For tax years beginning on or after January 1, 2024, the credit allowed under subsections 1, 1-A, 3 and 3-A, as increased by subsection 5 for tax years beginning on or after January 1, 2025, is refundable. … For tax years beginning on or after January 1, 2025, the amount of the credit allowed by this section, as increased by subsection 5, must be reduced, but not below zero, by $20 for each $500 or fraction thereof by which the taxpayer's Maine adjusted gross income exceeds: A. For a single individual, $100,000; B. For an individual filing as a head of household, $125,000; C. For individuals filing married joint returns or surviving spouses, $150,000; and D. For a married individual filing a separate return, 1/2 of the applicable amount under paragraph C. 5. Increased credit for qualifying children and dependents under 6 years of age. For tax years beginning on or after January 1, 2025, the credit amount allowed … for each qualifying child and dependent who has not attained 6 years of age before the end of the taxable year is multiplied by 2.' WORKSHEET (verbatim): '1. Enter the number of qualifying children and dependent(s) included on Form 1040ME, line 13a, who were at least 6 years of age at any time during the tax year; 2. Multiply line 1 by $305; 3. Enter the number of qualifying children and dependent(s) included on Form 1040ME, line 13a, who were less than 6 years of age at the end of the tax year; 4. Multiply line 3 by $610; 5. Line 2 plus line 4; 6. Enter your 2025 Maine adjusted gross income (Form 1040ME, line 16); 7. Enter $100,000 if single, $125,000 if head of household, $150,000 if married filing jointly or surviving spouse, or $75,000 if married filing separately; 8. Subtract line 7 from line 6 (round the result up to the next $500). If zero or less, skip lines 9 and 10 and enter the amount from line 5 on line 11; 9. Divide line 8 by $500; 10. Multiply line 9 by $20; 11. Subtract line 10 from line 5.' QUICK FACTS: 'up to $305 for each qualifying child or dependent that is at least six years of age, or $610 for each qualifying child or dependent that is under six years of age. The credit is subject to phaseout.' TY2026: P.L. 2025, c. 650, Pt. K, § 25 repealed the § 151-based 2026 definition and kept the federal child tax credit / credit for other dependents basis; the $305 / $610 amounts and the thresholds index under § 5403(9)-(10) (unpublished) — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perDependent: { value: "30500", type: "money" },
      perDependentUnderSix: { value: "61000", type: "money" },
      thresholdSingle: { value: "10000000", type: "money" },
      thresholdHoh: { value: "12500000", type: "money" },
      thresholdJoint: { value: "15000000", type: "money" },
      thresholdMfs: { value: "7500000", type: "money" },
      reductionPerStep: { value: "2000", type: "money" },
      step: { value: "50000", type: "money" },
    },
    formula: (() => {
      const l5 = add(mulInt(money("30500"), fact("meDependentsSixPlus")), mulInt(money("61000"), fact("meDependentsUnderSix")));
      const thr: Expr = iff(isJoint, money("15000000"), iff(isHoh, money("12500000"), iff(isMfs, money("7500000"), money("10000000"))));
      const steps = stepUnits(max0(sub(fact("meAgi"), thr)), "50000", "ceil");
      return max0(sub(l5, mulInt(money("2000"), steps)));
    })(),
  },
  {
    id: "us.me.child_care_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine child care credit — 25% of the federal child and dependent care credit (50% for the share of expenses paid to a Star 5 quality provider); up to $500 refundable for residents, the rest nonrefundable (Child Care Credit Worksheet, Schedule A lines 2 and 11)",
    citation: {
      source: "36 M.R.S. § 5218(1), (3), (4); 2025 Child Care Credit Worksheet lines 1-6; Schedule A instructions lines 2 and 11 p. 9",
      section: "§ 5218; Schedule A lines 2, 11",
      url: FORMS + "25_child_care_tx_cr_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): '1. Resident taxpayer. A resident individual is allowed a credit against the tax otherwise due under this Part in the amount of 25% of the federal tax credit allowable for child and dependent care expenses in the same tax year … 3. Quality child care services. The credit provided by subsections 1, 2 and 2-A doubles in amount if the child care expenses were incurred through the use of quality child care services as defined in section 5219-Q, subsection 1. 4. Refund. The credit allowed by this section may result in a refund of up to $500 except, in the case of a nonresident individual, the credit may not reduce the Maine income tax to less than zero.' WORKSHEET (verbatim): '1. Total expenses paid for child care services included on federal Form 2441, line 2, column (d); a. Column A - expenses paid for regular child care services included on line 1; Column B - expenses paid for Star 5 child care services included on line 1; b. Percentage of expenses paid. Column A - divide line 1a, column A by line 1; Column B - divide line 1a, column B by line 1; 2. Enter amount from federal Form 1040 or 1040-SR, Schedule 3, line 2; a. Column A - multiply line 2 by line 1b, column A; Column B - multiply line 2 by line 1b, column B; 3. Maine Credit. Column A - multiply line 2a, column A by 25% (.25); Column B - multiply line 2a, column B by 50% (.50); 4. Add line 3, column A and line 3, column B; 5. Refundable child care credit. Residents and part-year residents only, enter line 4 or $500, whichever is less; 6. Nonrefundable child care credit. Residents and part-year residents, subtract line 5 from line 4.' ENCODING: the Star 5 share of the federal credit = round(federal credit × Star 5 expenses ÷ total expenses); credit = round(25% × regular share) + round(50% × Star 5 share). The composer splits line 5 (≤ $500 refundable) and line 6.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "25", type: "int" }, pctStar5: { value: "50", type: "int" }, refundableCap: { value: "50000", type: "money" } },
    formula: (() => {
      const fed = max0(fact("meFederalChildCareCredit"));
      const total = max0(fact("meChildCareExpenses"));
      const star5 = minE(max0(fact("meStar5ChildCareExpenses")), total);
      const shareB: Expr = iff(gt(total, money("0")), rd({ kind: "mulDiv", a: fed, b: star5, c: total, round: "half-up" }), money("0"));
      const shareA = max0(sub(fed, shareB));
      return add(rd(pct(shareA, "1", "4")), rd(pct(shareB, "1", "2")));
    })(),
  },
  {
    id: "us.me.adult_dependent_care_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine adult dependent care credit — 25% of (adult day care, hospice, and respite expenses up to $3,000 / $6,000) × the federal § 21 percentage (35% down to 20% by federal AGI); up to $500 refundable (Adult Dependent Care Credit Worksheet, Schedule A lines 3 and 12)",
    citation: {
      source: "36 M.R.S. § 5218-A; 2025 Adult Dependent Care Credit Worksheet lines 1-8 and instructions",
      section: "§ 5218-A; Schedule A lines 3, 12",
      url: FORMS + "25_adult_dep_care_cred_wksht_fillable.pdf",
      excerpt:
        "WORKSHEET (verbatim): '2. Add the amounts in line 1, Column C. Do not enter more than $3,000 for one qualifying individual or $6,000 for two or more qualifying individuals; 3. Enter your federal adjusted gross income (from Form 1040ME, line 14); 4. Enter on line 4 the decimal amount shown below that applies to the amount on line 3: If line 3 is: Over — but not over — Enter: $0 15,000 .35; 15,000 17,000 .34; 17,000 19,000 .33; 19,000 21,000 .32; 21,000 23,000 .31; 23,000 25,000 .30; 25,000 27,000 .29; 27,000 29,000 .28; 29,000 31,000 .27; 31,000 33,000 .26; 33,000 35,000 .25; 35,000 37,000 .24; 37,000 39,000 .23; 39,000 41,000 .22; 41,000 43,000 .21; 43,000 No limit .20; 5. Multiply line 2 by line 4; 6. Total Maine credit. Multiply line 5 by 25% (.25); 7. Refundable adult dependent care credit. Enter line 6 or $500, whichever is less; 8. Nonrefundable adult dependent care credit. Subtract line 7 from line 6.' INSTRUCTIONS: 'Eligible taxpayers may claim a tax credit equal to 25% of the applicable percentage of adult dependent care expenses paid for adult day care, hospice services and respite care during the taxable year to the extent the expenses are not used to calculate the federal child and dependent care credit. … The credit is refundable up to $500.' A qualifying individual is a disabled spouse or dependent at least 21 who lived with you over half the year. ENCODING: percentage = max(20, 35 − ceil(max0(AGI − $15,000) ÷ $2,000)); lines 5 and 6 rounded to whole dollars.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { capOne: { value: "300000", type: "money" }, capTwoPlus: { value: "600000", type: "money" }, pct: { value: "25", type: "int" }, refundableCap: { value: "50000", type: "money" } },
    formula: (() => {
      const cap: Expr = iff(ge(fact("meAdultCareQualifyingIndividuals"), int("2")), money("600000"), money("300000"));
      const l2 = minE(max0(fact("meAdultCareExpenses")), cap);
      const steps = stepUnits(max0(sub(fact("meFederalAgi"), money("1500000"))), "200000", "ceil");
      const pctPoints = maxE(money("20"), sub(money("35"), mulInt(money("1"), steps))); // percentage points, cents-denominated
      const l5 = rd({ kind: "mulDiv", a: l2, b: pctPoints, c: money("100"), round: "half-up" });
      return rd(pct(l5, "1", "4"));
    })(),
  },
  {
    id: "us.me.eitc",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine earned income tax credit — 25% of the federal EIC with a qualifying child, 50% without; refundable for residents (Earned Income Tax Credit Worksheet, Schedule A line 4)",
    citation: {
      source: "36 M.R.S. § 5219-S(1-A); 2025 Earned Income Tax Credit Worksheet lines 1-3 and Special instructions; Schedule A line 4 instructions p. 9",
      section: "§ 5219-S(1-A); Schedule A line 4",
      url: FORMS + "25_earned_income_cred_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): '1-A. Resident taxpayer; tax years beginning 2022 or after. For tax years beginning on or after January 1, 2022, a resident individual who is an eligible individual is allowed a credit against the tax otherwise due under this Part in the amount of 50% of the federal earned income credit for the same taxable year for a resident eligible individual who does not have a qualifying child and 25% of the federal earned income credit for the same taxable year for all other resident eligible individuals.' WORKSHEET (verbatim): '1. Enter the amount from federal Form 1040, line 27a, or Form 1040-SR, line 27a. If you did not claim the federal earned income credit (EIC), see the Special Instructions for line 1 below; 2. If, in 2025, you had at least one qualifying child for purposes of claiming the federal earned income tax credit, multiply line 1 by 25% (line 1 x .25). Otherwise, skip to line 3; 3. If, in 2025, you did not have at least one qualifying child, multiply line 1 by 50% (line 1 x .50). Maine residents: Enter the amount from line 2 or line 3, whichever applies, on Form 1040ME, Schedule A, line 4.' 'The Maine EIC is equal to 25% (50% for taxpayers with no qualifying children) of the federal EIC. The Maine EIC is refundable for Maine residents and part-year residents.' 'Special instructions for line 1. Certain taxpayers who are not able to claim the federal EIC may be able to claim the Maine EIC if you would otherwise be able to claim the federal EIC except that you (or your spouse, if married): 1) filed a federal return using an IRS-issued Individual Taxpayer Identification Number (ITIN), and/or 2) had no qualifying child(ren) during the tax year, and were at least age 18 as of the last day of the tax year' (a pro forma federal worksheet supplies line 1).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pctWithChild: { value: "25", type: "int" }, pctNoChild: { value: "50", type: "int" } },
    formula: iff(fact("meHasQualifyingChild"), rd(pct(max0(fact("meFederalEic")), "1", "4")), rd(pct(max0(fact("meFederalEic")), "1", "2"))),
  },
  {
    id: "us.me.other_jurisdiction_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine credit for income tax paid to another jurisdiction — the smaller of the Maine tax × (income sourced to and taxed by the other jurisdiction ÷ Maine AGI, four decimals, ≤ 1.0000) and the tax paid there (Other Jurisdiction worksheet, Schedule A line 14)",
    citation: {
      source: "36 M.R.S. § 5217-A; 2025 'Credit for Income Tax Paid to Other Jurisdiction Worksheet' lines 1-5 and instructions",
      section: "§ 5217-A; Schedule A line 14",
      url: FORMS + "25_cred_tax_pd_othr_juris_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): 'A resident individual is allowed a credit against the tax otherwise due under this Part, excluding the tax imposed by section 5203-C, for the amount of income tax imposed on that individual for the taxable year by another state of the United States, a political subdivision of any such state, the District of Columbia or any political subdivision of a foreign country that is analogous to a state of the United States with respect to income subject to tax under this Part that is derived from sources in that taxing jurisdiction. … The credit, for any of the specified taxing jurisdictions, may not exceed the proportion of the tax otherwise due under this Part … that the amount of the taxpayer's Maine adjusted gross income derived from sources in that taxing jurisdiction bears to the taxpayer's entire Maine adjusted gross income'. WORKSHEET (verbatim): '1. Maine adjusted gross income from Form 1040ME, line 16 …; 2. … a. Income sourced to and taxed by other jurisdiction included on Form 1040ME, line 14 …; b. Additions …; c. Subtractions …; d. Income sourced to and taxed by other jurisdiction included on Form 1040ME, line 16 (line 2a plus line 2b minus line 2c (if negative, enter zero)); 3. Percentage of income taxed by other jurisdiction (divide line 2d by line 1 - if line 2d is greater than line 1, enter 1.0000); 4. Limitation of Credit: a. Maine tax on income also taxed by other jurisdiction (multiply Form 1040ME, line 20 … by line 3 above); b. Income taxes paid to other jurisdiction on income shown on line 2d. Do not enter the amount withheld on line 4b; 5. Allowable Credit, line 4a or 4b, whichever is less. Enter here and on Maine Form 1040ME, Schedule A, line 14.' 'The credit for each jurisdiction must be computed separately. Complete a separate worksheet for each jurisdiction.' A copy of the other jurisdiction's return must be enclosed. The other jurisdiction may be another state, a political subdivision of a state, the District of Columbia, a Canadian Province, or an analogous foreign subdivision (worksheet instructions item 1). ENCODING: ratio = round(line 2d ÷ line 1, 4 decimals) capped at 1.0000; line 4a = round(line 20 × ratio); credit = min(4a, 4b); $0 when line 1 is not positive.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "4", type: "int" } },
    formula: (() => {
      const l1 = fact("meAgi");
      const ratio: Expr = minE({ kind: "mulDiv", a: max0(fact("meOtherJurisdictionIncome")), b: money("10000"), c: l1, round: "half-up" }, money("10000"));
      const l4a = applyRatio(max0(fact("meTaxBeforeCredits")), ratio);
      return iff(gt(l1, money("0")), minE(l4a, max0(fact("meOtherJurisdictionTax"))), money("0"));
    })(),
  },
  {
    id: "us.me.property_tax_fairness_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine Property Tax Fairness Credit — the benefit base (property tax + 15% of rent, capped at $2,550 / $3,300 / $4,050 by status and dependents, $4,100 at 65+) over 4% of total income, up to $1,000 ($2,000 at 65+), doubled for a 100% disabled veteran, limited to the property tax and rent paid; refundable; not MFS (Schedule PTFC/STFC lines 4-16, Form 1040ME line 25d)",
    citation: {
      source: "36 M.R.S. § 5219-KK(1)(A-1), (1)(E), (2-D), (2-E), (3) (benefit bases indexed under § 5403(6)); 2025 Schedule PTFC/STFC lines 4-16 and instructions pp. 17-18; booklet p. 10",
      section: "§ 5219-KK; Schedule PTFC/STFC; Form 1040ME line 25d",
      url: FORMS + "25_1040me_sch_ptfc_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): '2-D. Credit in 2022 and after. For tax years beginning on or after January 1, 2022, a resident individual is allowed a credit against the taxes imposed under this Part equal to the amount by which the benefit base for the resident individual exceeds 4% of the resident individual's income. The credit may not exceed $1,000 for resident individuals under 65 years of age … For tax years beginning on or after January 1, 2024, for resident individuals 65 years of age and older, the credit may not exceed $2,000. In the case of married individuals filing a joint return, only one spouse is required to be 65 years of age or older … Married taxpayers filing separate returns do not qualify for the credit under this section. 2-E. Permanently and totally disabled veterans; additional credit. … a resident individual who is a veteran who is 100% permanently and totally disabled is allowed an additional credit … in an amount equal to the amount calculated under subsection 2-D. The combined credit … may not exceed the property taxes paid … and rent constituting property taxes paid … combined.' '(A-1) \"benefit base\" means property taxes paid … or rent constituting property taxes paid … not exceeding the following amounts: (1) For persons filing as single individuals, $2,050; (2) For persons filing as heads of households that can claim the federal child tax credit … for no more than one qualifying child or dependent or for persons filing joint returns, $2,650; (3) For persons filing as heads of households that can claim the federal child tax credit … for more than one qualifying child or dependent or for persons filing joint returns that can claim the federal child tax credit … for at least one qualifying child or dependent, $3,250; and (4) For tax years beginning on or after January 1, 2024, notwithstanding subparagraphs (1), (2) and (3), for individuals 65 years of age or older, $4,000.' 'E. \"Rent constituting property taxes\" means 15% of the gross rent actually paid … exclusive of charges for any utilities, services, furniture, furnishings or personal property appliances furnished by the landlord'. SCHEDULE (verbatim): '4. Enter the property tax you paid on your home in 2025; 5. (a) Enter the rent you paid on your home in 2025; (b) Does the rent entered on line 5a include heat, utilities, furniture, or similar items?; (c) If line 5b is yes and you know the amount paid for heat, utilities, furniture, or similar items, enter that amount on line 5c. If yes, and you do not know the amount paid, multiply line 5a by 15% (.15) and enter the result on line 5c. If line 5b is no, enter \"0\" on line 5c; (d) Line 5a minus line 5c; (e) Multiply line 5d by 15% (.15); 6. Add lines 4 and 5e; 7. Were you or your spouse (if married filing jointly) at least 65 years of age during the tax year?; 8. If line 7 is yes, enter $4,100. If line 7 is no, enter the amount shown in the table below for your filing status and the number of qualifying children and dependents on Form 1040ME, line 13a: Single $2,550 $2,550 $2,550; Head of Household $3,300 $3,300 $4,050; Married filing Jointly or Qualifying surviving spouse $3,300 $4,050 $4,050 [columns 0 / 1 / more than 1]; 9. Benefit base. Enter the smaller of line 6 or line 8; 10. Multiply line 3 by 4% (.04); (a) Is the amount on line 9 more than the amount on line 10? If yes, go to line 11 below. If no, you do not qualify …; 11. Subtract line 10 from line 9; 12. If line 7 is yes, enter $2,000. If line 7 is no, enter $1,000; 13. Enter the smaller of line 11 or line 12; 14. Are you or your spouse (if married filing jointly) rated 100% permanently and totally disabled by the United States Department of Veterans Affairs?; (a) If line 14 is yes, enter the amount from line 13 …; 15. Add lines 13 and 14a; 16. Enter the smaller of line 15 or line 6, here and on Form 1040ME, line 25d.' Total income (line 3) = federal total income (Form 1040 line 9) + Social Security and railroad benefits not in it + tax-exempt interest + loss add-backs. 'You cannot claim either the Property Tax Fairness Credit or Sales Tax Fairness Credit if your filing status is married filing separately.' The booklet's income ceilings ($63,750 / $82,500 / $101,250; $102,500 at 65+) are the benefit-base caps ÷ 4% (the sidebar's '$100,000' is the 2024 figure). Indexed — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      benefitBaseSingle: { value: "255000", type: "money" },
      benefitBaseMid: { value: "330000", type: "money" },
      benefitBaseHigh: { value: "405000", type: "money" },
      benefitBase65: { value: "410000", type: "money" },
      pctOfIncome: { value: "4", type: "int" },
      cap: { value: "100000", type: "money" },
      cap65: { value: "200000", type: "money" },
      rentPct: { value: "15", type: "int" },
    },
    formula: (() => {
      const rent = max0(fact("meRentPaid"));
      const l5c: Expr = iff(fact("meRentIncludesUtilities"), iff(gt(fact("meUtilitiesAmount"), money("0")), minE(max0(fact("meUtilitiesAmount")), rent), rd(pct(rent, "15", "100"))), money("0"));
      const l5e = rd(pct(max0(sub(rent, l5c)), "15", "100"));
      const l6 = add(max0(fact("mePropertyTaxPaid")), l5e);
      const deps = fact("meDependents13a");
      const l8: Expr = iff(
        fact("meAge65"),
        money("410000"),
        iff(isJoint, iff(ge(deps, int("1")), money("405000"), money("330000")), iff(isHoh, iff(ge(deps, int("2")), money("405000"), money("330000")), money("255000"))),
      );
      const l9 = minE(l6, l8);
      const l10 = rd(pct(max0(fact("meTotalIncome")), "4", "100"));
      const l11 = max0(sub(l9, l10));
      const l13 = minE(l11, iff(fact("meAge65"), money("200000"), money("100000")));
      const l15: Expr = iff(fact("meDisabledVeteran"), add(l13, l13), l13);
      return iff(isMfs, money("0"), minE(l15, l6));
    })(),
  },
  {
    id: "us.me.sales_tax_fairness_credit",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine Sales Tax Fairness Credit — $155 (single), $215 / $250 / $280 (MFJ or QSS by 0 / 1 / 2+ dependents; HOH by 0-1 / 2 / 3+), reduced $10 per $500 over $25,450 (single), $15 per $750 over $38,200 (HOH), $20 per $1,000 over $50,950 (joint); refundable; not MFS or dependents (Schedule PTFC/STFC line 17)",
    citation: {
      source: "36 M.R.S. § 5213-A(1)(A-1), (2), (4), (5), (6) (bases and thresholds indexed under § 5403(5)); 2025 Schedule PTFC/STFC line 17 tables and example p. 18; booklet p. 10",
      section: "§ 5213-A; Schedule PTFC/STFC line 17; Form 1040ME line 25e",
      url: FORMS + "25_1040me_sch_ptfc_fillable.pdf",
      excerpt:
        "STATUTE (verbatim): 'A-1. For tax years beginning on or after January 1, 2018, \"base credit\" means: (1) For single individuals, $125; (2) For individuals filing joint returns or as heads of households, $175 plus an additional amount equal to: (a) For individuals filing joint returns, $25 if they can claim the federal child tax credit pursuant to the Code, Section 24 for no more than one qualifying child or dependent or $50 if they can claim the credit for more than one qualifying child or dependent; or (b) For individuals filing as heads of households, $25 if they can claim the federal child tax credit … for 2 qualifying children or dependents or $50 if they can claim the credit for more than 2 qualifying children or dependents.' '4. Phase-out of credit. … A. For single individuals, the credit is reduced by $10 for every $500 or portion thereof that exceeds $20,000 of the income. B. For unmarried individuals or legally separated individuals who qualify as heads of households, the credit is reduced by $15 for every $750 or portion thereof that exceeds $30,000 of the income. C. For individuals filing married joint returns or surviving spouses permitted to file joint returns, the credit is reduced by $20 for every $1,000 or portion thereof that exceeds $40,000 of the income. 5. Refundability of credit. The tax credit allowed under this section is refundable. 6. Limitations. The following individuals do not qualify for the credit under this section: A. Married taxpayers filing separate returns; … C. Individuals who may be claimed as a dependent on another taxpayer's return.' TABLES (verbatim, 'At least / But not more than / Enter'): Single (line 13 is 1): '0 25,450 155; 25,451 25,950 145; … 32,451 32,950 5; 32,951 33,450 0'; Married filing jointly or Qualifying surviving spouse (columns 0 / 1 / 2+): '0 50,950 215 250 280; 50,951 51,950 195 230 260; … 63,951 64,950 0 0 0'; Head of Household (columns 0-1 / 2 / 3+): '0 38,200 215 250 280; 38,201 38,950 200 235 265; … 51,701 52,450 0 0 0'. EXAMPLE (verbatim): 'If your filing status is married filing jointly, your total income from Schedule PTFC/STFC, line 3 is $59,900, and you claim 3 qualifying children and dependents, enter $100 on Schedule PTFC/STFC, line 17.' STRUCTURE (verified on all 50 printed rows): credit = base − step × ceil(max0(income − threshold) ÷ increment), not below zero, with the 2025 indexed bases $155 / $215 / $250 / $280 and thresholds $25,450 / $38,200 / $50,950. Income = Schedule PTFC/STFC line 3 (total income). Indexed — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      baseSingle: { value: "15500", type: "money" },
      baseFamily: { value: "21500", type: "money" },
      baseFamilyPlus25: { value: "25000", type: "money" },
      baseFamilyPlus50: { value: "28000", type: "money" },
      thresholdSingle: { value: "2545000", type: "money" },
      thresholdHoh: { value: "3820000", type: "money" },
      thresholdJoint: { value: "5095000", type: "money" },
    },
    formula: (() => {
      const deps = fact("meDependents13a");
      const income = fact("meTotalIncome");
      const single = max0(sub(money("15500"), mulInt(money("1000"), stepUnits(max0(sub(income, money("2545000"))), "50000", "ceil"))));
      const jointBase: Expr = iff(ge(deps, int("2")), money("28000"), iff(ge(deps, int("1")), money("25000"), money("21500")));
      const joint = max0(sub(jointBase, mulInt(money("2000"), stepUnits(max0(sub(income, money("5095000"))), "100000", "ceil"))));
      const hohBase: Expr = iff(ge(deps, int("3")), money("28000"), iff(ge(deps, int("2")), money("25000"), money("21500")));
      const hoh = max0(sub(hohBase, mulInt(money("1500"), stepUnits(max0(sub(income, money("3820000"))), "75000", "ceil"))));
      return iff(or(isMfs, fact("isClaimedAsDependent")), money("0"), iff(isJoint, joint, iff(isHoh, hoh, single)));
    })(),
  },
  {
    id: "us.me.use_tax",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine use tax — 5.5% of untaxed purchases, or the optional estimate of 0.04% of Maine AGI (Form 1040ME line 30)",
    citation: {
      source: "2025 booklet, line 30 instructions p. 5; printed Form 1040ME line 30",
      section: "Form 1040ME line 30",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'Line 30. If you purchased items for use in Maine from retailers who did not collect the Maine sales tax (such as businesses in other states or countries and unregistered mail order and internet sellers), you may owe Maine use tax on those items. The tax rate for purchases in 2025 is 5.5%. If you paid another state's sales or use tax on any purchase, that amount may be credited against the Maine use tax due on that purchase. If you do not know the exact amount of Maine use tax that you owe, multiply your Maine adjusted gross income from line 16 by .04% (.0004). Note: For items that cost $1,000 or more, you must add the tax on those items to the percentage amount. Use tax on items that cost more than $5,000 must be reported on an individual use tax return by the 15th day of the month following its purchase.' ENCODING: round(5.5% × purchases) plus, when meUseTaxEstimate is set, round(0.04% × Maine AGI) for the unknown-purchases estimate.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { rateBps: { value: "550", type: "int" }, estimateBps: { value: "4", type: "int" } },
    formula: add(rd(pct(max0(fact("meUseTaxPurchases")), "55", "1000")), iff(fact("meUseTaxEstimate"), rd(pct(max0(fact("meAgi")), "4", "10000")), money("0"))),
  },
  {
    id: "us.me.parameters",
    version: 1,
    jurisdiction: "us.me",
    title: "Maine 2025 Form 1040ME parameters — line structure, Schedule 1A/1S lines and caps, Schedule A credits, and the enacted TY2026 position",
    citation: {
      source: "2025 Maine Resident Individual Income Tax Booklet (Form 1040ME instructions, Schedules 1A, 1S, 2, A, PTFC/STFC and worksheets); 36 M.R.S. §§ 5111, 5122, 5124-C, 5125, 5126-A, 5213-A, 5217-A, 5218, 5218-A, 5219-KK, 5219-S, 5219-SS, 5403; P.L. 2025, c. 271, c. 336, c. 388; web-verified September 2026",
      section: "Form 1040ME lines 1-35",
      url: FORMS + "25_1040ME_fillable.pdf",
      excerpt:
        "STRUCTURE (printed 2025 Form 1040ME): filing status 3 Single, 4 Married filing jointly, 5 Married filing separately, 6 Head of household, 7 Qualifying surviving spouse with dependent child ('Use the filing status from your federal income tax return'); residency 8 Resident / 8a Safe Harbor / 9 Part-year / 10 Nonresident / 11-11a nonresident alien; 12a-12d 65-or-over / blind boxes (you, spouse); 13 exemptions (→ us.me.personal_exemption); 13a 'TOTAL number of qualifying children and dependents' (federal child tax credit or credit for other dependents); 14 federal AGI (Form 1040 line 11); 15a additions (Schedule 1A line 11: 1 non-Maine municipal and state bond income, 2 NOL recovery adjustment, 3 MainePERS contributions, 4 bonus depreciation add-back, 5 fiduciary adjustment, 6 installment-sale gain election (nonresidents), 7 pass-through financial institution losses, 8 wellness credit expenses, 9 Schedule ETM, 10 OBBBA R&E expensing add-back); 15b subtractions (Schedule 1S line 27: 1 U.S. Government bond interest, 2 state income tax refund, 3 Social Security and Railroad Retirement benefits (100%, § 5122(2)(C)), 4 pension income deduction (→ us.me.pension_deduction), 5 non-Maine active duty military pay, 6 military survivor annuities, 7 MainePERS pick-up contributions, 8 529 contributions 'Limited to $1,000 per beneficiary' when federal AGI is not more than $100,000 single/MFS or $200,000 MFJ/QSS/HOH (§ 5122(2)(YY)), 9 fiduciary adjustment, 10 bonus depreciation and § 179 recapture, 11-12 cannabis business expenses, 13 NOL recapture, 14 FAME student loan repayment, 15 qualified health care student loan payments, 16 municipal senior volunteer benefits ≤ $1,465, 17 Family Development Account, 18 Maine municipal bond interest, 19 WOTC/empowerment zone wage reduction, 20 capital construction fund, 21 pass-through financial institution income, 22 affordable housing depreciation recapture, 23 eligible timberlands gain percentage, 24 business interest recapture, 25 Schedule ETM, 26 other); 16 Maine AGI; 17 deduction — Maine Standard Deduction Chart or Schedule 2 itemized (→ us.me.standard_deduction, us.me.itemized_deductions), phased out (→ us.me.deduction_phaseout); 18 exemption $5,150 × line 13, phased out; 19 taxable income = 16 − 17 − 18; 20 tax (→ us.me.income_tax); 20a credit recapture; 21 nonresident credit (Schedule NR/NRH); 22 = 20 + 20a − 21; 23 nonrefundable credits = smaller of Schedule A line 21 and line 22 (Schedule A Section 2: 10 dependent exemption (nonresidents), 11 child care nonrefundable portion, 12 adult dependent care nonrefundable portion, 13 EITC (nonresidents), 14 other jurisdictions (→ us.me.other_jurisdiction_credit), 15 seed capital, 16 research expense, 17 carryforwards, 18 Pine Tree Development Zone, 19 Dirigo, 20 other); 24 net tax; 25a withholding; 25b estimated payments, prior-year credit, extension payments, and real estate withholding; 25c refundable credits (Schedule A line 9: 1 dependent exemption credit (→ us.me.dependent_exemption_credit), 2 child care ≤ $500 (→ us.me.child_care_credit), 3 adult dependent care ≤ $500 (→ us.me.adult_dependent_care_credit), 4 EITC (→ us.me.eitc), 5 student loan repayment ≤ $2,500 (§ 5217-E), 6 historic rehabilitation, 7 Dirigo, 8 other); 25d Property Tax Fairness Credit (→ us.me.property_tax_fairness_credit); 25e Sales Tax Fairness Credit (→ us.me.sales_tax_fairness_credit); 25f total; 26 amended: prior overpayment; 27 = 25f − 26; 28 overpaid = 27 − 24; 29 underpaid = 24 − 27 (line 24 treated as zero if negative); 30 use tax (→ us.me.use_tax); 30a sales tax on casual rentals (9%, ≤ $2,000 collected); 31 Schedule CP contributions and park passes; 32 underpayment penalty (Form 2210ME; applies when line 24 less lines 25a, 25c, 25d, 25e, and REW is $1,000 or more); 33 net overpayment = 28 − 30 − 30a − 31 − 32; 34a credited to 2026; 34b refund ('Refunds of $1.00 or more will be issued'); 35 total due ('If you owe less than $1.00, do not pay it'). ROUNDING: whole dollars, half-up. CONFORMITY: IRC as of December 31, 2024 (P.L. 2025, c. 336 lets the Governor direct temporary OBBBA conformity for disaster losses, § 179, § 163(j), R&E; the 2025 forms follow that directive). RESIDENCY: safe harbor, part-year, and nonresidents use Schedule NR/NRH — not composed. TY2026 (enacted, P.L. 2025, c. 650 and MRS's May 20, 2026 rate sheet): indexed brackets and a new 2% surcharge over $1,000,000 ($750,000 MFS; $1,500,000 HOH and joint) — § 5111(7); § 5124-C(1-C) standard deduction $15,700 basic (× 1.5 HOH, × 2 joint) plus the federal age/blind amounts ($1,650 / $2,050); $5,300 exemption; $37,100 itemized cap — version 2 of those rules; the dependent exemption credit keeps its federal child tax credit basis (c. 650, Pt. K, § 25 repealed the § 151 definition) with indexed amounts, the pension deduction amount is $49,824 with re-indexed phase-out thresholds, the PTFC under-65 cap becomes $1,500 (c. 650, Pt. CCCC), and the PTFC/STFC bases re-index — unpublished, so those rules end 2026-01-01; § 5122(2)(M-2)(2)(c) adds the uniformed services to 'military retirement plan' from 2026; the child care, adult care, EITC, other-jurisdiction, and use tax rules are unindexed (2027-01-01).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      collegeSavingsPerBeneficiary: { value: "100000", type: "money" },
      collegeSavingsAgiLimitSingleMfs: { value: "10000000", type: "money" },
      collegeSavingsAgiLimitOther: { value: "20000000", type: "money" },
      studentLoanCreditCap: { value: "250000", type: "money" },
      casualRentalSalesTaxPct: { value: "9", type: "int" },
      underpaymentPenaltyThreshold: { value: "100000", type: "money" },
      minimumPaymentOrRefund: { value: "100", type: "money" },
      seniorVolunteerBenefitCap: { value: "146500", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Maine Form 1040ME composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.me.income_tax, us.me.standard_deduction, us.me.itemized_deductions, us.me.deduction_phaseout, us.me.personal_exemption, us.me.pension_deduction, us.me.dependent_exemption_credit, us.me.child_care_credit, us.me.adult_dependent_care_credit, us.me.eitc, us.me.other_jurisdiction_credit, us.me.property_tax_fairness_credit, us.me.sales_tax_fairness_credit, and us.me.use_tax",
    },
  },

  // ---- TY2026 versions: MRS "2026 Individual Income Tax Rates" (Revised May 20, 2026), 2026 Form 1040ES-ME, 2026 phase-out worksheets; P.L. 2025, c. 650 ----
  {
    id: "us.me.income_tax",
    version: 2,
    jurisdiction: "us.me",
    title: "Maine income tax TY2026 — indexed rate schedules (5.8 / 6.75 / 7.15% at $27,400 / $64,850 single and MFS; $41,100 / $97,300 HOH; $54,850 / $129,750 MFJ and QSS) plus the new 2% surcharge on taxable income over $1,000,000 ($750,000 MFS; $1,500,000 HOH, MFJ, QSS) (Form 1040ME line 20)",
    citation: {
      source: "36 M.R.S. § 5111(1-F), (2-F), (3-F) indexed under § 5403(1) (factors 1.303 and 1.298); § 5111(7) surcharge added by P.L. 2025, c. 650, Pt. DDDD (L.D. 2212, approved April 10, 2026); MRS 'State of Maine 2026 Individual Income Tax Rates' (Revised May 20, 2026); 2026 Form 1040ES-ME rate schedules and Note (1)",
      section: "§ 5111(1-F)-(3-F), (7); § 5403(1), (12)",
      url: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf",
      excerpt:
        "MRS 2026 RATES (verbatim): 'For tax years beginning in 2026, an inflation adjustment is made by multiplying the cost-of-living adjustment, 1.303, by the lowest dollar amounts of the tax rate tables … and by multiplying the cost-of-living adjustment, 1.298, by the highest dollar amounts … Single Individuals and Married Persons Filing Separate Returns: Less than $27,400 — 5.8% of Maine taxable income; $27,400 but less than $64,850 — $1,589 plus 6.75% of excess over $27,400; $64,850 or more (1) — $4,117 plus 7.15% of excess over $64,850. Unmarried or Legally Separated Individuals Who Qualify as Heads of Household: Less than $41,100 — 5.8%; $41,100 but less than $97,300 — $2,384 plus 6.75% of excess over $41,100; $97,300 or more (1) — $6,178 plus 7.15% of excess over $97,300. Married Individuals and Surviving Spouses Filing Joint Returns: Less than $54,850 — 5.8%; $54,850 but less than $129,750 — $3,181 plus 6.75% of excess over $54,850; $129,750 or more (1) — $8,237 plus 7.15% of excess over $129,750. Note (1): Income Tax Surcharge: For tax years beginning on or after January 1, 2026, the tax calculated above is increased by a surcharge of 2% on the portion of the taxpayer's Maine taxable income greater than $1,000,000 if filing single, $750,000 if married filing separate; or $1,500,000 if married filing jointly or head of household. For tax years beginning on or after January 1, 2027, the dollar amounts are adjusted for inflation.' STATUTE (§ 5111(7) as enacted by c. 650 § DDDD-1, verbatim): 'For tax years beginning on or after January 1, 2026, the tax calculated under subsections 1-F, 2-F and 3-F is increased by an income tax surcharge at the rate of 2% on that portion of the taxpayer's Maine taxable income in excess of: A. For married persons filing separate returns, 1/2 of the applicable amount under paragraph D; B. For single individuals, $1,000,000; C. For heads of households, $1,500,000; and D. For individuals filing married joint returns or surviving spouses, $1,500,000.' The 2026 tax table is unpublished — this version applies the printed rate schedule at the income for every filer (meUseRateSchedule is moot) and adds the surcharge; re-verify against the 2026 booklet when it appears (~January 2027).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      singleBracket1: { value: "2740000", type: "money" },
      singleBracket2: { value: "6485000", type: "money" },
      hohBracket1: { value: "4110000", type: "money" },
      hohBracket2: { value: "9730000", type: "money" },
      jointBracket1: { value: "5485000", type: "money" },
      jointBracket2: { value: "12975000", type: "money" },
      surchargeBps: { value: "200", type: "int" },
      surchargeThresholdSingle: { value: "100000000", type: "money" },
      surchargeThresholdMfs: { value: "75000000", type: "money" },
      surchargeThresholdHohJoint: { value: "150000000", type: "money" },
    },
    formula: (() => {
      const x: Expr = max0(fact("stateTaxableIncome"));
      const S26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
        { thresholdCents: "2740000", fixedCents: "158900", rateNum: "675" },
        { thresholdCents: "6485000", fixedCents: "411700", rateNum: "715" },
      ];
      const H26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
        { thresholdCents: "4110000", fixedCents: "238400", rateNum: "675" },
        { thresholdCents: "9730000", fixedCents: "617800", rateNum: "715" },
      ];
      const J26 = [
        { thresholdCents: "0", fixedCents: "0", rateNum: "580" },
        { thresholdCents: "5485000", fixedCents: "318100", rateNum: "675" },
        { thresholdCents: "12975000", fixedCents: "823700", rateNum: "715" },
      ];
      const base: Expr = iff(isJoint, printedSchedule(x, J26), iff(isHoh, printedSchedule(x, H26), printedSchedule(x, S26)));
      const thr: Expr = iff(or(isJoint, isHoh), money("150000000"), iff(isMfs, money("75000000"), money("100000000")));
      const surcharge = rd(pct(max0(sub(x, thr)), "2", "100"));
      return add(base, surcharge);
    })(),
  },
  {
    id: "us.me.standard_deduction",
    version: 2,
    jurisdiction: "us.me",
    title: "Maine standard deduction TY2026 — $15,700 single and MFS, $31,400 MFJ and QSS, $23,550 HOH (§ 5124-C(1-C), P.L. 2025, c. 650) plus $1,650 (married, QSS) or $2,050 (single, HOH) per 65-or-older/blind box (Form 1040ME line 17, before the phase-out)",
    citation: {
      source: "36 M.R.S. § 5124-C(1-C) as enacted by P.L. 2025, c. 650, Pt. K, § 14 ('$15,700' basic amount for tax years beginning in 2026; HOH × 1.5; joint × 2; plus the Code § 63(c)(3) additional amounts); MRS 'State of Maine 2026 Individual Income Tax Rates' (Revised May 20, 2026); 2026 Form 1040ES-ME 'Standard Deduction for 2026'",
      section: "§ 5124-C(1-C); Form 1040ME line 17",
      url: "https://www.maine.gov/revenue/sites/maine.gov.revenue/files/2026-05/ind_tax_rate_sched_2026_rev.pdf",
      excerpt:
        "MRS 2026 RATES (verbatim): 'Standard Deduction: Single - $15,700; Married Filing Jointly - $31,400; Head of Household - $23,550; Married Filing Separately - $15,700. Additional Amount for Age or Blindness: $1,650 if married (whether filing jointly or separately) or a qualified surviving spouse. The additional amount is $3,300 if one spouse is 65 or over and blind, $3,300* if both spouses are 65 or over, $6,600* if both spouses are 65 or over and blind, etc. *If married filing separately, these amounts apply only if you can claim an exemption for your spouse. $2,050 if unmarried (single or head of household). The additional amount is $4,100 if the individual is both 65 or over and blind.' 2026 FORM 1040ES-ME (verbatim): 'Standard Deduction for 2026: Single $15,700; Head of Household $23,550; Married Filing Separately $15,700; Married Filing Jointly or Qualifying Surviving Spouse $31,400. Additional Standard Deduction for Age and/or Blindness: Married (whether filing jointly or separately) or a qualified widow(er): the additional standard deduction is $1,650 if one spouse is age 65 or over OR blind; $3,300 if one spouse is 65 or over AND blind; $3,300 if both spouses are 65 or over OR blind; $6,600 if both spouses are 65 or over AND blind, etc.' STATUTE (§ 5124-C(1-C) as enacted by c. 650, Pt. K, § 14, verbatim): 'For tax years beginning on or after January 1, 2026 and before January 1, 2027 … basic standard deduction is: (1) For single individuals and married persons filing separate returns, $15,700; (2) … heads of households, the amount allowed under subparagraph (1) multiplied by 1.5; and (3) … married joint returns or surviving spouses, the amount … multiplied by 2' plus the § 63(c)(3) additional amounts; (1-D) makes 2027 and later 'equal to the federal standard deduction'. A filer claimable as a dependent gets the same chart amount (no § 63(c)(5) limitation is incorporated).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { single: { value: "1570000", type: "money" }, joint: { value: "3140000", type: "money" }, hoh: { value: "2355000", type: "money" }, perBoxSingleHoh: { value: "205000", type: "money" }, perBoxMarried: { value: "165000", type: "money" } },
    formula: (() => {
      const base: Expr = iff(isJoint, money("3140000"), iff(isHoh, money("2355000"), money("1570000")));
      const perBox: Expr = iff(or(isStatus("single"), isHoh), money("205000"), money("165000"));
      return add(base, mulInt(perBox, fact("meAgeBlindBoxes")));
    })(),
  },
  {
    id: "us.me.deduction_phaseout",
    version: 2,
    jurisdiction: "us.me",
    title: "Maine standard / itemized deduction phase-out TY2026 — thresholds $102,250 / $153,400 / $204,550 across $75,000 / $112,500 / $150,000 (2026 worksheet)",
    citation: {
      source: "36 M.R.S. §§ 5124-C(2), 5125(7) indexed under § 5403(4); 2026 Form 1040ES-ME (Rev. July 2026: 'If your Maine adjusted gross income is over $102,250 …') and MRS's 2026 'Worksheet for Phaseout of Itemized / Standard Deductions' as posted with it ($102,250 / $153,400 / $204,550; an earlier December 2025 sheet printing $97,150 / $145,750 / $194,300 and a $35,250 cap was superseded)",
      section: "§§ 5124-C(2), 5125(7)",
      url: FORMS + "26_1040es_fillable.pdf",
      excerpt:
        "2026 WORKSHEET (verbatim): 'You must use this Worksheet to calculate the reduction of your standard deduction amount or itemized deduction amount if your estimated Maine adjusted gross income for 2026 is greater than $102,250 if single or married filing separately; $153,400 if head of household; or $204,550 if married filing jointly or qualifying surviving spouse. … 4. Enter $75,000 if single or married filing separately; $112,500 if head of household; or $150,000 if married filing jointly or qualifying surviving spouse. 5. Divide line 3 by line 4. If one or more, enter 1.0000.' 2026 FORM 1040ES-ME: 'Note: If your Maine adjusted gross income is over $102,250, your itemized deductions or standard deduction may be reduced.' Same mechanics as version 1 with the 2026 thresholds.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { thresholdSingleMfs: { value: "10225000", type: "money" }, thresholdHoh: { value: "15340000", type: "money" }, thresholdJoint: { value: "20455000", type: "money" } },
    formula: (() => {
      const agi = fact("meAgi");
      const ded = max0(fact("meDeductionBeforePhaseout"));
      const r: Expr = iff(isJoint, ratio4(sub(agi, money("20455000")), "15000000"), iff(isHoh, ratio4(sub(agi, money("15340000")), "11250000"), ratio4(sub(agi, money("10225000")), "7500000")));
      return max0(sub(ded, applyRatio(ded, r)));
    })(),
  },
  {
    id: "us.me.personal_exemption",
    version: 2,
    jurisdiction: "us.me",
    title: "Maine personal exemption TY2026 — $5,300 per exemption, phased out over $341,000 / $375,050 / $409,150 / $204,575 across $125,000 ($62,500 MFS) (Form 1040ME line 18)",
    citation: {
      source: "36 M.R.S. § 5126-A indexed under § 5403(7)-(8) (factor 1.279); MRS 'State of Maine 2026 Individual Income Tax Rates' (Revised May 20, 2026); MRS 2026 'Worksheet for Phaseout of Personal Exemption Deduction Amount'",
      section: "§ 5126-A; Form 1040ME line 18",
      url: FORMS + "26_1040es_pers_exempt_phaseout_wksht.pdf",
      excerpt:
        "MRS 2026 RATES (verbatim): 'Personal Exemption: $5,300 – applicable to the taxpayer (and spouse if married filing jointly)'. 2026 WORKSHEET (verbatim): 'You must use this Worksheet to calculate the reduction of your personal exemption deduction amount if your estimated Maine adjusted gross income for 2026 is greater than $341,000 if single; $375,050 if head of household; $409,150 if married filing jointly or qualifying surviving spouse; or $204,575 if married filing separately. … 6. Enter the 2026 personal exemption amount ($5,300 if single, head of household, or married filing separately; $10,600 if married filing jointly or qualifying surviving spouse). Note: Enter $0 if you (or if married filing jointly, both you and your spouse) can be claimed as a dependent on another person's return. If married filing jointly and only one spouse may be claimed on another person's return, enter $5,300.' Denominators $125,000 / $62,500 unchanged (§ 5126-A(2)).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "530000", type: "money" }, thresholdSingle: { value: "34100000", type: "money" }, thresholdHoh: { value: "37505000", type: "money" }, thresholdJoint: { value: "40915000", type: "money" }, thresholdMfs: { value: "20457500", type: "money" } },
    formula: (() => {
      const ex = mulInt(money("530000"), fact("meExemptions"));
      const agi = fact("meAgi");
      const r: Expr = iff(isJoint, ratio4(sub(agi, money("40915000")), "12500000"), iff(isHoh, ratio4(sub(agi, money("37505000")), "12500000"), iff(isMfs, ratio4(sub(agi, money("20457500")), "6250000"), ratio4(sub(agi, money("34100000")), "12500000"))));
      return max0(sub(ex, applyRatio(ex, r)));
    })(),
  },
  {
    id: "us.me.itemized_deductions",
    version: 2,
    jurisdiction: "us.me",
    title: "Maine itemized deductions TY2026 — Schedule 2 mechanics with the $37,100 cap (medical uncapped)",
    citation: {
      source: "36 M.R.S. § 5125(4) indexed under § 5403(3); 2026 Form 1040ES-ME line 6a ('Deductions - standard or itemized (up to $37,100)') and the 2026 phase-out worksheet footnote",
      section: "§ 5125(4)",
      url: FORMS + "26_1040es_fillable.pdf",
      excerpt: "2026 FORM 1040ES-ME (verbatim): '6. a. Deductions - standard or itemized (up to $37,100). See instructions below'. Same Schedule 2 mechanics as version 1 (taxes and medical removed, real estate and personal property taxes added back, medical added back uncapped) with the 2026 cap; the 2026 Schedule 2 is unpublished.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "3710000", type: "money" } },
    formula: (() => {
      const l2f = add(max0(fact("meSaltTaxes5e")), max0(fact("meExemptIncomeCosts")), max0(fact("meFinancialInstitutionCosts")), max0(fact("meMedicalDeduction")));
      const l3e = add(max0(fact("meMaineTaxableIncomeCosts")), max0(fact("meRealEstateTaxes5b")), max0(fact("mePersonalPropertyTaxes5c")));
      const l4 = max0(add(sub(max0(fact("meFederalItemizedDeductions")), l2f), l3e));
      return add(max0(fact("meMedicalDeduction")), minE(l4, money("3710000")));
    })(),
  },
];
