/**
 * Form 2210 — Underpayment of Estimated Tax by Individuals (26 U.S.C. § 6654),
 * composed from the printed 2025 form and its instructions (i2210, 2025):
 *
 *   Part I    required annual payment (lines 1–9)
 *   Sched. AI annualized income installment method (lines 1–27), every column
 *             computed by the engine itself on the period's ANNUALIZED facts
 *   Part III  Section A underpayments (lines 10–18) and the Section B penalty
 *             worksheet (payments applied to the earliest underpayment first;
 *             days per rate period; rate × days / 365, or 366 in a leap year)
 *
 * The engine is injected (`run`), so this module holds only the form's own
 * arithmetic and line structure; every tax amount it uses is an engine target.
 *
 * Schedule AI semantics. The instructions annualize each item rather than the
 * finished tax: line 3 annualizes AGI, line 6 annualizes itemized deductions,
 * line 7 takes the standard deduction IN FULL, line 18 says "annualize any
 * item of income or deduction used to figure each credit", line 16 says to
 * annualize AMTI "before subtracting the AMT exemption", and Part II's
 * factor-embedded rates and prorated limits equal Schedule SE run on
 * annualized net earnings against annualized wages. So each column here is the
 * whole return evaluated on the period's facts × the annualization amount
 * (4, 2.4, 1.5, 1), and lines 14–19 are read off that evaluation. Where the
 * form leaves the order of an annual cap and the annualization open, the
 * column REFUSES instead of picking one (see `scheduleAIScope`).
 */

import type { Cents } from "./money.js";

// ---------------------------------------------------------------------------
// facts

export type TypedFact =
  | { type: "money"; value: string }
  | { type: "int"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "enum"; value: string }
  | { type: "rate"; value: string };
export type TypedFacts = Record<string, TypedFact>;

/** Evaluate one engine target on the given facts; money targets return cents. */
export type TargetRunner = (facts: TypedFacts, target: string) => Cents;

/**
 * Every money fact the federal net-tax derivation can read, classified for
 * Schedule AI. A test walks the corpus and fails if one goes unclassified.
 *  - "annualize": an amount received, paid or incurred during the year — the
 *    period's cumulative amount × the annualization factor;
 *  - "keep": a balance, basis, prior-year figure or payment — used as is;
 *  - "refuse": nonzero → Schedule AI refuses (the reason says why).
 */
export const SCHEDULE_AI_FACTS: Record<string, "annualize" | "keep" | { refuse: string }> = {
  // income
  wages: "annualize",
  taxableInterest: "annualize",
  taxExemptInterest: "annualize",
  ordinaryDividends: "annualize",
  qualifiedDividends: "annualize",
  shortTermCapitalGains: "annualize",
  shortTermCapitalLoss: "annualize",
  longTermCapitalGains: "annualize",
  longTermCapitalLoss: "annualize",
  netCapitalLoss: "annualize",
  selfEmploymentNetProfit: "annualize",
  spouseSelfEmploymentNetProfit: "annualize",
  scheduleCNetLoss: "annualize",
  k1OrdinaryBusinessLoss: "annualize",
  k1OrdinaryBusinessIncome: "annualize",
  taxableIraDistributions: "annualize",
  taxablePensionsAndAnnuities: "annualize",
  unemploymentCompensation: "annualize",
  otherOrdinaryIncome: "annualize",
  alimonyReceivedPre2019: "annualize",
  hsaDistributions: "annualize",
  hsaQualifiedMedicalExpenses: "annualize",
  scheduleENetIncome: "annualize",
  rentalIncomeBeforeDepreciation: "annualize",
  nonpassiveScheduleELoss: "annualize",
  socialSecurityBenefits: "annualize",
  socialSecurityWages: "annualize",
  spouseSocialSecurityWages: "annualize",
  medicareWages: "annualize",
  gamblingWinnings: "annualize",
  qualifiedTips: "annualize",
  qualifiedOvertimePremium: "annualize",
  scheduleRDisabilityIncome: "annualize",
  nontaxableBenefitsForScheduleR: "annualize",
  earlyDistributionSubjectToPenalty: "annualize",
  amtIsoExerciseSpread: "annualize",
  amtOtherPreferences: "annualize",
  // Form 4797: a sale is an amount of the period it falls in; the lookback is a prior-year balance
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [
      [`businessProperty${i}SalesPrice`, "annualize"],
      [`businessProperty${i}CostBasis`, "annualize"],
      [`businessProperty${i}Depreciation`, "annualize"],
      [`businessProperty${i}AdditionalDepreciation`, "annualize"],
    ]),
  ),
  k1Section1231Gain: "annualize",
  k1Section1231Loss: "annualize",
  k1UnrecapturedSection1250Gain: "annualize",
  unrecapturedSection1250GainDistributions: "annualize",
  section1231LookbackLosses: { refuse: "the § 1231 lookback is a balance from earlier years, not an amount of the period; the instructions don't say how it applies to a period" },
  // Form 3800: business credits and their carryforwards
  generalBusinessCreditNonpassive: { refuse: "the Schedule AI instructions don't say how a general business credit is figured for a period" },
  specifiedCreditNonpassive: { refuse: "the Schedule AI instructions don't say how a general business credit is figured for a period" },
  generalBusinessCreditCarryforward: { refuse: "a business credit carried in from earlier years is not an amount of the period; the instructions don't say how it is treated" },
  specifiedCreditCarryforward: { refuse: "a business credit carried in from earlier years is not an amount of the period; the instructions don't say how it is treated" },
  // passive activities (Form 8582): the year's income, losses and gains are period amounts;
  // losses carried in from earlier years are not, like an NOL carryover
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [
      [`passiveActivity${i}Income`, "annualize"],
      [`passiveActivity${i}Loss`, "annualize"],
      [`passiveActivity${i}DispositionGain`, "annualize"],
      [`passiveActivity${i}DispositionLoss`, "annualize"],
      [`passiveActivity${i}PriorUnallowed`, { refuse: "a passive loss carried in from earlier years is not an amount of the period; the instructions don't say whether it is annualized" }],
      [`passiveActivity${i}PriorUnallowedPre2018`, { refuse: "a passive loss carried in from earlier years is not an amount of the period; the instructions don't say whether it is annualized" }],
      [`passiveActivity${i}Credit`, { refuse: "the Schedule AI instructions don't say how a general business credit is figured for a period" }],
      [`passiveActivity${i}PriorUnallowedCredit`, { refuse: "a passive credit carried in from earlier years is not an amount of the period; the instructions don't say how it is treated" }],
    ]),
  ),
  // QBI (the businesses' income and W-2 wages are the period's; UBIA is basis)
  qbiBusiness2Income: "annualize",
  qbiBusiness3Income: "annualize",
  qbiBusiness4Income: "annualize",
  qbiBusiness5Income: "annualize",
  qbiBusiness6Income: "annualize",
  qbiLossOffset: "annualize",
  qbiW2Wages: "annualize",
  spouseQbiW2Wages: "annualize",
  qbiBusiness2W2Wages: "annualize",
  qbiBusiness3W2Wages: "annualize",
  qbiBusiness4W2Wages: "annualize",
  qbiBusiness5W2Wages: "annualize",
  qbiBusiness6W2Wages: "annualize",
  qbiUBIA: "keep",
  spouseQbiUBIA: "keep",
  qbiBusiness2UBIA: "keep",
  qbiBusiness3UBIA: "keep",
  qbiBusiness4UBIA: "keep",
  qbiBusiness5UBIA: "keep",
  qbiBusiness6UBIA: "keep",
  // adjustments
  hsaContribution: "annualize",
  sepContribution: "annualize",
  selfEmployedHealthPremiums: "annualize",
  educatorExpenses: "annualize",
  spouseEducatorExpenses: "annualize",
  earlyWithdrawalPenaltyPaid: "annualize",
  alimonyPaidPre2019: "annualize",
  otherAdjustments: "annualize",
  iraContribution: "annualize",
  studentLoanInterest: "annualize",
  // itemized and Schedule 1-A deductions
  stateAndLocalTaxesPaid: "annualize",
  mortgageInterestPaid: "annualize",
  mortgageAverageBalance: "keep",
  charitableCashContributions: "annualize",
  noncashCharitableContributions: "annualize",
  medicalExpenses: "annualize",
  casualtyFederalDisasterLosses: "annualize",
  casualtyQualifiedDisasterLosses: "annualize",
  investmentInterestDeduction: "annualize",
  gamblingLossesItemized: "annualize",
  otherItemizedDeductions: "annualize",
  carLoanInterest: "annualize",
  niitInvestmentExpenses: "annualize",
  // credits (Schedule AI line 18: the items used to figure each credit are annualized)
  dependentCareExpenses: "annualize",
  secondaryEarnedIncome: "annualize",
  aotcExpensesStudent1: "annualize",
  aotcExpensesStudent2: "annualize",
  aotcExpensesStudent3: "annualize",
  llcQualifiedExpenses: "annualize",
  saversContributions: "annualize",
  saversContributionsSpouse: "annualize",
  qualifiedAdoptionExpenses: "annualize",
  insulationAirSealingCosts: "annualize",
  exteriorDoorMostExpensiveCost: "annualize",
  exteriorDoorOtherCosts: "annualize",
  windowsSkylightsCosts: "annualize",
  centralAirConditionerCosts: "annualize",
  gasOilWaterHeaterCosts: "annualize",
  gasOilFurnaceBoilerCosts: "annualize",
  electricalPanelCosts: "annualize",
  homeEnergyAuditCosts: "annualize",
  heatPumpBiomassCosts: "annualize",
  solarElectricCosts: "annualize",
  solarWaterHeatingCosts: "annualize",
  smallWindEnergyCosts: "annualize",
  geothermalHeatPumpCosts: "annualize",
  batteryStorageCosts: "annualize",
  fuelCellPropertyCosts: "annualize",
  // bases and balances
  pensionCostBasis: "keep",
  pensionBasisPreviouslyRecovered: "keep",
  rentalDepreciableBasis: "keep",
  // payments are Part III inputs, never income
  federalTaxWithheld: "keep",
  federalEstimatedPayments: "keep",
  federalExtensionPayment: "keep",
  priorYearTax: "keep",
  priorYearAGI: "keep",
  // out of scope: the form or the statute treats these differently by period
  foreignEarnedIncome: { refuse: "the foreign earned income exclusion is prorated by qualifying days (§ 911(b)(2)(A)), which Schedule AI does not annualize by a single factor" },
  priorYearShortTermCapitalLossCarryover: { refuse: "a prior-year capital loss carryover is not an amount of the period; neither the form nor the instructions say whether it is annualized" },
  priorYearLongTermCapitalLossCarryover: { refuse: "a prior-year capital loss carryover is not an amount of the period; neither the form nor the instructions say whether it is annualized" },
  nolCarryforwardPre2018: { refuse: "a net operating loss carryover from earlier years is not an amount of the period; the instructions don't say whether it is annualized" },
  nolCarryforwardPost2017: { refuse: "a net operating loss carryover from earlier years is not an amount of the period; the instructions don't say whether it is annualized" },
  nolCarryforwardFromExcessBusinessLoss: { refuse: "a net operating loss carryover from earlier years is not an amount of the period; the instructions don't say whether it is annualized" },
  alternativeTaxNolDeduction: { refuse: "an alternative tax net operating loss carryover is not an amount of the period; the instructions don't say whether it is annualized" },
  qbiLossCarryforward: { refuse: "a prior-year qualified business loss carryforward is not an amount of the period; the instructions don't say whether it is annualized" },
  residentialCleanEnergyCarryforward: { refuse: "a prior-year credit carryforward is not an amount of the period" },
  advancePTC: { refuse: "the premium tax credit is reconciled by coverage month (§ 36B(b)(2)), not by annualizing a period" },
  slcspAnnualPremium: { refuse: "the premium tax credit is reconciled by coverage month (§ 36B(b)(2)), not by annualizing a period" },
  marketplacePremiumsPaid: { refuse: "the premium tax credit is reconciled by coverage month (§ 36B(b)(2)), not by annualizing a period" },
  parentTaxableIncome: { refuse: "Form 8615 uses the parent's annual taxable income" },
  pensionGrossPayments: { refuse: "the simplified method's tax-free part is a per-payment amount (§ 72(d)), not an annualized one — enter taxablePensionsAndAnnuities instead" },
  householdEmployeeCashWages: { refuse: "Schedule H thresholds apply to the calendar year's wages (§ 3121(x)), and the instructions give no period method" },
};

/** Bool/int facts that change how a period must be figured. */
function scopeFlags(facts: TypedFacts): string[] {
  const out: string[] = [];
  const b = (id: string) => facts[id]?.type === "bool" && facts[id].value === true;
  if (b("isClaimedAsDependent"))
    out.push("a dependent's standard deduction depends on the year's earned income (§ 63(c)(5)); line 7 takes the deduction in full, which the period's annualized earned income would change");
  if (b("isSubjectToKiddieTax")) out.push("Form 8615 uses the parent's annual taxable income");
  const month = facts.rentalPlacedInServiceMonth;
  if (month && month.type === "int" && BigInt(month.value) > 0n && money(facts, "rentalDepreciableBasis") > 0n)
    out.push("rental property placed in service this year: its first-year depreciation depends on the month (Pub. 946 Table A-6), not on an annualized period");
  return out;
}

const money = (facts: TypedFacts, id: string): Cents => {
  const f = facts[id];
  return f && f.type === "money" ? BigInt(f.value) : 0n;
};

// ---------------------------------------------------------------------------
// dates

/** days since 1970-01-01 (UTC) for an ISO date */
const dayNum = (iso: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`invalid date "${iso}" (use YYYY-MM-DD)`);
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const d = new Date(t);
  if (d.toISOString().slice(0, 10) !== iso) throw new Error(`invalid date "${iso}"`);
  return Math.round(t / 86_400_000);
};
const isoOf = (n: number): string => new Date(n * 86_400_000).toISOString().slice(0, 10);
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** nth weekday (0=Sun) of a month, UTC day number */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  const first = Date.UTC(y, m - 1, 1) / 86_400_000;
  const dow = new Date(first * 86_400_000).getUTCDay();
  return first + ((weekday - dow + 7) % 7) + (n - 1) * 7;
}
/** a fixed-date holiday's observed day (Saturday → Friday, Sunday → Monday; 5 U.S.C. § 6103(b)) */
function observed(y: number, m: number, d: number): number {
  const n = Date.UTC(y, m - 1, d) / 86_400_000;
  const dow = new Date(n * 86_400_000).getUTCDay();
  return dow === 6 ? n - 1 : dow === 0 ? n + 1 : n;
}
/**
 * § 7503: legal holidays in the District of Columbia that can fall on an
 * estimated-tax due date's next-business-day search (January, April, June,
 * September): New Year's Day, Martin Luther King Jr. Day, DC Emancipation
 * Day (April 16), Juneteenth, Labor Day.
 */
function isLegalHoliday(n: number): boolean {
  const y = Number(isoOf(n).slice(0, 4));
  return [
    observed(y, 1, 1),
    observed(y + 1, 1, 1),
    nthWeekday(y, 1, 1, 3),
    observed(y, 4, 16),
    observed(y, 6, 19),
    nthWeekday(y, 9, 1, 1),
  ].includes(n);
}
/** § 7503: a due date on a weekend or legal holiday moves to the next day that is neither */
function nextBusinessDay(n: number): number {
  let d = n;
  for (;;) {
    const dow = new Date(d * 86_400_000).getUTCDay();
    if (dow !== 0 && dow !== 6 && !isLegalHoliday(d)) return d;
    d += 1;
  }
}

// ---------------------------------------------------------------------------
// § 6621(a)(2) underpayment rates by calendar quarter (federal short-term rate + 3)

export type RateEntry = { percent: number; source: string };
/**
 * Keyed "YYYY-Qn"; a quarter missing here has not been announced. Source: the
 * IRS quarterly interest rates page (irs.gov/payments/quarterly-interest-rates)
 * and the Internal Revenue Bulletin item it cites for each quarter.
 */
export const UNDERPAYMENT_RATES: Record<string, RateEntry> = {
  "2025-Q2": { percent: 7, source: "Rev. Rul. 2025-7, I.R.B. 2025-13 (IR-2025-29)" },
  "2025-Q3": { percent: 7, source: "Rev. Rul. 2025-11, I.R.B. 2025-23 (IR-2025-59)" },
  "2025-Q4": { percent: 7, source: "Rev. Rul. 2025-18, I.R.B. 2025-37 (IR-2025-87)" },
  "2026-Q1": { percent: 7, source: "Rev. Rul. 2025-22, I.R.B. 2025-48 (IR-2025-112)" },
  "2026-Q2": { percent: 6, source: "Rev. Rul. 2026-5, I.R.B. 2026-8" },
  "2026-Q3": { percent: 7, source: "Rev. Rul. 2026-10, I.R.B. 2026-22" },
  "2026-Q4": { percent: 7, source: "Rev. Rul. 2026-15, I.R.B. 2026-36 (IR-2026-98)" },
};

/** the rate periods the penalty worksheet uses for a tax year: calendar quarters through April 15 of the next year */
function ratePeriods(year: number): { from: number; to: number; quarter: string; divisor: number }[] {
  const q = (y: number, n: number, from: string, to: string) => ({
    from: dayNum(from),
    to: dayNum(to),
    quarter: `${y}-Q${n}`,
    divisor: isLeap(y) ? 366 : 365,
  });
  const y = year;
  return [
    q(y, 2, `${y}-04-16`, `${y}-06-30`),
    q(y, 3, `${y}-07-01`, `${y}-09-30`),
    q(y, 4, `${y}-10-01`, `${y}-12-31`),
    q(y + 1, 1, `${y + 1}-01-01`, `${y + 1}-03-31`),
    q(y + 1, 2, `${y + 1}-04-01`, `${y + 1}-04-15`),
  ];
}

// ---------------------------------------------------------------------------
// input / output

export type Payment = { date: string; amount: Cents };

export type Form2210Input = {
  /** the tax year (2025, 2026 or 2027) — the year of the facts' asOf */
  taxYear: number;
  /** full-year facts, corpus-shaped (the same facts as calculate_tax) */
  facts: TypedFacts;
  /**
   * Schedule AI: the CUMULATIVE amounts from January 1 through each period
   * end (March 31, May 31, August 31), for every annualizable fact that is
   * nonzero for the year. Omit to skip the annualized method.
   */
  periods?: { mar31: TypedFacts; may31: TypedFacts; aug31: TypedFacts };
  /**
   * Every estimated tax payment for the year with its date: include an
   * overpayment from last year applied to this year (dated April 15 when last
   * year's return was paid by then) and any payment with this year's return
   * (dated the earlier of the filing date and April 15).
   */
  payments: Payment[];
  /**
   * Box D: federal income tax withheld by the date it was actually withheld.
   * Omitted → federalTaxWithheld is treated as paid one-fourth on each due
   * date (§ 6654(g)(1)).
   */
  withholdingByDate?: Payment[];
  /** § 6654(d)(1)(B)(ii): no prior-year return, or the prior year was under 12 months → line 9 is line 5 */
  noPriorYearReturn?: boolean;
  /** § 6654(h): the date the return was filed AND the tax paid in full, if by January 31 */
  filedAndPaidInFullOn?: string;
};

export type Line = string; // "$1,234" whole dollars, or "$12.34" for the penalty
export type Form2210Result = {
  taxYear: number;
  partI: Record<string, Line>;
  /** set when Part I alone shows no penalty is owed */
  noPenalty?: string;
  scheduleAI?: { columns: Record<string, Line>[] } | { refused: string[] };
  partIII?: {
    regular: PartIIIResult;
    annualized?: PartIIIResult;
  };
  /** the lower of the methods computed (box C applies when the annualized method is lower) */
  penalty?: { method: "regular" | "annualized"; amount: Line; amountCents: string } | { refused: string };
  boxes: string[];
  notes: string[];
};

export type PartIIIResult = {
  dueDates: string[];
  sectionA: Record<string, Line[]>;
  worksheet: { column: string; amount: Line; from: string; paidOn: string; days: number; ratePercent: number; quarter: string; penalty: string }[];
  penalty?: Line;
  penaltyCents?: string;
  refused?: string;
};

// ---------------------------------------------------------------------------

const rd = (x: Cents): Cents => {
  const neg = x < 0n;
  const a = neg ? -x : x;
  const r = ((a + 50n) / 100n) * 100n;
  return neg ? -r : r;
};
const max0 = (x: Cents): Cents => (x > 0n ? x : 0n);
const minC = (a: Cents, b: Cents): Cents => (a < b ? a : b);
const fmt = (cents: Cents, withCents = false): string => {
  const neg = cents < 0n;
  const a = neg ? -cents : cents;
  const dollars = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}$${dollars}${withCents ? "." + (a % 100n).toString().padStart(2, "0") : ""}`;
};
const D = (c: Cents) => fmt(rd(c));
/** exact rational × cents, half-up */
const mulRate = (c: Cents, num: bigint, den: bigint): Cents => {
  const p = c * num;
  const neg = p < 0n;
  const a = neg ? -p : p;
  const q = (a * 2n + den) / (2n * den);
  return neg ? -q : q;
};

const ANNUALIZATION = [
  { num: 4n, den: 1n, label: "4", pct: [225n, 1000n] },
  { num: 12n, den: 5n, label: "2.4", pct: [45n, 100n] },
  { num: 3n, den: 2n, label: "1.5", pct: [675n, 1000n] },
  { num: 1n, den: 1n, label: "1", pct: [90n, 100n] },
] as const;

/** Part I and the even (regular) installments. */
export function composeForm2210(input: Form2210Input, run: TargetRunner): Form2210Result {
  const { facts, taxYear: year } = input;
  if (![2025, 2026, 2027].includes(year)) throw new Error(`Form 2210 is composed for tax years 2025, 2026 and 2027, not ${year}`);
  const notes: string[] = [];
  const boxes: string[] = [];
  const get = (target: string) => run(facts, target);

  // ---- Part I
  const line1 = rd(get("us.federal.income_tax_after_credits"));
  let other = get("us.federal.other_taxes");
  const withheld = money(facts, "federalTaxWithheld");
  const household = get("us.federal.household_employment_taxes");
  const line3 = rd(get("us.federal.refundable_credits"));
  if (household > 0n && withheld === 0n && line1 + rd(other - household) - line3 < 100_000n) {
    // i2210 line 2: household employment taxes are left out when no income tax was withheld
    // and estimated tax wasn't otherwise required (the § 6654(e)(1) $1,000 test without them)
    other -= household;
    notes.push("line 2 leaves out the household employment taxes: no income tax was withheld and, without them, the year's tax is under $1,000 (Instructions for Form 2210, line 2)");
  }
  const line2 = rd(other);
  const line4 = line1 + line2 - line3;
  const line5 = mulRate(line4, 90n, 100n);
  const line6 = rd(withheld);
  const line7 = line4 - line6;
  const partI: Record<string, Line> = {
    "1_tax_after_credits": fmt(line1),
    "2_other_taxes": fmt(line2),
    "3_refundable_credits": fmt(line3),
    "4_current_year_tax": fmt(line4),
  };
  const result: Form2210Result = { taxYear: year, partI, boxes, notes };
  if (line4 < 100_000n) {
    result.noPenalty = "line 4 is less than $1,000: no penalty (§ 6654(e)(1))";
    return result;
  }
  partI["5_90_percent_of_line_4"] = fmt(rd(line5));
  partI["6_withholding"] = fmt(line6);
  partI["7_line_4_minus_line_6"] = fmt(line7);
  if (line7 < 100_000n) {
    result.noPenalty = "line 7 is less than $1,000: no penalty (§ 6654(e)(1))";
    return result;
  }
  let line9: Cents;
  if (input.noPriorYearReturn) {
    line9 = rd(line5);
    partI["8_prior_year_tax"] = "not applicable (no prior-year return, or it covered under 12 months)";
  } else {
    const prior = facts.priorYearTax;
    const priorAgi = facts.priorYearAGI;
    if (!prior || prior.type !== "money") throw new MissingInput(["priorYearTax"]);
    if (!priorAgi || priorAgi.type !== "money") throw new MissingInput(["priorYearAGI"]);
    const mfs = facts.filingStatus?.type === "enum" && facts.filingStatus.value === "mfs";
    const high = BigInt(priorAgi.value) > (mfs ? 7_500_000n : 15_000_000n);
    const line8 = rd(mulRate(BigInt(prior.value), high ? 110n : 100n, 100n));
    partI["8_prior_year_tax"] = fmt(line8) + (high ? ` (110% — prior-year AGI over ${mfs ? "$75,000" : "$150,000"})` : "");
    line9 = minC(rd(line5), line8);
  }
  partI["9_required_annual_payment"] = fmt(line9);
  if (line6 >= line9) {
    result.noPenalty = "line 6 (withholding) is at least line 9 (the required annual payment): no penalty";
    return result;
  }

  // ---- Schedule AI
  let annualized: Cents[] | undefined;
  if (input.periods) {
    const ai = scheduleAI(input, run, line9, notes);
    if ("refused" in ai) result.scheduleAI = ai;
    else {
      result.scheduleAI = { columns: ai.columns };
      annualized = ai.installments;
    }
  }

  // ---- Part III: the regular and (with periods) annualized installments, with withholding
  // spread evenly and — when given — on its actual dates (box D); the lowest penalty is the answer
  const installments: { m: "regular" | "annualized"; line10: Cents[] }[] = [{ m: "regular", line10: Array(4).fill(rd(mulRate(line9, 25n, 100n))) }];
  if (annualized) installments.push({ m: "annualized", line10: annualized });
  const modes: ("even" | "actual")[] = input.withholdingByDate ? ["even", "actual"] : ["even"];
  const runs = modes.map((w) => ({ w, notes: [] as string[], res: {} as NonNullable<Form2210Result["partIII"]> }));
  for (const r of runs) for (const { m, line10 } of installments) r.res[m] = partIII(input, line10, r.notes, r.w, line4);
  const all = runs.flatMap((r) => installments.map(({ m }) => ({ w: r.w, m, r: r.res[m]!, run: r })));
  const unpriced = all.find((x) => x.r.penaltyCents === undefined);
  let chosen = runs[0];
  if (unpriced) {
    result.penalty = { refused: `${unpriced.m} method${modes.length > 1 ? `, withholding ${unpriced.w === "even" ? "spread evenly" : "on its actual dates"}` : ""}: ${unpriced.r.refused}` };
  } else {
    const best = all.reduce((a, b) => (BigInt(b.r.penaltyCents!) < BigInt(a.r.penaltyCents!) ? b : a));
    chosen = best.run;
    result.penalty = { method: best.m, amount: best.r.penalty!, amountCents: best.r.penaltyCents! };
    if (best.m === "annualized") boxes.push("C");
    if (best.w === "actual") boxes.push("D");
    if (modes.length > 1)
      notes.push(
        best.w === "actual"
          ? "box D: treating withholding as paid on the dates it was actually withheld gives the lower penalty"
          : "withholding is treated as paid one-fourth on each due date: the actual withholding dates (box D) would not lower the penalty",
      );
  }
  result.partIII = chosen.res;
  notes.push(...chosen.notes);
  result.notes = [...new Set(notes)];
  return result;
}

export class MissingInput extends Error {
  constructor(public missing: string[]) {
    super(`Form 2210 needs: ${missing.join(", ")}`);
    this.name = "MissingInput";
  }
}

// ---------------------------------------------------------------------------
// Schedule AI

function scheduleAI(
  input: Form2210Input,
  run: TargetRunner,
  line9: Cents,
  notes: string[],
): { columns: Record<string, Line>[]; installments: Cents[] } | { refused: string[] } {
  const { facts } = input;
  const periods = input.periods!;
  const refused: string[] = [];
  for (const [id, kind] of Object.entries(SCHEDULE_AI_FACTS)) {
    if (typeof kind === "object" && money(facts, id) !== 0n) refused.push(`${id}: ${kind.refuse}`);
  }
  refused.push(...scopeFlags(facts));
  if (refused.length) return { refused };

  // period facts: annualizable ids only; required when the year's amount is nonzero
  const cols = [periods.mar31, periods.may31, periods.aug31];
  const names = ["mar31", "may31", "aug31"];
  const missing: string[] = [];
  cols.forEach((p, i) => {
    for (const id of Object.keys(p)) {
      const kind = SCHEDULE_AI_FACTS[id];
      if (kind === undefined) throw new Error(`periods.${names[i]}.${id}: not a fact Schedule AI reads`);
      if (kind !== "annualize") throw new Error(`periods.${names[i]}.${id}: not a period amount (${kind === "keep" ? "it is used as is in every column" : "out of scope"})`);
      if (p[id].type !== "money") throw new Error(`periods.${names[i]}.${id}: must be money`);
    }
    for (const [id, kind] of Object.entries(SCHEDULE_AI_FACTS)) {
      if (kind === "annualize" && money(facts, id) !== 0n && p[id] === undefined) missing.push(`periods.${names[i]}.${id}`);
    }
  });
  if (missing.length) throw new MissingInput(missing);

  const columns: Record<string, Line>[] = [];
  const installments: Cents[] = [];
  let prior27 = 0n;
  let prior26minus27 = 0n;
  const line24 = rd(mulRate(line9, 25n, 100n));
  for (let i = 0; i < 4; i++) {
    const a = ANNUALIZATION[i];
    const colFacts: TypedFacts = { ...facts };
    if (i < 3) {
      for (const [id, kind] of Object.entries(SCHEDULE_AI_FACTS)) {
        if (kind !== "annualize") continue;
        const period = cols[i][id];
        const v = period && period.type === "money" ? BigInt(period.value) : 0n;
        if (v === 0n && colFacts[id] === undefined) continue;
        colFacts[id] = { type: "money", value: mulRate(v, a.num, a.den).toString() };
      }
      // Part II line 28: a period's net earnings under $400 are entered as zero
      for (const id of ["selfEmploymentNetProfit", "spouseSelfEmploymentNetProfit"]) {
        const p = cols[i][id];
        const ne = p && p.type === "money" ? mulRate(BigInt(p.value), 9235n, 10000n) : 0n;
        if (ne > 0n && ne < 40_000n)
          return {
            refused: [
              `periods.${names[i]}.${id}: the period's net earnings from self-employment are under $400, which Part II line 28 enters as zero while the period's income still counts on line 1 — not modeled`,
            ],
          };
      }
    }
    const g = (t: string) => run(colFacts, t);
    // SALT: whether the annual cap applies before or after annualizing is open — refuse when it binds
    const saltPaid = money(colFacts, "stateAndLocalTaxesPaid");
    if (i < 3 && saltPaid > 0n && g("us.federal.salt_deduction") < saltPaid && g("us.federal.itemized_deductions") >= g("us.federal.standard_deduction"))
      return {
        refused: [
          `column (${"abcd"[i]}): the annualized state and local taxes exceed the year's SALT limit, and the instructions don't say whether the period's itemized deductions (line 4) are limited before or after line 5's annualization`,
        ],
      };
    const agi = g("us.federal.agi");
    const deduction = g("us.federal.deduction_election");
    const ti = g("us.federal.taxable_income");
    const line14 = g("us.federal.income_tax_before_credits");
    const se = g("us.federal.se_tax");
    const amt = g("us.federal.amt");
    const otherTaxes = g("us.federal.other_taxes");
    const beforeNonref = g("us.federal.tax_before_nonrefundable_credits");
    const afterCredits = g("us.federal.income_tax_after_credits");
    const refundable = g("us.federal.refundable_credits");
    const line16 = amt + otherTaxes - se;
    const line17 = rd(line14) + rd(se) + rd(line16);
    const line18 = rd(beforeNonref - afterCredits) + rd(refundable);
    const line19 = max0(line17 - line18);
    const line21 = rd(mulRate(line19, a.pct[0], a.pct[1]));
    const line22 = prior27;
    const line23 = max0(line21 - line22);
    const line25 = i === 0 ? 0n : prior26minus27;
    const line26 = line24 + line25;
    const line27 = minC(line23, line26);
    columns.push({
      column: `(${"abcd"[i]}) ${["1/1–3/31", "1/1–5/31", "1/1–8/31", "1/1–12/31"][i]}`,
      "2_annualization": a.label,
      "3_annualized_agi": D(agi),
      "8_deduction": D(deduction),
      "13_annualized_taxable_income": D(ti),
      "14_tax": D(line14),
      "15_se_tax": D(se),
      "16_other_taxes_incl_amt": D(line16),
      "17_total_tax": fmt(line17),
      "18_credits": fmt(line18),
      "19_net": fmt(line19),
      "20_applicable_percentage": `${Number(a.pct[0]) / (Number(a.pct[1]) / 100)}%`,
      "21": fmt(line21),
      "22": fmt(line22),
      "23": fmt(line23),
      "24": fmt(line24),
      ...(i > 0 ? { "25": fmt(line25) } : {}),
      "26": fmt(line26),
      "27_required_installment": fmt(line27),
    });
    installments.push(line27);
    prior27 += line27;
    prior26minus27 = line26 - line27;
  }
  notes.push(
    "Schedule AI: each column is the full return evaluated on the period's cumulative amounts × the annualization amount (line 2), with the standard deduction in full (line 7); lines 14–19 are that evaluation's tax, self-employment tax, other taxes including AMT, and credits",
  );
  return { columns, installments };
}

// ---------------------------------------------------------------------------
// Part III

function partIII(
  input: Form2210Input,
  line10: Cents[],
  notes: string[],
  withholdingDates: "even" | "actual",
  line4: Cents,
): PartIIIResult {
  const year = input.taxYear;
  const printed = [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`].map(dayNum);
  const effective = printed.map(nextBusinessDay);
  const dueLabels = printed.map((n, i) => isoOf(n) + (effective[i] !== n ? ` (payable ${isoOf(effective[i])}, § 7503)` : ""));
  const jan31 = dayNum(`${year + 1}-01-31`);
  const filedBy = input.filedAndPaidInFullOn ? dayNum(input.filedAndPaidInFullOn) : undefined;
  const section6654h = filedBy !== undefined && filedBy <= jan31;

  // i2210: a payment made on the next business day after a weekend/holiday due date
  // "is considered made on the due date"
  const asMade = (day: number): number => {
    for (let i = 0; i < 4; i++) if (day > printed[i] && day <= effective[i]) return printed[i];
    return day;
  };
  const estimated = input.payments
    .map((p) => ({ day: asMade(dayNum(p.date)), amount: p.amount }))
    .filter((p) => {
      if (p.amount < 0n) throw new Error("a payment amount can't be negative");
      return p.amount > 0n;
    });
  // § 6654(g)(1): withholding is paid one-fourth on each due date, or on the dates actually withheld (box D)
  let withholding: { day: number; amount: Cents }[];
  if (withholdingDates === "actual") {
    const list = input.withholdingByDate!;
    const total = list.reduce((t, p) => t + p.amount, 0n);
    if (total !== money(input.facts, "federalTaxWithheld"))
      throw new Error(`withholdingByDate totals ${fmt(total, true)} but federalTaxWithheld is ${fmt(money(input.facts, "federalTaxWithheld"), true)} — they must agree`);
    withholding = list.map((p) => ({ day: asMade(dayNum(p.date)), amount: p.amount })).filter((p) => p.amount > 0n);
  } else {
    const w = money(input.facts, "federalTaxWithheld");
    const quarter = w / 4n;
    withholding = printed.map((day, i) => ({ day, amount: i < 3 ? quarter : w - 3n * quarter })).filter((p) => p.amount > 0n);
  }

  // line 11 windows: through each due date; with § 6654(h), a payment with a return filed by
  // January 31 goes in column (d) (i2210, line 11)
  const windowOf = (day: number): number => {
    for (let i = 0; i < 4; i++) if (day <= effective[i]) return i;
    return section6654h && day <= filedBy! ? 3 : 4;
  };
  const line11 = [0n, 0n, 0n, 0n];
  for (const p of [...estimated, ...withholding]) {
    const w = windowOf(p.day);
    if (w < 4) line11[w] += p.amount;
  }
  if (section6654h) {
    const paidByFiling = [...estimated, ...withholding].filter((p) => p.day <= filedBy!).reduce((t, p) => t + p.amount, 0n);
    if (paidByFiling < line4)
      throw new Error(
        `filedAndPaidInFullOn: § 6654(h) needs the tax paid in full by ${input.filedAndPaidInFullOn}, but the payments and withholding through that date total ${fmt(paidByFiling, true)}, less than line 4 (${fmt(line4)}) — list the payment made with the return in payments`,
      );
  }
  const L11 = line11.map(rd);

  // Section A, lines 12–18
  const A: Record<string, Cents[]> = { "10": line10, "11": L11, "12": [], "13": [], "14": [], "15": [], "16": [], "17": [], "18": [] };
  let prev18 = 0n;
  let prev16plus17 = 0n;
  for (let i = 0; i < 4; i++) {
    const l12 = i === 0 ? 0n : prev18;
    const l13 = L11[i] + l12;
    const l14 = i === 0 ? 0n : prev16plus17;
    const l15 = i === 0 ? L11[0] : max0(l13 - l14);
    const l16 = i === 0 ? 0n : l15 === 0n ? l14 - l13 : 0n;
    const l17 = line10[i] >= l15 ? line10[i] - l15 : 0n;
    const l18 = l15 > line10[i] ? l15 - line10[i] : 0n;
    A["12"].push(l12);
    A["13"].push(l13);
    A["14"].push(l14);
    A["15"].push(l15);
    A["16"].push(l16);
    A["17"].push(l17);
    A["18"].push(l18);
    prev18 = l18;
    prev16plus17 = l16 + l17;
  }
  const sectionA = Object.fromEntries(Object.entries(A).map(([k, v]) => [k, v.map((c) => fmt(c))]));
  const out: PartIIIResult = { dueDates: dueLabels, sectionA, worksheet: [] };

  // § 6654(h): return filed and the tax paid in full by January 31 → no addition for the 4th installment
  const under = [...A["17"]];
  if (section6654h) {
    if (under[3] > 0n) notes.push("§ 6654(h): the return was filed and the tax paid in full by January 31, so there's no penalty on the January 15 installment");
    under[3] = 0n;
  }

  // Section B worksheet. Every payment — estimated tax AND withholding, which § 6654(g) treats as
  // paid on its due date — pays the earliest underpayment still open, if it was made after that
  // column's due date (§ 6654(b)(3), (c)(2); i2210: "Your payments are applied first to any
  // underpayment balance on an earlier installment"). Section A already spent a column's own
  // payments on that column, so a payment never pays the column whose window it is in.
  const end = dayNum(`${year + 1}-04-15`);
  const balances = under.map((u, i) => ({ col: i, left: u }));
  const chunks: { col: number; amount: Cents; paid: number }[] = [];
  const all = [...estimated, ...withholding].sort((x, y) => x.day - y.day);
  for (const p of all) {
    let rest = p.amount;
    for (const b of balances) {
      if (rest === 0n) break;
      if (b.left === 0n || p.day <= effective[b.col]) continue;
      const use = minC(rest, b.left);
      chunks.push({ col: b.col, amount: use, paid: Math.min(p.day, end) });
      b.left -= use;
      rest -= use;
    }
  }
  for (const b of balances) if (b.left > 0n) chunks.push({ col: b.col, amount: b.left, paid: end });
  // one worksheet line per column and payment date: amounts that stop on the same day (a payment
  // after April 15 and the part never paid both stop at April 15) are one line, rounded once
  const merged = new Map<string, { col: number; amount: Cents; paid: number }>();
  for (const ch of chunks) {
    const key = `${ch.col}|${ch.paid}`;
    const m = merged.get(key);
    if (m) m.amount += ch.amount;
    else merged.set(key, { ...ch });
  }

  const periods = ratePeriods(year);
  let total = 0n;
  let missingRate: string | undefined;
  for (const ch of [...merged.values()].sort((x, y) => x.col - y.col || x.paid - y.paid)) {
    if (ch.paid <= printed[ch.col]) continue;
    for (const rp of periods) {
      const start = Math.max(printed[ch.col], rp.from - 1);
      const stop = Math.min(ch.paid, rp.to);
      const days = stop - start;
      if (days <= 0) continue;
      const rate = UNDERPAYMENT_RATES[rp.quarter];
      if (!rate) {
        missingRate ??= rp.quarter;
        continue;
      }
      // worksheet lines 4/7/10/13: underpayment × days / 365 × rate, to the cent
      const num = ch.amount * BigInt(Math.round(rate.percent * 100)) * BigInt(days);
      const den = 10_000n * BigInt(rp.divisor);
      const cents = (num * 2n + den) / (2n * den);
      total += cents; // line 14: "Add all amounts on lines 4, 7, 10, and 13"
      out.worksheet.push({
        column: "abcd"[ch.col],
        amount: fmt(ch.amount, true),
        from: isoOf(start),
        paidOn: isoOf(ch.paid),
        days,
        ratePercent: rate.percent,
        quarter: rp.quarter,
        penalty: fmt(cents, true),
      });
    }
  }
  if (missingRate) {
    out.refused = `the underpayment rate for ${missingRate} hasn't been announced (§ 6621(a)(2) rates are set each quarter); the underpayments in Section A are final, the penalty isn't`;
    return out;
  }
  if (year === 2025 && out.worksheet.some((w) => w.quarter === "2026-Q2"))
    notes.push(
      "the printed 2025 penalty worksheet applies 7% through April 15, 2026, but the § 6621 rate for April 1–15, 2026 is 6% (Rev. Rul. 2026-5); the penalty here uses each quarter's actual rate, which the instructions allow (\"You don't have to use the method used on Form 2210 as long as you enter the correct penalty amount\")",
    );
  out.penalty = fmt(total, true);
  out.penaltyCents = total.toString();
  return out;
}

// ---------------------------------------------------------------------------
// argument parsing shared by the CLI and the MCP tool

/** dollars (number or "1,234.56") → exact cents; at most two decimals */
export function dollarsToCents(v: unknown, path: string): Cents {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "string" ? v.replace(/[$,\s]/g, "") : "";
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`${path}: expected a dollar amount like 1234.56, got ${JSON.stringify(v)}`);
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -cents : cents;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parsePayments(raw: unknown, path: string): Payment[] {
  if (!Array.isArray(raw)) throw new Error(`${path}: expected an array of { date, amount }`);
  return raw.map((p, i) => {
    if (!isObj(p)) throw new Error(`${path}[${i}]: expected { date, amount }`);
    const extra = Object.keys(p).filter((k) => k !== "date" && k !== "amount");
    if (extra.length) throw new Error(`${path}[${i}]: unknown key(s) ${extra.join(", ")}`);
    if (typeof p.date !== "string") throw new Error(`${path}[${i}].date: expected YYYY-MM-DD`);
    dayNum(p.date);
    const amount = dollarsToCents(p.amount, `${path}[${i}].amount`);
    if (amount < 0n) throw new Error(`${path}[${i}].amount: can't be negative`);
    return { date: p.date, amount };
  });
}

/**
 * Build a Form2210Input from tool/CLI arguments. `facts` are the full-year
 * typed facts (built by the caller's usual fact pipeline); `coerce` turns a
 * plain { factId: dollars } period object into typed facts.
 */
export function form2210InputFromArgs(
  args: Record<string, unknown>,
  taxYear: number,
  facts: TypedFacts,
  coerce: (plain: Record<string, unknown>) => TypedFacts,
): Form2210Input {
  const known = new Set(["payments", "periods", "withholdingByDate", "noPriorYearReturn", "filedAndPaidInFullOn"]);
  const unknown = Object.keys(args).filter((k) => !known.has(k));
  if (unknown.length) throw new Error(`unknown Form 2210 option(s): ${unknown.join(", ")}`);
  if (args.payments === undefined)
    throw new Error("payments is required: every estimated tax payment for the year with its date (an empty array if none) — the penalty depends on when each was paid");
  const input: Form2210Input = { taxYear, facts, payments: parsePayments(args.payments, "payments") };
  if (args.withholdingByDate !== undefined) input.withholdingByDate = parsePayments(args.withholdingByDate, "withholdingByDate");
  if (args.noPriorYearReturn !== undefined) {
    if (typeof args.noPriorYearReturn !== "boolean") throw new Error("noPriorYearReturn: expected true or false");
    input.noPriorYearReturn = args.noPriorYearReturn;
  }
  if (args.filedAndPaidInFullOn !== undefined) {
    if (typeof args.filedAndPaidInFullOn !== "string") throw new Error("filedAndPaidInFullOn: expected YYYY-MM-DD");
    dayNum(args.filedAndPaidInFullOn);
    input.filedAndPaidInFullOn = args.filedAndPaidInFullOn;
  }
  if (args.periods !== undefined) {
    const p = args.periods;
    if (!isObj(p)) throw new Error("periods: expected { mar31, may31, aug31 }");
    const keys = ["mar31", "may31", "aug31"] as const;
    const extra = Object.keys(p).filter((k) => !(keys as readonly string[]).includes(k));
    if (extra.length) throw new Error(`periods: unknown key(s) ${extra.join(", ")} (use mar31, may31, aug31)`);
    const out = {} as NonNullable<Form2210Input["periods"]>;
    for (const k of keys) {
      const v = p[k];
      if (!isObj(v)) throw new Error(`periods.${k}: expected an object of cumulative amounts from January 1 (e.g. { "wages": 15000 })`);
      for (const [id] of Object.entries(v)) {
        const kind = SCHEDULE_AI_FACTS[id];
        if (kind !== "annualize")
          throw new Error(`periods.${k}.${id}: ${kind === undefined ? "not an amount Schedule AI annualizes" : kind === "keep" ? "used as is in every column, not a period amount" : "out of scope for Schedule AI"}`);
      }
      out[k] = coerce(v);
    }
    input.periods = out;
  }
  return input;
}
