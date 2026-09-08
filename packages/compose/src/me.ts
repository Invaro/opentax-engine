/**
 * 2025 Maine Form 1040ME line composer (full-year resident; line numbers per
 * the printed form). Oracle targets: the line 20 tax (table / rate schedule),
 * the standard and Schedule 2 itemized deductions and their phase-out, the
 * $5,150 personal exemption and its phase-out, the pension income deduction,
 * the dependent exemption, child care, adult dependent care, earned income,
 * and other-jurisdiction credits, the Property Tax Fairness and Sales Tax
 * Fairness Credits, and the use tax. Composed here per the printed form: the
 * line 13 exemption count, Schedule 1A/1S totals (100% Social Security, the
 * 529 cap), the line 17 larger-of, Schedule A Sections 1 and 2 with the $500
 * refundable splits and the line 23 limit, lines 24-35.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));

export function composeME(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Maine Form 1040ME composer");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const joint = mfj || fs === "qss";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = (input.dependents as number) ?? 0;
  const under6 = Math.min((input.meDependentsUnderSix as number) ?? 0, deps);
  const rawBoxes = Math.min((input.ageOrBlindBoxes as number) ?? 0, 4);
  // chart footnote: "*The additional deduction amounts for your spouse (boxes 12c and 12d) apply only if you can claim an exemption for your spouse."
  const boxes = mfs && input.meSpouseNoIncomeMfs !== true ? Math.min(rawBoxes, 2) : rawBoxes;
  if (mfs && rawBoxes > boxes) notes.push("ME lines 12c-12d: the spouse's 65+/blind boxes count only when you can claim an exemption for your spouse (pass meSpouseNoIncomeMfs) — limited to your own two boxes");
  if (fs === "qss") notes.push("ME filing status 7 'Qualifying surviving spouse with dependent child' — the married-filing-jointly column of the tax table and Rate Schedule #3, the $30,000 standard deduction, and one personal exemption");
  if (mfs) notes.push("ME married filing separately: Rate Schedule #1 / the single column, the $15,000 standard deduction, and no Property Tax or Sales Tax Fairness Credit; both spouses must itemize or both use the standard deduction");

  // ---- line 13: exemptions ----
  let l13: number;
  if (mfj) l13 = (dependentFiler ? 0 : 1) + (input.meSpouseClaimedAsDependent === true ? 0 : 1);
  else if (mfs) l13 = (dependentFiler ? 0 : 1) + (input.meSpouseNoIncomeMfs === true ? 1 : 0);
  else l13 = dependentFiler ? 0 : 1;
  const l13a = deps;

  // ---- lines 14-16 ----
  const l14 = rd(c(input.federalAGI));
  const l15a = D(input.meNonMaineBondInterest) + D(input.additions);
  if (l15a > 0n) notes.push(`ME line 15a (Schedule 1A): additions ${fmtD(l15a)} — non-Maine state and municipal bond income ${fmtD(D(input.meNonMaineBondInterest))} plus other additions ${fmtD(D(input.additions))}`);
  const ss = D(input.taxableSocialSecurity);
  const pensionFor = (own: unknown, ssRec: unknown): Cents =>
    c(own) > 0n || D(input.meMilitaryRetirement) > 0n
      ? rd(evalStateTax("us.me.pension_deduction", 0n, { meFederalAgi: l14, meNonMilitaryPension: c(own), meSocialSecurityReceived: c(ssRec), meMilitaryRetirement: 0n }))
      : 0n;
  const pensionA = pensionFor(input.meNonMilitaryPension, input.meSocialSecurityReceived);
  const pensionB = mfj ? pensionFor(input.meSpouseNonMilitaryPension, input.meSpouseSocialSecurityReceived) : 0n;
  const military = D(input.meMilitaryRetirement);
  const l1s4 = pensionA + pensionB + military;
  if (l1s4 > 0n) notes.push(`ME Schedule 1S line 4: pension income deduction ${fmtD(l1s4)} — up to $48,216 of eligible non-military pension per recipient less Social Security and railroad benefits received${l14 > (joint ? 25000000n : fs === "hoh" ? 18750000n : 12500000n) ? ", phased out on federal AGI above the threshold" : ""}${military > 0n ? `; military retirement ${fmtD(military)} fully exempt` : ""}; enclose the worksheet and 1099-R forms`);
  const cap529 = 100000n * BigInt(Math.max(1, (input.me529Beneficiaries as number) ?? 1));
  const agiLimit529 = fs === "single" || mfs ? 10000000n : 20000000n;
  const c529 = l14 <= agiLimit529 ? min2(D(input.me529Contributions), cap529) : 0n;
  if (D(input.me529Contributions) > 0n && c529 < D(input.me529Contributions)) notes.push(l14 > agiLimit529 ? `ME Schedule 1S line 8: no 529 deduction — federal AGI exceeds ${fmtD(agiLimit529)}` : `ME Schedule 1S line 8: 529 contributions capped at $1,000 per beneficiary (${fmtD(cap529)})`);
  const other1s = D(input.meUsInterest) + D(input.meStateRefund) + D(input.meMilitaryPay) + D(input.subtractions);
  const l15b = ss + l1s4 + c529 + other1s;
  if (ss > 0n) notes.push(`ME Schedule 1S line 3: Social Security and railroad benefits ${fmtD(ss)} subtracted in full (§ 5122(2)(C))`);
  if (other1s > 0n) notes.push(`ME Schedule 1S other subtractions ${fmtD(other1s)} (U.S. bond interest, state refund, non-Maine active duty pay, other transcribed lines)`);
  const l16 = l14 + l15a - l15b;

  // ---- line 17: deduction ----
  const stdBefore = rd(evalStateTax("us.me.standard_deduction", 0n, { meAgeBlindBoxes: boxes }));
  if (dependentFiler) notes.push(`ME line 17: a filer claimable as a dependent takes the full chart standard deduction (${fmtD(stdBefore)}) — the amended § 5124-C(1-B) incorporates only the federal age/blind amounts, not the § 63(c)(5) dependent limitation; line 13 exemptions are zero`);
  const itemizedFederally = input.meFederalItemized === true;
  let sched2 = 0n;
  if (itemizedFederally) {
    sched2 = rd(
      evalStateTax("us.me.itemized_deductions", 0n, {
        meFederalItemizedDeductions: c(input.meFederalItemizedDeductions), meSaltTaxes5e: c(input.meSaltTaxes5e), meExemptIncomeCosts: c(input.meExemptIncomeCosts), meFinancialInstitutionCosts: c(input.meFinancialInstitutionCosts),
        meMedicalDeduction: c(input.meMedicalDeduction), meMaineTaxableIncomeCosts: c(input.meMaineTaxableIncomeCosts), meRealEstateTaxes5b: c(input.meRealEstateTaxes5b), mePersonalPropertyTaxes5c: c(input.mePersonalPropertyTaxes5c),
      }),
    );
  }
  const itemize = itemizedFederally && sched2 > stdBefore;
  const dedBefore = itemize ? sched2 : stdBefore;
  const l17 = rd(evalStateTax("us.me.deduction_phaseout", 0n, { meAgi: l16, meDeductionBeforePhaseout: dedBefore }));
  if (itemizedFederally) notes.push(itemize ? `ME line 17: Schedule 2 itemized deductions ${fmtD(sched2)} (federal total less taxes and medical, plus real estate and personal property taxes, capped at $36,300, plus medical uncapped) beat the ${fmtD(stdBefore)} standard deduction` : `ME line 17: the ${fmtD(stdBefore)} standard deduction is used — Schedule 2 itemized deductions are ${fmtD(sched2)} after removing taxes ('If the amount on Schedule 2, line 7 is less than your allowable standard deduction, use the standard deduction')`);
  if (l17 < dedBefore) notes.push(`ME line 17: deduction ${fmtD(dedBefore)} reduced to ${fmtD(l17)} by the phase-out — Maine AGI ${fmtD(l16)} exceeds ${joint ? "$200,050" : fs === "hoh" ? "$150,000" : "$100,000"} (§§ 5124-C(2), 5125(7); ratio to four decimals)`);

  // ---- line 18: exemption ----
  const l18 = rd(evalStateTax("us.me.personal_exemption", 0n, { meExemptions: l13, meAgi: l16 }));
  if (l13 > 0 && l18 < 515000n * BigInt(l13)) notes.push(`ME line 18: personal exemption ${fmtD(515000n * BigInt(l13))} reduced to ${fmtD(l18)} — Maine AGI exceeds ${joint ? "$400,100" : fs === "hoh" ? "$366,750" : mfs ? "$200,050" : "$333,450"} (§ 5126-A(2))`);
  if (l13 === 0) notes.push("ME line 13: zero exemptions — claimable as a dependent on another return (line 18 = $0)");
  const l19 = max0(l16 - l17 - l18);

  // ---- lines 20-24 ----
  const useSched = input.meUseRateSchedule === true;
  const l20 = rd(evalStateTax("us.me.income_tax", l19, { meUseRateSchedule: useSched }));
  const handoff = !useSched && l19 >= 10000000n && !joint;
  notes.push(!useSched && l19 < 10000000n ? "ME line 20: 2025 tax table ($100-row midpoint on the printed rate schedule) — 'Find the tax for the amount on line 19 in the tax table'; pass meUseRateSchedule for the schedule at the exact income (differs by up to about $4)" : handoff ? `ME line 20: the tax table's '100,000 and over' hand-off — '${fs === "hoh" ? "6,384" : "6,638"} plus 7.15% of excess over 100,000' (the last row's value; Rate Schedule #${fs === "hoh" ? 2 : 1} at the exact income differs by up to $3 — pass meUseRateSchedule)` : `ME line 20: Rate Schedule #${joint ? 3 : fs === "hoh" ? 2 : 1} applied at the exact income${l19 >= 10000000n ? " (taxable income $100,000 or more is above the table)" : ""}`);
  const l20a = D(input.meCreditRecapture);
  const l22 = l20 + l20a;
  // Schedule A
  const fedCdcc = D(input.meFederalChildCareCredit);
  let ccTotal = 0n;
  if (fedCdcc > 0n) {
    ccTotal = rd(evalStateTax("us.me.child_care_credit", 0n, { meFederalChildCareCredit: fedCdcc, meChildCareExpenses: c(input.meChildCareExpenses), meStar5ChildCareExpenses: c(input.meStar5ChildCareExpenses) }));
    notes.push(`ME child care credit ${fmtD(ccTotal)} — 25% of the ${fmtD(fedCdcc)} federal credit${D(input.meStar5ChildCareExpenses) > 0n ? " (50% for the Star 5 provider share)" : ""}; up to $500 refundable (Schedule A line 2), the rest nonrefundable (line 11)`);
  }
  const ccRefundable = min2(ccTotal, 50000n);
  const ccNonrefundable = ccTotal - ccRefundable;
  let adcTotal = 0n;
  if (D(input.meAdultCareExpenses) > 0n) {
    adcTotal = rd(evalStateTax("us.me.adult_dependent_care_credit", 0n, { meAdultCareExpenses: c(input.meAdultCareExpenses), meAdultCareQualifyingIndividuals: (input.meAdultCareQualifyingIndividuals as number) ?? 1, meFederalAgi: l14 }));
    notes.push(`ME adult dependent care credit ${fmtD(adcTotal)} — 25% × the federal percentage × up to $3,000 / $6,000 of adult day care, hospice, and respite expenses; up to $500 refundable (Schedule A line 3), the rest nonrefundable (line 12)`);
  }
  const adcRefundable = min2(adcTotal, 50000n);
  const adcNonrefundable = adcTotal - adcRefundable;
  let ojc = 0n;
  if (D(input.meOtherJurisdictionTax) > 0n && D(input.meOtherJurisdictionIncome) > 0n) {
    ojc = rd(evalStateTax("us.me.other_jurisdiction_credit", 0n, { meAgi: l16, meTaxBeforeCredits: l20, meOtherJurisdictionIncome: c(input.meOtherJurisdictionIncome), meOtherJurisdictionTax: c(input.meOtherJurisdictionTax) }));
    notes.push(`ME Schedule A line 14: credit for income tax paid to another jurisdiction ${fmtD(ojc)} — the smaller of Maine tax × ${fmtD(D(input.meOtherJurisdictionIncome))} ÷ ${fmtD(l16)} (four decimals) and the ${fmtD(D(input.meOtherJurisdictionTax))} paid; one worksheet per jurisdiction; enclose that return`);
  }
  const otherNonref = D(input.nonrefundableCredits);
  const schA21 = ccNonrefundable + adcNonrefundable + ojc + otherNonref;
  const l23 = min2(schA21, max0(l22));
  if (schA21 > l22) notes.push(`ME line 23: nonrefundable credits ${fmtD(schA21)} limited to the ${fmtD(l22)} tax (Schedule A line 23 'the smaller of line 21 or line 22')`);
  const l24 = l22 - l23;

  // ---- line 25: payments and refundable credits ----
  const l25a = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l25b = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  let depCredit = 0n;
  if (deps > 0) {
    depCredit = rd(evalStateTax("us.me.dependent_exemption_credit", 0n, { meDependentsSixPlus: deps - under6, meDependentsUnderSix: under6, meAgi: l16 }));
    notes.push(`ME Schedule A line 1: dependent exemption tax credit ${fmtD(depCredit)} — $305 × ${deps - under6} dependent(s) 6 or older + $610 × ${under6} under 6${l16 > (joint ? 15000000n : fs === "hoh" ? 12500000n : mfs ? 7500000n : 10000000n) ? ", reduced $20 per $500 of Maine AGI over the threshold" : ""}; refundable (pass meDependentsUnderSix for the doubled amount)`);
  }
  const fedEic = D(input.federalEITC);
  const hasQc = input.meHasQualifyingChild === true;
  const eitc = fedEic > 0n ? rd(evalStateTax("us.me.eitc", 0n, { meFederalEic: fedEic, meHasQualifyingChild: hasQc })) : 0n;
  if (eitc > 0n) notes.push(`ME Schedule A line 4: earned income tax credit ${fmtD(eitc)} = ${hasQc ? "25%" : "50% (no qualifying child)"} of the ${fmtD(fedEic)} federal EIC; refundable${!hasQc && deps > 0 && input.meHasQualifyingChild === undefined ? " — pass meHasQualifyingChild if a dependent is an EIC qualifying child (25%)" : ""}`);
  const studentLoan = min2(D(input.meStudentLoanCredit), 250000n);
  const otherRef = D(input.refundableCredits);
  const l25c = depCredit + ccRefundable + adcRefundable + eitc + studentLoan + otherRef;
  // PTFC / STFC
  const totalIncomeGiven = typeof input.meTotalIncome === "number";
  const totalIncome = totalIncomeGiven ? rd(c(input.meTotalIncome)) : l14;
  let l25d = 0n;
  const ptfcBase = D(input.mePropertyTaxPaid) + D(input.meRentPaid);
  if (ptfcBase > 0n && !mfs) {
    l25d = rd(
      evalStateTax("us.me.property_tax_fairness_credit", 0n, {
        meTotalIncome: totalIncome, mePropertyTaxPaid: c(input.mePropertyTaxPaid), meRentPaid: c(input.meRentPaid), meRentIncludesUtilities: input.meRentIncludesUtilities === true, meUtilitiesAmount: c(input.meUtilitiesAmount),
        meAge65: input.meAge65 === true, meDisabledVeteran: input.meDisabledVeteran === true, meDependents13a: l13a,
      }),
    );
    notes.push(l25d > 0n ? `ME line 25d (Schedule PTFC/STFC): Property Tax Fairness Credit ${fmtD(l25d)} — benefit base (property tax + 15% of rent, capped) over 4% of total income ${fmtD(totalIncome)}, up to ${input.meAge65 === true ? "$2,000 (65 or older)" : "$1,000"}${input.meDisabledVeteran === true ? ", doubled for a 100% disabled veteran" : ""}; refundable${totalIncomeGiven ? "" : "; total income assumed = federal AGI — pass meTotalIncome (federal total income plus nontaxable Social Security, tax-exempt interest, and loss add-backs)"}` : `ME line 25d: no Property Tax Fairness Credit — the benefit base does not exceed 4% of total income ${fmtD(totalIncome)}`);
  } else if (ptfcBase > 0n && mfs) notes.push("ME line 25d: no Property Tax Fairness Credit for married filing separately");
  let l25e = 0n;
  if (!mfs && !dependentFiler) {
    l25e = rd(evalStateTax("us.me.sales_tax_fairness_credit", 0n, { meTotalIncome: totalIncome, meDependents13a: l13a, isClaimedAsDependent: false }));
    if (l25e > 0n) notes.push(`ME line 25e (Schedule PTFC/STFC): Sales Tax Fairness Credit ${fmtD(l25e)} — total income ${fmtD(totalIncome)}${totalIncomeGiven ? "" : " (assumed = federal AGI; pass meTotalIncome)"} against the 2025 table for ${fs === "hoh" ? "head of household" : joint ? "joint filers" : "single"} with ${l13a} dependent(s); refundable`);
  }
  const l25f = l25a + l25b + l25c + l25d + l25e;

  // ---- lines 26-35 ----
  const l26 = D(input.meAmendedOverpayment);
  const l27 = l25f - l26;
  const l24pos = max0(l24);
  const l28 = l27 > l24pos ? l27 - l24pos : 0n;
  const l29 = l24pos > l27 ? l24pos - l27 : 0n;
  const l30 = D(input.meUseTaxPurchases) > 0n || input.meUseTaxEstimate === true ? rd(evalStateTax("us.me.use_tax", 0n, { meUseTaxPurchases: c(input.meUseTaxPurchases), meUseTaxEstimate: input.meUseTaxEstimate === true, meAgi: l16 })) : 0n;
  if (l30 > 0n) notes.push(`ME line 30: use tax ${fmtD(l30)} — 5.5% of untaxed purchases${input.meUseTaxEstimate === true ? " plus the 0.04%-of-Maine-AGI estimate" : ""}`);
  const l30a = D(input.meCasualRentalSalesTax);
  const l31 = D(input.meContributions);
  const l32 = D(input.meUnderpaymentPenalty);
  const extras = l30 + l30a + l31 + l32;
  const l33 = l28 > extras ? l28 - extras : 0n;
  const l35 = l29 + extras > l28 ? l29 + extras - min2(l28, extras) : 0n;
  const l34a = min2(D(input.meCreditForward), l33);
  const l34b = l33 - l34a;
  if (l34b > 0n && l34b < 100n) notes.push("ME line 34b: 'Refunds of $1.00 or more will be issued' — a refund under $1 is not issued");
  if (l35 > 0n && l35 < 100n) notes.push("ME line 35: 'If you owe less than $1.00, do not pay it'");
  if (l35 > 0n && l32 === 0n && l24pos - l25a - l25c - l25d - l25e >= 100000n) notes.push("ME line 32: line 24 less lines 25a, 25c, 25d, and 25e is $1,000 or more — check Form 2210ME for an underpayment penalty");

  notes.push("ME scope: Form 1040ME is composed for a full-year RESIDENT — safe harbor, part-year, and nonresidents apply Schedule NR/NRH (not composed); Schedule 1A/1S lines not modeled, Schedule A business credits, the student loan credit worksheet, Form 2210ME, and Schedule CP are inputs; Maine conforms to the IRC as of December 31, 2024 for 2025 (pre-OBBBA federal standard deduction); no local income tax");

  const put = (k: string, v: Cents): Record<string, string> => (v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    "13_exemptions": String(l13),
    "13a_dependents": String(l13a),
    "14_federal_agi": fmtD(l14),
    ...put("15a_additions", l15a),
    ...put("15b_subtractions", l15b),
    ...put("1S3_social_security", ss),
    ...put("1S4_pension_deduction", l1s4),
    "16_maine_agi": fmtD(l16),
    ...put("sched2_itemized", sched2),
    "17_deduction": fmtD(l17),
    _deduction_method: itemize ? "itemized" : "standard",
    "18_exemption": fmtD(l18),
    "19_taxable_income": fmtD(l19),
    "20_income_tax": fmtD(l20),
    _tax_method: !useSched && l19 < 10000000n ? "tax table" : handoff ? "tax table hand-off" : "rate schedule",
    ...put("20a_credit_recapture", l20a),
    "22_total_tax": fmtD(l22),
    ...put("A11_child_care_nonrefundable", ccNonrefundable),
    ...put("A12_adult_care_nonrefundable", adcNonrefundable),
    ...put("A14_other_jurisdiction_credit", ojc),
    "23_nonrefundable_credits": fmtD(l23),
    "24_net_tax": fmtD(l24),
    ...put("25a_withholding", l25a),
    ...put("25b_estimated_payments", l25b),
    ...put("A1_dependent_exemption_credit", depCredit),
    ...put("A2_child_care_refundable", ccRefundable),
    ...put("A3_adult_care_refundable", adcRefundable),
    ...put("A4_earned_income_credit", eitc),
    ...put("A5_student_loan_credit", studentLoan),
    ...put("25c_refundable_credits", l25c),
    ...put("25d_property_tax_fairness_credit", l25d),
    ...put("25e_sales_tax_fairness_credit", l25e),
    "25f_total_payments": fmtD(l25f),
    ...put("26_amended_overpayment", l26),
    "28_overpaid": fmtD(l28),
    "29_underpaid": fmtD(l29),
    ...put("30_use_tax", l30),
    ...put("30a_casual_rental_sales_tax", l30a),
    ...put("31_contributions", l31),
    ...put("32_underpayment_penalty", l32),
    "33_net_overpayment": fmtD(l33),
    ...put("34a_credit_forward", l34a),
    "34b_refund": fmtD(l34b),
    "35_total_due": fmtD(l35),
  };
}
