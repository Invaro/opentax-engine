import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Wisconsin deep pack — TY2025 (all amounts re-verified from the 2025 Form 1
 * + 46-page instructions, Schedules SB/I and the SB instructions, and the
 * DOR 2025 Form 1-ES standard-deduction formulas). TY2025 changes encoded:
 * 2025 Act 15 (signed July 3, 2025, RETROACTIVE to TY2025) widened the 4.4%
 * bracket and created the 67+ retirement subtraction ($24,000/$48,000 —
 * which FORFEITS essentially all credits), tuition subtraction cap $7,649,
 * adoption $15,000, Edvest $5,130. Every bracket boundary re-derived from
 * BOTH the printed Tax Computation Worksheet subtraction constants and
 * printed tax-table rows (exact everywhere except a half-cent nuance in the
 * single/MFS 7.65% worksheet constants, disclosed in the rule excerpt).
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const isStatus = (v: string): Expr => ({ kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: v } });

type Row = { thresholdCents: string; fixedCents: string; rate: { num: string; den: string } };
// anchors = exact marginal accumulation; the printed ≥$100,000 Tax Computation
// Worksheet subtraction constants (5.3% − $586.44 etc.) re-derive these to the
// cent, and printed tax-table rows confirm every boundary
const SINGLE_HOH: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "35", den: "1000" } },
  { thresholdCents: "1468000", fixedCents: "51380", rate: { num: "44", den: "1000" } },
  { thresholdCents: "5048000", fixedCents: "208900", rate: { num: "53", den: "1000" } },
  { thresholdCents: "32329000", fixedCents: "1654793", rate: { num: "765", den: "10000" } },
];
const MFJ: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "35", den: "1000" } },
  { thresholdCents: "1958000", fixedCents: "68530", rate: { num: "44", den: "1000" } },
  { thresholdCents: "6730000", fixedCents: "278498", rate: { num: "53", den: "1000" } },
  { thresholdCents: "43106000", fixedCents: "2206426", rate: { num: "765", den: "10000" } },
];
const MFS: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "35", den: "1000" } },
  { thresholdCents: "979000", fixedCents: "34265", rate: { num: "44", den: "1000" } },
  { thresholdCents: "3365000", fixedCents: "139249", rate: { num: "53", den: "1000" } },
  { thresholdCents: "21553000", fixedCents: "1103213", rate: { num: "765", den: "10000" } },
];

export const wiRules: Rule[] = [
  {
    id: "us.wi.income_tax",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin income tax — 2025 four-bracket schedules with the Act 15 widened 4.4% bracket and the Tax Table convention (Form 1 line 12)",
    citation: {
      source:
        "Wis. Stat. § 71.06 as amended by 2025 Act 15 (signed July 3, 2025, retroactive to TY2025); 2025 Form 1 instructions: Tax Table pp.38-43, Tax Computation Worksheet p.44",
      section: "Wis. Stat. § 71.06; Form 1 line 12; 2025 Act 15",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "2025 rate schedules (bracket boundaries re-derived from the printed ≥$100,000 Tax Computation Worksheet subtraction constants AND confirmed against printed tax-table rows; the 5.3% constants agree to the cent everywhere, and the 7.65% constants imply single/MFS top anchors of $16,547.925/$11,032.125 — half a cent under this rule's marginal $16,547.93/$11,032.13, so literal worksheet arithmetic can differ by $1 at ~$2,000 intervals of top-bracket single/MFS income; MFJ is exact everywhere): SINGLE and HEAD OF HOUSEHOLD (same schedule; HOH differs only in the standard deduction): 3.5% to $14,680; $513.80 + 4.4% over $14,680 to $50,480; $2,089.00 + 5.3% over $50,480 to $323,290; $16,547.93 + 7.65% over $323,290. MARRIED FILING JOINTLY: 3.5% to $19,580; $685.30 + 4.4% to $67,300; $2,784.98 + 5.3% to $431,060; $22,064.26 + 7.65% above. MARRIED FILING SEPARATELY: 3.5% to $9,790; $342.65 + 4.4% to $33,650; $1,392.49 + 5.3% to $215,530; $11,032.13 + 7.65% above. 2025 ACT 15 (retroactive to TY2025): the 4.4% bracket's CEILING was RAISED by $21,110 single / $28,150 MFJ (to $50,480 / $67,300 — pre-Act surveys print the old, narrower bracket; the printed 2025 forms control). PRINTED ≥$100,000 WORKSHEET (verbatim subtraction-constant form, arithmetically identical to the schedules above): single/HOH $100,000–$323,290 → 5.3% × income − $586.44; $323,290+ → 7.65% × income − $8,183.76; MFJ − $781.92 / − $10,911.83 (break $431,060); MFS − $390.96 / − $5,455.92 (break $215,530). METHOD: taxable income UNDER $100,000 MUST use the printed Tax Table ('Use this Tax Table if your taxable income is less than $100,000') — three status columns (single/HOH share one), row value = the schedule evaluated at the ROW MIDPOINT rounded half-up; rows are $20-wide ($0–$20 → $0, $20–$40 → $1), then $40–$100, $100–$200, and $100-wide thereafter — verified against 8 printed rows incl. the instructions' own example ($28,653 MFJ → row 28,600–28,700 → $1,084) and boundary-straddling rows (67,300–67,400: single $2,983 / MFJ $2,788 / MFS $3,179, pinning all three schedules' boundaries). $100,000+ uses the worksheet (whole dollars). useFormulaMethod=true evaluates the raw schedule at the exact income below $100,000. Wisconsin has NO local income taxes. NONRESIDENT/PART-YEAR: Form 1NPR (not composed — this target is the full-year-resident Form 1 tax on line 11 taxable income). [Input: Wisconsin taxable income (Form 1 line 11).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "10000000", type: "money" }, // $100,000
      act15SecondBracketCeilingSingle: { value: "5048000", type: "money" }, // $50,480
      act15SecondBracketCeilingJoint: { value: "6730000", type: "money" }, // $67,300
      topRatePctTimes100: { value: "765", type: "int" }, // 7.65%
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr =>
        iff(isStatus("mfj"), printedSchedule(b, MFJ), iff(isStatus("mfs"), printedSchedule(b, MFS), printedSchedule(b, SINGLE_HOH)));
      // row midpoints: [0,20) → $10; [20,40) → $30; [40,100) → $70;
      // $100-wide rows from $100 (mid = floor/100 + 50)
      const mid: Expr = {
        kind: "add",
        args: [
          mulInt(money("10000"), { kind: "stepUnits", value: base, unitCents: "10000", mode: "floor" }),
          money("5000"),
        ],
      };
      const table: Expr = iff(
        lt(base, money("2000")),
        sched(money("1000")),
        iff(lt(base, money("4000")), sched(money("3000")), iff(lt(base, money("10000")), sched(money("7000")), sched(mid))),
      );
      return rd(
        iff(
          { kind: "and", args: [lt(base, money("10000000")), { kind: "not", arg: fact("useFormulaMethod") }] },
          table,
          sched(base),
        ),
      );
    })(),
  },
  {
    id: "us.wi.standard_deduction",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin sliding standard deduction — 2025 phase-out formulas with the printed table's $500-row midpoint convention (Form 1 line 8)",
    citation: {
      source:
        "Wis. Stat. § 71.05(22) (2025 indexed amounts); 2025 Form 1 instructions, Standard Deduction Table pp.35-37; 2025 Form 1-ES instructions (published formulas)",
      section: "Wis. Stat. § 71.05(22); Form 1 line 8; 2025 Standard Deduction Table",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "2025 sliding standard deduction formulas (DOR-published in the 2025 Form 1-ES instructions, keyed to WISCONSIN INCOME — Form 1 line 7): SINGLE: income under $19,550 → $13,560; $19,550–$132,550 → $13,560 − 12.0% × (income − $19,550); over → $0. MARRIED FILING JOINTLY: under $28,210 → $25,110; to $155,169 → $25,110 − 19.778% × (income − $28,210); over → $0. MARRIED FILING SEPARATELY: under $13,390 → $11,930; to $73,710 → $11,930 − 19.778% × (income − $13,390); over → $0. HEAD OF HOUSEHOLD: under $19,550 → $17,520; to $57,210 → $17,520 − 22.515% × (income − $19,550); ABOVE $57,210 the HOH filer takes the SINGLE deduction — i.e. HOH = the GREATER of the HOH formula or the single formula (verified: the printed table's HOH column equals the single column from ~$57,210 up, e.g. row 93,500–94,000 → $4,656 in both). TABLE CONVENTION (printed Standard Deduction Table, verified against 12 rows): rows are $500-wide (first row $0–$13,390, then $13,390–$13,500; plus one special NARROW tail row $155,000–$155,169 → MFJ $17 at its own midpoint $155,084.50 — the single/MFS zero-crossings get NO special row), each row = the formula at the ROW MIDPOINT rounded half-up (row 48,000–48,500 MFJ: 25,110 − 19.778% × 20,040 = $21,146.49 → $21,146; row 44,000–44,500 MFS: $5,826.51 → $5,827 — both printed-exact). useFormulaMethod=true evaluates the formula at the exact income instead. DEPENDENT FILERS (checkbox on line 8): the deduction is the SMALLER of the table amount or max($1,350, earned income + $450) per the Standard Deduction Worksheet for Dependents — the earned-income limb is composed on the return, not here. Amounts are indexed annually under § 71.05(22)(ds). [Input: wiIncome = Form 1 line 7 Wisconsin income (may be negative — treated as $0).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxSingle: { value: "1356000", type: "money" }, // $13,560
      maxJoint: { value: "2511000", type: "money" }, // $25,110
      maxMfs: { value: "1193000", type: "money" }, // $11,930
      maxHoh: { value: "1752000", type: "money" }, // $17,520
      phaseStartSingleHoh: { value: "1955000", type: "money" }, // $19,550
      phaseStartJoint: { value: "2821000", type: "money" }, // $28,210
      phaseStartMfs: { value: "1339000", type: "money" }, // $13,390
      dependentMinimum: { value: "135000", type: "money" }, // $1,350 (worksheet)
      dependentEarnedAddition: { value: "45000", type: "money" }, // $450
    },
    formula: (() => {
      const income: Expr = { kind: "max0", arg: fact("wiIncome") };
      const phase = (maxC: string, rate: { num: string; den: string }, startC: string, x: Expr): Expr => ({
        kind: "max0",
        arg: {
          kind: "min",
          args: [
            money(maxC),
            {
              kind: "sub",
              left: money(maxC),
              right: {
                kind: "mulRate",
                base: { kind: "max0", arg: { kind: "sub", left: x, right: money(startC) } },
                rate,
                round: "half-up",
              },
            },
          ],
        },
      });
      const formulas = (x: Expr): Expr =>
        iff(
          isStatus("mfj"),
          phase("2511000", { num: "19778", den: "100000" }, "2821000", x),
          iff(
            isStatus("mfs"),
            phase("1193000", { num: "19778", den: "100000" }, "1339000", x),
            iff(
              { kind: "or", args: [isStatus("hoh"), isStatus("qss")] },
              // HOH: greater of its own steeper phase-out or the single amount
              {
                kind: "max",
                args: [
                  phase("1752000", { num: "22515", den: "100000" }, "1955000", x),
                  phase("1356000", { num: "12", den: "100" }, "1955000", x),
                ],
              },
              phase("1356000", { num: "12", den: "100" }, "1955000", x),
            ),
          ),
        );
      // printed-table midpoints: [0,13390) any point gives the flat maximum;
      // [13,390, 13,500) → mid $13,445; $500-wide rows from $13,500
      const mid: Expr = {
        kind: "add",
        args: [
          money("1350000"),
          mulInt(money("50000"), {
            kind: "stepUnits",
            value: { kind: "sub", left: income, right: money("1350000") },
            unitCents: "50000",
            mode: "floor",
          }),
          money("25000"),
        ],
      };
      const tableIncome: Expr = iff(
        lt(income, money("1339000")),
        income,
        iff(
          lt(income, money("1350000")),
          money("1344500"),
          // printed special tail row 155,000-155,169 (MFJ column -> $17 at
          // mid $155,084.50; harmless for other statuses, already $0 there)
          iff(
            { kind: "and", args: [{ kind: "cmp", op: "ge", left: income, right: money("15500000") }, lt(income, money("15516900"))] },
            money("15508450"),
            mid,
          ),
        ),
      );
      return rd(formulas(iff(fact("useFormulaMethod"), income, tableIncome)));
    })(),
  },
  {
    id: "us.wi.eic",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin earned income credit — 4% / 11% / 34% of the federal EIC by number of qualifying children (Form 1 line 30, refundable)",
    citation: {
      source: "Wis. Stat. § 71.07(9e); 2025 Form 1 instructions, Line 30 (Steps 1-4)",
      section: "Wis. Stat. § 71.07(9e); Form 1 line 30",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "Line 30 (2025 instructions, verbatim Step 3 table): 1 qualifying child → 4%; 2 → 11%; 3 or more → 34% of the federal earned income credit. NO credit with zero qualifying children. REFUNDABLE. Requirements: legal Wisconsin resident for the ENTIRE year; MFS filers are INELIGIBLE unless they meet IRC § 7703(b) (then Wisconsin status is 'head of household, married'). CONFORMITY WRINKLE (verbatim): ''Federal earned income credit' means the credit computed using the IRC as adopted by Wisconsin' — a filer with Schedule I Part I adjustments must RECOMPUTE the federal EIC on Schedule I Part III and use that recomputed amount, not the actual Form 1040 line 27 credit. Include federal Schedule EIC (and Form 8867 if paid-prepared). The DOR will compute the credit on request ('EIC' notation). CAUTION: claiming the NEW 67+ retirement income subtraction (Schedule SB line 16) FORFEITS this credit (lines 30-35 restriction). [Inputs: wiFederalEicForWi = the federal EIC as computed under Wisconsin's IRC (Schedule I Part III when applicable, else Form 1040 line 27); wiQualifyingChildren.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOneChild: { value: "4", type: "int" },
      pctTwoChildren: { value: "11", type: "int" },
      pctThreePlus: { value: "34", type: "int" },
    },
    formula: (() => {
      const eic: Expr = { kind: "max0", arg: fact("wiFederalEicForWi") };
      const kids = fact("wiQualifyingChildren");
      const pct = (num: string): Expr => rd({ kind: "mulRate", base: eic, rate: { num, den: "100" }, round: "half-up" });
      return iff(
        { kind: "cmp", op: "ge", left: kids, right: { kind: "int", value: "3" } },
        pct("34"),
        iff(
          { kind: "cmp", op: "eq", left: kids, right: { kind: "int", value: "2" } },
          pct("11"),
          iff({ kind: "cmp", op: "eq", left: kids, right: { kind: "int", value: "1" } }, pct("4"), money("0")),
        ),
      );
    })(),
  },
  {
    id: "us.wi.married_couple_credit",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin married couple credit — 3% of the lesser-earning spouse's qualified earned income, maximum $480 (Form 1 Schedule 2, line 18)",
    citation: {
      source: "Wis. Stat. § 71.07(6); 2025 Form 1, Schedule 2 (page 4) and instructions Line 18",
      section: "Wis. Stat. § 71.07(6); Form 1 line 18 / Schedule 2",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "Schedule 2 (printed form, verbatim): both spouses must have qualified earned income on a JOINT return (and neither files federal Form 2555/2555-EZ or 4563). Qualified earned income per column = taxable wages/salaries/tips/other employee compensation (NO deferred compensation, interest, dividends, pensions, unemployment, or other unearned income) + net self-employment profit, MINUS the federal Schedule 1 adjustments on lines 12, 16, 20, 24e, 24f, and 24g and any Wisconsin disability income exclusion, floor $0. Line 6 = the SMALLER column, capped at $16,000; credit = 3% × line 6, 'Do not fill in more than $480.' NONREFUNDABLE (part of the line 21 credit stack). Forfeited if the Schedule SB line 16 retirement subtraction is claimed. [Input: wiLowerQualifiedEarnedIncome = the lesser spouse's Schedule 2 line 5 amount.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      earnedIncomeCap: { value: "1600000", type: "money" }, // $16,000
      creditMax: { value: "48000", type: "money" }, // $480
      ratePct: { value: "3", type: "int" },
    },
    formula: {
      kind: "min",
      args: [
        rd({
          kind: "mulRate",
          base: { kind: "min", args: [{ kind: "max0", arg: fact("wiLowerQualifiedEarnedIncome") }, money("1600000")] },
          rate: { num: "3", den: "100" },
          round: "half-up",
        }),
        money("48000"),
      ],
    },
  },
  {
    id: "us.wi.school_property_tax_credit",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin school property tax credit — 12% via the printed rent (20%/25% occupancy factors) and property-tax tables, combined maximum $300 (Form 1 lines 16a/16b)",
    citation: {
      source: "Wis. Stat. § 71.07(9); 2025 Form 1 instructions, Lines 16a/16b and the printed rent/property-tax credit tables pp.19-20",
      section: "Wis. Stat. § 71.07(9); Form 1 lines 16a-16b",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "Two printed lookup tables (decoded and verified against 10 printed rows): RENT (line 16a, $100-WIDE rows, value = rate × row midpoint, half-up): heat INCLUDED in rent → 2.4% of rent (12% × the 20% occupancy-cost factor; row $4,300–$4,400 → $104 = 2.4% × $4,350); heat NOT included → 3.0% (12% × 25%; same row → $131; row $3,500–$3,600 → $106.50 → $107; first row $1–$100 → $1/$2). PROPERTY TAXES on the principal residence (line 16b): the homeowner's table uses $25-WIDE rows — $1–$25 → $2; $25–$50 → $5; $100–$125 → $14; $1,000–$1,025 → $122; $2,475–$2,500 → $299; '$2,500 or more' → the $300 maximum (= 12% × the $25-row midpoint, half-up — a DIFFERENT granularity from the rent tables). COMBINED CAP (verbatim): 'combined credit claimed on lines 16a and 16b may not be more than $300 ($150 if married filing a separate return or married filing as head of household)' — this rule caps $150 for mfs; the 'Head of household, married' checkbox case is composed (the composer applies $150 when wiMarriedHoh is attested). MUTUAL EXCLUSION (instructions p.18): NOT claimable if the filer or spouse claims the veterans and surviving spouses property tax credit (Form 1 line 34) — composed disclosure. NONREFUNDABLE; rent must be on a principal Wisconsin residence subject to property tax; forfeited under the Schedule SB line 16 retirement subtraction. [Inputs: wiRentHeatIncluded, wiRentHeatNotIncluded, wiPropertyTaxesPaid; filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      combinedMax: { value: "30000", type: "money" }, // $300
      combinedMaxMfs: { value: "15000", type: "money" }, // $150
      rentHeatIncludedRatePctTimes10: { value: "24", type: "int" }, // 2.4%
      rentHeatNotIncludedRatePctTimes10: { value: "30", type: "int" }, // 3.0%
      propertyTaxRatePct: { value: "12", type: "int" },
    },
    formula: (() => {
      const midRow = (f: string, widthCents: string, halfCents: string): Expr => ({
        kind: "add",
        args: [
          mulInt(money(widthCents), { kind: "stepUnits", value: fact(f), unitCents: widthCents, mode: "floor" }),
          money(halfCents),
        ],
      });
      const part = (f: string, num: string, den: string, widthCents: string, halfCents: string): Expr =>
        iff(
          { kind: "cmp", op: "le", left: fact(f), right: money("0") },
          money("0"),
          rd({ kind: "mulRate", base: midRow(f, widthCents, halfCents), rate: { num, den }, round: "half-up" }),
        );
      // rent tables: $100-wide rows; homeowner's property-tax table: $25-wide
      // rows ($1-$25 -> $2 ... $2,475-$2,500 -> $299; $2,500 or more -> $300)
      const propertyPart: Expr = iff(
        { kind: "cmp", op: "le", left: fact("wiPropertyTaxesPaid"), right: money("0") },
        money("0"),
        iff(
          { kind: "cmp", op: "ge", left: fact("wiPropertyTaxesPaid"), right: money("250000") },
          money("30000"),
          part("wiPropertyTaxesPaid", "12", "100", "2500", "1250"),
        ),
      );
      const total: Expr = {
        kind: "add",
        args: [
          part("wiRentHeatIncluded", "24", "1000", "10000", "5000"),
          part("wiRentHeatNotIncluded", "30", "1000", "10000", "5000"),
          propertyPart,
        ],
      };
      const cap: Expr = iff(isStatus("mfs"), money("15000"), money("30000"));
      return { kind: "min", args: [total, cap] };
    })(),
  },
  {
    id: "us.wi.retirement_subtraction_67",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin retirement income subtraction (67+) — up to $24,000/$48,000, NEW under 2025 Act 15, FORFEITS all Form 1 credits (Schedule SB line 16)",
    citation: {
      source:
        "Wis. Stat. § 71.05(6)(b) as created by 2025 Act 15; 2025 Schedule SB instructions, Line 16 'Retirement Income Subtraction (Credits Restricted)'",
      section: "2025 Act 15; Schedule SB line 16",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-ScheduleSB-Inst.pdf",
      excerpt:
        "NEW for TY2025 (2025 Act 15, signed July 3, 2025, retroactive to January 1, 2025). SB line 16 instructions (verbatim): a filer (or spouse on a joint return) 'at least 67 years old as of December 31, 2025' may subtract federally taxable retirement income from a qualified retirement plan or IRA 'that has not been removed from Wisconsin income on lines 12 through 15' (military/uniformed-services, state/local, federal, and railroad retirement are ALREADY fully subtracted on those lines — no double count). CAP: $24,000 per individual; 'a married couple who file a joint return and are BOTH at least 67 years old... may subtract up to $48,000... regardless of how much retirement income each spouse received' (one-spouse-67 joint returns: $24,000 of the 67+ spouse's income). THE PRICE (verbatim caution): 'if you claim this subtraction, you may not claim ANY tax credit on Schedule CR and on lines 13 through 20 and 30 through 35 of the Form 1' — that forfeits the itemized deduction credit, WI-2441 child care credit, school property tax credit, married couple credit, other-state credit, the EIC, homestead credit, farmland, and veterans credits, INCLUDING carryforwards in AND out ('completely foregoing any credit... including any amount... carried forward to a future year, and being unable to utilize any credit carried forward from a prior year'). Claim it only when the subtraction's tax saving beats every forfeited credit — compute both ways. Distinct from the OLD $5,000 subtraction (SB line 17: 65+, federal AGI under $15,000/$30,000, worksheet-limited — income-restricted, NOT credit-restricted; the two interact through the line-17 worksheet's nontaxable-benefits offset). [Inputs: wiRetirementIncome67 = the eligible qualified-plan/IRA income of the 67+ individual(s); wiBothSpouses67 (joint returns).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      capIndividual: { value: "2400000", type: "money" }, // $24,000
      capJointBoth67: { value: "4800000", type: "money" }, // $48,000
    },
    formula: {
      kind: "min",
      args: [
        { kind: "max0", arg: fact("wiRetirementIncome67") },
        iff(
          { kind: "and", args: [isStatus("mfj"), fact("wiBothSpouses67")] },
          money("4800000"),
          money("2400000"),
        ),
      ],
    },
  },
  {
    id: "us.wi.parameters",
    version: 1,
    jurisdiction: "us.wi",
    title:
      "Wisconsin 2025 return parameters — exemptions, IRC conformity, capital-gain exclusion, subtractions, credits, and composition conventions (Form 1)",
    citation: {
      source:
        "2025 Form 1 + 46-page instructions; 2025 Schedules SB/AD/I/WD/CS/PS and the SB instructions; Wis. Stat. ch. 71 as amended by 2025 Act 15",
      section: "Form 1; Schedules SB, AD, I, WD; Instructions pp.3-34",
      url: "https://www.revenue.wi.gov/TaxForms2025/2025-Form1-inst.pdf",
      excerpt:
        "IRC CONFORMITY (Instruction p.13/Schedule I, load-bearing for 2025): Wisconsin conforms to the IRC 'as amended to December 31, 2022, with certain exceptions' — federal changes enacted AFTER 12/31/2022 (including the 2025 OBBBA) do NOT apply unless specifically adopted; Schedule I (Form 1 line 2) converts the federal AGI to Wisconsin's IRC (additions: principal-residence debt discharge, federal bonus/§ 179 differences, federal-vs-Wisconsin capital/ordinary gain-loss swaps, certain student loan forgiveness) — agent-composed per its instructions, and a filer with Part I adjustments must ALSO recompute EIC-relevant amounts (Schedule I Part III). EXEMPTIONS (Form 1 line 10, printed): $700 × exemptions (self unless claimable as a dependent, spouse on joint returns unless claimable, plus each dependent) + $250 × each 65-or-older box (taxpayer/spouse only). CAPITAL GAINS (Schedule SB line 5 via Schedule WD): Wisconsin excludes 30% of NET LONG-TERM capital gain (60% for farm assets); simple mutual-fund/REIT capital gain distributions may take the 30% directly without Schedule WD; capital LOSS deduction limit is $3,000 ($1,500 MFS) for TY2023+ (2021 legislation conformed it to federal — verify the act citation against the Schedule WD instructions; the famous old $500 Wisconsin limit is DEAD, and pre-2023 carryovers flow through Schedule WD). SOCIAL SECURITY: 100% subtracted (SB line 4 = the federally taxable line 6b amount — Wisconsin never taxes it). Other SB subtractions (transcribed, per-line): state tax refund, U.S. government interest, UNEMPLOYMENT compensation (Wisconsin's OWN base computation per the SB worksheet — not automatically the federal amount), medical care insurance (100%, exclusions listed), long-term care insurance, TUITION up to $7,649 per student (RAISED for 2025, income phase-out), private school tuition (Schedule PS), Edvest/Tomorrow's Scholar 529 up to $5,130 per beneficiary ($2,560 MFS — 2025 amounts), military/uniformed-services + state/local + federal + railroad retirement (100%, SB lines 12-15), the NEW 67+ retirement subtraction (us.wi.retirement_subtraction_67 — CREDITS FORFEITED), the OLD $5,000 retirement subtraction (SB 17: 65+, federal AGI under $15,000/$30,000-joint incl. MFS-combined, worksheet net of lines 12-16), armed-forces active duty pay, ADOPTION expenses up to $15,000 per child (RAISED, Act 15), ABLE contributions, disability income exclusion (Schedule 2440W), WI NOL, Native American income, organ donation (page 2 lines). STANDARD DEDUCTION → us.wi.standard_deduction (sliding, table convention); DEPENDENT filers: smaller of the table amount or max($1,350, earned + $450) (printed worksheet). CREDIT STACK (lines 13-20, nonrefundable against line 12, all FORFEITED by the SB-16 subtraction): itemized deduction credit (Schedule 1: 5% × the excess of [federal Schedule A medical + interest (excluding out-of-state second homes/boat residences/US-security carrying interest) + charity + casualty] over the line 8 standard deduction); WI-2441 additional child & dependent care credit (Wisconsin's own recomputation — transcribe Schedule WI-2441 line 14); blind worker transportation 50% of expenses; school property tax credit (us.wi.school_property_tax_credit, $300 cap — $150 for MFS and for the 'Head of household, married' checkbox; NOT claimable alongside the line 34 veterans credit); WORKING FAMILIES credit line 17 (2025 instructions verbatim: 'Do not enter any amount on this line. No credit is allowable' — a dead line); married couple credit (us.wi.married_couple_credit, max $480); Schedule CR credits; net tax paid to another state (Schedule OS). LINE 22 net tax floors at $0. LINE 23 sales/use tax on out-of-state purchases (self-computed, county rates; certification checkbox when zero). LINE 25: penalties on IRAs/retirement plans/MSAs = 33% of the federal penalty ('× .33', printed). REFUNDABLE: EIC (us.wi.eic — 4/11/34%), homestead credit (Schedule H circuit breaker — household income limits, transcribed; NOT claimable with the veterans credit), farmland preservation (FC/FC-A; same veterans-credit exclusion), eligible veterans and surviving spouses property tax credit, Schedule CR refundables, repayment credit. FILING THRESHOLDS (2025 printed): single under 65 $14,260 (65+ $14,510); MFJ $26,510/$26,760-one-65/$27,010-both; MFS $12,630. Interest on underpayment computed via Schedule U (line 44). WISCONSIN HAS NO LOCAL INCOME TAXES and no county income tax. Part-year/nonresidents: Form 1NPR (not composed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      exemptionPerPerson: { value: "70000", type: "money" }, // $700
      exemptionAge65: { value: "25000", type: "money" }, // $250
      capitalGainExclusionPct: { value: "30", type: "int" }, // 60% farm assets
      capitalLossLimit: { value: "300000", type: "money" }, // $3,000 ($1,500 MFS), TY2023+
      tuitionSubtractionMax: { value: "764900", type: "money" }, // $7,649/student (2025)
      edvestPerBeneficiary: { value: "513000", type: "money" }, // $5,130 ($2,560 MFS)
      adoptionMax: { value: "1500000", type: "money" }, // $15,000 (Act 15)
      retirement5kFagiLimitSingle: { value: "1500000", type: "money" }, // $15,000
      retirement5kFagiLimitJoint: { value: "3000000", type: "money" }, // $30,000
      iraPenaltyRatePct: { value: "33", type: "int" }, // line 25
      blindWorkerCreditPct: { value: "50", type: "int" }, // line 15
      itemizedCreditPct: { value: "5", type: "int" }, // Schedule 1
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Wisconsin composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.wi.income_tax, us.wi.standard_deduction, us.wi.eic, us.wi.married_couple_credit, us.wi.school_property_tax_credit, us.wi.retirement_subtraction_67",
    },
  },
];
