/**
 * 2025 Alabama Form 40 line composer (line numbers per the printed form).
 * The table tax (with the printed over-$100,000 anchors), AGI-phased
 * standard deduction, dependent exemption chart, unlimited federal income
 * tax deduction, and Schedule RS retirement exclusion are oracle targets;
 * the personal exemption, itemized-vs-standard choice, Schedule OC capping,
 * ATP/use-tax additions, and the lines 30-35 owe/refund chain are composed
 * here per the printed form.
 */
import { c, rd, max0, fmtD, type Cents } from "./money.js";
import { isJoint, isHoh, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const PERSONAL_EXEMPTION_SINGLE_MFS = 150000n; // $1,500
const PERSONAL_EXEMPTION_JOINT_HOF = 300000n; // $3,000

export function composeAL(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  if ((input as { filingStatus?: string }).filingStatus === "qss") {
    notes.push("AL filing status: Alabama has no qualifying-surviving-spouse status, and Head of Family EXPRESSLY EXCLUDES a surviving spouse ('is not a surviving spouse' — 2025 booklet p. 6; Ala. Admin. Code r. 810-3-19-.02 adopts 26 U.S.C. § 2(b), which bars § 2(a) surviving spouses). Joint requires being married at year end or the spouse dying DURING the tax year — composed as SINGLE ($1,500 exemption, single deduction column)");
    (input as Record<string, unknown>).filingStatus = "single";
    (input as Record<string, unknown>).filingHoh = false;
    (input as Record<string, unknown>).filingHohOrQss = false;
  }

  // ---- lines 5b-10: income and Alabama AGI ----
  const l5b = rd(c(input.alWages ?? input.wages));
  const l6 = rd(c(input.alInterestDividends));
  // Part I line 4: per-person taxable retirement net of the Schedule RS
  // 65+ $6,000 exclusion (oracle)
  const retPerson = (taxable: Cents, is65: boolean, label: string): Cents => {
    if (taxable <= 0n) return 0n;
    const excl = is65
      ? rd(evalStateTax("us.al.retirement_exclusion", 0n, { alTaxableRetirement: taxable, alIs65: true }))
      : 0n;
    if (excl > 0n) notes.push(`AL ${label} Schedule RS retirement exclusion ${fmtD(excl)} (65+, up to $6,000 of otherwise-taxable retirement; defined-benefit pensions/SS/military are already fully exempt and never entered). NOTE: the widely reported \"$12,000 in 2026\" is FALSE — HB388 died in May 2025; $6,000 continues.`);
    return max0(taxable - excl);
  };
  const l4ret =
    retPerson(rd(c(input.alTaxableRetirementYou)), input.alIs65You === true, "taxpayer") +
    retPerson(rd(c(input.alTaxableRetirementSpouse)), input.alIs65Spouse === true, "spouse");
  const otherIncome = rd(c(input.alOtherIncome));
  const l7 = otherIncome + l4ret;
  const l8 = l5b + l6 + l7;
  const l9 = rd(c(input.alAdjustments));
  if (l9 > 0n) notes.push(`AL line 9 adjustments ${fmtD(l9)} (Part II: per-spouse IRA, Keogh/SEP, alimony paid, adoption, MOVING EXPENSES (Alabama kept them), SE health insurance, College Counts 529/PACT, HSA, catastrophe savings, ABLE — transcribed)`);
  const l10 = l8 - l9; // Alabama AGI (may be negative)

  // ---- line 11: itemized or standard (free choice — larger wins) ----
  const std = rd(evalStateTax("us.al.standard_deduction", 0n, { alAgi: l10 }));
  const itemized = rd(c(input.alItemizedDeductions));
  let l11 = std;
  let method = "standard";
  if (itemized > std) {
    l11 = itemized;
    method = "itemized";
    notes.push(`AL itemized deductions ${fmtD(itemized)} (Schedule A: FICA/Medicare/SE taxes ARE deductible, medical floor 4% of AGI, NEW 2025 vehicle-loan interest up to $10,000 with the $100,000/$200,000 AGI phase-out — transcribed) beat the standard deduction ${fmtD(std)}`);
  } else if (itemized > 0n) {
    notes.push(`AL deduction: standard ${fmtD(std)} beats itemized ${fmtD(itemized)} — Alabama allows whichever is larger (MFS spouses must use the same method unless living apart all year)`);
  }

  // ---- line 12: unlimited federal income tax deduction (oracle) ----
  let l12: Cents;
  if (input.alFederalTaxDeductionOverride !== undefined) {
    l12 = rd(c(input.alFederalTaxDeductionOverride));
    notes.push(`AL line 12 federal tax deduction ${fmtD(l12)} from override (joint-federal/separate-Alabama returns and part-year residents RATIO the federal liability per the instructions)`);
  } else {
    l12 = rd(
      evalStateTax("us.al.federal_tax_deduction", 0n, {
        alFederalTaxPlusNiit: rd(c(input.alFederalTaxPlusNiit)),
        alFederalRefundableCredits: rd(c(input.alFederalRefundableCredits)),
      }),
    );
    if (l12 > 0n) notes.push(`AL line 12: federal income tax deduction ${fmtD(l12)} (UNLIMITED: 1040 line 22 + Form 8960 NIIT, minus EIC/ACTC/AOC/refundable-adoption/2439 — never the W-2 withholding; attach federal pages 1-2 + Schedule 1)`);
  }

  const l13 = joint || isHoh(input) ? PERSONAL_EXEMPTION_JOINT_HOF : PERSONAL_EXEMPTION_SINGLE_MFS;
  const deps = (input.alDependents as number) ?? (input.dependents as number) ?? 0;
  const l14 = deps > 0 ? rd(evalStateTax("us.al.dependent_exemption", 0n, { alDependents: deps, alAgi: l10 })) : 0n;
  if (l14 > 0n) notes.push(`AL line 14: dependent exemption ${fmtD(l14)} (${deps} × the chart amount — $1,000 at AGI ≤ $50,000, $500 to $100,000, $300 above; Alabama's OWN relationship list, not federal § 152)`);

  const l15 = l11 + l12 + l13 + l14;
  const l16 = max0(l10 - l15);
  if (l10 - l15 < 0n) notes.push("AL line 16 taxable income computed below zero — entered $0 (tax $0)");
  const l17 = rd(evalStateTax("us.al.income_tax", l16));

  // ---- lines 18-21: credits and additional taxes ----
  const oc = rd(c(input.nonrefundableCredits));
  const l18 = max0(l17 - oc);
  if (oc > 0n) notes.push(`AL line 18: Schedule OC nonrefundable credits ${fmtD(oc > l17 ? l17 : oc)} applied${oc > l17 ? ` (${fmtD(oc)} claimed, capped at the line 17 tax)` : ""} — many OC credits require My Alabama Taxes pre-registration/reservation`);
  const useTax = rd(c(input.useTax));
  const l19 = useTax + rd(c(input.alAtpOtherTaxes));
  if (useTax > 0n) notes.push(`AL line 19 includes use tax ${fmtD(useTax)} (Schedule ATP: general 4%, automotive 2%, food/grocery 2% on/after September 1, 2025 (3% before), farm 1.5%)`);
  const l20 = rd(c(input.alCampaignCheckoff));
  const l21 = l18 + l19 + l20;

  // ---- lines 22-29: payments ----
  const l22 = rd(c(input.stateWithholding));
  const l23 = rd(c(input.estimatedPayments)) + rd(c(input.extensionPayment)) + rd(c(input.priorYearOverpaymentCredited));
  const l25 = rd(c(input.refundableCredits)); // Schedule OC Section F
  const l26 = rd(c(input.alScheduleCpPayments));
  const l27 = l22 + l23 + l25 + l26;
  const l29 = l27; // amended-return lines 24/28 not composed

  // ---- lines 30-35: owe / refund ----
  const l31 = rd(c(input.alPenalties));
  const l30 = l21 > l29 ? l21 - l29 + l31 : 0n;
  const l32 = max0(l29 - l21);
  const l33 = rd(c(input.alAppliedToNextYear));
  const l34 = rd(c(input.alDonations));
  const l35 = l32 > 0n ? max0(l32 - l31 - l33 - l34) : 0n;
  if (l32 > 0n && l31 > 0n) notes.push(`AL line 35: penalties ${fmtD(l31)} subtract from the refund per the printed formula (line 32 − lines 31/33/34)`);
  if (l31 > 0n && l30 === 0n && l31 + l33 + l34 > l32) notes.push(`AL penalties ${fmtD(l31)}: the printed lines 30/35 leave ${fmtD(l31 + l33 + l34 - l32)} of penalties/elections uncollected on the form (line 21 does not exceed line 29 and the refund cannot absorb them) — the balance is billed/due separately`);

  notes.push("AL overtime: wages for overtime EARNED January 1-June 30, 2025 are exempt (Act 2023-421/2024-437; W-2 Box 14 'EX OT WAGES', already excluded from Box 16 state wages) — July-December 2025 overtime is fully taxable; the TY2026-2028 replacement is the $1,000-capped premium deduction (Act 2026-604)");

  return {
    "5b_wages": fmtD(l5b),
    ...(l6 !== 0n ? { "6_interest_dividends": fmtD(l6) } : {}),
    ...(l7 !== 0n ? { "7_other_income": fmtD(l7) } : {}),
    "8_total_income": fmtD(l8),
    ...(l9 !== 0n ? { "9_adjustments": fmtD(l9) } : {}),
    "10_alabama_agi": fmtD(l10),
    "11_deduction": fmtD(l11), "_deduction_method": method,
    "12_federal_tax_deduction": fmtD(l12),
    "13_personal_exemption": fmtD(l13),
    ...(l14 !== 0n ? { "14_dependent_exemption": fmtD(l14) } : {}),
    "15_total_deductions": fmtD(l15),
    "16_taxable_income": fmtD(l16),
    "17_tax": fmtD(l17),
    "18_net_tax": fmtD(l18),
    ...(l19 !== 0n ? { "19_additional_taxes": fmtD(l19) } : {}),
    ...(l20 !== 0n ? { "20_campaign_checkoff": fmtD(l20) } : {}),
    "21_total_tax": fmtD(l21),
    "22_withholding": fmtD(l22),
    "27_total_payments": fmtD(l27),
    "30_amount_you_owe": fmtD(l30),
    "32_overpaid": fmtD(l32),
    "35_refund": fmtD(l35),
  };
}
