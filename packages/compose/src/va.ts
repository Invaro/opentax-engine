/** 2025 Virginia Form 760 line composer. Worksheets live in va-worksheets.ts. */
import { c, rd, max0, fmtD } from "./money.js";
import { isJoint, isHoh, isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";
import {
  VA_STD_DEDUCTION_JOINT,
  VA_STD_DEDUCTION_OTHER,
  VA_PERSONAL_EXEMPTION,
  VA_AGE_BLIND_EXEMPTION,
  vaAgeDeduction,
  vaLine23Credit,
  vaScheduleA,
  vaSpouseTaxAdjustment,
} from "./va-worksheets.js";

export function composeVA(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const fagi = c(input.federalAGI);
  const l1 = rd(fagi);
  // Automatic subtractions: taxable social security (760 line 5) and
  // unemployment compensation (Va. Code § 58.1-322.02(9), Schedule ADJ).
  const ssSub = rd(c(input.taxableSocialSecurity));
  const uiSub = rd(c(input.unemploymentCompensation));
  let age = rd(c(input.vaAgeDeduction));
  if (input.vaAgeDeduction === undefined && (input.vaAgeQualifyingFull !== undefined || input.vaAgeQualifyingTested !== undefined)) {
    age = vaAgeDeduction(
      {
        fullCount: (input.vaAgeQualifyingFull as number) ?? 0,
        testedCount: (input.vaAgeQualifyingTested as number) ?? 0,
        fagi: l1,
        taxableSS: ssSub,
        joint,
      },
      notes,
    );
  }
  if (ssSub > 0n) notes.push(`VA subtraction: federally taxable social security ${fmtD(ssSub)} (760 line 5)`);
  if (uiSub > 0n) notes.push(`VA subtraction: unemployment compensation ${fmtD(uiSub)} (Va. Code § 58.1-322.02(9))`);
  const l9 = rd(l1 + c(input.additions) - age - ssSub - uiSub - c(input.subtractions));
  // Exemption count defaults from the return's own shape: filers (2 on a joint
  // return) plus any dependents passed — never a bare 1 for MFJ.
  const n =
    (input.exemptions as number) ??
    (joint ? 2 : 1) + ((input.dependents as number) ?? 0);
  // 2025 Form 760: L10 itemized, L11 standard, L12 exemptions, L13 Sch ADJ deductions
  let l10 = 0n;
  let l11 = joint ? VA_STD_DEDUCTION_JOINT : VA_STD_DEDUCTION_OTHER;
  if (input.vaItemizing === true) {
    l10 = vaScheduleA(
      {
        fagi,
        medical: rd(c(input.vaItemizedMedical)),
        incomeTaxes: rd(c(input.vaItemizedStateLocalIncomeTaxes)),
        salesTaxes: rd(c(input.vaItemizedSalesTaxes)),
        realEstateTaxes: rd(c(input.vaItemizedRealEstateTaxes)),
        personalPropertyTaxes: rd(c(input.vaItemizedPersonalPropertyTaxes)),
        otherTaxes: rd(c(input.vaItemizedOtherTaxes)),
        mortgageInterest: rd(c(input.vaItemizedMortgageInterest)),
        investmentInterest: rd(c(input.vaItemizedInvestmentInterest)),
        charitable: rd(c(input.vaItemizedCharitable)),
        casualty: rd(c(input.vaItemizedCasualty)),
        gambling: rd(c(input.vaItemizedGambling)),
        other: rd(c(input.vaItemizedOther)),
        joint,
        mfs: isMfs(input),
        hoh: isHoh(input),
      },
      notes,
    );
    l11 = 0n; // itemizing: line 11 blank
  } else if (input.claimedAsDependent === true) {
    notes.push("VA standard deduction for a claimable-as-dependent filer is limited to earned income — pass vaItemizing/earned income facts if this binds");
  }
  // Age/blind boxes: derive from the per-spouse STA inputs when the flat
  // count wasn't passed — the same boxes drive both lines.
  const abBoxes =
    (input.ageOrBlindBoxes as number) ??
    ((input.vaYourAgeBlindBoxes as number) ?? 0) +
      ((input.vaSpouseAgeBlindBoxes as number) ?? 0);
  const l12 = rd(BigInt(n) * VA_PERSONAL_EXEMPTION + BigInt(abBoxes) * VA_AGE_BLIND_EXEMPTION);
  const l13 = rd(c(input.vaScheduleAdjDeductions));
  const l14 = l10 + l11 + l12 + l13;
  // Form 760 line 15 prints SIGNED (no zero floor on the printed form)
  const l15 = l9 - l14;
  // VA filing threshold (Va. Code § 58.1-321): below it, no tax is due
  const filingThreshold = joint ? 2390000n : 1195000n;
  let l16 = rd(evalStateTax("us.va.income_tax", max0(l15)));
  if (l9 < filingThreshold && l16 > 0n) {
    notes.push(`VA tax $0: VAGI ${fmtD(l9)} is below the § 58.1-321 filing threshold ${fmtD(filingThreshold)}`);
    l16 = 0n;
  }
  let l17 = rd(c(input.vaSpouseTaxAdjustment));
  if (input.vaSpouseTaxAdjustment === undefined && joint && input.vaYourVagi !== undefined && input.vaSpouseVagi !== undefined && l16 > 0n) {
    l17 = vaSpouseTaxAdjustment(
      {
        yourVagi: rd(c(input.vaYourVagi)),
        spouseVagi: rd(c(input.vaSpouseVagi)),
        yourAgeBlindBoxes: (input.vaYourAgeBlindBoxes as number) ?? 0,
        spouseAgeBlindBoxes: (input.vaSpouseAgeBlindBoxes as number) ?? 0,
        taxableIncome: max0(l15),
        jointTax: l16,
      },
      evalStateTax,
      notes,
    );
  }
  const l18 = max0(l16 - l17);
  const l19a = c(input.stateWithholding);
  const l19b = c(input.spouseStateWithholding);
  const l20 = c(input.estimatedPayments);
  const l21 = rd(c(input.priorYearOverpaymentCredited));
  const l22 = rd(c(input.extensionPayment));
  let l23: bigint;
  if (input.vaRefundableEitc !== undefined || input.nonrefundableCredits !== undefined) {
    // explicit override path (legacy)
    const avail = rd(c(input.nonrefundableCredits));
    l23 = (avail > l18 ? l18 : avail) + rd(c(input.vaRefundableEitc));
  } else {
    l23 = vaLine23Credit(
      {
        fedEITC: rd(c(input.federalEITC)),
        netTax: l18,
        vagi: l9,
        familyVagi: input.vaFamilyVagi !== undefined ? rd(c(input.vaFamilyVagi)) : undefined,
        exemptions: n,
        barred: age > 0n || (((input.ageOrBlindBoxes as number) ?? 0) > 0),
      },
      notes,
    );
  }
  const l26 = l19a + l19b + l20 + l21 + l22 + l23 + rd(c(input.refundableCredits));
  const l33 = c(input.useTax);
  const totalDue = l18 + l33;
  const l36 = max0(l26 - totalDue);
  const l35 = max0(totalDue - l26);
  return {
    "1_federal_agi": fmtD(l1), "9_vagi": fmtD(l9),
    ...(l10 > 0n ? { "10_itemized_deductions": fmtD(l10) } : {}),
    "11_standard_deduction": fmtD(l11),
    "12_exemptions": fmtD(l12),
    ...(l13 > 0n ? { "13_sch_adj_deductions": fmtD(l13) } : {}),
    "14_deductions_subtotal": fmtD(l14), "15_va_taxable_income": fmtD(l15),
    "16_tax": fmtD(l16), "17_spouse_tax_adjustment": fmtD(l17), "18_net_tax": fmtD(l18),
    "19a_your_withholding": fmtD(l19a),
    "19b_spouse_withholding": fmtD(l19b), "20_estimated_payments": fmtD(l20),
    "21_prior_year_overpayment_credited": fmtD(l21),
    "22_extension_payment": fmtD(l22),
    "23_low_income_or_eitc_credit": fmtD(l23), "26_total_payments_credits": fmtD(l26),
    "33_sales_use_tax": fmtD(l33), "35_amount_owed": fmtD(l35), "36_refund": fmtD(l36),
  };
}
