/**
 * 2025 PA-40 line composer (line numbers per the printed form, rev 04-25).
 *
 * PA delegates nearly all arithmetic to the corpus targets — the class-netted
 * line 9 (us.pa.taxable_income), Schedule O line 10 (us.pa.other_deductions),
 * the 3.07% line 12 (us.pa.income_tax), and Schedule SP line 21
 * (us.pa.tax_forgiveness) — feeding them the transcribed class facts via
 * extraFacts. The composer's own work is the printed line set, the loss-oval
 * display convention, the payment/refund arithmetic, and the WPTC note (the
 * Working Pennsylvanians Tax Credit has NO printed line on the 2025 form —
 * DOR applies it in processing).
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

/**
 * Printed per-class display on a joint return (PA-40 IN p.15): both spouses
 * positive → add; one income one loss → ONLY the income; both losses → the
 * combined loss (shown negative with the loss oval; line 9 excludes it).
 */
const classLine = (p: Cents, s: Cents): Cents => (p > 0n || s > 0n ? max0(p) + max0(s) : p + s);

export function composePA(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  // Line 1a: PA gross compensation is the W-2 BOX 16 sum; fall back to the
  // shared federal wages when no separate Box 16 total was transcribed.
  const box16 = input.paGrossCompensation !== undefined ? c(input.paGrossCompensation) : c(input.wages);
  if (input.paGrossCompensation === undefined && input.wages !== undefined) {
    notes.push("PA line 1a: W-2 Box 16 total not transcribed — federal Box 1 wages used (401(k)/elective deferrals are PA-taxable; pass paGrossCompensation when Box 16 differs)");
  }
  const l1a = rd(box16);
  const l1b = rd(c(input.paUnreimbursedExpenses));
  const l1c = max0(l1a - l1b);
  const l2 = rd(c(input.paInterest));
  const l3 = rd(c(input.paDividends));
  const bizP = rd(c(input.paBusinessNet));
  const bizS = rd(c(input.paSpouseBusinessNet));
  const propP = rd(c(input.paPropertyNet));
  const propS = rd(c(input.paSpousePropertyNet));
  const rentP = rd(c(input.paRentRoyaltyNet));
  const rentS = rd(c(input.paSpouseRentRoyaltyNet));
  const l4 = classLine(bizP, bizS);
  const l5 = classLine(propP, propS);
  const l6 = classLine(rentP, rentS);
  const l7 = rd(c(input.paEstateTrust));
  const l8 = rd(c(input.paGambling));

  // Class facts for the corpus targets — fact ids must match the corpus.
  // paCompensationAdjustment stays at its $0 default because wages here IS
  // the Box 16 amount already.
  const extra: Record<string, Cents | boolean | number> = {
    wages: box16,
    paUnreimbursedBusinessExpenses: c(input.paUnreimbursedExpenses),
    paInterestIncome: c(input.paInterest),
    paDividendIncome: c(input.paDividends),
    paBusinessNetIncome: c(input.paBusinessNet),
    paSpouseBusinessNetIncome: c(input.paSpouseBusinessNet),
    paPropertyGainNet: c(input.paPropertyNet),
    paSpousePropertyGainNet: c(input.paSpousePropertyNet),
    paRentRoyaltyNet: c(input.paRentRoyaltyNet),
    paSpouseRentRoyaltyNet: c(input.paSpouseRentRoyaltyNet),
    paEstateTrustIncome: c(input.paEstateTrust),
    paGamblingWinnings: c(input.paGambling),
    studentLoanInterest: c(input.paStudentLoanInterest),
    pa529Contributions: c(input.pa529Contributions),
    paAbleContributions: c(input.paAbleContributions),
    paMsaHsaContributions: c(input.paMsaHsaContributions),
  };

  const l9 = rd(evalStateTax("us.pa.taxable_income", 0n, extra));
  const l10 = rd(evalStateTax("us.pa.other_deductions", 0n, extra));
  const l11 = max0(l9 - l10);
  const l12 = rd(evalStateTax("us.pa.income_tax", 0n, extra));

  const l13 = rd(c(input.stateWithholding));
  const l14 = rd(c(input.priorYearOverpaymentCredited));
  const l15 = rd(c(input.estimatedPayments));
  const l16 = rd(c(input.extensionPayment));
  const l17 = rd(c(input.paNrk1Withholding));
  const l18 = l14 + l15 + l16 + l17;

  // Schedule SP (lines 19b-21): the corpus target runs the printed table;
  // the resident credit subtracts BEFORE forgiveness (SP Section IV).
  const spDeps = (input.paSpDependentChildren as number) ?? 0;
  const l21 = rd(
    evalStateTax("us.pa.tax_forgiveness", 0n, {
      ...extra,
      paSpDependentChildren: spDeps,
      paEligibilityIncomeAddbacks: c(input.paEligibilityAddbacks),
      paResidentCredit: c(input.paResidentCredit),
    }),
  );
  const l20 = l9 + rd(c(input.paEligibilityAddbacks));

  const l22 = rd(c(input.paResidentCredit));
  const l23 = rd(c(input.paScheduleDcCredit)) + rd(c(input.paScheduleOcCredits));
  const l24 = l13 + l18 + l21 + l22 + l23;
  const l25 = rd(c(input.useTax));
  const l26 = max0(l12 + l25 - l24); // "if Line 12 + Line 25 is more than Line 24"
  const l27 = rd(c(input.paPenaltiesInterest));
  const l28 = l26 + l27;
  const l29 = max0(l24 - l12 - l25 - l27);

  // WPTC: no printed line — DOR computes 10% of the federal EITC (max $805,
  // refundable) from the attached federal return.
  const fedEITC = c(input.federalEITC);
  if (fedEITC > 0n) {
    const wptc = min2(rd((fedEITC * 10n) / 100n), 80500n);
    notes.push(`PA Working Pennsylvanians Tax Credit ${fmtD(wptc)} (10% of federal EITC, max $805, refundable) — NO line on the printed 2025 PA-40; DOR applies it in processing from the attached federal return`);
  }
  notes.push("PA local earned income tax (Act 32) is filed separately with the local collector — out of scope for the PA-40");
  if (l29 > 0n && l29 <= 100n) notes.push("PA does not issue refunds of $1.00 or less");
  if (l28 > 0n && l28 <= 100n) notes.push("PA does not require payment of $1.00 or less");

  return {
    "1a_gross_compensation": fmtD(l1a),
    "1b_unreimbursed_expenses": fmtD(l1b),
    "1c_net_compensation": fmtD(l1c),
    "2_interest": fmtD(l2),
    "3_dividends": fmtD(l3),
    "4_business_net": fmtD(l4),
    "5_property_net": fmtD(l5),
    "6_rent_royalty_net": fmtD(l6),
    "7_estate_trust": fmtD(l7),
    "8_gambling": fmtD(l8),
    "9_total_taxable_income": fmtD(l9),
    "10_other_deductions": fmtD(l10),
    "11_adjusted_taxable_income": fmtD(l11),
    "12_tax": fmtD(l12),
    "13_withholding": fmtD(l13),
    "14_prior_year_credit": fmtD(l14),
    "15_estimated_payments": fmtD(l15),
    "16_extension_payment": fmtD(l16),
    "17_nonresident_withholding": fmtD(l17),
    "18_total_estimated_and_credits": fmtD(l18),
    "19b_sp_dependents": String(spDeps),
    "20_eligibility_income": fmtD(l20),
    "21_tax_forgiveness": fmtD(l21),
    "22_resident_credit": fmtD(l22),
    "23_other_credits": fmtD(l23),
    "24_total_payments_credits": fmtD(l24),
    "25_use_tax": fmtD(l25),
    "26_tax_due": fmtD(l26),
    "27_penalties_interest": fmtD(l27),
    "28_total_due": fmtD(l28),
    "29_overpayment": fmtD(l29),
    "30_refund": fmtD(l29),
  };
}
