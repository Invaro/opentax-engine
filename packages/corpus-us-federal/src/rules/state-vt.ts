import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Vermont — Form IN-111 personal income tax, tax year 2025.
 *
 * Sources (each read directly; none transcribed from a survey):
 *  - 2025 Form IN-111 (Rev. 10/25) and the 2025 Form IN-111 Instructions
 *    (IN-111-Instr-2025.pdf), tax.vermont.gov/sites/tax/files/documents/
 *  - 2025 Vermont Tax Rate Schedules (TaxRateSched-2025.pdf) and 2025 Vermont
 *    Tax Tables (VermontTaxTables-2025.pdf, 750 rows, $0 to $75,000)
 *  - Schedules IN-112 (adjustments and refundable credits), IN-117 (other-state
 *    credit), IN-119 (adjustments and nonrefundable credits), IN-153 (capital
 *    gains exclusion) and their 2025 instructions
 *  - 32 V.S.A. §§ 5811(21), 5822, 5825, 5828b, 5828c, 5830e, 5830f, 5830g
 *    (legislature.vermont.gov/statutes/section/32/151/NNNNN, curl-able)
 *  - 2025 Act 71 (S.51) via the Department's 2025 Legislative Highlights;
 *    2026 Act 164 (H.933) enrolled text
 *  - GB-1210-2025 and GB-1210-2026 (income tax withholding instructions),
 *    whose annual payroll tables carry the exact statutory bracket values
 *
 * Structure: Vermont taxable income is FEDERAL AGI plus non-Vermont bond
 * interest, less the IN-112 subtractions, less a Vermont standard deduction
 * ($7,650 / $15,300 / $11,450, plus $1,250 per federal age/blind box) and a
 * $5,300 personal exemption per person — there is NO Vermont itemized
 * deduction (only a medical-expense EXCESS subtraction on IN-112 line 11).
 * Four brackets at 3.35% / 6.60% / 7.60% / 8.75%. Below $75,000 the printed
 * Tax Table is mandatory ("TAXABLE INCOME UNDER $75,000 USE THE TAX TABLES");
 * at or above it the rate schedule applies, with its printed whole-dollar
 * "VT Base Tax" anchors. A filer whose federal AGI exceeds $150,000 pays at
 * least 3% of federal AGI less U.S. obligation interest (§ 5822(a)(6), as the
 * booklet applies it).
 *
 * Tax Table convention, PROVED on all 3,000 printed cells (750 rows x 4
 * columns): the rate schedule with its PRINTED whole-dollar anchors ($1,655
 * single, $1,382 separate, $2,218 head of household — each the half-up
 * rounding of the exact cumulative tax at the bracket floor) evaluated at the
 * $100-row midpoint, rounded half-up — 2,996 of 3,000 cells; the four
 * remaining cells are the first row (0 to 100), which prints $0 where the
 * arithmetic gives $2. At the 154 cells where the printed anchor and the exact
 * schedule disagree, the table follows the printed anchor at every one.
 *
 * Printed-schedule artifacts encoded as printed:
 *  - Every "VT Base Tax" is the half-up rounding of the EXACT cumulative tax
 *    at that threshold (GB-1210's annual tables print the unrounded values:
 *    1,654.90 / 6,294.70 / 16,174.70 single; 2,763.75 / 10,482.45 / 18,428.25
 *    joint), so the schedule above $75,000 is anchor + rate x excess.
 *  - The schedule prints a split row at $75,000 in every column. For married
 *    filing separately the row "over 41,250 but not over 75,000" gives
 *    1,382 + 6.6% x 33,750 = 3,609.50 -> $3,610 at exactly $75,000, while the
 *    "over 75,000" row's printed base is $3,609 (the half-up rounding of the
 *    exact 3,609.375). Read literally, the tax steps DOWN by $1 between
 *    $75,000.00 and $75,000.01. This rule reads the rows literally ("over"
 *    is strict), so it reproduces the $3,610 at exactly $75,000.
 *
 * Source conflicts, disclosed rather than silently resolved:
 *  - § 5822(a)(6) says the minimum is "three percent of the taxpayer's federal
 *    adjusted gross income"; the Form IN-111 line 8 instruction and the rate
 *    schedule footnote say "3% of your federal AGI less interest from U.S.
 *    obligations". The booklet governs the filed return and is encoded.
 *  - § 5811(21)(C)(i) grants a personal exemption "for the spouse or the
 *    deceased spouse of the taxpayer whose filing status ... is married filing
 *    a joint return or surviving spouse"; the Form IN-111 line 5b instruction
 *    says "Do not enter '1' if your filing status is Qualifying Widow(er) or
 *    Married Filing Separately". The form governs: a qualifying surviving
 *    spouse gets the joint standard deduction and the joint rate column but
 *    NO spouse exemption.
 */

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
const maxE = (a: Expr, b: Expr): Expr => iff(gt(a, b), a, b);
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** the joint column — "Married Filing Jointly; Qualifying Widow(er); or Civil Union Filing Jointly" (Schedule Y-1 and the table's footnote) */
const isJointCol: Expr = or(isStatus("mfj"), isStatus("qss"));
const isMfj: Expr = isStatus("mfj");
const isMfs: Expr = isStatus("mfs");
const isHoh: Expr = isStatus("hoh");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents x 10^4) -> whole-dollar money, ONE half-up rounding. Never wrap a
 *  mulRate in roundToDollar: that rounds to cents and then to dollars. */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** base (cents) x a hundredths ratio r (0..100 in cents units) -> whole dollars, ONE rounding */
const applyRatio2 = (base: Expr, r: Expr): Expr => times({ kind: "mulDiv", a: base, b: r, c: money("10000"), round: "half-up" }, "100");

/** one printed rate-schedule row: "VT Base Tax" anchor plus the rate on the amount over the row's floor */
type Row = { overCents: string; baseCents: string; rateBps: string };
const rowTax = (x: Expr, r: Row): Expr => dollarsFromScaled(add(times(money(r.baseCents), "10000"), times(sub(x, money(r.overCents)), r.rateBps)));
/** the printed schedule read literally: the LAST row whose "over" amount is strictly below x */
const scheduleTax = (x: Expr, rows: Row[]): Expr => {
  let expr: Expr = rowTax(x, rows[0]);
  for (let i = 1; i < rows.length; i++) expr = iff(gt(x, money(rows[i].overCents)), rowTax(x, rows[i]), expr);
  return expr;
};

/** 2025 Vermont Tax Rate Schedules, verbatim (TaxRateSched-2025.pdf; identical on booklet p. 18) */
const SCHED_2025: Record<"single" | "joint" | "mfs" | "hoh", Row[]> = {
  // Schedule X — Single
  single: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "4940000", baseCents: "165500", rateBps: "660" }, // 49,400 / 1,655.00
    { overCents: "7500000", baseCents: "334500", rateBps: "660" }, // 75,000 / 3,345.00 (the printed split row)
    { overCents: "11970000", baseCents: "629500", rateBps: "760" }, // 119,700 / 6,295.00
    { overCents: "24970000", baseCents: "1617500", rateBps: "875" }, // 249,700 / 16,175.00
  ],
  // Schedule Y-1 — Married Filing Jointly; Qualifying Widow(er); Civil Union Filing Jointly
  joint: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "7500000", baseCents: "251300", rateBps: "335" }, // 75,000 / 2,513.00 (split row, still 3.35%)
    { overCents: "8250000", baseCents: "276400", rateBps: "660" }, // 82,500 / 2,764.00
    { overCents: "19945000", baseCents: "1048200", rateBps: "760" }, // 199,450 / 10,482.00
    { overCents: "30400000", baseCents: "1842800", rateBps: "875" }, // 304,000 / 18,428.00
  ],
  // Schedule Y-2 — Married Filing Separately; Civil Union Filing Separately
  mfs: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "4125000", baseCents: "138200", rateBps: "660" }, // 41,250 / 1,382.00
    { overCents: "7500000", baseCents: "360900", rateBps: "660" }, // 75,000 / 3,609.00 (split row)
    { overCents: "9972500", baseCents: "524100", rateBps: "760" }, // 99,725 / 5,241.00
    { overCents: "15200000", baseCents: "921400", rateBps: "875" }, // 152,000 / 9,214.00
  ],
  // Schedule Z — Heads of Household
  hoh: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "6620000", baseCents: "221800", rateBps: "660" }, // 66,200 / 2,218.00
    { overCents: "7500000", baseCents: "279900", rateBps: "660" }, // 75,000 / 2,799.00 (split row)
    { overCents: "17100000", baseCents: "913500", rateBps: "760" }, // 171,000 / 9,135.00
    { overCents: "27685000", baseCents: "1717900", rateBps: "875" }, // 276,850 / 17,179.00
  ],
};
type Year = Record<"single" | "joint" | "mfs" | "hoh", Row[]>;
const byStatus = (x: Expr, y: Year = SCHED_2025): Expr =>
  iff(isJointCol, scheduleTax(x, y.joint), iff(isMfs, scheduleTax(x, y.mfs), iff(isHoh, scheduleTax(x, y.hoh), scheduleTax(x, y.single))));

/** "2026 Preliminary Vermont Tax Rates" — 2026 Form IN-114 Instructions (IN-114-Instr-2026.pdf, Rev. 10/25) p. 2,
 *  verbatim. Every base is again the half-up rounding of the exact cumulative tax (50,750 x 3.35% = 1,700.125 ->
 *  1,700; GB-1210-2026's annual withholding table prints the unrounded 1,700.13 / 6,458.73 / 16,600.93 and
 *  2,837.45 / 10,760.75 / 18,915.55). No 2026 Tax Table exists yet, so there is no $75,000 split row. */
const SCHED_2026: Year = {
  single: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "5075000", baseCents: "170000", rateBps: "660" }, // 50,750 / 1,700.00
    { overCents: "12285000", baseCents: "645900", rateBps: "760" }, // 122,850 / 6,459.00
    { overCents: "25630000", baseCents: "1660100", rateBps: "875" }, // 256,300 / 16,601.00
  ],
  joint: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "8470000", baseCents: "283700", rateBps: "660" }, // 84,700 / 2,837.00
    { overCents: "20475000", baseCents: "1076100", rateBps: "760" }, // 204,750 / 10,761.00
    { overCents: "31205000", baseCents: "1891600", rateBps: "875" }, // 312,050 / 18,916.00
  ],
  mfs: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "4235000", baseCents: "141900", rateBps: "660" }, // 42,350 / 1,419.00
    { overCents: "10237500", baseCents: "538000", rateBps: "760" }, // 102,375 / 5,380.00
    { overCents: "15602500", baseCents: "945800", rateBps: "875" }, // 156,025 / 9,458.00
  ],
  hoh: [
    { overCents: "0", baseCents: "0", rateBps: "335" },
    { overCents: "6800000", baseCents: "227800", rateBps: "660" }, // 68,000 / 2,278.00
    { overCents: "17550000", baseCents: "937300", rateBps: "760" }, // 175,500 / 9,373.00
    { overCents: "28415000", baseCents: "1763000", rateBps: "875" }, // 284,150 / 17,630.00
  ],
};

/** Form IN-111 line 8: the Tax Table under $75,000 (the $100 row's midpoint through the printed
 *  schedule; the first row prints $0), the rate schedule at $75,000 or more; vtUseRateSchedule
 *  applies the schedule at the exact income. */
const line8Tax = (x: Expr): Expr => {
  const mid = add(mulInt(money("10000"), stepUnits(x, "10000", "floor")), money("5000"));
  const table = iff(lt(x, money("10000")), money("0"), byStatus(mid));
  return iff(fact("vtUseRateSchedule"), byStatus(x), iff(lt(x, money("7500000")), table, byStatus(x)));
};

const FORMS = "https://tax.vermont.gov/sites/tax/files/documents/";
const BOOKLET = FORMS + "IN-111-Instr-2025.pdf";
const VSA = (s: string) => `https://legislature.vermont.gov/statutes/section/32/151/${s}`;

/** § 5830e(a)-(c) retirement thresholds: joint $70,000 / $80,000; every other status $55,000 / $65,000 */
const retireFull: Expr = iff(isMfj, money("7000000"), money("5500000"));
const retireNone: Expr = iff(isMfj, money("8000000"), money("6500000"));

export const vtRules: Rule[] = [
  {
    id: "us.vt.income_tax",
    version: 1,
    jurisdiction: "us.vt",
    title:
      "Vermont income tax 2025 — Form IN-111 line 8: the Tax Table below $75,000 ($100-row midpoint through the printed rate schedule), the rate schedule with its printed VT Base Tax anchors at $75,000 or more (3.35% / 6.60% / 7.60% / 8.75%), and the 3%-of-federal-AGI minimum when federal AGI exceeds $150,000",
    citation: {
      source:
        "32 V.S.A. § 5822(a) (rates and the (a)(6) minimum), § 5822(b)(2) (annual inflation adjustment by the Commissioner); 2025 Vermont Tax Rate Schedules (TaxRateSched-2025.pdf); 2025 Vermont Tax Tables (VermontTaxTables-2025.pdf, 5 pages, 750 rows); 2025 Form IN-111 Instructions p. 6, line 8",
      section: "32 V.S.A. § 5822(a); Form IN-111 line 8",
      url: FORMS + "TaxRateSched-2025.pdf",
      excerpt:
        "2025 VERMONT TAX RATE SCHEDULES (verbatim): 'Single Individuals, Schedule X — If VT Taxable Income is Over / But Not Over / VT Base Tax is / Plus / of the amount over: 0 / 49,400 / 0.00 / 3.35% / 0; 49,400 / 75,000 / 1,655.00 / 6.60% / 49,400; TAXABLE INCOME UNDER $75,000 USE THE TAX TABLES; 75,000 / 119,700 / 3,345.00 / 6.60% / 75,000; 119,700 / 249,700 / 6,295.00 / 7.60% / 119,700; 249,700 / - / 16,175.00 / 8.75% / 249,700.' 'Married Filing Jointly, Schedule Y-1 — Use if your filing status is: Married Filing Jointly; Qualifying Widow(er); or Civil Union Filing Jointly: 0 / 75,000 / 0.00 / 3.35% / 0; 75,000 / 82,500 / 2,513.00 / 3.35% / 75,000; 82,500 / 199,450 / 2,764.00 / 6.60% / 82,500; 199,450 / 304,000 / 10,482.00 / 7.60% / 199,450; 304,000 / - / 18,428.00 / 8.75% / 304,000.' 'Married Filing Separately, Schedule Y-2: 0 / 41,250 / 0.00 / 3.35%; 41,250 / 75,000 / 1,382.00 / 6.60% / 41,250; 75,000 / 99,725 / 3,609.00 / 6.60% / 75,000; 99,725 / 152,000 / 5,241.00 / 7.60% / 99,725; 152,000 / - / 9,214.00 / 8.75% / 152,000.' 'Heads of Household, Schedule Z: 0 / 66,200 / 0.00 / 3.35%; 66,200 / 75,000 / 2,218.00 / 6.60% / 66,200; 75,000 / 171,000 / 2,799.00 / 6.60% / 75,000; 171,000 / 276,850 / 9,135.00 / 7.60% / 171,000; 276,850 / - / 17,179.00 / 8.75% / 276,850.' WORKED EXAMPLE (verbatim): 'Vermont Taxable Income is $85,000 (Form IN-111, Line 7). Filing Status is Married Filing Jointly. Use Schedule Y-1. Base Tax is $2,764. Subtract $82,500 from $85,000. Multiply the result ($2,500) by 6.6%. Add this amount ($165) to Base Tax ($2,764) for Vermont Tax of $2,929.' FOOTNOTE (verbatim): 'For Adjusted Gross Incomes (IN-111, Line 1) exceeding $150,000, Line 8 is the greater of 1) 3% of Adjusted Gross Income less interest from U.S. obligations, or 2) Tax Rate Schedule calculation.' BOOKLET LINE 8 (p. 6, verbatim): 'Taxpayers who have a federal Adjusted Gross Income (AGI) greater than $150,000 must pay a minimum Vermont tax of 3% of federal AGI. If your federal AGI, Line 1, is greater than $150,000, enter the amount that is higher: 1) 3% of your federal AGI less interest from U.S. obligations, or 2) tax calculated on Vermont Taxable Income, Line 7, using the applicable tax rate schedule. If your federal AGI, Line 1, is less than or equal to $150,000, calculate your Vermont tax on Vermont Taxable Income, Line 7, using the applicable tax table or rate schedule.' READ LITERALLY: the over-$150,000 branch names only the RATE SCHEDULE, and the schedule page's footnote likewise says 'Tax Rate Schedule calculation', so for a filer with federal AGI over $150,000 the tax is the greater of the 3% floor and the schedule at the exact taxable income even below $75,000 — the Tax Table (which differs from the schedule by up to $4 in that range) is used only at or below $150,000 of AGI. STATUTE (§ 5822(a)(6), verbatim): 'If the federal adjusted gross income of the taxpayer exceeds $150,000.00, then the tax calculated under this subsection shall be the greater of the tax calculated under subdivisions (1)-(5) of this subsection or three percent of the taxpayer's federal adjusted gross income.' — the statute says 3% of federal AGI; the booklet and schedule footnote subtract U.S. obligation interest first. The booklet governs the filed return and is encoded (vtUsObligationInterest). TAX TABLE: 750 rows of $100 from $0 to $75,000 in four columns (Single; Married filing jointly*; Married filing separately**; Head of household), footnoted '* This column also applies to qualifying widow(er) and civil union filing jointly status' and '** This column also applies to civil union filing separately status'. CONVENTION, proved on all 3,000 cells: the schedule with its PRINTED whole-dollar anchors evaluated at the row midpoint, rounded half-up (2,996 cells); the first row 0-100 prints 0 in every column where the arithmetic gives 2 (4 cells). At the 154 cells where the printed anchor and the exact cumulative schedule give different dollars, the table follows the printed anchor at all 154. ANCHORS: every printed 'VT Base Tax' is the half-up rounding of the exact cumulative tax at the threshold — GB-1210-2025's annual withholding table prints the unrounded values 1,654.90 / 6,294.70 / 16,174.70 (single) and 2,763.75 / 10,482.45 / 18,428.25 (married), and 41,250 x 3.35% = 1,381.875 -> 1,382, 66,200 x 3.35% = 2,217.70 -> 2,218. SPLIT-ROW ARTIFACT, encoded as printed: at exactly $75,000 a married-filing-separately filer is in the row 'over 41,250 but not over 75,000' (1,382 + 6.6% x 33,750 = 3,609.50 -> $3,610) while one dollar more is in the row 'over 75,000' whose printed base is $3,609 (exact 3,609.375 rounded), so the literal schedule steps down $1 between $75,000.00 and $75,000.01; the single, joint and head-of-household split rows are continuous (3,344.60 -> 3,345; 2,512.50 -> 2,513; 2,798.80 -> 2,799). ROUNDING: whole dollars, one half-up rounding per printed box. INDEXATION: § 5822(b)(2) directs the Commissioner to adjust the bracket amounts annually by the CPI-U; the codified § 5822(a) still prints the base amounts ($38,700 / $93,700 / $195,450 single) and always will, so the operative thresholds exist only in the Department's published schedules. TY2026: the Department has not published the 2026 IN-111 rate schedule or table (both ~December 2026); GB-1210-2026's annual withholding tables imply single brackets of $50,750 / $122,850 / $256,300 and joint $84,700 / $204,750 / $312,050 (the printed thresholds less the printed offsets of half and three-quarters of the standard deduction, a construction that reproduces every 2025 threshold exactly), and the 2026 Form IN-114 Instructions print '2026 Preliminary Vermont Tax Rates' for all four statuses, encoded as version 2 of this rule; this version ends 2026-01-01 because the Tax Table it applies is the 2025 table.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "335", type: "int" },
      rate2Bps: { value: "660", type: "int" },
      rate3Bps: { value: "760", type: "int" },
      rate4Bps: { value: "875", type: "int" },
      tableTop: { value: "7500000", type: "money" },
      singleBracket1: { value: "4940000", type: "money" },
      singleBracket2: { value: "11970000", type: "money" },
      singleBracket3: { value: "24970000", type: "money" },
      jointBracket1: { value: "8250000", type: "money" },
      jointBracket2: { value: "19945000", type: "money" },
      jointBracket3: { value: "30400000", type: "money" },
      mfsBracket1: { value: "4125000", type: "money" },
      mfsBracket2: { value: "9972500", type: "money" },
      mfsBracket3: { value: "15200000", type: "money" },
      hohBracket1: { value: "6620000", type: "money" },
      hohBracket2: { value: "17100000", type: "money" },
      hohBracket3: { value: "27685000", type: "money" },
      minimumTaxAgiThreshold: { value: "15000000", type: "money" },
      minimumTaxRateBps: { value: "300", type: "int" },
    },
    formula: (() => {
      const x = max0(fact("stateTaxableIncome"));
      const agi = fact("vtFederalAgi");
      const floor3 = dollarsFromScaled(times(max0(sub(agi, max0(fact("vtUsObligationInterest")))), "300"));
      // Booklet line 8: above $150,000 of federal AGI, "enter the amount that is higher: 1) 3% of your
      // federal AGI less interest from U.S. obligations, or 2) tax calculated on Vermont Taxable Income,
      // Line 7, using the applicable tax RATE SCHEDULE" — the Tax Table is named only in the
      // "less than or equal to $150,000" sentence, so the schedule applies at any taxable income there.
      return iff(gt(agi, money("15000000")), maxE(byStatus(x), floor3), line8Tax(x));
    })(),
  },
  {
    id: "us.vt.income_tax",
    version: 2,
    jurisdiction: "us.vt",
    title:
      "Vermont income tax TY2026 (preliminary) — the same 3.35% / 6.60% / 7.60% / 8.75% rates on the Commissioner's indexed brackets: $50,750 / $122,850 / $256,300 single, $84,700 / $204,750 / $312,050 joint and qualifying widow(er), $42,350 / $102,375 / $156,025 married filing separately, $68,000 / $175,500 / $284,150 head of household; schedule only, and the 3%-of-AGI minimum above $150,000",
    citation: {
      source: "2026 Form IN-114 Instructions (IN-114-Instr-2026.pdf, Rev. 10/25) p. 2, '2026 Preliminary Vermont Tax Rates'; corroborated by the 2026 Income Tax Withholding Instructions (GB-1210-2026) annual payroll tables; 32 V.S.A. § 5822(a), (b)(2)",
      section: "32 V.S.A. § 5822(a); 2026 Form IN-114 Instructions p. 2",
      url: FORMS + "IN-114-Instr-2026.pdf",
      excerpt:
        "2026 PRELIMINARY VERMONT TAX RATES (verbatim): 'Single Individuals, Schedule X — 0 / 50,750 / 0.00 / 3.35% / 0; 50,750 / 122,850 / 1,700.00 / 6.60% / 50,750; 122,850 / 256,300 / 6,459.00 / 7.60% / 122,850; 256,300 / - / 16,601.00 / 8.75% / 256,300.' 'Married Filing Jointly, Schedule Y-1 — Use if your filing status is: Married Filing Jointly; Qualifying Widow(er) or Civil Union Filing Jointly — 0 / 84,700 / 0.00 / 3.35% / 0; 84,700 / 204,750 / 2,837.00 / 6.60% / 84,700; 204,750 / 312,050 / 10,761.00 / 7.60% / 204,750; 312,050 / - / 18,916.00 / 8.75% / 312,050.' 'Married Filing Separately, Schedule Y-2 — 0 / 42,350 / 0.00 / 3.35%; 42,350 / 102,375 / 1,419.00 / 6.60% / 42,350; 102,375 / 156,025 / 5,380.00 / 7.60% / 102,375; 156,025 / - / 9,458.00 / 8.75% / 156,025.' 'Heads of Household, Schedule Z — 0 / 68,000 / 0.00 / 3.35%; 68,000 / 175,500 / 2,278.00 / 6.60% / 68,000; 175,500 / 284,150 / 9,373.00 / 7.60% / 175,500; 284,150 / - / 17,630.00 / 8.75% / 284,150.' CORROBORATION: GB-1210-2026's annual withholding tables run single $3,925 to $54,675 at 3.35% then $1,700.13 + 6.60% to $126,775, $6,458.73 + 7.60% to $260,225, $16,600.93 + 8.75% — each threshold is the schedule bracket plus a $3,925 offset (half the standard deduction, exactly as the 2025 table's $3,825 offset is half of $7,650), and married $11,775 to $96,475, $2,837.45 + 6.60% to $216,525, $10,760.75 + 7.60% to $323,825, $18,915.55 + 8.75% (offset $11,775, three-quarters of the standard deduction, as 2025's $11,475 is three-quarters of $15,300). Every preliminary base is the half-up rounding of those exact figures (1,700.125 -> 1,700; 2,837.45 -> 2,837). ENCODING: the schedule with its printed whole-dollar bases applied at the exact income — the 2025 filed-return convention — for every status; no 2026 Tax Table exists, so nothing below $75,000 is a table lookup, and there is no $75,000 split row. The $150,000 minimum-tax threshold in § 5822(a)(6) is a fixed statutory amount outside the § 5822(b)(2) indexation and carries over unchanged. LABELLED PRELIMINARY by the Department: re-verify against the 2026 Form IN-111 rate schedule and Tax Table when they publish (~December 2026), and expect at most half a row of divergence from the eventual table below $75,000.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "335", type: "int" },
      rate2Bps: { value: "660", type: "int" },
      rate3Bps: { value: "760", type: "int" },
      rate4Bps: { value: "875", type: "int" },
      singleBracket1: { value: "5075000", type: "money" },
      singleBracket2: { value: "12285000", type: "money" },
      singleBracket3: { value: "25630000", type: "money" },
      jointBracket1: { value: "8470000", type: "money" },
      jointBracket2: { value: "20475000", type: "money" },
      jointBracket3: { value: "31205000", type: "money" },
      mfsBracket1: { value: "4235000", type: "money" },
      mfsBracket2: { value: "10237500", type: "money" },
      mfsBracket3: { value: "15602500", type: "money" },
      hohBracket1: { value: "6800000", type: "money" },
      hohBracket2: { value: "17550000", type: "money" },
      hohBracket3: { value: "28415000", type: "money" },
      minimumTaxAgiThreshold: { value: "15000000", type: "money" },
      minimumTaxRateBps: { value: "300", type: "int" },
    },
    formula: (() => {
      const x = max0(fact("stateTaxableIncome"));
      const agi = fact("vtFederalAgi");
      const floor3 = dollarsFromScaled(times(max0(sub(agi, max0(fact("vtUsObligationInterest")))), "300"));
      return iff(gt(agi, money("15000000")), maxE(byStatus(x, SCHED_2026), floor3), byStatus(x, SCHED_2026));
    })(),
  },
  {
    id: "us.vt.standard_deduction",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont standard deduction 2025 — $7,650 single and married filing separately, $15,300 married filing jointly and qualifying widow(er), $11,450 head of household, plus $1,250 for each federal age-65/blind box (Form IN-111 line 4)",
    citation: {
      source: "32 V.S.A. § 5811(21)(C)(ii)-(iii) and (D); 2025 Form IN-111 filing status box and line 4 chart; 2025 Form IN-111 Instructions p. 6, line 4",
      section: "32 V.S.A. § 5811(21)(C)(ii), (iii); Form IN-111 line 4",
      url: BOOKLET,
      excerpt:
        "STATUTE (§ 5811(21)(C), verbatim): taxable income is decreased by '(ii) a standard deduction determined as follows: (I) for taxpayers whose filing status under section 5822 of this chapter is unmarried (other than surviving spouses or heads of households) or married filing separate returns, $6,000.00; (II) for taxpayers whose filing status under section 5822 of this chapter is head of household, $9,000.00; and (III) for taxpayers whose filing status under section 5822 of this chapter is married filing joint return or surviving spouse, $12,000.00; (iii) an additional deduction of $1,000.00 for each federal deduction under 26 U.S.C. § 63(f) that the taxpayer qualified for and received' — '(D) The dollar amounts ... shall be adjusted annually for inflation by the Commissioner of Taxes beginning with taxable year 2018'. PRINTED FORM (filing status box, verbatim): 'Single ($7,650) / Married/CU Filing Jointly ($15,300) / Married/CU Filing Separately ($7,650) / Head of Household ($11,450) / Qualifying Widow(er) ($15,300)'. BOOKLET LINE 4 (verbatim): 'Enter the amount of standard deduction from the chart below. You also receive an additional deduction of $1,250 for each standard deduction box checked on the federal Form 1040. If you or your spouse was born before Jan. 2, 1961, or you were blind, use the number of standard deduction boxes checked on your federal Form 1040, select the corresponding number to the filing status and enter on Line 4.' CHART (verbatim, 'Standard / For those born before Jan. 2, 1961 or blind: 1 / 2 / 3 / 4'): 'Single 7,650 / 8,900 / 10,150 / n/a / n/a; Married Filing Jointly or Qualifying Widow(er) 15,300 / 16,550 / 17,800 / 19,050 / 20,300; Married Filing Separately 7,650 / 8,900 / 10,150 / 11,400 / 12,650; Head of Household 11,450 / 12,700 / 13,950 / n/a / n/a'. ENCODING: base by status plus $1,250 per box, boxes capped at the chart's columns as printed — two for single and head of household, four for the 'Married Filing Jointly or Qualifying Widow(er)' row and for married filing separately (a qualifying widow(er)'s federal Form 1040 can carry at most two boxes, so the third and fourth columns are reachable only on a joint return). Vermont has NO itemized deduction: the only itemized-type item is the medical-expense excess on Schedule IN-112 line 11. TY2026: § 5811(21)(D) indexes these amounts; GB-1210-2026's annual withholding offsets ($3,925 single, $11,775 married — half and three-quarters of the standard deduction, a construction that reproduces the 2025 offsets $3,825 and $11,475 exactly) imply $7,850 and $15,700, but the 2026 head-of-household amount and the 2026 per-box amount are unpublished, so this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { single: { value: "765000", type: "money" }, joint: { value: "1530000", type: "money" }, hoh: { value: "1145000", type: "money" }, perBox: { value: "125000", type: "money" } },
    formula: (() => {
      const base = iff(isJointCol, money("1530000"), iff(isHoh, money("1145000"), money("765000")));
      const cap = iff(or(isJointCol, isMfs), int("4"), int("2"));
      const boxes = minE(fact("vtAdditionalDeductionBoxes"), cap);
      return add(base, mulInt(money("125000"), boxes));
    })(),
  },
  {
    id: "us.vt.personal_exemption",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont personal exemption 2025 — $5,300 per exemption: yourself unless claimable as a dependent, a spouse on a joint return only, and each other dependent (Form IN-111 line 5e)",
    citation: {
      source: "32 V.S.A. § 5811(21)(C)(i) and (D); 2025 Form IN-111 lines 5a-5e; 2025 Form IN-111 Instructions p. 6, lines 5a-5e",
      section: "32 V.S.A. § 5811(21)(C)(i); Form IN-111 line 5",
      url: BOOKLET,
      excerpt:
        "STATUTE (§ 5811(21)(C)(i), verbatim): 'a personal exemption of $4,150.00 per person for the taxpayer, for the spouse or the deceased spouse of the taxpayer whose filing status under section 5822 of this chapter is married filing a joint return or surviving spouse, and for each individual qualifying as a dependent of the taxpayer under 26 U.S.C. § 152, provided that no exemption may be claimed for an individual who is a dependent of another taxpayer' (indexed under (D)). PRINTED FORM (verbatim): '5a. Enter \"1\" for yourself if no one can claim you as a dependent; 5b. Enter \"1\" for your jointly filed spouse; 5c. Enter number of OTHER dependents; 5d. Total Exemptions (ADD Lines 5a through 5c); 5e. MULTIPLY Line 5d by $5,300 (2025 Personal Exemption)'. BOOKLET (verbatim): 'Line 5a Yourself. Enter \"1\" on this line if no one can claim you as a dependent on a 2025 personal income tax return. Line 5b Spouse or Civil Union Partner. Enter \"1\" on this line as long as no other person can claim your spouse or civil union partner as a dependent on a 2025 personal income tax return. Do not enter \"1\" if your filing status is Qualifying Widow(er) or Married Filing Separately. Line 5c Other Dependents. Enter the number of dependents other than yourself or spouse that you are claiming on your 2025 federal Form 1040.' SOURCE CONFLICT, disclosed: the statute's 'deceased spouse ... surviving spouse' language would give a qualifying widow(er) a second exemption; the form instruction forbids it. The FORM governs the filed return and is encoded — the composer counts a spouse only on a joint return. This rule takes the count (vtExemptions) and multiplies. TY2026: GB-1210-2026 prints 'one withholding allowance equals $5400.00' where GB-1210-2025 printed $5,300.00 (the 2025 exemption), so the 2026 exemption is $5,400; it is not encoded as a version because the companion 2026 deduction and rate figures are unpublished and a return cannot be composed without them.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "530000", type: "money" } },
    formula: mulInt(money("530000"), fact("vtExemptions")),
  },
  {
    id: "us.vt.personal_exemption",
    version: 2,
    jurisdiction: "us.vt",
    title: "Vermont personal exemption TY2026 — $5,400 per exemption, the 2026 withholding allowance printed in GB-1210-2026 (Form IN-111 line 5e)",
    citation: {
      source: "2026 Vermont Income Tax Withholding Instructions, Tables and Charts (GB-1210-2026, published December 2025), annual payroll table footnote; 32 V.S.A. § 5811(21)(C)(i) and (D)",
      section: "32 V.S.A. § 5811(21)(C)(i); GB-1210-2026",
      url: FORMS + "GB-1210-2026.pdf",
      excerpt:
        "GB-1210-2026 (verbatim, annual payroll table footnote): '*use wages after subtracting withholding allowances (one withholding allowance equals $5400.00)'. GB-1210-2025 printed '$5300.00' — the 2025 personal exemption printed on Form IN-111 line 5e — and GB-1210-2024 printed $5,100, the 2024 exemption, so the withholding allowance IS the indexed § 5811(21)(C)(i) exemption each year. ENCODING: $5,400 per exemption, counted as on the 2025 form (yourself unless claimable, a spouse on a joint return only, other dependents). The 2026 Form IN-111 is unpublished; re-verify when it publishes (~December 2026). The companion 2026 standard deduction is NOT encoded — the withholding offsets imply $7,850 single and $15,700 joint but no document prints them and no head-of-household figure exists — so a TY2026 return still refuses at line 4.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perExemption: { value: "540000", type: "money" } },
    formula: mulInt(money("540000"), fact("vtExemptions")),
  },
  {
    id: "us.vt.retirement_income_exclusion",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont retirement income exclusion 2025 — Schedule IN-112 line 12: EITHER all federally taxable Social Security OR up to $10,000 of Civil Service Retirement System / other non-Social-Security contributory system income, in full at federal AGI up to $55,000 ($70,000 joint), phased out to $65,000 ($80,000 joint)",
    citation: {
      source: "32 V.S.A. § 5830e(a), (b), (c), (e) as amended by 2025 Act 71 § 3; 2025 Schedule IN-112 Instructions pp. 1-2, 'Retirement Income Exemption Worksheet'; 2025 Schedule IN-112 Part I line 12",
      section: "32 V.S.A. § 5830e(a)-(c), (e); Schedule IN-112 line 12",
      url: VSA("05830e"),
      excerpt:
        "STATUTE (§ 5830e(a)(1), verbatim): 'For taxpayers whose filing status is single, married filing separately, head of household, or surviving spouse: (A) If the federal adjusted gross income of the taxpayer is less than or equal to $55,000.00, all federally taxable benefits received under the federal Social Security Act shall be excluded. (B) If the federal adjusted gross income of the taxpayer is greater than $55,000.00 but less than $65,000.00, the percentage of federally taxable benefits ... to be excluded shall be proportional to the amount of the taxpayer's federal adjusted gross income over $55,000.00, determined by: (i) subtracting the federal adjusted gross income of the taxpayer from $65,000.00; (ii) dividing the value under subdivision (i) ... by $10,000.00; and (iii) multiplying the value under subdivision (ii) ... by the federally taxable benefits received under the Social Security Act. (C) If the federal adjusted gross income of the taxpayer is equal to or greater than $65,000.00, no amount ... shall be excluded.' (a)(2): married filing jointly, the same at $70,000.00 / $80,000.00. (b): 'the first $10,000.00 of income received from the Civil Service Retirement System' on the same thresholds; (c): other contributory systems of the U.S., this State or another state 'based on earnings that were not covered by the Social Security Act' are excluded 'as though the income were received from the Civil Service Retirement System'; (e)(1): 'A taxpayer of this State who is eligible during the taxable year for more than one of the exclusions under subsections (a), (b), and (c) of this section shall elect only one of the exclusions'. WORKSHEET (Schedule IN-112 Instructions, verbatim): '2. If you are: Married filing jointly, is your Adjusted Gross Income (AGI) on Form IN-111, Line 1, less than $80,000? Single, head of household, surviving spouse, or married filing separately, is your AGI on Form IN-111, Line 1, less than $65,000? No, STOP. ... 3. If you are: Married filing jointly, is your AGI less than $70,000? Single, head of household, surviving spouse, or married filing separately, is your AGI less than $55,000? ... Yes. You qualify for a full exemption. If you elected the exemption for social security, please enter the full amount from federal Form 1040, Line 6b ... If you elected one of the other retirement exemptions, enter your eligible retirement system income or $10,000, whichever is less. SECTION II ... 4. Married filing jointly, enter $80,000. All other filing statuses, enter $65,000. 5. Enter your AGI from Form IN-111, Line 1. 6. Subtract Line 5 from Line 4. If Line 5 is greater than Line 4, enter -0-. 7. Divide Line 6 by $10,000. This value will be a decimal. Please round to the second decimal place (Example: .481 would round to .48). 8. Enter the lesser of Line 7 or the value 1 ... 10. Amount of partial exemption. Multiply Line 9 by Line 8 ... 12. Amount of partial exemption. Multiply Line 11 by Line 8.' ROUNDING: the worksheet's 'round to the second decimal place (.481 -> .48)' does not settle a .485 tie; this rule rounds half-up, the conventional reading — a half-even tie rule would change the dollar result only at AGIs ending in 50 with an odd hundreds digit ($55,150, $55,350, …). ENCODING: vtRetirementElection picks the branch ('social_security' or 'contributory_system'; the default 'none' claims nothing); the ratio is rounded half-up to two decimals and capped at 1.00 exactly as the worksheet says, then multiplied with one whole-dollar rounding. The worksheet's question 3 says 'less than $55,000' where the statute says 'less than or equal to' — at exactly $55,000 the statute's full exclusion is applied (the ratio would be 1.00 either way, so the two readings agree in dollars). A qualifying surviving spouse uses the non-joint thresholds (statute and worksheet both list 'surviving spouse' with single). 2025 Act 71 § 3 raised every threshold by $5,000 for tax years from January 1, 2025. Military retirement is a SEPARATE exclusion (us.vt.military_retirement_exclusion) that may be taken in addition to this one (§ 5830e(e)(2)).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { fullSingle: { value: "5500000", type: "money" }, noneSingle: { value: "6500000", type: "money" }, fullJoint: { value: "7000000", type: "money" }, noneJoint: { value: "8000000", type: "money" }, contributoryCap: { value: "1000000", type: "money" }, ratioDecimals: { value: "2", type: "int" } },
    formula: (() => {
      const agi = fact("vtFederalAgi");
      const isSs = cmp("eq", fact("vtRetirementElection"), { kind: "enum", value: "social_security" });
      const isCs = cmp("eq", fact("vtRetirementElection"), { kind: "enum", value: "contributory_system" });
      const base = iff(isSs, max0(fact("vtTaxableSocialSecurity")), iff(isCs, minE(max0(fact("vtContributorySystemIncome")), money("1000000")), money("0")));
      // worksheet line 7: (line 4 − AGI) / $10,000 to two decimals, capped at 1 → hundredths
      const ratio = minE({ kind: "mulDiv", a: max0(sub(retireNone, agi)), b: money("100"), c: money("1000000"), round: "half-up" }, money("100"));
      return iff(le(agi, retireFull), base, iff(lt(agi, retireNone), applyRatio2(base, ratio), money("0")));
    })(),
  },
  {
    id: "us.vt.military_retirement_exclusion",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont military retirement and survivor benefit exclusion 2025 — Schedule IN-112 line 13: all federally taxable U.S. military retirement and survivor benefit income at federal AGI up to $125,000, phased out to $175,000, for every filing status",
    citation: {
      source: "32 V.S.A. § 5830e(d) and (e)(2), added by 2025 Act 71 § 3; 2025 Schedule IN-112 Instructions p. 3, 'Military Retirement Income Exemption Worksheet' and line 13",
      section: "32 V.S.A. § 5830e(d); Schedule IN-112 line 13",
      url: VSA("05830e"),
      excerpt:
        "STATUTE (§ 5830e(d), verbatim): 'For taxpayers of any filing status, U.S. military retirement income, and U.S. military survivor benefit income received by an eligible beneficiary, received by a taxpayer of this State shall be excluded from taxable income ... as follows: (1) If the federal adjusted gross income of the taxpayer is less than or equal to $125,000.00, all federally taxable U.S. military retirement income and survivor benefit income shall be excluded. (2) If the federal adjusted gross income of the taxpayer is greater than $125,000.00 but less than $175,000.00, the percentage ... to be excluded shall be proportional to the amount of the taxpayer's federal adjusted gross income over $125,000.00, determined by: (A) subtracting the federal adjusted gross income of the taxpayer from $175,000.00; (B) dividing the value under subdivision (A) ... by $50,000.00; and (C) multiplying the value under subdivision (B) ... by the federally taxable U.S. military retirement income and survivor benefit income received. (3) If the federal adjusted gross income of the taxpayer is equal to or greater than $175,000.00, no amount ... shall be excluded.' (e)(2): 'A taxpayer ... who is eligible ... for the military retirement and survivor benefit exclusion under subsection (d) of this section may elect that exclusion regardless of whether the taxpayer also elects an exclusion under subsections (a)-(c)'. WORKSHEET (Schedule IN-112 Instructions, verbatim): '2. Is your Adjusted Gross Income (AGI) on Form IN-111 ... Line 1, less than $175,000? ... 3. Is your AGI on Form IN-111, Line 1, less than or equal to $125,000? ... Yes. You qualify for a full exemption. ... SECTION II ... 5. Phaseout Threshold 175,000; 6. Subtract Line 4 from Line 5; 7. Divide Line 6 by $50,000. This value will be a decimal. Please round to the second decimal place (Example: .481 would round to .48). 8. Enter the lesser of Line 7 or the value 1 ... 10. Amount of partial exemption. Multiply Line 8 by Line 9.' BOOKLET LINE 13 (verbatim): 'Act 71 was signed into law on June 25, 2025. This new exemption under Act 71 takes effect beginning with the 2025 tax year.' ENCODING: two-decimal half-up ratio capped at 1.00, one whole-dollar rounding of the product; the thresholds do not depend on filing status.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { fullAgi: { value: "12500000", type: "money" }, noneAgi: { value: "17500000", type: "money" }, phaseRange: { value: "5000000", type: "money" }, ratioDecimals: { value: "2", type: "int" } },
    formula: (() => {
      const agi = fact("vtFederalAgi");
      const base = max0(fact("vtMilitaryRetirementIncome"));
      const ratio = minE({ kind: "mulDiv", a: max0(sub(money("17500000"), agi)), b: money("100"), c: money("5000000"), round: "half-up" }, money("100"));
      return iff(le(agi, money("12500000")), base, iff(lt(agi, money("17500000")), applyRatio2(base, ratio), money("0")));
    })(),
  },
  {
    id: "us.vt.capital_gains_exclusion",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont capital gains exclusion 2025 — Schedule IN-153: the greater of the $5,000 flat exclusion and 40% of eligible net adjusted capital gain on assets held over three years (up to $350,000), limited to 40% of federal taxable income (Schedule IN-112 line 8)",
    citation: {
      source: "32 V.S.A. § 5811(21)(B)(ii); 2025 Schedule IN-153 Parts I-III (lines 1-21) and its instructions; Schedule IN-112 Part I line 8",
      section: "32 V.S.A. § 5811(21)(B)(ii); Schedule IN-153 line 21",
      url: FORMS + "IN-153-2025.pdf",
      excerpt:
        "STATUTE (§ 5811(21)(B)(ii), verbatim): decreased by 'with respect to adjusted net capital gain income as defined in 26 U.S.C. § 1(h) reduced by the total amount of any qualified dividend income: either the first $5,000.00 of such adjusted net capital gain income or 40 percent of adjusted net capital gain income from the sale of assets held by the taxpayer for more than three years, except not adjusted net capital gain income from: (I) the sale of any real estate or portion of real estate used by the taxpayer as a primary or nonprimary residence; or (II) the sale of depreciable personal property other than farm property and standing timber; or stocks or bonds publicly traded or traded on an exchange, or any other financial instruments; regardless of whether sold by an individual or business; and provided that the total amount of decrease under this subdivision (21)(B)(ii) shall not exceed 40 percent of federal taxable income or $350,000.00, whichever is less'. SCHEDULE IN-153 (verbatim): Part I '1. Enter smaller of Line 15 or 16 from federal Form 1040, Schedule D ... 4. Subtract Line 3 from Line 1 [qualified dividends and other ineligible items] ... 7. Divide Line 5c by Line 6 [investment interest expense allocation] ... 8. Subtract Line 7 from Line 4. Entry cannot be less than zero. 9. Enter the smaller of Line 8 or $5,000.' Part II '10. Enter the amount from Part I, Line 4. 11. Enter amount of adjusted net capital gain from the sale of assets held for three years or less. 12. Assets held for more than three years. Subtract Line 11 from Line 10. Entry cannot be less than zero. 13a. Real estate or portion of real estate used as a primary or nonprimary home. 13b. Depreciable personal property (except for farm property or standing timber). 13c. Stocks or bonds publicly traded or traded on an exchange or any other financial instruments. 14. Add Lines 13a through 13c. 15. Subtract Line 14 from Line 12 ... This is the amount of net adjusted capital gain eligible for exclusion. 16. Enter amount from Part I, Line 7 or recomputed federal Form 4952. 17. Subtract Line 16 from Line 15. 18. Multiply Line 17 by 40%; enter result or $350,000, whichever is less.' Part III '19. Enter the greater of Line 9 or Line 18. 20. Multiply [Federal Taxable Income] x 40% and enter result here. 21. Enter the smaller of Line 19 or Line 20. This is your capital gains exclusion.' INSTRUCTIONS (verbatim): 'Qualified dividends are not eligible for capital gains treatment for Vermont tax purposes. Taxpayers may elect either the Flat Exclusion or the Percentage Exclusion. The amount excluded under either method cannot exceed 40% of federal taxable income or $350,000, whichever is less. If your 2025 federal Form 1040 ... shows a capital loss, you are not eligible to complete this form.' ENCODING: vtNetAdjustedCapitalGain is Part I line 8 (net adjusted capital gain after qualified dividends and allocated investment interest), vtEligibleLongTermGain is Part II line 17 (the over-three-year gain net of the three ineligible categories and interest), vtFederalTaxableIncome is the line 20 base; the rule takes the greater of the two methods and applies the 40%-of-federal-taxable-income cap. A net capital loss gives $0.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { flat: { value: "500000", type: "money" }, pct: { value: "40", type: "int" }, cap: { value: "35000000", type: "money" }, ftiPct: { value: "40", type: "int" } },
    formula: (() => {
      const l9 = minE(max0(fact("vtNetAdjustedCapitalGain")), money("500000"));
      const l18 = minE(dollarsFromScaled(times(max0(fact("vtEligibleLongTermGain")), "4000")), money("35000000"));
      const l19 = maxE(l9, l18);
      const l20 = dollarsFromScaled(times(max0(fact("vtFederalTaxableIncome")), "4000"));
      return minE(l19, l20);
    })(),
  },
  {
    id: "us.vt.student_loan_interest_subtraction",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont student loan interest subtraction 2025 — Schedule IN-112 line 16c: interest paid on qualified student loans not already deducted federally, denied above $200,000 of federal AGI on a joint return and $120,000 for every other status",
    citation: {
      source: "32 V.S.A. § 5811(21)(B)(vi); 2025 Schedule IN-112 Part I lines 16a-16c and its instructions p. 3",
      section: "32 V.S.A. § 5811(21)(B)(vi); Schedule IN-112 line 16c",
      url: FORMS + "IN-112-Instr-2025.pdf",
      excerpt:
        "STATUTE (§ 5811(21)(B)(vi), verbatim): decreased by 'the amount of interest paid by a qualified resident taxpayer during the taxable year on a qualified education loan for the costs of attendance at an eligible educational institution'. INSTRUCTIONS (verbatim): 'Line 16a Student Loan Interest. Total student loan interest you paid in 2025 on qualified student loans. Line 16b Student loan interest already deducted on federal Form 1040, Schedule 1, Line 21. Line 16c Subtract Line 16b from Line 16a. If filing jointly and AGI is greater than $200,000, enter -0-. All other filers, if AGI is greater than $120,000, enter -0-.' STATUTE (§ 5811(29)(B), the 'qualified resident taxpayer' definition): federal AGI 'equal to or less than: (i) $120,000.00 if the taxpayer's filing status is single, head of household, or married filing separately; or (ii) $200,000.00 if the taxpayer's filing status is married filing jointly'. ENCODING: the income limits are cliffs, applied as printed — 'filing jointly' is the married-filing-jointly status; a qualifying surviving spouse is named in neither list and takes the $120,000 limit as the instructions' 'All other filers'.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { agiLimitJoint: { value: "20000000", type: "money" }, agiLimitOther: { value: "12000000", type: "money" } },
    formula: (() => {
      const limit = iff(isMfj, money("20000000"), money("12000000"));
      return iff(gt(fact("vtFederalAgi"), limit), money("0"), max0(sub(max0(fact("vtStudentLoanInterestPaid")), max0(fact("vtStudentLoanInterestDeductedFederally")))));
    })(),
  },
  {
    id: "us.vt.charitable_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont charitable contribution credit 2025 — 5% of the first $20,000 of contributions allowable under IRC § 170, nonrefundable, maximum $1,000, available whether or not the filer itemizes federally (Form IN-111 lines 11-13)",
    citation: {
      source: "32 V.S.A. § 5822(d)(3); 2025 Form IN-111 lines 11-13; 2025 Form IN-111 Instructions p. 7, lines 11-13",
      section: "32 V.S.A. § 5822(d)(3); Form IN-111 line 13",
      url: BOOKLET,
      excerpt:
        "STATUTE (§ 5822(d)(3), verbatim): 'Individuals shall receive a nonrefundable charitable contribution credit against the tax imposed under this section for the taxable year. The credit shall be five percent of the first $20,000.00 in charitable contributions made during the taxable year that are allowable under 26 U.S.C. § 170. This credit shall be available irrespective of a taxpayer's election not to itemize at the federal level.' PRINTED FORM (verbatim): '11. Tax-Deductible Charitable Contribution (See instructions); 12. Multiply Line 11 by 5% (0.05); 13. Charitable Contribution Deduction (Enter the lesser of Line 12 or $1,000)'. BOOKLET (verbatim): 'Line 11 Tax Deductible Charitable Contribution. Enter the amount contributed to qualified charities in the taxable year. Line 12 Multiply Line 11 by 5% (0.05). Line 13 Enter the amount on Line 12 or $1,000 ($20,000 times 5%), whichever is less. Line 14 Vermont Income Tax. Line 10 minus Line 13.' ENCODING: 5% of the contributions with one whole-dollar rounding, capped at $1,000; the form labels line 13 a 'Deduction' but it is subtracted from the TAX on line 14.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "5", type: "int" }, maxContributions: { value: "2000000", type: "money" }, maxCredit: { value: "100000", type: "money" } },
    formula: minE(dollarsFromScaled(times(max0(fact("vtCharitableContributions")), "500")), money("100000")),
  },
  {
    id: "us.vt.federal_tax_adjustment",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont 24% federal-tax adjustment 2025 — Schedule IN-119: 24% of the federal additional taxes on qualified plans, investment credit recapture and Form 4972 lump-sum tax (Part I line 5, an addition), and 24% of the federal elderly/disabled credit, Vermont-based investment credit and farm income averaging (Part II line 12, a nonrefundable credit)",
    citation: {
      source: "32 V.S.A. § 5822(c) and (d)(1)-(2); 2025 Schedule IN-119 Part I lines 1-7 and Part II lines 8-14; 2025 Schedule IN-119 Instructions",
      section: "32 V.S.A. § 5822(c), (d); Schedule IN-119 lines 5 and 12",
      url: VSA("05822"),
      excerpt:
        "STATUTE (§ 5822(c), verbatim): 'The amount of tax determined under subsection (a) of this section shall be: (1) increased by 24 percent of the taxpayer's federal tax liability for the taxable year for the following: (A) additional taxes on qualified retirement plans, including individual retirement accounts and medical savings accounts and other tax-favored accounts; (B) recapture of the federal investment tax credit attributable to the Vermont portion of the investment; and (C) tax on qualified lump-sum distributions of pension income not included in federal taxable income; and (2) decreased by 24 percent of the reduction in the taxpayer's federal tax liability due to farm income averaging.' (d)(1): 'A taxpayer shall be entitled to a credit against the tax imposed under this section of 24 percent of each of the credits allowed against the taxpayer's federal income tax for the taxable year as follows: the credit for people who are elderly or permanently totally disabled and the investment tax credit attributable to the Vermont-property portion of the investment.' SCHEDULE IN-119 (verbatim): Part I '1. Tax on Qualified Plans including IRA, HSA, and MSA distributions; 2. Recapture of Federal Investment Tax Credit; 3. Tax from federal Form 4972 ...; 4. ADD Lines 1 through 3; 5. MULTIPLY Line 4 by 24% (0.24); 6. Recapture of Vermont Credits; 7. ADD Lines 5 and 6.' Part II '8. Credit for the Elderly or the Disabled; 9. Investment Tax Credit - Vermont-based only; 10. Vermont Farm Income Averaging Credit; 11. ADD Lines 8 through 10; 12. MULTIPLY Line 11 by 24% (0.24); 13. Vermont-based Solar Energy Credit carryforward; 14. ADD Lines 12 and 13; 15. SUBTRACT Line 14 from Line 7. Enter on Form IN-111, Line 9.' ENCODING: one rule applied to whichever base (vtFederalTaxAdjustmentBase) — 24% with one whole-dollar rounding; the composer runs it once for line 5 and once for line 12 and nets them on line 15 with the recapture and solar carryforward inputs.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "24", type: "int" } },
    formula: dollarsFromScaled(times(max0(fact("vtFederalTaxAdjustmentBase")), "2400")),
  },
  {
    id: "us.vt.other_state_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont credit for income tax paid to another state or Canadian province 2025 — Schedule IN-117: the Vermont tax times the ratio of the doubly-taxed modified AGI to total modified AGI, capped at 100%, limited to the tax paid (Form IN-111 line 17)",
    citation: {
      source: "32 V.S.A. § 5825(a); 2025 Schedule IN-117 lines 1-21 and its instructions; 2025 Form IN-111 line 17",
      section: "32 V.S.A. § 5825(a); Schedule IN-117 line 21",
      url: FORMS + "IN-117-2025.pdf",
      excerpt:
        "STATUTE (§ 5825(a), verbatim): 'A taxpayer of this State who was a resident individual, estate, or trust during any portion of a taxable year shall receive credit against the tax imposed, for that taxable year, by section 5822 of this title for income taxes imposed by, and paid to, another state or territory of the United States, the District of Columbia, or a province of Canada, upon the taxpayer's income earned or received from sources within that state, territory, district, or province during that portion of that taxable year. In no case shall the credit allowed by this section exceed the portion of Vermont income tax, otherwise imposed by this chapter, attributable to the adjusted gross income earned or received from sources within such other state, territory, district, or province.' SCHEDULE IN-117 (verbatim): '9. Modified Adjusted Gross Income for income taxed in another state or Canadian province AND taxed in Vermont (SUBTRACT Line 8 from Line 5) ... 17. SUBTRACT Line 16 from Line 13 [modified Vermont AGI: federal AGI plus non-Vermont obligations and bonus depreciation, less U.S. government interest and the prior-year depreciation adjustment] ... 18. Vermont income tax from Form IN-111, Line 14. 19. Computed tax credit (DIVIDE Line 9 by Line 17. MULTIPLY the result by Line 18.) Result cannot be more than 100% of Vermont tax. 20. Income tax paid to another state or Canadian province ... 21. Enter the lesser of Line 19 or 20.' INSTRUCTIONS (verbatim): 'Line 19 Divide Line 9 ... by Line 17 ... and multiply that result by Line 18. Line 20 Enter the amount of income tax paid to the other state or Canadian province. This amount is income tax paid to the state or Canadian province – not the amount of withholding. City and county tax paid to the other state is not allowed. Credit for the Canadian provincial income tax does not include the portion used as a foreign credit on federal Form 1040. Line 21 Enter the lesser of Line 19 or 20 ... If there is more than one state or province, add Line 21 from all Schedules IN-117.' ENCODING: line 19 = line 18 x line 9 / line 17 with ONE whole-dollar rounding of the exact quotient (the schedule prints no intermediate ratio and no decimal count), capped at line 18; a separate schedule per state is summed by the caller.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {},
    formula: (() => {
      const l9 = max0(fact("vtOtherStateIncome"));
      const l17 = fact("vtModifiedAgi");
      const l18 = max0(fact("vtIncomeTax"));
      const l19 = minE(times({ kind: "mulDiv", a: l18, b: l9, c: times(l17, "100"), round: "half-up" }, "100"), l18);
      return iff(gt(l17, money("0")), minE(l19, max0(fact("vtOtherStateTaxPaid"))), money("0"));
    })(),
  },
  {
    id: "us.vt.eitc",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont earned income tax credit 2025 — 38% of the federal credit with one or more qualifying children, 100% of it with none (2025 Act 71 § 2); refundable (Schedule IN-112 Part II line 7)",
    citation: {
      source: "32 V.S.A. § 5828b(a)-(b) as amended by 2025 Act 71 § 2 (eff. January 1, 2025); 2025 Schedule IN-112 Part II lines 5-7; Department of Taxes 2025 Legislative Highlights",
      section: "32 V.S.A. § 5828b; Schedule IN-112 line 7",
      url: VSA("05828b"),
      excerpt:
        "STATUTE (§ 5828b(a), verbatim): 'A resident individual or part-year resident individual who is entitled to an earned income tax credit granted under the laws of the United States shall be entitled to a credit against the tax imposed for each year by section 5822 of this title. The credit shall be for an individual who claims one or more qualifying children 38 percent or for an individual who does not claim one or more qualifying children 100 percent of the earned income tax credit granted to the individual under the laws of the United States, multiplied by the percentage that the individual's income that is earned or received during the period of the individual's residency in this State bears to the individual's total income.' (b): 'In the event the credit exceeds the amount of the income tax payments due from the taxpayer, the excess of credits over payments due shall be paid to the taxpayer.' SCHEDULE IN-112 (verbatim): '5. Number of qualifying children from federal Schedule EIC. 6. Federal Earned Income Tax Credit. Enter amount from federal Form 1040. 7. Vermont Earned Income Tax Credit. If Line 5 is GREATER than zero, MULTIPLY Line 6 by 38% (0.38). If Line 5 is zero, enter the amount from Line 6.' LEGISLATIVE HIGHLIGHTS (verbatim): 'Sec. 2, Earned Income Tax Credit — Changes the percentage of the federal Earned Income Tax Credit that may be taken in Vermont by claimants without qualifying children, from 38 percent to 100 percent' — 'effective retroactively to tax years opening on and after January 1, 2025'. ENCODING: full-year residents only (the residency proration is Schedule IN-113, out of scope); refundable through Form IN-111 line 26c.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pctWithChildren: { value: "38", type: "int" }, pctNoChildren: { value: "100", type: "int" } },
    formula: iff(gt(fact("vtEitcQualifyingChildren"), int("0")), dollarsFromScaled(times(max0(fact("vtFederalEic")), "3800")), max0(fact("vtFederalEic"))),
  },
  {
    id: "us.vt.child_tax_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont child tax credit 2025 — $1,000 per qualifying child six or younger at year end, reduced $20 per $1,000 or fraction of federal AGI over $125,000 regardless of filing status; refundable (Schedule IN-112 Part II line 4)",
    citation: {
      source: "32 V.S.A. § 5830f(a)-(b) as amended by 2025 Act 71 § 1 (age five to six, eff. January 1, 2025); 2025 Schedule IN-112 Part II lines 3-4 and its instructions p. 4 'CHILD TAX CREDIT TABLE'",
      section: "32 V.S.A. § 5830f; Schedule IN-112 line 4",
      url: VSA("05830f"),
      excerpt:
        "STATUTE (§ 5830f(a), verbatim): 'The total credit per taxable year shall be in the amount of $1,000.00 per qualifying child, as defined under 26 U.S.C. § 152(c) but notwithstanding the taxpayer identification number requirements under 26 U.S.C. § 24(e) and (h)(7), who is six years of age or younger as of the close of the calendar year in which the taxable year of the taxpayer begins.' (b): 'the amount of the credit per child under this section shall be reduced, but not below zero, by $20.00 for each $1,000.00, or fraction thereof, by which the individual's adjusted gross income exceeds $125,000.00, irrespective of the individual's filing status. For purposes of this subsection, spouses filing jointly shall be considered an individual.' INSTRUCTIONS (verbatim): 'Line 3 Enter the number of qualifying children ... Qualifying children are those born between 2019 and 2025. Line 4 Child Tax Credit. Multiply Line 3 by $1,000 or if your AGI is greater than $125,000, use the table to find the credit amount per qualifying child to use on Line 4.' TABLE (verbatim, 'At Least / But Not More Than / Child Tax Credit Is'): '0 / 125,000 / 1,000; 125,001 / 126,000 / 980; 126,001 / 127,000 / 960; ... 137,001 / 138,000 / 740; ... 150,001 / 151,000 / 480; ... 173,001 / 174,000 / 20; 174,001 / - / 0'. ENCODING: per child = $1,000 less $20 x the number of $1,000 units OR FRACTION by which AGI exceeds $125,000 (ceil), floored at zero — this reproduces every printed row (AGI 125,001 -> 1 unit -> $980; 174,001 -> 50 units -> $0) — times the count of qualifying children six or younger. Refundable through Form IN-111 line 26c; the statute's $20 step and the printed table are whole dollars, so no rounding arises.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perChild: { value: "100000", type: "money" }, phaseoutStart: { value: "12500000", type: "money" }, reductionPerStep: { value: "2000", type: "money" }, stepCents: { value: "100000", type: "money" }, maxAge: { value: "6", type: "int" } },
    formula: (() => {
      const steps = stepUnits(max0(sub(fact("vtFederalAgi"), money("12500000"))), "100000", "ceil");
      const perChild = max0(sub(money("100000"), mulInt(money("2000"), steps)));
      return mulInt(perChild, fact("vtChildrenSixOrUnder"));
    })(),
  },
  {
    id: "us.vt.child_dependent_care_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont child and dependent care credit 2025 — 72% of the federal credit, refundable (Schedule IN-112 Part II line 2)",
    citation: {
      source: "32 V.S.A. § 5828c; 2025 Schedule IN-112 Part II lines 1-2",
      section: "32 V.S.A. § 5828c; Schedule IN-112 line 2",
      url: VSA("05828c"),
      excerpt:
        "STATUTE (§ 5828c, verbatim): 'A resident or part-year resident of this State shall be eligible for a refundable credit against the tax imposed under section 5822 of this title. The credit shall be equal to 72 percent of the federal child and dependent care credit allowed to the taxpayer for the taxable year for child or dependent care services.' SCHEDULE IN-112 (verbatim): '1. Child and Dependent Care Credit (federal Form 2441, Line 11). 2. Vermont Child and Dependent Care Credit (MULTIPLY Line 1 by 72% (0.72)).' ENCODING: 72% with one whole-dollar rounding; refundable through Form IN-111 line 26c.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "72", type: "int" } },
    formula: dollarsFromScaled(times(max0(fact("vtFederalChildCareCredit")), "7200")),
  },
  {
    id: "us.vt.veteran_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont veteran tax credit 2025 — $250 refundable for a filer with a discharge or separation record verifying service in the uniformed services, reduced $5 per full $100 of federal AGI over $25,000 and gone at $30,000 (Schedule IN-112 Part II lines 8-12)",
    citation: {
      source: "32 V.S.A. § 5830g, added by 2025 Act 71 § 5 (eff. January 1, 2025); 2025 Schedule IN-112 Part II lines 8-12 and its instructions p. 4",
      section: "32 V.S.A. § 5830g; Schedule IN-112 line 12",
      url: VSA("05830g"),
      excerpt:
        "STATUTE (§ 5830g, verbatim): '(a) A resident individual or part-year resident individual who served in the uniformed services shall be entitled to a refundable credit against the tax imposed by section 5822 of this title for the taxable year. (b) A taxpayer shall be eligible for the credit under this section provided the taxpayer has a discharge record, or other record of separation from active duty, verifying service in the uniformed services. (c)(1) If the federal adjusted gross income of the taxpayer is less than or equal to $25,000.00, the amount of tax credit provided under this section shall be $250.00. (2) If the federal adjusted gross income of the taxpayer is greater than $25,000.00 but less than $30,000.00, the amount of credit shall be $250.00 less $5.00 per $100.00 of federal adjusted gross income exceeding $25,000.00 of federal adjusted gross income. (3) If the federal adjusted gross income of the taxpayer is $30,000.00 or greater, no amount of credit shall be provided under this section.' SCHEDULE IN-112 (verbatim): '8. Enter your AGI from Form IN-111, Line 1. 9. If Line 8 is $25,000 or less, enter -0- and skip to Line 12. Otherwise, SUBTRACT $25,000 from Line 8. 10. DIVIDE Line 9 by 100, rounding down to the nearest whole number. 11. MULTIPLY Line 10 by $5. 12. If Line 9 is zero, enter $250. Otherwise, enter $250 MINUS Line 11.' ENCODING: the discharge record is an attestation (vtVeteranDischargeRecord) with a $0 default; the $5 steps use the FLOOR of the excess in hundreds, exactly as line 10 prints; the result is a whole number of dollars by construction. One credit per return as the schedule prints it.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { credit: { value: "25000", type: "money" }, phaseoutStart: { value: "2500000", type: "money" }, phaseoutEnd: { value: "3000000", type: "money" }, reductionPerHundred: { value: "500", type: "money" } },
    formula: (() => {
      const steps = stepUnits(max0(sub(fact("vtFederalAgi"), money("2500000"))), "10000", "floor");
      const amount = max0(sub(money("25000"), mulInt(money("500"), steps)));
      return iff(and(fact("vtVeteranDischargeRecord"), lt(fact("vtFederalAgi"), money("3000000"))), amount, money("0"));
    })(),
  },
  {
    id: "us.vt.use_tax",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont use tax 2025 — Form IN-111 line 22: the Estimated Use Tax Table by federal AGI ($0 to $45 in $10,000 bands; 0.05% of AGI, at most $150, above $100,000) for unrecorded purchases, plus 6% of recorded purchases, less sales tax paid to another state",
    citation: {
      source: "2025 Form IN-111 Instructions pp. 8-9, 'USE TAX WORKSHEET' Parts 1-4 and the 'Estimated Use Tax Table'; 32 V.S.A. § 9773",
      section: "Form IN-111 line 22; Use Tax Worksheet",
      url: BOOKLET,
      excerpt:
        "BOOKLET (verbatim): 'The use tax rate is the same as the sales tax rate: 6%. If you didn't keep records of qualifying purchases, Vermont offers an option for estimating them in Part 1. If you did keep records, you should use Part 2. The total for any purchases that cost over $1,000 each needs to be reported on Line 3a.' WORKSHEET (verbatim): 'Part 1 If you did not keep accurate records — 1a. Enter the amount of use tax from the Estimated Use Tax Table below that corresponds to your Adjusted Gross Income from Form IN-111, Line 1. 1b. Did you make purchase(s) of $1,000 or more per item? Yes. Go to Part 3. No. Enter Line 1a amount onto Form IN-111, Line 22.' ESTIMATED USE TAX TABLE (verbatim): 'Up to $20,000 — $0; $20,001 - $30,000 — $10; $30,001 - $40,000 — $15; $40,001 - $50,000 — $20; $50,001 - $60,000 — $25; $60,001 - $70,000 — $30; $70,001 - $80,000 — $35; $80,001 - $90,000 — $40; $90,001 - $100,000 — $45; $100,001 and over — 0.05% (0.0005) of AGI or $150, whichever is less.' 'Part 2 If you did keep accurate records — 2a. Enter the total amount of all purchases of items under $1,000 each. 2b. Multiply Line 2a by 6% (0.06). Part 3 Total Use Tax due — 3a. Enter the total amount of all purchases of items $1,000 or more per item. 3b. Multiply Line 3a by 6% (0.06). 3c. Add Line 3b to either Line 1a or Line 2b (the line with a value entered). 3d. Enter the amount of sales tax paid to another state for the purchases on Lines 2a and 3a, if any. 3e. Line 3c minus Line 3d. Enter here and on Form IN-111, Line 22.' WINDOW: the Estimated Use Tax Table is a booklet-year figure — this rule ends 2026-01-01 and re-verifies against the 2026 Form IN-111 instructions (the 6% rate is statutory, 32 V.S.A. § 9773). ENCODING: vtUseTaxEstimateFromTable selects Part 1 (the table on vtFederalAgi, with the 0.05% tier rounded once to whole dollars) instead of Part 2 (6% of vtUseTaxSmallPurchases); 6% of vtUseTaxLargePurchases is always added; vtUseTaxPaidOtherState is subtracted; floored at zero.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { rateBps: { value: "600", type: "int" }, estimateRateBps: { value: "5", type: "int" }, estimateCap: { value: "15000", type: "money" }, largeItemThreshold: { value: "100000", type: "money" } },
    formula: (() => {
      const agi = fact("vtFederalAgi");
      const band = (hiCents: string, amt: string, els: Expr): Expr => iff(le(agi, money(hiCents)), money(amt), els);
      const over100k = minE(dollarsFromScaled(times(max0(agi), "5")), money("15000"));
      const table = band("2000000", "0", band("3000000", "1000", band("4000000", "1500", band("5000000", "2000", band("6000000", "2500", band("7000000", "3000", band("8000000", "3500", band("9000000", "4000", band("10000000", "4500", over100k)))))))));
      const small = dollarsFromScaled(times(max0(fact("vtUseTaxSmallPurchases")), "600"));
      const large = dollarsFromScaled(times(max0(fact("vtUseTaxLargePurchases")), "600"));
      const base = iff(fact("vtUseTaxEstimateFromTable"), table, small);
      return max0(sub(add(base, large), max0(fact("vtUseTaxPaidOtherState"))));
    })(),
  },
  {
    id: "us.vt.child_care_contribution",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont child care contribution 2025 — Form IN-111 line 21: 0.11% of Vermont-source self-employment income (federal Schedule SE line 6 less work performed outside Vermont)",
    citation: {
      source: "2023 Act 76; 2025 Form IN-111 line 21 and Instructions p. 7, 'CHILD CARE CONTRIBUTION WORKSHEET'; Department guide GB-1326",
      section: "Form IN-111 line 21",
      url: BOOKLET,
      excerpt:
        "BOOKLET (verbatim): 'Line 21 Child Care Contributions. Act 76 of 2023, an act relating to child care, early education, workers' compensation, and unemployment insurance, created a child care contribution (CCC) in Vermont. Per the statutory directive, collection of the CCC commenced on July 1, 2024. Individuals with self-employment income from Vermont sources earned on July 1, 2024, or after must include their CCC on Form IN-111.' WORKSHEET (verbatim): '1. Enter the amount from federal Form 1040, Schedule SE, Line 6. 2. Enter the amount of income reported on Line 1 that was earned for work performed outside of Vermont. 3. Subtract Line 2 from Line 1. 4. Multiply Line 3 by 0.11% (0.0011). Enter this amount on Form IN-111, Line 21.' WINDOW: the 0.11% rate is statutory (2023 Act 76) and the worksheet is the 2025 booklet's; carried to 2027-01-01 and to be re-verified against the 2026 booklet. ENCODING: 0.11% of the Vermont-source net self-employment income with ONE whole-dollar rounding (11 basis points is not an integer-cent rate, so rounding to cents first would misstate some inputs by $1).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { rateBps: { value: "11", type: "int" } },
    formula: dollarsFromScaled(times(max0(sub(max0(fact("vtSelfEmploymentIncome")), max0(fact("vtSelfEmploymentIncomeOutsideVermont")))), "11")),
  },
  {
    id: "us.vt.vheip_credit",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont Higher Education Investment Plan credit 2025 — 10% of the first $2,500 contributed per beneficiary ($5,000 per beneficiary on a joint return), nonrefundable (Schedule IN-119 Part II line 1)",
    citation: {
      source: "32 V.S.A. § 5825a(a); 2025 Schedule IN-119 Part II line 1 and its instructions p. 2",
      section: "32 V.S.A. § 5825a(a); Schedule IN-119 Part II line 1",
      url: VSA("05825a"),
      excerpt:
        "STATUTE (§ 5825a(a), verbatim): 'A taxpayer of this State, including each spouse filing a joint return, who makes a contribution to a Vermont Higher Education Investment Plan account ... shall be eligible for a nonrefundable credit against the tax imposed under section 5822 of this title of 10 percent of the first $2,500.00 per beneficiary, contributed by the taxpayer during the taxable year to a Vermont Higher Education Investment Plan account'. INSTRUCTIONS (Schedule IN-119, verbatim): 'For jointly filed returns, the tax credit equals 10% of the first $5,000 of contributions per beneficiary.' FORM (verbatim): '1. Vermont Higher Education Investment Plan (VHEIP) ... 2025 Contribution eligible for credit ... TIMES (X) .10'. ENCODING: contributions capped at $2,500 ($5,000 joint) times the number of beneficiaries, then 10% — the per-beneficiary cap is applied in aggregate because the form takes one contribution total; a caller with unequal contributions across beneficiaries must pass the already-capped eligible total. Nonrefundable, into Form IN-111 line 18 through Schedule IN-119 Part II line 9. Rollovers and the 10% recapture of non-qualified distributions (§ 5825a(b)) are out of scope.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "10", type: "int" }, perBeneficiary: { value: "250000", type: "money" }, perBeneficiaryJoint: { value: "500000", type: "money" } },
    formula: (() => {
      const cap = mulInt(iff(isMfj, money("500000"), money("250000")), fact("vtVheipBeneficiaries"));
      return dollarsFromScaled(times(minE(max0(fact("vtVheipContributions")), cap), "1000"));
    })(),
  },
  {
    id: "us.vt.parameters",
    version: 1,
    jurisdiction: "us.vt",
    title: "Vermont Form IN-111 2025 — composition conventions, printed line structure, filing-status routing, out-of-scope schedules, and legislative currency",
    citation: {
      source: "2025 Form IN-111 (Rev. 10/25); 2025 Form IN-111 Instructions; Schedules IN-112, IN-113, IN-117, IN-119, IN-153, RCC-146, HS-122; 32 V.S.A. chapter 151; 2025 Act 71 (S.51); 2026 Act 164 (H.933); Department of Taxes 2025 and 2026 Legislative Highlights",
      section: "Form IN-111 lines 1-32",
      url: FORMS + "IN-111-2025.pdf",
      excerpt:
        "STRUCTURE (printed 2025 Form IN-111, verbatim captions): '1. Federal Adjusted Gross Income (federal Form 1040, Line 11a); 2. Net Modifications to Federal AGI (Schedule IN-112, Part I, Line 19); 3. Federal AGI with Modifications (ADD Lines 1 and 2); 4. 2025 Vermont Standard Deduction from filing status section above; 5a-5e Personal Exemptions ... 5e. MULTIPLY Line 5d by $5,300; 6. ADD Lines 4 and 5e; 7. Vermont Taxable Income (SUBTRACT Line 6 from Line 3. If less than zero, enter -0-); 8. Vermont Income Tax from tax table or tax rate schedule (If Line 1 is greater than $150,000, see instructions); 9. Net Adjustment to Vermont Tax (Schedule IN-119, Part I, Line 15); 10. Vermont Income Tax with Adjustment (ADD Lines 8 and 9. If less than zero, enter -0-); 11. Tax-Deductible Charitable Contribution; 12. Multiply Line 11 by 5% (0.05); 13. Charitable Contribution Deduction (Enter the lesser of Line 12 or $1,000); 14. Vermont Income Tax (Line 10 MINUS Line 13. If less than zero, enter -0-); 15. Income Adjustment (Schedule IN-113, Line 35, or 100.0000%); 16. Adjusted Vermont Income Tax (MULTIPLY Line 14 by Line 15); 17. Other State Credit (Schedule IN-117, Line 21); 18. Vermont Tax Credits (Schedule IN-119, Part II); 19. Total Vermont Credits (Add Lines 17 and 18); 20. Vermont Income Tax after credits (SUBTRACT Line 19 from Line 16. If Line 19 is greater than Line 16, enter -0-); 21. Child Care Contributions for Self-Employed individuals; 22. Use Tax; 23. Total Vermont Taxes (ADD Lines 20 through 22); 24a-24e Voluntary Contributions; 25. Total of Vermont Taxes and Voluntary Contributions (ADD Lines 23 and 24e); 26a. 2025 Vermont Tax Withheld from W-2, 1099; 26b. 2025 Estimated Tax payments, amount carried forward; 26c. Refundable Credits (Schedule IN-112, Part II: Full-Year Residents-Line 13); 26d. 2025 Vermont Real Estate Withholding; 26e. 2025 Nonresident Estimated Tax payments; 26f. Total Payments and Credits (ADD Lines 26a through 26e); 27. Overpayment. If Line 25 is less than Line 26f, SUBTRACT Line 25 from Line 26f; 28a. Refund to be credited to 2026 Estimated Tax Payment; 28b. Refund to be credited to 2026 Property Tax Bill; 29. REFUND AMOUNT (SUBTRACT Lines 28a and 28b from Line 27); 30. If Line 25 is more than Line 26f, subtract Line 26f from Line 25; 31. Interest and Penalty on Underpayment of Estimated Tax (Worksheet IN-152 or IN-152A); 32. AMOUNT DUE (ADD Lines 30 & 31).' SCHEDULE IN-112 PART I (verbatim): additions '3. Income from Non-Vermont State and Local Obligations; 4. Bonus Depreciation Allowed under federal law; 6. Total Additions (ADD Line 3 and Line 4)'; subtractions '7. Interest Income from U.S. Obligations; 8. Capital Gains Exclusion (Schedule IN-153, Line 21); 9. Adjustment for Prior Years' Bonus Depreciation; 10. Taxable Refunds of State and Local Income Taxes; 11. Medical Expense Deduction; 12. Retirement Benefits Exempt from Taxation; 13. Military retirement and Survivor Benefit exempt from Taxation; 14. Railroad Retirement income; 15. Bond/note interest income from [Vermont Student Assistance Corporation, Build America, Vermont Telecommunications Authority, Vermont Public Power Supply Authority]; 16c. [student loan interest]; 18. Total Subtractions (ADD Lines 7 through 15 and Line 16c); 19. SUBTRACT Line 18 from Line 6. Enter on Form IN-111, Line 2.' PART II refundable credits: '2. Vermont Child and Dependent Care Credit; 4. Child Tax Credit; 7. Vermont Earned Income Tax Credit; 12. [Veteran Tax Credit]; 13. Total Vermont Refundable Tax Credits (ADD Lines 2, 4, 7, and 12). Full-Year Residents: Enter this amount on Form IN-111, Line 26c.' MEDICAL DEDUCTION WORKSHEET (IN-112 Instructions, verbatim): '1a. Medical and Dental Expense from federal Form 1040, Schedule A, Line 4. 1b. Non-allowable expenses included in Line 1a [recurring monthly payments or entrance fees to a retirement community]. 1c. Total. Line 1a minus Line 1b. 2. Amount from Vermont Form IN-111, Line 6. 3. Subtract Line 2 from Line 1c. Enter here and on Schedule IN-112, Part I, Line 11. If amount on Line 3 is negative, STOP.' — § 5811(21)(C)(iv). FILING STATUS: the printed statuses are Single; Married/CU Filing Jointly; Married/CU Filing Separately; Head of Household; Qualifying Widow(er). A qualifying widow(er) takes the joint standard deduction ($15,300), the joint rate column (Schedule Y-1 and the table footnote), the non-joint retirement thresholds (§ 5830e lists 'surviving spouse' with single), the non-joint student loan limit ('filing jointly' means the joint status), NO spouse exemption (line 5b), and is one person for the additional deduction boxes. Civil union partners file as married (§ 5812). 2025 Act 27 § E.111.2 amended § 5861(c) so that spouses 'shall file a joint Vermont personal income tax return for any taxable year for which the spouses file ... a joint federal income tax return', so the Vermont status mirrors the federal one (the booklet allows a recomputed separate return only for civil unions and for a couple where only one spouse has Vermont nexus). OUT OF SCOPE, named: Schedule IN-113 (part-year and nonresident income adjustment — line 15 is 100% for a full-year resident); the Renter Credit (Form RCC-146, a separate claim computed from household income, family size and county fair market rent, paid outside Form IN-111); the Property Tax Credit (Form HS-122 / HI-144, chapter 154); Schedule IN-119 Part II business credits other than the 24% items (charitable housing, mobile home, research and development, affordable housing, historic rehabilitation, facade, code improvements — transcribed as an input; the VHEIP credit on line 1 is us.vt.vheip_credit); nonresident real estate withholding and Schedule K-1VT payments (inputs); IN-152 underpayment interest (input); bonus depreciation and QSBS modifications (inputs on the generic additions and subtractions). LEGISLATIVE CURRENCY: 2025 Act 71 (S.51, signed June 25, 2025), retroactive to tax years from January 1, 2025 — § 1 child tax credit age five to six; § 2 childless EITC 38% to 100%; § 3 every retirement-exclusion AGI threshold up $5,000 and the military retirement/survivor exclusion at $125,000-$175,000 for every status, electable alongside one other; §§ 4-5 the $250 veteran credit. 2026 Act 164 (H.933, June 18, 2026): § 55 amends § 5811(21)(B) to add subtractions for R&E amortization and decouples from IRC § 168(n) (bonus depreciation on qualified production property) — effective retroactively January 1, 2026 and applying to taxable years from January 1, 2025 under the act's § (8); § 55a requires an addback of the federal qualified small business stock exclusion for taxable years beginning on and after January 1, 2026; §§ 56-57 recast the § 5822(e) apportionment for part-year and nonresident filers; §§ 60-61 link Vermont income tax to federal law as of December 31, 2025, applying to taxable years from January 1, 2025. NONE of these touches the 2025 rates, brackets, deduction, exemption, or credit amounts. For the retroactive TY2025 items the Department issued the 2025 Vermont Income Tax Form Instructions Federal Conformity Supplement (Rev. 6/26), which routes the IRC § 168(n) and large-business § 174A addbacks and subtractions through Schedule IN-112 lines 4 and 9 — the generic additions and subtractions inputs here. The 2026 Highlights also record 2026 Act 169 (H.949) §§ 8-9, which raise the RENTER credit to 12.5% of fair market rent and $3,250 for claim year 2027 only (outside Form IN-111), and § 10, which raises the property tax credit's $47,000 tiers to $50,000 from claim year 2028. Every dollar amount in §§ 5811(21)(C) and 5822(a) is indexed annually by the Commissioner; the 2026 Form IN-111, rate schedule and table publish ~December 2026, so the 2025 rate and deduction rules end 2026-01-01. TY2026 is partly published: the 2026 Form IN-114 Instructions print '2026 Preliminary Vermont Tax Rates' for all four statuses (us.vt.income_tax version 2) and GB-1210-2026 prints the $5,400 withholding allowance that is the personal exemption (us.vt.personal_exemption version 2); the 2026 standard deduction is not printed anywhere (the withholding offsets imply $7,850 single and $15,700 joint, with no head-of-household figure), so us.vt.standard_deduction ends 2026-01-01 and a TY2026 return refuses at line 4 until the 2026 Form IN-111 publishes (~December 2026).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingle: { value: "765000", type: "money" },
      standardDeductionJoint: { value: "1530000", type: "money" },
      standardDeductionHoh: { value: "1145000", type: "money" },
      additionalDeductionPerBox: { value: "125000", type: "money" },
      personalExemption: { value: "530000", type: "money" },
      minimumTaxAgiThreshold: { value: "15000000", type: "money" },
      tableTop: { value: "7500000", type: "money" },
      charitableCreditMax: { value: "100000", type: "money" },
      eitcPctWithChildren: { value: "38", type: "int" },
      eitcPctNoChildren: { value: "100", type: "int" },
      childTaxCreditPerChild: { value: "100000", type: "money" },
      childCareCreditPct: { value: "72", type: "int" },
      veteranCredit: { value: "25000", type: "money" },
      capitalGainsFlat: { value: "500000", type: "money" },
      capitalGainsCap: { value: "35000000", type: "money" },
      useTaxRateBps: { value: "600", type: "int" },
      childCareContributionBps: { value: "11", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Vermont Form IN-111 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.vt.income_tax, us.vt.standard_deduction, us.vt.personal_exemption, us.vt.retirement_income_exclusion, us.vt.military_retirement_exclusion, us.vt.capital_gains_exclusion, us.vt.student_loan_interest_subtraction, us.vt.charitable_credit, us.vt.federal_tax_adjustment, us.vt.other_state_credit, us.vt.eitc, us.vt.child_tax_credit, us.vt.child_dependent_care_credit, us.vt.veteran_credit, us.vt.vheip_credit, us.vt.use_tax, and us.vt.child_care_contribution",
    },
  },
];
