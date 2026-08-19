import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Minnesota deep pack — TY2025 (all amounts re-verified from the 2025 Form M1
 * + 40-page instructions, Schedule M1M, and Schedule NIIT). Load-bearing
 * 2025 facts: IRC conformity as of MAY 1, 2023 (the 2025 OBBBA/H.R. 1 needs
 * Schedule M1NC adjustments — named verbatim in the What's New), the
 * standard-deduction 3%/10%/80% limitation, the $5,200 dependent exemption
 * with its ceil-step phase-out, the simplified Social Security subtraction,
 * and the TY2024+ 1% net investment income tax over $1,000,000.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const isStatus = (v: string): Expr => ({ kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: v } });

type Row = { thresholdCents: string; fixedCents: string; rate: { num: string; den: string } };
// printed 2025 Tax Rate Schedules (instructions p.39, verbatim — continuity
// verified to the cent: each anchor equals exact marginal accumulation)
const SINGLE: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "535", den: "10000" } },
  { thresholdCents: "3257000", fixedCents: "174250", rate: { num: "68", den: "1000" } },
  { thresholdCents: "10699000", fixedCents: "680306", rate: { num: "785", den: "10000" } },
  { thresholdCents: "19863000", fixedCents: "1399680", rate: { num: "985", den: "10000" } },
];
const MFJ: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "535", den: "10000" } },
  { thresholdCents: "4762000", fixedCents: "254767", rate: { num: "68", den: "1000" } },
  { thresholdCents: "18918000", fixedCents: "1217375", rate: { num: "785", den: "10000" } },
  { thresholdCents: "33041000", fixedCents: "2326031", rate: { num: "985", den: "10000" } },
];
const MFS: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "535", den: "10000" } },
  { thresholdCents: "2381000", fixedCents: "127384", rate: { num: "68", den: "1000" } },
  { thresholdCents: "9459000", fixedCents: "608688", rate: { num: "785", den: "10000" } },
  { thresholdCents: "16520500", fixedCents: "1163016", rate: { num: "985", den: "10000" } },
];
const HOH: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "535", den: "10000" } },
  { thresholdCents: "4010000", fixedCents: "214535", rate: { num: "68", den: "1000" } },
  { thresholdCents: "16113000", fixedCents: "1037539", rate: { num: "785", den: "10000" } },
  { thresholdCents: "26405000", fixedCents: "1845461", rate: { num: "985", den: "10000" } },
];

/** ceil-step count: ceil(max0(value)/unit), as an int expression */
const stepsCeil = (value: Expr, unitCents: string): Expr => ({
  kind: "stepUnits",
  value: { kind: "max0", arg: value },
  unitCents,
  mode: "ceil",
});

export const mnRules: Rule[] = [
  {
    id: "us.mn.income_tax",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota income tax — 2025 four-bracket rate schedules (5.35/6.80/7.85/9.85%) with the Tax Table convention (Form M1 line 10)",
    citation: {
      source:
        "Minn. Stat. § 290.06 subd. 2c (2025 indexed brackets); 2025 Form M1 instructions: Tax Tables pp.32-38, Tax Rate Schedules p.39",
      section: "Minn. Stat. § 290.06; Form M1 line 10",
      url: "https://www.revenue.state.mn.us/forms-instructions",
      excerpt:
        "2025 Tax Rate Schedules (instructions p.39, verbatim — continuity verified to the cent at every anchor): SINGLE: 5.35% to $32,570; $1,742.50 + 6.80% to $106,990; $6,803.06 + 7.85% to $198,630; $13,996.80 + 9.85% over $198,630. MARRIED FILING JOINTLY / QUALIFYING SURVIVING SPOUSE: 5.35% to $47,620; $2,547.67 + 6.80% to $189,180; $12,173.75 + 7.85% to $330,410; $23,260.31 + 9.85% over $330,410. MARRIED FILING SEPARATELY: 5.35% to $23,810; $1,273.84 + 6.80% to $94,590; $6,086.88 + 7.85% to $165,205; $11,630.16 + 9.85% over $165,205. HEAD OF HOUSEHOLD: 5.35% to $40,100; $2,145.35 + 6.80% to $161,130; $10,375.39 + 7.85% to $264,050; $18,454.61 + 9.85% over $264,050. METHOD (verbatim): 'You must use these schedules if line 9 of Form M1 is $86,800 or more'; 'If line 9 of Form M1 is less than $86,800, you must use the tax table on pages 32 through 38.' TABLE CONVENTION (decoded and verified against 8 printed rows): rows $0–$20 → $0, $20–$100 → $3 (the schedule at midpoint $60), then $100-wide rows; value = the filing-status schedule evaluated at the ROW MIDPOINT rounded to the nearest dollar (row 80,500–80,600 → single $5,005 / MFJ $4,787 / MFS $5,132 / HOH $4,896, all = the schedules at $80,550; row 900–1,000 → $51 = 5.35% × $950). useFormulaMethod=true evaluates the raw schedule at the exact income below $86,800. The brackets are indexed annually (Minn. Stat. § 290.06 subd. 2d). Minnesota also levies an ALTERNATIVE MINIMUM TAX (Schedule M1MT, 6.75% on a broadened base — Form M1 line 11, NOT modeled: compute per M1MT and disclose whenever AMT preferences exist) and, for TY2024+, a 1% NET INVESTMENT INCOME TAX over $1,000,000 → us.mn.niit (M1 line 14a box d). Part-year/nonresidents apportion via Schedule M1NR (not composed). [Input: Minnesota taxable income (Form M1 line 9).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "8680000", type: "money" }, // $86,800
      amtRatePctTimes100: { value: "675", type: "int" }, // 6.75% (M1MT, not modeled)
      topRatePctTimes100: { value: "985", type: "int" },
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr =>
        iff(
          isStatus("mfs"),
          printedSchedule(b, MFS),
          iff(
            isStatus("hoh"),
            printedSchedule(b, HOH),
            iff({ kind: "or", args: [isStatus("mfj"), isStatus("qss")] }, printedSchedule(b, MFJ), printedSchedule(b, SINGLE)),
          ),
        );
      const mid: Expr = {
        kind: "add",
        args: [
          mulInt(money("10000"), { kind: "stepUnits", value: base, unitCents: "10000", mode: "floor" }),
          money("5000"),
        ],
      };
      const table: Expr = iff(
        lt(base, money("2000")),
        money("0"),
        iff(lt(base, money("10000")), sched(money("6000")), sched(mid)),
      );
      return rd(
        iff(
          { kind: "and", args: [lt(base, money("8680000")), { kind: "not", arg: fact("useFormulaMethod") }] },
          table,
          sched(base),
        ),
      );
    })(),
  },
  {
    id: "us.mn.standard_deduction",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota standard deduction — 2025 amounts with the 65+/blind additions, the dependent worksheet, and the 3%/10%/80% high-income limitation (Form M1 line 4)",
    citation: {
      source:
        "Minn. Stat. § 290.0123; 2025 Form M1 instructions: Standard Deduction Table p.12, Dependent worksheet, Worksheets A/B for Line 4 (limitation) p.13",
      section: "Minn. Stat. § 290.0123; Form M1 line 4",
      url: "https://www.revenue.state.mn.us/forms-instructions",
      excerpt:
        "2025 amounts (What's New + the line 4 table, verbatim): $14,950 Single/MFS; $29,900 MFJ/QSS; $22,500 Head of Household. ADDITIONAL per 65-or-older/blind box (born before January 2, 1961 counts as 65): $2,000 for single/HOH; $1,550 for MFJ/QSS/MFS (table rows: single 14,950/16,950/18,950; MFJ 29,900/31,450/33,000/34,550/36,100; MFS 14,950/16,500/18,050/19,600/21,150; QSS 29,900/31,450/33,000; HOH 22,500/24,500/26,500). DEPENDENT-CLAIMED FILERS (worksheet, verbatim): the deduction is the LESSER of (earned income > $900 ? earned income + $350 : $1,250) or ($14,950 + the checked boxes × $2,000/$1,550) — worksheet step 2 is a FLAT $14,950 for EVERY filing status (a married dependent-claimed filer does NOT get the $29,900 base). HIGH-INCOME LIMITATION (Worksheets A/B, verbatim — applies when AGI on M1 line 1 exceeds $238,950, or $119,475 MFS): the deduction is REDUCED by the LESSER of (a) 3% × the excess of AGI over $238,950 capped at $91,350 (i.e. capped at AGI $330,300; MFS: over $119,475 capped at $45,675 / AGI $165,150) PLUS 10% × the excess of AGI over $330,300 ($165,150 MFS), or (b) 80% of the deduction; at AGI ≥ $1,083,150 (any status) the reduction is simply 80% (Worksheet B — arithmetically the same min()). MFS may NOT claim the standard deduction when the other spouse itemizes; nonresident aliens itemize only (treaty exception) — attestations, disclosed. The SAME limitation applies to Minnesota ITEMIZED deductions on Schedule M1SA (its own worksheet). [Inputs: mnAgi (M1 line 1 federal AGI), mnStdBoxes (65+/blind boxes), isClaimedAsDependent + mnDependentEarnedIncome (dependent worksheet), filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      baseSingleMfs: { value: "1495000", type: "money" }, // $14,950
      baseJointQss: { value: "2990000", type: "money" }, // $29,900
      baseHoh: { value: "2250000", type: "money" }, // $22,500
      addlPerBoxSingleHoh: { value: "200000", type: "money" }, // $2,000
      addlPerBoxMarried: { value: "155000", type: "money" }, // $1,550
      limitThreshold: { value: "23895000", type: "money" }, // $238,950 ($119,475 MFS)
      limitSecondTier: { value: "33030000", type: "money" }, // $330,300 ($165,150 MFS)
      limitFullReductionAgi: { value: "108315000", type: "money" }, // $1,083,150 → flat 80%
      dependentMinimum: { value: "125000", type: "money" }, // $1,250
      dependentEarnedAddition: { value: "35000", type: "money" }, // $350
    },
    formula: (() => {
      const agi = fact("mnAgi");
      const boxes = fact("mnStdBoxes");
      const married: Expr = { kind: "or", args: [isStatus("mfj"), isStatus("qss"), isStatus("mfs")] };
      const base: Expr = iff(
        { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        money("2990000"),
        iff(isStatus("hoh"), money("2250000"), money("1495000")),
      );
      const addl: Expr = mulInt(iff(married, money("155000"), money("200000")), boxes);
      const full: Expr = { kind: "add", args: [base, addl] };
      const depLimit: Expr = {
        kind: "max",
        args: [money("125000"), { kind: "add", args: [fact("mnDependentEarnedIncome"), money("35000")] }],
      };
      // dependent worksheet step 5 caps at the FLAT $14,950 base + boxes
      // (step 2 is $14,950 for every filing status), not the status base
      const depCap: Expr = { kind: "add", args: [money("1495000"), addl] };
      const ded: Expr = iff(fact("isClaimedAsDependent"), { kind: "min", args: [depCap, depLimit] }, full);
      const t1: Expr = iff(isStatus("mfs"), money("11947500"), money("23895000"));
      const band: Expr = iff(isStatus("mfs"), money("4567500"), money("9135000"));
      const t2: Expr = iff(isStatus("mfs"), money("16515000"), money("33030000"));
      const reductionAB: Expr = {
        kind: "add",
        args: [
          {
            kind: "mulRate",
            base: { kind: "min", args: [{ kind: "max0", arg: sub(agi, t1) }, band] },
            rate: { num: "3", den: "100" },
            round: "half-up",
          },
          {
            kind: "mulRate",
            base: { kind: "max0", arg: sub(agi, t2) },
            rate: { num: "10", den: "100" },
            round: "half-up",
          },
        ],
      };
      const cap80: Expr = { kind: "mulRate", base: ded, rate: { num: "80", den: "100" }, round: "half-up" };
      return rd({ kind: "max0", arg: sub(ded, { kind: "min", args: [reductionAB, cap80] }) });
    })(),
  },
  {
    id: "us.mn.exemptions",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota dependent exemptions — $5,200 per dependent (2025), phased 2% per $2,500 step of AGI over the status threshold (Form M1 line 5)",
    citation: {
      source:
        "Minn. Stat. § 290.0121; 2025 Form M1 instructions, Worksheet for Line 5 — Dependent Exemptions",
      section: "Minn. Stat. § 290.0121; Form M1 line 5; Schedule M1DQC",
      url: "https://www.revenue.state.mn.us/forms-instructions",
      excerpt:
        "Worksheet for Line 5 (2025, verbatim): $5,200 per dependent claimed on Schedule M1DQC. PHASE-OUT keyed to M1 line 1 AGI over: $358,550 MFJ/QSS; $239,050 Single; $298,800 HOH; $179,275 MFS. If the excess exceeds $122,500 ($61,250 MFS) → line 5 is $0. Otherwise the exemption total is reduced by 2% for EACH $2,500 step ($1,250 MFS) of the excess, ROUNDED UP to the next whole step ('Example: .0004 to 1' — even $1 of excess costs 2%). A filer who can be claimed as a dependent on another return leaves line 5 BLANK ($0). [Inputs: mnDependents (Schedule M1DQC count), mnAgi, filingStatus, isClaimedAsDependent.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perDependent: { value: "520000", type: "money" }, // $5,200
      thresholdJointQss: { value: "35855000", type: "money" }, // $358,550
      thresholdSingle: { value: "23905000", type: "money" }, // $239,050
      thresholdHoh: { value: "29880000", type: "money" }, // $298,800
      thresholdMfs: { value: "17927500", type: "money" }, // $179,275
      excessCutoff: { value: "12250000", type: "money" }, // $122,500 ($61,250 MFS)
      stepPct: { value: "2", type: "int" }, // per $2,500 step ($1,250 MFS), ceil
    },
    formula: (() => {
      const total: Expr = mulInt(money("520000"), fact("mnDependents"));
      const threshold: Expr = iff(
        { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        money("35855000"),
        iff(isStatus("hoh"), money("29880000"), iff(isStatus("mfs"), money("17927500"), money("23905000"))),
      );
      const excess: Expr = { kind: "max0", arg: sub(fact("mnAgi"), threshold) };
      const cutoff: Expr = iff(isStatus("mfs"), money("6125000"), money("12250000"));
      const stepsMfs: Expr = stepsCeil(excess, "125000");
      const stepsOther: Expr = stepsCeil(excess, "250000");
      const reduction = (steps: Expr): Expr =>
        mulInt({ kind: "mulRate", base: total, rate: { num: "2", den: "100" }, round: "half-up" }, steps);
      return iff(
        fact("isClaimedAsDependent"),
        money("0"),
        iff(
          { kind: "cmp", op: "gt", left: excess, right: cutoff },
          money("0"),
          rd({
            kind: "max0",
            arg: sub(total, iff(isStatus("mfs"), reduction(stepsMfs), reduction(stepsOther))),
          }),
        ),
      );
    })(),
  },
  {
    id: "us.mn.social_security_subtraction",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota Social Security subtraction — SIMPLIFIED method: full below the 2025 AGI thresholds, then 10% steps per $4,000 of excess (Schedule M1M line 12)",
    citation: {
      source:
        "Minn. Stat. § 290.0132 subd. 26; 2025 Schedule M1M, Line 12 instructions + Worksheet for Line 12",
      section: "Minn. Stat. § 290.0132 subd. 26; Schedule M1M line 12",
      url: "https://www.revenue.state.mn.us/forms-instructions",
      excerpt:
        "2025 M1M line 12 (verbatim): the FULL federally taxable Social Security (Form 1040 line 6b) is subtracted when adjusted gross income is below $84,490 (Single/HOH), $108,320 (MFJ/QSS), or $54,160 (MFS). Above those amounts, the SIMPLIFIED METHOD (worksheet steps 1-8) phases the subtraction out by 10% for each $4,000 step ($2,000 MFS) of the excess, ROUNDED UP, capped at 10 steps — fully phased out $40,000 ($20,000 MFS) above the threshold. THE SUBTRACTION IS THE GREATER of the simplified method or the older ALTERNATIVE METHOD (worksheet steps 9-28: the pre-2023 provisional-income computation with 2025 parameters $88,630/$69,250/$44,315 thresholds and $5,840/$4,560/$2,920-MFS maximum subtractions) — this rule computes the SIMPLIFIED method only; when AGI is above the full-subtraction threshold, ALSO compute the alternative method per the worksheet and take the greater (composed; the alternative usually wins only in a narrow band). RAILROAD RETIREMENT OFFSET (worksheet steps 25-29): Tier 1 Railroad Retirement benefits already subtracted on M1M line 17 REDUCE both methods' results — this rule computes the pre-offset simplified amount; subtract the M1M line 17 Tier 1 amount from the result on composition (never double-subtract). Filers with Schedule M1NC adjustments use the M1NC version of the worksheet. [Inputs: mnAgi (M1 line 1), mnTaxableSs (1040 line 6b), filingStatus; the RR offset and the alternative method are composed.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      thresholdSingleHoh: { value: "8449000", type: "money" }, // $84,490
      thresholdJointQss: { value: "10832000", type: "money" }, // $108,320
      thresholdMfs: { value: "5416000", type: "money" }, // $54,160
      stepPct: { value: "10", type: "int" }, // per $4,000 ($2,000 MFS), ceil, max 10
      altMaxJoint: { value: "584000", type: "money" }, // $5,840 (alternative method)
      altMaxSingleHoh: { value: "456000", type: "money" }, // $4,560
      altMaxMfs: { value: "292000", type: "money" }, // $2,920
    },
    formula: (() => {
      const ss: Expr = { kind: "max0", arg: fact("mnTaxableSs") };
      const threshold: Expr = iff(
        { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        money("10832000"),
        iff(isStatus("mfs"), money("5416000"), money("8449000")),
      );
      const excess: Expr = { kind: "max0", arg: sub(fact("mnAgi"), threshold) };
      const steps: Expr = iff(isStatus("mfs"), stepsCeil(excess, "200000"), stepsCeil(excess, "400000"));
      const cappedSteps: Expr = { kind: "min", args: [steps, { kind: "int", value: "10" }] };
      const reduction: Expr = mulInt(
        { kind: "mulRate", base: ss, rate: { num: "10", den: "100" }, round: "half-up" },
        cappedSteps,
      );
      return rd({ kind: "max0", arg: sub(ss, reduction) });
    })(),
  },
  {
    id: "us.mn.niit",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota net investment income tax — 1% of net investment income over $1,000,000 (Schedule NIIT, Form M1 line 14a box d; TY2024+)",
    citation: {
      source:
        "Minn. Stat. § 290.033 (2023 enactment, taxable years beginning after December 31, 2023); 2025 Schedule NIIT; 2025 Form M1 instructions (Tax on Net Investment Income)",
      section: "Minn. Stat. § 290.033; Schedule NIIT; Form M1 line 14a",
      url: "https://www.revenue.state.mn.us/sites/default/files/2025-12/niit-25.pdf",
      excerpt:
        "For taxable years beginning after December 31, 2023, Minnesota taxes net investment income over $1,000,000 at 1% (Schedule NIIT: subtract $1,000,000 from net investment income and multiply by 1%). NET INVESTMENT INCOME follows the federal Form 8960 concept (interest, dividends, capital gains, rental/royalty income, non-qualified annuities) but EXCLUDES net gains from dispositions of property classified as CLASS 2a AGRICULTURAL LAND — compose per Schedule NIIT with Form 8960 attached. Must-file trigger (M1 instructions verbatim): 'You must file Schedule NIIT... if you have net investment income over $1,000,000' — including composite/PTE-tax electors, who file Form M1 with ONLY the NIIT (lines 13/16/20/22 zeroed, the dedicated checkbox marked). The tax lands on Form M1 line 14a (box d) and joins line 15 tax before credits. [Input: mnNetInvestmentIncome = the Schedule NIIT Minnesota net investment income (after the ag-land exclusion).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      threshold: { value: "100000000", type: "money" }, // $1,000,000
      ratePct: { value: "1", type: "int" },
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "max0", arg: sub(fact("mnNetInvestmentIncome"), money("100000000")) },
      rate: { num: "1", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.mn.parameters",
    version: 1,
    jurisdiction: "us.mn",
    title:
      "Minnesota 2025 return parameters — IRC conformity (May 1, 2023 — OBBBA via Schedule M1NC), subtractions, credits, AMT, and composition conventions (Form M1)",
    citation: {
      source:
        "2025 Form M1 + 40-page instructions; Schedules M1M, M1MB, M1SA, M1C, M1REF, M1CWFC, M1RENT, M1MT, M1NC, NIIT; Minn. Stat. ch. 290",
      section: "Form M1; Schedules M1M/M1C/M1REF; Instructions pp.3-31",
      url: "https://www.revenue.state.mn.us/forms-instructions",
      excerpt:
        "IRC CONFORMITY (What's New, verbatim, LOAD-BEARING for 2025): 'Rules used to determine Minnesota Individual Income Tax are generally based on the Internal Revenue Code (IRC) as amended through MAY 1, 2023, with certain exceptions. Since that date Congress has enacted H.R. 1 of 2025' — the 2025 OBBBA does NOT apply to Minnesota; affected filers complete Schedule M1NC, Federal Adjustments (M1 line 2/M1M interplay), and use the M1NC versions of downstream worksheets (e.g. the Social Security subtraction). RETURN CHAIN (2025 Form M1): line 1 FAGI (1040 line 11); line 2 additions (Schedule M1M line 10 + M1MB line 9 — non-MN municipal bond interest, federal bonus-depreciation/§ 179 addbacks, M1NC positive adjustments); line 3 = 1+2; line 4 standard (us.mn.standard_deduction) OR Minnesota itemized (Schedule M1SA — its OWN itemized set with the SAME 3%/10%/80% limitation); line 5 dependent exemptions (us.mn.exemptions, Schedule M1DQC); line 6 state income tax refund subtraction (federal Schedule 1 line 1); line 7 subtractions (M1M line 40 + M1MB line 22): the SOCIAL SECURITY subtraction (us.mn.social_security_subtraction — greater-of simplified/alternative), U.S. government interest, K-12 education expense subtraction, CHARITABLE CONTRIBUTIONS OVER $500 for non-itemizers (50% of the excess over $500, M1M line 11 worksheet), bonus-depreciation recovery subtractions, the NEW 2025 items (coerced-debt discharge, consumer enforcement compensation, foreign service retirement, SEIU stipend), age-65+/disabled subtraction (Schedule M1R, income-limited), qualified public pension subtraction (Schedule M1QPEN), military pay/pension subtractions; line 8 = 4+5+6+7; line 9 TAXABLE INCOME (blank if ≤ 0); line 10 tax (us.mn.income_tax); line 11 ALTERNATIVE MINIMUM TAX (Schedule M1MT, 6.75% — NOT modeled, compute and disclose when preferences exist); line 13 = 12 for full-year residents (M1NR apportions otherwise); line 14a other taxes (M1HOME first-time homebuyer recapture / M1529 recapture / M1LS lump-sum distribution tax / Schedule NIIT → us.mn.niit); line 14b REPAYMENT OF ADVANCE CHILD TAX CREDIT (NEW: 2025 reconciliation of advance M1CWFC payments elected on the 2024 return); line 15 = 13+14a+14b; line 16 NONREFUNDABLE credits (Schedule M1C, transcribed): MARRIAGE CREDIT (M1MA — joint two-earner relief), long-term care insurance credit, credit for income tax paid to another state (M1CR / M1RCR for Wisconsin), past military service credit, master's degree credit, STUDENT LOAN CREDIT (M1SLC), education savings account credit, SEED capital, film production; line 17 = 15−16 floor blank; line 18 Nongame Wildlife contribution; line 19 = 17+18; line 20 withholding (Schedule M1W: W-2/1099/W-2G + KPI/KS/KF); line 21 estimated + extension payments; line 22 REFUNDABLE credits (Schedule M1REF, transcribed): MINNESOTA CHILD AND WORKING FAMILY CREDITS (Schedule M1CWFC + M1DQC — the 2023-restructured per-child credit, inflation-indexed, with the working family earned-income component and an ADVANCE-PAYMENT election for next year), the RENTER'S CREDIT (Schedule M1RENT — moved onto the income tax return: household income under $77,570, maximum $2,720 for 2025, CRP required), child and dependent care credit (M1CD), K-12 EDUCATION CREDIT (M1ED), parents of stillborn children credit (M1PSC), the refundable Wisconsin credit (M1RCR), historic structure rehabilitation, enterprise zone, angel investment, the pass-through entity tax credit, claim of right, sustainable aviation fuel, and research credits; line 23 = 20+21+22; line 24 refund / line 26 owe; line 27 Schedule M15 underpayment penalty; lines 29/30 refund split with 2026 estimates. FILING REQUIREMENT (instructions p.6): required when a FEDERAL return is required, or when gross income meets the status threshold — the thresholds match the standard deduction EXCEPT married filing separately, whose printed threshold is $5 at any age; also required for advance-CTC electors and Schedule NIIT filers regardless of income. HOMESTEAD credit refund (M1PR) is a SEPARATE property-tax refund return (renters now use M1RENT on the M1 instead). Use tax: separate Form UT1. No local income taxes. [Composition parameters — the computable pieces are us.mn.income_tax, us.mn.standard_deduction, us.mn.exemptions, us.mn.social_security_subtraction, us.mn.niit.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      renterCreditMax: { value: "272000", type: "money" }, // $2,720 (2025)
      renterCreditIncomeGate: { value: "7757000", type: "money" }, // $77,570
      charitableNonItemizerFloor: { value: "50000", type: "money" }, // $500 (50% of excess)
      charitableNonItemizerPct: { value: "50", type: "int" },
      amtRatePctTimes100: { value: "675", type: "int" }, // M1MT 6.75%
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Minnesota composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.mn.income_tax, us.mn.standard_deduction, us.mn.exemptions, us.mn.social_security_subtraction, us.mn.niit",
    },
  },
];
