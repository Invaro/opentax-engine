import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Oklahoma deep pack — TY2025 Form 511 (+ the enacted HB 2764 schedule for
 * TY2026). Every amount verified from the printed 2025 Oklahoma Resident
 * Individual Income Tax Packet (52pp incl. the tax table, use tax table,
 * Schedules 511-A..I, and Form 538-S), the 2025 Form 511-EIC (with its
 * printed 2020 EIC table), the 2025 Form 538-H, enrolled HB 2764, and the
 * codified statutes on OSCN (68 O.S. §§ 2355, 2357, 2357.43, 2358, 5011).
 *
 * Load-bearing findings:
 *  - The joint/HOH/QSS 4.75% bracket begins at $14,400, NOT the $12,200 every
 *    rate survey prints: § 2355(C)(2)(e) says "3.75% tax on next $4,600.00"
 *    after $9,800, and all 2,000 printed table rows agree ($4,373 anchor at
 *    $100,000; the survey brackets would give $4,395).
 *  - The printed table is the statutory schedule evaluated at each $50 row's
 *    MIDPOINT and rounded half-up, chaining from UNROUNDED anchors (2,000 of
 *    2,000 rows reproduce, both columns) — unlike Oregon's rounded anchors.
 *  - Oklahoma's EIC is 5% of the federal EIC recomputed under the 2020 rules
 *    (68 O.S. § 2357.43) from a printed 2020 table: 1,129 of 1,129 rows and
 *    all 8 footnoted partial bands reproduce with the IRS conventions decoded
 *    below (unrounded maximum, kink rows print the maximum).
 *  - HB 2764's trigger cuts need a December preliminary + February final
 *    certification starting December 2026 / February 2027, effective the
 *    following January 1 — so TY2026 and TY2027 rates are fixed as enacted.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const ge = (l: Expr, r: Expr): Expr => cmp("ge", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const eq = (l: Expr, r: Expr): Expr => cmp("eq", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const max = (...args: Expr[]): Expr => ({ kind: "max", args });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const int = (value: string): Expr => ({ kind: "int", value });
const isStatus = (v: string): Expr => eq(fact("filingStatus"), { kind: "enum", value: v });
// The printed table's two columns: "Single or married filing separate" and
// "Married filing joint or head of household" ("This column must also be
// used by a Qualified Surviving Spouse") — § 2355(C)(2) lists MFJ, surviving
// spouse, and heads of household together.
const isJointColumn: Expr = { kind: "or", args: [isStatus("mfj"), isStatus("hoh"), isStatus("qss")] };

/**
 * Exact schedule arithmetic without intermediate cent rounding. Oklahoma's
 * cumulative bracket anchors are not whole cents ($35.625 at $3,750), and
 * 0.0475 × a whole-dollar excess can land on .4975 — rounding to cents first
 * and then to dollars would misround such values. So every schedule below is
 * evaluated in a SCALED integer (cents × 10,000: rate numerators are per
 * 10,000) and rounded ONCE, to whole dollars.
 */
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const scaled = (cents: string): Expr => times(money(cents), "10000");
/** scaled (cents × 10,000) → whole-dollar money, single half-up rounding */
const dollarsFromScaled = (n: Expr): Expr =>
  times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** Σ rate_i × (portion of base inside bracket i), scaled — rows ascending. */
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

// 68 O.S. § 2355(C) — tax years 2024 and 2025 (rate numerators per 10,000)
const SCHED_2025_S = [
  { thresholdCents: "0", rateNum: "25" }, // 0.25% on the first $1,000
  { thresholdCents: "100000", rateNum: "75" }, // 0.75% on the next $1,500
  { thresholdCents: "250000", rateNum: "175" }, // 1.75% on the next $1,250
  { thresholdCents: "375000", rateNum: "275" }, // 2.75% on the next $1,150
  { thresholdCents: "490000", rateNum: "375" }, // 3.75% on the next $2,300
  { thresholdCents: "720000", rateNum: "475" }, // 4.75% on the remainder
];
const SCHED_2025_J = [
  { thresholdCents: "0", rateNum: "25" }, // 0.25% on the first $2,000
  { thresholdCents: "200000", rateNum: "75" }, // 0.75% on the next $3,000
  { thresholdCents: "500000", rateNum: "175" }, // 1.75% on the next $2,500
  { thresholdCents: "750000", rateNum: "275" }, // 2.75% on the next $2,300
  { thresholdCents: "980000", rateNum: "375" }, // 3.75% on the next $4,600 (to $14,400)
  { thresholdCents: "1440000", rateNum: "475" }, // 4.75% on the remainder
];
// 68 O.S. § 2355(D) as enacted by HB 2764 — tax year 2026 and after
const SCHED_2026_S = [
  { thresholdCents: "0", rateNum: "0" }, // 0% on the first $3,750
  { thresholdCents: "375000", rateNum: "250" }, // 2.5% on the next $1,150
  { thresholdCents: "490000", rateNum: "350" }, // 3.5% on the next $2,300
  { thresholdCents: "720000", rateNum: "450" }, // 4.5% on the remainder
];
const SCHED_2026_J = [
  { thresholdCents: "0", rateNum: "0" }, // 0% on the first $7,500
  { thresholdCents: "750000", rateNum: "250" }, // 2.5% on the next $2,300
  { thresholdCents: "980000", rateNum: "350" }, // 3.5% on the next $4,600
  { thresholdCents: "1440000", rateNum: "450" }, // 4.5% on the remainder
];

const PKT_URL = "https://oklahoma.gov/content/dam/ok/en/tax/documents/forms/individuals/current/511-Pkt.pdf";

/**
 * The 2020 federal EIC table as printed in the 2025 Form 511-EIC, decoded:
 * every $50 row is the § 32 formula at the row MIDPOINT rounded half-up,
 * EXCEPT (a) the maximum credit used in the phase-out is UNROUNDED (7.65% ×
 * $7,030 = $537.795, so [10,600-10,650) prints $397 not $398), (b) the row
 * containing the earned-income amount and the row containing the phase-out
 * threshold print the (rounded) maximum, and (c) the row containing the
 * completed-phaseout amount is a footnoted PARTIAL band [row start, completed
 * amount) evaluated at ITS midpoint (e.g. "at least $15,800 but less than
 * $15,820 ... your credit is $1"). Verified against all 1,129 printed rows
 * and all 8 footnotes.
 */
interface EicParams {
  cpNum: string; // credit percentage per 10,000
  eaCents: string; // earned income amount
  ppNum: string; // phase-out percentage per 10,000
  psCents: string; // threshold phase-out amount
  ceCents: string; // completed phase-out amount
  eaRowLo: string; // $50 row containing the earned income amount
  psRowLo: string; // $50 row containing the phase-out threshold
  ceRowLo: string; // $50 row containing the completed phase-out amount
  cePartialMidCents: string; // midpoint of [ceRowLo, ce)
}
const eicParams = (cpNum: string, ea: number, ppNum: string, ps: number, ce: number): EicParams => {
  const row = (d: number) => Math.floor(d / 50) * 50;
  return {
    cpNum,
    eaCents: String(ea * 100),
    ppNum,
    psCents: String(ps * 100),
    ceCents: String(ce * 100),
    eaRowLo: String(row(ea) * 100),
    psRowLo: String(row(ps) * 100),
    ceRowLo: String(row(ce) * 100),
    cePartialMidCents: String(Math.round(((row(ce) + ce) / 2) * 100)),
  };
};
// Rev. Proc. 2019-44 § 3.07 (2020): credit % / earned income amount / phase-out % / threshold / completed
const EIC_2020_OTHER: EicParams[] = [
  eicParams("765", 7030, "765", 8790, 15820),
  eicParams("3400", 10540, "1598", 19330, 41756),
  eicParams("4000", 14800, "2106", 19330, 47440),
  eicParams("4500", 14800, "2106", 19330, 50954),
];
const EIC_2020_MFJ: EicParams[] = [
  eicParams("765", 7030, "765", 14680, 21710),
  eicParams("3400", 10540, "1598", 25220, 47646),
  eicParams("4000", 14800, "2106", 25220, 53330),
  eicParams("4500", 14800, "2106", 25220, 56844),
];
// Form 511-EIC line 19: the AGI look-up applies once AGI reaches the table's
// phase-out row — "$8,800 ($14,700 MFJ)" with no children, "$19,350 ($25,250)"
// with one or more
const EIC_AGI_ROW_OTHER = ["880000", "1935000", "1935000", "1935000"];
const EIC_AGI_ROW_MFJ = ["1470000", "2525000", "2525000", "2525000"];

/** The printed 2020 table value for amount x (money) under params p. */
const eicTable = (x: Expr, p: EicParams): Expr => {
  const lo = mulInt(money("5000"), { kind: "stepUnits", value: x, unitCents: "5000", mode: "floor" });
  const mid = add(lo, money("2500"));
  const mxScaled = times(money(p.eaCents), p.cpNum); // unrounded maximum, scaled
  const phaseOut = (m: Expr): Expr => dollarsFromScaled(max0(sub(mxScaled, times(sub(m, money(p.psCents)), p.ppNum))));
  return iff(
    lt(x, money("100")), // the table starts at "$1"
    money("0"),
    iff(
      ge(x, money(p.ceCents)), // "$X or more ... you cannot claim the credit"
      money("0"),
      iff(
        eq(lo, money(p.ceRowLo)), // footnoted partial band [row start, completed amount)
        phaseOut(money(p.cePartialMidCents)),
        iff(
          { kind: "or", args: [eq(lo, money(p.eaRowLo)), eq(lo, money(p.psRowLo))] }, // kink rows print the maximum
          dollarsFromScaled(mxScaled),
          iff(
            le(mid, money(p.eaCents)),
            dollarsFromScaled(times(mid, p.cpNum)), // phase-in
            iff(le(mid, money(p.psCents)), dollarsFromScaled(mxScaled), phaseOut(mid)), // plateau / phase-out
          ),
        ),
      ),
    ),
  );
};

/**
 * Oklahoma AGI ÷ federal AGI, not more than 100%, applied to `amount` —
 * OAC 710:50-15-71(d) (child care/child tax credit): "If the Federal
 * Adjusted Gross Income is zero or less, the ratio will be 100%."
 */
const proratedChildCredit = (amount: Expr): Expr =>
  iff(
    { kind: "or", args: [le(fact("okFederalAgi"), money("0")), ge(fact("okAgi"), fact("okFederalAgi"))] },
    amount,
    iff(le(fact("okAgi"), money("0")), money("0"), { kind: "mulDiv", a: amount, b: fact("okAgi"), c: fact("okFederalAgi"), round: "half-up" }),
  );
/**
 * The EIC proration — OAC 710:50-15-90(c): ratio not more than 100%; "(1)
 * When the Oklahoma Adjusted Gross Income is negative and is less than the
 * Federal Adjusted Gross Income, the ratio shall be 0%. (2) When the Federal
 * Adjusted Gross Income is negative and is equal to or less than the
 * Oklahoma Adjusted Gross Income, the ratio will be 100%."
 */
const proratedEic = (amount: Expr): Expr =>
  iff(
    ge(fact("okAgi"), fact("okFederalAgi")),
    amount,
    iff(le(fact("okAgi"), money("0")), money("0"), { kind: "mulDiv", a: amount, b: fact("okAgi"), c: fact("okFederalAgi"), round: "half-up" }),
  );

const taxRuleCommon = {
  id: "us.ok.income_tax",
  jurisdiction: "us.ok",
  output: { type: "money" as const },
};

export const okRules: Rule[] = [
  {
    ...taxRuleCommon,
    version: 1,
    title:
      "Oklahoma income tax — 0.25%/0.75%/1.75%/2.75%/3.75%/4.75% at $1,000/$2,500/$3,750/$4,900/$7,200 (single/MFS) or $2,000/$5,000/$7,500/$9,800/$14,400 (joint/HOH/QSS), via the printed tax table below $100,000 and the printed computation above (Form 511 line 14a)",
    citation: {
      source:
        "68 O.S. § 2355(C) (tax years 2024 and 2025); 2025 Oklahoma Resident Individual Income Tax Packet: Tax Table pp. 27-38 and the 'Calculating Tax on Taxable Income of $100,000 or more' worksheets p. 38",
      section: "68 O.S. § 2355(C)(1)-(2); Form 511 line 14a; 2025 Tax Table",
      url: PKT_URL,
      excerpt:
        "STATUTE (verbatim, § 2355(C)): '1. Single individuals and married individuals filing separately: (a) 0.25% tax on first $1,000.00 or part thereof, (b) 0.75% tax on next $1,500.00 or part thereof, (c) 1.75% tax on next $1,250.00 or part thereof, (d) 2.75% tax on next $1,150.00 or part thereof, (e) 3.75% tax on next $2,300.00 or part thereof, and (f) 4.75% tax on the remainder. 2. Married individuals filing jointly and surviving spouse ... and heads of households ...: (a) 0.25% tax on first $2,000.00 or part thereof, (b) 0.75% tax on next $3,000.00 or part thereof, (c) 1.75% tax on next $2,500.00 or part thereof, (d) 2.75% tax on next $2,300.00 or part thereof, (e) 3.75% tax on next $4,600.00 or part thereof, and (f) 4.75% tax on the remainder.' So the joint 4.75% bracket starts at $9,800 + $4,600 = $14,400 — every rate survey's '$12,200' is WRONG (the printed table row [12,200-12,250) is $225 = 3.75% territory; [14,400-14,450) is $308). COLUMNS (table header, verbatim): 'Single or married filing separate' and 'Married* filing joint or head of household' — '*This column must also be used by a Qualified Surviving Spouse.' METHOD (p. 27): 'Use this table if your taxable income is less than $100,000. If your taxable income is $100,000 or more, use the tax computation on the lower portion of page 38.' TABLE CONVENTION (decoded from all 2,000 printed $50 rows, zero mismatches): the statutory schedule evaluated at the ROW MIDPOINT (row start + $25) rounded half-up, chaining from UNROUNDED anchors (single $153.50 at $7,200; joint $307.00 at $14,400) — e.g. row [14,750-14,800) prints $513/$325 (the packet's own Jones example: 'Their Oklahoma Taxable Income is $14,793 ... The amount shown ... is $325'). WORKSHEET (p. 38, verbatim): single/MFS '$4,562 plus 0.0475 over $100,000'; joint/HOH/QSS '$4,373 plus 0.0475 over $100,000' — both equal the exact schedule at $100,000 ($4,561.50 → $4,562; $4,373.00). useFormulaMethod=true evaluates the exact schedule at the exact income (whole-dollar result) instead of the table. Every product is computed in exact scaled arithmetic and rounded ONCE to whole dollars (68 O.S. § 2355 fixes fractional-cent anchors such as $35.625 at $3,750). Form 573 farm income averaging (box 1) replaces this line when elected (transcribed, not modeled). Nonresident/part-year Form 511-NR not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    parameters: {
      sBracketTop1: { value: "100000", type: "money" },
      sBracketTop2: { value: "250000", type: "money" },
      sBracketTop3: { value: "375000", type: "money" },
      sBracketTop4: { value: "490000", type: "money" },
      sBracketTop5: { value: "720000", type: "money" }, // 4.75% above $7,200
      jBracketTop1: { value: "200000", type: "money" },
      jBracketTop2: { value: "500000", type: "money" },
      jBracketTop3: { value: "750000", type: "money" },
      jBracketTop4: { value: "980000", type: "money" },
      jBracketTop5: { value: "1440000", type: "money" }, // 4.75% above $14,400 (NOT $12,200)
      tableThreshold: { value: "10000000", type: "money" }, // $100,000
      worksheetAnchorSingleMfs: { value: "456200", type: "money" }, // $4,562 as printed
      worksheetAnchorJointHoh: { value: "437300", type: "money" }, // $4,373 as printed
      topRateBps: { value: "475", type: "int" },
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      const sched = (b: Expr): Expr =>
        iff(isJointColumn, dollarsFromScaled(scaledSchedule(b, SCHED_2025_J)), dollarsFromScaled(scaledSchedule(b, SCHED_2025_S)));
      // table: $50 rows, statutory schedule at the row midpoint
      const mid: Expr = add(mulInt(money("5000"), { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" }), money("2500"));
      // printed worksheet: anchor + 4.75% × excess over $100,000 (single rounding)
      const excess475 = times(sub(base, money("10000000")), "475");
      const worksheet: Expr = iff(
        isJointColumn,
        dollarsFromScaled(add(scaled("437300"), excess475)),
        dollarsFromScaled(add(scaled("456200"), excess475)),
      );
      return iff(fact("useFormulaMethod"), sched(base), iff(lt(base, money("10000000")), sched(mid), worksheet));
    })(),
  },
  {
    ...taxRuleCommon,
    version: 2,
    title:
      "Oklahoma income tax — TY2026 HB 2764 schedule: 0%/2.5%/3.5%/4.5% at $3,750/$4,900/$7,200 (single/MFS) or $7,500/$9,800/$14,400 (joint/HOH/QSS) (Form 511 line 14a)",
    citation: {
      source:
        "68 O.S. § 2355(D) as enacted by 2025 Okla. Sess. Laws HB 2764 (c. 307, effective November 1, 2025; enrolled text pp. 11-12); OTC Summary of 2025 Tax Legislation p. 6; 62 O.S. § 34.103(D) (trigger certification calendar)",
      section: "68 O.S. § 2355(D)(1)-(2), (E), (F); HB 2764 §§ 1-2, 4",
      url: "https://www.oklegislature.gov/cf_pdf/2025-26%20ENR/hB/HB2764%20ENR.PDF",
      excerpt:
        "STATUTE (verbatim, § 2355(D)): 'For tax year 2026 and for subsequent tax years subject to rate reductions as provided by subsection E of this section ... 1. Single individuals and married individuals filing separately: (a) 0% tax on first $3,750.00 or part thereof, (b) 2.5% tax on the next $1,150.00 or part thereof, (c) 3.5% tax on next $2,300.00 or part thereof, and (d) 4.5% tax on the remainder. 2. Married individuals filing jointly and surviving spouse ... and heads of households ...: (a) 0% tax on first $7,500.00 or part thereof, (b) 2.5% tax on the next $2,300.00 or part thereof, (c) 3.5% tax on next $4,600.00 or part thereof, and (d) 4.5% tax on the remainder.' OTC's rate chart agrees: single '$4,901-$7,200: $28.75 plus 3.5% over $4,900; $7,201 and above: $109.25 plus 4.5% over $7,200'; joint '$9,801-$14,400: $57.50 plus 3.5% over $9,800; $14,401 and above: $218.50 plus 4.5% over $14,400'. TRIGGER (§ 2355(E), verbatim): rates 'shall each be reduced by twenty-five one-hundredths (0.25) of a percentage point (0.0025) until the applicable rate equals zero percent (0%)' when the Board of Equalization certifies collections growth; 'Any reduction ... shall take effect on January 1 following the final certification by the State Board of Equalization, if any, made during its meeting in February each year.' CALENDAR (62 O.S. § 34.103(D)(2)-(3)): the FIRST preliminary certification is at the DECEMBER 2026 meeting and the first final certification in FEBRUARY 2027, so the earliest triggered cut takes effect January 1, 2028 — TY2026 (and TY2027) rates are fixed as printed above; a revenue failure cancels a pending cut (§ 2355(F)). HB 4072 (April 2026) only created the Taxpayer Endowment Trust Fund — no rate change. METHOD: the 2026 printed tax table publishes with the 2026 packet (~January 2027) — until then this rule evaluates the exact statutory schedule (single whole-dollar rounding) for any income; re-verify the printed rows and the $100,000 worksheet anchors (the exact schedule at $100,000 is $4,285.25 → $4,285 single/MFS and $4,070.50 → $4,071 joint/HOH/QSS) when the table appears. Standard deduction, exemptions, and credits are statutory and unchanged for 2026 (see the companion us.ok.* rules).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    parameters: {
      sZeroBracketTop: { value: "375000", type: "money" }, // $3,750
      sBracketTop2: { value: "490000", type: "money" }, // $4,900
      sBracketTop3: { value: "720000", type: "money" }, // $7,200
      jZeroBracketTop: { value: "750000", type: "money" }, // $7,500
      jBracketTop2: { value: "980000", type: "money" }, // $9,800
      jBracketTop3: { value: "1440000", type: "money" }, // $14,400
      topRateBps: { value: "450", type: "int" },
      triggerCutBps: { value: "25", type: "int" }, // 0.25 point per certification, earliest 1/1/2028
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      return iff(isJointColumn, dollarsFromScaled(scaledSchedule(base, SCHED_2026_J)), dollarsFromScaled(scaledSchedule(base, SCHED_2026_S)));
    })(),
  },
  {
    id: "us.ok.standard_deduction",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma standard deduction — $6,350 single/MFS, $12,700 MFJ/QSS, $9,350 HOH (fixed since 2017; full amount even for a dependent-claimed filer) (Form 511 line 10)",
    citation: {
      source: "68 O.S. § 2358(E)(2)(g); 2025 Form 511 packet, line 10 instructions p. 10 and Schedule 511-E p. 25",
      section: "68 O.S. § 2358(E)(2)(g); Form 511 line 10",
      url: PKT_URL,
      excerpt:
        "STATUTE (verbatim): 'For taxable years beginning on or after January 1, 2017 ... (1) Six Thousand Three Hundred Fifty Dollars ($6,350.00) for single or married filing separately, (2) Twelve Thousand Seven Hundred Dollars ($12,700.00) for married filing jointly or qualifying widower with dependent child, and (3) Nine Thousand Three Hundred Fifty Dollars ($9,350.00) for head of household.' NOT indexed — the same amounts apply for 2026. ELECTION FOLLOWS FEDERAL (p. 10, verbatim): 'If you claimed the standard deduction on your federal return, you must claim the Oklahoma standard deduction. If you claimed itemized deductions on your federal return, you must claim Oklahoma itemized deductions' (→ us.ok.itemized_deductions). DEPENDENTS (verbatim): 'You qualify for the Oklahoma standard deduction even when claimed as a dependent on another return' — the FULL amount, no federal-style earned-income limit. OUT-OF-STATE INCOME (Form 511 line 4 > 0): the deduction and exemptions are PRORATED on Schedule 511-E by Oklahoma AGI ÷ (federal AGI − subtractions), not more than 100% — composed, not in this rule. [Input: filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      singleMfs: { value: "635000", type: "money" },
      mfjQss: { value: "1270000", type: "money" },
      hoh: { value: "935000", type: "money" },
    },
    formula: iff(
      { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
      money("1270000"),
      iff(isStatus("hoh"), money("935000"), money("635000")),
    ),
  },
  {
    id: "us.ok.itemized_deductions",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma itemized deductions — federal Schedule A total minus state/local income or sales taxes, capped at $17,000 except medical and charitable amounts (Schedule 511-D)",
    citation: {
      source: "68 O.S. § 2358(E)(3)(b) and (E)(23); 2025 Form 511 packet, Schedule 511-D (form p. 6 of Form 511; instructions p. 25)",
      section: "68 O.S. § 2358(E)(3)(b); Schedule 511-D lines 1-11",
      url: PKT_URL,
      excerpt:
        "STATUTE (verbatim): 'For taxable years beginning on or after January 1, 2018, the net amount of itemized deductions allowable on an Oklahoma income tax return ... shall not exceed Seventeen Thousand Dollars ($17,000.00). For purposes of this subparagraph, charitable contributions and medical expenses deductible for federal income tax purposes shall be excluded from the amount of Seventeen Thousand Dollars ($17,000.00).' SCHEDULE 511-D (printed lines): 1 federal itemized deductions (Schedule A line 17); 2 'State and local sales or income taxes from Federal Sch. A, line 5a (If Federal Sch. A, line 5e is limited, enter that portion of Federal Sch. A, line 5a included in line 5e)' — the add-back is the amount ACTUALLY deducted after the federal SALT cap; 3 = 1 − 2; 4 medical and dental (Schedule A line 4 — after the 7.5% floor); 5 gifts to charity (Schedule A line 14); 6 = 3 − 4 − 5; 7 'Is line 6 more than $17,000?' YES → 8 = $17,000, 9 = medical, 10 = charity, 11 = 8 + 9 + 10; NO → 11 = line 3. Real estate and personal property taxes (Schedule A lines 5b-5c) are NOT added back and DO count toward the cap. Mandatory for federal itemizers (a federal standard-deduction filer must take the Oklahoma standard deduction). Refunds of the added-back state/local income tax are subtracted the next year (Schedule 511-A line 13). [Inputs: okFederalItemizedTotal, okFederalSaltDeducted, okFederalMedical, okFederalCharity.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "1700000", type: "money" } }, // $17,000
    formula: (() => {
      const line3 = max0(sub(fact("okFederalItemizedTotal"), fact("okFederalSaltDeducted")));
      const medChar = add(fact("okFederalMedical"), fact("okFederalCharity"));
      const line6 = max0(sub(line3, medChar));
      return rd(iff(gt(line6, money("1700000")), add(money("1700000"), medChar), line3));
    })(),
  },
  {
    id: "us.ok.exemptions",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma exemptions — $1,000 each (self, spouse, blind, dependents) plus the special 65+ exemption allowed only when federal AGI is at or under $15,000 single / $25,000 MFJ / $12,500 MFS / $19,000 HOH (Form 511 line 11)",
    citation: {
      source: "68 O.S. § 2358(E)(1)(a)-(c); 2025 Form 511 packet, exemption instructions pp. 8-9 and line 11 p. 10",
      section: "68 O.S. § 2358(E)(1); Form 511 page 1 boxes and line 11",
      url: PKT_URL,
      excerpt:
        "'Oklahoma allows $1,000 for each exemption claimed on the top of the return' (p. 10). REGULAR: yourself (0 if claimable as another's dependent — 'You still qualify for the Oklahoma Standard Deduction'), spouse (joint; or MFS/HOH when the spouse had no income, files no return, and is nobody's dependent), and each IRC § 152 dependent. BLIND: 'An additional exemption may be claimed for each taxpayer or spouse who is legally blind.' SPECIAL (statute verbatim, § 2358(E)(1)(c)): 'an additional exemption of One Thousand Dollars ($1,000.00) for each taxpayer or spouse who is sixty-five (65) years of age or older at the close of the tax year ... if the federal adjusted gross income does not exceed: (1) Twenty-five Thousand Dollars ($25,000.00) if married and filing jointly, (2) Twelve Thousand Five Hundred Dollars ($12,500.00) if married and filing separately, (3) Fifteen Thousand Dollars ($15,000.00) if single, and (4) Nineteen Thousand Dollars ($19,000.00) if a qualifying head of household ... amounts included in the calculation of federal adjusted gross income pursuant to the conversion of a traditional individual retirement account to a Roth individual retirement account shall be excluded from federal adjusted gross income for purposes of the income thresholds.' Age test: 65 by December 31 ('If you turned age 65 on January 1, 2026, you are considered to be age 65 at the end of 2025'). QUALIFYING SURVIVING SPOUSE: neither the statute nor the packet lists a QSS limit for the special exemption — this rule allows NO special exemption for QSS (conservative; disclose and let the preparer decide; the regular/blind/dependent exemptions are unaffected). Amounts NOT indexed (same for 2026). [Inputs: okBasicExemptions, okSpecialExemptions65, okFederalAgi, okRothConversionIncome, filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "100000", type: "money" },
      specialLimitSingle: { value: "1500000", type: "money" },
      specialLimitMfj: { value: "2500000", type: "money" },
      specialLimitMfs: { value: "1250000", type: "money" },
      specialLimitHoh: { value: "1900000", type: "money" },
    },
    formula: (() => {
      const testAgi = sub(fact("okFederalAgi"), fact("okRothConversionIncome"));
      const limit: Expr = iff(
        isStatus("mfj"),
        money("2500000"),
        iff(isStatus("mfs"), money("1250000"), iff(isStatus("single"), money("1500000"), iff(isStatus("hoh"), money("1900000"), money("-1")))),
      );
      // QSS: limit = -$0.01 → never satisfied (no special exemption; disclosed)
      const special: Expr = iff(le(testAgi, limit), mulInt(money("100000"), fact("okSpecialExemptions65")), money("0"));
      return add(mulInt(money("100000"), fact("okBasicExemptions")), special);
    })(),
  },
  {
    id: "us.ok.retirement_exclusion",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma retirement exclusion — Oklahoma-government/civil-service (line 5) and other qualified plan/IRA (line 6) retirement income excluded up to a combined $10,000 PER INDIVIDUAL (Schedule 511-A lines 5-6)",
    citation: {
      source: "68 O.S. § 2358(E)(8) and (E)(13); 2025 Form 511 packet, Schedule 511-A lines 5 and 6 instructions p. 17",
      section: "68 O.S. § 2358(E)(8), (13); Schedule 511-A lines 5-6",
      url: PKT_URL,
      excerpt:
        "LINE 5 (verbatim): 'Each individual may exclude their retirement benefits up to $10,000, but not to exceed the amount included in the Federal AGI. (To be eligible, you must have retirement income in your name.)' — from the Civil Service of the United States (other than CSRS-in-lieu-of-Social-Security, which is 100% excluded on line 3), OPERS, Teachers' Retirement, Law Enforcement, Firefighters, Police, county systems (19 O.S. § 951), Justices and Judges, Wildlife Conservation, OESC, and municipal systems (11 O.S. § 48-101). Statute § 2358(E)(8) (OSCN, currently effective version): 'Retirement benefits not to exceed ... Ten Thousand Dollars ($10,000.00) for the 2006 tax year and all subsequent tax years, which are received by an individual from the civil service of the United States, the Oklahoma Public Employees Retirement System, the Teachers Retirement System of Oklahoma ...'. § 2358(E)(13)(d): 'The amount of the exemption provided by this paragraph shall be limited to ... Ten Thousand Dollars ($10,000.00) for the tax year 2006 and for all subsequent tax years. Any individual who claims the exemption provided for in paragraph 8 of this subsection shall not be permitted to claim a combined total exemption pursuant to this paragraph and paragraph 8 of this subsection in an amount exceeding' the same limit. Early distributions (1099-R code 1) do not qualify on line 5. LINE 6 (verbatim): 'Each individual may exclude their retirement benefits up to $10,000, but not to exceed the amount included in the Federal AGI. For any individual who claims the exclusions for government retirees on Schedule 511-A, line 5, the amount of the exclusion on this line cannot exceed $10,000 minus the amounts already claimed on Schedule 511-A, line 5 (if less than zero, enter \"0\").' Qualifying line 6 plans: IRC § 401 pension plans, § 457 deferred compensation, § 408 IRAs/SEPs, § 403(a)/(b) annuities, § 402(e) lump sums. NET EFFECT per person: min(line 5 income, $10,000) + min(line 6 income, $10,000 − line 5 exclusion) = min(government + other, $10,000); a joint return may exclude up to $20,000 when EACH spouse has qualifying income in their own name — never pooled. No age or AGI test. NOT in this rule (100% subtractions, transcribed): military retirement (line 4), CSRS in lieu of SS (line 3), Railroad Retirement (line 7), Social Security (line 2). [Inputs: okGovRetirementYou, okOtherRetirementYou, okGovRetirementSpouse, okOtherRetirementSpouse.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perPersonCap: { value: "1000000", type: "money" } }, // $10,000
    formula: rd(
      add(
        min(add(max0(fact("okGovRetirementYou")), max0(fact("okOtherRetirementYou"))), money("1000000")),
        min(add(max0(fact("okGovRetirementSpouse")), max0(fact("okOtherRetirementSpouse"))), money("1000000")),
      ),
    ),
  },
  {
    id: "us.ok.child_care_child_tax_credit",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma child care/child tax credit — the greater of 20% of the federal child care credit or 5% of the federal child tax credit (CTC + ACTC), denied when federal AGI exceeds $100,000, prorated by Oklahoma AGI ÷ federal AGI (Form 511 line 15 / Schedule 511-F)",
    citation: {
      source: "68 O.S. § 2357(B)(2); OAC 710:50-15-71; 2025 Form 511 packet, line 15 p. 11 and Schedule 511-F p. 25",
      section: "68 O.S. § 2357(B)(2); Form 511 line 15; Schedule 511-F lines 1-7",
      url: PKT_URL,
      excerpt:
        "PACKET (verbatim): 'If your Federal AGI is $100,000 or less and you are allowed either a credit for child care expenses or the child tax credit on your federal return, you are allowed a credit against your Oklahoma tax. Your Oklahoma credit is the greater of: 20% of the credit for child care expenses allowed by the IRC. -OR- 5% of the child tax credit allowed by the IRC. This includes both the nonrefundable child tax credit and the refundable additional child tax credit. If your Federal AGI is greater than $100,000, no credit is allowed.' — a CLIFF at exactly $100,000 (≤ allowed; > denied; statute: 'shall not be claimed by any taxpayer if the federal adjusted gross income ... is in excess of One Hundred Thousand Dollars'). SCHEDULE 511-F (when Oklahoma AGI line 7 is LESS than federal AGI line 1): 1 federal child care credit; 2 = 20%; 3 federal CTC + ACTC; 4 = 5%; 5 larger of 2 or 4; 6 = line 7 ÷ line 1 'do not enter more than 100%' (OAC 710:50-15-71(d), verbatim: 'If the Federal Adjusted Gross Income is zero or less, the ratio will be 100%'); 7 = 5 × 6. When line 7 ≥ line 1 the unprorated line 5 amount goes straight to line 15. NONREFUNDABLE: Form 511 line 18 'Do not enter less than zero' (statute: 'Neither credit ... shall exceed the tax imposed by Section 2355') — capped by the composer. Uses the federal credits AS ALLOWED on the 2025 federal return (OBBBA's $2,200 CTC and the expanded § 21 credit flow through). [Inputs: okFederalChildCareCredit, okFederalChildTaxCredit, okFederalAgi, okAgi.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      childCarePct: { value: "20", type: "int" },
      childTaxPct: { value: "5", type: "int" },
      agiCliff: { value: "10000000", type: "money" }, // $100,000
    },
    formula: (() => {
      const line2 = rd({ kind: "mulRate", base: max0(fact("okFederalChildCareCredit")), rate: { num: "20", den: "100" }, round: "half-up" });
      const line4 = rd({ kind: "mulRate", base: max0(fact("okFederalChildTaxCredit")), rate: { num: "5", den: "100" }, round: "half-up" });
      return iff(gt(fact("okFederalAgi"), money("10000000")), money("0"), rd(proratedChildCredit(max(line2, line4))));
    })(),
  },
  {
    id: "us.ok.eic_2020_rules",
    version: 1,
    jurisdiction: "us.ok",
    title: "Federal earned income credit under the 2020 rules Oklahoma freezes to — the printed 2020 EIC table (Form 511-EIC) at earned income, capped by the table at AGI once AGI reaches the phase-out row; MFS and unattested filers $0",
    citation: {
      source:
        "68 O.S. § 2357.43; OAC 710:50-15-90; 2025 Form 511-EIC (worksheet lines 15-20 and the printed '2020 Earned Income Credit (EIC) Table'); Rev. Proc. 2019-44 § 3.07 (the 2020 § 32 parameters)",
      section: "68 O.S. § 2357.43; Form 511-EIC; Rev. Proc. 2019-44 § 3.07",
      url: "https://oklahoma.gov/content/dam/ok/en/tax/documents/forms/individuals/current/511-EIC.pdf",
      excerpt:
        "FORM 511-EIC (verbatim): 'Effective for tax year 2022 and subsequent years, the Oklahoma Earned Income Credit (EIC) must be calculated using the same requirements for computing the EIC for federal income tax purposes in effect for the 2020 income tax year. The 2025 Oklahoma EIC is based on your earned income for either tax year 2024 or 2025.' 2020 PARAMETERS (Rev. Proc. 2019-44, verbatim table): earned income amount $7,030 / $10,540 / $14,800 / $14,800 (none / one / two / three or more children); maximum credit $538 / $3,584 / $5,920 / $6,660; threshold phaseout $8,790 / $19,330 (single, surviving spouse, head of household) and $14,680 / $25,220 (married filing jointly); completed phaseout $15,820 / $41,756 / $47,440 / $50,954 and MFJ $21,710 / $47,646 / $53,330 / $56,844; credit percentages 7.65% / 34% / 40% / 45%, phase-out percentages 7.65% / 15.98% / 21.06% / 21.06% (§ 32(b)(1)); investment income limit $3,650. WORKSHEET: line 15 total earned income (wages less excluded Medicaid waiver payments, plus elected combat pay, plus net self-employment earnings) → line 16 table look-up; line 17 federal AGI (1040 line 11); line 19: if AGI is at least $8,800 ($14,700 MFJ) with no children or $19,350 ($25,250 MFJ) with children, look up AGI too and 'Enter the smaller amount of lines 16 or 19'; line 20 'Enter the larger amount' of the 2024 and 2025 columns → Schedule 511-G line 1. TABLE CONVENTION (all 1,129 printed rows + 8 footnotes reproduce): each $50 row = the § 32 formula at the row midpoint, half-up, with the UNROUNDED maximum (7.65% × $7,030 = $537.795 — so [10,600-10,650) prints $397); the rows containing the earned-income amount and the phase-out threshold print the maximum; the row containing the completed amount is a footnoted partial band evaluated at its own midpoint ('at least $15,800 but less than $15,820 ... your credit is $1'). ELIGIBILITY under 2020 law (attested via okEicEligible, default false → $0): work-valid SSNs, not married filing separately (this rule returns $0 for MFS), investment income ≤ $3,650, and with no qualifying child age 25-64 and not another's dependent. MFJ uses the joint column; single, HOH, and QSS the other column. [Inputs: okEicEarnedIncome, okEicAgi, okEicQualifyingChildren, filingStatus, okEicEligible — evaluate once per year (2024 and 2025 columns) and keep the larger.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      earnedIncomeAmount0: { value: "703000", type: "money" },
      earnedIncomeAmount1: { value: "1054000", type: "money" },
      earnedIncomeAmount2Plus: { value: "1480000", type: "money" },
      maxCredit0: { value: "53800", type: "money" },
      maxCredit1: { value: "358400", type: "money" },
      maxCredit2: { value: "592000", type: "money" },
      maxCredit3: { value: "666000", type: "money" },
      thresholdOther0: { value: "879000", type: "money" },
      thresholdOther1Plus: { value: "1933000", type: "money" },
      thresholdMfj0: { value: "1468000", type: "money" },
      thresholdMfj1Plus: { value: "2522000", type: "money" },
      investmentIncomeLimit2020: { value: "365000", type: "money" },
    },
    formula: (() => {
      const ei = fact("okEicEarnedIncome");
      const agi = fact("okEicAgi");
      const forKids = (k: number, mfj: boolean): Expr => {
        const p = (mfj ? EIC_2020_MFJ : EIC_2020_OTHER)[k];
        const agiRow = (mfj ? EIC_AGI_ROW_MFJ : EIC_AGI_ROW_OTHER)[k];
        return iff(ge(agi, money(agiRow)), min(eicTable(ei, p), eicTable(max0(agi), p)), eicTable(ei, p));
      };
      const byKids = (mfj: boolean): Expr => {
        const k = fact("okEicQualifyingChildren");
        return iff(le(k, int("0")), forKids(0, mfj), iff(eq(k, int("1")), forKids(1, mfj), iff(eq(k, int("2")), forKids(2, mfj), forKids(3, mfj))));
      };
      return iff(
        { kind: "not", arg: fact("okEicEligible") },
        money("0"),
        iff(isStatus("mfs"), money("0"), iff(isStatus("mfj"), byKids(true), byKids(false))),
      );
    })(),
  },
  {
    id: "us.ok.eic",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma earned income credit — 5% of the 2020-rule federal EIC (Form 511-EIC line 20), prorated by Oklahoma AGI ÷ federal AGI, refundable (Form 511 line 28 / Schedule 511-G)",
    citation: {
      source: "68 O.S. § 2357.43; OAC 710:50-15-90; 2025 Form 511 packet, line 28 p. 15 and Schedule 511-G p. 25",
      section: "68 O.S. § 2357.43; Form 511 line 28; Schedule 511-G lines 1-4",
      url: PKT_URL,
      excerpt:
        "STATUTE (verbatim): 'five percent (5%) of the earned income tax credit allowed under Section 32 of the Internal Revenue Code ... computed using the same requirements, other than the five percent (5%) amount ... in effect for computation of the earned income tax credit for federal income tax purposes for the 2020 income tax year ... if the credit exceeds the tax imposed by Section 2355 of this title, the excess amount shall be refunded to the taxpayer. The maximum earned income tax credit allowable on the Oklahoma income tax return shall be prorated on the ratio that Oklahoma adjusted gross income bears to the federal adjusted gross income.' SCHEDULE 511-G: 1 federal EIC from Form 511-EIC line 20 (→ us.ok.eic_2020_rules, the larger of the 2024- and 2025-earned-income computations); 2 = 5%; 3 = Form 511 line 7 ÷ line 1 'do not enter more than 100%' — OAC 710:50-15-90(c) (verbatim): '(1) When the Oklahoma Adjusted Gross Income is negative and is less than the Federal Adjusted Gross Income, the ratio shall be 0%. ... (2) When the Federal Adjusted Gross Income is negative and is equal to or less than the Oklahoma Adjusted Gross Income, the ratio will be 100%'; 4 = 2 × 3 → Form 511 line 28 (Part Three payments — REFUNDABLE, 'The Oklahoma EIC is refundable beginning with tax year 2022'). Bills to raise the percentage to 10% (2025 SB 367 / HB 2229) were NOT enacted — 5% applies to TY2025 and TY2026 (OSCN § 2357.43 last amended 2021; no EITC item in the OTC 2025 or 2026 legislative summaries). Form 511-EIC must be attached. [Inputs: okEic2020Amount, okAgi, okFederalAgi.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "5", type: "int" } },
    formula: rd(proratedEic(rd({ kind: "mulRate", base: max0(fact("okEic2020Amount")), rate: { num: "5", den: "100" }, round: "half-up" }))),
  },
  {
    id: "us.ok.sales_tax_relief_credit",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma sales tax relief credit — $40 per qualified exemption when gross household income is at or under $20,000, or $50,000 with a dependent, a 65+ filer, or a qualifying disability; refundable (Form 538-S → Form 511 line 25)",
    citation: {
      source: "68 O.S. §§ 5011-5013 (Sales Tax Relief Act); OAC 710:50-15-96; 2025 Form 538-S (in the 2025 Form 511 packet) and Form 511 line 25 instructions p. 15",
      section: "68 O.S. § 5011(C)-(D); Form 538-S line 15; Form 511 line 25",
      url: PKT_URL,
      excerpt:
        "FORM 538-S line 15 (verbatim): 'Total qualified exemptions claimed in Box D on page 1 x $40 (credit claimed)' — Box D = yourself + spouse + number of dependents; statute § 5011(D): 'Forty Dollars ($40.00) multiplied by the number of allowable personal exemptions', EXCLUDING the additional exemptions for blindness or age 65+, inmates, and persons residing outside the state. INCOME LIMITS (Form 511 p. 15, verbatim): 'Your total gross household income cannot exceed $20,000 unless one of the following applies: You can claim an exemption for your dependent; You are 65 years of age or older by December 31, 2025; or You have a physical disability constituting a substantial handicap to employment (provide proof, see Form 538-S). If any one of the above three items pertains to you, your total gross household income limit is increased to $50,000.' GROSS HOUSEHOLD INCOME (Form 538-S p. 3): 'the total amount of gross income received by ALL persons living in the same household whether the income was taxable or not' — wages incl. nontaxable W-2 amounts, interest/dividends, dependents' income, Social Security INCLUDING Medicare, Railroad Retirement, pensions/IRAs, alimony, unemployment, EIC received (federal AND Oklahoma), public assistance, child support, workers' comp, gross rents/royalties/business receipts; NOT deferred 401(k)/IRA contributions or gifts. GATES (attested via okStrEligible, default false → $0): 'Oklahoma resident for the entire year' (domiciled); 'A person convicted of a felony and who is an inmate in the custody of the Department of Corrections for any portion of the year is not eligible'; 'Individuals living in Oklahoma under a visa do not qualify'; TANF recipients for any month are ineligible (relief is in the TANF benefit); continuous aid-to-aged/blind/disabled and nursing-home Medicaid recipients are paid by DHS instead; a taxpayer/spouse who died during the year does not qualify. REFUNDABLE (Form 511 Part Three line 25; § 5013). DEADLINE: filed by the return due date (extensions apply); 'An amended return cannot be filed to claim this credit after the due date.' [Inputs: okGrossHouseholdIncome, okStrExemptions, okStrHasDependent, okStrIs65, okStrDisabled, okStrEligible.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "4000", type: "money" }, // $40
      incomeLimit: { value: "2000000", type: "money" }, // $20,000
      incomeLimitExpanded: { value: "5000000", type: "money" }, // $50,000
    },
    formula: (() => {
      const ghi = fact("okGrossHouseholdIncome");
      const expanded: Expr = { kind: "or", args: [fact("okStrHasDependent"), fact("okStrIs65"), fact("okStrDisabled")] };
      const withinLimit: Expr = { kind: "or", args: [le(ghi, money("2000000")), { kind: "and", args: [expanded, le(ghi, money("5000000"))] }] };
      return iff({ kind: "and", args: [fact("okStrEligible"), withinLimit] }, mulInt(money("4000"), fact("okStrExemptions")), money("0"));
    })(),
  },
  {
    id: "us.ok.property_tax_relief_credit",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma property tax relief credit — homestead property tax paid in excess of 1% of gross household income, capped at $200, for a 65+ or totally disabled head of household with gross household income of $12,000 or less; refundable (Form 538-H → Form 511 line 24)",
    citation: {
      source: "2025 Form 538-H (Claim for Credit or Refund of Property Tax), Part 3 lines 15-18 and instructions p. 3; 2025 Form 511 packet, line 24 instructions p. 14",
      section: "Form 538-H lines 15-17; Form 511 line 24",
      url: "https://oklahoma.gov/content/dam/ok/en/tax/documents/forms/individuals/current/538-H.pdf",
      excerpt:
        "FORM 511 line 24 (verbatim): 'Any person 65 years of age or older or any totally disabled person who is head of a household, a resident of and domiciled in this state during the entire preceding calendar year, and whose gross household income for such year does not exceed $12,000, may file a claim for property tax relief on the amount of property taxes paid on the household they occupied during the preceding calendar year. The credit may not exceed $200. The claim must be made on Form 538-H.' FORM 538-H COMPUTATION (2025, verbatim lines): '15. Enter the amount of 2025 real estate taxes paid on your homestead. 16. To compute credit or refund allowable: Multiply the amount of total household income from Part 2, line 14 X 1% (0.01). 17. Amount of credit or refund, subtract line 16 from line 15 (not to exceed $200).' → line 18 → Form 511 line 24 (Part Three — REFUNDABLE: 'In all cases where claimants have no income tax liability, such claim ... shall be paid'). 'Head of Household' here is the 538-H definition (owner or joint owner who maintained the home and furnished its support), NOT the filing status; 'Disabled Person' = unable to engage in substantial gainful activity for 12+ months (SSA disability eligibility is proof); personal property taxes excluded; gross household income = every type of income of all household members, taxable or not, except gifts. One claim per household per year; due by the return due date (June 30 if no return); no amended-return claims. [Inputs: okPropertyTaxPaid, okGrossHouseholdIncome, okPtrEligible (65+/totally disabled, head of household, full-year domiciled) — default false → $0.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      maxCredit: { value: "20000", type: "money" }, // $200
      incomeLimit: { value: "1200000", type: "money" }, // $12,000
      incomeFloorPct: { value: "1", type: "int" }, // 1% of gross household income
    },
    formula: (() => {
      const ghi = fact("okGrossHouseholdIncome");
      const floor = rd({ kind: "mulRate", base: max0(ghi), rate: { num: "1", den: "100" }, round: "half-up" });
      const credit = min(max0(sub(rd(fact("okPropertyTaxPaid")), floor)), money("20000"));
      return iff({ kind: "and", args: [fact("okPtrEligible"), le(ghi, money("1200000"))] }, credit, money("0"));
    })(),
  },
  {
    id: "us.ok.use_tax",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma use tax estimate for filers without purchase records — the printed Use Tax Table on federal AGI ($1 to $30 in 31 bands), then 0.056% of federal AGI at $54,670 and over (Form 511 line 19)",
    citation: {
      source: "68 O.S. § 1402 (use tax); 2025 Form 511 packet, line 19 instructions pp. 13-14 and the Oklahoma Use Tax Table p. 14",
      section: "Form 511 line 19; 2025 Use Tax Table",
      url: PKT_URL,
      excerpt:
        "'If you do not know the exact amount of Oklahoma use tax you owe ... you can either: 1. Use the tax table on page 14 or multiply your AGI from line 1 by 0.056% (.00056), -OR- 2. Use one of the worksheets' (Worksheet One with records: purchases × 7% or the local rate, less tax paid to another state; Worksheet Two: the table for items under $1,000 plus 7%/local rate on items of $1,000 or more). USE TAX TABLE (verbatim, federal AGI at least / but less than → tax): 0-2,090 → $1; 2,090-4,670 → $2; 4,670-6,420 → $3; 6,420-8,170 → $4; 8,170-9,920 → $5; 9,920-11,795 → $6; 11,795-13,545 → $7; 13,545-15,295 → $8; 15,295-17,170 → $9; 17,170-18,920 → $10; 18,920-20,670 → $11; 20,670-22,420 → $12; 22,420-24,295 → $13; 24,295-26,045 → $14; 26,045-27,795 → $15; 27,795-29,670 → $16; 29,670-31,420 → $17; 31,420-33,170 → $18; 33,170-34,920 → $19; 34,920-36,795 → $20; 36,795-38,545 → $21; 38,545-40,295 → $22; 40,295-42,170 → $23; 42,170-43,920 → $24; 43,920-45,670 → $25; 45,670-47,420 → $26; 47,420-49,295 → $27; 49,295-51,045 → $28; 51,045-52,795 → $29; 52,795-54,670 → $30; '54,670 and over — multiply Federal AGI times by 0.00056' (whole dollars). The table is an ESTIMATE ('If you believe that estimate from the table is too high ... you may estimate what you think you owe'); a filer certifying no use tax is due checks the line 19 box instead. State rate 4.5% plus city/county. [Input: okFederalAgi — a NEGATIVE federal AGI is below the table's printed '0' lower bound and yields $0 (disclosed); the composer only applies this table when the filer elects the estimate.] TY2025 table only — the bands re-publish with each packet.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      ratePer100k: { value: "56", type: "int" }, // 0.056%
      tableTop: { value: "5467000", type: "money" }, // $54,670
    },
    formula: (() => {
      const agi = max0(fact("okFederalAgi"));
      const bands: [string, string][] = [
        ["209000", "100"], ["467000", "200"], ["642000", "300"], ["817000", "400"], ["992000", "500"],
        ["1179500", "600"], ["1354500", "700"], ["1529500", "800"], ["1717000", "900"], ["1892000", "1000"],
        ["2067000", "1100"], ["2242000", "1200"], ["2429500", "1300"], ["2604500", "1400"], ["2779500", "1500"],
        ["2967000", "1600"], ["3142000", "1700"], ["3317000", "1800"], ["3492000", "1900"], ["3679500", "2000"],
        ["3854500", "2100"], ["4029500", "2200"], ["4217000", "2300"], ["4392000", "2400"], ["4567000", "2500"],
        ["4742000", "2600"], ["4929500", "2700"], ["5104500", "2800"], ["5279500", "2900"], ["5467000", "3000"],
      ];
      let expr: Expr = rd({ kind: "mulRate", base: agi, rate: { num: "56", den: "100000" }, round: "half-up" });
      for (let i = bands.length - 1; i >= 0; i--) expr = iff(lt(agi, money(bands[i][0])), money(bands[i][1]), expr);
      return iff(lt(fact("okFederalAgi"), money("0")), money("0"), expr);
    })(),
  },
  {
    id: "us.ok.parameters",
    version: 1,
    jurisdiction: "us.ok",
    title: "Oklahoma 2025 Form 511 parameters — line structure, Schedule 511-A/B/C conventions, 529 and ABLE caps, Schedule 511-E proration, line 14b additions, and the TY2026 legislative changes",
    citation: {
      source: "2025 Oklahoma Resident Individual Income Tax Packet (Form 511, Schedules 511-A through 511-I, Form 538-S); OTC Summary of 2025 Tax Legislation; 68 O.S. §§ 2355, 2357, 2358 (OSCN currently-effective text — the 2026 session's HB 4432 wagering-loss carve-out from the $17,000 cap starts TY2027); web-verified September 2026",
      section: "Form 511 lines 1-42; Schedules 511-A..I",
      url: PKT_URL,
      excerpt:
        "STRUCTURE: 1 federal AGI (1040 line 11); 2 subtractions (Schedule 511-A line 18: 1 US obligation interest [not FNMA/GNMA]; 2 SOCIAL SECURITY taxed federally — subtracted in full; 3 CSRS in lieu of SS 100%; 4 MILITARY RETIREMENT 100%; 5-6 government/other retirement → us.ok.retirement_exclusion; 7 Railroad Retirement 100%; 8 Oklahoma depletion 22%; 9 Oklahoma NOL; 10 exempt tribal income; 11 gains on exempt obligations; 12 Oklahoma Capital Gain Deduction (Form 561: Oklahoma real/tangible property held 5+ years or Oklahoma-headquartered company interests held 2+ years); 13 refund of previously added-back state income tax; 14 electing-PTE income; 15 Oklahoma 100% bonus depreciation; 16 venture capital investment up to $25M (2022-2026); 17 miscellaneous codes 1-5/99); 3 = 1 − 2; 4 OUT-OF-STATE INCOME (real/tangible property or business income in another state — never wages, interest, dividends, pensions, unemployment, gambling); 5 = 3 − 4; 6 additions (Schedule 511-B line 10: non-Oklahoma municipal interest, out-of-state losses, lump sums, federal NOL, depletion recapture, 529 recapture, PTE loss, bonus depreciation add-back, misc); 7 OKLAHOMA AGI = 5 + 6; 8 adjustments (Schedule 511-C line 7: 1 ACTIVE MILITARY PAY 100%; 2 disability modification expenses; 3 Oklahoma 529 contributions — 'In no event can this deduction exceed $10,000 ($20,000 on a joint return) per tax year', 5-year carryforward, contributions through April 15; 4 foster care up to $5,000 (6+ months under contract, else monthly pro rata); 5 Parental Choice Tax Credit payments; 6 misc codes incl. NEW 2025 code 5 poll-worker leave $100/day, code 12 homebuyer savings $5,000/$10,000, code 14 ABLE $10,000/$20,000); 9 = 7 − 8; 10 deduction (→ us.ok.standard_deduction or us.ok.itemized_deductions, federal election controls); 11 exemptions (→ us.ok.exemptions); 12 = 10 + 11 — OR Schedule 511-E when line 4 > 0: (10 + 11) × (line 7 ÷ line 3), not more than 100%; 13 TAXABLE INCOME = 9 − 12; 14a tax (→ us.ok.income_tax; Form 573 farm averaging box 1 overrides); 14b additions: HSA non-qualified withdrawal 10% tax (36 O.S. § 6060.17, box 2), Affordable Housing credit recapture (box 3), IRC § 965(h) installment (box 4); 14 = 14a + 14b; 15 child care/child tax credit (→ us.ok.child_care_child_tax_credit; Schedule 511-F when line 7 < line 1); 16 credit for tax paid to another state (Form 511-TX — personal-services income only, transcribed); 17 other credits (Form 511-CR list of 26 credits incl. adoption expenses, transcribed); 18 = max0(14 − 15 − 16 − 17). PART THREE: 19 use tax (→ us.ok.use_tax estimate, worksheet, or the no-use-tax certification); 20 = 18 + 19; 21 withholding; 22 estimated payments INCLUDING the prior-year overpayment applied; 23 extension payment; 24 property tax relief (→ us.ok.property_tax_relief_credit); 25 sales tax relief (→ us.ok.sales_tax_relief_credit); 26 natural disaster credit (Form 576); 27 Form 578 zero-emission refund (85%); 28 EIC (→ us.ok.eic); 29 Parental Choice homeschool credit (Form 591-D, max $1,000 per student); 30 amended-return prior payments; 31 = 21..30; 32 amended-return prior overpayment; 33 = 31 − 32. SETTLE: 34 overpayment = 33 − 20; 35 applied to 2026 estimates; 36 Schedule 511-H donations (CASA, Wildlife Diversity — $2/$5/other); 37 = 35 + 36; 38 REFUND = 34 − 37 (paper checks need $10+; else debit card); 39 tax due = 20 − 33; 40 underpayment-of-estimated-tax interest (Form OW-8-P; none when the liability is under $1,000; when both an overpayment and line 40 exist the refund is reduced by line 40); 41a 5% delinquent penalty on (line 39 − line 19), 41b 1.25%/month interest; 42 = 39 + 40 + 41. WHOLE-DOLLAR rounding on every line ('include cents when adding ... round only the final total'). Due April 15, 2026 (April 20 if e-filed with electronic payment). ESTIMATED TAX (p. 5, line 40): required when the liability exceeds withholding by $500 or more and withholding is less than the smaller of 70% of the current-year liability or 100% of the prior-year liability; the underpayment interest rate is 20%; farmers with two-thirds of gross income from farming are exempt. FILING THRESHOLDS (gross income): $7,350 single/MFS, $14,700 MFJ, $10,350 HOH, $13,700 QSS, $6,350 dependents. TY2026 CHANGES (OTC 2025 Legislative Summary): HB 2764 rates (us.ok.income_tax v2); HB 2610 adoption credit 10% → 15%, max $2,000/$4,000 → $3,000/$6,000 (Form 511-CR); SB 190 regional food bank checkoff returns to Schedule 511-H; HB 2011 $250 firefighter cancer-screening credit. NOT ON THIS RETURN: Form 511-NR (part-year/nonresident), Form 574 resident/nonresident allocation, Form 511-TX mechanics, Form 573 farm averaging, Form 561 capital gain deduction mechanics. Federal conformity: rolling (68 O.S. § 2353 — 'any term ... shall have the same meaning as when used in a comparable context in the IRC'), so OBBBA's below-the-line tips/overtime/vehicle-interest deductions do NOT reduce Oklahoma AGI and Oklahoma grants no equivalent subtraction (none appears on Schedule 511-A/C).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      okla529CapSingle: { value: "1000000", type: "money" }, // $10,000
      okla529CapJoint: { value: "2000000", type: "money" }, // $20,000
      ableCapSingle: { value: "1000000", type: "money" },
      ableCapJoint: { value: "2000000", type: "money" },
      fosterCareMax: { value: "500000", type: "money" }, // $5,000
      homeschoolCreditPerStudent: { value: "100000", type: "money" }, // $1,000
      delinquentPenaltyPct: { value: "5", type: "int" },
      delinquentInterestPctPerMonthTimes100: { value: "125", type: "int" }, // 1.25%
      underpaymentInterestFloor: { value: "100000", type: "money" }, // no interest under $1,000 liability
      filingThresholdSingle: { value: "735000", type: "money" },
      filingThresholdMfj: { value: "1470000", type: "money" },
      filingThresholdHoh: { value: "1035000", type: "money" },
      filingThresholdQss: { value: "1370000", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Oklahoma Form 511 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ok.income_tax, us.ok.standard_deduction, us.ok.itemized_deductions, us.ok.exemptions, us.ok.retirement_exclusion, us.ok.child_care_child_tax_credit, us.ok.eic_2020_rules, us.ok.eic, us.ok.sales_tax_relief_credit, us.ok.property_tax_relief_credit, and us.ok.use_tax",
    },
  },
];
