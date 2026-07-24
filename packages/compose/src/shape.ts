/**
 * compute_state_return input shape — grouped by scope: shared inputs first,
 * then one block per state. Every field is agent-transcribed FACT or an
 * oracle-target answer; the composers never invent amounts.
 */
import { z } from "zod";

const usd = z.number().finite();

const shared = {
  jurisdiction: z.enum(["il", "va", "ca", "ny", "pa"]),
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

export const stateReturnShape = { ...shared, ...il, ...va, ...ca, ...ny, ...pa };
