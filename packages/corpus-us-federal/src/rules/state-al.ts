import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Alabama deep pack — TY2025 Form 40 (+ the enacted Act 2026-604 overtime
 * premium deduction for TY2026-2028). All amounts verified from the printed
 * 2025 Form 40 booklet (34pp, incl. the tax tables, standard deduction
 * chart, dependent chart, and the Federal Income Tax Deduction Worksheet)
 * and ADOR primary pages. Load-bearing findings: the over-$100,000 printed
 * worksheet anchors at the LAST TABLE ROW's rounded value ($4,958/$4,918 —
 * $2 BELOW the pure schedule); the TY2025 overtime exemption ended June 30,
 * 2025; and the "$12,000 retirement exclusion in 2026" widely reported by
 * tax surveys is FALSE — HB388 died May 14, 2025, so $6,000 continues.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const isStatus = (v: string): Expr => ({ kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: v } });
// Alabama has NO qualifying-surviving-spouse status: only an actual MFJ
// filing gets the joint column/chart. A federal QSS is a 26 U.S.C. § 2(a)
// surviving spouse, whom Alabama's Head of Family EXPRESSLY excludes
// (booklet p. 6; reg 810-3-19-.02 adopts § 2(b)) — QSS composes as SINGLE,
// which is also where qss facts fall through in every formula below.
const isMfjExpr: Expr = isStatus("mfj");

// § 40-18-5 schedules (unchanged for decades; the same for 2025 and 2026)
const SCHED_SINGLE = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "2", den: "100" } },
  { thresholdCents: "50000", fixedCents: "1000", rate: { num: "4", den: "100" } }, // $500
  { thresholdCents: "300000", fixedCents: "11000", rate: { num: "5", den: "100" } }, // $3,000
];
const SCHED_MFJ = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "2", den: "100" } },
  { thresholdCents: "100000", fixedCents: "2000", rate: { num: "4", den: "100" } }, // $1,000
  { thresholdCents: "600000", fixedCents: "22000", rate: { num: "5", den: "100" } }, // $6,000
];

export const alRules: Rule[] = [
  {
    id: "us.al.income_tax",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama income tax — 2%/4%/5% at $500/$3,000 (single/MFS/HOF) or $1,000/$6,000 (MFJ), via the printed Form 40 tax table and its over-$100,000 worksheet (Form 40 line 17)",
    citation: {
      source:
        "Ala. Code § 40-18-5; 2025 Form 40 booklet, Tax Tables pp. 25-30 and the 'Over $100,000.00' worksheet (revenue.alabama.gov)",
      section: "Ala. Code § 40-18-5; Form 40 line 17; 2025 Tax Tables",
      url: "https://www.revenue.alabama.gov/forms/?d=income-tax&y=2025",
      excerpt:
        "RATES (§ 40-18-5, unchanged): single/married-filing-separately/head-of-family — 2% on the first $500, 4% on the next $2,500, 5% over $3,000; married filing jointly — 2% on the first $1,000, 4% on the next $5,000, 5% over $6,000. The printed table has TWO columns only: 'Single * Married filing separately * Head of family' share one column and 'Married filing jointly' the other. METHOD (booklet verbatim): 'You must figure your tax from the Tax Tables' unless claiming a Form NOL-85A net operating loss. TABLE CONVENTION (decoded from 12 printed rows): $100-wide rows from $100 to $100,000, each row = the schedule at the ROW MIDPOINT rounded HALF-UP (verified incl. [3,000-3,100)→$113/$102, [5,900-6,000)→$258/$218, [16,000-16,100)→$763/$723, [25,900-26,000)→$1,258/$1,218, [99,900-100,000)→$4,958/$4,918); the two sub-$100 rows are $50-wide and printed [0-50)→$0 and [50-100)→$1 in BOTH columns — their $.50 midpoints round DOWN as printed (encoded as printed, not half-up). OVER $100,000 (printed worksheet, verbatim): tax = 5% × (taxable income − $100,000) PLUS $4,958.00 (single/MFS/HOF) or $4,918.00 (MFJ) — NOTE the printed materials leave EXACTLY $100,000 uncovered (the last table row is 'less than 100,000' and the worksheet says 'over $100,000'); this rule routes $100,000 to the worksheet (= the anchor itself), the standard software convention — the printed anchors equal the LAST TABLE ROW's rounded value and are $2 BELOW the pure marginal schedule ($4,960/$4,920); encoded AS PRINTED. useFormulaMethod=true evaluates the exact marginal schedule instead (below $100,000 only). BASE: Form 40 line 16 taxable income = Alabama AGI − (itemized-or-standard deduction + FEDERAL INCOME TAX DEDUCTION + personal exemption + dependent exemption) → us.al.* companion targets. The 2%/4%/5% schedule is NOT indexed and applies unchanged for TY2026 (the 2026 printed table publishes ~January 2027 — re-verify the anchors then). Part-year residents prorate; Form 40NR not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      singleBracket2: { value: "50000", type: "money" }, // $500
      singleBracket3: { value: "300000", type: "money" }, // $3,000
      mfjBracket2: { value: "100000", type: "money" }, // $1,000
      mfjBracket3: { value: "600000", type: "money" }, // $6,000
      printedAnchorSingle100k: { value: "495800", type: "money" }, // $4,958 as printed
      printedAnchorMfj100k: { value: "491800", type: "money" }, // $4,918 as printed
      tableThreshold: { value: "10000000", type: "money" }, // $100,000
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr => iff(isMfjExpr, printedSchedule(b, SCHED_MFJ), printedSchedule(b, SCHED_SINGLE));
      // $100-wide rows from $100; the printed sub-$100 rows are literals
      const mid100: Expr = {
        kind: "add",
        args: [mulInt(money("10000"), { kind: "stepUnits", value: base, unitCents: "10000", mode: "floor" }), money("5000")],
      };
      const table: Expr = iff(
        lt(base, money("5000")),
        money("0"), // printed row [0, 50) -> $0
        iff(lt(base, money("10000")), money("100"), sched(mid100)), // printed row [50, 100) -> $1
      );
      // printed over-$100,000 worksheet: 5% x excess + the printed anchor
      const over100k: Expr = {
        kind: "add",
        args: [
          iff(isMfjExpr, money("491800"), money("495800")),
          { kind: "mulRate", base: sub(base, money("10000000")), rate: { num: "5", den: "100" }, round: "half-up" },
        ],
      };
      return rd(iff(lt(base, money("10000000")), iff(fact("useFormulaMethod"), sched(base), table), over100k));
    })(),
  },
  {
    id: "us.al.standard_deduction",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama standard deduction — AGI-phased printed chart: MFJ $8,500→$5,000, single $3,000→$2,500, HOF $5,200→$2,500 (steps of $500 from $26,000), MFS $4,250→$2,500 (steps of $250 from $13,000)",
    citation: {
      source: "Ala. Code § 40-18-15(b) as amended by Act 2022-292; 2025 Form 40 booklet, Standard Deduction chart p. 9",
      section: "Form 40 line 11 box b; 2025 chart",
      url: "https://www.revenue.alabama.gov/forms/?d=income-tax&y=2025",
      excerpt:
        "Printed 2025 chart (keyed to ALABAMA AGI, Form 40 line 10): MARRIED FILING JOINT — $8,500 for AGI $0-$25,999, then MINUS $175 per $500 step ($26,000-$26,499 → $8,325 … $35,000-$35,499 → $5,175), floor $5,000 at $35,500+. SINGLE — $3,000 to $25,999, minus $25 per $500 step, floor $2,500 at $35,500+. HEAD OF FAMILY — $5,200 to $25,999, minus $135 per $500 step, floor $2,500 at $35,500+. MARRIED FILING SEPARATE — $4,250 for AGI $0-$12,999, minus $88 per $250 step ($13,000-$13,249 → $4,162 … $17,500-$17,749 → $2,578), floor $2,500 at $17,750+ (the MFS floor CLAMPS: the raw progression would reach $2,490). Amounts are NOT indexed (Act 2022-292 set them; identical for 2026 until amended). A dependent or student may take the FULL standard deduction even if claimed as a dependent by someone else (unlike federal law). Itemized deductions (Schedule A) may be claimed instead whenever larger — Alabama allows free choice, except MFS spouses must both use the same method unless living apart all year. [Inputs: filingStatus, alAgi.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      maxMfj: { value: "850000", type: "money" },
      floorMfj: { value: "500000", type: "money" },
      maxSingle: { value: "300000", type: "money" },
      maxHof: { value: "520000", type: "money" },
      maxMfs: { value: "425000", type: "money" },
      floorOthers: { value: "250000", type: "money" },
      phaseStart: { value: "2600000", type: "money" }, // $26,000 ($13,000 MFS)
    },
    formula: (() => {
      const agi: Expr = { kind: "max0", arg: fact("alAgi") };
      // steps = floor((AGI - start)/width) + 1 once AGI reaches the start
      const chart = (max: string, step: string, floor: string, start: string, width: string): Expr => {
        const excess: Expr = sub(agi, money(start));
        const steps: Expr = {
          kind: "add",
          args: [{ kind: "stepUnits", value: excess, unitCents: width, mode: "floor" }, { kind: "int", value: "1" }],
        };
        const reduced: Expr = { kind: "max", args: [sub(money(max), mulInt(money(step), steps)), money(floor)] };
        return iff(lt(agi, money(start)), money(max), reduced);
      };
      return iff(
        isMfjExpr,
        chart("850000", "17500", "500000", "2600000", "50000"),
        iff(
          isStatus("hoh"),
          chart("520000", "13500", "250000", "2600000", "50000"),
          iff(
            isStatus("mfs"),
            chart("425000", "8800", "250000", "1300000", "25000"),
            chart("300000", "2500", "250000", "2600000", "50000"),
          ),
        ),
      );
    })(),
  },
  {
    id: "us.al.dependent_exemption",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama dependent exemption — $1,000 / $500 / $300 per dependent by Alabama AGI ($0-$50,000 / $50,001-$100,000 / over $100,000) (Form 40 line 14)",
    citation: {
      source: "Ala. Code § 40-18-19(a)(9); 2025 Form 40 booklet, Line 14 dependent chart p. 8",
      section: "Form 40 line 14; Part III",
      url: "https://www.revenue.alabama.gov/forms/?d=income-tax&y=2025",
      excerpt:
        "Printed chart (verbatim, keyed to Form 40 page 1 line 10 Alabama AGI): '0 - 50,000 → 1,000; 50,001 - 100,000 → 500; Over 100,000 → 300' per dependent (AGI of exactly $50,000 → $1,000; exactly $100,000 → $500). Alabama defines 'dependent' by its OWN list (§ 40-18-19: child, stepchild, parent, grandparent, sibling, in-laws, blood uncle/aunt/nephew/niece — NOT the federal § 152 test; an unrelated household member never qualifies) with an over-50%-support test. Claimed on Schedule DS/Part III. Note the personal exemption is separate: $1,500 (single/MFS) or $3,000 (MFJ/head of family), printed on the Form 40 filing-status line, NOT AGI-phased, and a dependent-claimed filer may still take it. [Inputs: alDependents, alAgi.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      tier1: { value: "100000", type: "money" }, // $1,000 (AGI <= $50,000)
      tier2: { value: "50000", type: "money" }, // $500 (AGI <= $100,000)
      tier3: { value: "30000", type: "money" }, // $300
    },
    formula: mulInt(
      iff(
        le(fact("alAgi"), money("5000000")),
        money("100000"),
        iff(le(fact("alAgi"), money("10000000")), money("50000"), money("30000")),
      ),
      fact("alDependents"),
    ),
  },
  {
    id: "us.al.federal_tax_deduction",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama federal income tax deduction — UNLIMITED: federal tax (1040 line 22 + Form 8960 NIIT) minus the refundable credits (EIC, ACTC, AOC, refundable adoption, Form 2439), floored at $0 (Form 40 line 12)",
    citation: {
      source:
        "Ala. Const. art. XI § 211.04 (the deduction is constitutional and unlimited); Ala. Code § 40-18-15(a)(3); 2025 Form 40 booklet, Federal Income Tax Deduction Worksheet p. 31",
      section: "Form 40 line 12; 2025 worksheet",
      url: "https://www.revenue.alabama.gov/forms/?d=income-tax&y=2025",
      excerpt:
        "2025 printed worksheet (verbatim structure): line 1 = 2025 Form 1040 LINE 22 tax; line 2 = Net Investment Income Tax (Form 8960 line 17) — ADDED; line 5 = the sum of the REFUNDABLE credits: 4a Earned Income Credit (1040 line 27a), 4b Additional Child Tax Credit (line 28), 4c American Opportunity Credit (line 29), 4d refundable Adoption Credit (line 30), 4e Form 2439 credits (Schedule 3 Part II line 13a); line 6 = line 3 − line 5, 'If amount is negative enter zero'. UNLIMITED — Alabama is one of the few states with a full federal-tax deduction, and it is constitutionally protected. NEVER the federal withholding ('DO NOT ENTER THE FEDERAL TAX WITHHELD FROM YOUR FORM W-2(S)' — printed on the form). Pages 1-2 + Schedule 1 of the federal return attach. JOINT-FEDERAL/SEPARATE-ALABAMA returns and part-year residents RATIO the federal liability by each spouse's federal AGI share (or the AL-AGI/federal-AGI ratio) — compose with disclosure. [Inputs: alFederalTaxPlusNiit (1040 line 22 + 8960 line 17), alFederalRefundableCredits (the 4a-4e sum).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {},
    formula: {
      kind: "max0",
      arg: sub({ kind: "max0", arg: fact("alFederalTaxPlusNiit") }, { kind: "max0", arg: fact("alFederalRefundableCredits") }),
    },
  },
  {
    id: "us.al.retirement_exclusion",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama retirement exclusion (Lynn Greer Act) — first $6,000 of taxable retirement income per person 65 or older (Schedule RS; defined-contribution/IRA distributions)",
    citation: {
      source:
        "Ala. Code § 40-18-19(a)(13) (Act 2022-294, the Lynn Greer Retirement Income Tax Cut Act); 2025 Schedule RS (Form 40), Parts II/III retirement-exclusion questions",
      section: "Schedule RS; Form 40 Part I line 4",
      url: "https://www.revenue.alabama.gov/wp-content/uploads/2026/01/25schrsblk.pdf",
      excerpt:
        "2025 Schedule RS (verbatim): 'RETIREMENT EXCLUSION. Is the primary taxpayer 65 or older and receives taxable retirement? If Yes, each taxpayer is eligible up to $6,000 not to exceed the Retirement Income Taxable to Alabama on line 9.' Per person (primary Part II / spouse Part III), against OTHERWISE-TAXABLE retirement income — i.e. defined-CONTRIBUTION distributions (IRA/401(k)/SEP/Keogh/403(b)), since defined-BENEFIT pensions, Social Security, Railroad Retirement, military retirement, and US/Alabama government retirement (TRS/ERS/JRF) are already 100% EXEMPT under § 40-18-19 and never reach this exclusion. MISINFORMATION WARNING (verified August 2026): tax surveys widely report the exclusion 'doubles to $12,000 starting January 1, 2026' — that was HB388 (2025), which DIED May 14, 2025 without enactment; no 2026-session act revived it, so $6,000 CONTINUES for TY2026. Re-verify if a future act passes. [Inputs (one person): alTaxableRetirement (the person's otherwise-taxable retirement income), alIs65.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      exclusionCap: { value: "600000", type: "money" }, // $6,000 — NOT $12,000 (HB388 died)
    },
    formula: iff(
      fact("alIs65"),
      { kind: "min", args: [{ kind: "max0", arg: fact("alTaxableRetirement") }, money("600000")] },
      money("0"),
    ),
  },
  {
    id: "us.al.overtime_premium_deduction",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama overtime premium deduction (Act 2026-604) — lesser of the overtime PREMIUM (W-2 Box 12 code TT) or $1,000 per taxpayer, TY2026-2028, itemizing not required",
    citation: {
      source:
        "Act 2026-604; ADOR 'Overtime Premium Deduction (Act 2026-604)' (revenue.alabama.gov/individual-corporate/overtime-premium-deduction-act-2026-604); web-verified August 2026",
      section: "Act 2026-604",
      url: "https://www.revenue.alabama.gov/individual-corporate/overtime-premium-deduction-act-2026-604/",
      excerpt:
        "ADOR (verbatim): 'Beginning with the 2026 and ending with the 2028 calendar year', taxpayers may deduct the PREMIUM portion of overtime wages 'regardless of whether they itemize deductions or not'; 'The deduction is the lesser of the actual overtime premium or a maximum annual amount of $1,000 per taxpayer.' PREMIUM ONLY: 'If you earn time and a half for overtime, only the half portion above your base rate of pay is considered the overtime premium.' Reported by employers in W-2 BOX 12 code TT (informational — it does not change Box 16 wages, so this is a RETURN-level deduction, unlike the 2023-2025 exemption which was excluded from state wages at the W-2). Per taxpayer — each spouse claims their own on a joint return. HISTORY: the prior FULL overtime-wage EXEMPTION (Act 2023-421 as amended by Act 2024-437, FLSA definition) ENDED June 30, 2025 — for TY2025, overtime earned January 1-June 30, 2025 is exempt (W-2 Box 14 'EX OT WAGES', already excluded from Box 16) and July-December 2025 overtime is fully taxable, with NO deduction; this $1,000-capped deduction is the 2026-2028 replacement. SUNSET: expires after the 2028 calendar year. [Input: alOvertimePremium (one taxpayer's Box 12 code TT amount).]",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2029-01-01",
    output: { type: "money" },
    parameters: {
      capPerTaxpayer: { value: "100000", type: "money" }, // $1,000
    },
    formula: { kind: "min", args: [{ kind: "max0", arg: fact("alOvertimePremium") }, money("100000")] },
  },
  {
    id: "us.al.parameters",
    version: 1,
    jurisdiction: "us.al",
    title:
      "Alabama 2025 Form 40 parameters — personal exemptions, exempt income, itemized quirks (FICA deductible, 4% medical floor, vehicle-loan interest), overtime timeline, use tax rates, and composition conventions",
    citation: {
      source:
        "2025 Form 40 + 34-page booklet (revenue.alabama.gov); Ala. Code §§ 40-18-5, -15, -19; ADOR overtime pages; web-verified August 2026",
      section: "Form 40; 2025 booklet",
      url: "https://www.revenue.alabama.gov/forms/?d=income-tax&y=2025",
      excerpt:
        "STRUCTURE: Form 40 line 5b wages = W-2 BOX 16 state wages from ALL states (Schedule W-2 column I+J; Alabama state wages often EXCEED federal Box 1 — state-employee deferrals are AL-taxable); line 6 interest/dividends (Schedule B over $1,500); line 7 other income (page 2 Part I: alimony, business, gains — including the 1/1/2025+ precious-metal-bullion gain EXEMPTION, retirement via Schedule RS → us.al.retirement_exclusion, rents/royalties, farm); line 9 adjustments (Part II: IRA per spouse, Keogh/SEP, early-withdrawal penalty, alimony paid, adoption expenses, MOVING EXPENSES (Alabama kept them; in-state moves), self-employed health insurance, College Counts 529/PACT, small-employer health premiums, wind/flood retrofit, catastrophe savings, HSA, First-Time/Second-Chance Home Buyer, firefighter insurance, ABLE); line 10 = Alabama AGI. DEDUCTIONS: line 11 itemized (Schedule A) OR standard (→ us.al.standard_deduction — free choice, larger wins); line 12 → us.al.federal_tax_deduction (UNLIMITED); line 13 PERSONAL EXEMPTION printed on the filing-status line: $1,500 single/MFS, $3,000 MFJ/head-of-family (not AGI-phased; a dependent-claimed filer still takes it); line 14 → us.al.dependent_exemption. TAX: line 16 taxable income; line 17 → us.al.income_tax (table mandatory unless NOL-85A); line 18 net of Schedule OC credits (MAT pre-registration required for many; transcribed); line 19 Schedule ATP additional taxes (USE TAX: general 4%, automotive 2%, food/grocery 3% before September 1, 2025 and 2% ON/AFTER (Act 2025 grocery cut; the 2026 session ALSO enacted a ~two-month suspension of the 2% state grocery tax alongside Act 2026-604 — re-verify grocery use-tax rates for 2026 purchases), farm machinery 1.5%; catastrophe-savings recapture at +2.5% under § 40-18-312); line 20 $1/$2 party checkoffs (ADD to tax); lines 22-29 payments (withholding, estimates+automatic-extension, amended-only lines 24/28, Schedule OC-F refundable credits line 25, Schedule CP line 26); line 30 owe (+line 31 ATP Part II penalties); lines 32-35 overpaid − applied-to-2026 − Schedule DC donations = refund. ITEMIZED QUIRKS (Schedule A): FICA/Medicare/self-employment taxes are DEDUCTIBLE; medical floor is 4% of AGI (not 7.5%); FEDERAL income tax is NOT on Schedule A (it is line 12); NEW 2025 line 11c qualified VEHICLE LOAN INTEREST — capped $10,000, phased out $200 per $1,000 CEIL-step of AL AGI over $100,000 ($200,000 MFJ) per the printed worksheet (Alabama's own OBBBA-parallel). EXEMPT INCOME (§ 40-18-19): Social Security, Railroad Retirement, DEFINED-BENEFIT pensions (all of them, private included), US/Alabama government retirement (TRS/ERS/JRF), military retirement, peace-officer/firefighter retirement, up to $50,000 administrative-downsizing severance, combat pay, PACT/College Counts withdrawals, ABLE income, 1/1/2025+ precious-metal-bullion capital gains. OVERTIME TIMELINE: wages for overtime EARNED January 1-June 30, 2025 are EXEMPT (Act 2023-421/2024-437, FLSA definition, W-2 Box 14 'EX OT WAGES', excluded from Box 16); July 1-December 31, 2025 overtime is FULLY TAXABLE; TY2026-2028 → us.al.overtime_premium_deduction ($1,000 premium cap, Act 2026-604). Whole-dollar rounding on all lines. NO state EITC, NO CDCC, NO grocery income-tax credit; municipal occupational taxes (e.g. Birmingham 1%) are employer-withheld and NOT on this return. Part-year residents prorate (itemized deductions only while resident; FULL personal exemption). Federal-joint/Alabama-separate: ratio the line 12 deduction by FAGI shares.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      personalExemptionSingleMfs: { value: "150000", type: "money" }, // $1,500
      personalExemptionJointHof: { value: "300000", type: "money" }, // $3,000
      medicalFloorPctOfAgi: { value: "4", type: "int" },
      severanceExclusionCap: { value: "5000000", type: "money" }, // $50,000
      vehicleLoanInterestCap: { value: "1000000", type: "money" }, // $10,000
      useTaxGeneralPct: { value: "4", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Alabama Form 40 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.al.income_tax, us.al.standard_deduction, us.al.dependent_exemption, us.al.federal_tax_deduction, us.al.retirement_exclusion, and (TY2026-2028) us.al.overtime_premium_deduction",
    },
  },
];
