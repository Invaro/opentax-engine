import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Hawaii deep pack — TY2025 Form N-11 (full-year resident). Every amount
 * verified from the 2025 Form N-11 Instructions (52 pp: line-by-line, the
 * Worksheets pp. 31-34, the Tax Table pp. 35-47, the Tax Rate Schedules
 * p. 48), DOTAX's standalone "2025 Tax Tables" (identical on all 2,000
 * rows), the printed 2025 Form N-11, Schedule X, Schedule CR, Form N-311,
 * Form N-356, and HRS §§ 235-2.3, 235-2.4, 235-7, 235-51, 235-54, 235-55,
 * 235-55.6, 235-55.7, 235-55.75, 235-55.85 (capitol.hawaii.gov "hrscurrent"
 * snapshot of January 5, 2026), read together with the enrolled 2026-session
 * acts: Act 24 (SB 3125, May 21, 2026 — new § 235-51 rate tables for TY2027
 * and TY2029, NOT 2025/2026) and Act 35 (HB 2329, May 26, 2026 — IRC
 * conformity as of December 31, 2025 for TY2026).
 *
 * Load-bearing findings:
 *  - Act 46, SLH 2024 (HB 2404) widened every bracket for taxable years
 *    beginning after 12/31/2024: single/MFS 1.4% to $9,600 … 11% over
 *    $325,000; MFJ/QSS to $19,200 … over $650,000; HOH to $14,400 … over
 *    $487,500. The booklet's "Changes to Note" mis-cites it as "Act 45".
 *    The printed anchors ($134, $288, $552, $859 …) are the statute's own
 *    rounded figures; the Tax Table ($50 rows to $100,000) is that schedule
 *    at the row midpoint (lo + $25) rounded half-up — all 2,000 rows × 3
 *    columns reproduce; exact (unrounded) anchors miss 342 / 454 / 314 cells.
 *  - The standard deduction is $4,400 / $8,800 / $6,424 / $4,400 for 2025
 *    (§ 235-2.4(a)(2)(E)); a dependent filer's is the greater of $500 or
 *    earned income, up to the full amount; there is NO age/blind addition
 *    (§ 63(f) inoperative). TY2026 doubles to $8,000 / $16,000 / $12,000.
 *  - Exemptions are $1,144 each plus an extra one per 65-or-older taxpayer
 *    or spouse, $7,000 in lieu for a blind, deaf, or totally disabled person
 *    (§ 235-54); no personal-exemption suspension.
 *  - Itemized deductions keep the pre-TCJA shape: no SALT cap, but state
 *    income (or sales) taxes are deductible only when FEDERAL AGI is under
 *    $100,000 / $150,000 / $200,000 (§ 235-2.4(k)); 7.5% medical floor, 2%
 *    miscellaneous floor, and the § 68 overall limitation at the 2009
 *    thresholds ($166,800 / $83,400 MFS, 3% / 80%).
 *  - The 7.25% alternative tax on net capital gain (§ 235-51(f)) is a
 *    worksheet whose printed line 12 amounts ($24,000 / $36,000 / $48,000)
 *    were not updated for Act 46 — the statute's "taxable income taxed at a
 *    rate below 7.25 per cent" is now $48,000 / $72,000 / $96,000. The
 *    printed worksheet is the default; hiCapitalGainsStatutoryThreshold
 *    applies the statute.
 *  - Refundable credits: food/excise ($220 … $70 per qualified exemption by
 *    FEDERAL AGI, Form N-311), low-income renters ($50 per exemption, Hawaii
 *    AGI under $30,000, rent over $1,000, Schedule X Part I), child and
 *    dependent care (25% down to 15% of up to $10,000 / $20,000, Schedule X
 *    Part II), EITC (40% of federal, Form N-356), and the $25 child passenger
 *    restraint credit. The nine-months-presence tests are attestations.
 *  - TY2026 (Act 35, SLH 2026): IRC as of 12/31/2025, with § 225 (overtime)
 *    and § 163(h)(4) (car-loan interest) decoupled, § 68 frozen at its
 *    12/31/2024 form, and the § 67(g) and § 165(h)(5) carve-outs dropped —
 *    so 2%-floor miscellaneous deductions and non-disaster casualty losses
 *    end for Hawaii in 2026. Rates are unchanged in 2026; Act 24's new
 *    tables begin TY2027.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const ge = (l: Expr, r: Expr): Expr => cmp("ge", l, r);
const eq = (l: Expr, r: Expr): Expr => cmp("eq", l, r);
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
const isJoint: Expr = or(isStatus("mfj"), isStatus("qss")); // "*This column must also be used by qualifying surviving spouse"
const isHoh: Expr = isStatus("hoh");
const isMfs: Expr = isStatus("mfs");
const isSingle: Expr = isStatus("single");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents × 10^4) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** 7.25% of a whole-dollar amount rounded ONCE to dollars (cents-then-dollars would lift x.495 to x+1) */
const pct725 = (x: Expr): Expr => dollarsFromScaled(times(x, "725"));
/** printed rate schedule: fixed (as printed) + rate × excess over the bracket floor, one rounding */
const printedSchedule = (base: Expr, rows: { thresholdCents: string; fixedCents: string; rateBps: string }[]): Expr => {
  let expr: Expr = dollarsFromScaled(add(times(money(rows[0].fixedCents), "10000"), times(sub(base, money(rows[0].thresholdCents)), rows[0].rateBps)));
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    expr = iff(ge(base, money(r.thresholdCents)), dollarsFromScaled(add(times(money(r.fixedCents), "10000"), times(sub(base, money(r.thresholdCents)), r.rateBps))), expr);
  }
  return expr;
};

// 2025 Tax Rate Schedules (booklet p. 48 = HRS § 235-51(a)-(c) "taxable year beginning after December 31, 2024")
const row = (thr: number, fixed: number, bps: number) => ({ thresholdCents: String(thr * 100), fixedCents: String(fixed * 100), rateBps: String(bps) });
const SCHED_I = [row(0, 0, 140), row(9600, 134, 320), row(14400, 288, 550), row(19200, 552, 640), row(24000, 859, 680), row(36000, 1675, 720), row(48000, 2539, 760), row(125000, 8391, 790), row(175000, 12341, 825), row(225000, 16466, 900), row(275000, 20966, 1000), row(325000, 25966, 1100)];
const SCHED_II = [row(0, 0, 140), row(19200, 269, 320), row(28800, 576, 550), row(38400, 1104, 640), row(48000, 1718, 680), row(72000, 3350, 720), row(96000, 5078, 760), row(250000, 16782, 790), row(350000, 24682, 825), row(450000, 32932, 900), row(550000, 41932, 1000), row(650000, 51932, 1100)];
const SCHED_III = [row(0, 0, 140), row(14400, 202, 320), row(21600, 432, 550), row(28800, 828, 640), row(36000, 1289, 680), row(54000, 2513, 720), row(72000, 3809, 760), row(187500, 12587, 790), row(262500, 18512, 825), row(337500, 24699, 900), row(412500, 31449, 1000), row(487500, 38949, 1100)];
const scheduleTax = (x: Expr): Expr => iff(isJoint, printedSchedule(x, SCHED_II), iff(isHoh, printedSchedule(x, SCHED_III), printedSchedule(x, SCHED_I)));
/** Form N-11 line 27 ordinary tax: the Tax Table ($50-row midpoint) under $100,000, the Tax Rate Schedules at $100,000 or more; hiUseRateSchedule applies the schedule at any income */
const ordinaryTax = (x: Expr): Expr => {
  const mid: Expr = add(mulInt(money("5000"), stepUnits(x, "5000", "floor")), money("2500"));
  const tableMethod: Expr = iff(lt(x, money("10000000")), scheduleTax(mid), scheduleTax(x));
  return iff(fact("hiUseRateSchedule"), scheduleTax(x), tableMethod);
};

const FORMS = "https://files.hawaii.gov/tax/forms/2025/";
const BOOKLET_URL = FORMS + "n11ins.pdf";
const HRS = (s: string) => `https://www.capitol.hawaii.gov/hrscurrent/Vol04_Ch0201-0257/HRS0235/HRS_0235-${s}.htm`;

export const hiRules: Rule[] = [
  {
    id: "us.hi.income_tax",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii income tax — 2025-2026 rate schedules (1.4% to 11% in twelve brackets; single and MFS to $9,600 … over $325,000; MFJ and QSS to $19,200 … over $650,000; HOH to $14,400 … over $487,500) and the Tax Table (printed-anchor schedule at the $50-row midpoint, under $100,000) (Form N-11 line 27)",
    citation: {
      source: "HRS § 235-51(a)-(c) as amended by Act 46, SLH 2024 (HB 2404, § 2; 'taxable year beginning after December 31, 2024'); 2025 Form N-11 Instructions p. 20 (Tax Table / Tax Rate Schedules), pp. 35-47 (Tax Table), p. 48 (2025 Tax Rate Schedules); DOTAX '2025 Tax Tables'; Act 24, SLH 2026 (SB 3125, § 2, applies to taxable years beginning after December 31, 2026)",
      section: "§ 235-51(a)-(c); Form N-11 line 27",
      url: HRS("0051"),
      excerpt:
        "STATUTE (§ 235-51(c), verbatim, 'In the case of any taxable year beginning after December 31, 2024'): 'Not over $9,600 — 1.40% of taxable income; Over $9,600 but not over $14,400 — $134.00 plus 3.20% of excess over $9,600; Over $14,400 but not over $19,200 — $288.00 plus 5.50% of excess over $14,400; Over $19,200 but not over $24,000 — $552.00 plus 6.40% of excess over $19,200; Over $24,000 but not over $36,000 — $859.00 plus 6.80% of excess over $24,000; Over $36,000 but not over $48,000 — $1,675.00 plus 7.20% of excess over $36,000; Over $48,000 but not over $125,000 — $2,539.00 plus 7.60% of excess over $48,000; Over $125,000 but not over $175,000 — $8,391.00 plus 7.90% of excess over $125,000; Over $175,000 but not over $225,000 — $12,341.00 plus 8.25% of excess over $175,000; Over $225,000 but not over $275,000 — $16,466.00 plus 9.00% of excess over $225,000; Over $275,000 but not over $325,000 — $20,966.00 plus 10.00% of excess over $275,000; Over $325,000 — $25,966.00 plus 11.00% of excess over $325,000.' (a) joint returns and surviving spouses: 'Not over $19,200 — 1.40%; Over $19,200 but not over $28,800 — $269.00 plus 3.20%; Over $28,800 but not over $38,400 — $576.00 plus 5.50%; Over $38,400 but not over $48,000 — $1,104.00 plus 6.40%; Over $48,000 but not over $72,000 — $1,718.00 plus 6.80%; Over $72,000 but not over $96,000 — $3,350.00 plus 7.20%; Over $96,000 but not over $250,000 — $5,078.00 plus 7.60%; Over $250,000 but not over $350,000 — $16,782.00 plus 7.90%; Over $350,000 but not over $450,000 — $24,682.00 plus 8.25%; Over $450,000 but not over $550,000 — $32,932.00 plus 9.00%; Over $550,000 but not over $650,000 — $41,932.00 plus 10.00%; Over $650,000 — $51,932.00 plus 11.00% of excess over $650,000.' (b) heads of household: 'Not over $14,400 — 1.40%; Over $14,400 but not over $21,600 — $202.00 plus 3.20%; Over $21,600 but not over $28,800 — $432.00 plus 5.50%; Over $28,800 but not over $36,000 — $828.00 plus 6.40%; Over $36,000 but not over $54,000 — $1,289.00 plus 6.80%; Over $54,000 but not over $72,000 — $2,513.00 plus 7.20%; Over $72,000 but not over $187,500 — $3,809.00 plus 7.60%; Over $187,500 but not over $262,500 — $12,587.00 plus 7.90%; Over $262,500 but not over $337,500 — $18,512.00 plus 8.25%; Over $337,500 but not over $412,500 — $24,699.00 plus 9.00%; Over $412,500 but not over $487,500 — $31,449.00 plus 10.00%; Over $487,500 — $38,949.00 plus 11.00% of excess over $487,500.' The booklet's 2025 Tax Rate Schedules (p. 48) print the same three tables: 'Schedule I — Single taxpayers and married filing separate returns (Filing Status Oval 1 or 3)', 'Schedule II — Married taxpayers filing joint returns and qualifying surviving spouses (Oval 2 or 5)', 'Schedule III — Unmarried heads of household (Oval 4)'. BOOKLET (p. 20, verbatim): 'Tax Table: If your taxable income is less than $100,000, you MUST use the Tax Table on pages 36 through 47 … Be sure you use the correct column in the Tax Table.' 'Tax Rate Schedules: You must use the Tax Rate Schedules on page 48 to figure your tax if your taxable income is $100,000 or more.' TAX TABLE (verbatim rows, columns 'Single or Married filing separately / Married filing jointly* / Head of a household', '*This column must also be used by qualifying surviving spouse'): '0 50 0 0 0', '50 100 1 1 1', '23,250 23,300 813 399 524' (the printed example: 'Mr. & Mrs. Brown are filing a joint return. Their taxable income is $23,275 … The amount shown where the income line and filing status column meet is $399'), '62,900 62,950 3,673 2,733 3,156', '99,950 100,000 6,489 5,380 5,935', then '100,000 OR OVER — You MUST use the tax rate schedules.' CONVENTION (verified on all 2,000 $50 rows × 3 columns, booklet and standalone table identical): each cell is the printed schedule at the row midpoint (at-least + $25) rounded half-up; the exact unrounded anchors ($134.40, $859.20, $1,675.20, $2,539.20 …) miss 342 single, 454 joint, and 314 HOH cells. ROUNDING (p. 11): 'round off cents to the nearest whole dollar … drop amounts under 50 cents and increase amounts from 50 to 99 cents to the next dollar.' ENCODING: default = the table method under $100,000 (schedule at the row midpoint) and the schedule at the exact income from $100,000; hiUseRateSchedule = true applies the schedule at any income (differs from the table by at most the rate × $25). MFS uses Schedule I; a federal QSS uses Schedule II. CURRENCY: § 235-51 keeps these tables for taxable years beginning after December 31, 2024 and before January 1, 2027 — Act 24, SLH 2026 (SB 3125 CD2, approved May 21, 2026) rewrote the 'after December 31, 2026' and 'after December 31, 2028' tables (2.5% / 5% low brackets and a 13% bracket over $1,000,000 joint / $750,000 HOH / $500,000 single) and 'shall apply to taxable years beginning after December 31, 2026' (§ 9(1); the enrolled bill's own file header reads 'C.D. 1' while DOTAX Announcement 2026-06 cites 'C.D. 2' — the two official sources disagree on the draft number, not on the text), so TY2026 uses the 2025 schedules (DOTAX Announcement 2024-03: 'For tax year 2026 … The income tax brackets will be the same as in tax year 2025'; Booklet A (Rev. 2025), effective for withholding from January 1, 2026, prints the same $9,600 / $134.00 … $2,539.00 plus 7.60% and $19,200 / $269.00 … $5,078.00 plus 7.60% schedules); the 2026 Tax Table is unpublished (~January 2027) and is expected to reproduce this convention — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      ratesBps: { value: "140", type: "int" },
      topRateBps: { value: "1100", type: "int" },
      singleBracket1: { value: "960000", type: "money" },
      singleTopBracket: { value: "32500000", type: "money" },
      jointBracket1: { value: "1920000", type: "money" },
      jointTopBracket: { value: "65000000", type: "money" },
      hohBracket1: { value: "1440000", type: "money" },
      hohTopBracket: { value: "48750000", type: "money" },
      tableTop: { value: "10000000", type: "money" },
      tableRowWidth: { value: "5000", type: "money" },
    },
    formula: ordinaryTax(max0(fact("stateTaxableIncome"))),
  },
  {
    id: "us.hi.capital_gains_tax",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii alternative tax on net capital gain — the smaller of the regular tax and (the tax on the greater of taxable income less net capital gain or the printed $24,000 / $36,000 / $48,000, plus 7.25% of the rest); the printed line 12 amounts were not updated for Act 46 (§ 235-51(f) gives $48,000 / $72,000 / $96,000 — hiCapitalGainsStatutoryThreshold) (Tax on Capital Gains Worksheet, Form N-11 lines 27 and 27a)",
    citation: {
      source: "HRS § 235-51(f); 2025 Form N-11 Instructions p. 20 ('Alternative Tax on Capital Gains') and p. 33 'Tax on Capital Gains Worksheet' lines 1-19; Form N-11 lines 27 and 27a",
      section: "§ 235-51(f); Form N-11 lines 27, 27a",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(f) If a taxpayer has a net capital gain for any taxable year to which this subsection applies, then the tax imposed by this section shall not exceed the sum of: (1) The tax computed at the rates and in the same manner as if this subsection had not been enacted on the greater of: (A) The taxable income reduced by the amount of net capital gain, or (B) The amount of taxable income taxed at a rate below 7.25 per cent, plus (2) A tax of 7.25 per cent of the amount of taxable income in excess of the amount determined under paragraph (1).' WORKSHEET (verbatim): 'Note: If your taxable income is $48,000 ($24,000 for Single, and Married Filing Separately; or $36,000 for Head of Household classifications) or under, do not use this worksheet. 1. Enter your taxable income from Form N-11, line 26; 2. Enter your net long-term capital gain (federal Sch. D (Form 1040 or 1040-SR), line 15; or federal Form 1040 or 1040-SR, line 7 if Sch. D is not required); 3. Combine your Hawaii long-term adjustments, if any …; 4. Combine lines 2 and 3. This is your Hawaii net long-term capital gain; 5. Enter your net capital gain (federal Sch. D …, line 16; or federal Form 1040 or 1040-SR, line 7 …); 6. Combine your Hawaii short-term adjustments …; 7. Combine lines 3, 5, and 6. This is your Hawaii net capital gain; 8. Enter the smaller of line 4 or line 7; 9. If you are filing Form N-158, enter the amount from line 4e of Form N-158; 10. Line 8 minus line 9 (If this amount is zero or less, stop here; you cannot use this worksheet to figure your tax.); 11. Line 1 minus line 10; 12. Enter the amount shown below for the filing status you claimed: Single or Married filing separately — $24,000; Head of household — 36,000; Married filing jointly or qualifying surviving spouse — 48,000; 13. Enter the greater of line 11 or line 12; 14. Line 1 minus line 13. This is the amount of net capital gains eligible for alternative tax; 15. Compute the tax on the amount on line 13 using the Tax Table or Tax Rate Schedules, whichever applies; 16. Multiply line 14 by 7.25% (.0725) and enter the result; 17. Line 15 plus line 16; 18. Compute the tax on the amount on line 1 using the Tax Table or Tax Rate Schedules, whichever applies; 19. Enter the smaller of line 17 or line 18 here and on line a of the Tax Computation Worksheet on page 32. If line 17 is smaller, enter the amount from line 14 in the space provided beside Form N-11, line 27a.' DISCREPANCY: the printed line 12 amounts are the 2018-2024 figures (the 7.20% bracket then ended at $24,000 / $36,000 / $48,000 — the 2024 booklet prints the same worksheet); under the 2025 schedules the 7.20% bracket ends at $48,000 single/MFS, $72,000 HOH, $96,000 MFJ/QSS, which is the statute's 'amount of taxable income taxed at a rate below 7.25 per cent'. The printed worksheet is encoded as the default (it is the return as DOTAX instructs it be prepared, and its line 19 minimum never exceeds the regular tax); hiCapitalGainsStatutoryThreshold = true substitutes the statutory amounts (a lower tax by up to about $60 single / $120 joint). ENCODING: line 8 = min(line 4, line 7); line 10 = line 8 − line 9 (≤ 0 → regular tax); 13 = max(1 − 10, threshold); 15 and 18 use the same table-or-schedule method as us.hi.income_tax (hiUseRateSchedule); 16 (7.25% × line 14) rounded ONCE to whole dollars; result = min(17, 18). Amounts are unindexed and Act 24's rate changes begin TY2027 — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rateBps: { value: "725", type: "int" },
      printedThresholdSingleMfs: { value: "2400000", type: "money" },
      printedThresholdHoh: { value: "3600000", type: "money" },
      printedThresholdJoint: { value: "4800000", type: "money" },
      statutoryThresholdSingleMfs: { value: "4800000", type: "money" },
      statutoryThresholdHoh: { value: "7200000", type: "money" },
      statutoryThresholdJoint: { value: "9600000", type: "money" },
    },
    formula: (() => {
      const l1 = max0(fact("stateTaxableIncome"));
      const l8 = minE(max0(fact("hiNetLongTermCapitalGain")), max0(fact("hiNetCapitalGain")));
      const l10 = max0(sub(l8, max0(fact("hiInvestmentInterestN158"))));
      const printedThr: Expr = iff(isJoint, money("4800000"), iff(isHoh, money("3600000"), money("2400000")));
      const statutoryThr: Expr = iff(isJoint, money("9600000"), iff(isHoh, money("7200000"), money("4800000")));
      const thr: Expr = iff(fact("hiCapitalGainsStatutoryThreshold"), statutoryThr, printedThr);
      const l13 = maxE(sub(l1, l10), thr);
      const l14 = max0(sub(l1, l13));
      const l17 = add(ordinaryTax(minE(l13, l1)), pct725(l14));
      const l18 = ordinaryTax(l1);
      return iff(or(le(l1, thr), le(l10, money("0"))), l18, minE(l17, l18));
    })(),
  },
  {
    id: "us.hi.standard_deduction",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii standard deduction 2025 — $4,400 single and MFS, $8,800 MFJ and QSS, $6,424 HOH (§ 235-2.4(a)(2)(E)); a dependent filer's is limited to the greater of $500 or earned income, up to the full amount; no age or blindness addition (Form N-11 line 23)",
    citation: {
      source: "HRS § 235-2.4(a)(1)-(3) as amended by Act 46, SLH 2024 (HB 2404, § 1); 2025 Form N-11 Instructions p. 20 ('Standard Deduction', 'Standard Deduction for Dependents' worksheet lines A-E); printed Form N-11 line 23",
      section: "§ 235-2.4(a)(2)(E), (a)(3); Form N-11 line 23",
      url: HRS("0002_0004"),
      excerpt:
        "STATUTE (verbatim): '(1) Section 63(c)(1)(B) (relating to the additional standard deduction), … 63(c)(4) (relating to inflation adjustments), … and 63(f) (relating to additional amounts for the aged or blind) of the Internal Revenue Code shall not be operative for purposes of this chapter; (2) Section 63(c)(2) (relating to the basic standard deduction) of the Internal Revenue Code shall be operative, except that the standard deduction amounts provided therein shall instead mean: … (E) For taxable years beginning after December 31, 2023: (i) $8,800 in the case of a joint return as provided by section 235-93 or a surviving spouse (as defined in section 2(a) of the Internal Revenue Code); (ii) $6,424 in the case of a head of household (as defined in section 2(b) of the Internal Revenue Code); (iii) $4,400 in the case of an individual who is not married and who is not a surviving spouse or head of household; or (iv) $4,400 in the case of a married individual filing a separate return; … (3) Section 63(c)(5) (limiting the basic standard deduction in the case of certain dependents) of the Internal Revenue Code shall be operative, except that the limitation shall be the greater of $500 or the individual's earned income'. FORM (line 23, verbatim): 'If you checked filing status box: 1 or 3 enter $4,400; 2 or 5 enter $8,800; 4 enter $6,424. Standard Deduction'. BOOKLET (p. 20, verbatim): 'Hawaii did not adopt the federal provision that increases the standard deduction amounts for tax years 2018 through 2025.' 'Standard Deduction for Dependents. If you can be claimed as a dependent by someone else and you do not itemize your deductions, your standard deduction is limited to the greater of $500 or your earned income (up to the full standard deduction for your filing status). … A. Enter your earned income (defined below). If none, enter zero; B. Minimum amount 500.00; C. Compare the amounts on lines A and B above. Enter the LARGER of the two amounts here; D. Maximum amount. Enter the full standard deduction for your filing status, shown in the chart above, here; E. Compare the amounts on lines C and D above. Enter the SMALLER of the two amounts here and on Form N-11, line 23.' 'Earned income includes wages, salaries, tips, professional fees, and other compensation received for personal services you performed. It also includes any taxable scholarship or fellowship grant. Generally, your earned income is the total of the amounts you reported on federal Form 1040 or Form 1040-SR, line 1 (wages), federal Schedule 1 …, lines 3 (business income) and 6 (farming income), minus the amount, if any, on federal Schedule 1 …, line 15 (deduction for self-employment tax).' MFS: 'You must itemize deductions if: You are married, filing a separate return, and your spouse itemizes' (p. 15) — the composer handles the spouse-itemizes case. TY2026: § 235-2.4(a)(2)(F) — version 2.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { single: { value: "440000", type: "money" }, joint: { value: "880000", type: "money" }, hoh: { value: "642400", type: "money" }, dependentMinimum: { value: "50000", type: "money" } },
    formula: (() => {
      const base: Expr = iff(isJoint, money("880000"), iff(isHoh, money("642400"), money("440000")));
      const dep = minE(base, maxE(money("50000"), max0(fact("hiEarnedIncome"))));
      return iff(fact("isClaimedAsDependent"), dep, base);
    })(),
  },
  {
    id: "us.hi.itemized_deductions",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii itemized deductions 2025 — Worksheets A-1 to A-6 (medical over 7.5% of Hawaii AGI; state income or sales taxes only when federal AGI is under $100,000 / $150,000 / $200,000, real estate, personal property, and other taxes; mortgage and investment interest; contributions; casualty losses over 10% of AGI; miscellaneous over 2% of AGI plus deductions not subject to the floor) and the § 68 overall limitation over $166,800 ($83,400 MFS): the smaller of 3% of the excess or 80% of the non-protected deductions (Form N-11 lines 21a-21f, 22)",
    citation: {
      source: "HRS § 235-2.4(b), (c), (k), (l); 2025 Form N-11 Instructions pp. 15-20 (lines 21a-21f, 22), p. 32 'Itemized Deductions Worksheet' A-1 to A-6 and 'Total Itemized Deductions Worksheet' lines 1-11",
      section: "§ 235-2.4(b), (c), (k), (l); Form N-11 lines 21a-22",
      url: HRS("0002_0004"),
      excerpt:
        "STATUTE (verbatim): '(b) Section 67 (with respect to the 2-percent floor on miscellaneous itemized deductions) of the Internal Revenue Code shall be operative for purposes of this chapter, except that the suspension in section 67(g) shall not be operative for purposes of this chapter. (c) Section 68 (with respect to the overall limitation on itemized deductions) of the Internal Revenue Code shall be operative; provided that the: (1) Thresholds shall be those that were operative for federal tax year 2009; and (2) Suspension in section 68(f) shall not be operative for purposes of this chapter.' '(k) Section 164 (with respect to taxes) … shall be operative …, except that: (1) Section 164(b)(6)(B) (limiting the deduction for state and local taxes) shall not be operative …; (2) The deductions under section 164(a)(3) and (b)(5) shall not be operative for corporate taxpayers and shall be operative only for the following individual taxpayers: (A) A taxpayer filing a single return or a married person filing separately with a federal adjusted gross income of less than $100,000; (B) A taxpayer filing as a head of household with a federal adjusted gross income of less than $150,000; and (C) A taxpayer filing a joint return or as a surviving spouse with a federal adjusted gross income of less than $200,000; and (3) Section 164(a)(3) shall not be operative for any amounts for which the credit under section 235-55 has been claimed.' '(l) … (1) The amount prescribed by section 165(h)(1) (relating to the limitation per casualty) … shall be a $100 limitation per casualty; … (3) Section 165(h)(5) (relating to the limitation on the deductibility of personal casualty losses that are not attributable to federally declared disasters) shall not be operative'. § 235-2.4(j)(3): § 163(h)(3)(F) (limiting mortgage interest) is not operative. WORKSHEETS (verbatim): 'A-1 Medical and Dental Expenses: 1. Enter amount of medical and dental expenses; 2. Enter the amount from Form N-11, line 20 (Hawaii AGI); 3. Multiply line 2 by 7.5% (.075). If zero or less, enter zero; 4. Line 1 minus line 3. If zero or less, enter zero. Enter the result here and on Form N-11, line 21a. A-2 Taxes You Paid: 5. State and local (check only one box): a Income taxes, or b General sales taxes. Note: You can only claim this deduction if your federal AGI is less than $100,000 and you are single or married filing separately; or less than $150,000 and you are a head of household; or less than $200,000 and you are married filing jointly or a qualifying surviving spouse; 6. Real estate taxes; 7. Personal property taxes; 8. Other taxes; 9. Add lines 5 through 8 … Form N-11, line 21b. A-3 Interest You Paid: 10. Home mortgage interest and points reported to you on federal Form 1098; 11. Home mortgage interest not reported to you on federal Form 1098; 12. Points not reported …; 13. Investment interest (attach Form N-158); 14. Add lines 10 through 13 … line 21c. A-4 Gifts to Charity: 15. … cash or check; 16. Other than by cash or check; 17. Carryover from prior year; 18. Add lines 15 through 17 … line 21d. A-5 Casualties and Thefts: 19. Total casualty and theft loss(es) from the 2017 federal Form 4684, line 16; 20. Enter the amount from Form N-11, line 20 (Hawaii AGI); 21. Multiply line 20 by 10% (.10). If zero or less, enter zero; 22. Line 19 minus line 21. If zero or less, enter zero … line 21e. A-6 Miscellaneous Deductions: 23. Unreimbursed employee business expenses …; 24. Tax preparation fees; 25. Other expenses (investment, safe deposit box, etc.); 26. Add lines 23 to 25; 27. Enter the amount from Form N-11, line 20 (Hawaii AGI); 28. Multiply line 27 by 2% (.02). If zero or less, enter zero; 29. Line 26 minus line 28. If zero or less, enter zero; 30. Other deductions not subject to 2% AGI limit …; 31. Add lines 29 and 30 … line 21f. 32. Total itemized deductions. Add lines 4, 9, 14, 18, 22, and 31.' 'Total Itemized Deductions Worksheet: 1. Enter the amount from line 32 of the Itemized Deductions Worksheet; 2. Enter from the Itemized Deductions Worksheet the following: a. Medical and dental expenses (Worksheet A-1, line 4); b. Investment interest (Worksheet A-3, line 13); c. Casualty and theft losses (Worksheet A-5, line 22); d. Any gambling and casualty or theft losses included in Worksheet A-6, line 30; 3. Add lines 2a through 2d; 4. Is the amount on line 3 less than the amount on line 1? No. Your deduction is not limited … Yes. Line 1 minus line 3; 5. Multiply line 4 by 80% (.80); 6. Enter the amount from Form N-11, line 20 (Hawaii AGI); 7. Enter $166,800 ($83,400 if married filing separately); 8. Is the amount on line 7 less than the amount on line 6? No. Your deduction is not limited … Yes. Line 6 minus line 7; 9. Multiply line 8 by 3% (.03); 10. Enter the smaller of line 5 or line 9; 11. Total itemized deductions. Line 1 minus line 10. Enter the result here and on Form N-11, line 22.' BOOKLET (p. 20): 'Add lines 21a through 21f, and enter the result on line 22 if the amount on line 20 (Hawaii adjusted gross income) is $166,800 or less ($83,400 if married filing separately).' (p. 16-17): 'Hawaii did not adopt the federal provision that limits the deduction for state and local taxes to $10,000 … but did adopt the federal provision that foreign real property taxes cannot be deducted.' 'Hawaii did not adopt the federal provisions that (1) suspends the deduction for interest paid on home equity loans, and (2) lowers the dollar limit on mortgages'. 'If you claim a credit for income taxes paid to other states and countries, you cannot also claim those amounts as an itemized deduction'. ENCODING: hiStateLocalIncomeTaxes is the elected income OR sales tax amount, allowed only when hiFederalAgi is under the status limit; casualty losses are entered after the $100-per-casualty reduction; hiJobAndMiscExpenses is subject to the 2% floor and hiOtherMiscDeductions is not (hiGamblingLossesInMisc is the line 2d protected share); each worksheet line rounded to whole dollars. TY2026 (Act 35, SLH 2026): § 67(g)'s suspension and § 165(h)(5) become operative — version 2.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      medicalFloorBps: { value: "750", type: "int" },
      casualtyFloorBps: { value: "1000", type: "int" },
      miscFloorBps: { value: "200", type: "int" },
      saltAgiLimitSingleMfs: { value: "10000000", type: "money" },
      saltAgiLimitHoh: { value: "15000000", type: "money" },
      saltAgiLimitJoint: { value: "20000000", type: "money" },
      overallLimitationThreshold: { value: "16680000", type: "money" },
      overallLimitationThresholdMfs: { value: "8340000", type: "money" },
      overallLimitationRateBps: { value: "300", type: "int" },
      overallLimitationCapBps: { value: "8000", type: "int" },
    },
    formula: (() => {
      const agi = fact("hiAgi");
      const fagi = fact("hiFederalAgi");
      const l21a = max0(sub(max0(fact("hiMedicalExpenses")), rd(pct(max0(agi), "75", "1000"))));
      const saltLimit: Expr = iff(isJoint, money("20000000"), iff(isHoh, money("15000000"), money("10000000")));
      const salt: Expr = iff(lt(fagi, saltLimit), max0(fact("hiStateLocalIncomeTaxes")), money("0"));
      const l21b = add(salt, max0(fact("hiRealEstateTaxes")), max0(fact("hiPersonalPropertyTaxes")), max0(fact("hiOtherTaxes")));
      const invInt = max0(fact("hiInvestmentInterest"));
      const l21c = add(max0(fact("hiHomeMortgageInterest")), invInt);
      const l21d = max0(fact("hiCharitableContributions"));
      const l21e = max0(sub(max0(fact("hiCasualtyLosses")), rd(pct(max0(agi), "10", "100"))));
      const l29 = max0(sub(max0(fact("hiJobAndMiscExpenses")), rd(pct(max0(agi), "2", "100"))));
      const l30 = max0(fact("hiOtherMiscDeductions"));
      const l21f = add(l29, l30);
      const total = add(l21a, l21b, l21c, l21d, l21e, l21f);
      const protectedAmt = add(l21a, invInt, l21e, minE(max0(fact("hiGamblingLossesInMisc")), l30));
      const l5 = rd(pct(max0(sub(total, protectedAmt)), "80", "100"));
      const thr: Expr = iff(isMfs, money("8340000"), money("16680000"));
      const l9 = rd(pct(max0(sub(agi, thr)), "3", "100"));
      const l10 = minE(l5, l9);
      return iff(and(gt(agi, thr), lt(protectedAmt, total)), max0(sub(total, l10)), total);
    })(),
  },
  {
    id: "us.hi.personal_exemption",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii personal exemptions — $1,144 × the line 6e count (yourself, spouse, dependents, plus one more for each taxpayer or spouse 65 or older); a blind, deaf, or totally disabled person takes $7,000 in lieu (no dependent or age exemptions with it) (Form N-11 line 25)",
    citation: {
      source: "HRS § 235-54(a), (c); 2025 Form N-11 Instructions pp. 9-10 (lines 6a-6e) and p. 20 (line 25, 'Blind, Deaf, or Totally Disabled'); printed Form N-11 lines 6a-6e, 25",
      section: "§ 235-54(a), (c); Form N-11 lines 6a-6e, 25",
      url: HRS("0054"),
      excerpt:
        "STATUTE (verbatim): '(a) In computing the taxable income of any individual, there shall be deducted, in lieu of the personal exemptions allowed by the Internal Revenue Code, personal exemptions computed as follows: Ascertain the number of exemptions which the individual can lawfully claim under the Internal Revenue Code, add an additional exemption for the taxpayer or the taxpayer's spouse who is sixty-five years of age or older within the taxable year, and multiply that number by $1,144, for taxable years beginning after December 31, 1984. … In the case of an individual with respect to whom an exemption under this section is allowable to another taxpayer …, the personal exemption amount applicable to such individual under this subsection for such individual's taxable year shall be zero. … (c) A blind person, a deaf person, and any person totally disabled, in lieu of the personal exemptions allowed by the Internal Revenue Code, shall be allowed, and there shall be deducted in computing the taxable income of a blind person, a deaf person, or a totally disabled person, instead of the exemptions provided by subsection (a), the amount of $7,000.' FORM (line 25, verbatim): 'Multiply $1,144 by the total number of exemptions claimed on line 6e. If you and/or your spouse are blind, deaf, or disabled, fill in the applicable oval(s), and see page 20 of the Instructions.' BOOKLET (verbatim): 'Line 6a Yourself: Fill in the oval on line 6a if no one can claim you as a dependent on another person's tax return. Fill in the oval for \"Age 65 or over\" if you are age 65 or over as of January 1, 2026. If you can be claimed as a dependent on another person's tax return, do not fill in the ovals on lines 6a and 6b.' 'Line 6b Spouse: Fill in the oval on line 6b if either of the following applies. 1. Your filing status is married filing jointly and your spouse cannot be claimed as a dependent on another person's return. 2. You were married at the end of 2025, your filing status is married filing separately, and both of the following apply. a. Your spouse had no income and is not filing a return. b. Your spouse cannot be claimed as a dependent on another person's return. If your spouse meets these qualifications, fill in the oval under line 6b and fill in the oval for \"Age 65 or over\" if your spouse was age 65 or over as of January 1, 2026.' 'Line 6e: Add the numbers you entered in the boxes for 6a, 6b, 6c, and 6d.' 'Hawaii did not adopt the federal provision that suspends the deduction for personal exemptions for tax years 2018 through 2025. Regular Exemptions: Residents are allowed $1,144 for each exemption they can claim. Multiply $1,144 by the total number of exemptions you claimed on line 6e.' 'A blind, deaf or totally disabled person who qualifies, may be allowed a Disability Exemption of $7,000. The Disability Exemption is in lieu of the regular personal exemption of $1,144. If you claim the Disability Exemption, you will not be able to claim the additional exemptions for your children or other dependents, or for being 65 or older. The following maximum exemptions are allowed: One Individual (any filing status) — $7,000; Taxpayer and Spouse (non-disabled spouse under 65) — 8,144; Taxpayer and Spouse (non-disabled spouse age 65 or over) — 9,288; Taxpayer and Spouse (both disabled) — 14,000.' Form N-172 certification must be filed before the return. ENCODING: hiExemptions is the line 6e count (0 when hiDisabledPersons > 0); with disability, $7,000 × disabled persons plus, on a joint return with one non-disabled spouse, $1,144 (plus $1,144 if that spouse is 65 or older per hiNonDisabledSpouseAge65). Unindexed (the last change was L 2009) — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "114400", type: "money" }, disabilityExemption: { value: "700000", type: "money" } },
    formula: (() => {
      const disabled = fact("hiDisabledPersons");
      const regular = mulInt(money("114400"), fact("hiExemptions"));
      const spouseShare: Expr = iff(and(isStatus("mfj"), eq(disabled, int("1"))), iff(fact("hiNonDisabledSpouseAge65"), money("228800"), money("114400")), money("0")); // "One Individual (any filing status) — $7,000" — the spouse share needs a joint return
      return iff(ge(disabled, int("1")), add(mulInt(money("700000"), disabled), spouseShare), regular);
    })(),
  },
  {
    id: "us.hi.reserve_pay_exclusion",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii military reserve / National Guard duty pay exclusion 2025 — the first $8,636 received by each member (taxpayer and spouse) (Form N-11 line 15)",
    citation: {
      source: "HRS § 235-7(a)(7) (Act 197, SLH 2004: pay for 48 drills and 15 days of annual duty at the E-5 pay grade after eight years of service); 2025 Form N-11 Instructions p. 13 (line 15) and 'Changes to Note'; printed Form N-11 line 15",
      section: "§ 235-7(a)(7); Form N-11 line 15",
      url: HRS("0007"),
      excerpt:
        "STATUTE (verbatim): '(7) Income received by each member of the reserve components of the Army, Navy, Air Force, Marine Corps, or Coast Guard of the United States of America, and the Hawaii National Guard as compensation for performance of duty, equivalent to pay received for forty-eight drills (equivalent of twelve weekends) and fifteen days of annual duty, at an: … (E) E-5 pay grade after eight years of service; provided that this subparagraph shall apply to taxable years beginning after December 31, 2008'. FORM (line 15, verbatim): 'First $8,636 of military reserve or Hawaii national guard duty pay.' BOOKLET (p. 13, verbatim): 'Hawaii does not tax the first $8,636 received by each member of the reserve components of the army, navy, air force, marine corps, coast guard of the United States of America, and the Hawaii national guard, as compensation for performance of duty as such. If you qualify, enter the smaller of: $8,636, or Your pay, as shown on Box 16 of the Form W-2 sent to you by your reserve component. If you are married filing a joint return, and you and your spouse qualify, add the exclusions for both of you and enter the total on line 15.' 'Changes to Note: Taxpayers may exclude up to $8,636 of their military reserve or Hawaii National Guard duty pay from their income, effective for taxable years beginning after December 31, 2024. (Act 197, SLH 2004)'. The amount tracks E-5 pay and changes every year — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perMember: { value: "863600", type: "money" } },
    formula: add(minE(max0(fact("hiReservePay")), money("863600")), iff(isStatus("mfj"), minE(max0(fact("hiSpouseReservePay")), money("863600")), money("0"))),
  },
  {
    id: "us.hi.food_excise_credit",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii refundable food/excise tax credit — $220 / $200 / $170 / $140 / $110 per qualified exemption by federal AGI under $15,000 / $20,000 / $25,000 / $30,000 / $40,000 (single), plus $90 under $50,000 and $70 under $60,000 for every other status; MFS adds the spouse's AGI; not for dependents of another (Form N-311, Form N-11 line 28)",
    citation: {
      source: "HRS § 235-55.85(a)-(c), (g) (Act 163, SLH 2023 amounts, 'Repeal and reenactment on December 31, 2027'); 2025 Form N-311 lines 1-9 and instructions; 2025 Form N-11 Instructions p. 21 (line 28)",
      section: "§ 235-55.85; Form N-311; Form N-11 line 28",
      url: HRS("0055_0008_0005"),
      excerpt:
        "STATUTE (verbatim): '(a) Each individual taxpayer, who files an individual income tax return for a taxable year, and who is not claimed or is not otherwise eligible to be claimed as a dependent by another taxpayer for federal or Hawaii state individual income tax purposes, may claim a refundable food/excise tax credit …; provided that an individual who has no income or no income taxable under this chapter … may claim this credit. (b) Each individual taxpayer may claim a refundable food/excise tax credit multiplied by the number of qualified exemptions to which the taxpayer is entitled in accordance with the table below; provided that spouses filing separate tax returns for a taxable year for which a joint return could have been filed by them shall claim only the tax credit to which they would have been entitled had a joint return been filed. Adjusted gross income for taxpayers filing a single return — Credit per exemption: Under $15,000 $220; $15,000 under $20,000 $200; $20,000 under $25,000 $170; $25,000 under $30,000 $140; $30,000 under $40,000 $110; $40,000 and over $0. Adjusted gross income for heads of household, surviving spouses, spouses filing separate returns, and married couples filing joint returns — Under $15,000 $220; $15,000 under $20,000 $200; $20,000 under $25,000 $170; $25,000 under $30,000 $140; $30,000 under $40,000 $110; $40,000 under $50,000 $90; $50,000 under $60,000 $70; $60,000 and over $0. (c) … a qualified exemption is defined to include those exemptions permitted under this chapter; provided that no additional exemption may be claimed by a taxpayer who is sixty-five years of age or older; provided that a person for whom exemption is claimed has been physically present in the State for more than nine months during the taxable year; and provided further that multiple exemptions shall not be granted because of deficiencies in vision or hearing, or other disability. For purposes of claiming this credit only, a minor child receiving support from the department of human services of the State, social security survivor's benefits, and the like, may be considered a dependent and a qualified exemption of the parent or guardian.' '(g) … \"adjusted gross income\" means adjusted gross income as defined by the Internal Revenue Code.' FORM N-311 (verbatim): '1 Is your federal adjusted gross income less than $60,000 (less than $40,000 if your filing status is Single)? … If \"No,\" STOP.'; '2 List YOURSELF, YOUR SPOUSE, AND YOUR DEPENDENTS that meet all of the following: a) Present in Hawaii for more than nine months in 2025, b) Not in prison, jail, or a youth correctional facility for entire taxable year, and c) Cannot be claimed as a dependent by another taxpayer.'; '3 List MINOR CHILDREN RECEIVING MORE THAN HALF OF THEIR SUPPORT FROM PUBLIC AGENCIES …'; '4 Enter the amount of your federal adjusted gross income; 5 If you are married filing separately, enter your spouse's federal adjusted gross income; 6 Add lines 4 and 5; 7 Enter on line 7 the amount of the tax credit shown below that applies to the amount on line 6 [the two tables above]; 8 Add lines 2 and 3; 9 Multiply line 8 by line 7. Enter the result here and on Form N-11, line 28'. 'Enter your spouse's name if you are married filing jointly or married filing separately where your spouse is not filing a Hawaii return, had no income, and was not the dependent of someone else.' 'If married filing separately, only one spouse may claim the dependents.' ENCODING: hiFoodExciseQualifiedExemptions = Form N-311 line 8 (persons present over nine months, not counting the age-65 extra exemption); AGI = hiFederalAgi plus hiSpouseFederalAgi for MFS; $0 for a filer claimable as a dependent. The credit sunsets to the pre-2023 amounts after December 31, 2027 — this rule ends 2027-01-01 for re-verification.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      tier1: { value: "22000", type: "money" },
      tier2: { value: "20000", type: "money" },
      tier3: { value: "17000", type: "money" },
      tier4: { value: "14000", type: "money" },
      tier5: { value: "11000", type: "money" },
      tier6NonSingle: { value: "9000", type: "money" },
      tier7NonSingle: { value: "7000", type: "money" },
      singleCutoff: { value: "4000000", type: "money" },
      otherCutoff: { value: "6000000", type: "money" },
    },
    formula: (() => {
      const agi = add(fact("hiFederalAgi"), iff(isMfs, fact("hiSpouseFederalAgi"), money("0")));
      const common: Expr = iff(lt(agi, money("1500000")), money("22000"), iff(lt(agi, money("2000000")), money("20000"), iff(lt(agi, money("2500000")), money("17000"), iff(lt(agi, money("3000000")), money("14000"), iff(lt(agi, money("4000000")), money("11000"), money("0"))))));
      const other: Expr = iff(lt(agi, money("4000000")), common, iff(lt(agi, money("5000000")), money("9000"), iff(lt(agi, money("6000000")), money("7000"), money("0"))));
      const per: Expr = iff(isSingle, common, other);
      return iff(fact("isClaimedAsDependent"), money("0"), mulInt(per, fact("hiFoodExciseQualifiedExemptions")));
    })(),
  },
  {
    id: "us.hi.renters_credit",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii credit for low-income household renters — $50 per qualified exemption (including the extra exemption for each qualified person 65 or older) when Hawaii AGI (plus the spouse's for MFS) is under $30,000 and rent net of exclusions exceeds $1,000; refundable; not for dependents of another (Schedule X Part I, Form N-11 line 29)",
    citation: {
      source: "HRS § 235-55.7(a)-(e); 2025 Schedule X Part I lines 1-12; 2025 Form N-11 Instructions p. 21 (line 29) and p. 26 (Schedule X Part I)",
      section: "§ 235-55.7; Schedule X Part I; Form N-11 line 29",
      url: HRS("0055_0007"),
      excerpt:
        "STATUTE (verbatim): '(c) Each taxpayer with an adjusted gross income of less than $30,000 who has paid more than $1,000 in rent during the taxable year for which the credit is claimed may claim a tax credit of $50 multiplied by the number of qualified exemptions to which the taxpayer is entitled; provided each taxpayer sixty-five years of age or over may claim double the tax credit; and provided that a resident individual who has no income or no income taxable under this chapter may also claim the tax credit'. '(2) \"Qualified exemption\" includes those exemptions permitted under this chapter; provided that a person for whom exemption is claimed has physically resided in the State for more than nine months during the taxable year; and provided that multiple exemption shall not be granted because of deficiencies in vision, hearing, or other disability.' '(3) \"Rent\" means the amount paid in cash … for the occupancy of a dwelling place … exclusive of charges for utilities, parking stalls, storage of goods, yard services, furniture, furnishings, and the like. Rent shall not include any rental claimed as a deduction …, any ground rental paid for use of land only, and any rent allowance or subsidies received.' '(b) … which is not partially or wholly exempted from real property tax, who is not eligible to be claimed as a dependent for federal or state income taxes by another'. '(e) … a husband and wife filing separate returns for a taxable year for which a joint return could have been made by them shall claim only the tax credits to which they would have been entitled had a joint return been filed.' SCHEDULE X (verbatim): '1 Is your adjusted gross income (Form N-11, line 20 …) less than $30,000? If \"No,\" STOP.'; '2 Are you a resident who was present in Hawaii more than nine months in 2025? If \"No,\" STOP.'; '3 Can you be claimed as a dependent by another taxpayer? If \"Yes,\" STOP.'; '5 Add up your share of rent paid …; 6 Enter the amount of your exclusions (e.g., utilities, parking stalls, ground rent, rental subsidies such as public assistance); 7 Line 5 minus line 6. If this amount is $1,000, or less, STOP.'; '8 List YOURSELF, YOUR SPOUSE, AND YOUR DEPENDENTS that meet all of the following: a) Resident of Hawaii, b) Present in Hawaii for more than nine months in 2025, and c) Cannot be claimed as a dependent by another taxpayer. Include minor children receiving more than half of their support from public agencies …; 9 If you are a qualified exemption and you are age 65 or over, enter 1. Otherwise, enter -0-; 10 If you are married filing jointly or married filing separately where your spouse is not filing a Hawaii return, had no income, and was not the dependent of someone else; and your spouse is a qualified exemption; and your spouse is age 65 or over; enter 1 …; 11 Add lines 8 through 10; 12 Multiply the number of exemptions on line 11 by $50 and enter the result here and on Form N-11, line 29'. BOOKLET (p. 26): 'Married filing separately. If you are married filing separately, you must add your spouse's adjusted gross income to your own. … If the total is $30,000 or more, you cannot claim this credit.' Rent for property partially or fully exempt from real property tax (public housing, military housing, dormitories, nonprofit-owned, owner-occupied homes) does not qualify. ENCODING: hiRentersExemptions = Schedule X line 11; hiRentPaid = line 7 (rent net of exclusions); AGI = hiAgi plus hiSpouseAgi for MFS. Unindexed — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "5000", type: "money" }, agiLimit: { value: "3000000", type: "money" }, minimumRent: { value: "100000", type: "money" } },
    formula: (() => {
      const agi = add(fact("hiAgi"), iff(isMfs, fact("hiSpouseAgi"), money("0")));
      const ok = and(not(fact("isClaimedAsDependent")), lt(agi, money("3000000")), gt(fact("hiRentPaid"), money("100000")));
      return iff(ok, mulInt(money("5000"), fact("hiRentersExemptions")), money("0"));
    })(),
  },
  {
    id: "us.hi.child_dependent_care_credit",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii credit for child and dependent care expenses — 25% (Hawaii AGI not over $25,000) stepping down one point per $5,000 to 20% at $50,000 and 15% over $50,000, of qualified expenses up to $10,000 (one qualifying person) or $20,000 (two or more) less dependent care benefits, limited to the lower earned income; refundable; MFS only if considered unmarried (Schedule X Part II, Form N-11 line 30)",
    citation: {
      source: "HRS § 235-55.6(a)-(e) (Act 163, SLH 2023 percentages and $10,000 / $20,000 limits, 'Repeal and reenactment on December 31, 2027'); 2025 Schedule X Part II lines 17-28; 2025 Form N-11 Instructions pp. 26-28",
      section: "§ 235-55.6; Schedule X Part II; Form N-11 line 30",
      url: HRS("0055_0006"),
      excerpt:
        "STATUTE (verbatim): '(a)(1) … there shall be allowed as a credit against the tax imposed by this chapter for the taxable year an amount equal to the applicable percentage of the employment-related expenses … If the tax credit claimed by a resident taxpayer exceeds the amount of income tax payment due from the resident taxpayer, the excess of the credit over payments due shall be refunded'. '(2) Applicable percentage: Adjusted gross income — Applicable percentage: Not over $25,000 25%; Over $25,000 but not over $30,000 24%; Over $30,000 but not over $35,000 23%; Over $35,000 but not over $40,000 22%; Over $40,000 but not over $45,000 21%; Over $45,000 but not over $50,000 20%; Over $50,000 15%.' '(c) Dollar limit on amount creditable. The amount of the employment-related expenses incurred during any taxable year which may be taken into account under subsection (a) shall not exceed: (1) $10,000 if there is one qualifying individual …, or (2) $20,000 if there are two or more qualifying individuals … The amount determined under paragraph (1) or (2) … shall be reduced by the aggregate amount excludable from gross income under section 129'. '(d)(1) … shall not exceed: (A) In the case of an individual who is not married at the close of such year, such individual's earned income for such year, or (B) In the case of an individual who is married at the close of such year, the lesser of such individual's earned income or the earned income of the individual's spouse for such year.' '(e)(2) Married couples must file joint return … (4) Certain married individuals living apart. If: (A) An individual who is married and who files a separate return: (i) Maintains as the individual's home a household that constitutes for more than one-half of the taxable year the principal place of abode of a qualifying individual, and (ii) Furnishes over half of the cost of maintaining the household during the taxable year, and (B) During the last six months of the taxable year the individual's spouse is not a member of the household, the individual shall not be considered as married.' SCHEDULE X (verbatim): '17 Enter $10,000 ($20,000 if two or more qualifying persons); 18 Add lines 14 and 15; 19 Line 17 minus line 18. If zero or less, STOP.'; '22 Add the amounts in column (e) of line 21. Do not enter more than $10,000 for one qualifying person or $20,000 for two or more persons. If you completed Section B, enter the smaller of line 19 or 20; 23 Enter your earned income; 24 If married filing jointly, enter your spouse's earned income …; all others, enter the amount from line 23; 25 Enter the smallest of line 22, 23, or 24; 26 Enter your adjusted gross income from Form N-11, line 20 …; 27 Enter on line 27 the decimal amount shown below that applies to the amount on line 26. If line 26 is: Under $25,001 .25; $25,001 – 30,000 .24; $30,001 – 35,000 .23; $35,001 – 40,000 .22; $40,001 – 45,000 .21; $45,001 – 50,000 .20; $50,001 and over .15; 28 Multiply line 25 by the decimal amount on line 27 … Enter the result here and on Form N-11, line 30'. Qualifying person: a dependent under 13, a disabled dependent, or a disabled spouse; a student or disabled spouse is deemed to earn $200 ($400 with two or more qualifying persons) per month (the composer takes the deemed amount as an input). ENCODING: cap = ($10,000 or $20,000) − hiDependentCareBenefits; line 22 = min(hiChildCareExpenses, cap); line 25 = min(22, hiEarnedIncome, spouse earned income on a joint return); $0 for MFS unless hiMfsConsideredUnmarried, and for a filer claimable as a dependent. This rule ends 2027-01-01 (Act 163 sunset re-verification).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { capOne: { value: "1000000", type: "money" }, capTwoPlus: { value: "2000000", type: "money" }, topPct: { value: "25", type: "int" }, bottomPct: { value: "15", type: "int" }, agiTop: { value: "5000000", type: "money" } },
    formula: (() => {
      const cap = max0(sub(iff(ge(fact("hiChildCareQualifyingPersons"), int("2")), money("2000000"), money("1000000")), max0(fact("hiDependentCareBenefits"))));
      const l22 = minE(max0(fact("hiChildCareExpenses")), cap);
      const l23 = max0(fact("hiEarnedIncome"));
      const l24: Expr = iff(isStatus("mfj"), max0(fact("hiSpouseEarnedIncome")), l23); // "If married filing jointly, enter your spouse's earned income … all others, enter the amount from line 23" — a surviving spouse has no spouse
      const l25 = minE(l22, l23, l24);
      const agi = fact("hiAgi");
      const pctPoints: Expr = iff(le(agi, money("2500000")), money("25"), iff(le(agi, money("3000000")), money("24"), iff(le(agi, money("3500000")), money("23"), iff(le(agi, money("4000000")), money("22"), iff(le(agi, money("4500000")), money("21"), iff(le(agi, money("5000000")), money("20"), money("15")))))));
      const credit = rd({ kind: "mulDiv", a: l25, b: pctPoints, c: money("100"), round: "half-up" });
      const blocked = or(fact("isClaimedAsDependent"), and(isMfs, not(fact("hiMfsConsideredUnmarried"))));
      return iff(blocked, money("0"), credit);
    })(),
  },
  {
    id: "us.hi.eitc",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii earned income tax credit — 40% of the federal earned income credit; refundable; same filing status and dependents as the federal return (Form N-356, Schedule CR line 8, Form N-11 line 32)",
    citation: {
      source: "HRS § 235-55.75(a), (c), (d) (Act 114, SLH 2022 refundable 40%; Act 25, SLH 2025 ended the 2022 nonrefundable carryforward after 2025); 2025 Form N-356 lines 1-7 and instructions; 2025 Schedule CR line 8",
      section: "§ 235-55.75; Form N-356; Schedule CR line 8",
      url: HRS("0055_0007_0005"),
      excerpt:
        "STATUTE (verbatim): '(a) Each qualifying individual taxpayer may claim a refundable earned income tax credit. Unless otherwise provided by law, the tax credit, for the appropriate taxable year, shall be forty per cent of the federal earned income tax credit allowed and properly claimed under section 32 of the Internal Revenue Code and reported as such on the individual's federal income tax return.' '(c) … \"qualifying individual taxpayer\" means a resident or nonresident individual that: (1) Files a federal income tax return for the taxable year claiming the earned income tax credit under section 32 of the Internal Revenue Code; and (2) Files a Hawaii income tax return using the filing status used on the federal income tax return for the taxable year and claiming the same dependents claimed on the federal income tax return for the taxable year.' '(d) … If the tax credit claimed by the taxpayer under this section exceeds the amount of the income tax payments due from the taxpayer, the excess of credit over payments due shall be refunded to the taxpayer; … no refunds or payments on account of the tax credit allowed by this section shall be made for amounts less than $1.' FORM N-356 (verbatim): '2 Enter the amount of your federal earned income credit claimed on your federal income tax return for this tax year; 3 Multiply line 2 by 40%; Note: Residents, skip lines 4 and 5, enter \"1.00\" on line 6, and go to line 7 … 7 Total New Credit Claimed — Multiply line 3 by line 6. Also enter this amount on Schedule CR on the appropriate line for this tax credit.' 'The earned income tax credit is refundable and 40% of the federal earned income credit claimed on the taxpayer's federal income tax return.' 'Act 25, Session Laws of Hawaii 2025, eliminates the unlimited carryforward in the nonrefundable earned income tax credit from tax year 2022, effective for taxable years beginning after December 31, 2025.' ENCODING: round(40% × hiFederalEic). The 2022 carryover (Schedule CR line 24) is a transcribed input. Unindexed; the Act 163 sunset is December 31, 2027 — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "40", type: "int" } },
    formula: rd(pct(max0(fact("hiFederalEic")), "40", "100")),
  },
  {
    id: "us.hi.other_state_credit",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii credit for income taxes paid to other states and foreign countries — the smaller of the tax paid and the Hawaii tax less the tax on Hawaii-source income (ordinary income at the table or schedule, Hawaii-source long-term gain at 7.25%), limited to the adjusted tax liability (Other State and Foreign Tax Credit Worksheet, Schedule CR line 12)",
    citation: {
      source: "HRS § 235-55(a)-(b); § 235-2.4(k)(3); 2025 Form N-11 Instructions p. 33 'Other State and Foreign Tax Credit Worksheet' lines 1-20; 2025 Schedule CR line 12 and instructions",
      section: "§ 235-55; Schedule CR line 12",
      url: HRS("0055"),
      excerpt:
        "STATUTE (verbatim): '(a) Whenever an individual … who is a resident of the State …, has become liable for income taxes to a state, or to the District of Columbia, Puerto Rico, or any other territory or possession of the United States, or to a foreign country upon any part of the individual's or person's taxable income for the taxable year, derived or received from sources without the State and taxed under the laws of such other jurisdiction irrespective of the residence or domicile of the recipient, there shall be credited against the tax payable by the individual or person under this chapter the tax so paid by the individual or person to the other jurisdiction upon … satisfactory evidence: (1) Of such tax payment; and (2) That the laws of the other jurisdiction do not allow the individual or person a credit against the taxes imposed by such jurisdiction for the taxes paid or payable under this chapter … (b) The application of such credit, however: … (2) Shall not operate to reduce the tax payable under this chapter to an amount less than that which would have been payable had the taxpayer been taxable only on the income from property owned, personal services performed, trade or business carried on, and other sources in the State.' WORKSHEET (verbatim): 'Note: If you claim a credit for income taxes paid to other states and countries, you cannot also claim those amounts as an itemized deduction … 1. Enter taxable income from Form N-11, line 26; 2. Enter amount of long-term capital gain from the space provided beside Form N-11, line 27a; 3. Enter the amount of your out-of-state income, including capital gains. Do not include any income that is exempt in Hawaii such as employer-funded pensions; 4. Enter the amount of long-term capital gains from sources outside the State; 5. Enter the amount of tax you paid to other States, except for tax paid on income that is exempt in Hawaii (attach a copy of the tax return(s) from the other state(s)); 6. Enter the amount of tax you paid to foreign countries or to U.S. possessions, except for tax paid on income that is exempt in Hawaii …; 7. Enter the amount of the federal foreign tax credit you were allowed to take this year …; 8. Line 6 minus line 7; 9. Line 5 plus line 8. This is the total amount of out-of-state tax eligible for the credit; 10. Line 1 minus line 3. This is your Hawaii source income; 11. Line 2 minus line 4. This is your Hawaii source long-term capital gain. If line 4 exceeds line 2, enter zero here; 12. Line 10 minus line 11. This is your Hawaii ordinary income; 13. Enter your tax amount from line a or line b of the Tax Computation Worksheet on page 32; 14. Figure the Hawaii tax on the amount on line 12. Use the Tax Table or Tax Rate Schedules; 15. Multiply the amount on line 11 by 7.25% (0.0725); 16. Add lines 14 and 15; 17. Line 13 minus line 16; 18. Enter the smaller of line 9 or line 17; 19. Enter the amount from Form N-11, line 34; 20. Enter the smaller of line 18 or line 19 here and on Schedule CR, line 12. Any excess cannot be carried forward.' ENCODING: hiOtherStateTaxEligible = line 9; hiOutOfStateIncome = line 3; hiOutOfStateLtcg = line 4; hiNetCapitalGainLine27a = line 2; hiTaxLine13 = the line 27 tax from the table, schedule, or capital gains worksheet; hiAdjustedTaxLiability = Form N-11 line 34; line 14 uses the same table-or-schedule method as us.hi.income_tax on line 12 (not below zero). Unindexed — this rule ends 2027-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { capitalGainRateBps: { value: "725", type: "int" } },
    formula: (() => {
      const l1 = max0(fact("stateTaxableIncome"));
      const l2 = max0(fact("hiNetCapitalGainLine27a"));
      const l10 = sub(l1, max0(fact("hiOutOfStateIncome")));
      const l11 = max0(sub(l2, max0(fact("hiOutOfStateLtcg"))));
      const l12 = max0(sub(l10, l11));
      const l16 = add(ordinaryTax(l12), pct725(l11));
      const l17 = max0(sub(max0(fact("hiTaxLine13")), l16));
      const l18 = minE(max0(fact("hiOtherStateTaxEligible")), l17);
      return minE(l18, max0(fact("hiAdjustedTaxLiability")));
    })(),
  },
  {
    id: "us.hi.parameters",
    version: 1,
    jurisdiction: "us.hi",
    title: "Hawaii 2025 Form N-11 parameters — line structure, adjustments to federal AGI, the $25 child passenger restraint credit, Schedule CR, payments and refund lines, and the enacted TY2026-2027 position (Acts 46/2024, 24/2026, 35/2026)",
    citation: {
      source: "2025 Form N-11 Instructions (52 pp.); printed 2025 Form N-11, Schedule X, Schedule CR, Forms N-311 and N-356; HRS §§ 235-2.3, 235-2.4, 235-5.5, 235-7, 235-51, 235-54, 235-55 to 235-55.85; Act 46, SLH 2024; Act 123, SLH 2025; Act 24 and Act 35, SLH 2026; DOTAX Tax Announcements 2024-03, 2025-04, 2025-07, 2026-06; web-verified September 2026",
      section: "Form N-11 lines 1-55",
      url: FORMS + "n11_i.pdf",
      excerpt:
        "STRUCTURE (printed 2025 Form N-11): filing status ovals 1 Single, 2 Married filing joint return, 3 Married filing separate return, 4 Head of household, 5 Qualifying surviving spouse (a federal QSS uses Schedule II and the joint standard deduction); 6a Yourself / Age 65 or over, 6b Spouse / Age 65 or over, 6c dependent children, 6d other dependents, 6e total exemptions (→ us.hi.personal_exemption); 7 federal AGI; 8 'Difference in state/federal wages due to COLA, ERS, etc.' (W-2 Box 16 over Box 1); 9 'Interest on out-of-state bonds (including municipal bonds)'; 10 other Hawaii additions (Hawaii Additions Worksheet a-l: IHA distributions, tax refund adjustment, Peace Corps compensation, depreciation and gain adjustments (no bonus depreciation; § 179 capped at $25,000), excluded foreign earned income, student loan interest and adoption benefit differences, 529 K-12 distributions, PTE taxable income share (Act 58, SLH 2025), foreign corporation income); 11 total additions; 12 = 7 + 11; 13 'Pensions taxed federally but not taxed by Hawaii' (§ 235-7(a)(2)-(3): employer-funded plans, government retirement systems including military pensions, and age-73 required distributions — employee-contributed portions are taxable, Schedule J); 14 'Social security benefits taxed on federal return' (§ 235-2.3(b)(3) — 100%); 15 'First $8,636 of military reserve or Hawaii national guard duty pay' (→ us.hi.reserve_pay_exclusion); 16 'Payments to an individual housing account' (up to $5,000, $10,000 joint, $25,000 lifetime, § 235-5.5); 17 'Exceptional trees deduction' (up to $3,000 per tree, once in three years); 18 other Hawaii subtractions (Worksheet a-n: U.S. obligation interest, refund adjustment, IHA interest, Hansen's disease compensation, § 280C disallowed expenses, Form 8814 child income, legal services plan benefits, student loan interest and adoption differences, qualified high technology business income, individual development accounts, moving expenses, bicycle commuting reimbursement); 19 total subtractions; 20 Hawaii AGI; 21a-21f itemized deductions and 22 total (→ us.hi.itemized_deductions); 23 standard deduction (→ us.hi.standard_deduction); 24 = 20 − 22 or 23 ('This line MUST be filled in'); 25 exemptions; 26 taxable income ('Line 24 minus line 25 (but not less than zero)'); 27 tax — 'Fill in oval if from Tax Table; Tax Rate Schedule; or Capital Gains Tax Worksheet' (→ us.hi.income_tax, us.hi.capital_gains_tax) plus the Tax Computation Worksheet lines c-m (Forms N-2, N-103, N-152, N-168, N-312, N-325, N-338, N-344, N-348, N-405, N-586, N-615, N-814 — transcribed); 27a net capital gain from worksheet line 14; 28 Refundable Food/Excise Tax Credit (→ us.hi.food_excise_credit) with the count of DHS-supported minor children; 29 Credit for Low-Income Household Renters (→ us.hi.renters_credit); 30 Credit for Child and Dependent Care Expenses (→ us.hi.child_dependent_care_credit); 31 'Credit for Child Passenger Restraint System(s)' (HRS § 235-15) — '$25 for 2025 for the purchase of one or more new child passenger restraint systems which comply with federal motor vehicle safety standards. This credit is $25 per return regardless of the cost or the number of restraint systems purchased' (attach the invoice); 32 total refundable credits from Schedule CR line 11 (Part I: capital goods excise, fuel tax for commercial fishers, film production, renewable energy (refundable election), important agricultural land, research activities, renewable fuels, 8 EITC (→ us.hi.eitc), claim of right, pro rata real property withholding, RIC credit); 33 = 28 + 29 + 30 + 31 + 32; 34 'Adjusted Tax Liability' = 27 − 33 (may be negative); 35 total nonrefundable credits from Schedule CR line 33 (Part II: 12 income tax paid to another state or foreign country (→ us.hi.other_state_credit), 13 enterprise zone, carryovers 14-24 (including 24 the 2022 EITC carryover, last usable in 2025), 25-32 low-income housing, vocational rehabilitation, school repair, nonrefundable renewable energy, healthcare preceptor, historic preservation, renewable fuels, PTE tax credit) — 'If line 34 is zero or less, no tax credit may be used'; 36 Balance = 34 − 35; 37 Hawaii income tax withheld (W-2, 1099-G, N-2); 38 2025 estimated tax payments (plus N-288A real property withholding); 39 2024 overpayment applied; 40 amount paid with extension (N-200V); 41 total payments; 42 overpaid = 41 − 36 (if 36 is negative, its absolute value plus 41); 43a Hawaii Schools Repairs and Maintenance Fund $2 ($4 joint), 43b Hawaii Public Libraries Fund $5 ($10), 43c Domestic and Sexual Violence / Child Abuse and Neglect Funds $5 ($10); 44 total contributions; 45 = 42 − 44; 46 applied to 2026 estimated tax; 47a refund = 45 − 46; 48 amount you owe = 36 − 41; 49 payment amount (48 plus line 50); 50 estimated tax penalty (Form N-210, 'Do not include on line 42 or 48'); 53-55 Schedule C/E/F GE license questions. ROUNDING: whole dollars ('drop amounts under 50 cents and increase amounts from 50 to 99 cents'). CONFORMITY: IRC as of December 31, 2024 for 2025 (Act 123, SLH 2025; § 235-2.3); Hawaii never adopted the TCJA suspensions (personal exemptions, 2% miscellaneous deductions, § 68, moving expenses, home equity interest, $750,000 mortgage limit, SALT cap), § 199A, § 168(k) bonus depreciation, or the § 86 taxation of Social Security. RESIDENCY: Form N-11 is for full-year residents only; part-year and nonresidents file Form N-15 (not composed); no county or local income tax. DEADLINES: return due April 20, 2026 (automatic six-month extension to October 20, 2026; Tax Announcement 2026-03/04 waived penalties and interest through August 20, 2026 for Kona Low-affected filers); refundable credit claims must be filed within twelve months of year-end. TY2026 (enacted): standard deduction $8,000 / $16,000 / $12,000 / $8,000 (§ 235-2.4(a)(2)(F), Act 46) — version 2; the 2025 rate schedules continue (Act 24, SLH 2026's new tables — 2.5% and 5% low brackets, a 13% bracket over $1,000,000 joint / $750,000 HOH / $500,000 single — 'shall apply to taxable years beginning after December 31, 2026'); IRC conformity as of December 31, 2025 (Act 35, SLH 2026, HB 2329 CD1, approved May 26, 2026, §§ 2-4 'shall apply to taxable years beginning after December 31, 2025') with § 225 qualified overtime and § 163(h)(4) vehicle loan interest decoupled, § 68 'in the form that it existed as of December 31, 2024' at the 2009 thresholds, § 174 as of December 31, 2024, § 168(n) inoperative, the § 67(g) and § 165(h)(5) carve-outs deleted (2%-floor miscellaneous deductions and non-disaster casualty losses end) — DOTAX Announcement 2026-06 (July 31, 2026) states Hawaii 'will conform to IRC section 67(h), which disallows miscellaneous itemized deductions', to 'IRC section 165(h)(5)' (casualty losses only from 'federal or state declared disasters'), to 'IRC section 170, which reinstates the charitable deduction for individuals who do not itemize deductions and imposes a charitable deduction floor', and to 'IRC section 224, which creates a deduction of up to $25,000 for qualified tips', while 'IRC section 225 … qualified overtime compensation' and 'IRC section 163(h) … qualified passenger vehicle loan interest' are not conformed; how the 2026 Form N-11 carries the tips and non-itemizer charitable deductions is unpublished (~December 2026) — the composer stays on the 2025 form. Act 217, SLH 2026 raises the individual housing account deduction to $20,000 / $40,000 joint ($200,000 lifetime) for taxable years beginning after December 31, 2026. The $1,144 exemption, $7,000 disability exemption, food/excise, renters, child care, EITC, and other-state credit amounts are unchanged for 2026; the reserve pay exclusion re-indexes. TY2027: Act 24 rate tables and the § 235-2.4(a)(2)(F) $8,000 standard deduction continue; TY2028 $9,000 / $18,000 / $13,500; TY2030 $10,000 / $20,000 / $15,000; TY2031 $12,000 / $24,000 / $18,000.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      childPassengerRestraintCredit: { value: "2500", type: "money" },
      individualHousingAccountCap: { value: "500000", type: "money" },
      individualHousingAccountCapJoint: { value: "1000000", type: "money" },
      exceptionalTreePerTree: { value: "300000", type: "money" },
      section179Cap: { value: "2500000", type: "money" },
      schoolsFundContribution: { value: "200", type: "money" },
      librariesFundContribution: { value: "500", type: "money" },
      violenceFundsContribution: { value: "500", type: "money" },
      minimumRefundOrCredit: { value: "100", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Hawaii Form N-11 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.hi.income_tax, us.hi.capital_gains_tax, us.hi.standard_deduction, us.hi.itemized_deductions, us.hi.personal_exemption, us.hi.reserve_pay_exclusion, us.hi.food_excise_credit, us.hi.renters_credit, us.hi.child_dependent_care_credit, us.hi.eitc, and us.hi.other_state_credit",
    },
  },

  // ---- TY2026 versions: Act 46, SLH 2024 (§ 235-2.4(a)(2)(F)) and Act 35, SLH 2026 (conformity as of December 31, 2025) ----
  {
    id: "us.hi.standard_deduction",
    version: 2,
    jurisdiction: "us.hi",
    title: "Hawaii standard deduction TY2026 — $8,000 single and MFS, $16,000 MFJ and QSS, $12,000 HOH (§ 235-2.4(a)(2)(F), Act 46, SLH 2024); dependent filers limited to the greater of $500 or earned income (Form N-11 line 23)",
    citation: {
      source: "HRS § 235-2.4(a)(2)(F) as enacted by Act 46, SLH 2024 (HB 2404 CD1, § 1; § 4: 'shall apply to taxable years beginning after December 31, 2023'), re-enacted unchanged by Act 35, SLH 2026 (HB 2329 CD1, § 3); DOTAX Tax Announcement 2024-03",
      section: "§ 235-2.4(a)(2)(F), (a)(3)",
      url: HRS("0002_0004"),
      excerpt:
        "STATUTE (verbatim): '(F) For taxable years beginning after December 31, 2025: (i) $16,000 in the case of a joint return as provided by section 235-93 or a surviving spouse (as defined in section 2(a) of the Internal Revenue Code); (ii) $12,000 in the case of a head of household (as defined in section 2(b) of the Internal Revenue Code); (iii) $8,000 in the case of an individual who is not married and who is not a surviving spouse or head of household; or (iv) $8,000 in the case of a married individual filing a separate return; (G) For taxable years beginning after December 31, 2027: (i) $18,000 …; (ii) $13,500 …; (iii) $9,000 …; (iv) $9,000 …; (H) For taxable years beginning after December 31, 2029: (i) $20,000 …; (ii) $15,000 …; (iii) $10,000 …; (iv) $10,000 …; and (I) For taxable years beginning after December 31, 2030: (i) $24,000 …; (ii) $18,000 …; (iii) $12,000 …; (iv) $12,000'. '(3) Section 63(c)(5) … shall be operative, except that the limitation shall be the greater of $500 or the individual's earned income'. Act 35, SLH 2026 re-enacted § 235-2.4(a) with these amounts unchanged. The 2026 Form N-11 is unpublished — re-verify line 23 when it appears (~December 2026). This version ends 2028-01-01 (the (G) amounts begin TY2028).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { single: { value: "800000", type: "money" }, joint: { value: "1600000", type: "money" }, hoh: { value: "1200000", type: "money" }, dependentMinimum: { value: "50000", type: "money" } },
    formula: (() => {
      const base: Expr = iff(isJoint, money("1600000"), iff(isHoh, money("1200000"), money("800000")));
      const dep = minE(base, maxE(money("50000"), max0(fact("hiEarnedIncome"))));
      return iff(fact("isClaimedAsDependent"), dep, base);
    })(),
  },
  {
    id: "us.hi.itemized_deductions",
    version: 2,
    jurisdiction: "us.hi",
    title: "Hawaii itemized deductions TY2026 — Worksheets A-1 to A-5 as for 2025 (medical over 7.5%, gated state income or sales taxes, mortgage and investment interest, contributions, casualty losses over 10%), miscellaneous deductions not subject to the 2% floor only (Act 35, SLH 2026 dropped the § 67(g) carve-out), and the § 68 limitation at the 2009 thresholds",
    citation: {
      source: "HRS § 235-2.4(b), (j), (k) as amended by Act 35, SLH 2026 (HB 2329 CD1, § 3, applies to taxable years beginning after December 31, 2025)",
      section: "§ 235-2.4(b), (j), (k) (2026)",
      url: "https://www.capitol.hawaii.gov/sessions/session2026/bills/HB2329_CD1_.HTM",
      excerpt:
        "ACT 35, SLH 2026 (HB 2329 CD1, § 3, bracketed text repealed): '[(b) Section 67 (with respect to the 2-percent floor on miscellaneous itemized deductions) of the Internal Revenue Code shall be operative for purposes of this chapter, except that the suspension in section 67(g) shall not be operative for purposes of this chapter. (c)] (b) Section 68 (with respect to the overall limitation on itemized deductions) of the Internal Revenue Code shall be operative in the form that it existed as of December 31, 2024; provided that the thresholds shall be those that were operative for federal tax year 2009'; '(i) Section 163 … except that … (3) Section 163(h)(3)(F) (limiting mortgage interest); (4) Section 163(h)(4) (qualified passenger vehicle loan interest); and …'; '(j) Section 164 … (1) Section 164(b)(6)(B) (limiting the deduction for state and local taxes) and (b)(7) (with respect to applicable limitation amount) shall not be operative …; (2) The deductions under section 164(a)(3) and (b)(5) … shall be operative only for … (A) … a federal adjusted gross income of less than $100,000; (B) … head of household … less than $150,000; and (C) … joint return or as a surviving spouse … less than $200,000'; '[(3) Section 165(h)(5) (relating to the limitation on the deductibility of personal casualty losses that are not attributable to federally declared disasters) shall not be operative for purposes of this chapter;]' (repealed). DOTAX Announcement 2026-06 (verbatim): Hawaii 'will conform to IRC section 67(h), which disallows miscellaneous itemized deductions' and 'to IRC section 165(h)(5), which disallows personal casualty loss deductions, except those attributable to federal or state declared disasters'. With the § 67(g) exception gone, the P.L. 119-21 disallowance ('no miscellaneous itemized deduction shall be allowed') applies to Hawaii for 2026 — hiJobAndMiscExpenses (Worksheet A-6 lines 23-29) is ignored; hiOtherMiscDeductions (deductions not subject to the floor, e.g. gambling losses) continues; casualty losses must now be from federally declared disasters (input responsibility). The 2026 worksheets are unpublished — re-verify (~December 2026).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { medicalFloorBps: { value: "750", type: "int" }, casualtyFloorBps: { value: "1000", type: "int" }, overallLimitationThreshold: { value: "16680000", type: "money" }, overallLimitationThresholdMfs: { value: "8340000", type: "money" } },
    formula: (() => {
      const agi = fact("hiAgi");
      const fagi = fact("hiFederalAgi");
      const l21a = max0(sub(max0(fact("hiMedicalExpenses")), rd(pct(max0(agi), "75", "1000"))));
      const saltLimit: Expr = iff(isJoint, money("20000000"), iff(isHoh, money("15000000"), money("10000000")));
      const salt: Expr = iff(lt(fagi, saltLimit), max0(fact("hiStateLocalIncomeTaxes")), money("0"));
      const l21b = add(salt, max0(fact("hiRealEstateTaxes")), max0(fact("hiPersonalPropertyTaxes")), max0(fact("hiOtherTaxes")));
      const invInt = max0(fact("hiInvestmentInterest"));
      const l21c = add(max0(fact("hiHomeMortgageInterest")), invInt);
      const l21d = max0(fact("hiCharitableContributions"));
      const l21e = max0(sub(max0(fact("hiCasualtyLosses")), rd(pct(max0(agi), "10", "100"))));
      const l30 = max0(fact("hiOtherMiscDeductions"));
      const total = add(l21a, l21b, l21c, l21d, l21e, l30);
      const protectedAmt = add(l21a, invInt, l21e, minE(max0(fact("hiGamblingLossesInMisc")), l30));
      const l5 = rd(pct(max0(sub(total, protectedAmt)), "80", "100"));
      const thr: Expr = iff(isMfs, money("8340000"), money("16680000"));
      const l9 = rd(pct(max0(sub(agi, thr)), "3", "100"));
      const l10 = minE(l5, l9);
      return iff(and(gt(agi, thr), lt(protectedAmt, total)), max0(sub(total, l10)), total);
    })(),
  },
];
