/**
 * compute_state_return input shape — grouped by scope: shared inputs first,
 * then one block per state. Every field is agent-transcribed FACT or an
 * oracle-target answer; the composers never invent amounts.
 */
import { z } from "zod";

const usd = z.number().finite();

const shared = {
  jurisdiction: z.enum(["il", "va", "ca", "ny", "pa", "nj", "oh", "nc", "ga", "md"]),
  filingStatus: z.enum(["single", "mfj", "mfs", "hoh", "qss"]).optional().describe("REQUIRED in practice: the federal filing status — drives the state bracket schedule, standard deduction column, and exemption structure. The filingJoint/filingHoh/filingHohOrQss booleans are legacy aliases; when filingStatus is present it wins."),
  // federal substrate values, computed by compute_return in the SAME session
  // (pass them verbatim — whole dollars)
  federalAGI: usd.optional().describe("federal Form 1040 line 11 (from compute_return, verbatim). REQUIRED for il/va/ca/ny — the composer refuses without it. NOT used by PA (class-based: pass the pa* class fields instead)."),
  federalEITC: usd.optional().describe("federal EIC, line 27a (from compute_return)"),
  wages: usd.optional().describe("federal line 1a wages (NY IT-201 line 1)"),
  additions: usd.optional().describe("total state additions to federal AGI (e.g. NY 414(h) A-104 + IRC-125 A-101; VA Schedule ADJ line 2 codes). GATE RULE: coded addition/subtraction line-item arrays sitting under a false 'do you have additions/subtractions' boolean are inactive template rows (especially $1-$4 placeholder amounts) — transcribe $0 for them and disclose; the gate controls for these arrays"),
  subtractions: usd.optional().describe("total state subtractions OTHER than the automatic ones (taxable social security / unemployment have their own inputs below; e.g. NY S-136 alimony paid, IL retirement subtraction)"),
  exemptions: z.number().int().optional().describe("personal + dependent exemption COUNT (self + spouse + dependents)"),
  ageOrBlindBoxes: z.number().int().optional().describe("count of age-65+/blind boxes checked (taxpayer/spouse, per box)"),
  dependents: z.number().int().optional().describe("dependent count (CA dependent exemption credits; NY $1,000 exemptions)"),
  stateWithholding: usd.optional().describe("state income tax withheld (IL line 25 / VA 19a / CA 71 / NY 72). CONVENTIONS: IL line 25 sums state withholding from EVERY document (W-2s + all 1099s). NY line 72 = W-2 box 17 NYS withholding PLUS NY-coded state withholding from 1099s whose PAYER has an in-state (NY) address; NY-coded withholding printed by an OUT-OF-STATE-addressed payer is NOT included; disclose any excluded amount in notes. VA 19a = the PRIMARY taxpayer's withholding from EVERY document type (W-2, 1099, VK-1 — Form 760 line 19 instructions name all three; the payer's address does NOT matter for VA, unlike NY); a jointly-issued document's state withholding splits 50/50 between 19a/19b with the odd dollar to the primary."),
  spouseStateWithholding: usd.optional().describe("VA line 19b spouse withholding (spouse's own W-2/1099/VK-1 boxes + spouse's half of jointly-issued documents' withholding, odd dollar to the primary)"),
  cityWithholding: usd.optional().describe("NY line 73 NYC withholding"),
  yonkersWithholding: usd.optional().describe("NY line 74 Yonkers withholding (W-2 box 19 with a Yonkers locality)"),
  estimatedPayments: usd.optional().describe("state estimated payments ONLY (extension payments and prior-year credited overpayments have their own lines where the form provides them)"),
  priorYearOverpaymentCredited: usd.optional().describe("prior-year state overpayment applied toward this year's estimated tax. VA 760 line 21 (its own printed line — never fold into line 20 estimated payments). Other states: folded into the estimated-payments line."),
  extensionPayment: usd.optional().describe("payment made with an extension request. VA 760 line 22 (its own line, never folded into the estimated-payments line). NY IT-201 line 75 is the COMBINED line — 'estimated tax payments and amount paid with Form IT-370' — so for NY this is added into the same line as estimatedPayments, not kept separate."),
  taxableSocialSecurity: usd.optional().describe("federally TAXABLE social security (Form 1040 line 6b, from compute_return). REQUIRED whenever nonzero: VA (760 line 5 subtraction), CA (Schedule CA line 6 col B), and NY (IT-201 line 27) all subtract it — the composer applies the subtraction automatically; do NOT also fold it into the generic subtractions total."),
  unemploymentCompensation: usd.optional().describe("unemployment compensation included in federal AGI (Schedule 1 line 7). REQUIRED whenever nonzero: VA fully subtracts it (Va. Code § 58.1-322.02(9), Schedule ADJ) and CA excludes it (Schedule CA line 7 col B) — the composer subtracts automatically for those states; do NOT also fold it into the generic subtractions total. IL and NY tax it (no subtraction)."),
  claimedAsDependent: z.boolean().optional().describe("someone else can claim this taxpayer as a dependent (carry the prior-year 1040 'Someone can claim: You as a dependent' checkbox forward as a continuing condition unless the current-year interview contradicts it). IL: zeroes the line 10 exemption allowance when base income exceeds the exemption amount. VA: limits the standard deduction to earned income."),
  useTax: usd.optional().describe("consumer use / sales-use tax owed on the return"),
  nonrefundableCredits: usd.optional().describe("state NONREFUNDABLE credits without an oracle target — capped at the state tax due by the composer (an excess never creates a refund). VA: do NOT put the low-income credit or any VA EITC election here — passing it forces a legacy capped path; instead pass federalEITC (+ vaFamilyVagi if testing the low-income credit) and the composer computes and SELECTS the Form 760 line 23 credit itself (TY2025 refundable VA EITC = 20% of federal EIC, uncapped — it dominates whenever federal EITC > 0). IL: pass ICR raw inputs instead where fields exist."),
  refundableCredits: usd.optional().describe("state refundable credits, e.g. the NY credit block: ESCC + NYS EIC + IT-216 + NYC EIC + NYC school tax + NYC child care (WITHOUT their own oracle target, self-computed per the us.ny.parameters citation and disclosed) PLUS us.ny.it214 (the Real Property Tax Credit, which DOES have an oracle target as of TY2025 v5 — pass its computed answer here, not a hand-derived percentage of rent)"),
};

const il = {
  ilPropertyTaxPaid: usd.optional().describe("IL property tax on principal residence, net of business-use portion"),
  ilK12Expenses: usd.optional().describe("IL qualified K-12 education expenses (before the $250 floor)"),
  ilTeacherExpenses: usd.optional().describe("IL Schedule 1299-C educator materials expenses"),
  ilChildUnder12: z.boolean().optional().describe("IL CTC gate: a QUALIFYING CHILD (§ 152(c) lineage — child/stepchild/foster/sibling or their descendants) under age 12. A qualifying-relative/ODC-only dependent does NOT satisfy this even if under 12; leave false."),
  ilEitcOverride: usd.optional().describe("us.il.eitc oracle target's answer (35 ILCS 5/212(a)(vi), (b-5), (b-10): 20% of the federal EITC recomputed WITHOUT the § 32(c)(1)(A)(ii) childless age gate) — WINS over the generic 20%-of-federalEITC line-29 computation when present. MUST be used (not merely optional) for a taxpayer age 18-24 or 65+ with NO qualifying children: federalEITC alone is correctly $0 for that population under federal law, so line 29 = 20% x federalEITC would wrongly zero out Illinois' decoupled credit — pass us.il.eitc's computed answer instead. Safe to pass for every IL EITC claimant (agrees with the generic computation outside the decoupled population)."),
};

const va = {
  vaAgeDeduction: usd.optional().describe("OVERRIDE ONLY — pass vaAgeQualifyingFull/vaAgeQualifyingTested instead and the composer computes the age deduction itself (including the AFAGI social-security exclusion agents routinely miss). When splitting an odd joint total between spouses (Form 760 lines 4a/4b), the odd dollar goes to the SPOUSE."),
  vaAgeQualifyingFull: z.number().int().optional().describe("count of filers (taxpayer/spouse) born ON OR BEFORE January 1, 1939 — each gets the UNCONDITIONAL $12,000 age deduction (no income test)"),
  vaAgeQualifyingTested: z.number().int().optional().describe("count of filers born January 2, 1939 - January 1, 1961 (65+ for 2025 but income-tested): the composer computes $12,000 each, reduced dollar-for-dollar by AFAGI over $50,000 single / $75,000 married — where AFAGI = federal AGI MINUS the federally taxable social security (the SS exclusion is the step agents miss; Va. Code § 58.1-322.03(2))"),
  vaRefundableEitc: usd.optional().describe("OVERRIDE ONLY — the composer now computes the Form 760 line 23 credit itself from federalEITC + the eligibility inputs below. If passed, this refundable amount wins over the computed selection."),
  vaSpouseTaxAdjustment: usd.optional().describe("OVERRIDE ONLY — the composer now computes the VA Spouse Tax Adjustment worksheet itself when vaYourVagi/vaSpouseVagi are provided. If passed, this amount wins."),
  vaYourVagi: usd.optional().describe("PRIMARY taxpayer's separate VAGI (MFJ only — the 760 instructions' 'Worksheet for Determining Separate Virginia Adjusted Gross Income': own wages/SE/pensions, own share of joint items 50/50, own age deduction and subtractions). Enables the composer's Spouse Tax Adjustment worksheet (Form 760 line 17). vaYourVagi + vaSpouseVagi must equal line 9 VAGI."),
  vaSpouseVagi: usd.optional().describe("spouse's separate VAGI for the STA worksheet (Form 760 line 17 box; MFJ only)"),
  vaYourAgeBlindBoxes: z.number().int().optional().describe("STA worksheet Part 1 line 2: PRIMARY taxpayer's 65+/blind box count (0-2) — per-spouse exemption = boxes x $800 + $930"),
  vaSpouseAgeBlindBoxes: z.number().int().optional().describe("STA worksheet Part 1 line 2: spouse's 65+/blind box count (0-2)"),
  vaFamilyVagi: usd.optional().describe("Schedule ADJ line 10 total family VAGI (you + spouse + dependents' VAGI) for the Credit for Low-Income Individuals poverty test; defaults to line 9 VAGI when omitted"),
  // VA Schedule A (itemized) — pass the FEDERAL Schedule A component amounts;
  // the composer applies the Virginia exceptions (10% medical floor, sales-tax
  // cap, no SALT cap on property taxes, the Virginia Pease limitation) itself.
  vaItemizing: z.boolean().optional().describe("taxpayer itemized federally (VA requires the same election, Va. Code § 58.1-322.03(1)) — enables the VA Schedule A computation from the component inputs below; Form 760 line 10 replaces the line 11 standard deduction"),
  vaItemizedMedical: usd.optional().describe("VA Sch A line 1: total medical/dental expenses BEFORE any floor (VA applies its own 10%-of-FAGI floor — Virginia deconforms from the federal 7.5% floor)"),
  vaItemizedStateLocalIncomeTaxes: usd.optional().describe("VA Sch A line 5a when INCOME taxes are claimed (mutually exclusive with sales taxes)"),
  vaItemizedSalesTaxes: usd.optional().describe("VA Sch A line 5a when the general SALES tax election was made federally — capped at the Virginia SALT cap ($40,000; $20,000 MFS for TY2025)"),
  vaItemizedRealEstateTaxes: usd.optional().describe("VA Sch A line 5b real estate taxes — NOT subject to the SALT cap for Virginia"),
  vaItemizedPersonalPropertyTaxes: usd.optional().describe("VA Sch A line 5c personal property taxes — NOT subject to the SALT cap for Virginia"),
  vaItemizedOtherTaxes: usd.optional().describe("VA Sch A line 6 other taxes (foreign income tax etc.)"),
  vaItemizedMortgageInterest: usd.optional().describe("VA Sch A home mortgage interest and points (federal Schedule A amount)"),
  vaItemizedInvestmentInterest: usd.optional().describe("VA Sch A investment interest (protected from the overall limitation)"),
  vaItemizedCharitable: usd.optional().describe("VA Sch A charitable contributions (federal Schedule A amount)"),
  vaItemizedCasualty: usd.optional().describe("VA Sch A casualty/theft losses (protected from the overall limitation)"),
  vaItemizedGambling: usd.optional().describe("VA Sch A gambling losses (§ 165(d), limited to winnings; protected from the overall limitation)"),
  vaItemizedOther: usd.optional().describe("VA Sch A other itemized deductions"),
  vaScheduleAdjDeductions: usd.optional().describe("Schedule ADJ line 9 total deductions (deduction CODES like 105 continuing-teacher-education, 199 other) — prints on Form 760 line 13; these are DEDUCTIONS from VAGI, never income subtractions on line 7"),
};

const ca = {
  caCalEITC: usd.optional().describe("us.ca.caleitc result (pass the oracle target's answer)"),
  caYCTC: usd.optional().describe("us.ca.yctc result (pass the oracle target's answer)"),
  caItemizedDeductions: usd.optional().describe("CA itemized deduction total (Schedule CA Part II, line 29) — agent-computed per Schedule CA's own itemized rules WITH disclosure (differs from the federal Schedule A: no SALT cap, mortgage/medical add-backs, etc.). Form 540 line 18 takes the GREATER of this or the CA standard deduction; omit to use the standard deduction only."),
  caRentersCredit: usd.optional().describe("us.ca.renters_credit result (pass the oracle target's answer) — nonrefundable, joins the exemption credits in the line-48 subtraction from tax."),
  caAmt: usd.optional().describe("OVERRIDE for Form 540 line 61 — prefer caIsoPreference + caAmtTaxesAddback so the composer builds Schedule P AMTI and evaluates us.ca.amt itself; a passed caAmt wins."),
  caBhst: usd.optional().describe("us.ca.bhst result (pass the oracle target's answer) — Form 540 line 62 Behavioral Health Services Tax (R&TC § 17043, 1% of CA taxable income over $1,000,000); added into line 64 total tax when nonzero."),
  caEducatorExpensesDeducted: usd.optional().describe("federal educator-expense deduction claimed (§ 62(a)(2)(D)) — California does NOT conform: the composer ADDS it back on Schedule CA (line 11 col C). Pass the federal amount actually deducted (both spouses' combined)."),
  caHsaDeduction: usd.optional().describe("federal HSA deduction (Form 8889 line 13) — California does not conform to § 223: the composer ADDS it back for CA"),
  caHsaTaxableDistribution: usd.optional().describe("HSA distribution amount taxed federally (Form 8889 line 16) — not income for California: the composer SUBTRACTS it for CA"),
  caAb5GrossIncomeAddition: usd.optional().describe("gross income from businesses where the worker is classified as an EMPLOYEE for California (AB 5/Dynamex reclassification; the intake's ca_form540_schca.add_gross_income field) — Schedule CA WAGE addition, col C"),
  caAb5NetLossAddition: usd.optional().describe("net losses from businesses where the worker is an employee for California (intake ca_form540_schca.add_net_loss) — the federal Schedule C loss is disallowed for CA: Schedule CA BUSINESS addition, col C"),
  caDepreciationAddition: usd.optional().describe("CA depreciation-difference addition: federal depreciation (with § 168(k) bonus, which California NEVER conforms to) minus CA depreciation (plain MACRS on the same asset). Positive = CA income addition (Schedule CA col C on the business/rents line). Compute per-asset and disclose."),
  caTaxableEarlyDistribution: usd.optional().describe("retirement-plan early distribution amount subject to the FEDERAL § 72(t) additional tax — California imposes its own 2.5% additional tax on the same base (R&TC § 17085(c)(1), FTB 3805P); the composer computes 2.5% and prints it on Form 540 line 63"),
  caIsoPreference: usd.optional().describe("ISO exercise spread AMT preference (§ 56(b)(3) as modified by R&TC § 17062) — with caAmtTaxesAddback this lets the composer BUILD Schedule P AMTI itself (AMTI = line 19 taxable income + taxes deducted in the CA itemized deduction + this preference; standard deduction added back instead when not itemizing) and evaluate us.ca.amt internally; caAmt (a precomputed answer) wins if both are given"),
  caAmtTaxesAddback: usd.optional().describe("taxes actually included in the CA itemized deduction (property taxes etc. surviving the Schedule CA SALT adjustments) — the Schedule P line 2 addback used when the composer builds AMTI from caIsoPreference; $0 when not itemizing (the composer adds back the standard deduction instead)"),
};

const ny = {
  nyHouseholdCredit: usd.optional().describe("NYS household credit from table 2 (us.ny.parameters citation)"),
  nycTaxableIncome: usd.optional().describe("NYC taxable income (IT-201 line 47) if NYC resident"),
  nycHouseholdCredit: usd.optional().describe("NYC household credit from table 5"),
  yonkersSurcharge: usd
    .optional()
    .describe(
      "us.ny.yonkers_surcharge result (pass the oracle target's answer) — 16.75% of the Yonkers worksheet's netted base (nyYonkersBase). Added into line 62's total and printed on its own line (IT-201 LINE 55, not 54 — line 54 is MCTMT) when nonzero.",
    ),
};

const pa = {
  // PA is CLASS-BASED (eight classes, 72 P.S. § 7303) — federalAGI is NOT the
  // PA base. Transcribe the class amounts below; the composer runs the corpus
  // targets (class netting, Schedule O, 3.07% tax, Schedule SP) itself.
  paGrossCompensation: usd.optional().describe("PA-40 line 1a: W-2 BOX 16 total (NOT Box 1 — 401(k)/elective deferrals are PA-taxable; eligible retirement distributions are exempt and excluded). Falls back to the shared wages input when omitted (composer discloses). Include taxable early-distribution amounts under the cost-recovery method."),
  paUnreimbursedExpenses: usd.optional().describe("PA-40 line 1b: Schedule UE unreimbursed employee business expenses (a compensation-class expense, never a line-10 deduction)"),
  paInterest: usd.optional().describe("PA-40 line 2: PA-taxable interest (gross class — no expenses; includes commercial-annuity interest taxable as PA interest)"),
  paDividends: usd.optional().describe("PA-40 line 3: PA-taxable dividends INCLUDING mutual-fund capital-gain distributions (PA classifies them as dividends, not gains)"),
  paBusinessNet: usd.optional().describe("PA-40 line 4, TAXPAYER's own net business/profession/farm income or LOSS (negative allowed; within-class netting of the taxpayer's own activities only — a loss never crosses classes or spouses)"),
  paSpouseBusinessNet: usd.optional().describe("PA-40 line 4, SPOUSE's own net business income or loss (kept separate: PA never nets one spouse's loss against the other's income)"),
  paPropertyNet: usd.optional().describe("PA-40 line 5, taxpayer's own net gain/loss from sale/exchange/disposition of property (negative allowed; no carryover)"),
  paSpousePropertyNet: usd.optional().describe("PA-40 line 5, spouse's own net property gain/loss"),
  paRentRoyaltyNet: usd.optional().describe("PA-40 line 6, taxpayer's own net rents/royalties/patents/copyrights (short-term rentals under 30 days are BUSINESS income, line 4)"),
  paSpouseRentRoyaltyNet: usd.optional().describe("PA-40 line 6, spouse's own net rent/royalty amount"),
  paEstateTrust: usd.optional().describe("PA-40 line 7: estate/trust income (PA Schedule J; an estate or trust cannot distribute a loss — never negative)"),
  paGambling: usd.optional().describe("PA-40 line 8: gambling and lottery winnings net of wager costs (noncash PA Lottery prizes exempt; cash prizes taxable)"),
  paStudentLoanInterest: usd.optional().describe("Schedule O code S: student loan interest PAID (new deduction for 2025; the composer caps at $2,500 — pass the uncapped amount)"),
  pa529Contributions: usd.optional().describe("Schedule O code T: § 529 contributions, ALREADY capped at $19,000 per beneficiary per taxpayer-spouse (2025); no deduction for rollovers/beneficiary changes"),
  paAbleContributions: usd.optional().describe("Schedule O code A: PA ABLE contributions, capped at the federal gift-tax exclusion ($19,000 for 2025)"),
  paMsaHsaContributions: usd.optional().describe("Schedule O codes M/H: MSA + HSA contributions at the federally-allowed amounts"),
  paSpDependentChildren: z.number().int().optional().describe("Schedule SP dependent CHILDREN count (child/stepchild/adopted; grandchild of a grandparent; foster child of a foster parent — never other relatives) claimable as federal dependents; each adds $9,500 to the Tax Forgiveness eligibility-income threshold"),
  paEligibilityAddbacks: usd.optional().describe("Schedule SP Section III nontaxable add-backs (gifts, inheritances, insurance proceeds, non-PA income, nontaxable military pay, excluded home-sale gain, educational assistance, outside cash support). NOT Social Security, eligible retirement benefits, child support, or workers' comp."),
  paResidentCredit: usd.optional().describe("PA-40 line 22: resident credit for tax paid other states (Schedule G-L; not for reciprocal-state compensation: IN/MD/NJ/OH/VA/WV). Subtracts BEFORE Tax Forgiveness — the composer handles the ordering."),
  paScheduleDcCredit: usd.optional().describe("PA-40 line 23 component: the Child and Dependent Care Enhancement credit — pass us.pa.cdcc's computed answer (= 100% of the federal Form 2441 line 9a tentative credit; refundable)"),
  paScheduleOcCredits: usd.optional().describe("PA-40 line 23 component: Schedule OC restricted credits total (transcribed; no oracle target)"),
  paNrk1Withholding: usd.optional().describe("PA-40 line 17: nonresident tax withheld from PA Schedule(s) NRK-1"),
  paPenaltiesInterest: usd.optional().describe("PA-40 line 27: penalties and interest incl. estimated-underpayment penalty (REV-1630)"),
  // PA line 13 withholding uses the shared stateWithholding input: sum state
  // tax withheld from EVERY document type (W-2 box 17, W-2G box 15, 1099-R
  // box 14, 1099-MISC box 15, 1099-NEC box 5).
};

const nj = {
  // NJ is CATEGORY-BASED (NJ-1040 lines 15-26) — federalAGI is NOT the NJ
  // base. Transcribe the category nets below (a category loss is entered as
  // the negative net; the composer suppresses it per the printed no-loss
  // rule). Spouses combine within a category on a joint return (unlike PA).
  njWages: usd.optional().describe("NJ-1040 line 15: W-2 BOX 16 state wages total (falls back to the shared wages input; NJ taxes cafeteria/125 benefits and some items federal Box 1 excludes)"),
  njTaxableInterest: usd.optional().describe("NJ-1040 line 16a taxable interest (NJ-exempt: federal obligations, NJ municipal bonds — exclude here, report on 16b)"),
  njTaxExemptInterest: usd.optional().describe("NJ-1040 line 16b tax-exempt interest (reported, never taxed)"),
  njDividends: usd.optional().describe("NJ-1040 line 17 dividends"),
  njBusinessNet: usd.optional().describe("NJ-1040 line 18 net profits from business (Schedule NJ-BUS-1 Part I; negative allowed — the composer suppresses a net category loss per the printed rule)"),
  njDispositionNet: usd.optional().describe("NJ-1040 line 19 net gains from disposition of property (Schedule NJ-DOP; NO capital-gain preference, NO loss carryover; negative allowed — suppressed)"),
  njPension: usd.optional().describe("NJ-1040 line 20a TAXABLE pension/annuity/IRA distributions (NJ three-year rule / general rule basis recovery already applied; Social Security and Railroad Retirement are exempt and never entered)"),
  njPensionExcludable: usd.optional().describe("NJ-1040 line 20b excludable (previously-taxed) pension/annuity/IRA amounts — display only"),
  njPartnershipNet: usd.optional().describe("NJ-1040 line 21 distributive share of partnership income (NJK-1; negative suppressed)"),
  njScorpNet: usd.optional().describe("NJ-1040 line 22 net pro rata share of S corporation income (NJ-K-1; negative suppressed)"),
  njRentRoyaltyNet: usd.optional().describe("NJ-1040 line 23 net rents/royalties/patents/copyrights (negative suppressed)"),
  njGamblingNet: usd.optional().describe("NJ-1040 line 24 net gambling winnings (losses net WITHIN the category; NJ Lottery prizes of $10,000 or less are exempt)"),
  njAlimonyReceived: usd.optional().describe("NJ-1040 line 25 alimony received (NJ did not adopt the TCJA repeal — still NJ income)"),
  njOtherIncome: usd.optional().describe("NJ-1040 line 26 other income"),
  njPensionEligible: z.boolean().optional().describe("line 28a gate: filer (or spouse if joint) was 62+ OR blind/disabled per Social Security guidelines on the last day of the year — enables the pension exclusion (us.nj.pension_exclusion)"),
  njPensionEligibleAmount: usd.optional().describe("joint returns where only ONE spouse is 62+/disabled: that spouse's share of line 20a (the exclusion never covers the ineligible spouse's pension). Defaults to all of line 20a."),
  njOtherRetirementEligible: z.boolean().optional().describe("line 28b Worksheet D gate: filer is 62 or older (the composer auto-computes the unclaimed exclusion when earned income ≤ $3,000 and line 27 ≤ $100,000)"),
  njOtherRetirementExclusion: usd.optional().describe("OVERRIDE: hand-computed Worksheet D line 9 unclaimed exclusion (required for the $100,001-$150,000 percentage tiers)"),
  njSpecialExclusion: z.boolean().optional().describe("line 28b Special Exclusion attested: filer (and spouse if joint) will NEVER be eligible for Social Security/Railroad Retirement because the employer did not participate — adds $6,000 (MFJ/HOH/QSS) / $3,000 (single/MFS)"),
  njDomesticPartner: z.boolean().optional().describe("registered NJ domestic partner claimed as a line 6 regular exemption (+$1,000)"),
  njSeniorCount: z.number().int().optional().describe("line 7 count (0-2): filer/spouse 65 or older (born 1960 or earlier for TY2025) — $1,000 each"),
  njBlindCount: z.number().int().optional().describe("line 8 count (0-2): filer/spouse blind or disabled — $1,000 each"),
  njVeteranCount: z.number().int().optional().describe("line 9 count (0-2): filer/spouse honorably-discharged veterans — $6,000 each"),
  njCollegeDependents: z.number().int().optional().describe("line 12 count: dependents under 22 attending college full-time (five months, half support) — $1,000 each ON TOP of the $1,500 line 10/11 exemption (use the shared dependents input for the $1,500 count)"),
  njMedicalExpenses: usd.optional().describe("unreimbursed medical expenses (Worksheet F line 1) — the composer applies the 2%-of-line-29 floor"),
  njArcherMsa: usd.optional().describe("Archer MSA contributions (federal Form 8853; NJ has NO HSA deduction — never enter HSA amounts)"),
  njSeHealthInsurance: usd.optional().describe("self-employed health insurance deduction (Worksheet F line 5)"),
  njAlimonyPaid: usd.optional().describe("NJ-1040 line 32 court-ordered alimony PAID (still deductible for NJ; never child support)"),
  njConservationContribution: usd.optional().describe("NJ-1040 line 33 qualified conservation contribution (NJ land, federal amount)"),
  njHezDeduction: usd.optional().describe("NJ-1040 line 34 Health Enterprise Zone deduction (TB-56)"),
  njAbcaAdjustment: usd.optional().describe("NJ-1040 line 35 Alternative Business Calculation Adjustment (Schedule NJ-BUS-2 line 11 — the only cross-category loss softener, 20-year carryforward)"),
  njOrganDonationExpenses: usd.optional().describe("NJ-1040 line 36 organ/bone-marrow donation expenses (composer caps at $10,000)"),
  njNjbestContributions: usd.optional().describe("NJ-1040 line 37a NJBEST 529 contributions (composer caps at $10,000; all three 37a-c require gross income ≤ $200,000)"),
  njNjclassPaid: usd.optional().describe("NJ-1040 line 37b NJCLASS loan principal+interest paid (composer caps at $2,500)"),
  njTuitionPaid: usd.optional().describe("NJ-1040 line 37c NJ-institution tuition paid (composer caps at $10,000)"),
  njPropertyTaxesPaid: usd.optional().describe("NJ-1040 line 40a: property taxes due and paid on the principal residence (homeowners; after Worksheet G proration). Tenants: use njRentPaid instead and the composer applies the 18% conversion."),
  njRentPaid: usd.optional().describe("rent paid on the NJ principal residence (tenants) — the composer enters 18% of it on line 40a"),
  njMfsSameHome: z.boolean().optional().describe("MFS and both spouses maintained the SAME main home — halves the property-tax deduction cap ($7,500) and credit ($25)"),
  njCojCredit: usd.optional().describe("NJ-1040 line 44 credit for income taxes paid to other jurisdictions (Schedule NJ-COJ, hand-computed; composer caps at the line 43 tax). NO credit for Pennsylvania-reciprocal WAGES (the PA/NJ agreement) — Philadelphia wage tax DOES qualify."),
  njShelteredWorkshopCredit: usd.optional().describe("NJ-1040 line 46 Sheltered Workshop Tax Credit (GIT-317)"),
  njGoldStarCredit: usd.optional().describe("NJ-1040 line 47 Gold Star Family Counseling Credit (hours × TRICARE rate)"),
  njOrganDonorEmployerCredit: usd.optional().describe("NJ-1040 line 48 employer of organ/bone-marrow donor credit (25% of salary, up to 30 days)"),
  njUnderpaymentInterest: usd.optional().describe("NJ-1040 line 52 interest on underpayment of estimated tax (Form NJ-2210)"),
  njSrp: usd.optional().describe("NJ-1040 line 53c Shared Responsibility Payment (Worksheet L/Schedule NJ-HCC, hand-computed from coverage months; composer zeroes it below the filing threshold)"),
  njEitcOverride: usd.optional().describe("OVERRIDE: us.nj.eitc oracle answer — wins over the composer's 40%-of-federalEITC / $260 computation"),
  njEitcAgeDecoupled: z.boolean().optional().describe("flat-$260 NJEITC attested: 18+, no qualifying child, met all federal EIC requirements except age, not claimed as a dependent (NJ eliminated both federal age limits)"),
  njExcessUiWfSwf: usd.optional().describe("NJ-1040 line 59 excess UI/WF/SWF withheld (two+ employers over $184.02; Form NJ-2450)"),
  njExcessDi: usd.optional().describe("NJ-1040 line 60 excess disability insurance withheld (over $380.42; NJ-2450)"),
  njExcessFli: usd.optional().describe("NJ-1040 line 61 excess family leave insurance withheld (over $545.82; NJ-2450)"),
  njWwcCredit: usd.optional().describe("NJ-1040 line 62 Wounded Warrior Caregivers Credit (Schedule NJ-WWC; gross income ≤ $100,000 MFJ/HOH/QSS, ≤ $50,000 single/MFS)"),
  njBaitCredit: usd.optional().describe("NJ-1040 line 63 pass-through Business Alternative Income Tax credit (PTE-K-1)"),
  njFederalCdcc: usd.optional().describe("the federal Form 2441 child and dependent care credit — enables the line 64 NJ CDCC (us.nj.cdcc: 50%→10% of it by NJ taxable income, $150,000 cap)"),
  njChildrenUnder6: z.number().int().optional().describe("count of line 10/11 dependents age 5 or younger on 12/31 (born 2020 or later for TY2025) — the line 65 NJ Child Tax Credit multiplier ($1,000→$200 each by taxable income ≤ $80,000; MFS ineligible)"),
};

const oh = {
  ohBusinessIncome: usd.optional().describe("OH Schedule of Business Income Part 1 line 10: total business income (Schedule B/C/D/E/F + guaranteed payments to 20%+ owners + § 4797) — the composer runs the $250,000/$125,000 Business Income Deduction and the flat-3% line 6/8b arithmetic from it"),
  ohRetirementIncome: usd.optional().describe("retirement income received on account of retirement still INCLUDED in Ohio AGI, both spouses combined (NOT Social Security/railroad/uniformed-services amounts — those are deducted and never qualify) — drives the retirement income credit (max $200)"),
  ohAge65OrOlder: z.boolean().optional().describe("filer (or spouse) was 65 or older at year end — $50 senior citizen credit (once per return; NOT available if the lump sum distribution credit was ever taken)"),
  ohBothSpousesQualifyingIncome: z.boolean().optional().describe("joint filing credit gate: EACH spouse has $500+ of qualifying income included in Ohio AGI (not interest/dividends/capital gains/rents, and not BID-deducted business income or deducted Social Security/retirement)"),
  ohFederalCdccTentative: usd.optional().describe("federal Form 2441 line 9c (tentative credit before the federal liability limit) — the Ohio CDCC pays 100% of it when MAGI < $20,000"),
  ohFederalCdccAllowed: usd.optional().describe("federal Form 2441 line 11 (liability-limited allowed credit) — the Ohio CDCC pays 25% of it when MAGI is $20,000-$39,999"),
  ohOtherCreditsPreJfc: usd.optional().describe("OH Schedule of Credits lines 3+5+7+8 (lump sum retirement, lump sum distribution, displaced worker training, campaign contribution) — transcribed; they subtract BEFORE the joint filing credit's line-11 base"),
  ohEicOverride: usd.optional().describe("OVERRIDE: us.oh.eic oracle answer — wins over the composer's 30%-of-federalEITC line 13 computation"),
  ohNonresidentCredit: usd.optional().describe("OH Schedule of Credits line 38 nonresident credit (Ohio IT NRC, hand-computed)"),
  ohResidentCredit: usd.optional().describe("OH Schedule of Credits line 39 resident credit for taxes paid other states (Ohio IT RC, hand-computed)"),
  ohInterestPenalty: usd.optional().describe("IT 1040 line 11 interest penalty on underpayment of estimated tax (Ohio IT/SD 2210)"),
  // OH line 14 withholding uses the shared stateWithholding input (Schedule of
  // Ohio Withholding part A line 1 — never city or school district amounts);
  // line 16 refundable credits (Schedule of Credits lines 41-46, incl. the
  // IT K-1 pass-through entity credit) use the shared refundableCredits input.
};

const nc = {
  ncQualifyingChildren: z.number().int().optional().describe("D-400 line 10a: count of qualifying children for whom the federal § 24 child tax credit was ALLOWED (under 17; ODC-only dependents never count) — drives the AGI-tiered child deduction (us.nc.child_deduction)"),
  ncBaileyRetirement: usd.optional().describe("NC Schedule S line 20: Bailey settlement retirement benefits (NC/local government or US government incl. military retirees with 5+ years of creditable service as of Aug 12, 1989; state 401(k)/457 contributed before that date) — fully deducted; enclose the 1099-R"),
  ncMilitaryRetirement: usd.optional().describe("NC Schedule S line 21: military retirement pay / SBP payments for members with 20+ years of service OR Chapter 61 medical retirement — never severance, never double-claimed with Bailey"),
  ncUsObligationInterest: usd.optional().describe("NC Schedule S line 18: interest from US obligations (Treasuries, savings bonds) included in FAGI — fully deducted"),
  ncMortgageInterest: usd.optional().describe("NC Schedule A: qualified mortgage interest — the composer applies the $20,000 combined cap with real estate taxes and takes itemized only when it beats the standard deduction"),
  ncRealEstateTaxes: usd.optional().describe("NC Schedule A: real estate property taxes (NC allows NO income/sales tax deduction) — inside the $20,000 combined cap"),
  ncCharitable: usd.optional().describe("NC Schedule A: IRC § 170 charitable contributions allowed for the year (no NC dollar cap)"),
  ncMedicalExpenses: usd.optional().describe("NC Schedule A line 7a: medical/dental expenses BEFORE the floor — the composer subtracts 7.5% of federal AGI"),
  ncClaimOfRightRepayment: usd.optional().describe("NC Schedule A line 8: claim-of-right repayments over $3,000 (deducted in full)"),
  ncTaxCredits: usd.optional().describe("D-400 line 16: D-400TC total (other-state credit worksheet, historic rehab) — hand-computed; the composer caps at the line 15 tax. NC has NO EITC and NO child/dependent care credit."),
  ncUseTaxEstimate: z.boolean().optional().describe("use the printed no-receipts consumer use tax table (keyed to line 14 taxable income, us.nc.use_tax) instead of the useTax input"),
  ncPartnershipPayments: usd.optional().describe("D-400 line 21c: NC tax paid by a partnership on the filer's behalf"),
  ncScorpPayments: usd.optional().describe("D-400 line 21d: NC tax paid by an S corporation on the filer's behalf"),
  ncUnderpaymentInterest: usd.optional().describe("D-400 line 26e: interest on the underpayment of estimated income tax (Form D-422)"),
};

const ga = {
  gaDependentCount: z.number().int().optional().describe("Form 500 line 7c total dependents (7a qualified + 7b unborn-with-heartbeat; never self/spouse) — $4,000 each (us.ga.dependent_exemption)"),
  gaFederalItemized: usd.optional().describe("Form 500 line 12a: federal Schedule A total. Supplying this FORCES Georgia itemizing ('Leave Line 11 blank if you itemize deductions on your Federal return') — a federal standard-deduction filer must omit it."),
  gaItemizedAdjustments: usd.optional().describe("Form 500 line 12b: state income taxes in the federal Schedule A total plus the disallowed-SALT proration when the $10,000/$5,000 cap bound (printed formula, hand-computed)"),
  gaExclusionTier: z.enum(["none", "62to64OrDisabled", "65plus"]).optional().describe("primary taxpayer's GA retirement-exclusion tier: 62-64 during any part of the year or permanently/totally disabled ($35,000 cap) vs 65+ ($65,000 cap) (us.ga.retirement_exclusion)"),
  gaSpouseExclusionTier: z.enum(["none", "62to64OrDisabled", "65plus"]).optional().describe("spouse's GA retirement-exclusion tier (each spouse qualifies separately; never shared)"),
  gaRetirementIncome: usd.optional().describe("primary taxpayer's UNEARNED retirement income for the exclusion (pensions, interest, dividends, net rents, capital gains, royalties, military retirement; joint property at 50%; NEVER Social Security — that subtracts automatically)"),
  gaSpouseRetirementIncome: usd.optional().describe("spouse's unearned retirement income for the exclusion"),
  gaRetirementEarnedIncome: usd.optional().describe("primary taxpayer's earned income — at most $5,000 counts inside the exclusion (Schedule 1 worksheet)"),
  gaSpouseRetirementEarnedIncome: usd.optional().describe("spouse's earned income for the exclusion worksheet"),
  gaMilitaryExclusion: usd.optional().describe("GA military retirement exclusion for under-62 retirees (Schedule 1 page 3 worksheet: $17,500 + additional $17,500 when GA earned income exceeds $17,500 — hand-computed, per qualifying spouse)"),
  gaNolUtilized: usd.optional().describe("Form 500 line 15b: Georgia NOL utilized (Schedule 4; cannot exceed line 15a or the 80% limitation — composer caps at 15a)"),
  gaLicExemptions: z.number().int().optional().describe("Low Income Credit Worksheet line 2: self + spouse + natural/legally adopted children (never other dependents or unborn) (us.ga.low_income_credit)"),
  gaLic65Count: z.number().int().optional().describe("Low Income Credit Worksheet line 3: 1 if filer or spouse is 65+, 2 if both"),
  gaOtherStateCredit: usd.optional().describe("Form 500 line 18: other state(s) tax credit (printed worksheet, hand-computed; other-state return copy required)"),
  gaEligibleItemizerCredit: usd.optional().describe("Form 500 line 19: Georgia Eligible Itemizer Tax Credit (NEW 2025; up to $300 per taxpayer, itemizers with 183+ GA days or resident at year end) — TRANSCRIBE the worksheet-computed amount, never assume the full $300; composer caps at $300/$600"),
  gaIndCrCredits: usd.optional().describe("Form 500 line 20: IND-CR Summary total OTHER than the CDCC (the composer adds us.ga.cdcc itself from gaFederalCdccAllowed)"),
  gaFederalCdccAllowed: usd.optional().describe("federal Form 2441 line 11 allowed credit — GA IND-CR 202 pays 50% of it (us.ga.cdcc)"),
  gaOtherWithholding: usd.optional().describe("Form 500 line 25: GA tax withheld on G2-A / G2-FL / G2-LP / G2-RP statements (never W-2/1099 amounts — those go in the shared stateWithholding for line 24)"),
  gaUetPenalty: usd.optional().describe("Form 500 line 42: Form 500 UET estimated tax penalty"),
};

const md = {
  mdSubdivision: z.string().optional().describe("REQUIRED for MD: the taxing county where the filer resided on the LAST day of the tax year (Form 502 political-subdivision box) — one of baltimore_city, allegany, anne_arundel, baltimore_county, calvert, caroline, carroll, cecil, charles, dorchester, frederick, garrett, harford, howard, kent, montgomery, prince_georges, queen_annes, st_marys, somerset, talbot, washington, wicomico, worcester, nonresident. Drives the mandatory local tax (line 28: flat 2.25%-3.30%; Anne Arundel bracketed with its own printed table; Frederick tiered on the WHOLE income with real cliffs)."),
  mdStateRefunds: usd.optional().describe("MD line 8: taxable state/local income tax refunds included in federal AGI (subtraction)"),
  mdChildCareExpenses: usd.optional().describe("MD line 9: child and dependent care EXPENSES from federal Form 2441 line 6 — an income subtraction in Maryland (separate from any 502CR Part B credit); the composer caps it at $3,000 ($6,000 when mdChildCareTwoOrMoreDependents)"),
  mdChildCareTwoOrMoreDependents: z.boolean().optional().describe("two or more care dependents — raises the MD line 9 expense cap from $3,000 to $6,000"),
  mdPensionYou: usd.optional().describe("primary taxpayer's qualifying \u00a7 401(a)/403/457(b) pension in FAGI for the Worksheet 13A pension exclusion — ONLY if 65+/totally disabled (or spouse totally disabled); IRAs/SEP/Keogh never qualify. The composer evaluates us.md.pension_exclusion per spouse."),
  mdSsRrBenefitsYou: usd.optional().describe("primary taxpayer's TOTAL Social Security + Railroad Retirement benefits (taxable or not) — reduces the $41,200 cap in the primary's 13A column"),
  mdPensionSpouse: usd.optional().describe("spouse's qualifying pension for their own 13A column (same gates)"),
  mdSsRrBenefitsSpouse: usd.optional().describe("spouse's TOTAL SS/RR benefits for their 13A column"),
  mdRangerPension: usd.optional().describe("MD line 10b: Retired Forest/Park/Wildlife Ranger pension exclusion (Worksheet 13E, agent-computed, disclosed)"),
  mdTwoIncomeLesserSpouseNet: usd.optional().describe("Worksheet 13D line 6: the LESSER-income spouse's net Maryland income (their FAGI share + additions share − subtractions share) — the composer caps it at $1,200 for line 14 (joint returns only)"),
  mdItemizing: z.boolean().optional().describe("taxpayer itemized FEDERALLY and elects Maryland itemized deductions — the composer computes 17a−17b−17c (with the H.B. 352 7.5% phase-out over $200,000/$100,000-MFS FAGI) and still takes the standard deduction if larger (Maryland allows either)"),
  mdFederalItemized: usd.optional().describe("MD line 17a: total federal itemized deductions (federal Schedule A line 17)"),
  mdItemizedStateLocalTaxes: usd.optional().describe("MD line 17b: state and local INCOME taxes claimed in the federal Schedule A (plus preservation-easement contributions claimed as a credit) — subtracted from 17a"),
  mdEicQualifyingChild: z.boolean().optional().describe("the filer has at least one EIC qualifying child — with married filers this routes line 22 to 50% of the federal EIC (Worksheet 18A) and line 44 to the 45% refundable worksheet (21A); childless single/HOH/QSS filers instead get 100% refundable (18A.1). Also drives the Form 502 EIC checkboxes."),
  mdEarnedIncome: usd.optional().describe("MD line 1b earned income (wages + net SE profit, no loss netting) — the poverty level credit base (us.md.poverty_level_credit) and the local poverty credit (19C)"),
  mdHouseholdSize: z.number().int().optional().describe("persons in the family/household from the federal return — enables the poverty level credit computation (2025 guideline $15,650 + $5,500 each additional person)"),
  mdNetCapitalGainSubject: usd.optional().describe("Form 502CG line 9: net capital gain subject to the H.B. 352 2% surtax (line 1c gain minus the six exempt classes — primary-residence sale under $1.5M, retirement-plan assets, livestock, easement land, trade-or-business property, nonprofit affordable housing). The composer zeroes it (with a note) unless FAGI exceeds $350,000."),
  mdRecapturedCredit: usd.optional().describe("MD line 21a: recaptured credit from Form 502CR Part DD line 1"),
  mdBusinessCredits: usd.optional().describe("MD line 25: business tax credits (Form 500CR — e-file only; transcribed)"),
  md502crPartBB: usd.optional().describe("MD line 31: local tax credit from Form 502CR Part BB line 1"),
  mdCtcChildren: z.number().int().optional().describe("Maryland CTC qualified children (dependents under 6, or over 5 and under 17 with a disability) — the composer evaluates us.md.ctc ($500/child, phased out $50 per $1,000 of FAGI over $15,000, $0 above $24,000; refundable via 502CR Part CC into line 45)"),
  mdMw506nrs: usd.optional().describe("MD line 42: tax withheld on Form MW506NRS (nonresident real property sale)"),
  mdContributions: usd.optional().describe("MD lines 35-39: voluntary fund contributions total (reduces the refund)"),
  mdInterestCharges: usd.optional().describe("MD line 51: Form 502UP interest / late-filing interest"),
  mdHomebuyerPenalty: usd.optional().describe("MD line 51a: first-time homebuyer savings account 10% withdrawal penalty"),
};

export const stateReturnShape = { ...shared, ...il, ...va, ...ca, ...ny, ...pa, ...nj, ...oh, ...nc, ...ga, ...md };
