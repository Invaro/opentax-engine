/**
 * 2025 West Virginia Form IT-140 line composer (full-year resident; line
 * numbers per the printed form). Oracle targets: the line 8 tax (Tax Table /
 * Rate Schedule), the exemption deduction, the low-income exclusion, the
 * Schedule M Social Security, senior/disability, and surviving spouse
 * modifications, the Family Tax Credit, the Schedule E other-state credit, the
 * child care credit, the SCTC and HEPTC, and the use tax. Composed here per
 * the printed form: exemption boxes (a)-(e), Schedule M columns A and B with
 * the $2,000 PERS/TRS/federal and $25,000 Jumpstart caps, lines 1-7, the Tax
 * Credit Recap and line 9-10 floor, lines 11-14, the payments block 15-23 with
 * the property tax adjustment credits, and lines 24-28.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));

export function composeWV(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the West Virginia Form IT-140 composer");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = dependentFiler ? 0 : ((input.dependents as number) ?? 0);
  if (dependentFiler && ((input.dependents as number) ?? 0) > 0) notes.push("WV exemptions: 'You cannot claim any dependents if you can be claimed as a dependent on another person's return' — dependents dropped");
  if (fs === "qss") notes.push("WV filing status 5 'Widow(er) with dependent child' — Rate Schedule I and the Tax Table, like single and joint filers");
  if (mfs) notes.push("WV married filing separately: Rate Schedule II (half brackets) is mandatory — the Tax Table may not be used; Family Tax Credit Table 2 and the $5,000 low-income exclusion apply");

  // ---- exemptions (a)-(e) ----
  const boxA = dependentFiler ? 0 : 1;
  const boxB = mfj && input.wvSpouseClaimedAsDependent !== true ? 1 : 0;
  const boxC = deps;
  const boxD = input.wvSurvivingSpouseExemption === true ? 1 : 0;
  const boxE = boxA + boxB + boxC + boxD;
  if (boxD) notes.push("WV exemption box (d): surviving spouse extra $2,000 exemption — allowed for the two taxable years after the year of the spouse's death if not remarried (§ 11-21-16(c))");

  // ---- lines 1-3 ----
  const l1 = rd(c(input.federalAGI));
  const l2 = D(input.wvNonWvBondInterest) + D(input.additions);
  if (l2 > 0n) notes.push(`WV line 2 (Schedule M lines 51-59): additions ${fmtD(l2)} — non-West Virginia state and local bond interest ${fmtD(D(input.wvNonWvBondInterest))} plus other additions ${fmtD(D(input.additions))}`);
  // Schedule M decreasing modifications, columns A (you) and B (spouse)
  const ssTotal = D(input.taxableSocialSecurity);
  const ssB = mfj ? min2(D(input.wvSpouseTaxableSocialSecurity), ssTotal) : 0n;
  const ssA = ssTotal - ssB;
  const ssMod = (x: Cents): Cents => (x > 0n ? rd(evalStateTax("us.wv.social_security_modification", 0n, { wvAgi: l1, wvTaxableSocialSecurity: x })) : 0n);
  const l34A = ssMod(ssA);
  const l34B = ssMod(ssB);
  const ssLimit = mfj ? 10000000n : 5000000n;
  if (ssTotal > 0n) notes.push(l1 <= ssLimit ? `WV Schedule M line 34: Social Security ${fmtD(ssTotal)} subtracted in full — federal AGI is not over ${fmtD(ssLimit)} (§ 11-21-12(c)(8)(A)-(B))` : `WV Schedule M line 34: 65% of the ${fmtD(ssTotal)} taxable Social Security subtracted (${fmtD(l34A + l34B)}) — federal AGI exceeds ${fmtD(ssLimit)}; 100% for tax years beginning in 2026 (§ 11-21-12(c)(8)(D)-(E))`);
  const l33A = min2(D(input.wvPersTrsFederalRetirement), 200000n);
  const l33B = mfj ? min2(D(input.wvSpousePersTrsFederalRetirement), 200000n) : 0n;
  if (D(input.wvPersTrsFederalRetirement) > 200000n || (mfj && D(input.wvSpousePersTrsFederalRetirement) > 200000n)) notes.push("WV Schedule M line 33: PERS / Teachers' Retirement / federal retirement modification capped at $2,000 per person");
  if (!mfj && (D(input.wvSpouseTaxableSocialSecurity) + D(input.wvSpouseUsInterest) + D(input.wvSpouseFederalLawEnforcementRetirement) + D(input.wvSpousePoliceFireRetirement) + D(input.wvSpouseMilitaryRetirement) + D(input.wvSpousePersTrsFederalRetirement) > 0n || input.wvSpouseAge65OrDisabled === true)) notes.push("WV Schedule M column B: spouse inputs ignored — column B applies only to a joint return");
  const colA2934 = D(input.wvUsInterest) + D(input.wvFederalLawEnforcementRetirement) + D(input.wvPoliceFireRetirement) + D(input.wvMilitaryRetirement) + l33A + l34A;
  const colB2934 = mfj ? D(input.wvSpouseUsInterest) + D(input.wvSpouseFederalLawEnforcementRetirement) + D(input.wvSpousePoliceFireRetirement) + D(input.wvSpouseMilitaryRetirement) + l33B + l34B : 0n;
  const jumpstart = min2(D(input.wvJumpstartDeposits), 2500000n);
  if (D(input.wvJumpstartDeposits) > jumpstart) notes.push("WV Schedule M line 44: Jumpstart Savings deposits capped at $25,000");
  const other3546 = D(input.wvActiveDutyPay) + D(input.wvStateRefund) + D(input.wvSmart529Contributions) + D(input.wvRailroadRetirement) + D(input.wvLongTermCarePremiums) + D(input.wvAbleContributions) + jumpstart + D(input.wvGamblingLosses) + D(input.subtractions);
  const seniorMod = (eligible: boolean, otherIncome: unknown, lines2934: Cents): Cents =>
    eligible ? rd(evalStateTax("us.wv.senior_citizen_modification", 0n, { wvSeniorOrDisabled: true, wvIncomeNotOnLines35to46: typeof otherIncome === "number" ? c(otherIncome) : 800000n, wvLines29to34: lines2934 })) : 0n;
  const defaultOtherIncomeA = mfj ? 800000n : max0(l1 + l2 - other3546); // non-joint: box (c) cannot exceed the filer's income not on lines 35-46
  const l47A = seniorMod(input.wvTaxpayerAge65OrDisabled === true, typeof input.wvTaxpayerIncomeNotOnLines35to46 === "number" ? input.wvTaxpayerIncomeNotOnLines35to46 : Number(defaultOtherIncomeA) / 100, colA2934);
  const l47B = mfj ? seniorMod(input.wvSpouseAge65OrDisabled === true, input.wvSpouseIncomeNotOnLines35to46, colB2934) : 0n;
  if (l47A + l47B > 0n) notes.push(`WV Schedule M line 47: senior citizen / disability modification ${fmtD(l47A + l47B)} — up to $8,000 of each eligible person's other income, less that person's lines 29-34 (${fmtD(colA2934)} you${mfj ? `, ${fmtD(colB2934)} spouse` : ""})${typeof input.wvTaxpayerIncomeNotOnLines35to46 !== "number" ? "; box (c) assumed at the $8,000 cap — pass wvTaxpayerIncomeNotOnLines35to46 if the person's other income is under $8,000" : ""}`);
  else if (input.wvTaxpayerAge65OrDisabled === true || input.wvSpouseAge65OrDisabled === true) notes.push("WV Schedule M line 47: no senior citizen modification — the eligible person's lines 29-34 subtractions already reach $8,000");
  // booklet p. 28: lines 29-34 AND the line 47 modification reduce the $8,000; "The combined total of Line [47] and [48] can not exceed $8,000"
  const l48 = input.wvSurvivingSpouseModification === true ? rd(evalStateTax("us.wv.surviving_spouse_modification", 0n, { wvSurvivingSpouseEligible: true, wvLines29to34: colA2934 + l47A })) : 0n;
  if (l48 > 0n) notes.push(`WV Schedule M line 48: surviving spouse modification ${fmtD(l48)} — $8,000 less lines 29-34 and the line 47 modification (the two together may not exceed $8,000); one time, in the taxable year after the death`);
  const l3 = colA2934 + colB2934 + other3546 + l47A + l47B + l48;
  if (other3546 > 0n) notes.push(`WV Schedule M lines 35-46: other subtractions ${fmtD(other3546)} (active duty pay, state refunds, SMART529, Railroad Retirement, long-term care premiums, ABLE, Jumpstart, gambling losses, other)`);

  // ---- lines 4-7 ----
  const l4 = l1 + l2 - l3;
  let l5 = 0n;
  const lowCap = mfs ? 500000n : 1000000n;
  if (l1 <= lowCap) {
    if (typeof input.wvEarnedIncome === "number") {
      l5 = rd(evalStateTax("us.wv.low_income_exclusion", 0n, { wvAgi: l1, wvEarnedIncome: c(input.wvEarnedIncome) }));
      notes.push(`WV line 5: low-income earned income exclusion ${fmtD(l5)} — federal AGI ${fmtD(l1)} is not over ${fmtD(lowCap)}; the smaller of federal AGI, earned income ${fmtD(D(input.wvEarnedIncome))}, and ${fmtD(lowCap)}`);
    } else notes.push(`WV line 5: federal AGI ${fmtD(l1)} qualifies for the low-income earned income exclusion (up to ${fmtD(lowCap)}) — pass wvEarnedIncome to claim it (assumed $0)`);
  }
  const l6 = rd(evalStateTax("us.wv.exemption_deduction", 0n, { wvExemptions: boxE }));
  if (boxE === 0) notes.push("WV line 6: zero exemptions (claimable as a dependent) — the $500 allowance applies");
  const l7 = max0(l4 - l5 - l6);

  // ---- line 8 ----
  const useSchedule = input.wvUseRateSchedule === true;
  const l8 = rd(evalStateTax("us.wv.income_tax", l7, { wvUseRateSchedule: useSchedule }));
  const tableUsed = !useSchedule && !mfs && l7 >= 2500n && l7 < 10000000n;
  notes.push(tableUsed ? "WV line 8: Tax Table (Rate Schedule I at the row midpoint) — 'apply the amount of taxable income shown on line 7 to the Tax Table'; pass wvUseRateSchedule for the schedule at the exact income" : `WV line 8: Rate Schedule ${mfs ? "II" : "I"} applied at the exact income${!mfs && !useSchedule ? (l7 >= 10000000n ? " (taxable income $100,000 or more)" : " (below the table's first row)") : ""}`);

  // ---- Tax Credit Recap → line 9 ----
  const otherRecap = D(input.nonrefundableCredits);
  const fedCdcc = D(input.wvFederalChildCareCredit);
  const recap18 = fedCdcc > 0n ? rd(evalStateTax("us.wv.child_care_credit", 0n, { wvFederalChildCareCredit: fedCdcc })) : 0n;
  if (recap18 > 0n) notes.push(`WV Recap line 18: child and dependent care credit ${fmtD(recap18)} = 50% of the ${fmtD(fedCdcc)} federal credit (attach federal Form 2441); nonrefundable`);
  const familySize = boxA + boxB + boxC;
  const mfagi = l1 + l2 + D(input.wvFederalTaxExemptInterest);
  const amt = input.wvFederalAmt === true;
  const recap2 = rd(evalStateTax("us.wv.family_tax_credit", 0n, { wvFamilySize: familySize, wvModifiedAgi: mfagi, wvTaxBeforeCredits: l8, wvFederalAmt: amt }));
  if (recap2 > 0n) notes.push(`WV Recap line 2 (Schedule FTC-1): Family Tax Credit ${fmtD(recap2)} — family size ${familySize}, modified federal AGI ${fmtD(mfagi)} against the 2025 poverty-guideline table${mfs ? " (Table 2)" : ""}`);
  else if (familySize === 0 && l8 > 0n) notes.push("WV Recap line 2: no Family Tax Credit — 'Individuals who file their income tax return with zero exemptions cannot claim the credit'");
  else if (amt) notes.push("WV Recap line 2: no Family Tax Credit — federal alternative minimum tax paid");
  let recap1 = 0n;
  if (D(input.wvOtherStateTax) > 0n && D(input.wvOtherStateIncome) > 0n) {
    const altTaxable = max0(l7 - D(input.wvOtherStateIncome));
    const altTax = rd(evalStateTax("us.wv.income_tax", altTaxable, { wvUseRateSchedule: true }));
    recap1 = rd(evalStateTax("us.wv.other_state_credit", 0n, { wvOtherStateTax: c(input.wvOtherStateTax), wvTaxBeforeCredits: l8, wvOtherStateIncome: c(input.wvOtherStateIncome), wvAdjustedGrossIncome: l4, wvAlternativeTax: altTax, wvOtherRecapCredits: recap2 + recap18 + otherRecap }));
    notes.push(`WV Recap line 1 (Schedule E): credit for income tax paid to another state ${fmtD(recap1)} — the smallest of the other state's tax ${fmtD(D(input.wvOtherStateTax))}, the WV tax ${fmtD(l8)}, ${fmtD(l8)} × ${fmtD(D(input.wvOtherStateIncome))} ÷ ${fmtD(l4)}, the WV tax less the Rate Schedule tax on ${fmtD(altTaxable)} (${fmtD(altTax)}), and the WV tax less the other Recap credits; one Schedule E per state; no credit for city or foreign taxes`);
  }
  if (otherRecap > 0n) notes.push(`WV Recap lines 3-17, 19-26: other nonrefundable credits ${fmtD(otherRecap)} transcribed`);
  const recap27 = recap1 + recap2 + recap18 + otherRecap;
  const l9 = recap27;
  const l10 = max0(l8 - l9);
  if (l9 > l8) notes.push(`WV line 10: Recap credits ${fmtD(l9)} exceed the tax ${fmtD(l8)} — nonrefundable, the excess is lost`);

  // ---- lines 11-14 ----
  const l11 = D(input.wvAmendedRefund);
  const l12 = D(input.wvUnderpaymentPenalty);
  const munBps = Math.round(((input.wvMunicipalUseTaxRate as number) ?? 0) * 100);
  const l13 = D(input.wvUseTaxPurchases) + D(input.wvMunicipalUseTaxPurchases) > 0n ? rd(evalStateTax("us.wv.use_tax", 0n, { wvUseTaxPurchases: c(input.wvUseTaxPurchases), wvMunicipalUseTaxPurchases: c(input.wvMunicipalUseTaxPurchases), wvMunicipalUseTaxRateBps: munBps })) : 0n;
  if (l13 > 0n) notes.push(`WV line 13 (Schedule UT): use tax ${fmtD(l13)} — 6% state${munBps > 0 ? ` plus ${(munBps / 100).toFixed(1)}% municipal` : ""} on untaxed purchases`);
  const l14 = l10 + l11 + l12 + l13;

  // ---- lines 15-23 ----
  const l15 = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l16 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  const l17 = D(input.wvNonFamilyAdoptionCredit);
  const householdSize = Math.max(1, (input.wvHouseholdSize as number) ?? boxA + boxB + boxC);
  const householdIncome = input.wvNotRequiredToFileFederally === true && typeof input.wvHouseholdIncomeLessSocialSecurity === "number" ? D(input.wvHouseholdIncomeLessSocialSecurity) : l1;
  const dvClaimed = D(input.wvDisabledVeteranPropertyTax) > 0n;
  let l18 = 0n;
  if (D(input.wvSeniorCitizenCreditAmount) > 0n) {
    l18 = rd(evalStateTax("us.wv.senior_citizens_tax_credit", 0n, { wvHouseholdSize: householdSize, wvHouseholdIncome: householdIncome, wvFederalAmt: amt, wvDisabledVeteranCreditClaimed: dvClaimed, wvSeniorCitizenCreditAmount: c(input.wvSeniorCitizenCreditAmount) }));
    notes.push(l18 > 0n ? `WV line 18: Senior Citizens Tax Credit ${fmtD(l18)} from the mailed Schedule SCTC-A (household of ${householdSize}, income ${fmtD(householdIncome)} within 150% of the poverty guideline); refundable; not refunded if under $10` : `WV line 18: no Senior Citizens Tax Credit — ${dvClaimed ? "the Disabled Veteran credit is claimed" : amt ? "federal AMT paid" : `income ${fmtD(householdIncome)} exceeds 150% of the poverty guideline for a household of ${householdSize}`}`);
  }
  let l19 = 0n;
  if (D(input.wvPropertyTaxPaid) > 0n) {
    l19 = rd(
      evalStateTax("us.wv.homestead_excess_property_tax_credit", 0n, {
        wvHouseholdSize: householdSize, wvHouseholdIncome: householdIncome, wvFederalAmt: amt, wvDisabledVeteranCreditClaimed: dvClaimed, wvPropertyTaxPaid: c(input.wvPropertyTaxPaid), wvSeniorCitizenCredit: l18,
        wvAgi: l1, wvAdditions: l2, wvTaxExemptInterest: c(input.wvFederalTaxExemptInterest), wvWorkersCompensation: c(input.wvWorkersCompensation), wvNontaxableSocialSecurity: c(input.wvNontaxableSocialSecurity), wvOtherHouseholdIncome: c(input.wvOtherHouseholdIncome),
      }),
    );
    notes.push(l19 > 0n ? `WV line 19 (Schedule HEPTC-1): Homestead Excess Property Tax Credit ${fmtD(l19)} — property tax ${fmtD(D(input.wvPropertyTaxPaid))} less the SCTC ${fmtD(l18)}, over 4% of gross household income, capped at $1,000; refundable; attach the Class 2 receipt` : `WV line 19: no Homestead Excess Property Tax Credit — ${dvClaimed ? "the Disabled Veteran credit is claimed" : amt ? "federal AMT paid" : "property tax does not exceed 4% of gross household income, or income exceeds 300% of the poverty guideline"}`);
  }
  const l20 = D(input.wvBuildWvCredit);
  const l21a = D(input.wvMotorVehicleTaxPaid);
  const l21b = D(input.wvDisabledVeteranPropertyTax);
  const l21c = rd(c(input.wvSmallBusinessPropertyTax) / 2n); // 50%, rounded to whole dollars
  const l21 = l21a + l21b + l21c;
  if (l21a > 0n) notes.push(`WV line 21A: motor vehicle property tax adjustment credit ${fmtD(l21a)} — 100% of the personal property tax timely paid on owned vehicles (§ 11-13MM-3), refundable; attach Schedule MV-1`);
  if (l21b > 0n) notes.push(`WV line 21B: disabled veteran real property tax credit ${fmtD(l21b)} — 100% of the timely paid homestead tax (§ 11-13MM-4), refundable; the SCTC and HEPTC may not also be claimed`);
  if (l21c > 0n) notes.push(`WV line 21C: small business property tax adjustment credit ${fmtD(l21c)} — 50% of ${fmtD(D(input.wvSmallBusinessPropertyTax))} of timely paid personal property tax (§ 11-13MM-5)`);
  const l22 = D(input.wvAmendedPaid);
  const l23 = l15 + l16 + l17 + l18 + l19 + l20 + l21 + l22;

  // ---- lines 24-28 ----
  const l24 = max0(l14 - l23);
  const l25 = max0(l23 - l14);
  const l26 = D(input.wvDonations);
  const l27 = min2(D(input.wvCreditForward), max0(l25 - l26));
  const l28 = max0(l25 - l26 - l27);
  if (l26 > 0n && l25 < l26) notes.push(`WV line 26: donations ${fmtD(l26)} exceed the overpayment — the excess is added to the balance due`);
  const dueWithDonations = l24 + (l26 > l25 ? l26 - l25 : 0n);
  if (l28 > 0n && l28 <= 200n) notes.push("WV line 28: 'To receive a refund of $2 or less, you must enclose a signed statement with your return requesting that the refund be sent to you'");
  if (dueWithDonations > 0n && l12 === 0n && l8 - l9 - l15 - l17 - l18 - l19 - l20 - l21 > 60000n) notes.push("WV line 12: line 8 minus lines 9, 15, 17-21 exceeds $600 — check Form IT-210 for an underpayment penalty (90% of this year's or 100% of last year's tax)");

  notes.push("WV scope: Form IT-140 is composed for a full-year RESIDENT — nonresidents and part-year residents apportion on Schedule A (not composed); Schedules SCTC-A, HEPTC-1 receipts, MV-1, NFA-1, PVA-2, IT-210, and the Recap business credits are inputs; West Virginia has no standard or itemized deduction (only gambling losses) and no local income tax");

  const put = (k: string, v: Cents): Record<string, string> => (v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    e_total_exemptions: String(boxE),
    "1_federal_agi": fmtD(l1),
    ...put("2_additions", l2),
    ...put("3_subtractions", l3),
    ...put("M34_social_security", l34A + l34B),
    ...put("M47_senior_citizen_modification", l47A + l47B),
    ...put("M48_surviving_spouse_modification", l48),
    "4_wv_adjusted_gross_income": fmtD(l4),
    ...put("5_low_income_exclusion", l5),
    "6_exemptions": fmtD(l6),
    "7_wv_taxable_income": fmtD(l7),
    "8_income_tax": fmtD(l8),
    _tax_method: tableUsed ? "tax table" : mfs ? "rate schedule II" : "rate schedule I",
    ...put("recap1_other_state_credit", recap1),
    ...put("recap2_family_tax_credit", recap2),
    ...put("recap18_child_care_credit", recap18),
    ...put("recap_other_credits", otherRecap),
    "9_total_credits": fmtD(l9),
    "10_total_income_tax_due": fmtD(l10),
    ...put("11_amended_prior_refund", l11),
    ...put("12_underpayment_penalty", l12),
    ...put("13_use_tax", l13),
    "14_total_amount_due": fmtD(l14),
    ...put("15_withholding", l15),
    ...put("16_estimated_payments", l16),
    ...put("17_nonfamily_adoption_credit", l17),
    ...put("18_senior_citizens_tax_credit", l18),
    ...put("19_homestead_excess_property_tax_credit", l19),
    ...put("20_build_wv_credit", l20),
    ...put("21_property_tax_adjustment_credits", l21),
    ...put("22_amended_paid", l22),
    "23_payments_and_refundable_credits": fmtD(l23),
    "24_balance_due": fmtD(dueWithDonations),
    "25_overpayment": fmtD(l25),
    ...put("26_donations", l26),
    ...put("27_credit_forward", l27),
    "28_refund": fmtD(l28),
  };
}
