import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Missouri deep pack — TY2025 (all amounts re-verified from the 2025 Form
 * MO-1040 + instructions, Form MO-A, Form MO-WFTC, the DOR "2025 Individual
 * Income Tax Year Changes" page, and R.S.Mo. Chapter 143). TY2025 changes
 * encoded: the S.B. 3 trigger rate cut to 4.7% (from 4.8%, eff. 1/1/2025),
 * the H.B. 594 100% capital-gains subtraction (NEW, first state to fully
 * exempt individual capital gains, TY2025+), and the Working Family Tax
 * Credit's trigger increase to 20% of the federal EIC.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });

export const moRules: Rule[] = [
  {
    id: "us.mo.income_tax",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri income tax — 2025 Tax Chart (0% to 4.7%, S.B. 3 trigger cut), computed SEPARATELY per spouse (MO-1040 lines 30Y/30S)",
    citation: {
      source:
        "R.S.Mo. § 143.011 (as reduced by the S.B. 3 (2022) revenue triggers — 4.7% top rate effective 1/1/2025); 2025 Form MO-1040 instructions p.21, '2025 Tax Chart' (Sections A and B)",
      section: "R.S.Mo. § 143.011; MO-1040 lines 30Y/30S; 2025 Tax Chart",
      url: "https://dor.mo.gov/forms/MO-1040%20Instructions_2025.pdf",
      excerpt:
        "2025 Tax Rate Chart (instructions p.21, verbatim — the SAME chart for every filing status; brackets are inflation-indexed annually): $0 to $1,313 → $0; over $1,313 but not over $2,626 → 2.0% of the excess over $1,313; over $2,626–$3,939 → $26 plus 2.5% of the excess over $2,626; over $3,939–$5,252 → $59 plus 3.0%; over $5,252–$6,565 → $98 plus 3.5%; over $6,565–$7,878 → $144 plus 4.0%; over $7,878–$9,191 → $197 plus 4.5%; over $9,191 → $256 plus 4.7% of the excess over $9,191. THE PRINTED ANCHORS ARE ROUNDED WHOLE DOLLARS, not continuous accumulation (2.0% × $1,313 = $26.26 but the next row's anchor is $26; exact accumulation would give $26.26/$59.09/$98.48/$144.43/$196.95/$256.04) — this rule encodes the PRINTED anchors, the numbers every filer and the DOR calculator use. RATE HISTORY (S.B. 3, 2022, § 143.011.3-.4 revenue triggers): 2023 4.95%; 2024 4.8%; TY2025 4.7% (second trigger cut, effective January 1, 2025, confirmed by the DOR '2025 Individual Income Tax Year Changes' page and the printed chart); further 0.1-point cuts to 4.5% remain trigger-contingent — do NOT assume a 2026 rate without the 2026 chart. METHOD (chart header, verbatim): 'A separate tax must be computed for you and your spouse' — Missouri married-filing-combined returns SPLIT income between spouses (lines 29Y/29S) and run this chart TWICE; never apply it to the combined income (marriage-penalty-free by construction). 'Round to the nearest whole dollar and enter on Form MO-1040, Line 30Y and 30S' (worked examples: $3,090 → $26 + 2.5% × $464 = $37.60 → $38; $12,000 → $256 + 4.7% × $2,809 = $388.02 → $388 (the printed worksheet's own cent rounding shows $132.03/$388.03; the whole-dollar result is identical)). There is NO lookup table — the chart is the method at every income level (useFormulaMethod has no effect). NONRESIDENT/PART-YEAR: Form MO-NRI computes a Missouri income percentage applied at line 32 — not modeled (this target is the resident per-spouse chart tax on already-composed taxable income, MO-1040 line 29Y or 29S). Composite returns use a flat 4.7%. [Input: ONE spouse's Missouri taxable income (line 29Y or 29S).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      zeroBracketTop: { value: "131300", type: "money" }, // $1,313
      topBracketThreshold: { value: "919100", type: "money" }, // $9,191
      topRatePctTimes10: { value: "47", type: "int" }, // 4.7%
    },
    formula: rd(
      printedSchedule({ kind: "max0", arg: fact("stateTaxableIncome") }, [
        { thresholdCents: "0", fixedCents: "0", rate: { num: "0", den: "100" } },
        { thresholdCents: "131300", fixedCents: "0", rate: { num: "2", den: "100" } },
        { thresholdCents: "262600", fixedCents: "2600", rate: { num: "25", den: "1000" } },
        { thresholdCents: "393900", fixedCents: "5900", rate: { num: "3", den: "100" } },
        { thresholdCents: "525200", fixedCents: "9800", rate: { num: "35", den: "1000" } },
        { thresholdCents: "656500", fixedCents: "14400", rate: { num: "4", den: "100" } },
        { thresholdCents: "787800", fixedCents: "19700", rate: { num: "45", den: "1000" } },
        { thresholdCents: "919100", fixedCents: "25600", rate: { num: "47", den: "1000" } },
      ]),
    ),
  },
  {
    id: "us.mo.federal_tax_deduction",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri federal income tax deduction — AGI-tiered percentage (35/25/15/5/0%) capped at $5,000/$10,000 (MO-1040 lines 9-13)",
    citation: {
      source:
        "R.S.Mo. § 143.171; 2025 Form MO-1040 instructions, Lines 9-13 (federal tax percentage chart and cap)",
      section: "R.S.Mo. § 143.171; MO-1040 lines 9-13",
      url: "https://dor.mo.gov/forms/MO-1040%20Instructions_2025.pdf",
      excerpt:
        "Missouri deducts a PERCENTAGE of the federal income tax, keyed to COMBINED Missouri adjusted gross income (MO-1040 line 6), then dollar-capped. LINE 12 PERCENTAGE CHART (2025 instructions, verbatim): line 6 of $25,000 or less → 35%; $25,001–$50,000 → 25%; $50,001–$100,000 → 15%; $100,001–$125,000 → 5%; $125,001 or more → 0%. LINE 13 (verbatim): 'Multiply Line 11 by percentage on Line 12. If you selected any filing status other than married filing combined on the MO-1040, your federal tax deduction may not exceed $5,000. If you selected married filing combined, your federal tax cannot exceed $10,000.' THE LINE 11 BASE (agent-transcribed): line 9 'Tax from federal return' = Federal Form 1040/1040-SR line 22 MINUS lines 27a and 29, MINUS Schedule 2 Part 1 line 3, MINUS Schedule 3 Part 2 line 9 (never federal withholding; 'If you have an earned income credit, you must subtract the credit from the tax on your federal return'); PLUS line 10 'Other federal tax' = Schedule 2 Part 1 line 3 + Schedule 2 Part 2 lines 8, 14, and 15 + recapture taxes in line 21 + Schedule 3 Part 1 line 1 (attach 4255/8611/8828 for recapture; the instructions note the IRS had not finalized 2025 federal line numbers at press time — re-verify the federal cross-references at filing). [Inputs: moFederalTaxTotal = MO-1040 line 11, composed per the verbatim lists; moMagi = COMBINED Missouri AGI (line 6); filingStatus (mfj = married filing combined → $10,000 cap; all others $5,000).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      capCombined: { value: "1000000", type: "money" }, // $10,000 (married filing combined)
      capOther: { value: "500000", type: "money" }, // $5,000
      tier1MagiMax: { value: "2500000", type: "money" }, // $25,000 → 35%
      tier2MagiMax: { value: "5000000", type: "money" }, // $50,000 → 25%
      tier3MagiMax: { value: "10000000", type: "money" }, // $100,000 → 15%
      tier4MagiMax: { value: "12500000", type: "money" }, // $125,000 → 5%
    },
    formula: (() => {
      const magi = fact("moMagi");
      const total: Expr = { kind: "max0", arg: fact("moFederalTaxTotal") };
      const pct = (num: string): Expr => rd({ kind: "mulRate", base: total, rate: { num, den: "100" }, round: "half-up" });
      const uncapped: Expr = iff(
        le(magi, money("2500000")),
        pct("35"),
        iff(
          le(magi, money("5000000")),
          pct("25"),
          iff(le(magi, money("10000000")), pct("15"), iff(le(magi, money("12500000")), pct("5"), money("0"))),
        ),
      );
      const cap: Expr = iff(
        { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
        money("1000000"),
        money("500000"),
      );
      return { kind: "min", args: [uncapped, cap] };
    })(),
  },
  {
    id: "us.mo.public_pension_exemption",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri public pension exemption — up to $47,633 (2025 maximum social security benefit) per spouse, reduced by that spouse's SS/SSD exemption (MO-A Part 3 Section A)",
    citation: {
      source:
        "R.S.Mo. § 143.124; 2025 Form MO-A, Part 3, Section A (Public Pension Calculation)",
      section: "R.S.Mo. § 143.124; MO-A Part 3 Section A",
      url: "https://dor.mo.gov/forms/MO-A_2025.pdf",
      excerpt:
        "MO-A Part 3 Section A (2025 printed form, verbatim, PER SPOUSE column): line 1 = taxable pension from PUBLIC sources (any federal, state, or local government pension) from Federal Form 1040 line 5b; line 2 = the SMALLER of line 1 or $47,633 ('maximum social security benefit', 2025 — indexed annually); line 3 = the SAME spouse's Social Security/Social Security Disability exemption from Section C (lines 3Y/3S); line 4 = line 2 minus line 3, floor $0 (the SS exemption displaces the public-pension exemption dollar-for-dollar); line 5 = 4Y + 4S total public pension. Since S.B. 190 (2023, TY2024+) there is NO income limit on Section A (the old MO AGI phase-out was repealed). Military retirement is excluded SEPARATELY (MO-A Part 1 line 10, 100%, do not double-count here). The PRIVATE pension exemption (Section B: $6,000/spouse cap, income-limited at $32,000 combined/$25,000 single-HOH-QW/$16,000 MFS over (MO AGI − taxable SS)) and the 100% SS/SSD exemption (Section C, age 62+ or SSD, no income limit) compose separately per the printed worksheets. [Inputs (one spouse per evaluation): moPublicPension (their 1040 line 5b public-source amount), moSsSameSpouseExemption (their Section C exemption).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxPerSpouse: { value: "4763300", type: "money" }, // $47,633 (2025)
      privatePensionCapPerSpouse: { value: "600000", type: "money" }, // $6,000 (Section B)
      privateLimitCombined: { value: "3200000", type: "money" }, // $32,000
      privateLimitSingleHohQw: { value: "2500000", type: "money" }, // $25,000
      privateLimitMfs: { value: "1600000", type: "money" }, // $16,000
    },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: {
          kind: "min",
          args: [{ kind: "max0", arg: fact("moPublicPension") }, money("4763300")],
        },
        right: fact("moSsSameSpouseExemption"),
      },
    },
  },
  {
    id: "us.mo.wftc",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri Working Family Tax Credit — 20% of the federal EIC for 2025 (trigger increase), nonrefundable (Form MO-WFTC, MO-1040 line 44)",
    citation: {
      source:
        "R.S.Mo. § 143.177; 2025 Form MO-WFTC (Revised 12-2025)",
      section: "R.S.Mo. § 143.177; Form MO-WFTC; MO-1040 line 44",
      url: "https://dor.mo.gov/forms/MO-WFTC_2025.pdf",
      excerpt:
        "2025 Form MO-WFTC line 6 (verbatim): 'Multiply Line 5 [the federal EIC, Form 1040 line 27a] by 20% and enter the result' — the statute's base is 10% (§ 143.177.4) with revenue-trigger increases ('the percentage shall be increased by ten percent... [when] net general revenue collected in the previous fiscal year exceeds the highest amount... in any of the three fiscal years prior... by at least one hundred fifty million dollars'); the trigger fired and the 2025 printed form applies 20%. NONREFUNDABLE (statute verbatim: 'If the amount of the credit exceeds the tax liability, the difference shall not be refunded... and shall not be carried forward') — form lines 7-10: the credit is the SMALLER of 20% × federal EIC or (MO-1040 line 36 total tax MINUS lines 42 and 43 credits), floor $0. ELIGIBILITY (form + § 143.177.2): resident; filing status single, head of household, qualifying widow(er), or married filing combined — MARRIED FILING SEPARATELY AND DEPENDENT-CLAIMED FILERS ARE DENIED (form question 2); must be allowed the federal EIC. FROZEN-LAW BASIS (MO-1040 instructions p.10, Line 44, verbatim): the credit is '20 percent of what your federal earned income credit (EIC) would be UNDER THE EIC LAW AS OF JANUARY 1, 2021' — i.e. PRE-ARPA § 32. That freeze is why form question 3 gates INVESTMENT INCOME AT $4,400 (the indexed pre-ARPA disqualified-investment-income limit — NOT the current federal $11,950 limit, which reflects ARPA's permanent increase that Missouri does not follow), and why the MO-WFTC instructions compute investment income the pre-2021 way (taxable AND tax-exempt interest, dividends, positive capital gain income; the Pub. 596 worksheet method when Forms 4797/Schedule E apply). PRACTICAL WRINKLE (disclosed): the printed form's line 5 takes the ACTUAL Form 1040 line 27a, while the booklet's frozen-law language would recompute the EIC under 1/1/2021 law — for most filers these agree; where post-2020 § 32 changes alter the filer's EIC, follow the printed form's line 5 and disclose. Federal return and Schedule EIC must be attached. [Input: moFederalEic = Form 1040 line 27a; the line 7-10 tax cap and the question 2/3 gates are applied on composition.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "20", type: "int" }, // 2025 (trigger-raised from the 10% base)
      formInvestmentGate: { value: "440000", type: "money" }, // $4,400 (indexed pre-ARPA limit — 1/1/2021 frozen law)
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "max0", arg: fact("moFederalEic") },
      rate: { num: "20", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.mo.business_income_deduction",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri business income deduction — 20% of business income (R.S.Mo. § 143.022, MO-A Part 1 Line 17)",
    citation: {
      source:
        "R.S.Mo. § 143.022; 2025 Form MO-1040 instructions p.16 (Business Income Deduction worksheet)",
      section: "R.S.Mo. § 143.022; MO-A Part 1 line 17",
      url: "https://dor.mo.gov/forms/MO-1040%20Instructions_2025.pdf",
      excerpt:
        "The § 143.022 business income deduction reached its fully phased-in 20% and stays there: the instructions' 'Missouri Source Business Deduction' worksheet (p.16) computes each spouse's MISSOURI-SOURCE business income (Schedule C line 31, Schedule E line 32, Schedule F/Form 4835 profits, netting business losses — a combined net loss gives $0) MINUS agricultural disaster relief payments already subtracted on MO-A line 16 (no double-count) and line 6 = 'Multiply Line 5 by 20%. Enter on Form MO-A, Part 1, Line 17.' Computed PER SPOUSE on combined returns (17Y/17S). This is an income SUBTRACTION (reduces Missouri AGI), stacking with the NEW H.B. 594 100% capital-gain subtraction (MO-A line 18) — business capital gains subtracted at line 18 should not double-count in the line 17 worksheet base. [Input: moBusinessIncome = ONE spouse's net business income per the worksheet (before the 20%).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfBusinessIncome: { value: "20", type: "int" },
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "max0", arg: fact("moBusinessIncome") },
      rate: { num: "20", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.mo.parameters",
    version: 1,
    jurisdiction: "us.mo",
    title:
      "Missouri 2025 return parameters — capital-gains subtraction, standard/itemized deductions, pension/SS worksheets, income-percentage split, credits, and composition conventions (Form MO-1040)",
    citation: {
      source:
        "2025 Form MO-1040 + instructions; 2025 Forms MO-A, MO-WFTC, MO-PTS; R.S.Mo. Chapter 143 as amended by H.B. 594 (2025); DOR '2025 Individual Income Tax Year Changes'",
      section: "Form MO-1040; MO-A; Instructions pp.5-21",
      url: "https://dor.mo.gov/taxation/individual/tax-types/income/year-changes/",
      excerpt:
        "CAPITAL GAINS SUBTRACTION (NEW, H.B. 594 (2025), § 143.121 — effective for ALL tax years beginning on or after January 1, 2025; Missouri is the first state to fully exempt individual capital gains): MO-A Part 1 line 18 subtracts '100 percent of the income reported as capital gains for federal tax purposes' (the instructions point at Federal Form 1040 line 7a; the amount must be included in FAGI; 'If the amount... was negative, enter $0' — capital LOSSES still reduce FAGI with no addback, an asymmetry favoring the filer; corporations get the subtraction only after the § 143.011 top rate reaches 4.5%, NOT in 2025). TWO-COLUMN RETURN: married-filing-combined SPLITS every income item between spouses (lines 1Y/1S through 29Y/29S) — Missouri law requires splitting total FAGI between spouses; the tax chart runs per spouse. NEGATIVE-FAGI ZEROING (12 CSR 10-2.710, instructions p.6): a NEGATIVE federal AGI enters as $0 — on a combined return the negative-income spouse enters $0 and the other spouse enters the NETTED joint FAGI (example: −$10,000 / +$100,000 → line 1Y $0, line 1S $90,000); if the COMBINED FAGI is negative, BOTH spouses enter $0. LINE 7 INCOME PERCENTAGES (verbatim): each spouse's line 5 ÷ combined line 6, 'round to the nearest percentage' (84.3% → 84%, 97.5% → 98%; must total 100%); a NEGATIVE-income spouse gets 0% and the other 100%; combined deductions (line 26) are allocated by these WHOLE-percent ratios at line 27 — a real rounding step that moves up to half a percent of deductions between spouses. STANDARD DEDUCTION (line 14): Missouri uses the FEDERAL standard deduction — 2025: $15,750 single/MFS; $31,500 married filing combined/qualifying widow(er); $23,625 head of household; dependent-claimed filers use the federal dependent limit ($1,350, or $450 + earned income, up to $15,750); ADDITIONAL $2,000 per 65+/blind condition for single/HOH, $1,600 for other statuses (federal additional amounts); a federal net-qualified-disaster-loss increase carries over (paper filing, 'qualified disaster loss increase' notation). ITEMIZED (MO-A Part 2, only if itemized federally; REQUIRED if required federally, else take the larger): federal itemized total (PLUS any approved CULTURAL CONTRIBUTIONS — literary, musical, scholastic, or artistic property donations approved per § 143.141) PLUS the employee's 2025 Social Security tax (CAPPED at $10,918 per spouse), Railroad Retirement Tier I+II (capped $17,327 per spouse, net of employer refunds), Medicare tax (incl. Form 8959 adjustments), and self-employment tax (Schedule 2 line 4 − Schedule 1 line 15 + Form 8959 line 13) — Missouri ADDS payroll taxes into itemized deductions — MINUS net state income taxes (Schedule A line 5a minus KC/St. Louis EARNINGS TAXES, which stay deductible; the proration worksheet applies when SALT on line 5d exceeded $40,000/$20,000-MFS or FAGI exceeded $500,000/$250,000-MFS or Forms 2555/4563/Puerto-Rico exclusions applied). LINE 15: head of household and qualifying widow(er) get a $1,400 additional exemption. OTHER DEDUCTIONS (transcribed): long-term care insurance premiums (worksheet, net of federally-deducted amounts), health care sharing ministry, active-duty military (100%, incl. National Guard/reserve annual training; NEW 2025: signing bonuses), inactive-duty military, beginning-farmer, foster parent. PENSION/SS (MO-A Part 3 → line 8): Section A public pensions (us.mo.public_pension_exemption, $47,633 cap); Section B private pensions ($6,000/spouse, reduced by the excess of (line 6 MO AGI − taxable SS) over $32,000 combined/$25,000 single-HOH-QW/$16,000 MFS); Section C = 100% of taxable Social Security (requires age 62+ by December 31 with the MO-1040 '62 and older' box, or SSD at any age — S.B. 190 (2023) removed all income limits from TY2024). FEDERAL TAX DEDUCTION → us.mo.federal_tax_deduction (35/25/15/5/0% of line 11 by combined MO AGI, capped $5,000/$10,000-combined). MILITARY RETIREMENT: 100% subtraction (MO-A line 10, separate from Part 3). 529/ABLE contributions: up to $8,000 per taxpayer ($16,000 combined). WFTC → us.mo.wftc (20% of federal EIC 2025, nonrefundable, MFS/dependent denied). PROPERTY TAX CREDIT (Form MO-PTS, line 43, refundable circuit-breaker): actual property tax up to $1,100 (owners) or 20%-of-rent credit up to $750 (renters), from the printed credit chart; NET HOUSEHOLD INCOME GATES: renters $27,200, owners $30,000 (2025) — transcribed with disclosure, the MO-PTS chart is not modeled. MISC CREDITS: Form MO-TC (line 42, transcribed; Champion for Children raised to 70% of contributions, $50,000 cap, NEW 2025). OTHER TAXES (line 34, printed checkboxes): 10% of the Federal Form 4972 lump-sum distribution tax, and recapture of the low income housing credit (Form 8611) — transcribed. (Form 4970 trust accumulation distributions are the OPPOSITE direction: an income SUBTRACTION per the Part 1 instructions, never a line 34 tax.) LOCAL: Kansas City and St. Louis each levy a 1% EARNINGS TAX on residents' earnings (and nonresidents working there) — SEPARATE city returns (Forms RD-109/E-1234), NEVER on the MO-1040; the only MO-1040 interaction is the MO-A Part 2 line 10 carve-out keeping earnings taxes in itemized deductions. USE TAX: consumer's use tax (4.225% state + local) is filed separately (no MO-1040 line). ROUNDING: whole dollars throughout. REFUND CHAIN: line 49 overpayment; 50 applied to 2026; 51 trust-fund donations; 52 MO 529 deposit (min $25); 53 refund = 49−50−51−52 (refunds ≥ $100,000 must be direct-deposited); 54 underpayment = 36−45; 55 Form MO-2210 penalty (90% / 66⅔%-farmer safe harbors); 56 = 54+55. FILING THRESHOLD (instructions p.3): a resident with less than $1,200 of Missouri AGI need not file ($600 for nonresidents; also no filing when Missouri AGI is under the standard deduction and no special situations apply) — distinct from the tax chart's $1,313 zero bracket; filing is still required to refund withholding. Part-year/nonresident (MO-NRI/MO-CR percentage and other-state credit, lines 31-32) are NOT composed — transcribed with disclosure.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingleMfs: { value: "1575000", type: "money" }, // $15,750
      standardDeductionCombinedQw: { value: "3150000", type: "money" }, // $31,500
      standardDeductionHoh: { value: "2362500", type: "money" }, // $23,625
      additionalStdDedSingleHohPerCondition: { value: "200000", type: "money" }, // $2,000
      additionalStdDedOtherPerCondition: { value: "160000", type: "money" }, // $1,600
      hohQwAdditionalExemption: { value: "140000", type: "money" }, // $1,400 (line 15)
      capitalGainsSubtractionPct: { value: "100", type: "int" }, // H.B. 594 (2025)
      plan529LimitPerTaxpayer: { value: "800000", type: "money" }, // $8,000 ($16,000 combined)
      ptcMaxOwners: { value: "110000", type: "money" }, // $1,100
      ptcMaxRenters: { value: "75000", type: "money" }, // $750
      ptcIncomeGateRenters: { value: "2720000", type: "money" }, // $27,200
      ptcIncomeGateOwners: { value: "3000000", type: "money" }, // $30,000
      earningsTaxRatePct: { value: "1", type: "int" }, // KC / St. Louis (separate returns)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Missouri composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.mo.income_tax, us.mo.federal_tax_deduction, us.mo.public_pension_exemption, us.mo.wftc, us.mo.business_income_deduction",
    },
  },
];
