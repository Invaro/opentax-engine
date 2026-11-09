import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money, printedSchedule, ruleRef } from "./state-helpers.js";

const param = (name: string): Expr => ({ kind: "param", name });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepUnits = (value: Expr, unitCents: string, mode: "floor" | "ceil"): Expr => ({ kind: "stepUnits", value, unitCents, mode });
const dollars = (n: number): Expr => money(String(Math.round(n * 100)));
const isJoint: Expr = or(isStatus("mfj"), isStatus("qss"));
const byStatus = (single: Expr, joint: Expr, hoh: Expr): Expr => iff(isJoint, joint, iff(isStatus("hoh"), hoh, single));

/** Printed FTB rate schedule: [over, fixed-dollar amount at that point] per row; rates are the same nine tiers every year. */
type Schedule = readonly (readonly [over: number, fixed: string])[];
const TIERS = [["1", "100"], ["2", "100"], ["4", "100"], ["6", "100"], ["8", "100"], ["93", "1000"], ["103", "1000"], ["113", "1000"], ["123", "1000"]] as const;
const schedule = (base: Expr, rows: Schedule): Expr =>
  printedSchedule(
    base,
    rows.map(([over, fixed], i) => ({
      thresholdCents: String(over * 100),
      fixedCents: fixed.replace(".", ""),
      rate: { num: TIERS[i][0], den: TIERS[i][1] },
    })),
  );
const scheduleText = (rows: Schedule): string =>
  rows.map(([over, fixed], i) => `over $${over.toLocaleString("en-US")}: $${fixed} + ${(Number(TIERS[i][0]) / Number(TIERS[i][1]) * 100).toFixed(2)}%`).join("; ");

type CaYear = {
  year: number;
  from: string;
  to: string;
  X: Schedule; // single, MFS
  Y: Schedule; // MFJ, QSS
  Z: Schedule; // HOH
  stdSingle: number;
  stdJoint: number;
  personalCredit: number;
  dependentCredit: number;
  phaseoutSingle: number;
  phaseoutJoint: number;
  phaseoutHoh: number;
  rentersSingle: number;
  rentersJoint: number;
  amtExempt: [single: number, joint: number, mfs: number];
  amtThreshold: [single: number, joint: number, mfs: number];
  sdiRate: [num: string, den: string];
  /** where each year's amounts come from */
  source: string;
  url: string;
};

const MEMO_2026 =
  "FTB memorandum 'Indexing, Personal Income Tax Law, 2026 Tax Year' (09.03.2026; CCPI June 2025 → June 2026 3.4%) and FTB Tax News, October 2026 ('2026 Indexing')";

const YEARS: CaYear[] = [
  {
    year: 2025,
    from: "2025-01-01",
    to: "2026-01-01",
    X: [[0, "0.00"], [11079, "110.79"], [26264, "414.49"], [41452, "1022.01"], [57542, "1987.41"], [72724, "3201.97"], [371479, "30986.19"], [445771, "38638.27"], [742953, "72219.84"]],
    Y: [[0, "0.00"], [22158, "221.58"], [52528, "828.98"], [82904, "2044.02"], [115084, "3974.82"], [145448, "6403.94"], [742958, "61972.37"], [891542, "77276.52"], [1485906, "144439.65"]],
    Z: [[0, "0.00"], [22173, "221.73"], [52530, "828.87"], [67716, "1436.31"], [83805, "2401.65"], [98990, "3616.45"], [505208, "41394.72"], [606251, "51802.15"], [1010417, "97472.91"]],
    stdSingle: 5706,
    stdJoint: 11412,
    personalCredit: 153,
    dependentCredit: 475,
    phaseoutSingle: 252203,
    phaseoutJoint: 504411,
    phaseoutHoh: 378310,
    rentersSingle: 53994,
    rentersJoint: 107988,
    amtExempt: [92749, 123667, 61830],
    amtThreshold: [347808, 463745, 231868],
    sdiRate: ["12", "1000"],
    source: "2025 California Tax Rate Schedules (FTB); 2025 FTB 540 booklet",
    url: "https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf",
  },
  {
    year: 2026,
    from: "2026-01-01",
    to: "2027-01-01",
    X: [[0, "0.00"], [11456, "114.56"], [27157, "428.58"], [42861, "1056.74"], [59498, "2054.96"], [75197, "3310.88"], [384109, "32039.70"], [460927, "39951.95"], [768213, "74675.27"]],
    Y: [[0, "0.00"], [22912, "229.12"], [54314, "857.16"], [85722, "2113.48"], [118996, "4109.92"], [150394, "6621.76"], [768218, "64079.39"], [921854, "79903.90"], [1536426, "149350.54"]],
    Z: [[0, "0.00"], [22927, "229.27"], [54316, "857.05"], [70018, "1485.13"], [86654, "2483.29"], [102356, "3739.45"], [522385, "42802.15"], [626864, "53563.49"], [1044771, "100786.98"]],
    stdSingle: 5900,
    stdJoint: 11800,
    personalCredit: 158,
    dependentCredit: 491,
    phaseoutSingle: 260778,
    phaseoutJoint: 521561,
    phaseoutHoh: 391173,
    rentersSingle: 55830,
    rentersJoint: 111660,
    amtExempt: [95902, 127872, 63932],
    amtThreshold: [359633, 479512, 239752],
    sdiRate: ["13", "1000"],
    source: `2026 California Tax Rate Schedules (FTB, 2026-540-tax-rate-schedules.pdf, 'Personal Income Tax Booklet 2026'); ${MEMO_2026}`,
    url: "https://www.ftb.ca.gov/forms/2026/2026-540-tax-rate-schedules.pdf",
  },
];

// ---------------------------------------------------------------------------
// Form 540 line 31 — tax table up to $100,000, rate schedule above
// ---------------------------------------------------------------------------

const TABLE_CONVENTION =
  "CALIFORNIA TAX TABLE (DEFAULT for taxable income of $100,000 or less — 'Use only if your taxable income on Form 540, line 19 is more than $100,000. If $100,000 or less, use the Tax Table.'): rows are $1-$50, then $100 rows 51-150, 151-250, …, 99,851-99,950, and a final $50 row 99,951-100,000. Each row's tax is the rate schedule at the row's WHOLE-DOLLAR midpoint, floor((at least + but not over) ÷ 2) — $25 for the first row, at least + $49 for a $100 row, $99,975 for the last — rounded to the nearest dollar. That convention reproduces every cell of the printed 2024 and 2025 FTB tables (1,001 rows × 3 columns each, both years); the half-dollar midpoint (at least + $49.50) misses 33 cells of the 2024 table and the HOH 99,651-99,750 row of 2025 ($3,682 printed). Line 19 is in whole dollars ('Use whole dollars only'), so taxable income is rounded to the dollar before the row is found. Above $100,000 the rate schedule applies directly, from the printed fixed-dollar amounts with the excess × rate rounded to cents (the printed 'How to Figure Tax' steps). useFormulaMethod applies the schedule at every income.";

const incomeTaxRule = (y: CaYear, version: number): Rule => {
  const base: Expr = max0(fact("stateTaxableIncome"));
  const scheduleFor = (b: Expr): Expr => byStatus(schedule(b, y.X), schedule(b, y.Y), schedule(b, y.Z));
  const whole = rd(base);
  const midpoint = iff(
    cmp("le", whole, dollars(50)),
    dollars(25),
    iff(
      cmp("ge", whole, dollars(99951)),
      dollars(99975),
      add(dollars(51 + 49), mulInt(dollars(100), stepUnits(sub(whole, dollars(51)), "10000", "floor"))),
    ),
  );
  return {
    id: "us.ca.income_tax",
    version,
    jurisdiction: "us.ca",
    title: `California income tax — ${y.year} Tax Table (to $100,000) and rate schedules X (single/MFS), Y (MFJ/QSS), Z (HOH), all nine tiers, Form 540 line 31`,
    citation: {
      source: `${y.source}; Rev. & Tax. Code § 17041`,
      section: `FTB ${y.year} Schedule X / Schedule Y / Schedule Z; ${y.year} California Tax Table`,
      url: y.url,
      excerpt:
        `${y.year} CALIFORNIA TAX RATE SCHEDULES (verbatim amounts, 'Enter on Form 540, line 31 … of the amount over'): SCHEDULE X (single or married/RDP filing separately): ${scheduleText(y.X)}. SCHEDULE Y (married/RDP filing jointly or qualifying surviving spouse/RDP): ${scheduleText(y.Y)}. SCHEDULE Z (head of household): ${scheduleText(y.Z)}. Each fixed amount equals the previous one plus the previous rate times the band, rounded to cents (checked for all 24 links each year). ${TABLE_CONVENTION}` +
        (y.year === 2026
          ? " The 2026 Tax Table itself prints in the 2026 Form 540 booklet (late December 2026); FTB's 09.03.2026 indexing memo says it is complete. Until then it is generated from the published 2026 schedules by the same convention, and no 2026 row depends on rounding the excess to cents first."
          : "") +
        " The 1% Behavioral Health Services Tax on taxable income over $1,000,000 is Form 540 line 62 (us.ca.bhst), not part of line 31. [Input: California taxable income, Form 540 line 19. Exemption credits → us.ca.exemption_credits; standard deduction → us.ca.standard_deduction.]",
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      tableThroughDollars: { value: "10000000", type: "money" }, // $100,000 — table at or below, schedule above
    },
    formula: iff(
      or(fact("useFormulaMethod"), cmp("gt", whole, param("tableThroughDollars"))),
      scheduleFor(base),
      iff(cmp("le", whole, money("0")), money("0"), rd(scheduleFor(midpoint))),
    ),
  };
};

// ---------------------------------------------------------------------------
// Form 540 line 18 standard deduction and line 32 exemption credits
// ---------------------------------------------------------------------------

const standardDeductionRule = (y: CaYear, version: number): Rule => ({
  id: "us.ca.standard_deduction",
  version,
  jurisdiction: "us.ca",
  title: `California standard deduction — ${y.year} (R&TC § 17073.5, Form 540 line 18)`,
  citation: {
    source: `R&TC § 17073.5; ${y.year === 2026 ? MEMO_2026 : "2025 FTB 540 booklet, line 18"}`,
    section: "R&TC § 17073.5",
    url: y.url,
    excerpt: `${y.year} standard deduction: $${y.stdSingle.toLocaleString("en-US")} for single or married/RDP filing separately; $${y.stdJoint.toLocaleString("en-US")} for married/RDP filing jointly, head of household, or qualifying surviving spouse/RDP.${y.year === 2026 ? " (FTB memo: 'The standard deduction amount for single or separate taxpayers will increase from $5,706 to $5,900 for tax year 2026. For joint, surviving spouse, or head of household taxpayers, the standard deduction increases from $11,412 to $11,800.')" : ""} Line 18 is the larger of this and the California itemized deduction. Not modeled: the Standard Deduction Worksheet for Dependents (a filer someone else can claim).`,
  },
  effectiveFrom: y.from,
  effectiveTo: y.to,
  output: { type: "money" },
  parameters: {
    singleMfs: { value: String(y.stdSingle * 100), type: "money" },
    jointHohQss: { value: String(y.stdJoint * 100), type: "money" },
  },
  formula: byStatus(param("singleMfs"), param("jointHohQss"), param("jointHohQss")),
});

const exemptionCreditsRule = (y: CaYear, version: number): Rule => {
  const agi = fact("caFederalAgi");
  const threshold = byStatus(param("thresholdSingleMfs"), param("thresholdJoint"), param("thresholdHoh"));
  // AGI Limitation Worksheet lines c-e: $6 per $2,500 ($1,250 MFS) of AGI over the threshold, a fraction counting as a whole step
  const lineC = max0(sub(agi, threshold));
  const lineD = iff(isStatus("mfs"), stepUnits(lineC, "125000", "ceil"), stepUnits(lineC, "250000", "ceil"));
  const lineE = mulInt(param("reductionPerStep"), lineD);
  const personal = fact("caPersonalExemptions"); // boxes on lines 7, 8 and 9
  const deps = fact("caDependentExemptions"); // box on line 10
  const lineI = max0(sub(mulInt(param("personalCredit"), personal), mulInt(lineE, personal)));
  const lineM = max0(sub(mulInt(param("dependentCredit"), deps), mulInt(lineE, deps)));
  return {
    id: "us.ca.exemption_credits",
    version,
    jurisdiction: "us.ca",
    title: `California exemption credits — ${y.year} personal, blind, senior and dependent credits with the AGI limitation (R&TC §§ 17054, 17054.1; Form 540 line 32)`,
    citation: {
      source: `R&TC §§ 17054, 17054.1; ${y.year === 2026 ? MEMO_2026 : "2025 FTB 540 booklet, line 32 and the AGI Limitation Worksheet"}`,
      section: "R&TC § 17054.1",
      url: y.url,
      excerpt:
        `${y.year}: personal, blind and senior exemption credit $${y.personalCredit} per box (lines 7, 8, 9 — two boxes on line 7 for a joint or surviving-spouse return, so $${y.personalCredit * 2}); dependent exemption credit $${y.dependentCredit} each (line 10). Line 32 is reduced when federal AGI (line 13) is more than $${y.phaseoutSingle.toLocaleString("en-US")} single or married/RDP filing separately, $${y.phaseoutJoint.toLocaleString("en-US")} married/RDP filing jointly or qualifying surviving spouse/RDP, $${y.phaseoutHoh.toLocaleString("en-US")} head of household. AGI LIMITATION WORKSHEET (2025 FTB 540 booklet, verbatim lines): 'c Subtract line b from line a. d Divide line c by $2,500 ($1,250 if married/RDP filing separately). If the result is not a whole number, round it to the next higher whole number. e Multiply line d by $6. f Add the numbers from the boxes on Form 540, lines 7, 8, and 9 (not the dollar amounts). g Multiply line e by line f. h Add the total dollar amount from Form 540, lines 7, 8, and 9. i Subtract line g from line h. If zero or less, enter -0-. j Enter the number from the box on Form 540, line 10 (not the dollar amount). k Multiply line e by line j. l Enter the dollar amount from Form 540, line 10. m Subtract line k from line l. If zero or less, enter -0-. n Add line i and line m. Enter the result here and on Form 540, line 32.' The FTB memo states the same reduction as '$6 ($12 joint)' per $2,500 ($1,250 MFS): $6 per box, and a joint return has two. [Inputs: caFederalAgi = Form 540 line 13; caPersonalExemptions = the boxes on lines 7-9; caDependentExemptions = the box on line 10.]`,
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      personalCredit: { value: String(y.personalCredit * 100), type: "money" },
      dependentCredit: { value: String(y.dependentCredit * 100), type: "money" },
      reductionPerStep: { value: "600", type: "money" },
      thresholdSingleMfs: { value: String(y.phaseoutSingle * 100), type: "money" },
      thresholdJoint: { value: String(y.phaseoutJoint * 100), type: "money" },
      thresholdHoh: { value: String(y.phaseoutHoh * 100), type: "money" },
    },
    formula: add(lineI, lineM),
  };
};

// ---------------------------------------------------------------------------
// CalEITC (FTB 3514) and the Young Child Tax Credit
// ---------------------------------------------------------------------------

/** California earned income (FTB 3514 Part IV): wages + net SE earnings − a Schedule C loss, floored at zero. */
const caEarnedIncome: Expr = max0(
  sub(
    add(fact("wages"), max0(sub(ruleRef("us.federal.se_net_profit"), ruleRef("us.federal.se_tax_half_deduction")))),
    fact("scheduleCNetLoss"),
  ),
);

/**
 * FTB 3514 Step 2 investment income worksheet, lines 1-12: taxable and tax-exempt interest,
 * dividends (Form 1040 line 3b, i.e. qualified plus nonqualified), and capital gain net income.
 * Form 8814 child income, passive income and personal-property rentals are not modeled.
 */
const caInvestmentIncome: Expr = add(
  fact("taxableInterest"),
  fact("taxExemptInterest"),
  fact("qualifiedDividends"),
  fact("ordinaryDividends"),
  ruleRef("us.federal.schedule_d.preferential_lt_gain"),
  ruleRef("us.federal.schedule_d.ordinary_st_gain"),
);

const eitcKids: Expr = add(fact("qualifyingChildren"), fact("eitcAdditionalQualifyingChildren"));
const kidsEq = (n: string): Expr => cmp("eq", eitcKids, { kind: "int", value: n });
const byKids = (k0: Expr, k1: Expr, k2: Expr, k3: Expr): Expr => iff(kidsEq("0"), k0, iff(kidsEq("1"), k1, iff(kidsEq("2"), k2, k3)));

const calEitcRule: Rule = (() => {
  // the printed EITC Table at a whole-dollar income, as an exact formula of the row's true midpoint
  const creditAt = (amount: Expr): Expr => {
    const x = rd(amount);
    const mid = sub(mulInt(dollars(50), stepUnits(x, "5000", "ceil")), money("2450")); // row 'at least Y-49, but not over Y': Y - $24.50
    // rates are the § 17052(b)(1) percentage × the 85% adjustment factor; floor to cents then
    // half-up to dollars rounds the exact product half-up (no double rounding)
    const at = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "floor" });
    const column = (eia: string, rate: [string, string], zero: string, gentle: [string, string]): Expr =>
      iff(
        cmp("le", mid, param(eia)),
        at(mid, ...rate), // phase-in
        { kind: "max", args: [at(sub(mulInt(param(eia), { kind: "int", value: "2" }), mid), ...rate), at(sub(param(zero), mid), ...gentle)] }, // steep, then gentle
      );
    const tableValue = byKids(
      column("earnedIncomeAmount0", ["2601", "40000"], "gentleZero0", ["459", "50000"]),
      column("earnedIncomeAmount1", ["289", "1000"], "gentleZero1", ["3009", "100000"]),
      column("earnedIncomeAmount2", ["17", "50"], "gentleZero2", ["4199", "100000"]),
      column("earnedIncomeAmount2", ["153", "400"], "gentleZero3", ["8517", "200000"]),
    );
    return iff(cmp("le", x, money("0")), money("0"), { kind: "max", args: [money("100"), rd(tableValue)] });
  };
  const agi = ruleRef("us.federal.agi");
  const atEarned = creditAt(caEarnedIncome);
  return {
    id: "us.ca.caleitc",
    version: 7, // v1-v6 fit the printed table piecewise and missed it on 775 of its 2,632 cells, ran out at $32,900 instead of $32,901, and never applied the investment-income limit; v7 encodes the statute's three segments exactly (every cell reproduced) and adds the limit
    jurisdiction: "us.ca",
    title: "California Earned Income Tax Credit (R&TC § 17052, FTB 3514) — 2025 EITC Table, Step 6 worksheet and investment income limit",
    citation: {
      source: "R&TC § 17052; 2025 FTB 3514 booklet (EITC Table, Steps 2 and 6); SB 1435 (Stats. 2026, ch. 233)",
      section: "R&TC § 17052",
      url: "https://www.ftb.ca.gov/forms/2025/2025-3514-booklet.pdf",
      excerpt:
        "2025 FTB 3514: 'Both your earned income and federal AGI must be less than $32,901'; Step 2: 'Is the amount on line 12 [investment income] more than $4,814? Yes Stop here, you cannot take the credit.' (SB 1435 keeps California's base disqualified-income amount at $3,400, indexed, whatever the federal § 32(i) amount). Step 6 (booklet p. 7): line 2 looks the credit up at California earned income; if federal AGI differs and is not less than $4,661 (no children) / $6,998 (one) / $9,823 (two or more), line 5 looks it up at federal AGI and the SMALLER is the credit. THE 2025 EITC TABLE (658 rows of $50, '$1 to $50' through '$32,851 to $32,900', four columns) equals, at each row's true midpoint m = (row's 'but not over' amount) − $24.50: (1) up to the earned income amount E = $4,661 / $6,998 / $9,823 / $9,823 (no / one / two / three or more children — R&TC § 17052(b)(2), indexed, the same figures as the Step 6 floors), the § 17052(b)(1) credit percentage 7.65% / 34% / 40% / 45% × the 85% adjustment factor × m; (2) above E, the larger of the same percentage × 85% × (2E − m) — the phaseout amount equals E, so the credit falls at the rate it rose — and a gentle line 85% × p × (Z − m) with p = 1.08% / 3.54% / 4.94% / 5.01% and Z = $32,958.00 / $32,894.40 / $32,894.70 / $32,886.40; each rounded half-up to the dollar, and never below $1 within the table (the three-or-more column's last row computes $0.47 and prints $1). This reproduces all 2,632 printed cells exactly; p and Z are the only values fit to the table, each the round figure inside a band the printed rows pin to under 0.0002% and $1. Earned income: wages + net earnings from self-employment (profit less ½ SE tax) − a Schedule C loss, whole dollars. Investment income: taxable and tax-exempt interest, dividends, and capital gain net income (FTB 3514 Step 2 lines 1, 2, 3 and 7; Form 8814, passive and personal-property rental income are not modeled). Kids = qualifyingChildren + eitcAdditionalQualifyingChildren. The 2026 table prints in the 2026 FTB 3514 booklet; until then a 2026 return has no rule here (FTB's 2026 memo publishes only E = $4,819 / $7,236 / $10,157, the $34,051 limit and the $4,978 investment limit — not the gentle segment).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      incomeLimit: { value: "3290100", type: "money" }, // earned income and federal AGI must be less than $32,901
      investmentIncomeLimit: { value: "481400", type: "money" }, // $4,814
      earnedIncomeAmount0: { value: "466100", type: "money" },
      earnedIncomeAmount1: { value: "699800", type: "money" },
      earnedIncomeAmount2: { value: "982300", type: "money" }, // two or more children
      gentleZero0: { value: "3295800", type: "money" },
      gentleZero1: { value: "3289440", type: "money" },
      gentleZero2: { value: "3289470", type: "money" },
      gentleZero3: { value: "3288640", type: "money" },
    },
    formula: iff(
      or(
        cmp("ge", caEarnedIncome, param("incomeLimit")),
        cmp("ge", agi, param("incomeLimit")),
        cmp("gt", caInvestmentIncome, param("investmentIncomeLimit")),
      ),
      money("0"),
      iff(
        // worksheet line 4: earned income and federal AGI the same → line 2 is the credit; line 5: AGI below the floor → line 2
        or(cmp("eq", rd(agi), rd(caEarnedIncome)), cmp("lt", agi, byKids(param("earnedIncomeAmount0"), param("earnedIncomeAmount1"), param("earnedIncomeAmount2"), param("earnedIncomeAmount2")))),
        atEarned,
        { kind: "min", args: [atEarned, creditAt(agi)] },
      ),
    ),
  };
})();

type YctcYear = { year: number; from: string; to: string; max: number; threshold: number; reductionPer100: string; agiCeiling: number; wageCap: number; version: number };

const yctcRule = (y: YctcYear): Rule => {
  const agi = ruleRef("us.federal.agi");
  // FTB 3514 lines 25-28: line 25 = earned − threshold; line 26 = line 25 ÷ 100 to two decimals, not rounded;
  // line 27 = line 26 × the reduction, two decimals, not rounded; line 28 = maximum − line 27, '$1' between $0 and $1
  const excess = sub(caEarnedIncome, param("phaseOutStart"));
  const line26Hundredths = stepUnits(excess, "100", "floor");
  const line27Cents = mulInt(money("1"), stepUnits(mulInt(param("reductionPer100"), line26Hundredths), "100", "floor"));
  const line28 = sub(param("maxCredit"), line27Cents);
  const rounded = iff(cmp("le", line28, money("0")), money("0"), iff(cmp("le", line28, money("100")), money("100"), rd(line28)));
  // Step 8: 'You have been allowed the California EITC on this form if your California earned income is greater than zero'
  const calEitcAllowed: Expr =
    y.year === 2025
      ? cmp("gt", ruleRef("us.ca.caleitc"), money("0"))
      : and(
          cmp("lt", caEarnedIncome, param("calEitcIncomeLimit")),
          cmp("lt", agi, param("calEitcIncomeLimit")),
          cmp("le", caInvestmentIncome, param("calEitcInvestmentLimit")),
        );
  return {
    id: "us.ca.yctc",
    version: y.version,
    jurisdiction: "us.ca",
    title: `California Young Child Tax Credit (R&TC § 17052.1, FTB 3514) — ${y.year}`,
    citation: {
      source: `R&TC § 17052.1; ${y.year === 2026 ? MEMO_2026 : "2025 FTB 3514 booklet, General Information and Step 8"}`,
      section: "R&TC § 17052.1",
      url: y.year === 2026 ? "https://www.caltax.org/regulatory-issues/ftb/2026-PIT-Indexing-Memo.pdf" : "https://www.ftb.ca.gov/forms/2025/2025-3514-booklet.pdf",
      excerpt:
        (y.year === 2026
          ? "FTB 2026 indexing memo (verbatim): 'The maximum credit for taxable year 2026 is $1,229.' … 'For taxable year 2026, the cap for net losses or wages, salaries, tips, and other employee compensation is $36,852.' … 'For taxable year January 1, 2026, the graduated reduction amount is $21.58 per $100 in excess of the threshold amount. The credit amount phases out as earned income exceeds the “threshold amount” of $28,357, and completely phases out at $34,051.' The qualifying child is still one 'younger than six years old on the last day of the taxable year' (AB 1690, which would have raised the age from 2026, was last acted on in Assembly Appropriations in May 2026; the September 2026 memo describes the under-six rule). CalEITC eligibility (Step 8) for 2026 is tested directly — earned income and federal AGI under $34,051 and investment income not over $4,978 (memo) — because every row of the EITC Table below the limit prints at least $1 (2025: all 658 rows), so 'allowed the California EITC' is the eligibility test; the 2026 CalEITC amount itself waits for the 2026 table."
          : "2025 YCTC (verbatim from the FTB 3514 booklet): 'the maximum amount of credit allowable for a qualified taxpayer is $1,189 and the credit amount phases out as earned income exceeds the threshold amount of $27,425, and completely phases out at $32,901.' Line 23a: wages over $35,640 → no credit; line 23b: federal AGI over $32,900 → no credit.") +
        " Requires a qualifying child under six at year end (hasChildUnderSix) and, when earned income is above zero, the California EITC allowed on the same form. Lines 25-28 are computed as printed: line 26 and line 27 to two decimals without rounding, line 28 '$1' when between $0 and $1, otherwise rounded to the dollar. Not modeled: the 'total net loss' cap on line 23b (a filer with no earned income or a net loss).",
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      maxCredit: { value: String(y.max * 100), type: "money" },
      phaseOutStart: { value: String(y.threshold * 100), type: "money" },
      reductionPer100: { value: y.reductionPer100, type: "money" },
      agiCeiling: { value: String(y.agiCeiling * 100), type: "money" },
      wageCeiling: { value: String(y.wageCap * 100), type: "money" },
      ...(y.year === 2025
        ? {}
        : {
            calEitcIncomeLimit: { value: "3405100", type: "money" as const }, // CalEITC: AGI 'of less than $34,051'
            calEitcInvestmentLimit: { value: "497800", type: "money" as const }, // $4,978
          }),
    },
    formula: iff(
      or(
        not(fact("hasChildUnderSix")),
        and(cmp("gt", caEarnedIncome, money("0")), not(calEitcAllowed)),
        cmp("gt", agi, param("agiCeiling")),
        cmp("gt", fact("wages"), param("wageCeiling")),
      ),
      money("0"),
      iff(cmp("le", caEarnedIncome, param("phaseOutStart")), param("maxCredit"), rounded),
    ),
  };
};

// ---------------------------------------------------------------------------
// Renter's credit, CDCC, AMT, BHST, parameters
// ---------------------------------------------------------------------------

const rentersRule = (y: CaYear, version: number): Rule => ({
  id: "us.ca.renters_credit",
  version,
  jurisdiction: "us.ca",
  title: `California nonrefundable renter's credit (R&TC § 17053.5, FTB 540) — ${y.year}`,
  citation: {
    source: `R&TC § 17053.5; ${y.year === 2026 ? MEMO_2026 : "2025 FTB 540 booklet (Nonrefundable Renter's Credit Qualification Record)"}`,
    section: "R&TC § 17053.5",
    url: y.url,
    excerpt:
      `${y.year} nonrefundable renter's credit: $60 for single or married/RDP filing separately with California AGI of $${y.rentersSingle.toLocaleString("en-US")} or less; $120 for married/RDP filing jointly, head of household, or qualifying surviving spouse/RDP with California AGI of $${y.rentersJoint.toLocaleString("en-US")} or less — nothing once California AGI is over the limit (a cliff). The qualification record (2025 booklet, question 2, verbatim): 'Is your California adjusted gross income the amount on line 17: $53,994 or less if single or married/RDP filing separately; or $107,988 or less if married/RDP filing jointly, head of household, or qualifying surviving spouse/RDP?' — CALIFORNIA AGI, Form 540 line 17, not federal AGI, so the California subtractions (taxable social security, unemployment compensation) count. Eligibility (caRentedPrincipalResidence): rented a California principal residence for at least half the year, not claimed as a dependent, property not exempt from property tax. AB 130 (2025) authorized higher amounts only on a future appropriation, which has not been made; these are the base $60/$120. [Input: caAgi = Form 540 line 17.]`,
  },
  effectiveFrom: y.from,
  effectiveTo: y.to,
  output: { type: "money" },
  parameters: {
    creditSingleMfs: { value: "6000", type: "money" },
    creditJointHohQss: { value: "12000", type: "money" },
    agiCeilingSingleMfs: { value: String(y.rentersSingle * 100), type: "money" },
    agiCeilingJointHohQss: { value: String(y.rentersJoint * 100), type: "money" },
  },
  formula: iff(
    not(fact("caRentedPrincipalResidence")),
    money("0"),
    iff(
      or(isStatus("mfj"), isStatus("hoh"), isStatus("qss")),
      iff(cmp("le", fact("caAgi"), param("agiCeilingJointHohQss")), param("creditJointHohQss"), money("0")),
      iff(cmp("le", fact("caAgi"), param("agiCeilingSingleMfs")), param("creditSingleMfs"), money("0")),
    ),
  ),
});

const cdccRule = (y: CaYear, version: number): Rule => ({
  id: "us.ca.cdcc",
  version,
  jurisdiction: "us.ca",
  title: `California child and dependent care expenses credit (R&TC § 17052.6, FTB 3506) — ${y.year}`,
  citation: {
    source: `R&TC § 17052.6; 2025 FTB 3506 (Child and Dependent Care Expenses Credit)`,
    section: "R&TC § 17052.6",
    url: "https://www.ftb.ca.gov/forms/2025/2025-3506.pdf",
    excerpt:
      `${y.year} CA CDCC: a PERCENTAGE of the FEDERAL child and dependent care credit (us.federal.cdcc), keyed to federal AGI: 50% if AGI ≤ $40,000; 43% if AGI is over $40,000 but not over $70,000; 34% if AGI is over $70,000 but not over $100,000; $0 (no credit) if AGI exceeds $100,000 — a CLIFF at each breakpoint, not a smooth phase-down. NONREFUNDABLE. The tiers are fixed dollar amounts in the statute, not indexed (absent from FTB's 2026 indexing memo), so they carry to 2026 unchanged. Requires the same earned-income-of-both-spouses gate as the federal credit. Parameters-only: apply the tier percentage to us.federal.cdcc and disclose.`,
  },
  effectiveFrom: y.from,
  effectiveTo: y.to,
  output: { type: "money" },
  parameters: {
    pctAgiUpTo40k: { value: "50", type: "int" },
    pctAgi40kTo70k: { value: "43", type: "int" },
    pctAgi70kTo100k: { value: "34", type: "int" },
    agiTier1Max: { value: "4000000", type: "money" },
    agiTier2Max: { value: "7000000", type: "money" },
    agiTier3Max: { value: "10000000", type: "money" },
  },
  formula: {
    kind: "unsupported",
    reason:
      "parameters-only rule: California's CDCC is a % of the federal CDCC (us.federal.cdcc) selected by the AGI tier documented in this rule's parameters — evaluate us.federal.cdcc, apply the tier percentage, and disclose",
  },
});

const amtRule = (y: CaYear, version: number): Rule => {
  const [exS, exJ, exM] = y.amtExempt;
  const [thS, thJ, thM] = y.amtThreshold;
  // the MFS AMTI at which the exemption is fully phased out — above it Schedule P's line 21 worksheet adds back
  const mfsStacking = thM + 4 * exM;
  const byStatusAmt = (single: string, joint: string, mfs: string): Expr => ({
    kind: "match",
    on: fact("filingStatus"),
    cases: [
      { when: "single", value: param(single) },
      { when: "hoh", value: param(single) },
      { when: "mfj", value: param(joint) },
      { when: "qss", value: param(joint) },
      { when: "mfs", value: param(mfs) },
    ],
  });
  const exemptionPhased = max0(sub(byStatusAmt("exemptSingleHoh", "exemptMfj", "exemptMfs"), { kind: "mulRate", base: max0(sub(fact("caAmti"), byStatusAmt("threshSingleHoh", "threshMfj", "threshMfs"))), rate: { num: "25", den: "100" }, round: "half-up" }));
  const tmt: Expr = { kind: "mulRate", base: max0(sub(fact("caAmti"), exemptionPhased)), rate: { num: "7", den: "100" }, round: "half-up" };
  return {
    id: "us.ca.amt",
    version,
    jurisdiction: "us.ca",
    title: `California alternative minimum tax — Schedule P (540), Part II (${y.year})`,
    citation: {
      source: `R&TC §§ 17062, 17062.1; ${y.year === 2026 ? MEMO_2026 : "2025 FTB Schedule P (540) instructions"}`,
      section: "R&TC § 17062(a)-(e); § 17062.1",
      url: y.year === 2026 ? "https://www.caltax.org/regulatory-issues/ftb/2026-PIT-Indexing-Memo.pdf" : "https://www.ftb.ca.gov/forms/2025/2025-540-p-instructions.html",
      excerpt:
        `THIS RULE TAKES caAmti AS AN INPUT — it applies the exemption/TMT/comparison mechanics only; it does not construct AMTI itself (see the caAmti fact for the R&TC § 17062(c)-(e) and § 17062.1 construction: IRC §§ 55-59 frozen as of January 1, 2015; standard deduction added back; no private-activity-bond preference; no AMT foreign tax credit; the under-$1,000,000-gross-receipts business exclusion). ${y.year} exemption: $${exS.toLocaleString("en-US")} single/HOH, $${exJ.toLocaleString("en-US")} MFJ/QSS, $${exM.toLocaleString("en-US")} MFS; phased out 25 cents per dollar of caAmti over $${thS.toLocaleString("en-US")} single/HOH, $${thJ.toLocaleString("en-US")} MFJ/QSS, $${thM.toLocaleString("en-US")} MFS, not below $0.${y.year === 2026 ? " (FTB memo: 'The exemption amounts for taxable year 2026 are: Joint, or surviving spouse -- $127,872; Single, or unmarried -- $95,902; Separate, or an estate or trust -- $63,932. Starting initial amounts for AMT exemption phase outs are: Joint, or surviving spouse -- $479,512; Single, or unmarried -- $359,633; Separate, or an estate or trust -- $239,752.')" : ""} Rate: 7% (R&TC § 17062(b)(3)(A)(iv)) of caAmti less the exemption = the tentative minimum tax; AMT = the excess over the regular tax (caRegularTax — Schedule P line 25: Form 540 line 31 BEFORE exemption credits; worked example: TMT 25,484 − 12,038 = 13,446). MFS: above $${mfsStacking.toLocaleString("en-US")} of caAmti (the point where the MFS exemption is fully phased out: $${thM.toLocaleString("en-US")} + 4 × $${exM.toLocaleString("en-US")}${y.year === 2025 ? " — the figure the 2025 Schedule P instructions print" : ""}) Schedule P's line 21 worksheet adds the lesser of 25% of the excess or $${exM.toLocaleString("en-US")} to AMTI — not modeled, so this rule refuses there. Not modeled: the § 59(j) children-under-24 cap (earned income + $10,000 for 2026) and Part III credit ordering.`,
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      exemptSingleHoh: { value: String(exS * 100), type: "money" },
      exemptMfj: { value: String(exJ * 100), type: "money" },
      exemptMfs: { value: String(exM * 100), type: "money" },
      threshSingleHoh: { value: String(thS * 100), type: "money" },
      threshMfj: { value: String(thJ * 100), type: "money" },
      threshMfs: { value: String(thM * 100), type: "money" },
      mfsStackingThreshold: { value: String(mfsStacking * 100), type: "money" },
    },
    formula: iff(
      and(isStatus("mfs"), cmp("gt", fact("caAmti"), param("mfsStackingThreshold"))),
      {
        kind: "unsupported",
        reason: `MFS caAmti above $${mfsStacking.toLocaleString("en-US")} requires the Schedule P (540) Line 21 stacking add-back (the lesser of 25% of the excess or $${exM.toLocaleString("en-US")}) applied to caAmti BEFORE this rule's exemption/phase-out math — not modeled; recompute caAmti with that add-back and re-run, or work Schedule P (540) directly`,
      },
      max0(sub(tmt, fact("caRegularTax"))),
    ),
  };
};

const bhstRule = (y: CaYear, version: number): Rule => ({
  id: "us.ca.bhst",
  version,
  jurisdiction: "us.ca",
  title: `California Behavioral Health Services Tax (formerly Mental Health Services Tax) — Form 540 line 62 (${y.year})`,
  citation: {
    source: `R&TC § 17043; 2025 FTB Form 540 instructions, "Line 62 – Behavioral Health Services Tax"`,
    section: "R&TC § 17043",
    url: "https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html",
    excerpt:
      "Flat 1% tax on the portion of CA taxable income (Form 540 line 19) over $1,000,000 (R&TC § 17043(a)) — renamed the 'Behavioral Health Services Tax' by Prop 1 (2024); same statute, same $1,000,000 threshold, unchanged since operative January 1, 2005 and not indexed. The $1,000,000 threshold is FLAT for every filing status — R&TC § 17043(c) turns off § 17041 bracket recomputation and § 17045 joint-return combining but does NOT halve it for MFS (the '$500,000 MFS' figure belongs to the FTB 5805 estimated-tax safe harbor, a different rule). No credits reduce this tax (§ 17043(c)(1)).",
  },
  effectiveFrom: y.from,
  effectiveTo: y.to,
  output: { type: "money" },
  parameters: { threshold: { value: "100000000", type: "money" } },
  formula: { kind: "mulRate", base: max0(sub(fact("stateTaxableIncome"), param("threshold"))), rate: { num: "1", den: "100" }, round: "half-up" },
});

const parametersRule = (y: CaYear, version: number): Rule => ({
  id: "us.ca.parameters",
  version,
  jurisdiction: "us.ca",
  title: `California ${y.year} miscellaneous parameters — use tax table, SDI rate`,
  citation: {
    source: y.year === 2026 ? "EDD contribution rates and withholding schedules, 2026 (SB 951)" : "Rev. & Tax. Code § 6452; 2025 FTB 540 use tax worksheet; EDD contribution rates (SB 951)",
    section: "Use Tax Worksheet; SDI rate",
    url: y.year === 2026 ? "https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/" : "https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf",
    excerpt:
      y.year === 2026
        ? "SDI (State Disability Insurance and Paid Family Leave, EDD): the 2026 withholding rate is 1.3% of ALL wages — SB 951 removed the taxable wage limit from January 1, 2024, so there is no 'excess SDI' credit. The 2026 use tax lookup table prints in the 2026 Form 540 booklet; pass the worksheet amount (useTax) for a 2026 return."
        : "USE TAX (2025 FTB 540 use tax lookup table, no-receipts estimate keyed to CA AGI, illustrative rows): under $10,000 → $1 … $150,000–$174,999 → $17, $175,000–$199,999 → $19; above $199,999, multiply CA AGI by 0.010% and round to the nearest whole dollar. SDI (EDD, SB 951): 2025 rate 1.2% of ALL wages with NO taxable wage cap (removed starting 2024) — no 'excess SDI' credit applies.",
  },
  effectiveFrom: y.from,
  effectiveTo: y.to,
  output: { type: "money" },
  parameters: {
    sdiRatePct: { value: y.sdiRate[0], type: "int" }, // ×10, see sdiRateDen
    sdiRateDen: { value: y.sdiRate[1], type: "int" },
  },
  formula: {
    kind: "unsupported",
    reason:
      "parameters-only rule: California use-tax lookup table and SDI rate are documented in this rule's citation for lookup_tax_parameter — no single oracle formula (use tax is agent-composed from the FTB table; SDI is withheld, not computed on the return)",
  },
});

const [Y2025, Y2026] = YEARS;

export const caRules: Rule[] = [
  // v2 refused MFJ/QSS entirely; v3 encoded Schedule Y per bracket; v4 disclosed the Schedule CA social security exclusion; v5 encoded the Tax Table at the half-dollar midpoint;
  // v6 encodes all nine tiers from the printed schedules (v5 taxed single/MFS income between $371,479 and $505,208 at 9.3%, refused above), the whole-dollar midpoint, and the table through $100,000 inclusive
  incomeTaxRule(Y2025, 6),
  incomeTaxRule(Y2026, 7),
  standardDeductionRule(Y2025, 1),
  standardDeductionRule(Y2026, 2),
  exemptionCreditsRule(Y2025, 1),
  exemptionCreditsRule(Y2026, 2),
  calEitcRule,
  yctcRule({ year: 2025, from: "2025-01-01", to: "2026-01-01", max: 1189, threshold: 27425, reductionPer100: "2171", agiCeiling: 32900, wageCap: 35640, version: 2 }),
  yctcRule({ year: 2026, from: "2026-01-01", to: "2027-01-01", max: 1229, threshold: 28357, reductionPer100: "2158", agiCeiling: 34050, wageCap: 36852, version: 3 }),
  // v2 refused with a federal NOL or excess business loss in federal AGI; v3 tests California AGI (line 17) as the qualification record asks, and the joint limit is $107,988 (v1-v2: $107,987)
  rentersRule(Y2025, 3),
  rentersRule(Y2026, 4),
  cdccRule(Y2025, 2), // v1 carried the same 2025 tiers; v2 adds the not-indexed note
  cdccRule(Y2026, 3),
  amtRule(Y2025, 3), // v2's construction note started AMTI from taxable income floored at zero; v3 rebuilt from the year table (same 2025 amounts)
  amtRule(Y2026, 4),
  bhstRule(Y2025, 2), // v1: same tax, longer note
  bhstRule(Y2026, 3),
  parametersRule(Y2025, 2), // v1 also carried a TY2026 note, now its own version
  parametersRule(Y2026, 3),
];
