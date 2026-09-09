import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * North Dakota deep pack — TY2025 Form ND-1 (full-year resident). Every amount
 * verified from the 2025 Individual Income Tax Return and Booklet (31 pp), the
 * printed 2025 Form ND-1 (SFN 28702 (12-2025)), the standalone 2025 Tax Tables
 * (tax-tables-2025.pdf), Schedule ND-1SA (SFN 28710 (12-2025)), the 2026 Form
 * ND-1ES (SFN 28709 (12-2025)) and the 2026 Income Tax Withholding Rates
 * booklet, and N.D.C.C. ch. 57-38 at ndlegis.gov.
 *
 * Load-bearing findings:
 *  - North Dakota starts from FEDERAL TAXABLE INCOME (Form 1040 line 15), not
 *    AGI. Federal AGI is captured on ND-1 line 1a but feeds nothing — the chain
 *    is 1b -> 4b -> 18 -> 19 -> 20. There is NO North Dakota standard deduction
 *    and NO personal exemption; § 57-38-30.3(1) says a taxpayer "is only
 *    eligible for those adjustments or credits that are specifically provided
 *    for in this section", and the booklet confirms the starting point
 *    "perpetually conforms to the computation of federal taxable income".
 *  - THREE brackets, the first at ZERO PERCENT (House Bill 1158 of 2023,
 *    S.L. 2023 ch. 527, effective for taxable years beginning after December 31,
 *    2022): 0.00% / 1.95% / 2.50%. The RATES are frozen by statute; only the
 *    bracket thresholds move, re-prescribed annually by the Tax Commissioner
 *    under § 57-38-30.3(1)(g) using the federal IRC § 1(f) cost-of-living
 *    adjustment. The Century Code therefore still prints the 2023 base amounts
 *    ($44,725 single and so on) and will indefinitely — the operative
 *    thresholds come from the Commissioner's published schedules, never from
 *    the code.
 *  - The Tax Table is MANDATORY in its range, not optional: § 57-38-30.3(10)
 *    provides that if the commissioner prescribes tables "the tables must be
 *    followed by every individual, estate, or trust determining a tax under
 *    this section". It runs $40,250 to $100,000 in $50 rows with four columns,
 *    and is the schedule at the row midpoint, half-up — proved on all 1,195
 *    rows in all four columns (4,780 cells) with zero exceptions. Below
 *    $40,250 every column is $0; at $100,000 or more the schedules apply.
 *  - Social Security is FULLY excluded (ND-1 line 15: "the taxable portion of
 *    your Social Security benefits reported on Form 1040 or 1040-SR, line 6b"),
 *    with no cap, no age test and no phase-out. So are military pay and
 *    military retirement benefits. The 40% net long-term capital gain exclusion
 *    survives, and a parallel 40% exclusion applies to qualified dividends.
 *
 * Source defects found and worked around:
 *  - The booklet's married-filing-jointly rate schedule prints "1.95% of amount
 *    over $ 80.975" — a PERIOD where a comma belongs. The standalone tax-tables
 *    PDF and the Department's web page both print $80,975, and the arithmetic
 *    confirms it: (298,075 - 80,975) x 1.95% = 4,233.45, exactly the printed
 *    anchor. $80,975 is encoded.
 *  - The booklet's internal page cross-references disagree with its own
 *    footers: the rate schedules sit on the page footered "North Dakota 27" (PDF
 *    page 29), which the line 22 worksheet's "page 27" cross-reference gets right
 *    but the Tax Table's marginal note ("see page 32") gets wrong. No page number
 *    is relied on here.
 */

const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const minE = (...args: Expr[]): Expr => ({ kind: "min", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** the joint column — the printed footnote sends a qualifying surviving spouse here */
const isJointCol: Expr = ({ kind: "or", args: [isStatus("mfj"), isStatus("qss")] } as Expr);
const isMfs: Expr = isStatus("mfs");
const isHoh: Expr = isStatus("hoh");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents x 10^4) -> whole-dollar money, ONE half-up rounding. Never wrap a
 *  mulRate in roundToDollar: that rounds to cents and then to dollars. */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");

/** one filing status's three-bracket schedule: zero bracket, 1.95%, then the printed anchor + 2.50% */
type Sched = { zeroTop: string; midTop: string; anchorCents: string };
const scheduleTax = (x: Expr, s: Sched): Expr => {
  const mid = dollarsFromScaled(times(sub(x, money(s.zeroTop)), "195"));
  const top = dollarsFromScaled(add(times(money(s.anchorCents), "10000"), times(sub(x, money(s.midTop)), "250")));
  return iff(gt(x, money(s.midTop)), top, iff(gt(x, money(s.zeroTop)), mid, money("0")));
};
type Year = { single: Sched; joint: Sched; mfs: Sched; hoh: Sched };
const byStatus = (x: Expr, y: Year): Expr =>
  iff(isJointCol, scheduleTax(x, y.joint), iff(isMfs, scheduleTax(x, y.mfs), iff(isHoh, scheduleTax(x, y.hoh), scheduleTax(x, y.single))));

const Y2025: Year = {
  single: { zeroTop: "4847500", midTop: "24482500", anchorCents: "382883" }, // $48,475 / $244,825 / $3,828.83
  joint: { zeroTop: "8097500", midTop: "29807500", anchorCents: "423345" }, // $80,975 / $298,075 / $4,233.45
  mfs: { zeroTop: "4047500", midTop: "14902500", anchorCents: "211673" }, // $40,475 / $149,025 / $2,116.73
  hoh: { zeroTop: "6495000", midTop: "27145000", anchorCents: "402675" }, // $64,950 / $271,450 / $4,026.75
};
const Y2026: Year = {
  single: { zeroTop: "4957500", midTop: "25040000", anchorCents: "391609" }, // $49,575 / $250,400 / $3,916.09
  joint: { zeroTop: "8280000", midTop: "30485000", anchorCents: "432998" }, // $82,800 / $304,850 / $4,329.98
  mfs: { zeroTop: "4140000", midTop: "15242500", anchorCents: "216499" }, // $41,400 / $152,425 / $2,164.99
  hoh: { zeroTop: "6640000", midTop: "27760000", anchorCents: "411840" }, // $66,400 / $277,600 / $4,118.40
};

/**
 * Form ND-1 line 20. Below $100,000 the printed Tax Table governs — the same
 * schedule evaluated at the $50-row midpoint. The table starts at $40,250
 * and its first rows print 0 in every column — the first nonzero cell is the
 * 40,500-40,550 row's married-filing-separately $1 ($40,525 midpoint, $50 past
 * that status's $40,475 zero-bracket top). The table's floor is the Commissioner's
 * choice, not a computed boundary. The first nonzero cells in any
 * column; below it every column prints $0, which the zero bracket already gives.
 */
const line20Tax = (x: Expr, y: Year): Expr => {
  const mid = add(mulInt(money("5000"), stepUnits(x, "5000", "floor")), money("2500"));
  const table = byStatus(mid, y);
  return iff(fact("ndUseRateSchedule"), byStatus(x, y), iff(lt(x, money("10000000")), table, byStatus(x, y)));
};

const FORMS = "https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2025-iit/";
const BOOKLET = FORMS + "2025-individual-income-tax-booklet.pdf";
const TABLE_URL = FORMS + "tax-tables-2025.pdf";
const CODE = "https://ndlegis.gov/cencode/t57c38.pdf";

const SCHEDULE_EXCERPT =
  "2025 TAX RATE SCHEDULES (standalone tax-tables-2025.pdf, verbatim): 'If your North Dakota taxable income is $100,000 or more, use the tax rate schedule below for your filing status to calculate your tax.' SINGLE: '$0 to $48,475 — 0.00% of North Dakota taxable income; 48,475 to 244,825 — $0.00 + 1.95% of amount over $48,475; 244,825 — 3,828.83 + 2.50% of amount over 244,825.' MARRIED FILING JOINTLY AND QUALIFYING SURVIVING SPOUSE: '$0 to $80,975 — 0.00%; 80,975 to 298,075 — $0.00 + 1.95% of amount over $80,975; 298,075 — 4,233.45 + 2.50% of amount over 298,075.' MARRIED FILING SEPARATELY: '$0 to $40,475 — 0.00%; 40,475 to 149,025 — $0.00 + 1.95% of amount over $40,475; 149,025 — 2,116.73 + 2.50% of amount over 149,025.' HEAD OF HOUSEHOLD: '$0 to $64,950 — 0.00%; 64,950 to 271,450 — $0.00 + 1.95% of amount over $64,950; 271,450 — 4,026.75 + 2.50% of amount over 271,450.' The printed anchors are the exact 1.95% products where those are whole cents and the rounded product otherwise: (244,825 − 48,475) x 1.95% = 3,828.825 -> $3,828.83; (298,075 − 80,975) x 1.95% = $4,233.45 exactly; (149,025 − 40,475) x 1.95% = 2,116.725 -> $2,116.73; (271,450 − 64,950) x 1.95% = $4,026.75 exactly. BOOKLET DEFECT: the booklet's joint schedule prints 'of amount over $ 80.975' with a PERIOD; the standalone table and the Department's web page print $80,975 and the anchor arithmetic confirms it.";

export const ndRules: Rule[] = [
  {
    id: "us.nd.income_tax",
    version: 1,
    jurisdiction: "us.nd",
    title:
      "North Dakota income tax 2025 — three brackets whose first is 0.00%, then 1.95% and 2.50%, at $48,475 / $244,825 single, $80,975 / $298,075 joint and qualifying surviving spouse, $40,475 / $149,025 married filing separately, $64,950 / $271,450 head of household; the printed Tax Table (row midpoint) below $100,000 (Form ND-1 line 20)",
    citation: {
      source:
        "N.D.C.C. § 57-38-30.3(1) (the three-bracket structure, as enacted by House Bill 1158, S.L. 2023 ch. 527, effective for taxable years beginning after December 31, 2022), (1)(g) (annual re-prescription by the Tax Commissioner under IRC § 1(f)) and (10) (the tax tables must be followed); 2025 Tax Rate Schedules and 2025 Tax Table (tax-tables-2025.pdf); 2025 Individual Income Tax Return and Booklet; printed 2025 Form ND-1 (SFN 28702 (12-2025)) line 20",
      section: "N.D.C.C. § 57-38-30.3(1), (10); Form ND-1 line 20",
      url: TABLE_URL,
      excerpt:
        "STATUTE (§ 57-38-30.3(1), verbatim): 'A tax is hereby imposed for each taxable year upon income earned or received in that taxable year by every resident and nonresident individual, estate, and trust. A taxpayer computing the tax under this section is only eligible for those adjustments or credits that are specifically provided for in this section. … The tax for individuals is equal to North Dakota taxable income multiplied by the rates in the applicable rate schedule in subdivisions a through d corresponding to an individual's filing status used for federal income tax purposes.' INDEXING (§ 57-38-30.3(1)(g), verbatim): 'The tax commissioner shall prescribe new rate schedules that apply in lieu of the schedules set forth in subdivisions a through e. The new schedules must be determined by increasing the minimum and maximum dollar amounts for each income bracket for which a tax is imposed by the cost-of-living adjustment for the taxable year as determined by the secretary of the United States treasury for purposes of section 1(f) of the United States Internal Revenue Code of 1954, as amended. For this purpose, the rate applicable to each income bracket may not be changed'. So the RATES are frozen and only the thresholds move — and the Century Code keeps printing the 2023 base amounts ($44,725 / $225,975 single, $74,750 / $275,100 joint, $37,375 / $137,550 separate, $59,950 / $250,550 head of household) indefinitely. NEVER take the thresholds from the code; take them from the Commissioner's published schedules. TABLE AUTHORITY (§ 57-38-30.3(10), verbatim): 'The tax commissioner may prescribe tax tables, to be used in computing the tax according to subsection 1, if the amounts of the tax tables are based on the tax rates set forth in subsection 1. If prescribed by the tax commissioner, the tables must be followed by every individual, estate, or trust determining a tax under this section.' — mandatory, not optional. " + SCHEDULE_EXCERPT + " TABLE STRUCTURE (verified on the printed table): 1,195 rows of $50 from '40,250 | 40,300 | 0 | 0 | 0 | 0' to '99,950 | 100,000 | 1,004 | 371 | 1,160 | 683', four columns headed 'Single / Married filing jointly * / Married filing separately / Head of household' under the banner 'Your tax is—', with the footnote '*If a Qualifying surviving spouse, use the Married filing jointly column.' Below $40,250 every column is $0. Marginal note: 'If $100,000 or over — use the Tax Rate Schedules on next page.' CONVENTION (verified on ALL 1,195 rows in ALL FOUR columns — 4,780 cells, zero exceptions): each cell is the schedule at the row midpoint (at least + $25), rounded half-up. The booklet's own worked example lands on it: 'a married couple filing jointly with $91,900 of ND taxable income falls in the $91,900 – $91,950 row and owes $214' — midpoint 91,925 gives 1.95% x $10,950 = 213.525 -> $214. The table never reaches the 2.50% bracket, since every 1.95% bracket top exceeds $100,000. ndUseRateSchedule applies the schedule at the exact income instead.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate2Bps: { value: "195", type: "int" },
      rate3Bps: { value: "250", type: "int" },
      zeroTopSingle: { value: "4847500", type: "money" },
      zeroTopJoint: { value: "8097500", type: "money" },
      zeroTopMfs: { value: "4047500", type: "money" },
      zeroTopHoh: { value: "6495000", type: "money" },
      tableTop: { value: "10000000", type: "money" },
    },
    formula: line20Tax(max0(fact("stateTaxableIncome")), Y2025),
  },
  {
    id: "us.nd.income_tax",
    version: 2,
    jurisdiction: "us.nd",
    title:
      "North Dakota income tax TY2026 — the same 0.00% / 1.95% / 2.50% rates on the Commissioner's indexed thresholds: $49,575 / $250,400 single, $82,800 / $304,850 joint and qualifying surviving spouse, $41,400 / $152,425 married filing separately, $66,400 / $277,600 head of household",
    citation: {
      source:
        "2026 Form ND-1ES (SFN 28709 (12-2025)) page 2, '2026 Forms ND-1 and ND-EZ Tax Rate Schedules'; 2026 Income Tax Withholding Rates and Instructions booklet (published December 2025); N.D.C.C. § 57-38-30.3(1)(g)",
      section: "N.D.C.C. § 57-38-30.3(1), (1)(g); 2026 Form ND-1ES page 2",
      url: FORMS + "28709-form-nd-1es-2026.pdf",
      excerpt:
        "2026 FORM ND-1ES (verbatim, '2026 Forms ND-1 and ND-EZ Tax Rate Schedules'): SINGLE '$0 to $49,575 — 0.00% of North Dakota taxable income; 49,575 to 250,400 — 0.00 + 1.95% of amount over $49,575; 250,400 — 3,916.09 + 2.50% of amount over 250,400.' MARRIED FILING JOINTLY AND QUALIFYING SURVIVING SPOUSE '$0 to $82,800 — 0.00%; 82,800 to 304,850 — 0.00 + 1.95% of amount over $82,800; 304,850 — 4,329.98 + 2.50% of amount over 304,850.' MARRIED FILING SEPARATELY '$0 to $41,400 — 0.00%; 41,400 to 152,425 — 0.00 + 1.95% of amount over $41,400; 152,425 — 2,164.99 + 2.50% of amount over 152,425.' HEAD OF HOUSEHOLD '$0 to $66,400 — 0.00%; 66,400 to 277,600 — 0.00 + 1.95% of amount over $66,400; 277,600 — 4,118.40 + 2.50% of amount over 277,600.' Anchor arithmetic: (250,400 − 49,575) x 1.95% = 3,916.0875 -> $3,916.09; (304,850 − 82,800) x 1.95% = 4,329.975 -> $4,329.98; (152,425 − 41,400) x 1.95% = 2,164.9875 -> $2,164.99; (277,600 − 66,400) x 1.95% = $4,118.40 exactly. PARTIAL CORROBORATION: the 2026 Income Tax Withholding Rates booklet's annual payroll tables carry the same rates and two of the bracket WIDTHS — its 'Single person' table runs $57,625 to $258,450 (a width of $200,825, exactly 250,400 − 49,575) with the identical base tax $3,916.09, and its table headed 'Married person' runs $57,500 to $168,525 (width $111,025 = 152,425 − 41,400) with base tax $2,164.99, i.e. the MARRIED FILING SEPARATELY schedule, not the joint one. The withholding booklet therefore corroborates the single and separate schedules only; it nowhere prints $82,800, $304,850, $4,329.98, $66,400, $277,600 or $4,118.40, so the joint and head-of-household TY2026 schedules rest on Form ND-1ES alone (their anchors reproduce arithmetically from the printed thresholds). The withholding thresholds themselves are shifted because they are applied to wages net of allowances. NO RATE CHANGE for 2026 — only the thresholds moved (the zero-bracket top rises $1,100 single, $1,825 joint, $925 separate, $1,450 head of household). The 2026 Form ND-1, its booklet and its Tax Table are NOT yet published, so this rule applies the SCHEDULE at the exact income for every taxable income and does not reproduce an unpublished $50-row table; expect at most the value of half a row of divergence from the eventual printed table, and re-verify when it publishes.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rate2Bps: { value: "195", type: "int" },
      rate3Bps: { value: "250", type: "int" },
      zeroTopSingle: { value: "4957500", type: "money" },
      zeroTopJoint: { value: "8280000", type: "money" },
      zeroTopMfs: { value: "4140000", type: "money" },
      zeroTopHoh: { value: "6640000", type: "money" },
    },
    formula: byStatus(max0(fact("stateTaxableIncome")), Y2026),
  },
  {
    id: "us.nd.capital_gain_exclusion",
    version: 1,
    jurisdiction: "us.nd",
    title: "North Dakota net long-term capital gain exclusion 2025 — 40% of the lesser of federal Schedule D lines 15 and 16, net of any gain already excluded elsewhere (Form ND-1 line 6)",
    citation: {
      source: "N.D.C.C. § 57-38-30.3(2)(d)(1); 2025 Individual Income Tax Booklet page 12 (line 6) and its worksheet on page 13; printed 2025 Form ND-1 line 6",
      section: "N.D.C.C. § 57-38-30.3(2)(d)(1); Form ND-1 line 6",
      url: BOOKLET,
      excerpt:
        "STATUTE (§ 57-38-30.3(2)(d)(1), verbatim): North Dakota taxable income is 'Reduced by forty percent of: (1) The excess of the taxpayer's net long-term capital gain for the taxable year over the net short-term capital loss for that year, as computed for purposes of the Internal Revenue Code of 1986, as amended. The adjustment provided by this subdivision is allowed only to the extent the net long-term capital gain is allocated to this state.' BOOKLET (page 12, verbatim): 'If your federal taxable income includes a net long-term capital gain (including a capital gain distribution from a mutual fund), you may be able to exclude 40 percent of the gain from your North Dakota taxable income. If you were a full-year nonresident or a part-year resident of North Dakota for the year, only a net long-term capital gain reportable to North Dakota is eligible for the exclusion. A net long-term capital gain included in an amount entered on line 7, or 16 of Form ND-1 is not eligible for the exclusion.' WORKSHEET (page 13): line 1 is 2025 Schedule D (Form 1040) line 15 and line 2 is Schedule D line 16, each with 'If zero or less, stop here; no exclusion is allowed'; line 3 is the smaller of the two; a full-year resident carries line 3 to line 5; line 6 removes the portion already included in ND-1 line 7 or 16; line 7 subtracts; line 8 multiplies by 40%. 'Capital gain distribution — If you reported capital gain distributions on Form 1040 or 1040-SR, line 7 (and you did not have to complete Schedule D), skip lines 1 and 2 and enter the distributions on line 3 of this worksheet.' ENCODING: ndNetLongTermCapitalGain is worksheet line 3 (the smaller of Schedule D lines 15 and 16, or the capital gain distributions when no Schedule D was required); ndCapitalGainAlreadyExcluded is worksheet line 6. Both are zero or positive — the worksheet stops outright if either Schedule D figure is zero or less, so a net loss produces no exclusion rather than a negative one.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "40", type: "int" } },
    formula: dollarsFromScaled(times(max0(sub(max0(fact("ndNetLongTermCapitalGain")), max0(fact("ndCapitalGainAlreadyExcluded")))), "4000")),
  },
  {
    id: "us.nd.qualified_dividend_exclusion",
    version: 1,
    jurisdiction: "us.nd",
    title: "North Dakota qualified dividend exclusion 2025 — 40% of the qualified dividends on federal Form 1040 line 3a (Form ND-1 line 13)",
    citation: {
      source: "N.D.C.C. § 57-38-30.3(2)(d)(2); 2025 Individual Income Tax Booklet (line 13); printed 2025 Form ND-1 line 13",
      section: "N.D.C.C. § 57-38-30.3(2)(d)(2); Form ND-1 line 13",
      url: BOOKLET,
      excerpt:
        "STATUTE (§ 57-38-30.3(2)(d)(2), verbatim): North Dakota taxable income is reduced by forty percent of 'Qualified dividends as defined under Internal Revenue Code section 1(h)(11) … but only if taxed at a federal income tax rate that is lower than the regular federal income tax rates applicable to ordinary income. If, for any taxable year, qualified dividends are taxed at the regular federal income tax rates applicable to ordinary income, the reduction allowed under this subdivision is equal to thirty percent of all dividends included in federal taxable income. The adjustment provided by this subdivision is allowed only to the extent the qualified dividend income is allocated to this state.' BOOKLET (line 13): the exclusion is 40% of Form 1040 or 1040-SR LINE 3A; a part-year resident or nonresident takes 40% of the portion reported to North Dakota (Schedule ND-1NR line 2, column B). ENCODING: the 40% branch is applied, which is the operative one for 2025 — qualified dividends were taxed at preferential federal rates. The statute's fallback (30% of ALL dividends, not merely qualified ones, if qualified dividends are ever taxed at ordinary rates) is NOT modelled and would need a new rule version if federal law changed; it is named here so the omission is visible.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "40", type: "int" }, ordinaryRateFallbackPct: { value: "30", type: "int" } },
    formula: dollarsFromScaled(times(max0(fact("ndQualifiedDividends")), "4000")),
  },
  {
    id: "us.nd.college_save_deduction",
    version: 1,
    jurisdiction: "us.nd",
    title: "North Dakota College SAVE contribution deduction 2025 — up to $5,000, or $10,000 on a joint return (Form ND-1 line 12)",
    citation: {
      source: "2025 Individual Income Tax Booklet (line 12); printed 2025 Form ND-1 line 12; N.D.C.C. § 57-38-30.3(2)(m)",
      section: "Form ND-1 line 12",
      url: BOOKLET,
      excerpt:
        "BOOKLET (line 12): the deduction is for contributions to a North Dakota College SAVE account administered by the Bank of North Dakota, capped at $5,000, or $10,000 if married filing jointly. ROLLOVERS FROM ANOTHER SECTION 529 PLAN DO NOT QUALIFY. ENCODING: the doubled cap requires a JOINT return — a qualifying surviving spouse shares the joint RATE column under the table's footnote but is not a joint return for this cap.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "500000", type: "money" }, capJoint: { value: "1000000", type: "money" } },
    formula: minE(max0(fact("ndCollegeSaveContributions")), iff(isStatus("mfj"), money("1000000"), money("500000"))),
  },
  {
    id: "us.nd.marriage_penalty_credit",
    version: 1,
    jurisdiction: "us.nd",
    title:
      "North Dakota marriage penalty credit 2025 — for a joint return with North Dakota taxable income over $81,036 where the lower-earning spouse's qualified income exceeds $47,550: the joint tax less the sum of two single-schedule computations, capped at $312 (Form ND-1 line 22)",
    citation: {
      source: "N.D.C.C. § 57-38-30.3(7); 2025 Individual Income Tax Booklet page 14, Marriage Penalty Credit Worksheet; printed 2025 Form ND-1 line 22",
      section: "N.D.C.C. § 57-38-30.3(7); Form ND-1 line 22",
      url: BOOKLET,
      excerpt:
        "WORKSHEET (2025 booklet, Marriage Penalty Credit Worksheet, verbatim): '1. Is your filing status Married filing jointly? No. Stop; you do not qualify for the credit. Yes. Enter your taxable income from Form ND-1, line 18. 2. Is the amount on line 1 more than $81,036? No. Stop; you do not qualify for the credit. Yes. Go to line 3. 3. a. Enter your qualified income; b. Enter your spouse's qualified income. 4. Enter the smaller of line 3a or line 3b. 5. Is the amount on line 4 more than $47,550? No. Stop; you do not qualify for the credit. Yes. Go to line 6 ... 15,750.00. 6. Subtract line 5 from line 4. 7. Calculate the tax on the amount on line 6 using the Single tax rate schedule. 8. Subtract line 6 from line 1. 9. Calculate the tax on the amount on line 8 using the Single tax rate schedule. 10. Calculate the tax on the amount on line 1 using the Married filing jointly tax rate schedule. 11. Add lines 7 and 9. 12. Subtract line 11 from line 10. If result is zero or less, stop; you do not qualify for the credit. 13. Maximum credit ... 312.00. 14. Enter smaller of line 12 or line 13.' QUALIFIED INCOME (booklet): wages, salaries and tips from Form 1040 line 1z; net self-employment income from Schedule SE line 3 reduced by the Schedule 1 line 15 self-employment tax deduction; and the taxable IRA, pension, annuity and Social Security amounts from lines 4b, 5b and 6b — then 'Reduce this total by amounts entered on Form ND-1, lines 8 and 15' (the Railroad Retirement and Social Security exclusions). Eligibility prose adds the honest warning: 'Although you meet all of the above conditions, your fact situation may not produce a credit under the calculation formula prescribed by law.' THE $15,750 ON LINE 5 IS PREPRINTED and is HALF the federal married-filing-jointly basic standard deduction ($31,500 / 2), per N.D.C.C. § 57-38-01.28(4)(b), which defines the lesser-earning spouse's qualifying income as that income 'minus the sum of: (1) The amount for one exemption under section 151(d) …; and (2) One-half of the amount of the standard deduction under section 63(c)(2)(A)'. The series bears this out: the 2024 worksheet printed 14,600.00 ($29,200 / 2) with a $303 maximum and the 2023 worksheet 13,850.00 ($27,700 / 2). MAXIMUM: § 57-38-01.28(1) sets 'a credit of not to exceed three hundred dollars per couple' and directs the commissioner to adjust it 'each taxable year at the time and rate adjustments are made to rate schedules' — $300 base, $303 for 2024, $312 for 2025. PRINTED INCONSISTENCY, disclosed rather than silently resolved: the worksheet's screening gates do NOT line up with the 2025 bracket boundaries — line 2 gates at $81,036 while the joint zero-bracket top is $80,975, and line 5 gates at $47,550 while the single zero-bracket top is $48,475. A joint filer at, say, $81,000 of taxable income is screened out at line 2 even though the line 12 arithmetic would produce a positive credit. The same mismatch appears in the 2024 and 2023 worksheets, so it is the Commissioner's deliberate screening figure rather than a typo. THE GATES ARE ENCODED AS PRINTED, because they are what the filed worksheet does. ENCODING: this rule takes the three schedule evaluations as computed amounts — ndSingleScheduleTaxA is worksheet line 7 (the tax on the lower qualified income less $15,750) and ndSingleScheduleTaxB is line 9 (the tax on taxable income less that same line 6 amount), both on the SINGLE schedule, and ndJointScheduleTax is line 10 (taxable income on the JOINT schedule) — and applies the two gates, the line 12 subtraction and the $312 cap. The composer runs the three evaluations. Every figure here is a 2025 printed amount that moves with the indexed schedules, so this rule ends 2026-01-01; the 2026 worksheet publishes with the 2026 booklet around December 2026. NOT AT RISK: House Bill 1388 of the 2025 session would have changed the rates and REPEALED § 57-38-01.28 outright, but it failed in the Senate — the credit survives intact.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { maximumCredit: { value: "31200", type: "money" }, taxableIncomeFloor: { value: "8103600", type: "money" }, lowerIncomeFloor: { value: "4755000", type: "money" }, halfJointStandardDeduction: { value: "1575000", type: "money" } },
    formula: (() => {
      const eligible = and(isStatus("mfj"), gt(fact("ndTaxableIncome"), money("8103600")), gt(fact("ndLowerQualifiedIncome"), money("4755000")));
      const excess = max0(sub(max0(fact("ndJointScheduleTax")), add(max0(fact("ndSingleScheduleTaxA")), max0(fact("ndSingleScheduleTaxB")))));
      return iff(eligible, minE(excess, money("31200")), money("0"));
    })(),
  },
  {
    id: "us.nd.other_state_credit",
    version: 1,
    jurisdiction: "us.nd",
    title:
      "North Dakota credit for income tax paid to another state or its local jurisdictions 2025 — the North Dakota tax times the ratio of doubly taxed income to the income base (four decimals, capped at 1), limited to the net income tax actually paid; computed per state (Form ND-1 line 21, Schedule ND-1CR)",
    citation: {
      source: "Schedule ND-1CR (2025), SFN 28721 (12-2025), 'CREDIT FOR INCOME TAX PAID TO ANOTHER STATE OR LOCAL JURISDICTION'; N.D.C.C. § 57-38-30.3; printed 2025 Form ND-1 line 21",
      section: "Schedule ND-1CR; Form ND-1 line 21",
      url: FORMS + "28721-schedule-nd-cr-2025.pdf",
      excerpt:
        "SCHEDULE ND-1CR (verbatim): '1a. Federal adjusted gross income from Form ND-1, line 1a. 1b. How much of the amount on line 1a has its source in the other state? If none, stop here; you are not eligible for this credit. 1c. How much of the amount on line 1b did you (and your spouse, if filing jointly) receive or earn while a resident of North Dakota? If none, stop here. 2. Enter the applicable amount for your residency status — Full-year resident: Enter the amount from Form ND-1, line 1a, less the amount from Form ND-1, line 5. Part-year resident: Enter the amount from Schedule ND-1NR, line 18. 3. Divide line 1c by line 2. Round to nearest four decimal places. If line 1c is equal to or more than line 2, enter 1. 4. North Dakota tax from Form ND-1, line 20. 5. Multiply line 4 by line 3. 6. Enter the amount of income tax paid to the other state and its local jurisdictions. 7. Credit - Enter the smaller of line 5 or line 6. Enter this amount on Form ND-1, line 21.' NET INCOME TAX (instructions): 'Enter on line 6 the amount of net income tax shown on the other state\'s income tax return … \'Net income tax\' means the amount after income tax credits but before withholding and estimated taxes.' PER STATE (verbatim): 'If you paid income tax to more than one other state for the tax year, complete a separate Schedule ND-1CR for each state. If you also paid income tax to a local jurisdiction in another state, include the income tax paid to the local jurisdiction on the Schedule ND-1CR completed for the state in which the local jurisdiction is located. Add the separate credit amounts from all of the Schedule ND-1CR forms and enter the total on Form ND-1, line 21.' — this rule computes ONE state and the composer sums. SCOPE: \'state\' means any of the other 49 states, the District of Columbia and a United States territory; FOREIGN COUNTRIES DO NOT QUALIFY; the credit is not allowed on the strength of withholding or estimated payments alone, since a return must actually be filed in the other state. MONTANA AND MINNESOTA WAGE RECIPROCITY: wages earned there are NOT eligible — the filer takes a refund on that state\'s own return — while non-wage Montana and Minnesota income does use Schedule ND-1CR. ENCODING: the ratio is rounded to FOUR decimal places and capped at 1 exactly as printed, then applied to the line 20 tax with one rounding to whole dollars; the full-year resident base (line 2) is federal AGI less the ND-1 line 5 United States obligation interest. Part-year and nonresident filers use the Schedule ND-1NR line 18 base and the lines 8-11 branch, which is out of scope for this full-year-resident rule.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "4", type: "int" } },
    formula: (() => {
      const base = fact("ndOtherStateIncomeBase");
      const doubled = max0(fact("ndDoublyTaxedIncome"));
      const ratio = minE({ kind: "mulDiv", a: doubled, b: money("10000"), c: base, round: "half-up" }, money("10000"));
      // ONE rounding to whole dollars: scale to cents x 10^4 before applying the ratio
      const share = dollarsFromScaled({ kind: "mulDiv", a: times(max0(fact("ndIncomeTaxBeforeCredits")), "10000"), b: ratio, c: money("10000"), round: "half-up" });
      return iff(gt(base, money("0")), minE(share, max0(fact("ndOtherStateTaxPaid"))), money("0"));
    })(),
  },
  {
    id: "us.nd.parameters",
    version: 1,
    jurisdiction: "us.nd",
    title: "North Dakota 2025 Form ND-1 parameters — line structure, additions and subtractions, credits, and the TY2026 position",
    citation: {
      source:
        "2025 Individual Income Tax Return and Booklet; printed 2025 Form ND-1 (SFN 28702 (12-2025)), Form ND-EZ (SFN 28745 (12-2025)) and Schedule ND-1SA (SFN 28710 (12-2025)); 2025 Tax Tables; 2026 Form ND-1ES; N.D.C.C. ch. 57-38; S.L. 2023 ch. 527 (House Bill 1158); web-verified September 2026",
      section: "Form ND-1 lines 1-37",
      url: BOOKLET,
      excerpt:
        "STRUCTURE (printed 2025 Form ND-1, verbatim): '1. a. Federal adjusted gross income from Form 1040 or 1040-SR, line 11. If zero, enter 0; b. Federal taxable income from Form 1040 or 1040-SR, line 15. If zero, see instructions. Additions: 2. Planned gift or endowment tax credit adjustment to income; 3. Total other additions (Attach Schedule ND-1SA); 4. a. Total additions. Add lines 2 and 3; b. Add lines 1b and 4a. Subtractions: 5. Interest from U.S. obligations; … 17. Total subtractions. Add lines 5 through 16; 18. North Dakota taxable income. Subtract line 17 from line 4b. If less than zero, enter 0.' Then line 19 carries line 18 to page 2, line 20 is the tax, line 21 the credit for tax paid to another state (Schedule ND-1CR), line 22 the marriage penalty credit, line 23 other credits (Schedule ND-1TC), and the payments block runs to line 28; page 2 then prints 29 Overpayment, 30 amount applied to 2026 estimated tax, 31 voluntary contributions, 32 Refund, 33 Tax due, 34 Penalty and Interest, 35 voluntary contributions, 36 Balance due ('Add lines 33, 34, 35, and, if applicable, line 37') and 37 interest on underpaid estimated tax (Schedule ND-1UT) — lines 29, 32 and 33 each carry 'If less than $5.00, enter 0'. LINE 1A IS INFORMATIONAL — federal AGI feeds nothing; the computation chain is 1b -> 4b -> 18 -> 19 -> 20. NEGATIVE FEDERAL TAXABLE INCOME (booklet page 12, verbatim): 'On Form 1040 or 1040-SR, line 15, you are instructed to enter \\'0\\' for your federal taxable income if it calculates out to be less than zero. However, for purposes of completing Form ND-1, enter the negative number on line 1b. Enter a minus sign (-) to the left of the number.' The printed ND-EZ (SFN 28745) line 1b likewise says 'If zero, enter 0', and the booklet's ND-EZ instructions repeat the same direction verbatim — 'for purposes of completing Form ND-EZ, enter the negative number on line 1b' — so a negative federal taxable income is entered on EITHER form and does not by itself require Form ND-1. NO NORTH DAKOTA STANDARD DEDUCTION AND NO PERSONAL EXEMPTION EXIST — the booklet states the starting point 'perpetually conforms to the computation of federal taxable income', so the federal standard deduction, the increased state and local tax deduction and the tips and overtime exclusions all flow through by default. § 57-38-30.3(2)(o) allows a joint filer a reduction for a 'recomputed' standard deduction that doubles the single amount, but post-2017 the federal joint basic standard deduction ALREADY equals twice the single amount, so it computes to zero and no line exists for it on Form ND-1 — a statutory dead letter, not an omission. SUBTRACTIONS (Form ND-1 lines 5-16): interest from U.S. obligations (line 5, an enumerated list that expressly EXCLUDES Freddie Mac, Fannie Mae, Ginnie Mae, federal tax refunds and repurchase agreements); the 40% net long-term capital gain exclusion (6); exempt income of an eligible Native American enrolled member living on a North Dakota reservation all year (7); Railroad Retirement Board benefits (8); the licensed peace officer retirement benefit exclusion for 20 years of service or medical retirement (9); the nonresident Servicemembers Civil Relief Act adjustment (10); the military pay exclusion, uncapped, covering federal pay for training, education, mobilization and bonuses and state pay on state active duty (11); the College SAVE deduction (12); the 40% qualified dividend exclusion (13); the military retirement benefit exclusion, uncapped, covering the retiree or surviving spouse and a dual-status military technician's federal civil-service retirement (14); the SOCIAL SECURITY BENEFIT EXCLUSION (15) — 'Enter on this line the taxable portion of your Social Security benefits reported on Form 1040 or 1040-SR, line 6b', with NO cap, NO age test and NO phase-out, and with Tier 1 Railroad Retirement going to line 8 instead (a filer with both an SSA-1099 and an RRB-1099 splits line 6b between lines 8 and 15 in the ratio of gross benefits of each type to combined gross benefits); and Schedule ND-1SA other subtractions (16). SCHEDULE ND-1SA carries the renaissance zone and new-or-expanding-business exemptions (both requiring a property tax clearance record under § 57-01-15.1), the human organ donor expense deduction of up to $10,000, the employee workforce recruitment exclusion, the STILLBORN CHILD DEDUCTION of $5,241 for 2025 (indexed by the Midwest CPI-U under § 57-38-30.3(2)(p), and requiring the 11-digit fetal death certificate number), the college expense reimbursement deduction, and income from an S corporation taxed as a C corporation. ADDITIONS are only the planned gift or endowment credit adjustment (line 2) and Schedule ND-1SA's lump sum distribution from federal Form 4972 and loss from an S corporation taxed as a C corporation (line 3). SPECIAL COMPUTATIONS out of scope here: Schedule ND-1FA farm income averaging, Schedule ND-1CS sale of a research credit, Schedule ND-1NR for part-year and nonresident filers (§ 57-38-30.3(1)(f) prorates by the ratio of federal AGI allocable to North Dakota over federal AGI from all sources reduced by the (2)(a) and (2)(b) amounts, and a joint return with one full-year resident and one nonresident spouse MUST be computed that way), and the estate and trust schedule in § 57-38-30.3(1)(e) ($3,000 / $10,750 base, $151.13 anchor). TY2026: the rates are unchanged at 0.00% / 1.95% / 2.50% and only the indexed thresholds move — see us.nd.income_tax version 2. § 57-38-30.3(1) was NOT amended in the 2025 regular session or in EITHER 2026 special session. The January 2026 special session (convened January 21, adjourned January 23, called for the Rural Health Transformation Program) produced one taxation chapter, ch. 658 (House Bill 1626), which touches the property tax primary residence credit and the early payment discount and never reaches chapter 57-38. The September 2026 special session (convened September 2 by executive order) was called to regulate kratom; the six measures Legislative Management advanced for it are the kratom bills, a Military Gallery line of credit, a temporary nondisclosure-agreement restriction for data centers and other industrial developments, and a technical correction to a PROPERTY tax credit statement — no individual income tax measure was on its agenda, and chapter 57-38 is untouched. Subsection (2) was last touched by S.L. 2025 ch. 64 (House Bill 1031, Legislative Council technical corrections) and § 57-38-30.3(7)(u) gained an employer child care contribution credit from S.L. 2025 ch. 558 (Senate Bill 2282). The 2026 Form ND-1, its booklet and its Tax Table are not yet published.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      collegeSaveCap: { value: "500000", type: "money" },
      collegeSaveCapJoint: { value: "1000000", type: "money" },
      organDonorCap: { value: "1000000", type: "money" },
      stillbornChildDeduction: { value: "524100", type: "money" },
      marriagePenaltyMaximum: { value: "31200", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: North Dakota Form ND-1 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.nd.income_tax, us.nd.capital_gain_exclusion, us.nd.qualified_dividend_exclusion, us.nd.college_save_deduction, and us.nd.marriage_penalty_credit",
    },
  },
];
