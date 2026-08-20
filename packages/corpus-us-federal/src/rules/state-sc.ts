import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * South Carolina deep pack — TY2025 AND the enacted H.4216 TY2026 restructure
 * (all amounts re-verified from the 2025 SC1040 + 26-page instructions, the
 * SC1040TT (Revised 6/17/25), the SCDOR H.4216 information page, and
 * S.C. Code Title 12). Load-bearing dates: the TY2025 top rate is 6.0% (the
 * annual trigger cut from 6.2%); H.4216 — signed March 30, 2026 — REPLACES
 * the whole structure for TY2026 (FAGI base, new deduction, 1.99%/5.21%
 * rates); and the SCDOR granted ALL taxpayers an automatic extension for
 * 2025 returns to October 15, 2026.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const isStatus = (v: string): Expr => ({ kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: v } });

// 2025 schedule (derived from the printed SC1040TT and confirmed by the
// printed >=$100,000 constant: 6% x TI − $642, whose exact value is $641.70)
const SCHED_2025 = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "0", den: "100" } },
  { thresholdCents: "356000", fixedCents: "0", rate: { num: "3", den: "100" } },
  { thresholdCents: "1783000", fixedCents: "42810", rate: { num: "6", den: "100" } },
];

export const scRules: Rule[] = [
  {
    id: "us.sc.income_tax",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina income tax — TY2025: 0% / 3% / 6.0% (trigger-reduced top rate) with the SC1040TT table convention (SC1040 line 6)",
    citation: {
      source:
        "S.C. Code § 12-6-510 and § 12-6-545 trigger reductions (6.2% → 6.0% for 2025); 2025 SC1040TT, Individual Income Tax Tables (Revised 6/17/25) incl. the printed Tax Rate Schedule for $100,000+",
      section: "S.C. Code § 12-6-510; SC1040 line 6; 2025 SC1040TT",
      url: "https://dor.sc.gov/forms-site/Forms/SC1040TT_2025.pdf",
      excerpt:
        "2025 brackets (decoded from the printed SC1040TT and confirmed by its own $100,000+ schedule — the SAME schedule for every filing status): 0% to $3,560; 3% from $3,560 to $17,830; 6.0% over $17,830 (marginal anchor $428.10 at $17,830). THE TOP RATE IS 6.0% FOR 2025 — the annual revenue-trigger reduction cut it from 6.2% (2024) and 6.4% (2023); surveys printed before the determination show the stale 6.2%. METHOD (SC1040TT verbatim): 'You must use the Tax Tables instead of this Tax Rate Schedule if your taxable income is less than $100,000'; the printed table uses $50-wide rows below $7,000 and $100-wide rows from $7,000, each row = the schedule at the ROW MIDPOINT rounded to the nearest dollar — verified against 10 printed rows incl. the bracket transitions ($3,600–$3,650 → $2 = 3% × $65; $17,900–$18,000 → $435 = $428.10 + 6% × $120; $99,900–$100,000 → $5,355). $100,000 AND OVER (printed schedule, verbatim): 'Multiply the amount on line 5 by 6%; Subtract $642' (worked example: $101,000 → $5,418; the exact marginal constant is $641.70 — the printed $642 is the DOR's rounding, encoded as printed for $100,000+). useFormulaMethod=true evaluates the marginal schedule at the exact income below $100,000. THE BASE (SC1040 line 5) starts from FEDERAL TAXABLE INCOME (line 1, floor $0 — a negative federal taxable income enters $0 on line 1 and the NEGATIVE amount is preserved via the line r subtraction), plus additions, minus subtractions → us.sc.* companion targets. FILING NOTE (SCDOR, 2026): ALL taxpayers received an AUTOMATIC extension for 2025 returns to October 15, 2026 — FILING ONLY: at least 90% of the 2025 liability was still due April 15, 2026 to avoid penalties. TY2026 IS A DIFFERENT WORLD: H.4216 (signed March 30, 2026) replaces this structure — see us.sc.income_tax v2. Part-year/nonresidents: Schedule NR (not composed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      zeroBracketTop: { value: "356000", type: "money" }, // $3,560
      threePctBracketTop: { value: "1783000", type: "money" }, // $17,830
      topRatePct: { value: "6", type: "int" }, // trigger-reduced for 2025
      printedConstant100k: { value: "64200", type: "money" }, // $642 ($641.70 exact)
      tableThreshold: { value: "10000000", type: "money" }, // $100,000
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr => printedSchedule(b, SCHED_2025);
      // $50-wide rows below $7,000; $100-wide rows from $7,000
      const mid50: Expr = {
        kind: "add",
        args: [mulInt(money("5000"), { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" }), money("2500")],
      };
      const mid100: Expr = {
        kind: "add",
        args: [mulInt(money("10000"), { kind: "stepUnits", value: base, unitCents: "10000", mode: "floor" }), money("5000")],
      };
      const table: Expr = iff(lt(base, money("700000")), sched(mid50), sched(mid100));
      // printed $100,000+ method: 6% x TI − $642 (as printed, not the exact $641.70)
      const over100k: Expr = sub(
        { kind: "mulRate", base, rate: { num: "6", den: "100" }, round: "half-up" },
        money("64200"),
      );
      return rd(
        iff(
          lt(base, money("10000000")),
          iff(fact("useFormulaMethod"), sched(base), table),
          { kind: "max0", arg: over100k },
        ),
      );
    })(),
  },
  {
    id: "us.sc.income_tax",
    version: 2,
    jurisdiction: "us.sc",
    title:
      "South Carolina income tax — TY2026 (H.4216 restructure): 1.99% to $30,000, $597 + 5.21% above, on the NEW federal-AGI base",
    citation: {
      source:
        "H.4216 (signed by the Governor March 30, 2026, effective beginning with the 2026 tax year); SCDOR 'Information about H. 4216' (dor.sc.gov/news/information-about-h-4216); web-verified August 2026",
      section: "H.4216; S.C. Code § 12-6-510 as rewritten",
      url: "https://dor.sc.gov/news/information-about-h-4216",
      excerpt:
        "H.4216 REPLACES the SC income tax structure for TY2026 (returns due April 15, 2027; it does NOT affect 2025 filings). RATES (SCDOR verbatim): 'The tax rate for income less than $30,000 is 1.99%. The tax rate for income from $30,000 and above is 5.21%, minus $966' — the two forms are EXACTLY continuous (5.21% × $30,000 − $966 = $597 = 1.99% × $30,000), so this rule encodes the marginal form ($597 anchor at $30,000). NEW BASE (verbatim): 'Federal Adjusted Gross Income (AGI) is now the starting point' — SC DECOUPLES from federal deductions; a new SOUTH CAROLINA INCOME ADJUSTED DEDUCTION replaces the federal standard deduction → us.sc.income_adjusted_deduction ($15,000 single/MFS, $22,500 HOH, $30,000 MFJ/QSS). BEA TRIGGER (verbatim): 'The top Individual Income Tax rate will be further reduced if the Board of Economic Advisors (BEA) projects that revenue collections will increase by 5% or greater from the previous fiscal year' — the enrolled step size is the GREATER of $200 million or 25% of the recurring surplus (limited to the projected increase), and 'the reduction required by this item shall continue until the top marginal income tax rate equals 1.99 percent'; never assume a post-2026 rate without the certification. TY2026 EITC (enrolled § 12-6-3632 amendment, verbatim): 125% of the federal EITC, nonrefundable, 'but not to exceed $200' — the $200 CAP is NEW for 2026 (TY2025 is uncapped). CAVEATS: the 2026 SC1040 form, its line structure, the fate of the TY2025 subtraction set (44% LTCG, retirement/age-65 deductions, dependent exemptions) under the new base, and the 2026 tax-table convention are unpublished until the 2026 forms land (~January 2027) — this rule computes the enacted schedule on already-composed 2026 taxable income; compose the base per H.4216's enrolled text with disclosure, and re-verify against the printed 2026 SC1040 when it publishes. [Input: SC income subject to tax for 2026, composed per H.4216.]",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      bracketTop: { value: "3000000", type: "money" }, // $30,000
      lowRatePctTimes100: { value: "199", type: "int" }, // 1.99%
      topRatePctTimes100: { value: "521", type: "int" }, // 5.21%
      printedSubtractionConstant: { value: "96600", type: "money" }, // $966
    },
    formula: rd(
      printedSchedule({ kind: "max0", arg: fact("stateTaxableIncome") }, [
        { thresholdCents: "0", fixedCents: "0", rate: { num: "199", den: "10000" } },
        { thresholdCents: "3000000", fixedCents: "59700", rate: { num: "521", den: "10000" } },
      ]),
    ),
  },
  {
    id: "us.sc.income_adjusted_deduction",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina Income Adjusted Deduction — TY2026 (H.4216): $15,000 / $22,500 / $30,000, PHASED OUT by federal AGI over $40,000/$60,000/$80,000 (fully gone at $95,000/$142,500/$190,000)",
    citation: {
      source:
        "H.4216 enrolled text (scstatehouse.gov/sess126_2025-2026/bills/4216.htm, phase-out fractions verbatim); SCDOR 'Information about H. 4216'; web-verified August 2026",
      section: "H.4216; SC1040 (2026 structure)",
      url: "https://www.scstatehouse.gov/sess126_2025-2026/bills/4216.htm",
      excerpt:
        "NEW for TY2026 (H.4216): 'A South Carolina Income Adjusted Deduction replaces the federal standard deduction': $15,000 for single or married filing separately; $22,500 for head of household; $30,000 for married filing jointly or a surviving spouse — applied against the NEW federal-AGI starting point (SC no longer inherits the federal standard/itemized deduction through federal taxable income). PHASE-OUT (enrolled text, verbatim mechanism): the deduction is 'reduced by a fraction whereby the numerator is the amount the taxpayer's federal adjusted gross income exceeds' the threshold 'and the denominator is' the range — single/MFS: threshold $40,000, denominator $55,000 (eliminated at $95,000 AGI); HOH: $60,000 over $82,500 (eliminated at $142,500); MFJ/QSS: $80,000 over $110,000 (eliminated at $190,000). ROUNDING (verbatim): 'Any reduction amount which is not a multiplier of ten dollars must be rounded to the next lowest ten dollars' — the REDUCTION rounds DOWN to the next $10 (i.e. reduction = deduction × excess/range, floored to $10s; the deduction itself is base minus that). Example: MFJ AGI $100,000 → reduction $30,000 × 20,000/110,000 = $5,454.54 → $5,450 → deduction $24,550. Age additions, dependent interactions, and the printed worksheet still await the 2026 forms — re-verify against the printed 2026 SC1040 when it publishes. [Inputs: filingStatus; scAgi = federal AGI for 2026.]",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      singleMfs: { value: "1500000", type: "money" },
      hoh: { value: "2250000", type: "money" },
      jointQss: { value: "3000000", type: "money" },
      phaseoutStartSingleMfs: { value: "4000000", type: "money" }, // $40,000
      phaseoutRangeSingleMfs: { value: "5500000", type: "money" }, // $55,000
      phaseoutStartHoh: { value: "6000000", type: "money" }, // $60,000
      phaseoutRangeHoh: { value: "8250000", type: "money" }, // $82,500
      phaseoutStartJointQss: { value: "8000000", type: "money" }, // $80,000
      phaseoutRangeJointQss: { value: "11000000", type: "money" }, // $110,000
    },
    formula: (() => {
      const phased = (base: string, start: string, range: string): Expr => {
        const excess: Expr = { kind: "max0", arg: sub(fact("scAgi"), money(start)) };
        const reductionRaw: Expr = { kind: "mulDiv", a: money(base), b: excess, c: money(range), round: "floor" };
        // 'rounded to the next lowest ten dollars' — floor the reduction to $10 units
        const reduction10: Expr = mulInt(money("1000"), { kind: "stepUnits", value: reductionRaw, unitCents: "1000", mode: "floor" });
        return { kind: "max0", arg: sub(money(base), reduction10) };
      };
      return iff(
        { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        phased("3000000", "8000000", "11000000"),
        iff(isStatus("hoh"), phased("2250000", "6000000", "8250000"), phased("1500000", "4000000", "5500000")),
      );
    })(),
  },
  {
    id: "us.sc.dependent_exemption",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina dependent exemption — $4,930 per dependent for 2025 (SC1040 line w; the same amount again per child under 6 on line t)",
    citation: {
      source:
        "S.C. Code § 12-6-1160 (line w dependent exemption) and § 12-6-1140(13) (the additional under-age-6 deduction), both indexed; 2025 SC1040 instructions (dependent exemption worksheet and the Worksheet for dependent under age 6, both printing $4,930)",
      section: "SC1040 lines t and w; 2025 instructions",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "2025 amount (printed worksheets, verbatim): $4,930 per eligible dependent (qualifying children AND qualifying relatives; the SC dependent count must equal the federal return's) — claimed on SC1040 line w. ADDITIONAL under-6 deduction (line t, its own printed worksheet): the SAME $4,930 again for each dependent who had not reached age 6 during the tax year (i.e. an under-6 dependent yields $9,860 total across lines t and w). Both are SUBTRACTIONS from federal taxable income. Form 8332 attaches when required federally. The amount is indexed annually. [Input: scDependents = the count for the line being computed — evaluate once with the full dependent count (line w) and once with the under-6 count (line t).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perDependent: { value: "493000", type: "money" }, // $4,930 (2025 indexed)
    },
    formula: mulInt(money("493000"), fact("scDependents")),
  },
  {
    id: "us.sc.retirement_deduction",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina retirement deduction — the $3,000 (under 65) / $10,000 (65+) CAP is first reduced by the same person's military retirement deduction, then limited to qualified retirement income (SC1040 lines p-1/p-2)",
    citation: {
      source:
        "S.C. Code § 12-6-1170(A); 2025 SC1040 instructions, lines p-1 through p-6 worksheets and Examples 3-5",
      section: "S.C. Code § 12-6-1170(A); SC1040 lines p-1/p-2/p-3",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "Per person (2025 instructions, verbatim): 'An individual who is under age 65 may claim a retirement deduction up to $3,000 on qualified retirement income'; 65 or older by year end → up to $10,000, from the person's OWN qualified plan (401(k)/403(b)/457, IRAs, Keogh). MILITARY retirement is 100% deducted separately on lines p-4/p-6 — and the printed worksheet REDUCES THE CAP, not the income: retirement deduction available = ($3,000 or $10,000) MINUS the military retirement deduction taken for that person; p-1/p-2 = the LESSER of qualified retirement income and that reduced cap. Instructions Example 5: a 65+ taxpayer deducting $16,000 of military retirement 'is not allowed an additional amount on line p-1 or line q-1' — the $10,000 cap is exhausted even though $8,000 of other retirement income remains. Surviving-spouse variant (p-3): the deceased spouse's cap based on the deceased's age. Income already subtracted elsewhere (Social Security, disability) does not count. Interacts with the AGE-65 deduction: us.sc.age65_deduction is reduced by the amounts claimed here and on the military lines. [Inputs (one person per evaluation): scQualifiedRetirementIncome (EXCLUDING military retirement), scMilitaryRetirementDeduction (the same person's p-4/p-5 amount), scIs65.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      capUnder65: { value: "300000", type: "money" }, // $3,000
      cap65Plus: { value: "1000000", type: "money" }, // $10,000
    },
    formula: {
      kind: "min",
      args: [
        { kind: "max0", arg: fact("scQualifiedRetirementIncome") },
        {
          kind: "max0",
          arg: sub(
            iff(fact("scIs65"), money("1000000"), money("300000")),
            { kind: "max0", arg: fact("scMilitaryRetirementDeduction") },
          ),
        },
      ],
    },
  },
  {
    id: "us.sc.age65_deduction",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina age 65 and older deduction — $15,000 per qualifying person, reduced by the retirement and military-retirement deductions claimed (SC1040 lines q-1/q-2)",
    citation: {
      source: "S.C. Code § 12-6-1170(B); 2025 SC1040 instructions, lines q-1/q-2 and the printed reduction worksheet",
      section: "S.C. Code § 12-6-1170(B); SC1040 lines q-1/q-2",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "A resident who is 65 or older by December 31 may deduct up to $15,000 'against any South Carolina income' (not just retirement income) — but the printed worksheet REDUCES the $15,000 by the retirement deduction (line p-1/p-2) AND the military retirement deduction (line p-4/p-5) claimed by the SAME person (a 65+ filer who took the full $10,000 retirement deduction has $5,000 of age-65 deduction left). Per person; each spouse computes separately. [Inputs (one person): scRetirementDeductionsClaimed = that person's line p amounts (retirement + military retirement).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      base: { value: "1500000", type: "money" }, // $15,000
    },
    formula: {
      kind: "max0",
      arg: sub(money("1500000"), { kind: "max0", arg: fact("scRetirementDeductionsClaimed") }),
    },
  },
  {
    id: "us.sc.two_wage_earner_credit",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina Two Wage Earner Credit — 0.7% of the lesser-earning spouse's SC qualified earned income, capped at $50,000 (max $350; SC1040 line 12)",
    citation: {
      source: "S.C. Code § 12-6-3330; 2025 SC1040 instructions, Line 12 and the Two Wage Earner Credit worksheet",
      section: "S.C. Code § 12-6-3330; SC1040 line 12",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "2025 instructions (verbatim): 'the credit is computed at .007 of the lesser of $50,000 or the South Carolina qualified earned income of the spouse with the lower South Carolina qualified earned income' — maximum $350. MARRIED FILING JOINTLY ONLY, both spouses with earned income taxed to SC ('not allowed on returns with a filing status of Single, Married Filing Separately, or Head of Household'). Qualified earned income = SC earned income minus the federal 1040 adjustments attributable to it (deductible ½ SE tax, SE retirement/SEP, SE health insurance, etc. per the worksheet). NONREFUNDABLE. [Input: scLowerQualifiedEarnedIncome = the lesser spouse's worksheet result.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      ratePctTimes10: { value: "7", type: "int" }, // 0.7%
      earnedIncomeCap: { value: "5000000", type: "money" }, // $50,000
      creditMax: { value: "35000", type: "money" }, // $350
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "min", args: [{ kind: "max0", arg: fact("scLowerQualifiedEarnedIncome") }, money("5000000")] },
      rate: { num: "7", den: "1000" },
      round: "half-up",
    }),
  },
  {
    id: "us.sc.cdcc",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina Child and Dependent Care Credit — 7% of the federal care expenses, max $210 / $420 (SC1040 line 11)",
    citation: {
      source: "S.C. Code § 12-6-3380; 2025 SC1040 instructions, Line 11 (with worked examples)",
      section: "S.C. Code § 12-6-3380; SC1040 line 11",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "2025 instructions (verbatim): 'the credit is calculated at 7% of the federal child and dependent care EXPENSE' (the federal Form 2441 expense amount, NOT the federal credit — worked example: $2,000 of federal expenses → $140). 'The maximum credit allowed is $210 for one child or $420 for two or more children' (= 7% of the federal $3,000/$6,000 expense caps). DENIED to married filing separately. Part-year/nonresidents prorate (and residents of states with no nonresident-reciprocal credit are ineligible) — not composed. NONREFUNDABLE. [Inputs: scCareExpenses (federal 2441 expenses), scCareChildren.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfExpenses: { value: "7", type: "int" },
      maxOneChild: { value: "21000", type: "money" }, // $210
      maxTwoPlus: { value: "42000", type: "money" }, // $420
    },
    formula: {
      kind: "min",
      args: [
        rd({
          kind: "mulRate",
          base: { kind: "max0", arg: fact("scCareExpenses") },
          rate: { num: "7", den: "100" },
          round: "half-up",
        }),
        iff(
          { kind: "cmp", op: "ge", left: fact("scCareChildren"), right: { kind: "int", value: "2" } },
          money("42000"),
          money("21000"),
        ),
      ],
    },
  },
  {
    id: "us.sc.parameters",
    version: 1,
    jurisdiction: "us.sc",
    title:
      "South Carolina 2025 return parameters — 44% capital gain deduction, military retirement, EITC 125%, subtractions, credits, and composition conventions (SC1040)",
    citation: {
      source:
        "2025 SC1040 + 26-page instructions (dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf); 2025 SC1040TT; S.C. Code Title 12; SCDOR H.4216 page",
      section: "SC1040; 2025 instructions",
      url: "https://dor.sc.gov/sites/dor/files/forms/SC1040Instr_2025.pdf",
      excerpt:
        "BASE: SC1040 line 1 = FEDERAL TAXABLE INCOME (zero floor; a NEGATIVE federal taxable income enters $0 on line 1 and the negative amount is preserved as the line r subtraction — net effect keeps the loss). ADDITIONS (lines a-e): STATE TAX ADDBACK for federal itemizers (the state income/sales tax deducted federally), out-of-state losses, National Guard/Reserve expense addback, non-SC municipal bond interest, other — AND, CRITICAL FOR TY2025: SOUTH CAROLINA REJECTED OBBBA CONFORMITY (the March 31, 2026 conformity bill failed the Senate; SC conforms to the IRC only through December 31, 2024), so line e must ADD BACK every 2025 federal deduction from IRC sections SC does not adopt — the OBBBA tips exclusion, overtime-premium exclusion, the enhanced $6,000 senior deduction, car-loan interest, and OBBBA business-asset deductions (the instructions' line e: 'Add back any federal deductions resulting from IRC sections that South Carolina does not adopt'; this nonconformity is why the SCDOR granted the October 15 extension). SUBTRACTIONS (lines f-w): state tax refund (f); total-and-permanent disability retirement (g); out-of-state non-personal-service income/gain (h); 44% OF NET LONG-TERM CAPITAL GAINS held over one year (i — SC nets LT gains against ALL capital losses first: the printed example nets an ST loss against the LT gain before applying 44%); volunteer firefighter/EMS/police/reserve/DNR deduction (j, $6,000 for 2025 per the printed instructions); Future Scholar/SC 529 contributions (k, unlimited-to-contribution); ACTIVE TRADE OR BUSINESS INCOME deduction (l, pairs with the I-335 flat 3% election on line 8); US government interest (m); nontaxable Guard/Reserve pay (n); SOCIAL SECURITY and railroad retirement to the extent federally taxed (o — SC never taxes SS); retirement deductions (p-1..p-3 → us.sc.retirement_deduction) and MILITARY RETIREMENT 100% (p-4..p-6, TY2022+: 'individuals may deduct all military retirement income', which REDUCES both the regular retirement deduction and the age-65 deduction for that person); AGE 65+ $15,000 deduction (q → us.sc.age65_deduction); negative federal taxable income (r); SUBSISTENCE ALLOWANCE $16/day for police/fire/EMS (s); dependents under 6 (t → us.sc.dependent_exemption with the under-6 count); consumer protection services ($300 individual/$1,000 MFJ-or-with-dependents, u); other (v); DEPENDENT EXEMPTION $4,930 each (w → us.sc.dependent_exemption). TAX: line 6 → us.sc.income_tax; line 7 SC4972 lump-sum; line 8 I-335 active-trade 3% flat election; line 9 catastrophe-savings withdrawal tax. NONREFUNDABLE CREDITS: CDCC (line 11 → us.sc.cdcc), Two Wage Earner (line 12 → us.sc.two_wage_earner_credit), SC1040TC bundle (line 13, transcribed): SC EARNED INCOME TAX CREDIT = 125% of the federal EITC, NONREFUNDABLE, full-year residents (§ 12-6-3632, fully phased since 2023, UNCAPPED for TY2025 — H.4216 caps it at $200 beginning TY2026; TC-60), other-state credit, nursing home, classroom teacher (also a refundable variant), motor fuel user fee credit (I-385). PAYMENTS/REFUNDABLES: withholding (16), estimates (17), extension (18), I-290 nonresident real estate (19), other withholding (20), TUITION TAX CREDIT (21, I-319: 50% of tuition within the I-319 limits, REFUNDABLE, SC colleges), refundable bundle (22a-d: anhydrous ammonia, milk, classroom teacher I-360, parental refundable I-361). USE TAX line 26 (county-rate based, self-computed; certification checkbox). Contributions via I-330 (28). Refund/due chain lines 24-34 (the use tax/credited-forward/contributions NET against the overpayment on lines 26-30 — a shortfall flows into line 31). PENALTIES: line 32 late file/pay; line 33 SC2210 underpayment. FILING NOTE: the SCDOR granted ALL taxpayers an AUTOMATIC extension to OCTOBER 15, 2026 for 2025 returns (no form needed) — FILING ONLY: at least 90% of the 2025 liability was due April 15, 2026 to avoid penalties. TY2026: H.4216 restructures everything (FAGI base, Income Adjusted Deduction, 1.99%/5.21% — us.sc.income_tax v2); the fate of these subtractions under the new base publishes with the 2026 forms. No local income taxes.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      ltcgDeductionPct: { value: "44", type: "int" },
      eitcPctOfFederal: { value: "125", type: "int" }, // nonrefundable, TC-60
      subsistencePerDay: { value: "1600", type: "money" }, // $16
      consumerProtectionIndividual: { value: "30000", type: "money" }, // $300
      consumerProtectionJointOrDependents: { value: "100000", type: "money" }, // $1,000
      activeTradeBusinessRatePct: { value: "3", type: "int" }, // I-335 election
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: South Carolina composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.sc.income_tax (v1 TY2025 / v2 TY2026), us.sc.income_adjusted_deduction (TY2026), us.sc.dependent_exemption, us.sc.retirement_deduction, us.sc.age65_deduction, us.sc.two_wage_earner_credit, us.sc.cdcc",
    },
  },
];
