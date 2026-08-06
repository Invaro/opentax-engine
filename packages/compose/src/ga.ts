/**
 * 2025 Georgia Form 500 line composer (line numbers per the printed form,
 * Rev. 07/09/25).
 *
 * GA starts from federal AGI with a FORCED deduction election: a federal
 * itemizer must use Georgia itemized deductions (federal Schedule A minus
 * the line 12b adjustments), never the GA standard deduction. The composer
 * runs the printed line flow, auto-subtracts taxable Social Security and
 * the retirement exclusion (via the corpus target), folds the CDCC (50% of
 * the allowed federal credit) into the IND-CR line, and caps total credits
 * at the line 16 tax exactly as line 22 prescribes.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

export function composeGA(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const fagi = rd(c(input.federalAGI));
  const l8 = fagi;

  // Schedule 1: additions minus subtractions (net on line 9)
  const additions = rd(c(input.additions));
  const taxableSS = rd(c(input.taxableSocialSecurity));
  if (taxableSS > 0n) notes.push("GA Schedule 1: taxable Social Security subtracted automatically (Georgia never taxes it; Tiers 1 and 2 RRB likewise)");
  const tiers = { none: 0, "62to64OrDisabled": 1, "65plus": 2 } as const;
  const tier = (v: unknown): string => (typeof v === "string" && v in tiers ? v : "none");
  const retirementExclusion =
    tier(input.gaExclusionTier) !== "none" || tier(input.gaSpouseExclusionTier) !== "none"
      ? rd(
          evalStateTax("us.ga.retirement_exclusion", 0n, {
            gaRetirementIncome: c(input.gaRetirementIncome),
            gaSpouseRetirementIncome: c(input.gaSpouseRetirementIncome),
            gaRetirementEarnedIncome: c(input.gaRetirementEarnedIncome),
            gaSpouseRetirementEarnedIncome: c(input.gaSpouseRetirementEarnedIncome),
            gaExclusionTier: tier(input.gaExclusionTier),
            gaSpouseExclusionTier: tier(input.gaSpouseExclusionTier),
          }),
        )
      : 0n;
  if (retirementExclusion > 0n) notes.push(`GA retirement income exclusion ${fmtD(retirementExclusion)} (Schedule 1 page 2 worksheet; per-spouse caps, $5,000 earned-income allowance)`);
  const militaryExclusion = rd(c(input.gaMilitaryExclusion));
  if (militaryExclusion > 0n) notes.push("GA military retirement exclusion (under-62, $17,500 + conditional $17,500 — Schedule 1 page 3 worksheet, hand-computed)");
  const subtractions = rd(c(input.subtractions)) + taxableSS + retirementExclusion + militaryExclusion;
  const l9 = additions - subtractions;
  const l10 = l8 + l9;

  // Deduction: FORCED itemizing when the filer itemized federally
  const itemizing = c(input.gaFederalItemized) > 0n;
  let l11 = 0n, l12c = 0n;
  if (itemizing) {
    const l12a = rd(c(input.gaFederalItemized));
    const l12b = rd(c(input.gaItemizedAdjustments));
    l12c = max0(l12a - l12b);
    notes.push("GA line 12: federal itemizer must itemize for Georgia ('Leave Line 11 blank if you itemize deductions on your Federal return') — line 12b subtracts state income taxes and the disallowed-SALT proration");
  } else {
    l11 = rd(evalStateTax("us.ga.standard_deduction", 0n));
  }
  const l13 = l10 - (itemizing ? l12c : l11);
  const nDeps = (input.gaDependentCount as number) ?? 0;
  const l14 = rd(evalStateTax("us.ga.dependent_exemption", 0n, { gaDependentCount: nDeps }));
  const l15a = l13 - l14;
  const nolRaw = rd(c(input.gaNolUtilized));
  const l15b = min2(nolRaw, max0(l15a));
  if (nolRaw > l15b) notes.push("GA line 15b capped at line 15a (the NOL utilized cannot exceed income before NOL; the 80% limitation is the caller's Schedule 4 computation)");
  const l15c = l15a - l15b;
  const l16 = rd(evalStateTax("us.ga.income_tax", max0(l15c)));

  // Credits (line 22 total cannot exceed line 16)
  const lic =
    ((input.gaLicExemptions as number) ?? 0) > 0
      ? rd(
          evalStateTax("us.ga.low_income_credit", 0n, {
            gaFederalAgi: fagi,
            gaLicExemptions: (input.gaLicExemptions as number) ?? 0,
            gaLic65Count: (input.gaLic65Count as number) ?? 0,
          }),
        )
      : 0n;
  const l17c = lic;
  const l18 = rd(c(input.gaOtherStateCredit));
  const l19 = min2(rd(c(input.gaEligibleItemizerCredit)), 30000n * BigInt(input.filingStatus === "mfj" ? 2 : 1));
  if (c(input.gaEligibleItemizerCredit) > 0n && !itemizing) notes.push("GA line 19: the Eligible Itemizer Tax Credit requires itemizing — verify eligibility (183+ days or GA resident at year end)");
  const cdcc = c(input.gaFederalCdccAllowed) > 0n
    ? rd(evalStateTax("us.ga.cdcc", 0n, { gaFederalCdccAllowed: c(input.gaFederalCdccAllowed) }))
    : 0n;
  if (cdcc > 0n) notes.push(`GA IND-CR 202 child and dependent care credit ${fmtD(cdcc)} (50% of the allowed federal § 21 credit, HB 136) folded into line 20`);
  const l20 = rd(c(input.gaIndCrCredits)) + cdcc;
  const l21 = rd(c(input.nonrefundableCredits));
  const creditsRaw = l17c + l18 + l19 + l20 + l21;
  const l22 = min2(creditsRaw, l16);
  if (creditsRaw > l22) notes.push(`GA line 22: total credits ${fmtD(creditsRaw)} capped at the line 16 tax ('cannot exceed Line 16')`);
  const l23 = max0(l16 - l22);

  const l24 = rd(c(input.stateWithholding));
  const l25 = rd(c(input.gaOtherWithholding));
  const l26 = rd(c(input.estimatedPayments)) + rd(c(input.extensionPayment));
  const l27 = rd(c(input.refundableCredits));
  const l28 = l24 + l25 + l26 + l27;
  const l29 = max0(l23 - l28);
  const l30 = max0(l28 - l23);
  const l42 = rd(c(input.gaUetPenalty));
  const l45 = l29 + l42;
  const l46 = max0(l30 - l42);

  notes.push("GA conformity: IRC as of Jan 1, 2025 — OBBBA changes do NOT apply for TY2025 (IT-511 p.5); QBI never allowed but needs no adjustment (GA starts from federal AGI)");

  return {
    "7c_total_dependents": String(nDeps),
    "8_federal_agi": fmtD(l8),
    "9_adjustments": fmtD(l9),
    "10_georgia_agi": fmtD(l10),
    "11_standard_deduction": fmtD(l11),
    "12c_georgia_itemized": fmtD(l12c),
    "13_income_after_deductions": fmtD(l13),
    "14_dependent_exemption": fmtD(l14),
    "15a_income_before_nol": fmtD(l15a),
    "15b_ga_nol_utilized": fmtD(l15b),
    "15c_georgia_taxable_income": fmtD(l15c),
    "16_tax": fmtD(l16),
    "17c_low_income_credit": fmtD(l17c),
    "18_other_state_credit": fmtD(l18),
    "19_eligible_itemizer_credit": fmtD(l19),
    "20_ind_cr_credits": fmtD(l20),
    "21_schedule2_credits": fmtD(l21),
    "22_total_credits_used": fmtD(l22),
    "23_balance": fmtD(l23),
    "24_withholding_w2_1099": fmtD(l24),
    "25_other_withholding": fmtD(l25),
    "26_estimated_payments": fmtD(l26),
    "27_schedule2b_refundable": fmtD(l27),
    "28_total_prepayments": fmtD(l28),
    "29_balance_due": fmtD(l29),
    "30_overpayment": fmtD(l30),
    "42_uet_penalty": fmtD(l42),
    "45_amount_due": fmtD(l45),
    "46_refund": fmtD(l46),
  };
}
