import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Maryland deep pack — TY2025 (all amounts re-verified from the 2025 Form 502,
 * the 2025 Resident Booklet (marylandcomptroller.gov), Form 502CG, and
 * Md. Code, Tax-Gen. as amended by the Budget Reconciliation and Financing
 * Act of 2025 (H.B. 352, Ch. 604) — which added the 6.25%/6.5% brackets, the
 * 2% capital-gains surtax, the flat standard deduction, the itemized-deduction
 * phase-out, and the CTC phase-out formula, all effective TY2025).
 */

const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const stepCeil = (value: Expr, unitCents: string): Expr => ({ kind: "stepUnits", value, unitCents, mode: "ceil" });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });

// ---- rate schedules (2025 booklet p.14, "MARYLAND TAX COMPUTATION WORKSHEET
// SCHEDULES", verbatim printed anchors — continuity verified to the cent) ----
type Row = { thresholdCents: string; fixedCents: string; rate: { num: string; den: string } };
const SCHEDULE_I: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "2", den: "100" } },
  { thresholdCents: "100000", fixedCents: "2000", rate: { num: "3", den: "100" } },
  { thresholdCents: "200000", fixedCents: "5000", rate: { num: "4", den: "100" } },
  { thresholdCents: "300000", fixedCents: "9000", rate: { num: "475", den: "10000" } },
  { thresholdCents: "10000000", fixedCents: "469750", rate: { num: "5", den: "100" } },
  { thresholdCents: "12500000", fixedCents: "594750", rate: { num: "525", den: "10000" } },
  { thresholdCents: "15000000", fixedCents: "726000", rate: { num: "55", den: "1000" } },
  { thresholdCents: "25000000", fixedCents: "1276000", rate: { num: "575", den: "10000" } },
  { thresholdCents: "50000000", fixedCents: "2713500", rate: { num: "625", den: "10000" } },
  { thresholdCents: "100000000", fixedCents: "5838500", rate: { num: "65", den: "1000" } },
];
const SCHEDULE_II: Row[] = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "2", den: "100" } },
  { thresholdCents: "100000", fixedCents: "2000", rate: { num: "3", den: "100" } },
  { thresholdCents: "200000", fixedCents: "5000", rate: { num: "4", den: "100" } },
  { thresholdCents: "300000", fixedCents: "9000", rate: { num: "475", den: "10000" } },
  { thresholdCents: "15000000", fixedCents: "707250", rate: { num: "5", den: "100" } },
  { thresholdCents: "17500000", fixedCents: "832250", rate: { num: "525", den: "10000" } },
  { thresholdCents: "22500000", fixedCents: "1094750", rate: { num: "55", den: "1000" } },
  { thresholdCents: "30000000", fixedCents: "1507250", rate: { num: "575", den: "10000" } },
  { thresholdCents: "60000000", fixedCents: "3232250", rate: { num: "625", den: "10000" } },
  { thresholdCents: "120000000", fixedCents: "6982250", rate: { num: "65", den: "1000" } },
];

/** $50-row midpoint: floor(base/50)*50 + 25 (in cents). */
const rowMidpoint = (base: Expr): Expr => ({
  kind: "add",
  args: [
    mulInt(money("5000"), { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" }),
    money("2500"),
  ],
});

/**
 * The printed-table method: evaluate `sched` at the row midpoint. Rows are
 * $25-wide from $50-$100 and $50-wide above $100 (both the state and the
 * Anne Arundel tables share this row structure).
 */
const tableAtMidpoint = (base: Expr, sched: (b: Expr) => Expr, sub50: Expr): Expr =>
  iff(
    lt(base, money("5000")),
    sub50,
    iff(
      lt(base, money("7500")),
      sched(money("6250")),
      iff(lt(base, money("10000")), sched(money("8750")), sched(rowMidpoint(base))),
    ),
  );

const isOneOf = (values: string[]): Expr => ({
  kind: "or",
  args: values.map((v) => ({
    kind: "cmp",
    op: "eq",
    left: fact("filingStatus"),
    right: { kind: "enum", value: v },
  })),
});

export const mdRules: Rule[] = [
  {
    id: "us.md.income_tax",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland state income tax — 2025 Schedules I/II with the new H.B. 352 6.25%/6.5% brackets and the Maryland Tax Table convention (Form 502 line 21)",
    citation: {
      source:
        "Md. Code, Tax-Gen. § 10-105(a) as amended by the Budget Reconciliation and Financing Act of 2025 (H.B. 352, Ch. 604); 2025 Maryland Resident Booklet, Instruction 17 + Maryland Tax Computation Worksheet Schedules (17A) + 2025 Maryland Tax Table",
      section: "Tax-Gen. § 10-105(a); Form 502 line 21; Instruction 17",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "2025 rate schedules (booklet p.14, verbatim printed anchors — arithmetic continuity verified to the cent, unlike Ohio's discontinuous anchors). TAX RATE SCHEDULE I (Single, Married Filing Separately, Dependent taxpayers; also fiduciaries): $1–$1,000 → 2.00% of taxable net income; $1,001–$2,000 → $20.00 + 3.00% of excess over $1,000; $2,001–$3,000 → $50.00 + 4.00% over $2,000; $3,001–$100,000 → $90.00 + 4.75% over $3,000; $100,001–$125,000 → $4,697.50 + 5.00% over $100,000; $125,001–$150,000 → $5,947.50 + 5.25% over $125,000; $150,001–$250,000 → $7,260.00 + 5.50% over $150,000; $250,001–$500,000 → $12,760.00 + 5.75% over $250,000; $500,001–$1,000,000 → $27,135.00 + 6.25% over $500,000 (NEW, H.B. 352); $1,000,001+ → $58,385.00 + 6.50% over $1,000,000 (NEW, H.B. 352). TAX RATE SCHEDULE II (Married Filing Jointly, Head of Household, Qualifying Surviving Spouse — note MD puts HOH on the JOINT schedule, unlike federal): same four rows to $3,000, then $3,001–$150,000 → $90.00 + 4.75% over $3,000; $150,001–$175,000 → $7,072.50 + 5.00%; $175,001–$225,000 → $8,322.50 + 5.25%; $225,001–$300,000 → $10,947.50 + 5.50%; $300,001–$600,000 → $15,072.50 + 5.75%; $600,001–$1,200,000 → $32,322.50 + 6.25% (NEW); $1,200,001+ → $69,822.50 + 6.50% (NEW). METHOD (Instruction 17, verbatim): 'You must use the tax tables if your taxable income is less than $100,000' — the schedules 'are shown so you can see the tax rate… however, do not use them to figure your tax' below $100,000. TABLE CONVENTION (decoded from the printed 2025 Maryland Tax Table and verified against 8 printed rows): a special first row $0–$50 → $0; $25-wide rows $50–$75 (→$1) and $75–$100 (→$2); $50-wide rows from $100 up, each row = the schedule evaluated at the ROW MIDPOINT, rounded half-up ($150–$200 → 2%×$175 = $3.50 → $4; $3,150–$3,200 → $90 + 4.75%×$175 = $98.31 → $98; $6,000–$6,050 → $233.69 → $234; last row $99,950–$100,000 → mid $99,975 → $4,696.31 → $4,696 — all printed-exact). Below $100,000 Schedules I and II are IDENTICAL (they diverge only above $100,000), which is why Maryland prints a single table for all statuses. Taxable income of exactly $100,000 or more uses the Computation Worksheet Schedules (whole-dollar, half-up). useFormulaMethod=true bypasses the table and evaluates the raw schedule at the exact income at every level. [Input: Maryland taxable net income (Form 502 line 20). Filing status routing: single/mfs (and dependent-taxpayer filers, who use Filing Status 6 and the Schedule I columns) → Schedule I; mfj/hoh/qss → Schedule II. The LOCAL tax on the same line-20 income is a separate levy → us.md.local_tax. The H.B. 352 2% net-capital-gain surtax (Form 502 line 21b) → us.md.capital_gains_surtax.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "10000000", type: "money" }, // $100,000
      newBracket625Single: { value: "50000000", type: "money" }, // $500,000
      newBracket650Single: { value: "100000000", type: "money" }, // $1,000,000
      newBracket625Joint: { value: "60000000", type: "money" }, // $600,000
      newBracket650Joint: { value: "120000000", type: "money" }, // $1,200,000
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr =>
        iff(isOneOf(["mfj", "hoh", "qss"]), printedSchedule(b, SCHEDULE_II), printedSchedule(b, SCHEDULE_I));
      return rd(
        iff(
          {
            kind: "and",
            args: [lt(base, money("10000000")), { kind: "not", arg: fact("useFormulaMethod") }],
          },
          tableAtMidpoint(base, sched, money("0")),
          sched(base),
        ),
      );
    })(),
  },
  {
    id: "us.md.local_tax",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland local income tax — 2025 county/Baltimore City rates, with the Anne Arundel bracket schedule + printed table and the Frederick whole-income tier rates (Form 502 line 28)",
    citation: {
      source:
        "Md. Code, Tax-Gen. § 10-106 (county income tax, 3.3% cap per H.B. 352); 2025 Maryland Resident Booklet, Instruction 19 '2025 LOCAL TAX RATE CHART' + Local Tax Worksheet (19A) + 2025 Anne Arundel County Tax Table and Worksheet Schedules (19D)",
      section: "Tax-Gen. § 10-106; Form 502 line 28; Instruction 19",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "Local tax = a county-set rate on MARYLAND TAXABLE NET INCOME (Form 502 line 20 — the same base as the state tax; the taxing county is where the filer resided on the LAST DAY of the tax year, from the Form 502 political-subdivision box). 2025 LOCAL TAX RATE CHART (booklet Instruction 19, verbatim): Baltimore City .0320; Allegany .0303; Anne Arundel (bracketed, below); Baltimore County .0320; Calvert .0320; Caroline .0320; Carroll .0303; Cecil .0274; Charles .0303; Dorchester .0330 (the first county at the NEW H.B. 352 3.3% cap); Frederick (tiered, below); Garrett .0265; Harford .0306; Howard .0320; Kent .0320; Montgomery .0320; Prince George's .0320; Queen Anne's .0320; St. Mary's .0320; Somerset .0320; Talbot .0240; Washington .0295; Wicomico .0320; Worcester .0225; NONRESIDENTS .0225 (the special nonresident rate, Tax-Gen. § 10-106.1). ANNE ARUNDEL (a true MARGINAL bracket schedule): single/MFS/dependent — 2.7% to $50,000; $1,350 + 2.94% of excess over $50,000 to $400,000; $11,640 + 3.2% over $400,000; MFJ/HOH/QSS — 2.7% to $75,000; $2,025 + 2.94% over $75,000 to $480,000; $13,932.00 + 3.2% over $480,000. Below $100,000 Anne Arundel residents use the printed 2025 ANNE ARUNDEL COUNTY TAX TABLE — same row structure as the state table ($25-wide rows $50–$100, $50-wide above), each row = the AA schedule at the row midpoint rounded half-up, and NO zero first row: the printed $0–$50 row charges $1 (2.7% × $25 = $0.68 → $1) — verified against 8 printed rows incl. the odd last row $99,950–$99,999 (single $2,819 / joint $2,759, midpoint-exact); this rule keeps the printed $1 row but returns $0 for exactly $0 taxable income; $100,000+ uses Worksheet Schedules (19D); useFormulaMethod=true uses the raw AA schedule everywhere. FREDERICK (NOT marginal — a single tier rate applied to the WHOLE income, producing enacted CLIFFS at each tier boundary): single/MFS/dependent — .0225 for TNI $1–$25,000; .0275 for $25,001–$50,000; .0296 for $50,001–$150,000; .0320 for $150,001+; MFJ/HOH/QSS — .0225 to $25,000; .0275 for $25,001–$100,000; .0296 for $100,001–$250,000; .0320 for $250,001+ (verbatim '.0275 for taxpayers who have a taxable net income of at least $25,001 and not exceeding $50,000' — a rate FOR the taxpayer, not a bracket; $25,000 → $562.50 but $25,001 → $687.53, a real $125 cliff). SPOUSES IN DIFFERENT SUBDIVISIONS: file separate MD returns, or apportion per the Instruction 19 special note (not modeled — disclose). LOCAL CREDITS (composed on Form 502, not here): local EIC (line 29) = federal EIC × (local rate × 10) — e.g. .0320 → 32% of the federal EIC, Anne Arundel residents use .0270 as the base rate; local poverty level credit (line 30) = the state 18B worksheet's earned income × the local rate (AA: .0270); Form 502CR Part BB local credits on line 31. [Input: stateTaxableIncome = Form 502 line 20; mdSubdivision = the taxing county enum (nonresident for the § 10-106.1 rate).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      localEicMultiplier: { value: "10", type: "int" },
      anneArundelCreditRatePctTimes100: { value: "270", type: "int" }, // .0270 base for local EIC/PLC
      nonresidentRatePctTimes100: { value: "225", type: "int" },
      localRateCapPctTimes100: { value: "330", type: "int" }, // 3.3% H.B. 352 cap
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const flat = (num: string): Expr => rd({ kind: "mulRate", base, rate: { num, den: "10000" }, round: "half-up" });
      const AA_SINGLE: Row[] = [
        { thresholdCents: "0", fixedCents: "0", rate: { num: "27", den: "1000" } },
        { thresholdCents: "5000000", fixedCents: "135000", rate: { num: "294", den: "10000" } },
        { thresholdCents: "40000000", fixedCents: "1164000", rate: { num: "32", den: "1000" } },
      ];
      const AA_JOINT: Row[] = [
        { thresholdCents: "0", fixedCents: "0", rate: { num: "27", den: "1000" } },
        { thresholdCents: "7500000", fixedCents: "202500", rate: { num: "294", den: "10000" } },
        { thresholdCents: "48000000", fixedCents: "1393200", rate: { num: "32", den: "1000" } },
      ];
      const aaSched = (b: Expr): Expr =>
        iff(isOneOf(["mfj", "hoh", "qss"]), printedSchedule(b, AA_JOINT), printedSchedule(b, AA_SINGLE));
      const anneArundel: Expr = rd(
        iff(
          { kind: "cmp", op: "eq", left: base, right: money("0") },
          money("0"),
          iff(
            {
              kind: "and",
              args: [lt(base, money("10000000")), { kind: "not", arg: fact("useFormulaMethod") }],
            },
            // printed AA table has NO zero row: $0-$50 -> $1 (schedule at mid $25)
            tableAtMidpoint(base, aaSched, aaSched(money("2500"))),
            aaSched(base),
          ),
        ),
      );
      const fredRate = (tiers: { upToCents: string; num: string }[], topNum: string): Expr => {
        let expr: Expr = { kind: "mulRate", base, rate: { num: topNum, den: "10000" }, round: "half-up" };
        for (let i = tiers.length - 1; i >= 0; i--) {
          expr = iff(le(base, money(tiers[i].upToCents)), { kind: "mulRate", base, rate: { num: tiers[i].num, den: "10000" }, round: "half-up" }, expr);
        }
        return rd(expr);
      };
      const frederick: Expr = iff(
        isOneOf(["mfj", "hoh", "qss"]),
        fredRate(
          [
            { upToCents: "2500000", num: "225" },
            { upToCents: "10000000", num: "275" },
            { upToCents: "25000000", num: "296" },
          ],
          "320",
        ),
        fredRate(
          [
            { upToCents: "2500000", num: "225" },
            { upToCents: "5000000", num: "275" },
            { upToCents: "15000000", num: "296" },
          ],
          "320",
        ),
      );
      return {
        kind: "match",
        on: fact("mdSubdivision"),
        cases: [
          { when: "baltimore_city", value: flat("320") },
          { when: "allegany", value: flat("303") },
          { when: "anne_arundel", value: anneArundel },
          { when: "baltimore_county", value: flat("320") },
          { when: "calvert", value: flat("320") },
          { when: "caroline", value: flat("320") },
          { when: "carroll", value: flat("303") },
          { when: "cecil", value: flat("274") },
          { when: "charles", value: flat("303") },
          { when: "dorchester", value: flat("330") },
          { when: "frederick", value: frederick },
          { when: "garrett", value: flat("265") },
          { when: "harford", value: flat("306") },
          { when: "howard", value: flat("320") },
          { when: "kent", value: flat("320") },
          { when: "montgomery", value: flat("320") },
          { when: "prince_georges", value: flat("320") },
          { when: "queen_annes", value: flat("320") },
          { when: "st_marys", value: flat("320") },
          { when: "somerset", value: flat("320") },
          { when: "talbot", value: flat("240") },
          { when: "washington", value: flat("295") },
          { when: "wicomico", value: flat("320") },
          { when: "worcester", value: flat("225") },
          { when: "nonresident", value: flat("225") },
        ],
      };
    })(),
  },
  {
    id: "us.md.exemption_amount",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland personal/dependent exemption — $3,200 each, phased by federal AGI (Exemption Amount Chart 10A, Form 502 line 19)",
    citation: {
      source:
        "Md. Code, Tax-Gen. §§ 10-211, 10-212; 2025 Maryland Resident Booklet, Instruction 10 'EXEMPTION AMOUNT CHART (10A)'",
      section: "Tax-Gen. § 10-211; Form 502 Exemptions area A/C; Instruction 10",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "Chart 10A (2025 booklet, verbatim): the personal exemption is $3,200 per exemption (self + spouse + each dependent), reduced by FEDERAL adjusted gross income: Single or MFS — FAGI $100,000 or less → $3,200; over $100,000–$125,000 → $1,600; over $125,000–$150,000 → $800; in excess of $150,000 → $0. Joint, Head of Household, or Qualifying Surviving Spouse — $150,000 or less → $3,200; $150,000–$175,000 → $1,600; $175,000–$200,000 → $800; in excess of $200,000 → $0. DEPENDENT TAXPAYER (Filing Status 6, claimable on another return): EVERY exemption is $0 ('Enter 0 in Exemption Box (A)'). The reduction applies to dependency exemptions too, but NOT to the separate age-65+/blind exemption of $1,000 per checked box (Form 502 area B — add boxes × $1,000 to this rule's output when composing line 19; the $1,000 boxes are NEVER phased and are allowed even for dependent taxpayers per the printed form's unconditional 'X $1,000'). U.S.-obligation interest filers: see the code-hh exemption adjustment (Instruction 13) — not modeled, disclose. [Inputs: mdFagi (Form 502 line 1), mdExemptionCount (areas A + C count), filingStatus, mdDependentTaxpayer (Filing Status 6). Output: count × per-exemption amount, before the area-B $1,000 boxes.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "320000", type: "money" }, // $3,200
      ageBlindBox: { value: "100000", type: "money" }, // $1,000 (area B, unphased)
    },
    formula: (() => {
      const fagi = fact("mdFagi");
      const chart = (t1: string, t2: string, t3: string): Expr =>
        iff(
          le(fagi, money(t1)),
          money("320000"),
          iff(le(fagi, money(t2)), money("160000"), iff(le(fagi, money(t3)), money("80000"), money("0"))),
        );
      const per = iff(
        fact("mdDependentTaxpayer"),
        money("0"),
        iff(
          isOneOf(["mfj", "hoh", "qss"]),
          chart("15000000", "17500000", "20000000"),
          chart("10000000", "12500000", "15000000"),
        ),
      );
      return mulInt(per, fact("mdExemptionCount"));
    })(),
  },
  {
    id: "us.md.ctc",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland Child Tax Credit — $500 per qualified child, H.B. 352 phase-out of $50 per $1,000 of FAGI over $15,000, gone above $24,000 (Form 502CR Part CC line 8, refundable)",
    citation: {
      source:
        "Md. Code, Tax-Gen. § 10-751 as amended by H.B. 352 (Ch. 604, 2025); 2025 Maryland Resident Booklet, Instruction 21 item 8 + REFUNDABLE CHILD TAX CREDIT WORKSHEET (21C)",
      section: "Tax-Gen. § 10-751; Form 502CR Part CC line 8; Worksheet 21C",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "Worksheet 21C (2025 booklet, verbatim structure — the H.B. 352 phase-out is NEW for 2025, replacing the old $15,000 cliff): FAGI $15,000 or less → $500 × number of qualified children on Form 502B; FAGI $15,001–$24,000 → reduced credit PER CHILD = $500 − $50 × (the excess over $15,000 divided by $1,000, ROUNDED UP to the next whole number — 'e.g., 1.1 rounds to 2'), × the number of qualified children, not less than $0; FAGI '$24,001 or greater — STOP. YOU ARE NOT ELIGIBLE' (at $24,000 exactly the per-child credit is $500 − $50 × 9 = $50). QUALIFIED CHILD: a DEPENDENT under age 6 at year end, OR a dependent over 5 and under 17 with a disability (the booklet's enumerated determination list; assessment copy attached to Form 502CR). RESIDENTS only; REFUNDABLE — enters Form 502CR Part CC line 8 and flows into Form 502 line 45. No limit on the number of qualifying children. [Inputs: mdFagi (Form 502 line 1), mdQualifiedChildren.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perChild: { value: "50000", type: "money" }, // $500
      threshold: { value: "1500000", type: "money" }, // $15,000
      stepReduction: { value: "5000", type: "money" }, // $50 per $1,000 or fraction
      eligibilityCap: { value: "2400000", type: "money" }, // $24,000
    },
    formula: (() => {
      const fagi = fact("mdFagi");
      const kids = fact("mdQualifiedChildren");
      const reducedPerChild: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: money("50000"),
          right: mulInt(money("5000"), stepCeil({ kind: "sub", left: fagi, right: money("1500000") }, "100000")),
        },
      };
      return iff(
        { kind: "cmp", op: "gt", left: fagi, right: money("2400000") },
        money("0"),
        iff(le(fagi, money("1500000")), mulInt(money("50000"), kids), mulInt(reducedPerChild, kids)),
      );
    })(),
  },
  {
    id: "us.md.poverty_level_credit",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland State Poverty Level Credit — 5% of earned income when both earned income and FAGI-plus-additions fall below the poverty guideline (Form 502 line 23)",
    citation: {
      source:
        "Md. Code, Tax-Gen. § 10-709; 2025 Maryland Resident Booklet, Instruction 18, STATE POVERTY LEVEL CREDIT WORKSHEET (18B) + POVERTY INCOME GUIDELINES",
      section: "Tax-Gen. § 10-709; Form 502 line 23; Worksheet 18B",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "Worksheet 18B (2025, verbatim): line 1 = Form 502 line 7 (FAGI + Maryland additions; MFS filers who filed a joint federal return use the JOINT federal AGI + additions); line 2 = earned income (salary, wages, tips, other employee compensation + net SE profit — do NOT net a farm or business loss); line 3 = the poverty guideline for the number of persons on the federal return; line 4 = the LARGER of lines 1 and 2 — if line 4 ≥ line 3, no credit; otherwise credit = 5% × line 2 (earned income). 2025 POVERTY INCOME GUIDELINES (printed chart, verbatim): 1 → $15,650; 2 → $21,150; 3 → $26,650; 4 → $32,150; 5 → $37,650; 6 → $43,150; 7 → $48,650; 8 → $54,150; 'For families/households with more than 8 persons, add $5,500' each — i.e. guideline = $15,650 + $5,500 × (persons − 1), exact for every printed row. NONREFUNDABLE; NOT available to Filing Status 6 (dependent taxpayer) filers. The companion LOCAL poverty level credit (Form 502 line 30, Worksheet 19C) = the same line-2 earned income × the LOCAL tax rate (Anne Arundel uses .0270) — composed on the return, not here. [Inputs: mdEarnedIncome (Form 502 line 1b), mdFagiPlusAdditions (line 7), mdHouseholdSize, mdDependentTaxpayer.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      guidelineBase: { value: "1565000", type: "money" }, // $15,650 (1 person)
      guidelinePerAdditionalPerson: { value: "550000", type: "money" }, // $5,500
      creditPct: { value: "5", type: "int" },
    },
    formula: (() => {
      const guideline: Expr = {
        kind: "add",
        args: [
          money("1565000"),
          mulInt(money("550000"), { kind: "sub", left: fact("mdHouseholdSize"), right: { kind: "int", value: "1" } }),
        ],
      };
      const larger: Expr = { kind: "max", args: [fact("mdEarnedIncome"), fact("mdFagiPlusAdditions")] };
      return iff(
        fact("mdDependentTaxpayer"),
        money("0"),
        iff(
          { kind: "cmp", op: "ge", left: larger, right: guideline },
          money("0"),
          rd({ kind: "mulRate", base: fact("mdEarnedIncome"), rate: { num: "5", den: "100" }, round: "half-up" }),
        ),
      );
    })(),
  },
  {
    id: "us.md.capital_gains_surtax",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland 2% additional tax on net capital gain income — H.B. 352/Ch. 604 (Form 502 line 21b, via Form 502CG)",
    citation: {
      source:
        "Ch. 604 of the Acts of 2025 (H.B. 352, Budget Reconciliation and Financing Act); 2025 Form 502CG and instructions; Form 502 lines 20a/21b",
      section: "Form 502CG; Form 502 lines 20a, 21b",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2025/502cg.pdf",
      excerpt:
        "NEW for TY2025 (Ch. 604, verbatim: 'imposes a 2% tax on certain capital gain income for individuals with a federal adjusted gross income of more than $350,000'). Applies ONLY when Form 502 line 1 FAGI EXCEEDS $350,000 and line 1c reports capital gain income — a filer at or below $350,000 owes $0 and does not file 502CG. Form 502CG mechanics: line 1 = net capital gain income included in Maryland AGI (Form 502 line 1c; ≤ $0 → line 9 = $0); lines 2–7 EXEMPT CLASSES subtracted (verbatim): (2) gain from sale/exchange of the PRIMARY RESIDENCE on federal Form 8949/6252 — but NOT a sale totaling $1,500,000 or more; (3) gain on assets held in a TAX-ADVANTAGED RETIREMENT SAVINGS PLAN; (4) gain from cattle, horses, or breeding livestock (Form 4797); (5) gain from land under a conservation/agricultural/forest preservation easement (Form 8949); (6) gain from property used in a TRADE OR BUSINESS (Forms 4797/8824/6252); (7) gain from affordable housing owned by a nonprofit; line 8 = sum of 2–7; line 9 = line 1 − line 8 (floor $0) → Form 502 line 20a; Form 502 line 21b = line 20a × .02. The surtax joins lines 21 + 21a AGAINST which the nonrefundable credits (line 26) apply, and it counts inside the 'Maryland tax' used by the EIC/refundable-EIC worksheets (18A/18A.1/21A: 'the sum of Lines 21 through 21b'). [Input: mdNetCapitalGainSubject = the agent-completed 502CG line 9 — the FAGI > $350,000 gate and the exempt-class subtractions are 502CG transcription, disclosed per class.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      fagiGate: { value: "35000000", type: "money" }, // $350,000 (502CG filing gate)
      ratePct: { value: "2", type: "int" },
      primaryResidenceSaleCap: { value: "150000000", type: "money" }, // $1,500,000
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "max0", arg: fact("mdNetCapitalGainSubject") },
      rate: { num: "2", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.md.pension_exclusion",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland pension exclusion — up to $41,200 (2025) per qualifying person, reduced by TOTAL Social Security/Railroad Retirement benefits (Worksheet 13A, Form 502 line 10a)",
    citation: {
      source:
        "Md. Code, Tax-Gen. § 10-209; 2025 Maryland Resident Booklet, Instruction 13 line 10a + PENSION EXCLUSION COMPUTATION WORKSHEET (13A)",
      section: "Tax-Gen. § 10-209; Form 502 line 10a; Worksheet 13A",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "Worksheet 13A (2025, verbatim): line 1 = qualifying pension/retirement annuity included in FAGI (do NOT include Social Security or Railroad Retirement); line 2 = maximum allowable exclusion $41,200 (2025, Comptroller-indexed annually); line 3 = TOTAL Social Security and/or Railroad Retirement benefits (Tier I AND Tier II, WHETHER OR NOT federally taxable — the gross benefit, not the § 86 taxable amount); line 4 = tentative exclusion = line 2 − line 3, floor $0 ('If your total Social Security and/or Railroad Retirement income is greater than the Maximum Pension Exclusion $41,200, the pension exclusion will be zero'); line 5 = exclusion = SMALLER of line 1 or line 4. GATES (Instruction 13, line 10a, verbatim): (a) the person was 65 OR OVER or TOTALLY DISABLED (or their spouse was totally disabled) on the last day of the tax year, AND (b) the income is from an 'employee retirement system' qualified under IRC § 401(a), 403, or 457(b) — 'a traditional IRA, a Roth IRA, a rollover IRA, a simplified employee plan (SEP), a Keogh plan, an ineligible deferred compensation plan or foreign retirement income does NOT qualify.' PER PERSON: each qualifying spouse computes a SEPARATE column with their OWN pension and their OWN SS/RR benefits; the columns' results add on Form 502 line 10a. On a joint return where both spouses receive SS/RR but only one receives a pension, line 3 counts ONLY the pension-receiving spouse's benefits. The separate Retired Forest/Park/Wildlife Ranger exclusion (Worksheet 13E, Form 502 line 10b, up to $15,000 under age 55) is NOT modeled — transcribe and disclose. [Inputs (one person per evaluation): mdQualifyingPension, mdSsRrBenefits — the age-65+/disability and qualified-plan gates are attestations the caller must apply before invoking.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxExclusion: { value: "4120000", type: "money" }, // $41,200 (2025)
    },
    formula: {
      kind: "min",
      args: [
        { kind: "max0", arg: fact("mdQualifyingPension") },
        { kind: "max0", arg: { kind: "sub", left: money("4120000"), right: fact("mdSsRrBenefits") } },
      ],
    },
  },
  {
    id: "us.md.parameters",
    version: 1,
    jurisdiction: "us.md",
    title:
      "Maryland 2025 return parameters — standard deduction, itemized phase-out, EIC percentages, subtractions, credits, and composition conventions (Form 502)",
    citation: {
      source:
        "2025 Maryland Resident Booklet (Instructions 1-29); 2025 Forms 502, 502B, 502SU, 502CR, 502CG, 502R; Md. Code, Tax-Gen. Title 10 as amended by H.B. 352 (Ch. 604, 2025)",
      section: "Form 502; Instructions 13, 14, 16, 18, 19, 21",
      url: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/2025/resident-booklet.pdf",
      excerpt:
        "STANDARD DEDUCTION (Instruction 16, verbatim — H.B. 352 made it FLAT for 2025, replacing the old 15%-of-income min/max worksheet): $3,350 single/dependent/MFS; $6,700 MFJ/HOH/QSS. ITEMIZED (Instructions 14/16): allowed ONLY if itemized federally, but NOT required ('figure your tax each way') — line 17 = federal Schedule A line 17 (17a) MINUS state and local income taxes claimed in it (17b) MINUS the NEW H.B. 352 PHASE-OUT (17c, Worksheet 14A): 7.5% × the excess of FAGI over $200,000 ($100,000 MFS). RETURN CHAIN (2025 Form 502): line 1 FAGI (1a wages, 1b earned income, 1c capital gain, 1d pensions, 1e investment-income-over-$11,950 EIC gate box); ADDITIONS lines 2–5 (non-Maryland state/local bond interest, state retirement pickup, lump-sum distributions, coded others) → line 6, line 7 = 1 + 6; SUBTRACTIONS lines 8–14: 8 state/local tax refunds in line 1; 9 CHILD AND DEPENDENT CARE EXPENSES (the SMALLER of federal Form 2441 line 6 or $3,000 — $6,000 with two or more dependents; an income subtraction, distinct from the 502CR Part B CREDIT); 10a pension exclusion (us.md.pension_exclusion, per spouse); 10b Ranger exclusion; 11 TAXABLE Social Security/RR (Tier I, II and supplemental) included in line 1 — Maryland never taxes it; 12 part-year nonresidence income; 13 Form 502SU coded subtractions (code u = military retirement income, code v = public safety retirement income, code ab = income from U.S. Government obligations; per-code list incl. the NEW legislative energy relief refund); 14 TWO-INCOME MARRIED COUPLE SUBTRACTION (Worksheet 13D): min($1,200, the LESSER-income spouse's (FAGI share + additions share − subtraction share), floor $0) — joint returns only; line 15 total, line 16 MD AGI = 7 − 15; line 17 deduction; line 18 net; line 19 exemptions (us.md.exemption_amount + $1,000 × age-65/blind boxes); line 20 TAXABLE NET INCOME; line 21 state tax (us.md.income_tax); 21a 502CR Part DD recapture; 21b 2% capital-gain surtax (us.md.capital_gains_surtax); line 22 EIC; 23 poverty level credit (us.md.poverty_level_credit); 24 Form 502CR Part AA individual credits (CDCC — a percentage of the federal § 21 credit from the 2025 502CR chart, topping out at 32.00% (decimal 0.3200) and stepping DOWN by income band — not the pre-2025 32.5%; other-state credit Part A; long-term-care; student loan etc. — transcribed with disclosure); 25 business credits (Form 500CR, e-file only); 27 = 21+21a+21b−26 floor 0; LOCAL lines 28–33 (us.md.local_tax; local EIC = federal EIC × local-rate×10, AA .0270; local poverty credit = 18B earned income × local rate); line 34 = 27 + 33. EIC (Instruction 18, verbatim): married couples (joint OR separate) and anyone with a qualifying child → line 22 = 50% of the federal EIC (nonrefundable), and if 50% fully absorbs the state tax, Worksheet 21A pays the REFUNDABLE EIC on line 44 = max(0, 45% × federal EIC − the sum of lines 21–21b) — requiring entries on lines 22 AND 29; childless single/HOH/QSS filers → Worksheet 18A.1: line 22 = 100% of the federal EIC and line 44 = the excess of the federal EIC over the tax (a fully refundable 100% credit); ITIN filers and under-25 childless filers compute the federal EIC disregarding the SSN/minimum-age requirements. PAYMENTS: line 41 = Maryland STATE AND LOCAL withholding COMBINED (one line — W-2 box 17 + box 19 MD locals); 42 MW506NRS real-property withholding; 43 estimated + prior-year credit + extension payments; 44 refundable EIC; 45 refundable credits (502CR Part CC: refundable CDCC when FAGI ≤ $60,900 single/$91,400 joint — 2025 indexed; the CTC us.md.ctc on Part CC line 8; student loan debt relief; § 1341 repayment; PTE credits with Schedule K-1 add-back interplay). CONTRIBUTIONS lines 35–39 reduce the refund. INTEREST/PENALTY: Form 502UP (line 51), 10% homebuyer-account penalty (51a). REFUND/DUE thresholds: no refund and no payment due under $1.00. FILING THRESHOLDS (Instruction 1, 2025): single $15,750 ($17,750 65+); MFJ $31,500 (one 65+ $33,100, both $34,700); MFS $15,750; HOH $23,625 ($25,625 65+); QSS $31,500 ($33,100 65+) — gross-income filing floors, disclosed (not a tax-zeroing rule like VA's). SENIOR TAX CREDIT (502CR Part M, Tax-Gen. § 10-754, per the 2025 502CR instructions): a filer 65+ gets $1,000 when FAGI ≤ $100,000 (individual/MFS); MFJ, QSS, and HOH filers with FAGI ≤ $150,000 get $1,750 — REDUCED to $1,000 on a joint return where only one spouse is 65+ (transcribed via Part AA, disclosed). PART-YEAR residents prorate exemptions/deductions and use Instruction 26 factors — NOT composed (refuses/agent-composed, Form 502 line 12). Spouses in different subdivisions: separate returns preferred (Instruction 19 note). This corpus models the RESIDENT Form 502; nonresident Form 505 (special 2.25% nonresident local rate; MW506NRS) is not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingleMfsDep: { value: "335000", type: "money" }, // $3,350
      standardDeductionJointHohQss: { value: "670000", type: "money" }, // $6,700
      itemizedPhaseoutThreshold: { value: "20000000", type: "money" }, // $200,000
      itemizedPhaseoutThresholdMfs: { value: "10000000", type: "money" }, // $100,000
      itemizedPhaseoutRatePctTimes10: { value: "75", type: "int" }, // 7.5%
      eicPctWithChildOrMarried: { value: "50", type: "int" },
      eicRefundablePct: { value: "45", type: "int" },
      eicPctChildlessSingle: { value: "100", type: "int" },
      eicInvestmentIncomeGate: { value: "1195000", type: "money" }, // $11,950 (line 1e box)
      twoIncomeSubtractionMax: { value: "120000", type: "money" }, // $1,200
      refundableCdccFagiCapSingle: { value: "6090000", type: "money" }, // $60,900
      refundableCdccFagiCapJoint: { value: "9140000", type: "money" }, // $91,400
      seniorCreditIndividual: { value: "100000", type: "money" }, // $1,000 (FAGI ≤ $100,000)
      seniorCreditJointHohQss: { value: "175000", type: "money" }, // $1,750 (FAGI ≤ $150,000; $1,000 if only one joint spouse is 65+)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Maryland composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.md.income_tax, us.md.local_tax, us.md.exemption_amount, us.md.ctc, us.md.poverty_level_credit, us.md.capital_gains_surtax, us.md.pension_exclusion",
    },
  },
];
