/**
 * The fact catalog: every input the TY2025 federal corpus can consume.
 *
 * Facts with a `default` are documented assumptions — using one is recorded
 * in the proof's assumptions list. Facts without a default MUST be provided;
 * the engine refuses to answer without them.
 */

import type { FactSpec } from "@invaro/opentax-core";
import { OCCUPATION_ENUM } from "./occupations.js";

export const FILING_STATUSES = [
  "single",
  "mfj", // married filing jointly
  "mfs", // married filing separately
  "hoh", // head of household
  "qss", // qualifying surviving spouse
] as const;

export const facts: FactSpec[] = [
  {
    id: "filingStatus",
    type: "enum",
    enumValues: [...FILING_STATUSES],
    description:
      "Filing status (26 U.S.C. § 1, § 2). One of: single, mfj, mfs, hoh, qss.",
    // no default — the engine must never guess a filing status
  },
  {
    id: "wages",
    type: "money",
    min: "0",
    description:
      "Wages, salaries, tips (Form W-2 box 1), in dollars (e.g. 50000 or \"1234.56\").",
    // no default — the engine must never guess income
  },
  {
    id: "taxableInterest",
    type: "money",
    min: "0",
    description: "Taxable interest income, in dollars.",
    default: {
      value: "0",
      rationale: "Assumed no taxable interest absent contrary input",
    },
  },
  {
    id: "isAge65OrOlder",
    type: "bool",
    description:
      "Taxpayer attained age 65 before the close of the taxable year (26 U.S.C. § 63(f)(1)).",
    default: {
      value: false,
      rationale: "Assumed under 65 absent contrary input",
    },
  },
  {
    id: "isBlind",
    type: "bool",
    description: "Taxpayer is blind at the close of the taxable year (26 U.S.C. § 63(f)(2)).",
    default: { value: false, rationale: "Assumed not blind absent contrary input" },
  },
  {
    id: "spouseIsAge65OrOlder",
    type: "bool",
    description: "Spouse attained age 65 before the close of the taxable year.",
    default: {
      value: false,
      rationale: "Assumed spouse under 65 absent contrary input",
    },
  },
  {
    id: "spouseIsBlind",
    type: "bool",
    description: "Spouse is blind at the close of the taxable year.",
    default: {
      value: false,
      rationale: "Assumed spouse not blind absent contrary input",
    },
  },
  {
    id: "isClaimedAsDependent",
    type: "bool",
    description:
      "Taxpayer can be claimed as a dependent on another taxpayer's return (26 U.S.C. § 63(c)(5)).",
    default: {
      value: false,
      rationale: "Assumed not claimable as a dependent absent contrary input",
    },
  },
  {
    id: "qualifyingChildren",
    type: "int",
    min: "0",
    description:
      "Number of qualifying children under age 17 with required SSNs (26 U.S.C. § 24(c), (h)(7)).",
    default: {
      value: "0",
      rationale: "Assumed no qualifying children absent contrary input",
    },
  },
  {
    id: "foreignEarnedIncome",
    type: "money",
    min: "0",
    description:
      "Foreign earned income qualifying for the § 911 exclusion — ATTESTS a foreign tax home plus § 911(d)(1) qualification (bona fide residence for an entire taxable year, or 330 full days abroad in 12 months). Include these earnings in the wages/SE inputs too; the exclusion is computed and subtracted. The § 911(c) housing exclusion is not modeled. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no foreign earned income absent contrary input",
    },
  },
  {
    id: "fiduciaryType",
    type: "enum",
    enumValues: ["estate", "simple-trust", "complex-trust"],
    description:
      "Form 1041 filer type for the § 642(b) exemption: estate ($600), simple trust required to distribute all income currently ($300), or complex trust ($100). Grantor trusts do not file their own tax — use the grantor's individual return.",
    // no default — the engine must never guess the fiduciary type
  },
  {
    id: "fiduciaryIncomeBeforeExemption",
    type: "money",
    min: "0",
    description:
      "The estate/trust's taxable income BEFORE the § 642(b) exemption but AFTER the §§ 651/661 income-distribution deduction (the DNI machinery is attested by this input). In dollars.",
    // no default — the engine must never guess fiduciary income
  },
  {
    id: "fiduciaryLongTermGains",
    type: "money",
    min: "0",
    description:
      "Net long-term capital gain retained by the estate/trust. Any positive amount REFUSES — the § 1(h) preferential breakpoints for estates and trusts are not modeled. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no retained capital gains absent contrary input",
    },
  },
  {
    id: "householdEmployeeCashWages",
    type: "money",
    min: "0",
    description:
      "Cash wages paid to ONE household employee this year (Schedule H; nanny, housekeeper, caregiver). The § 3121(b)(3) family exclusions (spouse, child under 21, certain parents, under-18 students) must not be entered. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no household employees absent contrary input",
    },
  },
  {
    id: "householdFutaTestMet",
    type: "bool",
    description:
      "Total cash wages of $1,000 or more were paid to household employees in some calendar quarter of this or the preceding year (§ 3306(c)(2)) AND all state unemployment contributions were paid on time (the full 5.4% FUTA credit) — attested.",
    default: {
      value: false,
      rationale: "Assumed the FUTA quarter test not met absent contrary input",
    },
  },
  {
    id: "isFarmerOrFisherman",
    type: "bool",
    description:
      "Gross income from farming or fishing (including oyster farming) is at least 66⅔% of total gross income for this year or the preceding year (§ 6654(i)(2)) — attested. Switches the estimated-tax safe harbor to 66⅔% with a single January-15 installment.",
    default: {
      value: false,
      rationale: "Assumed not a qualifying farmer/fisherman absent contrary input",
    },
  },
  {
    id: "homeOfficeSquareFeet",
    type: "int",
    min: "0",
    description:
      "Square footage of the home used regularly and exclusively for business (§ 280A(c)(1) tests attested) — for the Rev. Proc. 2013-13 simplified method ($5/sq ft, 300 sq ft cap), exposed as a standalone target.",
    default: {
      value: "0",
      rationale: "Assumed no home office absent contrary input",
    },
  },
  {
    id: "corpIsREITorRIC",
    type: "bool",
    description:
      "The corporation is a real estate investment trust (§ 856) or regulated investment company (§ 851). REFUSES — their dividends-paid deduction and distribution requirements are not modeled.",
    default: {
      value: false,
      rationale: "Assumed not a REIT/RIC absent contrary input",
    },
  },
  {
    id: "taxExemptInterest",
    type: "money",
    min: "0",
    description:
      "Tax-exempt interest (e.g. municipal bonds, Form 1040 line 2a) — excluded from gross income but counted in the § 86 social-security provisional income and the § 36B premium-tax-credit MAGI. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no tax-exempt interest absent contrary input",
    },
  },
  {
    id: "slcspAnnualPremium",
    type: "money",
    min: "0",
    description:
      "Annual premium of the second-lowest-cost silver plan (SLCSP) benchmark for the taxpayer's coverage family (Form 1095-A line 33B) — the § 36B(b)(3)(B) applicable benchmark. Leave 0 if no Marketplace coverage. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Marketplace coverage absent contrary input",
    },
  },
  {
    id: "marketplacePremiumsPaid",
    type: "money",
    min: "0",
    description:
      "Annual premiums for the Marketplace qualified health plan(s) actually enrolled in (Form 1095-A line 33A) — the § 36B(b)(2)(A) ceiling on the premium assistance amount. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Marketplace premiums absent contrary input",
    },
  },
  {
    id: "advancePTC",
    type: "money",
    min: "0",
    description:
      "Advance premium tax credit payments made to the insurer during the year (Form 1095-A line 33C) — reconciled under § 36B(f). MFS RECONCILIATION (§ 36B(c)(1)(C)): an MFS filer with no domestic-abuse/abandonment exception is NOT an applicable taxpayer — PTC = $0 and ALL advance payments are additional tax (Schedule 2 line 2; if the PTC targets refuse the MFS case, add the repayment to line 17 yourself and disclose). The Form 8962 line 28 repayment limitation applies ONLY when household income is under 400% FPL (Table 5 amounts by filing status); at 400% or more line 28 is blank — repayment is UNCAPPED (2025 Form 8962 instructions, verified). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no advance PTC payments absent contrary input",
    },
  },
  {
    id: "ptcHouseholdSize",
    type: "int",
    min: "1",
    description:
      "Tax family size for the § 36B poverty-line lookup (§ 36B(d)(1): the taxpayer, spouse on a joint return, and dependents). Required when claiming the premium tax credit.",
    // no default — the poverty line must never be guessed
  },
  {
    id: "otherDependents",
    type: "int",
    min: "0",
    description:
      "Number of dependents (§ 152) OTHER than CTC qualifying children — e.g. children 17+, college students, parents — for the $500 credit for other dependents (§ 24(h)(4)); includes qualifying children without the required SSN (§ 24(h)(4)(C)).",
    default: {
      value: "0",
      rationale: "Assumed no other dependents absent contrary input",
    },
  },
  {
    id: "dependentCareExpenses",
    type: "money",
    min: "0",
    description:
      "Employment-related dependent care expenses paid (§ 21(b)(2)), NET of any § 129 dependent-care FSA exclusion. Enter only expenses enabling gainful employment for the care of a qualifying individual — attested. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no dependent care expenses absent contrary input",
    },
  },
  {
    id: "careQualifyingIndividuals",
    type: "int",
    min: "0",
    description:
      "Number of § 21(b)(1) qualifying individuals for the child and dependent care credit: a dependent under age 13, or a dependent/spouse physically or mentally incapable of self-care living with the taxpayer over half the year.",
    default: {
      value: "0",
      rationale: "Assumed no care-credit qualifying individuals absent contrary input",
    },
  },
  {
    id: "secondaryEarnedIncome",
    type: "money",
    min: "0",
    description:
      "On a JOINT return: the LOWER-earning spouse's earned income, for the § 21(d)(1)(B) expense limit (the credit cannot exceed either spouse's earned income). The § 21(d)(2) deemed income for a student/incapacitated spouse ($250/$500 per month) is not modeled. In dollars.",
    default: {
      value: "0",
      rationale:
        "Conservative: absent the lower earner's income a joint return gets no dependent-care credit — provide it to claim § 21",
    },
  },
  {
    id: "saversContributions",
    type: "money",
    min: "0",
    description:
      "The taxpayer's qualified retirement savings contributions for § 25B (elective deferrals, IRA contributions, ABLE contributions), NET of § 25B(d)(2) testing-period distributions — attested. Capped at $2,000 per individual by the rule. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no saver's-credit contributions absent contrary input",
    },
  },
  {
    id: "saversContributionsSpouse",
    type: "money",
    min: "0",
    description:
      "The spouse's qualified retirement savings contributions for § 25B on a joint return, net of testing-period distributions. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no spousal saver's-credit contributions absent contrary input",
    },
  },
  {
    id: "isFullTimeStudent",
    type: "bool",
    description:
      "Taxpayer is a full-time student (§ 152(f)(2)) — denies saver's-credit eligibility (§ 25B(c)(2)(B)).",
    default: {
      value: false,
      rationale: "Assumed not a full-time student absent contrary input",
    },
  },
  {
    id: "spouseIsFullTimeStudent",
    type: "bool",
    description:
      "Spouse is a full-time student (§ 152(f)(2)) — denies the spouse's saver's-credit eligibility (§ 25B(c)(2)(B)).",
    default: {
      value: false,
      rationale: "Assumed spouse not a full-time student absent contrary input",
    },
  },
  {
    id: "qualifiedAdoptionExpenses",
    type: "money",
    min: "0",
    description:
      "Qualified adoption expenses paid for a finalized adoption (§ 23(d)(1): reasonable adoption fees, court costs, attorney fees — not for adopting a spouse's child). The multi-year expense-timing rules of § 23(a)(2) are attested by entering the creditable year's amount. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no adoption expenses absent contrary input",
    },
  },
  {
    id: "adoptionIsSpecialNeeds",
    type: "bool",
    description:
      "The adoption is of a child with special needs, finalized this year (§ 23(a)(3), incl. determinations by Indian tribal governments per OBBBA § 70403) — the maximum credit is deemed paid regardless of actual expenses.",
    default: {
      value: false,
      rationale: "Assumed not a special-needs adoption absent contrary input",
    },
  },
  {
    id: "qualifiedTips",
    type: "money",
    min: "0",
    description:
      "Qualified tips (26 U.S.C. § 224): voluntary tips received in an occupation on the Treasury tipped-occupation list, already included in wages. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified tips absent contrary input",
    },
  },
  {
    id: "occupation",
    type: "enum",
    enumValues: OCCUPATION_ENUM,
    description:
      "The taxpayer's tipped occupation, from the Treasury Tipped Occupation list (Treas. Reg. § 1.224-1, final Apr 2026). \"other\" = not on the list. Only demanded when qualified tips are claimed.",
    // no default — the engine must never guess whether a job is on the list
  },
  {
    id: "tipsWereVoluntary",
    type: "bool",
    description:
      "Tips were paid voluntarily by customers, determined by the payor, and not subject to negotiation (§ 224; Treas. Reg. § 1.224-1). Mandatory service charges do NOT qualify.",
    default: {
      value: true,
      rationale:
        "Assumed tips were voluntary and non-negotiated absent contrary input — mandatory service charges would not qualify",
    },
  },
  {
    id: "employerIsSSTB",
    type: "bool",
    description:
      "The tips were received in the course of an employer's specified service trade or business (§ 199A(d)(2)) — such tips are NOT qualified (§ 224).",
    default: {
      value: false,
      rationale:
        "Assumed the employer is not a specified service trade or business absent contrary input",
    },
  },
  {
    id: "qualifiedOvertimePremium",
    type: "money",
    min: "0",
    description:
      "Qualified overtime compensation (26 U.S.C. § 225): the FLSA § 7 premium portion in excess of the regular rate, already included in wages. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified overtime premium absent contrary input",
    },
  },
  {
    id: "longTermCapitalGains",
    type: "money",
    min: "0",
    description:
      "Net long-term capital gains plus qualified dividends (taxed at the § 1(h) preferential rates). Losses are out of scope. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no capital gains or qualified dividends absent contrary input",
    },
  },
  {
    id: "netCapitalLoss",
    type: "money",
    min: "0",
    description:
      "Net capital LOSS for the year from Schedule D netting, entered as a positive number (26 U.S.C. § 1211(b): up to $3,000/$1,500 MFS against ordinary income; remainder carries over). Mutually exclusive with the gain facts AND with the per-bucket loss facts (shortTermCapitalLoss/longTermCapitalLoss) — this is the single OVERALL net result; for mixed years (gain in one bucket, loss in the other) use the per-bucket facts and the engine performs the § 1222 netting. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no net capital loss absent contrary input",
    },
  },
  {
    id: "shortTermCapitalLoss",
    type: "money",
    min: "0",
    description:
      "Net short-term capital LOSS for the year (Schedule D line 7 when negative, entered positive). The ST bucket's single NET result — mutually exclusive with shortTermCapitalGains and with netCapitalLoss. Combine with longTermCapitalGains for mixed years: the engine performs the § 1222 cross-netting (a net ST loss first reduces net LT gain per § 1222(11); any overall loss is capped by § 1211(b)). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no net short-term capital loss absent contrary input",
    },
  },
  {
    id: "longTermCapitalLoss",
    type: "money",
    min: "0",
    description:
      "Net long-term capital LOSS for the year (Schedule D line 15 when negative, entered positive). The LT bucket's single NET result — mutually exclusive with longTermCapitalGains and with netCapitalLoss. Combine with shortTermCapitalGains for mixed years: the engine performs the § 1222 cross-netting (a net LT loss reduces the ordinary-rate net ST gain per § 1222(9); any overall loss is capped by § 1211(b)). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no net long-term capital loss absent contrary input",
    },
  },
  {
    id: "qualifiedDividends",
    type: "money",
    min: "0",
    description:
      "Qualified dividends (Form 1099-DIV box 1b) as a STANDALONE fact — use this instead of folding them into longTermCapitalGains whenever a net capital LOSS also exists (dividends are not capital gains: the § 1211(b) loss offset never touches them, and they keep § 1(h) preferential rates). When there is no capital loss, folding qualified dividends into longTermCapitalGains remains equivalent and supported. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified dividends absent contrary input",
    },
  },
  {
    id: "shortTermCapitalGains",
    type: "money",
    min: "0",
    description:
      "Net short-term capital gain after Schedule D netting, ordinary-rate (§ 1222(5)). Counts as § 32(i) disqualified investment income and § 1411 net investment income. Mutually exclusive with netCapitalLoss (provide the single NET Schedule D result: ST gain and/or LT gain, or a net loss — never both gain and loss). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no net short-term capital gain absent contrary input",
    },
  },
  {
    id: "ordinaryDividends",
    type: "money",
    min: "0",
    description:
      "Ordinary (non-qualified) dividends, taxed at ordinary rates — do NOT fold into otherOrdinaryIncome: dividends count as § 32(i) disqualified income and § 1411 net investment income (Form 1099-DIV box 1a minus box 1b). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no ordinary (non-qualified) dividends absent contrary input",
    },
  },
  {
    id: "selfEmploymentNetProfit",
    type: "money",
    min: "0",
    description:
      "Net profit from self-employment (Schedule C line 31: gross receipts minus ACTUAL Schedule C expenses). Do NOT subtract intake fields like 'W-2 Wages Paid' that exist for the § 199A wage limit — those belong in qbiW2Wages, not here. A loss year goes in scheduleCNetLoss instead (leave this at 0). GROSS-RECEIPTS COMPOSITION: the intake's own gross-receipts field PLUS every 1099-NEC and 1099-K nested under (or issued to) the business PLUS any 1099-MISC box 3 'other income' issued to a filer who operates a Schedule C business (a payer's MISC box-3 payment to an active sole proprietor is business income, not Schedule 1 line 8z) — 1099-MISC box 1 rents belong on Schedule E, never here. A 1099 whose recipient TIN matches NEITHER spouse is not this return's income: exclude it and disclose. PLACEHOLDER/TEMPLATE DOCUMENTS: a 1099 whose payer block is an unfilled template — no payer name, address line 'City, AK 99999' or a similar all-9s placeholder — is an inactive template document, not income: exclude every box on it (income AND withholding) and disclose; a 1099 from a NAMED payer at a real-looking address is live data even when the structured intake has no matching entry. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no self-employment income absent contrary input",
    },
  },
  {
    id: "hasChildUnderSix",
    type: "bool",
    description:
      "At least one qualifying child was under age six at year end — gates the California Young Child Tax Credit (R&TC § 17052.1, us.ca.yctc).",
    default: {
      value: "false",
      rationale: "Assumed no child under six absent contrary input",
    },
  },
  {
    id: "caRentedPrincipalResidence",
    type: "bool",
    description:
      "Rented (did not own) a principal residence in California for at least half of the tax year, was not claimed as a dependent, and the property was not exempt from California property tax — the eligibility gate for the California nonrefundable renter's credit (FTB 540, us.ca.renters_credit).",
    default: {
      value: "false",
      rationale: "Assumed not a qualifying California renter absent contrary input",
    },
  },
  {
    id: "caAmti",
    type: "money",
    min: "0",
    description:
      "California alternative minimum taxable income (Schedule P (540) Part I, line 17) — AGENT-COMPUTED per the R&TC §§ 17062(c)-(e), 17062.1 construction rules, then fed to the CA AMT target (us.ca.amt). CONSTRUCTION NOTES (disclose when composing this figure): California individual AMT is FROZEN to IRC §§ 55-59 as they read on January 1, 2015 (R&TC § 17062.1, re-enacted by SB 711, Stats. 2025 Ch. 231, WITHOUT moving the freeze forward, even though SB 711 rolled CA's general IRC conformity date to January 1, 2025 for other provisions). Starting from CA taxable income (Form 540 line 19), the STANDARD DEDUCTION IS ADDED BACK (R&TC § 17062(c)(1), denying § 56(b)(1)(E)). The ISO exercise spread follows § 56(b)(3) as modified by R&TC § 17062(c)(2) (plus the California Qualified Stock Option addback, R&TC § 17502). There is NO tax-exempt private-activity-bond-interest preference (R&TC § 17062(d) turns off § 57(a)(5)) and NO AMT foreign tax credit (R&TC § 17062(e) turns off § 59(a)). A taxpayer whose aggregate trade/business gross receipts are under $1,000,000 (a flat threshold, NOT doubled for MFJ) excludes ALL trade/business income, adjustments, and preferences from AMTI (R&TC § 17062(b)(4), the CA small-business AMTI exclusion). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no CA AMT adjustments or preference items absent contrary input",
    },
  },
  {
    id: "caRegularTax",
    type: "money",
    min: "0",
    description:
      "California 'regular tax' for the Schedule P (540) Part II tentative-minimum-tax comparison (R&TC § 17062(a)(2)) — the Form 540 line 31 tax as reduced by the exemption credits already claimed, i.e. the figure Schedule P's own worksheet calls the regular tax. The CA AMT target (us.ca.amt) computes AMT = max(0, TMT − this amount). In dollars.",
    default: {
      value: "0",
      rationale:
        "Assumed no CA regular tax absent contrary input — note this OVERSTATES computed AMT when a real regular-tax figure exists; supply the actual amount whenever claiming us.ca.amt",
    },
  },
  {
    id: "scheduleCNetLoss",
    type: "money",
    min: "0",
    description:
      "Schedule C/F net LOSS for the year as a POSITIVE number (gross receipts minus ACTUAL expenses is negative; § 165(c)(1) trade-or-business loss). Reduces gross income AND § 32(c)(2) earned income (EITC/ACTC); no SE tax attaches to a loss year. Schedule C ONLY — Schedule E losses belong in nonpassiveScheduleELoss or the passive facts. A 'loss' that exists only because the intake's 'W-2 Wages Paid' field was subtracted is a misreading (that field is qbiW2Wages, never an expense). Gross-receipts composition follows selfEmploymentNetProfit's convention (intake receipts + nested 1099-NEC/K + 1099-MISC box 3 issued to the proprietor; MISC box 1 rents → Schedule E; TIN-mismatched 1099s excluded with disclosure). If QBI-flagged, also enter the same amount in qbiLossOffset. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no self-employment loss absent contrary input",
    },
  },
  {
    id: "k1OrdinaryBusinessIncome",
    type: "money",
    min: "0",
    description:
      "Ordinary business income from a partnership or S corporation Schedule K-1 (box 1) in which the taxpayer MATERIALLY participates — QBI-eligible (§ 199A) but not subject to SE tax or payroll tax (an S-corp shareholder's share, or a non-SE partnership allocation; a general partner's SE-taxable share belongs in selfEmploymentNetProfit instead). Material participation keeps it out of § 1411 net investment income — disclosed. Losses out of scope. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no K-1 pass-through business income absent contrary input",
    },
  },
  {
    id: "qbiW2Wages",
    type: "money",
    min: "0",
    description:
      "W-2 wages PAID BY the qualified trade or business, allocable to QBI (§ 199A(b)(4)) — drives the above-threshold wage limit. Intake forms often label this 'W-2 Wages Paid' under the business section: it is a § 199A LIMIT input, NOT a Schedule C expense — never subtract it from selfEmploymentNetProfit. Defaults to $0, which can only understate the deduction (conservative). In dollars.",
    default: {
      value: "0",
      rationale:
        "Assumed the business paid no W-2 wages absent contrary input (conservative above the threshold)",
    },
  },
  {
    id: "qbiUBIA",
    type: "money",
    min: "0",
    description:
      "Unadjusted basis immediately after acquisition of the business's qualified property (§ 199A(b)(6)) — the 2.5% prong of the wage limit. Defaults to $0 (conservative). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified-property UBIA absent contrary input (conservative)",
    },
  },
  {
    id: "businessIsSSTB",
    type: "bool",
    description:
      "The trade or business is a specified service trade or business (§ 199A(d)(2): health, law, accounting, consulting, financial services, athletics, performing arts, …) — above the threshold an SSTB's deduction phases to zero.",
    // no default — only demanded above the § 199A threshold, where it
    // decides everything; the engine must never guess it
  },
  {
    id: "sepContribution",
    type: "money",
    min: "0",
    description:
      "Employer contribution to the self-employed taxpayer's own SEP-IRA or solo-401(k) profit-sharing (§ 404(h): up to 20% of net SE earnings after ½ SE tax, capped at the § 415(c) limit — $70,000 for 2025, $72,000 for 2026). In dollars. DEDUCTIBLE-LIMIT CONVENTION: when a documented SEP/Keogh contribution exceeds the limit, the deducted amount = 20% × (0.9235 × total Schedule C net profit − the ½-SE-tax deduction), rounded half-up — the § 401(c)(2)/§ 1402(a)(12) reading that applies BOTH the 92.35% factor AND the ½-SE subtraction. (Note: Pub. 560's worksheet applies only the ½-SE subtraction; this engine follows the statutory § 1402(a)(12) reduction.) Pass the documented contribution and apply this cap when self-computing the Schedule 1 line 16 amount.",
    default: {
      value: "0",
      rationale: "Assumed no self-employed retirement contribution absent contrary input",
    },
  },
  {
    id: "selfEmployedHealthPremiums",
    type: "money",
    min: "0",
    description:
      "Health insurance premiums paid by a self-employed taxpayer for themselves, spouse, and dependents (§ 162(l)) — deductible up to the business's earned income; no employer-subsidized coverage available (assumed, disclosed). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no self-employed health insurance premiums absent contrary input",
    },
  },
  {
    id: "employeeAnnualWages",
    type: "money",
    min: "0",
    description:
      "One employee's annual wages, for the employer-side payroll-tax target (§ 3111 FICA + FUTA). In dollars.",
    // no default — only demanded by the employer payroll target
  },
  {
    id: "qreCurrentYear",
    type: "money",
    min: "0",
    description:
      "Qualified research expenses for the current year (§ 41(b); § 41(d) qualification attested). In dollars.",
    // no default — only demanded by the research-credit target
  },
  {
    id: "qreAvgPrior3Years",
    type: "money",
    min: "0",
    description:
      "Average annual qualified research expenses over the 3 preceding years — 0 means no prior QREs (the 6% startup rate of § 41(c)(4)(B) applies). In dollars.",
    // no default — the rate regime turns on it; the engine must not guess
  },
  {
    id: "hsaContribution",
    type: "money",
    min: "0",
    description:
      "Personal HSA contributions (not through payroll) under 26 U.S.C. § 223; HDHP coverage assumed. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no HSA contributions absent contrary input",
    },
  },
  {
    id: "hsaCoverage",
    type: "enum",
    enumValues: ["self", "family"],
    description: "HDHP coverage type for HSA limits (§ 223(b)(2)).",
    // no default — only demanded when hsaContribution > 0
  },
  {
    id: "isAge55OrOlder",
    type: "bool",
    description:
      "Taxpayer is 55 or older (HSA catch-up contribution, § 223(b)(3)).",
    default: {
      value: false,
      rationale: "Assumed under 55 absent contrary input (denies the HSA catch-up — conservative)",
    },
  },
  {
    id: "studentLoanInterest",
    type: "money",
    min: "0",
    description:
      "Interest paid on qualified education loans (26 U.S.C. § 221). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no student loan interest absent contrary input",
    },
  },
  {
    id: "carLoanInterest",
    type: "money",
    min: "0",
    description:
      "Interest paid on a qualified passenger vehicle loan (26 U.S.C. § 163(h)(4)): new US-assembled personal-use vehicle purchased after 2024. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified vehicle loan interest absent contrary input",
    },
  },
  {
    id: "charitableCashContributions",
    type: "money",
    min: "0",
    description:
      "Cash contributions to qualifying charities (26 U.S.C. § 170(p); DAFs and certain private foundations excluded). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no charitable cash contributions absent contrary input",
    },
  },
  {
    id: "stateAndLocalTaxesPaid",
    type: "money",
    min: "0",
    description:
      "State and local taxes paid that Schedule A can count (26 U.S.C. § 164(a)): state/local income (or elected general sales) taxes plus real and personal property taxes, personal portion only. Subject to the OBBBA § 164(b)(6) cap. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no deductible state and local taxes absent contrary input",
    },
  },
  {
    id: "mortgageInterestPaid",
    type: "money",
    min: "0",
    description:
      "Home mortgage interest paid on acquisition debt secured by a qualified residence (26 U.S.C. § 163(h)(3)); post-Dec-15-2017 origination assumed. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no home mortgage interest absent contrary input",
    },
  },
  {
    id: "mortgageAverageBalance",
    type: "money",
    min: "0",
    description:
      "Average balance of home acquisition debt for the year (Publication 936 method) — interest is prorated when this exceeds the $750,000 ($375,000 MFS) limit of § 163(h)(3).",
    // no default — only demanded when mortgageInterestPaid > 0; the engine
    // must never guess whether the $750k limit binds
  },
  {
    id: "medicalExpenses",
    type: "money",
    min: "0",
    description:
      "Unreimbursed medical and dental care expenses (26 U.S.C. § 213) — deductible over 7.5% of AGI when itemizing. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no unreimbursed medical expenses absent contrary input",
    },
  },
  {
    id: "casualtyFederalDisasterLosses",
    type: "money",
    min: "0",
    description:
      "Personal casualty losses attributable to FEDERALLY DECLARED disasters that are NOT qualified disaster losses (§ 165(h)(5)): the SUM over events of max(0, min(FMV decline, adjusted basis) − insurance − $100 per casualty) — the per-event Form 4684 lines 1–11 arithmetic is attested by the input. The 10%-of-AGI floor (§ 165(h)(2)) is applied by the engine; deductible only when itemizing. Non-declared personal casualty losses are nondeductible — do not enter them. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no federally-declared-disaster casualty losses absent contrary input",
    },
  },
  {
    id: "casualtyQualifiedDisasterLosses",
    type: "money",
    min: "0",
    description:
      "Net QUALIFIED disaster losses (Form 4684 line 15): the SUM over qualified-disaster events of max(0, min(FMV decline, adjusted basis) − insurance − $500 per casualty) — per-event arithmetic attested. NOT subject to the 10%-of-AGI floor, and allowed even WITHOUT itemizing by increasing the standard deduction (2025 Form 4684 instructions). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified disaster losses absent contrary input",
    },
  },
  {
    id: "passiveActivityIncome",
    type: "money",
    min: "0",
    description:
      "Net INCOME from passive activities this year (§ 469(c): rentals without real-estate-professional status, passive royalties, passive K-1 income) — absorbs passive losses dollar-for-dollar on Form 8582. Transcribe the TOTAL including any self-rental income items, and ALSO flag the self-rental subset in selfRentalNetIncome — the rule itself excludes that subset from the absorption pool (Reg. § 1.469-2(f)(6)); do not pre-net. For the standalone target us.federal.passive_loss_allowed. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no passive-activity income absent contrary input",
    },
  },
  {
    id: "selfRentalNetIncome",
    type: "money",
    min: "0",
    description:
      "The SELF-RENTAL subset of passiveActivityIncome: net rental income items from property rented for use in a trade or business in which the taxpayer MATERIALLY participates (Reg. § 1.469-2(f)(6) recharacterizes each such item's net income as NOT from a passive activity, so it cannot absorb passive losses). Item by item, INCOME items only — a self-rented property that nets a LOSS stays passive (leave its loss in passiveActivityLosses; add nothing here for it). Report the income itself as nonpassive Schedule E income (k1OrdinaryBusinessIncome if QBI-eligible, else scheduleENetIncome); it is also OUT of net investment income for NIIT (Reg. § 1.1411-4(g)(6)(i) deems it ordinary-course). COMPOSING SCHEDULE E AFTERWARD: net the allowed passive loss against the QBI-flagged bucket FIRST — k1OrdinaryBusinessIncome = QBI-eligible income minus allowed QBI-flagged losses; only the non-QBI remainder goes in scheduleENetIncome (e.g. self-rental 10,000 QBI + royalty 2,000 non-QBI with 2,000 allowed QBI-flagged loss → k1 = 8,000, scheduleENetIncome = 2,000). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no self-rental income absent contrary input",
    },
  },
  {
    id: "passiveActivityLosses",
    type: "money",
    min: "0",
    description:
      "Total passive-activity losses claimed this year as a POSITIVE number (current-year passive losses plus prior-year suspended carryovers being applied). For the standalone target us.federal.passive_loss_allowed. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no passive-activity losses absent contrary input",
    },
  },
  {
    id: "rentalActiveParticipationLosses",
    type: "money",
    min: "0",
    description:
      "The portion of passiveActivityLosses from rental real estate in which the taxpayer ACTIVELY PARTICIPATED (§ 469(i)(1) — a lower bar than material participation: bona fide management decisions with ≥10% ownership, attested). Only this portion can use the § 469(i) $25,000 special allowance. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no active-participation rental losses absent contrary input",
    },
  },
  {
    id: "mfsConsideredUnmarried",
    type: "bool",
    description:
      "MFS filer meets the § 32(d)(2) separation requirements: a qualifying child lived with them for more than half the year, they furnished over half the cost of that household, AND either they are legally separated under a decree or the spouse was not a household member during the last 6 months of the year. Unlocks the EITC for an MFS filer (§ 32(d)(1)); without it MFS receives $0.",
    default: {
      value: false,
      rationale: "Assumed the § 32(d)(2) separation tests are not met (conservative: MFS gets no EITC)",
    },
  },
  {
    id: "mfsLivedApartAllYear",
    type: "bool",
    description:
      "MFS filer lived apart from the spouse AT ALL TIMES during the year — § 469(i)(5) (halves the special allowance to $12,500/$50,000; living together at any time = NO allowance) AND § 219(g)(4) (an MFS filer who lived apart all year is NOT treated as married for the IRA-deduction phaseout: the single ranges apply and no spousal-coverage attribution occurs).",
    default: {
      value: false,
      rationale:
        "Assumed the spouses lived together at some point (zero MFS allowance — conservative)",
    },
  },
  {
    id: "scheduleENetIncome",
    type: "money",
    min: "0",
    description:
      "Net Schedule E rental/royalty income AFTER § 469 netting (compute allowed passive losses with the standalone target us.federal.passive_loss_allowed, then enter the net POSITIVE result here) that is NOT QBI-eligible. NONPASSIVE Schedule E losses (§ 469(c)(7) real-estate professional) are not enterable here: net them against k1OrdinaryBusinessIncome when QBI-eligible (they reduce the QBI base too), else disclose a wage-substitution workaround and keep medicareWages/socialSecurityWages at their true W-2 values — QBI-eligible pass-through income belongs in k1OrdinaryBusinessIncome instead. Treated as ordinary income with no SE tax; NOT counted as § 1411 investment income by this corpus (nonpassive/self-rental character attested — passive rental income that IS investment income would be missed by the NIIT rule: disclosed limitation). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no non-QBI Schedule E income absent contrary input",
    },
  },
  {
    id: "pensionGrossPayments",
    type: "money",
    min: "0",
    description:
      "TOTAL pension/annuity payments received this year from a qualified-plan annuity with after-tax cost basis (1099-R box 1) — the § 72(d) Simplified Method computes the taxable part. Use taxablePensionsAndAnnuities instead (or additionally, for other pensions) when the taxable amount is already known. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no simplified-method annuity absent contrary input",
    },
  },
  {
    id: "pensionCostBasis",
    type: "money",
    min: "0",
    description:
      "Investment in the contract as of the annuity starting date — employee after-tax contributions (1099-R box 9b). The § 72(d)(1)(B) monthly exclusion is this divided by the anticipated-payments table number; lifetime recovery is capped at this amount. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed zero after-tax basis (fully taxable pension) absent contrary input",
    },
  },
  {
    id: "pensionAgeAtStart",
    type: "int",
    min: "0",
    max: "120",
    description:
      "Primary annuitant's age at the ANNUITY STARTING DATE (not current age) — picks the § 72(d)(1)(B)(iii) single-life anticipated-payments band (≤55: 360, 56-60: 310, 61-65: 260, 66-70: 210, 71+: 160). Required when pensionCostBasis is set and the annuity is single-life.",
    default: {
      value: "0",
      rationale: "Unset; the simplified-method rule refuses rather than assume an age band",
    },
  },
  {
    id: "pensionIsJointAndSurvivor",
    type: "bool",
    description:
      "True for an annuity payable over more than one life with a starting date after 1997 — the § 72(d)(1)(B)(iv) COMBINED-ages table applies (set pensionCombinedAgesAtStart).",
    default: {
      value: false,
      rationale: "Assumed a single-life annuity absent contrary input",
    },
  },
  {
    id: "pensionCombinedAgesAtStart",
    type: "int",
    min: "0",
    max: "240",
    description:
      "Combined ages of both annuitants at the annuity starting date, for joint-and-survivor annuities (§ 72(d)(1)(B)(iv): ≤110: 410, 111-120: 360, 121-130: 310, 131-140: 260, 141+: 210).",
    default: {
      value: "0",
      rationale: "Unset; the simplified-method rule refuses rather than assume a band",
    },
  },
  {
    id: "pensionMonthsThisYear",
    type: "int",
    min: "1",
    max: "12",
    description:
      "Number of monthly annuity payments received this tax year (Simplified Method Worksheet line 4 multiplier). 12 for a full year.",
    default: {
      value: "12",
      rationale: "Assumed a full year of monthly payments absent contrary input",
    },
  },
  {
    id: "pensionBasisPreviouslyRecovered",
    type: "money",
    min: "0",
    description:
      "Cost basis already recovered tax-free in prior years (Simplified Method Worksheet line 6) — lifetime recovery cannot exceed pensionCostBasis for post-1986 starting dates. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed the first year of the annuity absent contrary input",
    },
  },
  {
    id: "rentalDepreciableBasis",
    type: "money",
    min: "0",
    description:
      "Depreciable basis of residential rental BUILDING(S) — cost basis excluding land (land never depreciates, § 167; Pub 527 ch. 2). Drives the § 168 GDS 27.5-year straight-line mid-month depreciation (Pub 946 Table A-6). Set rentalPlacedInServiceMonth for a first-year property; leave it 0 for property in service the whole year. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no depreciable rental property absent contrary input",
    },
  },
  {
    id: "rentalPlacedInServiceMonth",
    type: "int",
    min: "0",
    max: "12",
    description:
      "Month (1-12) the residential rental property was placed in service THIS tax year — first-year depreciation uses the § 168(d)(2) mid-month convention (Pub 946 Table A-6 row 1). 0 (the default) = placed in service in a PRIOR year: the steady-state 3.636% year applies.",
    default: {
      value: "0",
      rationale: "Assumed the property was in service before this year (steady-state 3.636% year) absent contrary input",
    },
  },
  {
    id: "rentalIncomeBeforeDepreciation",
    type: "money",
    min: "0",
    description:
      "Schedule E rental result BEFORE depreciation: rents received minus cash operating expenses (management, repairs, insurance, taxes, mortgage interest…). The engine subtracts the computed § 168 depreciation to reach net rental income. Use scheduleENetIncome instead when you already have the after-depreciation net; the two inputs add (separate properties). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no rental activity reported through the depreciation path absent contrary input",
    },
  },
  {
    id: "businessMilesDriven",
    type: "int",
    min: "0",
    description:
      "Business miles driven for the optional standard mileage rate (70¢/mile for 2025 per Notice 2025-5; 72.5¢/mile for 2026 per Notice 2026-10) — the standalone target us.federal.vehicle_standard_mileage computes the deduction; subtract it from your Schedule C profit yourself.",
    default: {
      value: "0",
      rationale: "Assumed no business mileage absent contrary input",
    },
  },
  {
    id: "isRetiredOnTotalDisability",
    type: "bool",
    description:
      "Retired on permanent and total disability (§ 22(e)(3)) — a § 22(b) qualified individual even under age 65. Set this whenever the taxpayer is documented as retired on permanent and total disability. The physician's statement (Schedule R Part II) is a KEEP-FOR-RECORDS substantiation requirement, not filed with the return — an intake answer that no statement is on file yet does NOT zero the credit; disclose the substantiation gap instead.",
    default: {
      value: false,
      rationale: "Assumed not retired on total disability absent contrary input",
    },
  },
  {
    id: "scheduleRDisabilityIncome",
    type: "money",
    min: "0",
    description:
      "Taxable disability income under §§ 72/105(a) (e.g. a code-3 1099-R reported as wages before minimum retirement age) — caps the § 22(c)(2) initial amount for an under-65 disabled individual. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no § 72/105(a) disability income absent contrary input",
    },
  },
  {
    id: "nontaxableBenefitsForScheduleR",
    type: "money",
    min: "0",
    description:
      "Nontaxable social security, railroad retirement, VA pensions and other excluded disability benefits (§ 22(c)(3)) — reduce the § 22 amount dollar-for-dollar. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no § 22(c)(3) nontaxable benefits absent contrary input",
    },
  },
  {
    id: "qbiLossOffset",
    type: "money",
    min: "0",
    description:
      "QBI-eligible LOSSES (positive number) from activities NOT in selfEmploymentNetProfit/k1OrdinaryBusinessIncome — e.g. an allowed nonpassive § 469(c)(7) rental loss flagged as QBI. Reduces the § 199A QBI base only (Reg. § 1.199A-1(d)(2)(iii)); enter the income-side effect via nonpassiveScheduleELoss. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no external QBI losses absent contrary input",
    },
  },
  {
    id: "nonpassiveScheduleELoss",
    type: "money",
    min: "0",
    description:
      "NONPASSIVE Schedule E losses as a positive number (§ 469(c)(7) real-estate-professional rentals with material participation, or allowed § 469 losses not netted elsewhere) — subtracts from gross income. Schedule E ONLY: never route a Schedule C amount here. A Schedule C 'loss' that exists only because the intake's 'W-2 Wages Paid' field was subtracted is a misreading — that field is the § 199A wage-limit input (qbiW2Wages), never an expense; Schedule C profit = gross receipts minus ACTUAL Schedule C expenses. If the activity is QBI-flagged, also enter the same amount in qbiLossOffset. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no nonpassive Schedule E losses absent contrary input",
    },
  },
  {
    id: "medicareWages",
    type: "money",
    min: "0",
    description:
      "W-2 box 5 Medicare wages and tips — the Form 8959 Additional-Medicare-Tax base. Often HIGHER than box 1 (pre-tax 401(k) deferrals reduce box 1 but not box 5). Leave 0 to approximate with box 1 wages (understates the tax when box 5 > box 1 — disclosed). In dollars.",
    default: {
      value: "0",
      rationale:
        "Approximated by box 1 wages absent contrary input (Form 8959 wants box 5)",
    },
  },
  {
    id: "niitInvestmentExpenses",
    type: "money",
    min: "0",
    description:
      "Deductions properly allocable to investment income for the § 1411 net investment income tax (Form 8960 lines 9–10: investment interest expense, allocable state income tax, and other modifications). Subtracted from gross investment income. COORDINATION: if you applied a § 163(d)(4)(B) election by moving elected capital gain from longTermCapitalGains to otherOrdinaryIncome, that gain already left the NII base — do NOT also enter the matching investment interest here (it would double-reduce NII). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no properly-allocable investment deductions absent contrary input",
    },
  },
  {
    id: "investmentInterestDeduction",
    type: "money",
    min: "0",
    description:
      "Investment interest expense DEDUCTIBLE this year (§ 163(d), Form 4952 line 8) — AFTER the net-investment-income limit and any § 163(d)(4)(B) election, which are attested by the input (the engine does not run Form 4952). RUN THE LIMIT FIRST: with no net investment income (taxable interest + ordinary dividends + elected gains), the deductible amount is $0 and the whole expense carries forward — enter 0, not the amount paid. An itemized deduction; excess carries forward outside this corpus. If an election treated capital gain as investment income, also move that amount from longTermCapitalGains to otherOrdinaryIncome yourself. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no deductible investment interest absent contrary input",
    },
  },
  {
    id: "gamblingLossesItemized",
    type: "money",
    min: "0",
    description:
      "Gambling losses deductible as an itemized deduction (§ 165(d), Schedule A line 16) — LIMITED TO GAMBLING WINNINGS included in income: enter min(losses paid, winnings reported), attested by the input (the engine does not track the per-session limit). TY2025: the full limited amount deducts; the OBBBA 90%-of-losses haircut (§ 165(d) as amended) applies only to taxable years beginning after 12/31/2025. Itemized-only; never reduces winnings directly. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no deductible gambling losses absent contrary input",
    },
  },
  {
    id: "otherItemizedDeductions",
    type: "money",
    min: "0",
    description:
      "Other itemized deductions (Schedule A line 16, attested): impairment-related work expenses of a disabled individual (§ 67(d) — NOT subject to the suspended 2% floor), federal estate tax on income in respect of a decedent, amortizable bond premium, and the other line-16 write-ins. Gambling losses have their own fact (gamblingLossesItemized). Enter the documented total — deductible in full. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Schedule A line-16 write-in deductions absent contrary input",
    },
  },
  {
    id: "noncashCharitableContributions",
    type: "money",
    min: "0",
    description:
      "Noncash charitable contributions deductible this year (§ 170, Form 8283) — the 20/30/50%-of-AGI property limits and appraisal requirements are ATTESTED by the input (enter the allowed amount, INCLUDING prior-year carryovers used this year). Itemized-only; does not qualify for § 170(p). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no noncash charitable contributions absent contrary input",
    },
  },
  {
    id: "socialSecurityWages",
    type: "money",
    min: "0",
    description:
      "W-2 box 3 social security wages for the SE-tax OASDI wage-base coordination (Schedule SE line 8a). PER PERSON: Schedule SE belongs to ONE individual — on a joint return enter ONLY the SE-earner's own box 3, never the couple's sum (summing can wrongly zero the OASDI portion). Leave 0 to approximate with box 1 wages. In dollars.",
    default: {
      value: "0",
      rationale:
        "Approximated by box 1 wages absent contrary input (Schedule SE line 8a wants box 3)",
    },
  },
  {
    id: "stateTaxableIncome",
    type: "money",
    min: "0",
    description:
      "STATE taxable income (e.g. CA Form 540 line 19, VA Form 760 line 15, IL net income line 11) — computed by the preparer under state law, then fed to the state tax targets (us.ca.income_tax, us.va.income_tax, us.il.income_tax) so the rate-schedule arithmetic is engine-pinned instead of recalled. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no state taxable income absent contrary input",
    },
  },
  {
    id: "nyYonkersBase",
    type: "money",
    min: "0",
    description:
      "Yonkers resident surcharge base (2025 IT-201-I Yonkers worksheet, line m) — NOT the same as IT-201 line 46 ('Total New York State taxes'). It is line 46 MINUS a specific credit bundle: the Empire State child credit (IT-213 line 9) + real property tax credit (IT-214 line 20) + child/dependent care credit (IT-216 line 14) + earned income credit (IT-215 line 16) + noncustodial parent EIC (IT-209 line 32/42) + college tuition credit (IT-272 line 5/7) + IT-201 lines 69/69a + IT-201-ATT line 13 other credits, net of a STAR reconciliation add-back (Form IT-119 line 3) — agent-composed per the worksheet, then fed to us.ny.yonkers_surcharge (16.75% x this base, feeds IT-201 LINE 55, not line 54 which is MCTMT). Only relevant when IT-201 line 46 is more than $0 and the taxpayer was a Yonkers resident. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Yonkers resident surcharge base absent contrary input (not a Yonkers resident, or line 46 is $0)",
    },
  },
  {
    id: "nyIt214Fagi",
    type: "money",
    min: "0",
    description:
      "Federal adjusted gross income for the NY IT-214 Real Property Tax Credit (Form IT-214 line 8) — gates AND buckets the flat Table A/Table B lookup (us.ny.it214). Over $18,000 disqualifies the credit entirely ('If line 8 is more than $18,000, stop; you do not qualify'). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no IT-214 FAGI absent contrary input",
    },
  },
  {
    id: "nyIt214Eligible",
    type: "bool",
    description:
      "Attests the NY IT-214 NON-ARITHMETIC eligibility gates (2025 Form IT-214 Step 2, lines 1-6): full-year New York State resident; occupied the same residence 6 or more months; did NOT own real property with a market value over $85,000; NOT claimable as a dependent on another taxpayer's federal return; did NOT reside in public housing or a completely property-tax-exempt residence; nursing-home residency disclosed per the instructions. Does NOT include the arithmetic gates — the $18,000 FAGI cap, the $450 average-monthly-adjusted-rent test (printed line-12 percentage menu), and the line 18/19 comparison are all COMPUTED by us.ny.it214 from nyIt214Fagi/nyIt214TotalRent/nyIt214RentPercent/nyIt214MonthsPaid/nyIt214HomeownerTaxes.",
    default: {
      value: false,
      rationale: "Assumed the IT-214 Step 2 eligibility gates (residency, occupancy, property value, dependent status, exempt housing) are not met absent contrary attestation",
    },
  },
  {
    id: "nyIt214TotalRent",
    type: "money",
    min: "0",
    description:
      "Form IT-214 line 11 (2025): total rent paid during the year for the qualifying NY residence, EXCLUDING any subsidized part of the rental charge. The engine applies the printed line-12 percentage menu (nyIt214RentPercent) and the $450 line-13 average-monthly test itself. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no rent paid absent contrary input (homeowner or non-claimant)",
    },
  },
  {
    id: "nyIt214RentPercent",
    type: "int",
    min: "0",
    description:
      "Form IT-214 line 12 (2025) printed adjusted-rent percentage, chosen from the form's own menu by which charges the rent INCLUDES: heat+gas+electricity+furnishings+board → 50; heat+gas+electricity+furnishings → 75; heat+gas+electricity → 80; heat (or heat+gas) → 85; none of the above → 100. These are the only five values the printed form allows — never subtract actual utility dollar amounts.",
    default: {
      value: "100",
      rationale: "Assumed rent includes no heat/gas/electricity/furnishings/board charges absent contrary input (100% per the printed menu)",
    },
  },
  {
    id: "nyIt214MonthsPaid",
    type: "int",
    min: "1",
    description:
      "Form IT-214 line 13 divisor (2025): the number of months rent was paid during the year (the printed instruction divides line 12 adjusted rent by this to get average monthly adjusted rent, tested against the $450 cap).",
    default: {
      value: "12",
      rationale: "Assumed rent was paid for the full 12 months absent contrary input",
    },
  },
  {
    id: "nyIt214HomeownerTaxes",
    type: "money",
    min: "0",
    description:
      "Form IT-214 line 17 (2025): homeowners' real property taxes paid during the year (line 15) plus special assessments (line 16) on the qualifying residence. A part-year owner/renter supplies both this and the rent facts; the engine sums both buckets into line 18. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no homeowner real property taxes absent contrary input (renter or non-claimant)",
    },
  },
  {
    id: "nyIt216StateCredit",
    type: "money",
    min: "0",
    description:
      "New York State child and dependent care credit as computed on Form IT-216, line 14 (2025) — qualified expenses (net of excluded W-2 box 10 dependent care benefits) x the federal line-10 decimal (FAGI-keyed, .35 down to .20) x the NYS line-13 limitation factor (NYAGI-keyed sawtooth; both tables quoted verbatim in us.ny.parameters). This is Worksheet 2 line 1 — the STARTING amount the NYC child and dependent care credit prorates (us.ny.nyc_cdcc). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no New York State child and dependent care credit absent contrary input",
    },
  },
  {
    id: "nyIt216Under4Expenses",
    type: "money",
    min: "0",
    description:
      "Form IT-216 line 23 (2025): total qualified child/dependent care expenses paid for qualifying persons who were UNDER 4 years old on December 31 and listed on IT-216 line 3. Numerator of the Worksheet 2 line 4 proration ratio (us.ny.nyc_cdcc). Use the same gross/net basis as nyIt216TotalExpenses so the ratio is consistent. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualifying persons under age 4 absent contrary input",
    },
  },
  {
    id: "nyIt216TotalExpenses",
    type: "money",
    min: "0",
    description:
      "Form IT-216 line 3a total (2025): total qualified child/dependent care expenses for ALL qualifying persons. Denominator of the Worksheet 2 line 4 proration ratio (us.ny.nyc_cdcc); the ratio is capped at 100%. Use the same gross/net basis as nyIt216Under4Expenses. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified child/dependent care expenses absent contrary input",
    },
  },
  {
    id: "forceItemized",
    type: "bool",
    description:
      "Force the § 63(e) election to itemize even when the standard deduction (plus § 170(p)) is larger — e.g. an MFS filer coordinating with an itemizing spouse, or an explicit client instruction. Default false = the engine takes the larger bundle automatically.",
    default: {
      value: false,
      rationale: "Assumed the tax-minimizing standard-or-itemized election absent contrary input",
    },
  },
  {
    id: "educatorExpenses",
    type: "money",
    min: "0",
    description:
      "TAXPAYER's eligible educator classroom expenses (§ 62(a)(2)(D)) — capped at $300 for 2025 (indexed). K-12 teachers/counselors/aides with 900+ hours (attested). A spouse who is ALSO an eligible educator gets a separate $300 cap: put the spouse's expenses in spouseEducatorExpenses, never summed here. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no educator expenses absent contrary input",
    },
  },
  {
    id: "spouseEducatorExpenses",
    type: "money",
    min: "0",
    description:
      "SPOUSE's eligible educator classroom expenses (§ 62(a)(2)(D)) — separately capped at $300 for 2025 (per-educator cap; an MFJ couple of two educators deducts up to $600 total). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed the spouse is not an eligible educator absent contrary input",
    },
  },
  {
    id: "mfsAbuseOrAbandonmentException",
    type: "bool",
    description:
      "MFS filer qualifies for the Reg. § 1.36B-2(b)(2) domestic-abuse or spousal-abandonment exception (attested on Form 8962 by checking the 'relief' box) — the § 36B(c)(1)(C) joint-filing requirement is waived and the premium tax credit computes normally; excess-APTC repayment is then subject to the ordinary § 36B(f)(2)(B) caps. Available for at most 3 consecutive years.",
    default: { value: false, rationale: "Assumed no abuse/abandonment relief absent contrary attestation (conservative: MFS gets no PTC and repays APTC uncapped)" },
  },
  {
    id: "hsaDistributions",
    type: "money",
    min: "0",
    description:
      "HSA distributions received (Form 1099-SA box 1, all accounts summed). The portion NOT spent on qualified medical expenses (hsaQualifiedMedicalExpenses) is gross income (§ 223(f)(2)) and draws the 20% additional tax (§ 223(f)(4)) unless hsaDistributionPenaltyExempt. In dollars.",
    default: { value: "0", rationale: "Assumed no HSA distributions absent contrary input" },
  },
  {
    id: "hsaQualifiedMedicalExpenses",
    type: "money",
    min: "0",
    description:
      "Unreimbursed qualified medical expenses paid from HSA distributions (Form 8889 line 15) — ONLY the amount the intake EXPLICITLY attests was spent on qualified medical expenses. Absent an explicit attestation, leave this 0 and the full distribution is taxable (§ 223(f)) — never assume qualified use from silence; the taxpayer bears the burden of substantiating qualified use. In dollars.",
    default: { value: "0", rationale: "Assumed distributions were not for qualified medical expenses absent contrary input (conservative: taxable)" },
  },
  {
    id: "hsaDistributionPenaltyExempt",
    type: "bool",
    description:
      "The § 223(f)(4)(B)-(C) exceptions apply to any taxable HSA distribution: made after age 65, after death, or attributable to disability — the 20% additional tax does not apply (the income inclusion still does).",
    default: { value: false, rationale: "Assumed no penalty exception absent contrary input" },
  },
  {
    id: "alimonyPaidPre2019",
    type: "money",
    min: "0",
    description:
      "Alimony/separate maintenance PAID under an instrument executed BEFORE 2019 (and not modified to adopt TCJA treatment) — deductible above the line under pre-TCJA § 215/§ 62(a)(10). Post-2018-instrument alimony is NOT deductible federally (do not enter it here; note some states, e.g. NY, decoupled). In dollars.",
    default: { value: "0", rationale: "Assumed no pre-2019 alimony paid absent contrary input" },
  },
  {
    id: "alimonyReceivedPre2019",
    type: "money",
    min: "0",
    description:
      "Alimony/separate maintenance RECEIVED under a pre-2019 instrument — includible in gross income under pre-TCJA § 71. Post-2018-instrument alimony received is NOT federal income (exclude it here). In dollars.",
    default: { value: "0", rationale: "Assumed no pre-2019 alimony received absent contrary input" },
  },
  {
    id: "federalEstimatedPayments",
    type: "money",
    min: "0",
    description:
      "Federal estimated tax payments for the year plus any prior-year overpayment applied (Form 1040 line 26) — its OWN line, never folded into withholding (line 25d is withholding only). In dollars.",
    default: { value: "0", rationale: "Assumed no estimated payments absent contrary input" },
  },
  {
    id: "federalExtensionPayment",
    type: "money",
    min: "0",
    description:
      "Payment made with the federal extension request (Form 4868) — a Form 1040 line 31 payment via Schedule 3 line 13a; counted in total payments, NEVER folded into withholding or estimated payments. In dollars.",
    default: { value: "0", rationale: "Assumed no extension payment absent contrary input" },
  },
  {
    id: "earlyWithdrawalPenaltyPaid",
    type: "money",
    min: "0",
    description:
      "Penalty on early withdrawal of savings (1099-INT box 2 / 1099-OID box 3) — deductible above the line in full (§ 62(a)(9); Schedule 1 line 18). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no early-withdrawal penalty absent contrary input",
    },
  },
  {
    id: "otherAdjustments",
    type: "money",
    min: "0",
    description:
      "Other above-the-line adjustments from Schedule 1 lines 24a-24z, ATTESTED as the documented total: jury duty pay given to the employer (24a), reforestation amortization (24d), § 3402 supplemental-unemployment repayments (24e), § 501(c)(18)(D) pension contributions (24f, W-2 box 12 code H), attorney fees for unlawful-discrimination claims (24h) and IRS whistleblower awards (24i), and similar write-in adjustments. Enter the SUM of the documented amounts — each is deductible in full; never fold these into income as negative amounts. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Schedule 1 line-24 write-in adjustments absent contrary input",
    },
  },
  {
    id: "iraContribution",
    type: "money",
    min: "0",
    description:
      "Traditional IRA contributions for the year (26 U.S.C. § 219). Roth contributions are not deductible and do not belong here. In dollars. GATE-vs-DOLLAR: an intake screener like 'Made contributions to a traditional or Roth IRA = false' does NOT nullify a populated traditional-IRA dollar field — IRA contributions are a DEDUCTION item, so the documented dollar controls (transcribe it; any § 219(g) phase-out still applies, including the § 219(g)(4) lived-apart-all-year MFS carve-out). The boolean-gate-controls rule is for PAYMENT fields only.",
    default: {
      value: "0",
      rationale: "Assumed no traditional IRA contributions absent contrary input",
    },
  },
  {
    id: "isActivePlanParticipant",
    type: "bool",
    description:
      "Taxpayer is an active participant in an employer retirement plan (W-2 box 13 'Retirement plan') — triggers the § 219(g) deduction phase-out.",
    // no default — only demanded when iraContribution > 0; the engine must
    // never guess plan coverage (it decides the whole phase-out)
  },
  {
    id: "spouseIsActivePlanParticipant",
    type: "bool",
    description:
      "Spouse is an active participant in an employer retirement plan (§ 219(g)(7) spousal phase-out).",
    // no default — only demanded for a married non-participant with an IRA
  },
  {
    id: "isAge50OrOlder",
    type: "bool",
    description:
      "Taxpayer attained age 50 before the close of the taxable year (IRA catch-up, § 219(b)(5)(B)).",
    default: {
      value: false,
      rationale: "Assumed under 50 absent contrary input (denies the IRA catch-up — conservative)",
    },
  },
  {
    id: "aotcExpensesStudent1",
    type: "money",
    min: "0",
    description:
      "Qualified tuition and related expenses for the FIRST eligible student (26 U.S.C. § 25A(b)) — half-time enrollment in one of the first 4 postsecondary years, no 4 prior AOTC claims, no felony drug conviction, and SSN/EIN requirements assumed satisfied. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no American Opportunity credit expenses absent contrary input",
    },
  },
  {
    id: "aotcExpensesStudent2",
    type: "money",
    min: "0",
    description:
      "Qualified expenses for a SECOND eligible AOTC student, if any (same § 25A(b) conditions assumed). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no second AOTC student absent contrary input",
    },
  },
  {
    id: "aotcExpensesStudent3",
    type: "money",
    min: "0",
    description:
      "Qualified expenses for a THIRD eligible AOTC student, if any (same § 25A(b) conditions assumed; a fourth simultaneous student is not representable). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no third AOTC student absent contrary input",
    },
  },
  {
    id: "llcQualifiedExpenses",
    type: "money",
    min: "0",
    description:
      "Qualified tuition and related expenses for the Lifetime Learning Credit (26 U.S.C. § 25A(c)) — per return, and not the same expenses claimed for the AOTC (§ 25A(c)(2)(A)). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Lifetime Learning Credit expenses absent contrary input",
    },
  },
  {
    id: "isSubjectToKiddieTax",
    type: "bool",
    description:
      "Taxpayer is a child to whom 26 U.S.C. § 1(g) applies (under 18, or 18 / full-time student under 24 with earned income ≤ half their support, a living parent, no joint return). Triggers the Form 8615 tax and denies the refundable AOTC (§ 25A(i)).",
    default: {
      value: false,
      rationale:
        "Assumed not a kiddie-tax child absent contrary input (the claimant is typically the parent)",
    },
  },
  {
    id: "parentTaxableIncome",
    type: "money",
    min: "0",
    description:
      "The parent's taxable income (Form 8615 line 6) — needed to compute the allocable parental tax at the parent's rates (§ 1(g)(3)).",
    // no default — the engine must never guess the parent's income
  },
  {
    id: "parentFilingStatus",
    type: "enum",
    enumValues: [...FILING_STATUSES],
    description: "The parent's filing status for the Form 8615 recomputation (§ 1(g)).",
    // no default
  },
  {
    id: "parentHasPreferentialIncome",
    type: "bool",
    description:
      "The parent's taxable income includes net capital gain or qualified dividends (preferential rates) — the Form 8615 recomputation then needs the parent's QDCGT worksheet, which is not modeled (refuses).",
    // no default — deciding it silently would change the parent-rate math
  },
  {
    id: "socialSecurityBenefits",
    type: "money",
    min: "0",
    description:
      "Social security (and tier-1 railroad retirement) benefits received — box 5 of SSA-1099; includible per the \u00a7 86 0/50/85% formula. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no social security benefits absent contrary input",
    },
  },
  {
    id: "taxableIraDistributions",
    type: "money",
    min: "0",
    description:
      "TAXABLE IRA distributions (\u00a7 408(d); Form 8606 basis already applied). When nondeductible-contribution basis exists, compute the taxable amount with the standalone target us.federal.ira8606.taxable_amount (per individual) and enter the result here. ROLLOVERS are excluded entirely: when an interview/confirmation field like 'distributions less rollovers' shows 0, the 1099-R was rolled over and contributes NOTHING here regardless of its box 2a or distribution code \u2014 payer forms cannot see 60-day rollovers. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no IRA distributions absent contrary input",
    },
  },
  {
    id: "ira8606Basis",
    type: "money",
    min: "0",
    description:
      "Form 8606 line 2: this individual's total basis in traditional IRAs from earlier years (the most recent prior Form 8606 line 14). PER INDIVIDUAL \u2014 spouses file separate Forms 8606; run the ira8606 target once per spouse. In dollars.",
    // no default \u2014 the 8606 targets are meaningless without an explicit basis
  },
  {
    id: "ira8606NondeductibleContributions",
    type: "money",
    min: "0",
    description:
      "Form 8606 line 1: nondeductible traditional IRA contributions FOR this year, including those made through the following April 15 (the line 4 timing split is not modeled \u2014 enter the full year's amount). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no current-year nondeductible contributions absent contrary input",
    },
  },
  {
    id: "ira8606YearEndValue",
    type: "money",
    min: "0",
    description:
      "Form 8606 line 6: value of ALL this individual's traditional, SEP, and SIMPLE IRAs as of December 31, plus any outstanding rollovers (\u00a7 408(d)(2)(C)). In dollars.",
    // no default \u2014 a guessed $0 would silently inflate the nontaxable ratio
  },
  {
    id: "ira8606Distributions",
    type: "money",
    min: "0",
    description:
      "Form 8606 line 7: this year's distributions from this individual's traditional/SEP/SIMPLE IRAs, EXCLUDING rollovers, Roth conversions, qualified charitable distributions, and returned contributions (exclusions attested by the input). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no non-conversion IRA distributions absent contrary input",
    },
  },
  {
    id: "ira8606Conversions",
    type: "money",
    min: "0",
    description:
      "Form 8606 line 8: net amount this individual converted from traditional/SEP/SIMPLE IRAs to Roth IRAs this year. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no Roth conversions absent contrary input",
    },
  },
  {
    id: "taxablePensionsAndAnnuities",
    type: "money",
    min: "0",
    description:
      "TAXABLE pensions and annuities (\u00a7 72 exclusion ratio already applied — 1099-R box 2a). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no pension or annuity income absent contrary input",
    },
  },
  {
    id: "unemploymentCompensation",
    type: "money",
    min: "0",
    description: "Unemployment compensation (\u00a7 85, fully includible). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no unemployment compensation absent contrary input",
    },
  },
  {
    id: "otherOrdinaryIncome",
    type: "money",
    min: "0",
    description:
      "Other fully-includible ordinary income reported on Schedule 1 line 8 \u2014 gambling winnings (W-2G, line 8b), prizes and awards, Alaska Permanent Fund dividends (line 8g), jury duty pay, etc. (\u00a7 61(a)). NOT earned income, NOT \u00a7 1411 net investment income, no SE tax. Do not enter income another fact covers. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no other Schedule 1 income absent contrary input",
    },
  },
  {
    id: "eitcAdditionalQualifyingChildren",
    type: "int",
    min: "0",
    description:
      "EIC qualifying children NOT already counted in qualifyingChildren \u2014 \u00a7 32(c)(3) uses the \u00a7 152(c) age rules (under 19, under 24 if a full-time student, or ANY age if permanently and totally disabled), which are wider than the CTC's under-17 cut. A 17-year-old, a 20-year-old student, or a disabled adult child goes here. Counted only for the earned income credit.",
    default: {
      value: "0",
      rationale:
        "Assumed no EIC-only qualifying children absent contrary input (the CTC child count is the floor)",
    },
  },
  {
    id: "earlyDistributionSubjectToPenalty",
    type: "money",
    min: "0",
    description:
      "The portion of retirement distributions subject to the \u00a7 72(t) 10% additional tax — enter only the amount to which NO exception (59\u00bd, disability, SEPP, first home, \u00a7 72(t)(2)) applies. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no penalized early distributions absent contrary input",
    },
  },
  {
    id: "amtIsoExerciseSpread",
    type: "money",
    min: "0",
    description:
      "Bargain element on incentive stock options exercised and NOT sold in the same year (\u00a7 56(b)(3) AMT adjustment). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no ISO exercises absent contrary input",
    },
  },
  {
    id: "amtOtherPreferences",
    type: "money",
    min: "0",
    description:
      "Other Form 6251 Part I adjustments and preferences: tax-exempt private-activity-bond interest, depreciation adjustments, depletion, intangible drilling costs, etc. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no other AMT preference items absent contrary input",
    },
  },
  {
    id: "federalTaxWithheld",
    type: "money",
    min: "0",
    description:
      "Federal income tax withheld so far this year (W-2 box 2 + estimated payments) — credited against the liability under 26 U.S.C. § 31. INCLUDE Form 8959 Part IV excess Medicare withholding: any W-2 box 6 amount over 1.45% of box 5 is Additional-Medicare-Tax withholding that belongs here (otherwise the 0.9% tax is paid twice). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no withholding reported absent contrary input",
    },
  },
  {
    id: "useFormulaMethod",
    type: "bool",
    description:
      "Compute with exact continuous formulas instead of the printed-form methods (analysis/comparison mode — filed returns use the forms). Affects: the IRS Tax Table below $100,000, the § 32(f) EIC Table ($50-bracket midpoints), and Schedule SE's per-line whole-dollar rounding.",
    default: {
      value: false,
      rationale:
        "The printed-form methods (Tax Table, EIC Table, Schedule SE rounding) are how filed returns compute",
    },
  },
  // ── § 6654 estimated-tax safe harbor ──────────────────────────────────
  {
    id: "priorYearTax",
    type: "money",
    min: "0",
    description:
      "Total tax shown on last year's return (§ 6654(d)(1)(B)(ii)). In dollars.",
    // no default — the engine must never guess a prior-year liability
  },
  {
    id: "priorYearAGI",
    type: "money",
    min: "0",
    description:
      "AGI shown on last year's return — over $150,000 ($75,000 MFS) triggers the 110% safe-harbor prong (§ 6654(d)(1)(C)). In dollars.",
    // no default
  },
  // ── business-entity classification & entity-level tax ────────────────
  {
    id: "entityLegalForm",
    type: "enum",
    enumValues: ["llc", "corporation"],
    description:
      "The business's state-law legal form: a limited liability company, or a state-law corporation (a per-se corporation under Treas. Reg. § 301.7701-2(b)(1)).",
    // no default — the engine must never guess what was formed
  },
  {
    id: "llcMemberCount",
    type: "int",
    min: "1",
    description:
      "Number of members (owners) of the LLC — one member defaults to disregarded-entity treatment, two or more to partnership (Treas. Reg. § 301.7701-3(b)(1)).",
    // no default — only demanded for an LLC with no corporate election
  },
  {
    id: "filedForm8832CorpElection",
    type: "bool",
    description:
      "The entity filed a Form 8832 election to be classified as an association taxable as a corporation (Treas. Reg. § 301.7701-3(c)).",
    default: {
      value: false,
      rationale: "Assumed no Form 8832 election absent contrary input",
    },
  },
  {
    id: "filedForm2553SElection",
    type: "bool",
    description:
      "The entity filed a timely Form 2553 S election under § 1362(a)(1) (for an eligible entity this also deems association classification, Reg. § 301.7701-3(c)(1)(v)(C)).",
    default: {
      value: false,
      rationale: "Assumed no S election absent contrary input",
    },
  },
  {
    id: "sCorpShareholderCount",
    type: "int",
    min: "1",
    description:
      "Number of shareholders, counting married couples and § 1361(c)(1) family members as one (§ 1361(b)(1)(A): may not exceed 100).",
    // no default — only demanded when an S election exists
  },
  {
    id: "sCorpHasIneligibleShareholder",
    type: "bool",
    description:
      "Any shareholder is ineligible under § 1361(b)(1)(B)–(C): a nonresident alien, or an entity other than an estate or eligible trust/exempt organization.",
    // no default — only demanded when an S election exists
  },
  {
    id: "sCorpHasMultipleStockClasses",
    type: "bool",
    description:
      "The corporation has more than one class of stock (§ 1361(b)(1)(D); differences in voting rights alone do not create a second class, § 1361(c)(4)).",
    // no default — only demanded when an S election exists
  },
  {
    id: "corpTaxableIncome",
    type: "money",
    min: "0",
    description:
      "The C corporation's taxable income BEFORE the § 250 deduction, if already computed — used as-is when provided. Leave at 0 to have the engine compute it from corpGrossIncome and the deduction components (charitable/DRD/NOL machinery). CONTRACT: the § 250 deduction is computed separately from corpFDDEI/corpNCTI and subtracted by the tax rule — an AS-FILED Form 1120 line 30 already nets out § 250, so when providing corpFDDEI/corpNCTI enter the pre-§ 250 amount here (line 30 plus the § 250 deduction as filed), never the net. In dollars.",
    default: {
      value: "0",
      rationale:
        "No line-30 amount provided — taxable income computed from the gross-income and deduction components",
    },
  },
  {
    id: "corpGrossIncome",
    type: "money",
    min: "0",
    description:
      "The corporation's gross income (§ 61), INCLUDING any dividends received, any § 951 subpart F and § 951A NCTI/GILTI inclusions with their § 78 gross-ups (§ 951A(a) is a gross-income INCLUSION — the § 250 deduction is computed separately from corpNCTI), and any § 245A-eligible foreign-sub dividends. In dollars.",
    // no default — the engine must never guess income
  },
  {
    id: "corpOrdinaryDeductions",
    type: "money",
    min: "0",
    description:
      "Ordinary business deductions (salaries, rents, prior-year amortization, …) — everything EXCEPT charitable contributions, the dividends-received deduction, and NOLs, which have their own limited rules. Enter compensation already limited by § 162(m) (no deduction for a covered employee's remuneration over $1,000,000 at a publicly held corporation — not modeled, attested). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no ordinary deductions absent contrary input",
    },
  },
  {
    id: "corpCharitableContributions",
    type: "money",
    min: "0",
    description:
      "The corporation's charitable contributions — current-year gifts plus allowable prior-year § 170(d)(2) carryovers being used (both subject to the same ceiling and, from 2026, the OBBBA floor). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no corporate charitable contributions absent contrary input",
    },
  },
  {
    id: "corpDividendsReceived",
    type: "money",
    min: "0",
    description:
      "Dividends received from other taxable domestic corporations (§ 243 DRD; must also be included in corpGrossIncome). Enter only dividends on stock meeting the § 246(c) holding period (held more than 45 days during the 91-day window around the ex-dividend date; 90/181 for certain preferred) — attested; § 1059 extraordinary-dividend basis reduction not modeled. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no intercorporate dividends absent contrary input",
    },
  },
  {
    id: "corpDrdOwnershipTier",
    type: "enum",
    enumValues: ["under-20", "20-to-80", "80-plus"],
    description:
      "Ownership of the dividend-paying corporation: under 20% (50% DRD), 20–80% (65% DRD), or 80%+ affiliated (100% DRD, § 243(a)(3)).",
    // no default — only demanded when dividends were received
  },
  {
    id: "corpNOLCarryforward",
    type: "money",
    min: "0",
    description:
      "Net operating loss carryforward available this year (§ 172: deduction limited to 80% of taxable income before the NOL; post-TCJA, no carrybacks). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no NOL carryforward absent contrary input",
    },
  },
  {
    id: "corpPriorYearTax",
    type: "money",
    min: "0",
    description:
      "Tax shown on the corporation's preceding-year return (§ 6655(d) prior-year prong; unavailable if that year showed zero tax or was short). In dollars.",
    // no default — only demanded for corporate estimated-tax questions
  },
  {
    id: "corpIsLargeCorporation",
    type: "bool",
    description:
      "The corporation had taxable income of $1,000,000 or more in any of the 3 preceding taxable years (§ 6655(g)(2) 'large corporation' — may not use the prior-year safe harbor).",
    // no default — only demanded for corporate estimated-tax questions
  },
  {
    id: "corpFDDEI",
    type: "money",
    min: "0",
    description:
      "TY2025: foreign-derived intangible income (FDII); TY2026+: foreign-derived deduction eligible income (FDDEI, OBBBA — QBAI abolished). The § 250 deduction applies 37.5% (2025) / 33.34% (2026+). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no foreign-derived eligible income absent contrary input",
    },
  },
  {
    id: "corpNCTI",
    type: "money",
    min: "0",
    description:
      "TY2025: the § 951A GILTI inclusion (with its § 78 gross-up); TY2026+: net CFC tested income (NCTI, OBBBA). The § 250 deduction applies 50% (2025) / 40% (2026+). The inclusion itself is GROSS INCOME (§ 951A(a)) — it must also be in corpGrossIncome with its § 78 gross-up; this fact drives only the § 250 deduction and FTC basket. The per-CFC tested-income aggregation is not modeled. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no CFC inclusion absent contrary input",
    },
  },
  {
    id: "generalBusinessCredits",
    type: "money",
    min: "0",
    description:
      "Aggregate current-year § 38(b) general business credits (e.g. the § 41 research credit target's result) — limited under § 38(c). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no general business credits absent contrary input",
    },
  },
  {
    id: "aggregateBusinessLoss",
    type: "money",
    min: "0",
    description:
      "The noncorporate taxpayer's net aggregate business LOSS for the year, entered as a positive number (§ 461(l): the excess over $313k/$626k in 2025, $256k/$512k in 2026, is disallowed and becomes an NOL). In dollars.",
    // no default — only demanded by the excess-business-loss target
  },
  {
    id: "corpForeignTaxesGeneral",
    type: "money",
    min: "0",
    description:
      "Creditable foreign income taxes in the \u00a7 904(d) GENERAL basket. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no general-basket foreign taxes absent contrary input",
    },
  },
  {
    id: "corpForeignSourceIncomeGeneral",
    type: "money",
    min: "0",
    description:
      "Foreign-source taxable income in the general basket (\u00a7 904 limitation numerator; \u00a7 861 expense allocation attested). In dollars.",
    // no default — only demanded when general-basket foreign taxes exist
  },
  {
    id: "corpForeignTaxesNCTI",
    type: "money",
    min: "0",
    description:
      "Foreign taxes attributable to the \u00a7 951A basket (GILTI/NCTI) — the \u00a7 960(d) deemed-paid credit takes the 80% (2025) / 90% (2026+, OBBBA) allowance, no carryovers. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no CFC-basket foreign taxes absent contrary input",
    },
  },
  {
    id: "corpBaseErosionTestMet",
    type: "bool",
    description:
      "The corporation's base erosion percentage is 3% or more (2% for banks/securities dealers) — one of the two \u00a7 59A applicable-taxpayer tests. BEAT applies only to $500M+ multinationals.",
    default: {
      value: false,
      rationale:
        "Assumed the 3% base-erosion test is not met absent contrary input (BEAT reaches only large multinationals with substantial related-party deductions)",
    },
  },
  {
    id: "corpBaseErosionTaxBenefits",
    type: "money",
    min: "0",
    description:
      "Base erosion tax benefits for the year (\u00a7 59A(c)(2)) — include the base-erosion percentage of any NOL deduction (\u00a7 59A(c)(1)(B)). Added back to reach modified taxable income. In dollars.",
    // no default — only demanded when the base-erosion test is met
  },
  {
    id: "corpCapitalGains",
    type: "money",
    min: "0",
    description:
      "The corporation's capital gains for the year (\u00a7 1211(a): losses offset only these; net gain is ordinary-rate income for a corporation). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no corporate capital gains absent contrary input",
    },
  },
  {
    id: "corpCapitalLosses",
    type: "money",
    min: "0",
    description:
      "The corporation's capital losses for the year, including prior-year \u00a7 1212(a) carryovers being used (allowed only to the extent of capital gains). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no corporate capital losses absent contrary input",
    },
  },
  {
    id: "corpPortfolioDebtFinancedPercent",
    type: "int",
    min: "0",
    description:
      "Average indebtedness percentage (0-100) of debt-financed portfolio stock (\u00a7 246A) — reduces the 50%/65% DRD proportionally; 0 = not debt-financed.",
    default: {
      value: "0",
      rationale: "Assumed the dividend-paying stock is not debt-financed absent contrary input",
    },
  },
  {
    id: "corpFilesConsolidatedReturn",
    type: "bool",
    description:
      "The corporation joins a consolidated return (\u00a7\u00a7 1501-1504) — intercompany eliminations and SRLY rules are not modeled, so this refuses.",
    default: {
      value: false,
      rationale: "Assumed a separate (non-consolidated) return absent contrary input",
    },
  },
  {
    id: "corpTIThrough3Months",
    type: "money",
    min: "0",
    description:
      "Corporate taxable income for the first 3 months (\u00a7 6655(e) annualization, installments 1-2). In dollars.",
  },
  {
    id: "corpTIThrough6Months",
    type: "money",
    min: "0",
    description:
      "Corporate taxable income for the first 6 months (\u00a7 6655(e) annualization, installment 3). In dollars.",
  },
  {
    id: "corpTIThrough9Months",
    type: "money",
    min: "0",
    description:
      "Corporate taxable income for the first 9 months (\u00a7 6655(e) annualization, installment 4). In dollars.",
  },
  {
    id: "sCorpHasAccumulatedEandP",
    type: "bool",
    description:
      "The S corporation has accumulated earnings and profits from C-corporation years at the close of the year (§ 1375 applies only then).",
    default: {
      value: false,
      rationale:
        "Assumed no C-year accumulated E&P absent contrary input (an always-S corporation has none)",
    },
  },
  {
    id: "sCorpPassiveInvestmentIncome",
    type: "money",
    min: "0",
    description:
      "The S corporation's passive investment income — royalties, rents, dividends, interest, annuities (§ 1375(b)(3)). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no passive investment income absent contrary input",
    },
  },
  {
    id: "sCorpGrossReceipts",
    type: "money",
    min: "0",
    description: "The S corporation's gross receipts for the year (§ 1375). In dollars.",
    // no default — only demanded when the § 1375 branch is reachable
  },
  {
    id: "sCorpNetPassiveIncome",
    type: "money",
    min: "0",
    description:
      "Passive investment income net of directly-connected deductions (§ 1375(b)(2)). In dollars.",
    // no default — only demanded when the § 1375 branch is reachable
  },
  {
    id: "sCorpTaxableIncomeAsC",
    type: "money",
    min: "0",
    description:
      "The S corporation's taxable income computed as if it were a C corporation (§§ 1374(b)(1)/1375(b)(1)(B) cap). In dollars.",
    // no default — only demanded when §§ 1374/1375 are reachable
  },
  {
    id: "sCorpRecognizedBuiltInGain",
    type: "money",
    min: "0",
    description:
      "Net recognized built-in gain during the § 1374(d)(7) 5-year recognition period after a C-to-S conversion (0 if the period has passed or there was no conversion). In dollars.",
    default: {
      value: "0",
      rationale:
        "Assumed no recognized built-in gain absent contrary input (no C-to-S conversion in the recognition period)",
    },
  },
  {
    id: "corpAvgAdjustedFinancialStatementIncome",
    type: "money",
    min: "0",
    description:
      "3-year-average adjusted financial statement income (§ 56A) — over $1 billion triggers the corporate AMT, which this engine refuses to approximate. In dollars.",
    default: {
      value: "0",
      rationale:
        "Assumed 3-year-average AFSI at or below the $1 billion CAMT threshold absent contrary input",
    },
  },
  {
    id: "corpEquipmentPurchases",
    type: "money",
    min: "0",
    description:
      "Cost of qualified § 168(k) property acquired AND placed in service this year (acquired after January 19, 2025 — 100% bonus depreciation, OBBBA-permanent). EXCLUDE passenger automobiles (the § 280F luxury-auto caps are not modeled) and anything entered in corpSection179Cost. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no qualified property placed in service absent contrary input",
    },
  },
  {
    id: "corpSection179Cost",
    type: "money",
    min: "0",
    description:
      "Cost of § 179 property the corporation elects to expense — including qualified real property (roofs, HVAC, fire/security systems on nonresidential real property, § 179(d)(1)(B)(ii)) that § 168(k) cannot reach. Must NOT also be in corpEquipmentPurchases; EXCLUDE passenger automobiles and sport utility vehicles (the § 280F caps and the § 179(b)(5) SUV cap are not modeled). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no § 179 election absent contrary input",
    },
  },
  {
    id: "corpFiscalYearFiler",
    type: "bool",
    description:
      "The corporation uses a FISCAL taxable year (or files a § 443 short-period return). Fiscal and short years are not modeled — the OBBBA parameters (§ 250 rates, § 59A 10.5%, § 960(d) 90%, § 448(c) $32M, the § 170(b)(2) 1% floor) apply by the taxable year's BEGINNING date, and § 443(b) annualization / § 15 proration are not encoded.",
    default: {
      value: false,
      rationale:
        "Calendar taxable year assumed — fiscal-year and short-period returns refuse",
    },
  },
  {
    id: "corpIsCoveredCorporation",
    type: "bool",
    description:
      "The corporation is a 'covered corporation' for the § 4501 stock-repurchase excise tax: a domestic corporation whose stock is traded on an established securities market (§ 4501(b)).",
    default: {
      value: false,
      rationale: "Assumed not a listed domestic corporation absent contrary input",
    },
  },
  {
    id: "corpStockRepurchasedFMV",
    type: "money",
    min: "0",
    description:
      "Fair market value of the corporation's own stock repurchased (§ 317(b) redemptions and economically similar transactions) during the taxable year, for the § 4501 excise. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no stock repurchases absent contrary input",
    },
  },
  {
    id: "corpStockIssuedFMV",
    type: "money",
    min: "0",
    description:
      "Fair market value of stock issued by the corporation during the taxable year (including to employees) — netted against repurchases under § 4501(c)(3). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no stock issuances absent contrary input",
    },
  },
  {
    id: "corpSection245ADividends",
    type: "money",
    min: "0",
    description:
      "Foreign-source portion of dividends received from specified 10-percent-owned foreign corporations, eligible for the § 245A participation-exemption DRD (100%). Must also be included in corpGrossIncome. Attested by entry: US-shareholder status, NOT a § 245A(e) hybrid dividend, and the § 246(c)(5) 365-day holding period met; no foreign tax credit is allowed for the deducted portion (§ 245A(d)) — keep these taxes out of the FTC inputs. In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no § 245A-eligible foreign-sub dividends absent contrary input",
    },
  },
  {
    id: "corpDomesticResearch",
    type: "money",
    min: "0",
    description:
      "Domestic research or experimental expenditures — currently deductible under § 174A (OBBBA, permanent from 2025). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no domestic research expenditures absent contrary input",
    },
  },
  {
    id: "corpForeignResearch",
    type: "money",
    min: "0",
    description:
      "FOREIGN research or experimental expenditures paid this year — capitalized and amortized over 15 years (§ 174; first-year deduction is 1/30 under the midpoint convention). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no foreign research expenditures absent contrary input",
    },
  },
  {
    id: "corpBusinessInterestExpense",
    type: "money",
    min: "0",
    description:
      "Business interest expense (§ 163(j): limited to 30% of EBITDA-based ATI unless the § 448(c) gross-receipts test is met). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no business interest expense absent contrary input",
    },
  },
  {
    id: "corpAvgGrossReceipts3yr",
    type: "money",
    min: "0",
    description:
      "3-year-average annual gross receipts (§ 448(c) test: $31M for 2025, $32M for 2026 — at or below it the § 163(j) limit does not apply). In dollars.",
    // no default — only demanded when there is business interest expense
  },
  {
    id: "corpDividendsPaid",
    type: "money",
    min: "0",
    description:
      "Dividends paid during the year (the § 561 dividends-paid deduction for the accumulated-earnings computation). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no dividends paid absent contrary input",
    },
  },
  {
    id: "corpAccumulatedEandPStart",
    type: "money",
    min: "0",
    description:
      "Accumulated earnings and profits at the close of the PRECEDING year (§ 535(c)(2) minimum-credit offset). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no prior accumulated earnings and profits absent contrary input",
    },
  },
  {
    id: "corpReasonableNeedsRetention",
    type: "money",
    min: "0",
    description:
      "Earnings retained for the reasonable needs of the business (§§ 535(c)(1), 537 — documented needs; part of the accumulated earnings credit). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no documented reasonable-needs retention absent contrary input",
    },
  },
  {
    id: "corpIsPersonalServiceCorp",
    type: "bool",
    description:
      "The corporation's principal function is services in health, law, engineering, architecture, accounting, actuarial science, performing arts, or consulting (§ 535(c)(2)(B): $150,000 minimum credit instead of $250,000).",
    default: {
      value: false,
      rationale: "Assumed not a listed service corporation absent contrary input",
    },
  },
  {
    id: "corpPHCIncome",
    type: "money",
    min: "0",
    description:
      "Personal holding company income (§ 543: dividends, interest, royalties, annuities, certain rents). In dollars.",
    // no default — only demanded for PHC determinations
  },
  {
    id: "corpAdjustedOrdinaryGrossIncome",
    type: "money",
    min: "0",
    description: "Adjusted ordinary gross income (§ 543(b)(2)) — the 60% test base. In dollars.",
    // no default — only demanded for PHC determinations
  },
  {
    id: "corpOwnedByFiveOrFewer",
    type: "bool",
    description:
      "More than 50% of the stock's value was owned (directly or via § 544 attribution) by 5 or fewer individuals during the last half of the year (§ 542(a)(2)).",
    // no default — only demanded for PHC determinations
  },
  {
    id: "corpUndistributedPHCIncome",
    type: "money",
    min: "0",
    description:
      "Undistributed personal holding company income (§ 545: taxable income adjusted, less federal taxes and the dividends-paid deduction). In dollars.",
    // no default — only demanded when the PHC tax is computed
  },
  {
    id: "qsbsGain",
    type: "money",
    min: "0",
    description:
      "Gain on a sale of qualified small business stock (§ 1202) — original issuance, active-business, and gross-asset tests assumed satisfied (disclosed). In dollars.",
    default: {
      value: "0",
      rationale: "Assumed no QSBS gain absent contrary input",
    },
  },
  {
    id: "qsbsAcquiredAfterJuly2025",
    type: "bool",
    description:
      "The stock was acquired AFTER July 4, 2025 (the OBBBA tiered regime: 50/75/100% at 3/4/5 years, $15M cap) rather than under prior law ($10M cap, 100% at 5 years).",
    // no default — the acquisition date decides the whole regime
  },
  {
    id: "qsbsAcquiredAfterSept2010",
    type: "bool",
    description:
      "For prior-law stock: acquired after September 27, 2010 (the 100%-exclusion vintage; earlier vintages refuse).",
    // no default — only demanded for pre-OBBBA stock held 5+ years
  },
  {
    id: "qsbsHoldingPeriodYears",
    type: "int",
    min: "0",
    description: "Whole years the QSBS was held before the sale (§ 1202(a)/(b) holding tiers).",
    // no default — only demanded when there is QSBS gain
  },
  // ── § 6654(d)(2) annualized-income installments (cumulative periods) ──
  {
    id: "wagesThroughMar31",
    type: "money",
    min: "0",
    description:
      "Wages received January 1 through March 31 (Form 2210 Schedule AI column (a)). Only demanded when the year has wages. In dollars.",
  },
  {
    id: "wagesThroughMay31",
    type: "money",
    min: "0",
    description: "Wages received January 1 through May 31 (Schedule AI column (b)). In dollars.",
  },
  {
    id: "wagesThroughAug31",
    type: "money",
    min: "0",
    description: "Wages received January 1 through August 31 (Schedule AI column (c)). In dollars.",
  },
  {
    id: "seProfitThroughMar31",
    type: "money",
    min: "0",
    description:
      "Self-employment net profit earned January 1 through March 31 (Schedule AI column (a)). Only demanded when the year has SE profit. In dollars.",
  },
  {
    id: "seProfitThroughMay31",
    type: "money",
    min: "0",
    description: "Self-employment net profit January 1 through May 31 (Schedule AI column (b)). In dollars.",
  },
  {
    id: "seProfitThroughAug31",
    type: "money",
    min: "0",
    description: "Self-employment net profit January 1 through August 31 (Schedule AI column (c)). In dollars.",
  },
  // ── § 152 dependent determination (about ONE candidate person) ───────
  {
    id: "depRelationshipChild",
    type: "bool",
    description:
      "Candidate is the taxpayer's child, stepchild, foster child, sibling, step-sibling, or a descendant of any of them (§ 152(c)(2)).",
  },
  {
    id: "depAge",
    type: "int",
    min: "0",
    description: "Candidate's age at the end of the year (§ 152(c)(3)).",
  },
  {
    id: "depIsFullTimeStudent",
    type: "bool",
    description: "Candidate was a full-time student for at least 5 months (§ 152(f)(2)).",
    default: {
      value: false,
      rationale: "Assumed not a full-time student absent contrary input",
    },
  },
  {
    id: "depPermanentlyDisabled",
    type: "bool",
    description: "Candidate is permanently and totally disabled (§ 152(c)(3)(B)).",
    default: {
      value: false,
      rationale: "Assumed not permanently and totally disabled absent contrary input",
    },
  },
  {
    id: "depYoungerThanTaxpayer",
    type: "bool",
    description: "Candidate is younger than the taxpayer (§ 152(c)(3)(A)).",
    default: {
      value: true,
      rationale: "Assumed the candidate is younger than the taxpayer absent contrary input",
    },
  },
  {
    id: "depLivedWithTaxpayerOverHalfYear",
    type: "bool",
    description:
      "Candidate had the same principal residence as the taxpayer for more than half the year (§ 152(c)(1)(B)).",
    // no default — a core test, always asked
  },
  {
    id: "depProvidedOwnSupportOverHalf",
    type: "bool",
    description: "Candidate provided more than half of their own support (§ 152(c)(1)(D)).",
    default: {
      value: false,
      rationale: "Assumed the candidate did not provide over half their own support",
    },
  },
  {
    id: "depFilesJointReturn",
    type: "bool",
    description:
      "Candidate files a joint return with a spouse (other than a refund-only claim) (§ 152(c)(1)(E)).",
    default: {
      value: false,
      rationale: "Assumed the candidate does not file a joint return",
    },
  },
  {
    id: "depRelationshipRelative",
    type: "bool",
    description:
      "Candidate bears a § 152(d)(2) relationship to the taxpayer (parent, grandparent, sibling, in-law, etc.) or lived in the household all year.",
    // no default
  },
  {
    id: "depGrossIncome",
    type: "money",
    min: "0",
    description:
      "Candidate's gross income for the year (§ 152(d)(1)(B) limit: $5,200 TY2025 / $5,300 TY2026). In dollars.",
    // no default
  },
  {
    id: "taxpayerProvidedOverHalfSupport",
    type: "bool",
    description:
      "The taxpayer provided more than half of the candidate's support (§ 152(d)(1)(C)).",
    // no default
  },
  {
    id: "depIsQualifyingChildOfAnother",
    type: "bool",
    description:
      "Candidate is the qualifying child of the taxpayer or any other taxpayer (§ 152(d)(1)(D)).",
    default: {
      value: false,
      rationale: "Assumed not anyone's qualifying child absent contrary input",
    },
  },
  {
    id: "hasMultipleSupportAgreement",
    type: "bool",
    description:
      "A § 152(d)(3) multiple-support agreement is in place for the candidate: the group together provided over half the support, no one person provided over half, each member could otherwise claim the candidate, and every other over-10% contributor signed a Form 2120 waiver.",
    default: {
      value: false,
      rationale: "Assumed no multiple-support agreement absent contrary input",
    },
  },
  {
    id: "taxpayerProvidedOver10PercentSupport",
    type: "bool",
    description:
      "The taxpayer contributed over 10 percent of the candidate's support (§ 152(d)(3)(D) — the support test under a multiple-support agreement).",
    // no default — only demanded when a multiple-support agreement exists
  },
  {
    id: "depDivorcedParentsRule",
    type: "bool",
    description:
      "§ 152(e) applies to the candidate child: the parents are divorced, separated, or lived apart the last 6 months of the year; the child received over half their support from the parents and was in their custody over half the year.",
    default: {
      value: false,
      rationale: "Assumed the divorced-parents rule does not apply absent contrary input",
    },
  },
  {
    id: "taxpayerIsCustodialParent",
    type: "bool",
    description:
      "The taxpayer is the custodial parent (the parent with whom the child resided the greater number of nights, § 152(e)(4)(A)).",
    // no default — only demanded when § 152(e) applies; the engine must not
    // guess which side of the release the taxpayer is on
  },
  {
    id: "custodialParentReleasedClaim",
    type: "bool",
    description:
      "The custodial parent signed a written declaration (Form 8332) releasing the claim to the child for this year (§ 152(e)(2)).",
    // no default — only demanded when § 152(e) applies
  },
  {
    id: "isAtLeastAge25",
    type: "bool",
    description:
      "Taxpayer attained age 25 before the close of the taxable year (26 U.S.C. § 32(c)(1)(A)(ii)(II), childless EITC age floor).",
    // no default — only demanded when the childless-EITC branch is actually
    // reachable; the engine must not guess an eligibility age
  },
  {
    id: "spouseItemizes",
    type: "bool",
    description:
      "Spouse itemizes deductions on a separate return (26 U.S.C. § 63(c)(6)(A)) — if so, an MFS filer's standard deduction is zero.",
    // no default — only demanded for married-filing-separately evaluations
  },

  // ---- Pennsylvania deep pack (state-pa.ts) -------------------------------
  // PA classes are TRANSCRIBED separately from the federal facts: PA
  // classification diverges (capital-gain distributions are dividends,
  // 401(k) deferrals are taxable compensation, eligible retirement income is
  // exempt), so nothing here is auto-mapped from taxableInterest etc.
  {
    id: "paCompensationAdjustment",
    type: "money",
    description:
      "PA compensation adjustment: W-2 Box 16 total MINUS Box 1 total (PA taxes 401(k)/elective deferrals as compensation; active-duty pay outside PA and other exempt items reduce it). May be negative. Default 0 assumes Box 16 = Box 1. Taxable early retirement-plan/IRA distributions under PA's cost-recovery method also go here. In dollars.",
    default: { value: "0", rationale: "PA W-2 Box 16 assumed equal to federal Box 1 wages absent contrary input" },
  },
  {
    id: "paUnreimbursedBusinessExpenses",
    type: "money",
    min: "0",
    description:
      "PA Schedule UE unreimbursed employee business expenses (PA-40 line 1b) — a compensation-class expense, not a line-10 deduction. In dollars.",
    default: { value: "0", rationale: "No unreimbursed employee business expenses claimed absent contrary input" },
  },
  {
    id: "paInterestIncome",
    type: "money",
    min: "0",
    description:
      "PA-taxable interest income (PA-40 line 2, gross class — no expenses; forfeited-interest penalties may offset within the class before entry). Includes commercial-annuity income taxable as PA interest. In dollars.",
    default: { value: "0", rationale: "No PA interest income absent contrary input" },
  },
  {
    id: "paDividendIncome",
    type: "money",
    min: "0",
    description:
      "PA-taxable dividend income (PA-40 line 3, gross class) INCLUDING mutual-fund capital gains distributions, which PA classifies as dividends. In dollars.",
    default: { value: "0", rationale: "No PA dividend income absent contrary input" },
  },
  {
    id: "paBusinessNetIncome",
    type: "money",
    description:
      "Taxpayer's own net income or LOSS from business/profession/farm (PA-40 line 4 class, after within-class netting of the taxpayer's own activities). Negative allowed; a loss never offsets other classes or the spouse. In dollars.",
    default: { value: "0", rationale: "No business income or loss absent contrary input" },
  },
  {
    id: "paSpouseBusinessNetIncome",
    type: "money",
    description:
      "Spouse's own net income or LOSS from business/profession/farm (PA-40 line 4 class). Negative allowed; never netted against the taxpayer's. In dollars.",
    default: { value: "0", rationale: "No spouse business income or loss absent contrary input" },
  },
  {
    id: "paPropertyGainNet",
    type: "money",
    description:
      "Taxpayer's own net gain or LOSS from sale/exchange/disposition of property (PA-40 line 5 class). Negative allowed; no carryover, no cross-class or spousal offset. In dollars.",
    default: { value: "0", rationale: "No property gain or loss absent contrary input" },
  },
  {
    id: "paSpousePropertyGainNet",
    type: "money",
    description:
      "Spouse's own net gain or LOSS from disposition of property (PA-40 line 5 class). Negative allowed; never netted against the taxpayer's. In dollars.",
    default: { value: "0", rationale: "No spouse property gain or loss absent contrary input" },
  },
  {
    id: "paRentRoyaltyNet",
    type: "money",
    description:
      "Taxpayer's own net income or LOSS from rents/royalties/patents/copyrights (PA-40 line 6 class). Negative allowed; short-term rentals (<30 days) belong in the business class instead. In dollars.",
    default: { value: "0", rationale: "No rent/royalty income or loss absent contrary input" },
  },
  {
    id: "paSpouseRentRoyaltyNet",
    type: "money",
    description:
      "Spouse's own net income or LOSS from rents/royalties/patents/copyrights (PA-40 line 6 class). Negative allowed; never netted against the taxpayer's. In dollars.",
    default: { value: "0", rationale: "No spouse rent/royalty income or loss absent contrary input" },
  },
  {
    id: "paEstateTrustIncome",
    type: "money",
    min: "0",
    description:
      "PA-taxable income from estates or trusts (PA-40 line 7, Schedule J) — an estate or trust cannot distribute a loss, so this is never negative. In dollars.",
    default: { value: "0", rationale: "No estate/trust income absent contrary input" },
  },
  {
    id: "paGamblingWinnings",
    type: "money",
    min: "0",
    description:
      "PA-taxable gambling and lottery winnings (PA-40 line 8, Schedule T) net of wager costs (PA Lottery ticket costs deductible only for tickets bought on/after 1/1/2016); noncash PA Lottery prizes are exempt. In dollars.",
    default: { value: "0", rationale: "No gambling winnings absent contrary input" },
  },
  {
    id: "pa529Contributions",
    type: "money",
    min: "0",
    description:
      "PA Schedule O § 529 tuition-program contribution deduction, ALREADY capped by the caller at $19,000 per beneficiary per taxpayer-spouse (2025) — the corpus cannot see per-beneficiary detail. No deduction for 529-to-529 rollovers or beneficiary changes. In dollars.",
    default: { value: "0", rationale: "No 529 contributions claimed absent contrary input" },
  },
  {
    id: "paAbleContributions",
    type: "money",
    min: "0",
    description:
      "PA Schedule O § 529A ABLE contribution deduction, capped by the caller at the annual federal gift-tax exclusion ($19,000 for 2025). In dollars.",
    default: { value: "0", rationale: "No ABLE contributions claimed absent contrary input" },
  },
  {
    id: "paMsaHsaContributions",
    type: "money",
    min: "0",
    description:
      "PA Schedule O Medical Savings Account + Health Savings Account contribution deductions — limited to the amounts allowed for FEDERAL income tax purposes (supply the federal-allowed total). In dollars.",
    default: { value: "0", rationale: "No MSA/HSA deduction claimed absent contrary input" },
  },
  {
    id: "paSpDependentChildren",
    type: "int",
    min: "0",
    description:
      "PA Schedule SP dependent CHILDREN count (natural/adopted/step; grandchild of a grandparent; foster child of a foster parent — never aunts/uncles/unrelated persons) claimable as federal dependents; adult qualifying children count. Raises the Tax Forgiveness eligibility-income threshold $9,500 each.",
    default: {
      value: "0",
      rationale: "Conservative: no SP dependent children assumed — understates the forgiveness threshold, never overstates the credit",
    },
  },
  {
    id: "paEligibilityIncomeAddbacks",
    type: "money",
    min: "0",
    description:
      "PA Schedule SP Section III nontaxable add-backs to eligibility income: nontaxable interest/dividends/gains, alimony received, insurance proceeds and inheritances (incl. 1099-R code-4 box 1), gifts/awards/prizes (incl. noncash PA Lottery), non-PA income, nontaxable military pay (not combat), excluded home-sale gain, nontaxable educational assistance, outside cash support. Do NOT add Social Security/RRB, eligible retirement benefits, child support, military pensions, workers' comp, personal-injury damages, or sick/disability pay. In dollars.",
    default: { value: "0", rationale: "No nontaxable eligibility-income add-backs absent contrary input" },
  },
  {
    id: "paResidentCredit",
    type: "money",
    min: "0",
    description:
      "PA resident credit for income tax paid to other states (PA-40 line 22, Schedule G-L; not allowed for reciprocal-state compensation: IN, MD, NJ, OH, VA, WV). Subtracts from tax BEFORE Tax Forgiveness per Schedule SP Section IV. In dollars.",
    default: { value: "0", rationale: "No other-state tax credit claimed absent contrary input" },
  },

  // ---- New Jersey deep pack (state-nj.ts) ---------------------------------
  {
    id: "njGrossIncome",
    type: "money",
    min: "0",
    description:
      "New Jersey gross income (NJ-1040 line 29: total category income minus the pension/retirement exclusions, BEFORE exemptions and deductions) — keys the Estimated Use Tax Chart (us.nj.use_tax) and the $10,000/$20,000 filing threshold. In dollars.",
    default: { value: "0", rationale: "Assumed no NJ gross income absent contrary input (bottom use-tax tier)" },
  },
  {
    id: "njFederalCdcc",
    type: "money",
    min: "0",
    description:
      "The federal child and dependent care credit (Form 2441) — Worksheet J line 1 input for us.nj.cdcc. Where the federal liability limit zeroed an otherwise-allowable credit, NJ's mock-return guidance supports the credit the filer WOULD have been eligible for; disclose which 2441 amount was supplied. In dollars.",
    default: { value: "0", rationale: "No federal child and dependent care credit claimed absent contrary input" },
  },
  {
    id: "njChildrenUnder6",
    type: "int",
    min: "0",
    description:
      "Count of dependents claimed on NJ-1040 lines 10/11 who were age 5 or younger on the last day of the tax year (born 2020 or later for TY2025) — the NJ Child Tax Credit multiplier (us.nj.ctc).",
    default: { value: "0", rationale: "No children age 5 or younger assumed absent contrary input" },
  },
  {
    id: "njPensionIncome",
    type: "money",
    min: "0",
    description:
      "NJ-1040 line 20a taxable pension/annuity/IRA income ELIGIBLE for the line 28a exclusion — on a joint return where only one spouse is 62+/disabled, ONLY that spouse's pension income (the ineligible spouse's share never excludes). In dollars.",
    default: { value: "0", rationale: "No eligible pension income absent contrary input" },
  },
  {
    id: "njTotalIncome",
    type: "money",
    min: "0",
    description:
      "NJ-1040 line 27 total income (all categories, before the pension exclusion) — the pension-exclusion chart tier and $150,000 cliff key on this amount. In dollars.",
    default: { value: "0", rationale: "Assumed no NJ total income absent contrary input" },
  },
  {
    id: "njPensionEligible",
    type: "bool",
    description:
      "NJ pension-exclusion age/disability gate attested: the filer (or spouse on a joint return) was age 62 or older OR blind/disabled per Social Security guidelines on the last day of the tax year (2025 NJ-1040 line 28a).",
    default: { value: false, rationale: "Conservative: exclusion eligibility not attested — no exclusion" },
  },
  {
    id: "njEitcAgeDecoupled",
    type: "bool",
    description:
      "NJ flat-$260 EITC eligibility attested (2025 NJ-1040 line 58): no qualifying child, at least 18 years old, met ALL federal EIC requirements except the age requirement (NJ eliminated both the under-25 floor and the 65+ ceiling), and not claimed as a dependent on another return.",
    default: { value: false, rationale: "Conservative: age-decoupled NJEITC eligibility not attested" },
  },
  {
    id: "njPropertyTaxesPaid",
    type: "money",
    min: "0",
    description:
      "NJ-1040 line 40a: property taxes due and paid on the principal residence (homeowners), or 18% of rent paid (tenants; 18% of site fees for mobile-home owners), after any Worksheet G multi-owner/multi-unit proration. In dollars.",
    default: { value: "0", rationale: "No property taxes/rent-equivalent paid absent contrary input" },
  },
  {
    id: "njMfsSameHome",
    type: "bool",
    description:
      "Married filing separately AND both spouses maintained the SAME principal residence — halves the NJ property tax deduction cap ($7,500) and the credit/threshold amounts ($25).",
    default: { value: false, rationale: "Assumed separate filers did not share the same main home absent contrary input" },
  },

  // ---- Ohio deep pack (state-oh.ts) ---------------------------------------
  {
    id: "ohModifiedAgi",
    type: "money",
    description:
      "Ohio modified adjusted gross income (MAGI): Ohio adjusted gross income (IT 1040 line 3) PLUS the business income deduction (Schedule of Adjustments line 13) — the base for the exemption tiers and most credit gates (2025 booklet p. 8). Can be negative. In dollars.",
    default: { value: "0", rationale: "Assumed no Ohio MAGI absent contrary input" },
  },
  {
    id: "ohExemptionCount",
    type: "int",
    min: "0",
    description:
      "IT 1040 line 4 exemption count: self (unless claimable as a dependent on another return), spouse if filing jointly, plus federal dependents (Schedule of Dependents).",
    default: { value: "1", rationale: "Assumed a single self-exemption absent contrary input" },
  },
  {
    id: "ohTaxableBusinessIncome",
    type: "money",
    min: "0",
    description:
      "IT 1040 line 6 taxable business income (Schedule of Business Income line 15: business income remaining after the $250,000/$125,000 Business Income Deduction, limited to the line 5 Ohio income tax base) — taxed flat 3% by us.oh.business_income_tax. In dollars.",
    default: { value: "0", rationale: "No taxable business income absent contrary input" },
  },
  {
    id: "ohEligibleRetirementIncome",
    type: "money",
    min: "0",
    description:
      "Retirement income received on account of retirement and still INCLUDED in Ohio AGI (both spouses combined) — the us.oh.retirement_income_credit Table 2 input. Excludes everything deducted on the Schedule of Adjustments (Social Security, railroad, uniformed-services retirement). In dollars.",
    default: { value: "0", rationale: "No qualifying retirement income absent contrary input" },
  },
  {
    id: "ohTaxLessCredits",
    type: "money",
    min: "0",
    description:
      "Ohio Schedule of Credits line 11 (line 8c tax less the line 2-9 credits) — the joint filing credit's percentage base. In dollars.",
    default: { value: "0", rationale: "Assumed no remaining Ohio tax absent contrary input" },
  },
  {
    id: "ohBothSpousesHaveQualifyingIncome",
    type: "bool",
    description:
      "Ohio joint filing credit gate attested: each spouse has at least $500 of QUALIFYING income included in Ohio AGI — not interest, dividends/distributions, capital gains, or rents/royalties, and not amounts deducted on the Schedule of Adjustments (deducted business income, Social Security, uniformed-services retirement never qualify).",
    default: { value: false, rationale: "Conservative: per-spouse $500 qualifying income not attested — no joint filing credit" },
  },
  {
    id: "ohFederalCdccTentative",
    type: "money",
    min: "0",
    description:
      "Federal Form 2441 line 9c (the tentative child and dependent care credit BEFORE the federal liability limit; equals line 9a absent prior-year-expense amounts) — the Ohio CDCC's 100% base when MAGI is under $20,000. In dollars.",
    default: { value: "0", rationale: "No federal Form 2441 tentative credit absent contrary input" },
  },
  {
    id: "ohFederalCdccAllowed",
    type: "money",
    min: "0",
    description:
      "Federal Form 2441 line 11 (the liability-LIMITED child and dependent care credit actually allowed federally) — the Ohio CDCC's 25% base when MAGI is $20,000-$39,999. In dollars.",
    default: { value: "0", rationale: "No federal Form 2441 allowed credit absent contrary input" },
  },
];
