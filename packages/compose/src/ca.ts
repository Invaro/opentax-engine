/** 2025 California Form 540 line composer. */
import { c, rd, max0, fmtD, type Cents } from "./money.js";
import { isJoint, isHohOrQss, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const STD_DEDUCTION_SINGLE = 570600n; // $5,706
const STD_DEDUCTION_JOINT_HOH = 1141200n; // $11,412
const PERSONAL_EXEMPTION_CREDIT = 15300n; // $153 (also the 65+/blind add-on)
const DEPENDENT_EXEMPTION_CREDIT = 47500n; // $475

/** Schedule CA nonconformity adjustments the composer applies itself. */
function scheduleCaAdjustments(input: StateReturnInput, notes: string[]): { adds: Cents; subs: Cents } {
  const ssSub = rd(c(input.taxableSocialSecurity));
  const uiSub = rd(c(input.unemploymentCompensation));
  const hsaDistSub = rd(c(input.caHsaTaxableDistribution));
  const educatorAdd = rd(c(input.caEducatorExpensesDeducted));
  const hsaDedAdd = rd(c(input.caHsaDeduction));
  const ab5WageAdd = rd(c(input.caAb5GrossIncomeAddition));
  const ab5LossAdd = rd(c(input.caAb5NetLossAddition));
  const deprAdd = rd(c(input.caDepreciationAddition));
  if (ssSub > 0n) notes.push(`CA subtraction: federally taxable social security ${fmtD(ssSub)} (Schedule CA line 6 col B)`);
  if (uiSub > 0n) notes.push(`CA subtraction: unemployment compensation ${fmtD(uiSub)} (Schedule CA line 7 col B)`);
  if (hsaDistSub > 0n) notes.push(`CA subtraction: federally taxed HSA distribution ${fmtD(hsaDistSub)} (no § 223 conformity)`);
  if (educatorAdd > 0n) notes.push(`CA addition: federal educator-expense deduction ${fmtD(educatorAdd)} added back (no § 62(a)(2)(D) conformity)`);
  if (hsaDedAdd > 0n) notes.push(`CA addition: federal HSA deduction ${fmtD(hsaDedAdd)} added back (no § 223 conformity)`);
  if (ab5WageAdd > 0n) notes.push(`CA wage addition ${fmtD(ab5WageAdd)}: business gross income reclassified as employee wages for California (AB 5)`);
  if (ab5LossAdd > 0n) notes.push(`CA business addition ${fmtD(ab5LossAdd)}: federal Schedule C net loss disallowed for California (AB 5 employee classification)`);
  if (deprAdd > 0n) notes.push(`CA addition ${fmtD(deprAdd)}: depreciation difference (California does not conform to § 168(k) bonus depreciation)`);
  return {
    adds: educatorAdd + hsaDedAdd + ab5WageAdd + ab5LossAdd + deprAdd,
    subs: ssSub + uiSub + hsaDistSub,
  };
}

export function composeCA(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  // 2025 Form 540: L75 = CalEITC, L76 = YCTC (printed order; FYTC is 77)
  const l13 = rd(c(input.federalAGI));
  const { adds, subs } = scheduleCaAdjustments(input, notes);
  const l17 = rd(l13 + c(input.additions) + adds - c(input.subtractions) - subs);
  const standard = joint || isHohOrQss(input) ? STD_DEDUCTION_JOINT_HOH : STD_DEDUCTION_SINGLE;
  const itemized = rd(c(input.caItemizedDeductions));
  const l18 = itemized > standard ? itemized : standard; // § 63(e) election: greater of standard or itemized
  if (itemized > standard) notes.push(`CA itemized deduction ${fmtD(itemized)} exceeds the standard deduction ${fmtD(standard)} — line 18 itemizes (Schedule CA Part II, agent-computed and disclosed)`);
  const l19 = max0(l17 - l18);
  const l31 = rd(evalStateTax("us.ca.income_tax", l19));
  // CA gives a QSS filer the same TWO personal exemption credits as MFJ
  // (Form 540 line 7 doubles for MFJ/QSS per the 540 instructions).
  const persons = joint || (input as { filingStatus?: string }).filingStatus === "qss" ? 2n : 1n;
  const l32 = rd(
    persons * PERSONAL_EXEMPTION_CREDIT +
      BigInt((input.dependents as number) ?? 0) * DEPENDENT_EXEMPTION_CREDIT +
      BigInt((input.ageOrBlindBoxes as number) ?? 0) * PERSONAL_EXEMPTION_CREDIT,
  );
  const renters = rd(c(input.caRentersCredit));
  // Form 540 line 48: line 31 minus exemption credits (line 32) minus the
  // renter's credit (line 46) and other nonrefundable credits — floored at 0.
  const l48 = max0(l31 - l32 - renters);
  if (l31 < l32 + renters && l31 > 0n) notes.push("CA exemption credits and/or renter's credit exceed tax — line 48 floors at $0 (both are nonrefundable)");
  // Line 61 AMT: a passed caAmt wins; otherwise build Schedule P AMTI from the
  // ISO preference + the taxes-in-itemized addback (standard deduction added
  // back instead when not itemizing) and evaluate us.ca.amt.
  let amt = rd(c(input.caAmt));
  if (input.caAmt === undefined && (input.caIsoPreference !== undefined || input.caAmtTaxesAddback !== undefined)) {
    const addback = itemized > standard ? rd(c(input.caAmtTaxesAddback)) : standard;
    const amti = l19 + addback + rd(c(input.caIsoPreference));
    // Schedule P line 25 compares TMT against the line 31 regular tax BEFORE
    // exemption credits (worked example: TMT 25,484 − 12,038 = 13,446).
    amt = rd(evalStateTax("us.ca.amt", l19, { caAmti: amti, caRegularTax: l31 }));
    notes.push(`Schedule P: AMTI ${fmtD(amti)} = taxable income ${fmtD(l19)} + ${itemized > standard ? "itemized-taxes addback" : "standard-deduction addback"} ${fmtD(addback)} + ISO preference ${fmtD(rd(c(input.caIsoPreference)))}; AMT ${fmtD(amt)}`);
  }
  const bhst = rd(c(input.caBhst));
  // Line 63: California 2.5% additional tax on early distributions
  // (R&TC § 17085(c)(1), FTB 3805P) — computed from the federally penalized base.
  const earlyBase = rd(c(input.caTaxableEarlyDistribution));
  const l63 = rd((earlyBase * 25n) / 1000n);
  if (l63 > 0n) notes.push(`CA line 63: 2.5% early-distribution additional tax ${fmtD(l63)} on ${fmtD(earlyBase)} (R&TC § 17085(c)(1))`);
  const l64 = l48 + amt + bhst + l63; // line 64: add line 48, line 61, line 62, and line 63
  const l71 = c(input.stateWithholding);
  // Form 540 line 72 = "2025 CA estimated tax and other payments" — extension
  // (FTB 3519) payments and prior-year credited overpayments fold in here.
  const l72 = c(input.estimatedPayments) + rd(c(input.extensionPayment)) + rd(c(input.priorYearOverpaymentCredited));
  const l75 = rd(c(input.caCalEITC));
  const l76 = rd(c(input.caYCTC));
  const l78 = l71 + l72 + l75 + l76 + rd(c(input.refundableCredits));
  const due = l64 + c(input.useTax);
  const l97 = max0(l78 - due);
  const l111 = max0(due - l78);
  return {
    "13_federal_agi": fmtD(l13), "17_ca_agi": fmtD(l17), "18_ca_deduction": fmtD(l18),
    "19_ca_taxable_income": fmtD(l19), "31_tax": fmtD(l31), "32_exemption_credits": fmtD(l32),
    "46_renters_credit": fmtD(renters),
    "48_tax_after_credits": fmtD(l48),
    ...(amt !== 0n ? { "61_amt": fmtD(amt) } : {}),
    ...(bhst !== 0n ? { "62_bhst": fmtD(bhst) } : {}),
    ...(l63 !== 0n ? { "63_other_taxes": fmtD(l63) } : {}),
    "64_total_tax": fmtD(l64), "71_ca_withholding": fmtD(l71), "72_estimated_payments": fmtD(l72),
    "75_caleitc": fmtD(l75), "76_yctc": fmtD(l76), "78_total_payments": fmtD(l78),
    "97_overpaid": fmtD(l97), "111_amount_owed": fmtD(l111), "115_refund": fmtD(l97),
  };
}
