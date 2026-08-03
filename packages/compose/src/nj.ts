/**
 * 2025 NJ-1040 line composer (line numbers per the printed form).
 *
 * NJ is CATEGORY-BASED: lines 15-26 each carry one income category, a net
 * loss in any category is NOT ENTERED (never negative, never crosses
 * categories, no carryover — but spouses combine within a category, unlike
 * PA). The composer runs the printed line set and Worksheet H (property tax
 * deduction vs the $50 credit — the comparison needs the tax computed both
 * ways, so it lives here, feeding us.nj.income_tax twice); the pension
 * exclusion, tax, EITC/CDCC/CTC amounts come from the corpus targets.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const EXEMPTION_REGULAR = 100000n; // $1,000
const EXEMPTION_SENIOR = 100000n; // $1,000
const EXEMPTION_BLIND = 100000n; // $1,000
const EXEMPTION_VETERAN = 600000n; // $6,000
const EXEMPTION_DEPENDENT = 150000n; // $1,500
const EXEMPTION_COLLEGE = 100000n; // $1,000
const ORGAN_DONATION_CAP = 1000000n; // $10,000
const COLLEGE_INCOME_CAP = 20000000n; // $200,000
const NJBEST_CAP = 1000000n; // $10,000
const NJCLASS_CAP = 250000n; // $2,500
const TUITION_CAP = 1000000n; // $10,000
const PROPERTY_TAX_CAP = 1500000n; // $15,000
const PROPERTY_TAX_CAP_MFS_SAME_HOME = 750000n; // $7,500
const PROPERTY_TAX_CREDIT = 5000n; // $50 (and the Worksheet H line 8 threshold)
const SPECIAL_EXCLUSION_JOINT = 600000n; // $6,000 (MFJ/HOH/QSS)
const SPECIAL_EXCLUSION_SINGLE = 300000n; // $3,000 (single/MFS)
const OTHER_RETIREMENT_EARNED_CAP = 300000n; // $3,000 (Worksheet D earned-income gate)
const PENSION_FULL_TIER_MAX = 10000000n; // $100,000 (line 27)
const EITC_AGE_DECOUPLED_FLAT = 26000n; // $260

/** Category line: net losses are "make no entry" — never negative, never cross-category. */
const cat = (v: unknown, label: string, notes: string[]): Cents => {
  const x = rd(c(v));
  if (x < 0n) {
    notes.push(`NJ ${label}: net category loss not entered (NJ-1040 p.7 — a loss never offsets another category and never carries over)`);
    return 0n;
  }
  return x;
};

export function composeNJ(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const mfsSameHome = isMfs(input) && input.njMfsSameHome === true;
  const joint = input.filingStatus === "mfj";
  const thresholdJoint = input.filingStatus === "mfj" || input.filingStatus === "hoh" || input.filingStatus === "qss";

  // ---- income categories (lines 15-26) -----------------------------------
  const l15 = cat(input.njWages ?? input.wages, "line 15 wages", notes);
  if (input.njWages === undefined && input.wages !== undefined) {
    notes.push("NJ line 15: W-2 Box 16 state wages not transcribed — federal wages used (401(k) deferrals reduce both boxes for NJ, but cafeteria/125 and some benefits differ; pass njWages when Box 16 differs)");
  }
  const l16a = cat(input.njTaxableInterest, "line 16a interest", notes);
  const l16b = rd(c(input.njTaxExemptInterest)); // reported, never taxed
  const l17 = cat(input.njDividends, "line 17 dividends", notes);
  const l18 = cat(input.njBusinessNet, "line 18 business", notes);
  const l19 = cat(input.njDispositionNet, "line 19 disposition of property", notes);
  const l20a = cat(input.njPension, "line 20a pensions", notes);
  const l20b = rd(c(input.njPensionExcludable));
  const l21 = cat(input.njPartnershipNet, "line 21 partnership", notes);
  const l22 = cat(input.njScorpNet, "line 22 S corporation", notes);
  const l23 = cat(input.njRentRoyaltyNet, "line 23 rents/royalties", notes);
  const l24 = cat(input.njGamblingNet, "line 24 gambling", notes);
  const l25 = cat(input.njAlimonyReceived, "line 25 alimony received", notes);
  const l26 = cat(input.njOtherIncome, "line 26 other", notes);
  const l27 = l15 + l16a + l17 + l18 + l19 + l20a + l21 + l22 + l23 + l24 + l25 + l26;

  // ---- pension/retirement exclusions (28a-28c) ---------------------------
  const eligiblePension = input.njPensionEligibleAmount !== undefined ? rd(c(input.njPensionEligibleAmount)) : l20a;
  const l28a = min2(
    rd(
      evalStateTax("us.nj.pension_exclusion", 0n, {
        njPensionIncome: eligiblePension,
        njTotalIncome: l27,
        njPensionEligible: input.njPensionEligible === true,
      }),
    ),
    l20a,
  );
  let l28b = 0n;
  if (input.njOtherRetirementExclusion !== undefined) {
    l28b = rd(c(input.njOtherRetirementExclusion));
  } else if (input.njOtherRetirementEligible === true) {
    // Worksheet D auto-path (dollar-cap tier only): 62+, earned income ≤ $3,000,
    // line 27 ≤ $100,000 → unclaimed = chart cap − 28a
    const earned = l15 + l18 + l21 + l22;
    if (earned <= OTHER_RETIREMENT_EARNED_CAP && l27 <= PENSION_FULL_TIER_MAX) {
      const cap = joint ? 10000000n : isMfs(input) ? 5000000n : 7500000n;
      l28b = max0(cap - l28a);
      notes.push("NJ line 28b: unclaimed Other Retirement Income Exclusion computed per Worksheet D (62+, earned income ≤ $3,000, line 27 ≤ $100,000)");
    } else if (earned > OTHER_RETIREMENT_EARNED_CAP) {
      notes.push("NJ line 28b $0: earned income (lines 15+18+21+22) exceeds the $3,000 Worksheet D gate");
    } else {
      notes.push("NJ line 28b: line 27 above $100,000 — compute Worksheet D's percentage-tier unclaimed exclusion by hand and pass njOtherRetirementExclusion");
    }
  }
  if (input.njSpecialExclusion === true) {
    l28b += thresholdJoint ? SPECIAL_EXCLUSION_JOINT : SPECIAL_EXCLUSION_SINGLE;
    notes.push("NJ line 28b includes the Special Exclusion (never eligible for Social Security/Railroad Retirement — attested)");
  }
  const l28c = l28a + l28b;
  const l29 = max0(l27 - l28c);

  // ---- filing threshold (line 29 gate) -----------------------------------
  const threshold = thresholdJoint ? 2000000n : 1000000n;
  const belowThreshold = l29 <= threshold;
  if (belowThreshold) {
    notes.push(`NJ: line 29 gross income ${fmtD(l29)} is at or below the ${fmtD(threshold)} filing threshold — NO NJ tax is due (file only to recover withholding or claim the NJEITC)`);
  }

  // ---- exemptions and deductions (lines 30-38) ---------------------------
  const regularCount = BigInt(1 + (joint ? 1 : 0) + (input.njDomesticPartner === true ? 1 : 0));
  const l13 =
    regularCount * EXEMPTION_REGULAR +
    BigInt((input.njSeniorCount as number) ?? 0) * EXEMPTION_SENIOR +
    BigInt((input.njBlindCount as number) ?? 0) * EXEMPTION_BLIND +
    BigInt((input.njVeteranCount as number) ?? 0) * EXEMPTION_VETERAN +
    BigInt((input.dependents as number) ?? 0) * EXEMPTION_DEPENDENT +
    BigInt((input.njCollegeDependents as number) ?? 0) * EXEMPTION_COLLEGE;
  const l30 = l13;
  const medicalFloor = rd((l29 * 2n) / 100n);
  const l31 = max0(rd(c(input.njMedicalExpenses)) - medicalFloor) + rd(c(input.njArcherMsa)) + rd(c(input.njSeHealthInsurance));
  if (l31 === 0n && c(input.njMedicalExpenses) > 0n) {
    notes.push(`NJ line 31 $0: medical expenses do not exceed the 2% floor (${fmtD(medicalFloor)})`);
  }
  const l32 = rd(c(input.njAlimonyPaid));
  const l33 = rd(c(input.njConservationContribution));
  const l34 = rd(c(input.njHezDeduction));
  const l35 = rd(c(input.njAbcaAdjustment));
  const l36 = min2(rd(c(input.njOrganDonationExpenses)), ORGAN_DONATION_CAP);
  let l37a = 0n, l37b = 0n, l37c = 0n;
  const wantsCollege = c(input.njNjbestContributions) > 0n || c(input.njNjclassPaid) > 0n || c(input.njTuitionPaid) > 0n;
  if (wantsCollege && l29 > COLLEGE_INCOME_CAP) {
    notes.push("NJ lines 37a-37c $0: the College Affordability deductions require gross income of $200,000 or less");
  } else {
    l37a = min2(rd(c(input.njNjbestContributions)), NJBEST_CAP);
    l37b = min2(rd(c(input.njNjclassPaid)), NJCLASS_CAP);
    l37c = min2(rd(c(input.njTuitionPaid)), TUITION_CAP);
  }
  const l38 = l30 + l31 + l32 + l33 + l34 + l35 + l36 + l37a + l37b + l37c;
  const l39 = max0(l29 - l38);

  // ---- property tax deduction vs credit (Worksheet H) --------------------
  const l40a = rd(c(input.njPropertyTaxesPaid)) + rd((rd(c(input.njRentPaid)) * 18n) / 100n);
  if (c(input.njRentPaid) > 0n) notes.push("NJ line 40a includes 18% of rent paid (tenant property-tax equivalent)");
  const taxOn = (ti: Cents): Cents => (belowThreshold ? 0n : rd(evalStateTax("us.nj.income_tax", max0(ti))));
  let l41 = 0n;
  let l56 = 0n;
  if (l40a > 0n && !belowThreshold) {
    const ded = min2(l40a, mfsSameHome ? PROPERTY_TAX_CAP_MFS_SAME_HOME : PROPERTY_TAX_CAP);
    const savings = taxOn(l39) - taxOn(l39 - ded);
    const creditThreshold = mfsSameHome ? PROPERTY_TAX_CREDIT / 2n : PROPERTY_TAX_CREDIT;
    if (savings >= creditThreshold) {
      l41 = ded;
      notes.push(`NJ Worksheet H: Property Tax Deduction ${fmtD(ded)} chosen (saves ${fmtD(savings)}, ≥ the ${fmtD(creditThreshold)} credit)`);
    } else {
      l56 = creditThreshold; // $50 ($25 MFS same home), refundable
      notes.push(`NJ Worksheet H: ${fmtD(creditThreshold)} Property Tax Credit chosen (deduction would save only ${fmtD(savings)})`);
    }
  } else if (l40a > 0n && belowThreshold) {
    notes.push("NJ property tax: income at or below the filing threshold — seniors/blind/disabled filers may still claim the $50 credit via Form NJ-1040-HW (not composed here)");
  }

  // ---- tax and nonrefundable credits (lines 42-54) -----------------------
  const l42 = max0(l39 - l41);
  const l43 = taxOn(l42);
  const cojRaw = rd(c(input.njCojCredit));
  const l44 = min2(cojRaw, l43);
  if (cojRaw > l44) notes.push("NJ line 44 capped at the line 43 tax (Schedule NJ-COJ credit cannot exceed the tax)");
  const l45 = l43 - l44;
  const l46 = rd(c(input.njShelteredWorkshopCredit));
  const l47 = rd(c(input.njGoldStarCredit));
  const l48 = rd(c(input.njOrganDonorEmployerCredit));
  const l49 = l46 + l47 + l48;
  const l50 = max0(l45 - l49);
  const l51 = rd(c(input.useTax));
  const l52 = rd(c(input.njUnderpaymentInterest));
  let l53c = rd(c(input.njSrp));
  if (belowThreshold && l53c > 0n) {
    l53c = 0n;
    notes.push("NJ line 53c $0: income at or below the filing threshold is exempt from the Shared Responsibility Payment");
  }
  const l54 = l50 + l51 + l52 + l53c;

  // ---- payments and refundable credits (lines 55-66) ---------------------
  const l55 = rd(c(input.stateWithholding));
  const l57 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited)) + rd(c(input.extensionPayment));
  const fedEITC = rd(c(input.federalEITC));
  const l58 =
    input.njEitcOverride !== undefined
      ? rd(c(input.njEitcOverride))
      : input.njEitcAgeDecoupled === true && fedEITC === 0n
        ? EITC_AGE_DECOUPLED_FLAT
        : rd((fedEITC * 40n) / 100n);
  if (l58 === EITC_AGE_DECOUPLED_FLAT && input.njEitcAgeDecoupled === true && fedEITC === 0n) {
    notes.push("NJ line 58: flat $260 NJEITC (18+, no qualifying child, met all federal EIC requirements except age — attested)");
  }
  const l59 = rd(c(input.njExcessUiWfSwf));
  const l60 = rd(c(input.njExcessDi));
  const l61 = rd(c(input.njExcessFli));
  const l62 = rd(c(input.njWwcCredit));
  const l63 = rd(c(input.njBaitCredit));
  const l64 =
    c(input.njFederalCdcc) > 0n
      ? rd(evalStateTax("us.nj.cdcc", l42, { njFederalCdcc: c(input.njFederalCdcc) }))
      : 0n;
  if (isMfs(input) && l64 > 0n) {
    notes.push("NJ line 64 (MFS): the CDCC requires meeting the federal § 21(e) living-apart exceptions — attested by supplying njFederalCdcc");
  }
  const l65 = rd(
    evalStateTax("us.nj.ctc", l42, { njChildrenUnder6: (input.njChildrenUnder6 as number) ?? 0 }),
  );
  const l66 = l55 + l56 + l57 + l58 + l59 + l60 + l61 + l62 + l63 + l64 + l65;
  const l67 = max0(l54 - l66);
  const l68 = max0(l66 - l54);

  notes.push("NJ: ANCHOR / Senior Freeze / Stay NJ property-tax relief is applied for on the separate PAS-1, never on the NJ-1040");

  return {
    "13_total_exemption_amount": fmtD(l13),
    "15_wages": fmtD(l15),
    "16a_taxable_interest": fmtD(l16a),
    "16b_tax_exempt_interest": fmtD(l16b),
    "17_dividends": fmtD(l17),
    "18_business_net": fmtD(l18),
    "19_disposition_net": fmtD(l19),
    "20a_pensions_taxable": fmtD(l20a),
    "20b_pensions_excludable": fmtD(l20b),
    "21_partnership": fmtD(l21),
    "22_s_corporation": fmtD(l22),
    "23_rents_royalties": fmtD(l23),
    "24_gambling_net": fmtD(l24),
    "25_alimony_received": fmtD(l25),
    "26_other": fmtD(l26),
    "27_total_income": fmtD(l27),
    "28a_pension_exclusion": fmtD(l28a),
    "28b_other_retirement_exclusion": fmtD(l28b),
    "28c_total_exclusion": fmtD(l28c),
    "29_nj_gross_income": fmtD(l29),
    "30_exemption_amount": fmtD(l30),
    "31_medical_expenses": fmtD(l31),
    "32_alimony_paid": fmtD(l32),
    "36_organ_donation": fmtD(l36),
    "37a_njbest": fmtD(l37a),
    "37b_njclass": fmtD(l37b),
    "37c_tuition": fmtD(l37c),
    "38_total_exemptions_deductions": fmtD(l38),
    "39_taxable_income": fmtD(l39),
    "40a_property_taxes_paid": fmtD(l40a),
    "41_property_tax_deduction": fmtD(l41),
    "42_nj_taxable_income": fmtD(l42),
    "43_tax": fmtD(l43),
    "44_coj_credit": fmtD(l44),
    "45_balance_of_tax": fmtD(l45),
    "49_total_credits": fmtD(l49),
    "50_balance_after_credits": fmtD(l50),
    "51_use_tax": fmtD(l51),
    "52_underpayment_interest": fmtD(l52),
    "53c_shared_responsibility": fmtD(l53c),
    "54_total_tax_due": fmtD(l54),
    "55_withholding": fmtD(l55),
    "56_property_tax_credit": fmtD(l56),
    "57_estimated_payments": fmtD(l57),
    "58_nj_eitc": fmtD(l58),
    "59_excess_ui_wf_swf": fmtD(l59),
    "60_excess_di": fmtD(l60),
    "61_excess_fli": fmtD(l61),
    "62_wounded_warrior": fmtD(l62),
    "63_bait_credit": fmtD(l63),
    "64_cdcc": fmtD(l64),
    "65_nj_ctc": fmtD(l65),
    "66_total_payments": fmtD(l66),
    "67_amount_owed": fmtD(l67),
    "68_overpayment": fmtD(l68),
    "79_balance_due": fmtD(l67),
    "80_refund": fmtD(l68),
  };
}
