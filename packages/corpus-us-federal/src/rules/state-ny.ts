import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money, printedSchedule, ruleRef } from "./state-helpers.js";

export const nyRules: Rule[] = [
  {
    id: "us.ny.parameters",
    version: 7, // v2 had the credit/modification set with an IT-216 shorthand and only tables 1/2/5; v3 adds the full six household-credit tables, the verbatim IT-216 factor tables, IT-272, 529, pension exclusion, § 685(c), and IT-196; v4 wrongly claimed IT-214's adjusted-rent line has no fixed percentage table; v6 replaces the ambiguous NYC child-care proration shorthand with the verbatim Worksheet 2 order and points at us.ny.nyc_cdcc; v7 CORRECTS IT-214 line 12 to the printed form's FIXED PERCENTAGE MENU (50/75/80/85/100 by included services) and routes the whole Step 3-5 arithmetic to us.ny.it214 v2; v5 had corrected the flat Table A/B credit lookup mechanic (Form IT-214 (2025), IT-214-I (2025), web-verified July 2026): the credit is NOT 25%-of-rent scaled into a dollar amount — lines 8-19 (FAGI cap, line-9 rate x line-10, adjusted rent, the line-14 25% conversion, $450/month cap) are an ELIGIBILITY GATE ONLY; the credit itself (line 20) is a FLAT lookup from Table A (65+) / Table B (under 65) by FAGI bracket, now its own computable target us.ny.it214
    jurisdiction: "us.ny",
    title: "New York 2025 standard deductions (Tax Law § 614 — statutory, unindexed)",
    citation: {
      source: "N.Y. Tax Law § 614; 2025 Form IT-201 instructions",
      section: "Tax Law § 614",
      url: "https://www.tax.ny.gov/pit/file/standard_deductions.htm",
      excerpt:
        "Standard deductions (Tax Law § 614, 2025-confirmed): $8,000 single; $16,050 MFJ/QSS; $11,200 HOH; $8,000 MFS; $3,100 dependent filer. Dependent exemptions $1,000 each (IT-201 line 36). CREDITS & MODIFICATIONS (all web-verified from the 2025 IT-201-I / IT-213-I / IT-215-I / IT-216-I / IT-214-I / IT-225-I / IT-272-I / IT-196-I): NYS EIC = 30% of federal EIC, reduced by the household credit ACTUALLY ABSORBED against NYS tax (min(line 39 tax, household credit) — when tax is $0 the reduction is $0 and the full 30% is refundable; IT-215 worksheet). NYC EIC = federal EIC × a sliding NYAGI rate: 30% ≤ $7,500; 25% flat $7,500–$15,000; phasing 25→20% to $17,500; 20% to $20,000; phasing 20→15% to $22,500; 15% to $40,000; phasing 15→10% to $42,500; 10% above. EMPIRE STATE CHILD CREDIT 2025 (IT-213, decoupled from federal): $1,000 per qualifying child UNDER FOUR + $330 per child 4–16 (TY2025; rises to $500 for the under-4 group's OLDER siblings — the ESCC ages-4-16 amount is $500 for TY2026-27 only, not yet in effect for TY2025), reduced $16.50 per $1,000 of FAGI (rounded DOWN to the nearest $1,000) over $110,000 MFJ / $75,000 single-HOH-QSS / $55,000 MFS."
        + "\n\nNYS HOUSEHOLD CREDIT (IT-201 line 40, IT-201-I p.13, keyed to FEDERAL AGI = Form IT-201 line 19) — THREE TABLES, verbatim 2025:\n"
        + "Table 1 (single only): FAGI over –$5,000 → $75; $5,000–$6,000 → $60; $6,000–$7,000 → $50; $7,000–$20,000 → $45; $20,000–$25,000 → $40; $25,000–$28,000 → $20; over $28,000 → no credit.\n"
        + "Table 2 (MFJ/HOH/QSS), by (dependents + 1 for filer + 1 for spouse if MFJ) = 1/2/3/4/5/6/7/each-over-7: FAGI –$5,000 → 90/105/120/135/150/165/180/+15; $5,000–$6,000 → 75/90/105/120/135/150/165/+15; $6,000–$7,000 → 65/80/95/110/125/140/155/+15; $7,000–$20,000 → 60/75/90/105/120/135/150/+15; $20,000–$22,000 → 60/70/80/90/100/110/120/+10; $22,000–$25,000 → 50/60/70/80/90/100/110/+10; $25,000–$28,000 → 40/45/50/55/60/65/70/+5; $28,000–$32,000 → 20/25/30/35/40/45/50/+5; over $32,000 → no credit.\n"
        + "Table 3 (MFS only, dependents from BOTH returns + 1 for self + 1 for spouse), same 1-7/+over-7 columns: FAGI –$5,000 → 45/53/60/68/75/83/90/+8; $5,000–$6,000 → 38/45/53/60/68/75/83/+8; $6,000–$7,000 → 33/40/48/55/63/70/78/+8; $7,000–$20,000 → 30/38/45/53/60/68/75/+8; $20,000–$22,000 → 30/35/40/45/50/55/60/+5; $22,000–$25,000 → 25/30/35/40/45/50/55/+5; $25,000–$28,000 → 20/23/25/28/30/33/35/+3; $28,000–$32,000 → 10/13/15/18/20/23/25/+3; over $32,000 → no credit (table 3 amounts are pre-rounded per the form's Note 5).\n"
        + "\nNYC HOUSEHOLD CREDIT (line 48, IT-201-I p.14) — THREE TABLES, verbatim 2025:\n"
        + "Table 4 (single only): FAGI –$10,000 → $15; $10,000–$12,500 → $10; over $12,500 → no credit.\n"
        + "Table 5 (MFJ/HOH/QSS), 1/2/3/4/5/6/7/each-over-7: FAGI –$15,000 → 30/60/90/120/150/180/210/+30; $15,000–$17,500 → 25/50/75/100/125/150/175/+25; $17,500–$20,000 → 15/30/45/60/75/90/105/+15; $20,000–$22,500 → 10/20/30/40/50/60/70/+10; over $22,500 → no credit.\n"
        + "Table 6 (MFS only, dependents both returns + self + spouse), 1/2/3/4/5/6/7/each-over-7: FAGI –$15,000 → 15/30/45/60/75/90/105/+15; $15,000–$17,500 → 13/25/38/50/63/75/88/+13; $17,500–$20,000 → 8/15/23/30/38/45/53/+8; $20,000–$22,500 → 5/10/15/20/25/30/35/+5; over $22,500 → no credit (pre-rounded, Note 5)."
        + "\n\nIT-216 CDCC (2025 IT-216-I, verbatim factor tables — replaces the earlier '1.10 ≤ $25k' shorthand): base = qualifying expenses NET of employer dependent-care benefits excluded on W-2 box 10. NYS LINE-13 FACTOR (NYAGI-keyed, NON-MONOTONIC SAWTOOTH, IT-216-I p.7 'credit limitation table', $200-wide rows — segment anchors verbatim): flat 1.100 for NYAGI –$25,000; descends in small ($0.001–$0.002-per-$200) steps from 1.099 at $25,000 down to 1.000 by $40,000; FLAT 1.000 for $40,000–$50,000; JUMPS to 1.162 at $50,000 and descends to 1.000 by $52,600–$52,800, continuing down to 0.601 by $59,800–$60,000; JUMPS AGAIN to 1.070 at $60,000 and descends to 0.476 by $64,800–$65,000; FLAT 0.600 for $65,000–$150,000; FLAT 0.200 above $150,000. NYS LINE-10 FACTOR (separate table, FAGI-keyed, monotonic): .35 for FAGI –$15,000, stepping down by .01 per $2,000 of FAGI to .20 at $43,000 and above (verbatim anchors: $15,000–$17,000 → .34 … $41,000–$43,000 → .21; $43,000+ → .20). NYC CHILD CARE CREDIT (Worksheet 2 — now a standalone computable target, us.ny.nyc_cdcc): requires a qualifying child UNDER 4 and FAGI $30,000 or less; the worksheet PRORATES THE NYS CREDIT ITSELF (IT-216 line 14 → Worksheet 2 line 1) by the under-4 expense share (line 23 ÷ line 3a, capped at 1.0000), THEN multiplies by the line-6 FAGI factor (0.750 for FAGI –$25,000, descending 0.030 per $200 to 0.000 at $30,000). NEVER prorate the raw expenses and re-apply the line-10/line-13 factors — that understates the credit; feed nyIt216StateCredit/nyIt216Under4Expenses/nyIt216TotalExpenses to us.ny.nyc_cdcc and use its answer."
        + "\n\nNYC SCHOOL TAX CREDIT fixed (line 69, income ≤ $250,000): $63 single/MFS/HOH, $125 MFJ/QSS; plus the line 69a rate-reduction amount (≤ $500,000): HOH 0.171% of city taxable income to $14,400 then $25 + 0.228% of excess (single/MFS threshold $12,000/$21; MFJ $21,600/$37). IT-214 REAL PROPERTY TAX CREDIT (Form IT-214 (2025), read directly from the printed form — SECOND CORRECTION, July 2026: line 12 uses a FIXED PERCENTAGE MENU, not actual utility dollar subtraction): line 8 FAGI ≤ $18,000 stop; line 12 adjusted rent = line 11 total rent x the printed menu — rent includes heat+gas+electricity+furnishings+board → 50%; heat+gas+electricity+furnishings → 75%; heat+gas+electricity → 80%; heat (or heat+gas) → 85%; none → 100%; line 13 average monthly adjusted rent (line 12 ÷ months paid) ≤ $450 stop; line 14 = 25% x line 12; homeowners line 17 = property taxes + special assessments; line 18 (renters' 14 / homeowners' 17) must be positive and must EXCEED line 19 = FAGI x Table 1 rate (0.035 to 0.065 by FAGI bracket). THE CREDIT (line 20) is a FLAT Table A/B lookup by FAGI. ALL of this arithmetic is COMPUTED by us.ny.it214 — feed it nyIt214Fagi, nyIt214TotalRent, nyIt214RentPercent (50/75/80/85/100 from the checkbox menu), nyIt214MonthsPaid, nyIt214HomeownerTaxes, isAge65OrOlder (any household member 65+ routes to Table A: $375/$330/$300/$260/$230/$200/$150), and nyIt214Eligible (Step 2 attestations only). Pass its answer into refundableCredits; never hand-compute any IT-214 line."
        + "\n\nIT-272 COLLEGE TUITION CREDIT (2025 IT-272-I): full-year NYS RESIDENTS only (part-year and nonresidents cannot claim it); qualified tuition expenses CAPPED at $10,000 per eligible student; credit = the LESSER of $400 or 4% of qualified expenses PER STUDENT (so the $400 max binds at $10,000 of expenses — confirm the 4% literal rate on the current worksheet before treating it as fixed across years); taxpayers may instead claim the college tuition ITEMIZED DEDUCTION on IT-201-D — mutually exclusive per student, elect whichever is larger."
        + "\n\nIT-229 REAL PROPERTY TAX RELIEF CREDIT: EXPIRED after TY2023 — DOES NOT EXIST for TY2025 or TY2026; do not encode or claim it. IT-214 (circuit breaker: FAGI ≤ $18,000, property value ≤ $85,000, rent ≤ $450/month) is the live real-property-tax credit for TY2025."
        + "\n\n529 COLLEGE SAVINGS SUBTRACTION (Tax Law § 612(c)(32)): up to $5,000 single/HOH/MFS, $10,000 MFJ, of contributions to a New York 529 account per year (recapture applies to nonqualified withdrawals of previously subtracted amounts). PENSION AND ANNUITY EXCLUSION (Tax Law § 612(c)(3-a)): up to $20,000 EACH for taxpayer and spouse (no spousal sharing of unused exclusion) once age 59½, for private/out-of-state pensions and annuities; NYS/local government and federal government pensions are excluded IN FULL regardless of age (a separate, unlimited subtraction, not capped at $20,000)."
        + "\n\n§ 685(c) ESTIMATED TAX: no addition to tax if the amount owed after withholding is under $300 (de minimis); safe harbor is the LESSER of 90% of the current year's tax or 100% of the prior year's tax (110% of prior year's tax if the prior year's NYAGI exceeded $150,000)."
        + "\n\nIT-196 ITEMIZED CHARITABLE LIMITATION (Tax Law § 615, active through TY2029 per current law): for taxpayers with NYAGI over $1,000,000, the itemized charitable contribution deduction is limited to 50% of the federal amount; over $10,000,000 NYAGI, limited to 25% of the federal amount. UNRESOLVED (do NOT encode): the broader § 615(f) general itemized-deduction phase-down for high-NYAGI filers could not be reconciled against the 2025 IT-196 instructions worksheet during this web-verification — pull the actual worksheet before modeling it; only the $1M/$10M charitable-specific limitation above is confirmed active."
        + "\n\nIT-225 MODIFICATIONS: § 414(h) public-employee pickup = addition on IT-201 line 21 directly (code A-104, NOT via IT-225); NYC IRC § 125 flexible-benefits = addition A-101; ALIMONY (NY did NOT conform to TCJA § 11051): post-2018-instrument alimony PAID = subtraction S-136, alimony RECEIVED = addition A-119. S-120 — New York Higher Education Loan Program (HELP) loan interest (2025 IT-225-I p.6 subtraction-modifications chart and detail section, applicable to IT-201/IT-203 filers, not IT-204/IT-205), quoted verbatim: chart entry 'S-120  New York Higher Education Loan Program (HELP)'; detail text 'S-120: New York Higher Education Loan Program (HELP) — Enter any interest you paid in 2025 on loans made to you under HELP.' STATUTE CITE UNRESOLVED: the IT-225-I chart/detail text does not itself cite a Tax Law § 612(c) paragraph number for S-120 (unlike some neighboring codes), and a web search of the codified § 612 (nysenate.gov) did not turn up a matching paragraph as of this July 2026 verification — treat the CODE as confirmed-current for TY2025 via the 2025 IT-225-I form itself (the authority cited here), with the enabling paragraph number unresolved rather than guessed. Do not confuse with the separate, prospective, general student-loan-interest deduction tracked for a future Tax Law § 612(c) paragraph (TY2026+, following 26 U.S.C. § 221) — that is a different, not-yet-effective provision and does not affect the TY2025 S-120 answer."
        + "\n\nTY2026 ENACTED CHANGES (not encoded this pass — informational only, so a 2026 asOf refusal has useful context): a new subtraction for tips (up to $25,000, OBBBA conformity) begins TY2026; a new 'POWER credit' applies for TY2026 ONLY; a new REFUNDABLE CDCC under § 606(c-2) replaces the nonrefundable IT-216 coupling for TY2026+ (55% of federal CDCC at NYAGI ≤ $15,000, phasing down to a 4% floor, reduced further above $750,000 NYAGI); the Empire State Child Credit's $330 per-child (age 4-16) amount rises to $500 for TY2026-2027. Brackets, IT-272, the 529 subtraction, the household-credit tables, and IT-214 are UNCHANGED for TY2026 per the sources reviewed. Tax computation → us.ny.income_tax; NYC resident tax → us.ny.nyc_income_tax.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingle: { value: "800000", type: "money" }, // $8,000
      standardDeductionJoint: { value: "1605000", type: "money" }, // $16,050
      standardDeductionHoh: { value: "1120000", type: "money" }, // $11,200
      dependentExemption: { value: "100000", type: "money" }, // $1,000
      nysEicPctOfFederal: { value: "30", type: "int" },
      esccPerChildUnder4: { value: "100000", type: "money" }, // $1,000 (2025)
      esccPerChild4to16: { value: "33000", type: "money" }, // $330 (2025; $500 for 2026-27)
      esccReductionPer1000: { value: "1650", type: "money" }, // $16.50
      esccThresholdJoint: { value: "11000000", type: "money" }, // $110,000
      esccThresholdSingleHohQss: { value: "7500000", type: "money" }, // $75,000
      esccThresholdMfs: { value: "5500000", type: "money" }, // $55,000
      it216LowIncomeFactorPct: { value: "110", type: "int" }, // NYAGI ≤ $25,000 (flat segment only; see excerpt for the full sawtooth)
      schoolTaxCreditFixedSingle: { value: "6300", type: "money" }, // $63
      schoolTaxCreditFixedJoint: { value: "12500", type: "money" }, // $125
      it214MaxUnder65: { value: "7500", type: "money" }, // $75
      it214Max65Plus: { value: "37500", type: "money" }, // $375
      it214FagiLimit: { value: "1800000", type: "money" }, // $18,000
      it272MaxCreditPerStudent: { value: "40000", type: "money" }, // $400
      it272ExpenseCapPerStudent: { value: "1000000", type: "money" }, // $10,000
      section529SubtractionSingle: { value: "500000", type: "money" }, // $5,000
      section529SubtractionJoint: { value: "1000000", type: "money" }, // $10,000
      pensionExclusionPerPerson: { value: "2000000", type: "money" }, // $20,000 each, age 59½+
      estimatedTaxDeMinimis: { value: "30000", type: "money" }, // $300
      estimatedTaxSafeHarborPctCurrent: { value: "90", type: "int" },
      estimatedTaxSafeHarborPctPrior: { value: "100", type: "int" },
      estimatedTaxSafeHarborPctPriorHighIncome: { value: "110", type: "int" }, // prior NYAGI > $150,000
      estimatedTaxHighIncomeThreshold: { value: "15000000", type: "money" }, // $150,000
      it196CharitableThreshold1M: { value: "100000000", type: "money" }, // $1,000,000 NYAGI
      it196CharitableThreshold10M: { value: "1000000000", type: "money" }, // $10,000,000 NYAGI
      it196CharitablePctOver1M: { value: "50", type: "int" },
      it196CharitablePctOver10M: { value: "25", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: use lookup_tax_parameter for the NY amounts; NYS tax → us.ny.income_tax, NYC resident tax → us.ny.nyc_income_tax; credits are agent-composed from the cited tables",
    },
  },
  {
    id: "us.ny.it214",
    version: 2, // v1 modeled lines 9-19 as agent-attested only, and wrongly claimed line 12 subtracts ACTUAL utility dollar charges; v2 (2025 Form IT-214 read directly, July 2026) encodes the printed line-12 FIXED PERCENTAGE menu and computes the whole Step 4/Step 5 gate chain (lines 8-19) in the engine
    jurisdiction: "us.ny",
    title: "New York IT-214 Real Property Tax Credit — full Step 3-5 computation with the printed line-12 percentage menu (Form IT-214 line 20, 2025)",
    citation: {
      source: "Form IT-214 (2025); Form IT-214-I (2025 instructions); Tax Law § 606(e)",
      section: "IT-214 lines 8-20; Table 1, Table A, Table B",
      url: "https://www.tax.ny.gov/pdf/current_forms/it/it214_fill_in.pdf",
      excerpt:
        "2025 Form IT-214, transcribed verbatim from the printed form (July 2026 — CORRECTS the earlier claim that line 12 subtracts actual utility dollar charges; the printed form uses a FIXED PERCENTAGE MENU): Step 4, line 11 'Enter the total amount of rent you paid during 2025. (Do not include any subsidized part of your rental charge.)'; line 12 'Adjusted rent - If line 11 includes charges for: heat, gas, electricity, furnishings, and board ... 50% (0.5) of line 11; heat, gas, electricity, and furnishings ... 75% (0.75) of line 11; heat, gas, and electricity ... 80% (0.8) of line 11; heat or heat and gas ... 85% (0.85) of line 11; none of the above ... 100% of line 11'; line 13 'Average monthly adjusted rent (divide line 12 by the number of months you paid rent) ... If line 13 is more than $450, stop; you do not qualify for this credit'; line 14 'Multiply line 12 by 25% (0.25); enter here and on line 18'; homeowners: line 15 real property taxes paid + line 16 special assessments = line 17. Step 5: line 18 = renters' line 14 / homeowners' line 17 ('If line 18 is zero or less, stop; no credit is allowed'); line 19 = line 10 = line 8 FAGI x the Table 1 rate ('If line 19 is equal to or more than line 18, stop; you do not qualify'); line 8 gate 'If line 8 is more than $18,000, stop'. TABLE 1 (rate by FAGI): $0-3,000 → 0.035; 3,001-5,000 → 0.040; 5,001-7,000 → 0.045; 7,001-9,000 → 0.050; 9,001-11,000 → 0.055; 11,001-14,000 → 0.060; 14,001-18,000 → 0.065. LINE 20 is a FLAT DOLLAR LOOKUP: TABLE A (line 7 entry — ANY filer/spouse/dependent age 65 or older routes the WHOLE household to Table A): FAGI $0-3,000 → $375; 3,001-5,000 → $330; 5,001-7,000 → $300; 7,001-9,000 → $260; 9,001-11,000 → $230; 11,001-14,000 → $200; 14,001-18,000 → $150. TABLE B (no line 7 entry): $0-5,000 → $75; 5,001-9,000 → $70; 9,001-14,000 → $60; 14,001-18,000 → $50. THIS RULE COMPUTES lines 8-20 from: nyIt214Fagi (line 8), nyIt214TotalRent (line 11), nyIt214RentPercent (the printed 50/75/80/85/100 menu choice from the included-services checkboxes), nyIt214MonthsPaid (line 13 divisor), nyIt214HomeownerTaxes (line 17 = taxes + special assessments), isAge65OrOlder (Table A/B routing), and nyIt214Eligible (the NON-ARITHMETIC gates only: 6+ month same-residence occupancy, full-year NYS residency, not claimable as a dependent, market value ≤ $85,000, not completely tax-exempt housing/public housing, nursing-home disclosure). A part-year owner/renter adds both buckets into line 18 (1999-lineage instruction: 'add 25% of your adjusted rent paid to the prorated part' of homeowner charges). Pass this rule's answer into the state composer's refundableCredits (composeNY).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      fagiLimit: { value: "1800000", type: "money" }, // $18,000
      monthlyRentCap: { value: "45000", type: "money" }, // $450 line-13 average monthly adjusted rent cap
      tableAThreshold1: { value: "300000", type: "money" }, // $3,000
      tableAValue1: { value: "37500", type: "money" }, // $375
      tableAThreshold2: { value: "500000", type: "money" }, // $5,000
      tableAValue2: { value: "33000", type: "money" }, // $330
      tableAThreshold3: { value: "700000", type: "money" }, // $7,000
      tableAValue3: { value: "30000", type: "money" }, // $300
      tableAThreshold4: { value: "900000", type: "money" }, // $9,000
      tableAValue4: { value: "26000", type: "money" }, // $260
      tableAThreshold5: { value: "1100000", type: "money" }, // $11,000
      tableAValue5: { value: "23000", type: "money" }, // $230
      tableAThreshold6: { value: "1400000", type: "money" }, // $14,000
      tableAValue6: { value: "20000", type: "money" }, // $200
      tableAValue7: { value: "15000", type: "money" }, // $150 ($14,001-$18,000, uses fagiLimit as its threshold)
      tableBThreshold1: { value: "500000", type: "money" }, // $5,000
      tableBValue1: { value: "7500", type: "money" }, // $75
      tableBThreshold2: { value: "900000", type: "money" }, // $9,000
      tableBValue2: { value: "7000", type: "money" }, // $70
      tableBThreshold3: { value: "1400000", type: "money" }, // $14,000
      tableBValue3: { value: "6000", type: "money" }, // $60
      tableBValue4: { value: "5000", type: "money" }, // $50 ($14,001-$18,000, uses fagiLimit as its threshold)
    },
    formula: (() => {
      const param = (name: string): Expr => ({ kind: "param", name });
      const fagi = fact("nyIt214Fagi");
      // Step 4 — line 12 adjusted rent = line 11 x the printed percentage menu choice
      const adjustedRent: Expr = {
        kind: "mulDiv",
        a: { kind: "max0", arg: fact("nyIt214TotalRent") },
        b: { kind: "mulInt", base: money("1"), count: fact("nyIt214RentPercent") },
        c: money("100"),
        round: "half-up",
      };
      // line 13 average monthly adjusted rent = line 12 / months paid
      const avgMonthlyRent: Expr = {
        kind: "mulDiv",
        a: adjustedRent,
        b: money("1"),
        c: { kind: "max", args: [money("1"), { kind: "mulInt", base: money("1"), count: fact("nyIt214MonthsPaid") }] },
        round: "half-up",
      };
      // line 14 = 25% of line 12; line 18 = renters' line 14 + homeowners' line 17
      const line14: Expr = {
        kind: "mulRate",
        base: adjustedRent,
        rate: { num: "25", den: "100" },
        round: "half-up",
      };
      const line18: Expr = {
        kind: "add",
        args: [line14, { kind: "max0", arg: fact("nyIt214HomeownerTaxes") }],
      };
      // line 10/19 = FAGI x the Table 1 rate (thousandths via mulDiv)
      const table1Rate = (perMille: string, threshold: string, next: Expr): Expr => ({
        kind: "if",
        cond: { kind: "cmp", op: "le", left: fagi, right: money(threshold) },
        then: { kind: "mulDiv", a: fagi, b: money(perMille), c: money("1000"), round: "half-up" },
        else: next,
      });
      const line19: Expr = table1Rate("35", "300000",
        table1Rate("40", "500000",
          table1Rate("45", "700000",
            table1Rate("50", "900000",
              table1Rate("55", "1100000",
                table1Rate("60", "1400000",
                  { kind: "mulDiv", a: fagi, b: money("65"), c: money("1000"), round: "half-up" }))))));
      const tableA: Expr = {
        kind: "if",
        cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold1") },
        then: param("tableAValue1"),
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold2") },
          then: param("tableAValue2"),
          else: {
            kind: "if",
            cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold3") },
            then: param("tableAValue3"),
            else: {
              kind: "if",
              cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold4") },
              then: param("tableAValue4"),
              else: {
                kind: "if",
                cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold5") },
                then: param("tableAValue5"),
                else: {
                  kind: "if",
                  cond: { kind: "cmp", op: "le", left: fagi, right: param("tableAThreshold6") },
                  then: param("tableAValue6"),
                  else: {
                    kind: "if",
                    cond: { kind: "cmp", op: "le", left: fagi, right: param("fagiLimit") },
                    then: param("tableAValue7"),
                    else: money("0"),
                  },
                },
              },
            },
          },
        },
      };
      const tableB: Expr = {
        kind: "if",
        cond: { kind: "cmp", op: "le", left: fagi, right: param("tableBThreshold1") },
        then: param("tableBValue1"),
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "le", left: fagi, right: param("tableBThreshold2") },
          then: param("tableBValue2"),
          else: {
            kind: "if",
            cond: { kind: "cmp", op: "le", left: fagi, right: param("tableBThreshold3") },
            then: param("tableBValue3"),
            else: {
              kind: "if",
              cond: { kind: "cmp", op: "le", left: fagi, right: param("fagiLimit") },
              then: param("tableBValue4"),
              else: money("0"),
            },
          },
        },
      };
      return {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            { kind: "not", arg: fact("nyIt214Eligible") },
            { kind: "cmp", op: "gt", left: fagi, right: param("fagiLimit") }, // line 8 stop
            { kind: "cmp", op: "gt", left: avgMonthlyRent, right: param("monthlyRentCap") }, // line 13 stop
            { kind: "cmp", op: "le", left: line18, right: money("0") }, // line 18 stop
            { kind: "cmp", op: "ge", left: line19, right: line18 }, // line 19 stop
          ],
        },
        then: money("0"),
        else: {
          kind: "if",
          cond: fact("isAge65OrOlder"),
          then: tableA,
          else: tableB,
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ny.nyc_cdcc",
    version: 1,
    jurisdiction: "us.ny",
    title: "New York City child and dependent care credit — IT-216 Worksheet 2 (Form IT-216 line 24, 2025)",
    citation: {
      source: "N.Y.C. Admin. Code § 11-1706(d); Form IT-216-I (2025 instructions), Worksheet 2 (p.6) and the New York City child and dependent care credit limitation table (p.7)",
      section: "IT-216-I Worksheet 2; IT-216 lines 23-24",
      url: "https://www.tax.ny.gov/pdf/current_forms/it/it216i.pdf",
      excerpt:
        "2025 IT-216-I Worksheet 2, verbatim: 'Caution: If your FAGI is over $30,000 ... or you have no children under 4 years old, stop; you do not qualify for the New York City child and dependent care credit.' Line 1 'Amount from line 14 on Form IT-216' [the NYS child and dependent care credit — NOT the raw expenses]; line 2 'Amount from line 23 on Form IT-216' [expenses for qualifying persons under 4]; line 3 'Amount from line 3a on Form IT-216' [total qualified expenses]; line 4 'Divide line 2 by line 3 (round the result to the fourth decimal place). This amount cannot exceed 100% (1.0000)'; line 5 'Multiply line 1 by line 4'; line 6 'Enter decimal amount as shown in the New York City child and dependent care credit limitation table' [FAGI-keyed, from IT-201 line 19: 0.750 for FAGI up to $25,000, then descending 0.030 per $200 row — $25,000-25,200 → 0.735 ... $29,800-30,000 → 0.015; over $30,000 → 0.000]; line 7 'Multiply line 5 by line 6. Full-year New York City residents: Enter the line 7 amount on Form IT-216, line 24.' Line-6 instruction note: 'The New York City child and dependent care credit can be as much as 75% of the New York State child and dependent care credit.' THE PRORATION APPLIES TO THE STATE CREDIT (line 14), NEVER TO THE EXPENSES — computing under-4 expenses x the line-10/line-13 factors directly understates the credit whenever the state factors differ from a pure expense scaling. This rule evaluates lines 4-5 as an exact credit x under4 / total product (single cent rounding) rather than a pre-rounded 4-decimal ratio — divergence from the printed 4-decimal intermediate is under one cent per $200 of state credit, sub-dollar in all realistic cases. Part-year NYC residents (Worksheet 2 lines 8-13, IT-360.1 proration) are NOT modeled — full-year NYC residents only; the part-year split must be worked by hand per the worksheet. Validity: TY2025 instructions (rev. Oct 2025), web-verified July 2026; the 0.750-to-0 factor table and $30,000 cap are unchanged from prior years.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      fagiFlatCeiling: { value: "2500000", type: "money" }, // $25,000 — flat 0.750 at or below
      fagiCutoff: { value: "3000000", type: "money" }, // $30,000 — no credit above
      rowWidthCents: { value: "20000", type: "int" }, // $200 factor-table rows
      flatFactorPerMille: { value: "750", type: "int" }, // 0.750
      anchorPerMille: { value: "765", type: "int" }, // 0.765 - 0.030 x row index reproduces 0.735, 0.705, ... 0.015
      stepPerMille: { value: "30", type: "int" }, // 0.030 per $200 row
    },
    formula: (() => {
      const stateCredit: Expr = { kind: "max0", arg: fact("nyIt216StateCredit") };
      const under4: Expr = { kind: "max0", arg: fact("nyIt216Under4Expenses") };
      const total: Expr = { kind: "max0", arg: fact("nyIt216TotalExpenses") };
      const fagi: Expr = ruleRef("us.federal.agi");
      // Worksheet 2 lines 4-5: state credit x (under-4 share, capped at 100%)
      const line5: Expr = {
        kind: "min",
        args: [
          { kind: "mulDiv", a: stateCredit, b: under4, c: total, round: "half-up" },
          stateCredit,
        ],
      };
      // $200 rows above $25,000, ceiling-aligned: $25,000.01-25,200 is row 1
      const rowIndex: Expr = {
        kind: "stepUnits",
        value: { kind: "max0", arg: { kind: "sub", left: fagi, right: { kind: "param", name: "fagiFlatCeiling" } } },
        unitCents: "20000",
        mode: "ceil",
      };
      // line 6 factor expressed in thousandths (cents scale): line 7 = line5 x factor/1000 via mulDiv
      const factorDeclining: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: money("765"),
          right: { kind: "mulInt", base: money("30"), count: rowIndex },
        },
      };
      const line7 = (factor: Expr): Expr => ({
        kind: "mulDiv",
        a: line5,
        b: factor,
        c: money("1000"),
        round: "half-up",
      });
      return {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            { kind: "cmp", op: "gt", left: fagi, right: { kind: "param", name: "fagiCutoff" } },
            { kind: "cmp", op: "le", left: under4, right: money("0") },
            { kind: "cmp", op: "le", left: total, right: money("0") },
          ],
        },
        then: money("0"),
        else: {
          kind: "roundToDollar",
          mode: "half-up",
          value: {
            kind: "if",
            cond: { kind: "cmp", op: "le", left: fagi, right: { kind: "param", name: "fagiFlatCeiling" } },
            then: line7(money("750")),
            else: line7(factorDeclining),
          },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ny.income_tax",
    version: 2, // v1 used the $50-bracket-midpoint table unconditionally below $65,000; v2 adds the useFormulaMethod toggle (raw-schedule evaluation, bypassing the table) and documents the DOM-verified table match / third-party raw-schedule divergence
    jurisdiction: "us.ny",
    title: "New York State income tax — 2025 rate schedules with the NYS Tax Table convention (IT-201 line 39)",
    citation: {
      source: "N.Y. Tax Law § 601; 2025 IT-201-I pp.33-39 (rate schedules, tax table, worksheets)",
      section: "Tax Law § 601; IT-201-I line 39",
      url: "https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf",
      excerpt:
        "2025 NYS rate schedules (IT-201-I p.33): SINGLE/MFS 4% to $8,500; $340+4.5% to $11,700; $484+5.25% to $13,900; $600+5.5% to $80,650; $4,271+6% to $215,400; $12,356+6.85% to $1,077,550; 9.65/10.3/10.9% above. MFJ/QSS 4% to $17,150; $686+4.5% to $23,600; $976+5.25% to $27,900; $1,202+5.5% to $161,550; $8,553+6% to $323,200; $18,252+6.85% above. HOH 4% to $12,800; $512+4.5% to $17,650; $730+5.25% to $20,900; $901+5.5% to $107,650; $5,672+6% to $269,300; $15,371+6.85% above. METHOD (line 39 instructions): taxable income under $65,000 uses the NYS TAX TABLE ($50 brackets at the midpoint — inferred from published rows, e.g. $13–$25 → $1 = 4% × $19 rounded; rows under $50 are narrower, divergence ≤ $1); $65,000+ uses the rate schedule (whole-dollar). THIS RULE REFUSES when taxable income exceeds $107,650 — and CAUTION: the supplemental-tax RECAPTURE worksheets key on NYAGI (line 33) > $107,650 even when taxable income is lower; if NYAGI > $107,650, compute via the IT-201-I pp.34-39 worksheets yourself and disclose."
        + "\n\nTABLE-VS-FORMULA DIVERGENCE NOTE (July 2026 DOM-verification): this rule's $50-bracket-midpoint TABLE method reproduces the OFFICIAL 2025 NYS Tax Table EXACTLY across all 1,302 rows (all three filing-status columns, $0-$65,000 — parsed directly from tax.ny.gov/pit/file/tax-tables/it201i-2025.htm, 'the 2025 New York State Tax Table'). Some third-party reference implementations instead evaluate the continuous rate schedule at the RAW income value (not the bracket midpoint) below $65,000, which can differ from the official table by up to $1 (e.g. NYTI $1,949: raw-schedule 4%×1,949=$77.96→$78 vs. this rule's/the table's $77; NYTI $10,001: raw-schedule $407.545→$408 vs. $409; NYTI $55,961 HOH: raw-schedule $2,829.355→$2,829 vs. $2,830) — those three figures do NOT appear anywhere in the official table at their brackets (checked against all 1,302 rows: zero hits). The 2025 IT-201 instructions MANDATE the table below $65,000 ('If your New York taxable income is less than $65,000, you must use the tax table') — this rule's table-midpoint default is what agrees with the official table; useFormulaMethod=true instead evaluates the raw rate schedule at the exact income value below $65,000 (matching a raw-schedule reference, for comparison only).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "6500000", type: "money" }, // $65,000
      recaptureThreshold: { value: "10765000", type: "money" }, // $107,650 (NYAGI-keyed)
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const scheduleFor = (b: Expr, status: "single" | "mfj" | "hoh"): Expr => {
        const rows = {
          single: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "4", den: "100" } },
            { thresholdCents: "850000", fixedCents: "34000", rate: { num: "45", den: "1000" } },
            { thresholdCents: "1170000", fixedCents: "48400", rate: { num: "525", den: "10000" } },
            { thresholdCents: "1390000", fixedCents: "60000", rate: { num: "55", den: "1000" } },
            { thresholdCents: "8065000", fixedCents: "427100", rate: { num: "6", den: "100" } },
          ],
          mfj: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "4", den: "100" } },
            { thresholdCents: "1715000", fixedCents: "68600", rate: { num: "45", den: "1000" } },
            { thresholdCents: "2360000", fixedCents: "97600", rate: { num: "525", den: "10000" } },
            { thresholdCents: "2790000", fixedCents: "120200", rate: { num: "55", den: "1000" } },
          ],
          hoh: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "4", den: "100" } },
            { thresholdCents: "1280000", fixedCents: "51200", rate: { num: "45", den: "1000" } },
            { thresholdCents: "1765000", fixedCents: "73000", rate: { num: "525", den: "10000" } },
            { thresholdCents: "2090000", fixedCents: "90100", rate: { num: "55", den: "1000" } },
          ],
        };
        return printedSchedule(b, rows[status]);
      };
      const mid50: Expr = {
        kind: "add",
        args: [
          {
            kind: "mulInt",
            base: money("5000"),
            count: { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" },
          },
          money("2500"),
        ],
      };
      const byStatus = (b: Expr): Expr => ({
        kind: "if",
        cond: { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        then: scheduleFor(b, "mfj"),
        else: {
          kind: "if",
          cond: isStatus("hoh"),
          then: scheduleFor(b, "hoh"),
          else: scheduleFor(b, "single"),
        },
      });
      return {
        kind: "if",
        cond: { kind: "cmp", op: "gt", left: base, right: { kind: "param", name: "recaptureThreshold" } },
        then: {
          kind: "unsupported",
          reason:
            "NY taxable income above $107,650: the supplemental-tax recapture worksheets (IT-201-I pp.34-39, keyed to NYAGI) apply — compute via the worksheet for your filing status and disclose",
        },
        else: {
          kind: "if",
          // table method is the default below $65,000 (matches the official
          // 1,302-row table exactly, see the excerpt); useFormulaMethod=true
          // opts back to the raw rate schedule at the exact income value
          cond: {
            kind: "and",
            args: [
              { kind: "cmp", op: "lt", left: base, right: { kind: "param", name: "tableThreshold" } },
              { kind: "not", arg: fact("useFormulaMethod") },
            ],
          },
          then: {
            // printed tax-table bottom row: $0-$13 -> $0 (the generic $50-midpoint
            // fiction would otherwise charge $1 on zero income)
            kind: "if",
            cond: { kind: "cmp", op: "lt", left: base, right: money("1300") },
            then: money("0"),
            else: { kind: "roundToDollar", value: byStatus(mid50), mode: "half-up" },
          },
          else: { kind: "roundToDollar", value: byStatus(base), mode: "half-up" },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ny.nyc_income_tax",
    version: 1,
    jurisdiction: "us.ny",
    title: "New York City resident income tax — 2025 rate schedule (IT-201 line 47 base)",
    citation: {
      source: "N.Y. Tax Law §§ 1304, 1304-B; 2025 IT-201-I p.40 (NYC tax rate schedule)",
      section: "Tax Law Art. 30; IT-201-I p.40",
      url: "https://www.tax.ny.gov/pdf/current_forms/it/it201i.pdf",
      excerpt:
        "2025 NYC resident rate schedule (IT-201-I p.40, § 1304 base + § 1304-B additional combined): MFJ/QSS 3.078% to $21,600; $665+3.762% to $45,000; $1,545+3.819% to $90,000; $3,264+3.876% above. SINGLE/MFS 3.078% to $12,000; $369+3.762% to $25,000; $858+3.819% to $50,000; $1,813+3.876% above. HOH 3.078% to $14,400; $443+3.762% to $30,000; $1,030+3.819% to $60,000; $2,176+3.876% above. NYC taxable income under $65,000 uses the NYC tax table ($50-bracket midpoint convention, same caveat as the NYS table); $65,000+ uses this schedule. Input: NYC taxable income (IT-201 line 47) via stateTaxableIncome — run this target SEPARATELY from the NYS computation.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "6500000", type: "money" }, // $65,000
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const bracketsFor = (b: Expr, status: "single" | "mfj" | "hoh"): Expr => {
        const rows = {
          single: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "3078", den: "100000" } },
            { thresholdCents: "1200000", fixedCents: "36900", rate: { num: "3762", den: "100000" } },
            { thresholdCents: "2500000", fixedCents: "85800", rate: { num: "3819", den: "100000" } },
            { thresholdCents: "5000000", fixedCents: "181300", rate: { num: "3876", den: "100000" } },
          ],
          mfj: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "3078", den: "100000" } },
            { thresholdCents: "2160000", fixedCents: "66500", rate: { num: "3762", den: "100000" } },
            { thresholdCents: "4500000", fixedCents: "154500", rate: { num: "3819", den: "100000" } },
            { thresholdCents: "9000000", fixedCents: "326400", rate: { num: "3876", den: "100000" } },
          ],
          hoh: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "3078", den: "100000" } },
            { thresholdCents: "1440000", fixedCents: "44300", rate: { num: "3762", den: "100000" } },
            { thresholdCents: "3000000", fixedCents: "103000", rate: { num: "3819", den: "100000" } },
            { thresholdCents: "6000000", fixedCents: "217600", rate: { num: "3876", den: "100000" } },
          ],
        };
        return printedSchedule(b, rows[status]);
      };
      const mid50: Expr = {
        kind: "add",
        args: [
          {
            kind: "mulInt",
            base: money("5000"),
            count: { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" },
          },
          money("2500"),
        ],
      };
      const byStatus = (b: Expr): Expr => ({
        kind: "if",
        cond: { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        then: bracketsFor(b, "mfj"),
        else: {
          kind: "if",
          cond: isStatus("hoh"),
          then: bracketsFor(b, "hoh"),
          else: bracketsFor(b, "single"),
        },
      });
      return {
        kind: "if",
        cond: { kind: "cmp", op: "lt", left: base, right: { kind: "param", name: "tableThreshold" } },
        then: { kind: "roundToDollar", value: byStatus(mid50), mode: "half-up" },
        else: { kind: "roundToDollar", value: byStatus(base), mode: "half-up" },
      } as Expr;
    })(),
  },
  {
    id: "us.ny.yonkers_surcharge",
    version: 1,
    jurisdiction: "us.ny",
    title: "Yonkers resident income tax surcharge — 16.75% (IT-201 line 55, from the Yonkers worksheet)",
    citation: {
      source: "N.Y. Tax Law § 1310; 2025 IT-201-I pp.17-18 (Yonkers worksheet)",
      section: "IT-201-I p.17-18, 'Yonkers worksheet'; IT-201 line 55",
      url: "https://www.tax.ny.gov/pdf/2025/inc/it201i_2025.pdf",
      excerpt:
        "LINE NUMBER: the surcharge is entered on IT-201 LINE 55, not line 54 (line 54 is the MCTMT). Rate, quoted verbatim from the worksheet: 'n Yonkers resident tax rate (16.75%) ... o Multiply line m by line n. Enter this amount on Form IT-201, line 55.' The base (worksheet line m) is NOT simply line 46 ('net state tax') — it is a NARROWED figure, per the worksheet's own chain, quoted verbatim: 'a Amount from line 46 ... b Amount from Form IT-213 (Empire State Child Credit), line 9 ... c Amount from Form IT-214 (Real Property Tax Credit), line 20 ... d Amount from Form IT-216 (Child and Dependent Care Credit), line 14 ... e Amount from Form IT-215 (Earned Income Credit), line 16 ... f Amount from Form IT-209 (Noncustodial Parent EIC), line 32 (or 42) ... g College tuition credit (IT-272 line 5 or 7) ... h Total from lines 69 and 69a from Form IT-201 ... i Amount from Form IT-201-ATT, line 13 ... j Add lines b through i ... k STAR reconciliation amount (Form IT-119, line 3) ... l Subtract line k from line j ... m Subtract line l from line a.' In words: base = (IT-201 line 46, Total New York State taxes) MINUS (Empire State child credit + real property tax credit + child/dependent care credit + EIC + noncustodial-parent EIC + college tuition credit + IT-201 lines 69/69a + IT-201-ATT line 13 other credits, netted against the STAR reconciliation add-back). This rule takes that already-netted base as an agent-supplied fact (nyYonkersBase) — computing the full a-through-m chain from the underlying credits is out of scope here (agent-composed per the quoted worksheet). TRIGGER (quoted): 'If you were a resident of Yonkers, did you enter an amount that is more than 0 on line 46? If No, go to line 56. If Yes, complete the Yonkers worksheet below' — the surcharge is SKIPPED ENTIRELY (not merely computed as $0) when line 46 is $0; do not invoke this rule in that case. JOINT-RETURN MIXED RESIDENCY (quoted): 'If you are filing jointly ... and only one spouse was a Yonkers resident and the other spouse was a Yonkers nonresident for all of 2025: 1. Enter special condition code Y1 on Form IT-201, Item G. 2. Calculate on a separate sheet the Yonkers resident income tax surcharge on the New York State tax of the Yonkers resident as if you had filed separate federal returns... 3. Enter the amount calculated on line 55.' — nyYonkersBase must already reflect that separate-return recomputation in a mixed-residency case; not modeled further here. NOT the same as: Y-203 (Yonkers NONRESIDENT earnings tax, a different rate/base, feeds line 56) or IT-360.1 (part-year Yonkers residents, feeds line 57). Validity window: TY2025; the 16.75% rate has been stable for several years — no legislated TY2026 change found as of this web-verification (July 2026).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      ratePct: { value: "1675", type: "int" }, // 16.75% (x100 to keep as int; see rateDen)
      rateDen: { value: "10000", type: "int" },
    },
    formula: {
      kind: "mulRate",
      base: { kind: "max0", arg: fact("nyYonkersBase") },
      rate: { num: "1675", den: "10000" },
      round: "half-up",
    },
  },
];
