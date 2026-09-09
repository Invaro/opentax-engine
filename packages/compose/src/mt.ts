/**
 * 2025 Montana Form 2 line composer (full-year resident; line numbers per the
 * printed form, "2025v3 12/2025"). Oracle targets: the line 8 tax (the page 2
 * worksheet — ordinary income tax plus the preferential net long-term capital
 * gains tax), the line 6 age-65 subtraction, the line 15 earned income credit,
 * the line 16 elderly homeowner/renter credit, the Schedule III Part II
 * other-state credit, and the Schedule I 529, ABLE and military-retirement
 * subtractions. Composed here per the printed form: lines 1-26 and the
 * Schedule I addition and subtraction totals.
 *
 * Montana starts from FEDERAL TAXABLE INCOME. It has no standard deduction of
 * its own, no personal or dependency exemption, and no Social Security
 * subtraction — all repealed by SB 399 (Ch. 503, L. 2021). The federal
 * standard-or-itemized deduction flows through on line 2, and the § 199A
 * qualified business income deduction is expressly excluded.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);

export function composeMT(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Montana Form 2 composer");
  if (typeof input.federalAGI !== "number") throw new Error("federalAGI is required for the Montana Form 2 composer — federal Form 1040 line 11b is Form 2 line 1");
  if (typeof input.mtFederalDeductions !== "number") {
    throw new Error(
      "mtFederalDeductions is required for the Montana Form 2 composer — Form 2 line 2 is the total of federal Form 1040 lines 12e and 13b (the federal standard OR itemized deduction plus the Schedule 1-A deductions for qualified tips, qualified overtime, passenger vehicle loan interest and the enhanced senior deduction). Montana has no standard deduction of its own, so without this line there is no Montana taxable income. Do NOT include the federal qualified business income deduction.",
    );
  }
  const mfj = fs === "mfj";
  const qss = fs === "qss";
  const mfs = fs === "mfs";
  if (qss) notes.push("MT filing status 'Qualifying Surviving Spouse' — Montana pairs it with married filing jointly in every rate table, but it is NOT a joint return: the doubled age-65 subtraction and the doubled 529 and ABLE caps all require both spouses on a joint return");
  if (mfs) notes.push("MT married filing separately uses the SINGLE rate column — Montana does not halve the single brackets for separate filers");

  const missing = new Set<string>();
  const tryEval = (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      missing.add(target);
      notes.push(`MT ${label}: ${target} has no applicable rule as of this date — this tax year's amount is not encoded (the indexed subtractions are set by the Department each November 1) — line left blank; re-run once the booklet is out`);
      return null;
    }
  };

  // ---- lines 1-7: Montana taxable income ----
  const l1 = D(input.federalAGI);
  const l2 = D(input.mtFederalDeductions);
  const l3 = max0(l1 - l2);
  notes.push(`MT line 2: ${fmtD(l2)} of federal deductions (Form 1040 lines 12e and 13b) — Montana has NO standard deduction and NO personal exemption of its own; the federal amount flows through, EXCLUDING the § 199A qualified business income deduction, which § 15-30-2120(2)(i) adds back`);

  // Schedule I subtractions the corpus computes
  const s529 = D(input.mtTuitionSavingsContributions) > 0n
    ? tryEval("us.mt.tuition_savings_subtraction", 0n, { mtTuitionSavingsContributions: D(input.mtTuitionSavingsContributions) }, "Schedule I line 16 (529)") ?? 0n
    : 0n;
  if (D(input.mtTuitionSavingsContributions) > s529 && s529 > 0n) notes.push(`MT Schedule I line 16: § 529 contributions capped at ${fmtD(s529)} (${mfj ? "$9,000 on a joint return" : "$4,500"} for 2025 — House Bill 845 raised it from $3,000)`);
  const sAble = D(input.mtAbleContributions) > 0n
    ? tryEval("us.mt.able_subtraction", 0n, { mtAbleContributions: D(input.mtAbleContributions) }, "Schedule I line 17 (ABLE)") ?? 0n
    : 0n;
  const sMil = D(input.mtMilitaryRetirementIncome) > 0n
    ? tryEval("us.mt.military_retirement_subtraction", 0n, {
        mtMilitaryRetireeEligible: input.mtMilitaryRetireeEligible === true,
        mtMilitaryRetireeWithinFiveYears: input.mtMilitaryRetireeWithinFiveYears === true,
        mtMilitaryRetirementIncome: D(input.mtMilitaryRetirementIncome),
        mtMontanaSourceWageIncome: D(input.mtMontanaSourceWageIncome),
      }, "Schedule I line 13 (military retirement)") ?? 0n
    : 0n;
  if (D(input.mtMilitaryRetirementIncome) > 0n && sMil === 0n) {
    notes.push(
      input.mtMilitaryRetireeEligible !== true || input.mtMilitaryRetireeWithinFiveYears !== true
        ? "MT Schedule I line 13: no military retirement subtraction — § 15-30-2120(9) limits it to a retiree who became a Montana resident on or after June 30, 2023 (or was a resident before and after receiving the pension) and only for five consecutive years; pass mtMilitaryRetireeEligible and mtMilitaryRetireeWithinFiveYears"
        : "MT Schedule I line 13: no military retirement subtraction — it is the LESSER of Montana source wage income or 50% of the pension, and no Montana source wage income was passed. § 15-30-2120(8)(b) counts wages, salary and tips for services performed in Montana AND net income from a Montana trade, business, profession or occupation AND Montana farm net income, so pass mtMontanaSourceWageIncome with all three; a fully retired veteran with none of them gets nothing",
    );
  } else if (sMil > 0n) notes.push(`MT Schedule I line 13: military retirement subtraction ${fmtD(sMil)} — the lesser of Montana source wage income and 50% of the pension (Form WMRE)`);

  const l4 = D(input.additions) + D(input.mtOutOfStateBondInterest) + D(input.mtStateIncomeTaxAddback);
  if (D(input.mtStateIncomeTaxAddback) > 0n) notes.push(`MT Schedule I Part I line 4: ${fmtD(D(input.mtStateIncomeTaxAddback))} of state income tax included in federal itemized deductions added back (Worksheet B) — capped so it never reduces the federal itemized total below the federal standard deduction (§ 15-30-2120(2)(j)). New placement for TY2025`);
  const l5 = D(input.subtractions) + s529 + sAble + sMil + D(input.mtActiveDutyMilitaryPay) + D(input.mtExemptTribalIncome) + D(input.mtRailroadRetirementBenefits);
  if (D(input.mtActiveDutyMilitaryPay) > 0n) notes.push("MT Schedule I line 12: active-duty military salary is subtracted in full (§ 15-30-2120(3)(c)) — basic, special and incentive pay only; annual training, inactive duty training and 'active Guard and Reserve duty' pay do NOT qualify");
  if (D(input.taxableSocialSecurity) > 0n) notes.push(`MT: ${fmtD(D(input.taxableSocialSecurity))} of federally taxable Social Security is taxed by Montana with NO state subtraction — the pre-2024 Montana Social Security worksheet was repealed by SB 399 and no replacement exists`);

  const l6 = tryEval("us.mt.age65_subtraction", 0n, {
    mtTaxpayerAge65: input.mtTaxpayerAge65 === true,
    mtSpouseAge65: mfj && input.mtSpouseAge65 === true,
  }, "line 6 (age-65 subtraction)") ?? 0n;
  if (l6 > 0n) notes.push(`MT line 6: ${fmtD(l6)} age-65 subtraction — $5,660 per taxpayer 65 or older for 2025, doubled only when BOTH spouses on a joint return qualify. The Department calls this the "65 and over exemption", but Montana's personal exemption is repealed; this is a subtraction from federal taxable income`);
  if (!mfj && input.mtSpouseAge65 === true) notes.push("MT line 6: mtSpouseAge65 ignored — the doubled $11,320 subtraction requires a joint return");

  const l7 = max0(l3 + l4 - l5 - l6);

  // ---- line 8: the page 2 worksheet ----
  const gains = D(input.mtNetLongTermCapitalGains);
  const l8 = rd(evalStateTax("us.mt.income_tax", l7, { mtNetLongTermCapitalGains: gains }));
  const wsOrdinaryTax = rd(evalStateTax("us.mt.ordinary_income_tax", l7, { mtNetLongTermCapitalGains: gains }));
  const wsGainsTax = rd(evalStateTax("us.mt.capital_gains_tax", l7, { mtNetLongTermCapitalGains: gains }));
  const ordinaryIncome = max0(l7 - min2(l7, max0(gains))); // worksheet line 4 can never exceed line 1
  if (gains > 0n) {
    notes.push(`MT page 2 worksheet: Montana ordinary income ${fmtD(ordinaryIncome)} (line 4) is taxed on the rate schedule → ${fmtD(wsOrdinaryTax)} (line 12); net long-term capital gains ${fmtD(min2(l7, gains))} are taxed at 3% for the part that fits below the filing-status threshold and 4.1% above → ${fmtD(wsGainsTax)} (line 11); line 13 = ${fmtD(l8)}`);
    notes.push("MT: qualified dividends are ORDINARY income in Montana ('Montana Ordinary Income … includes qualified dividends'), unlike the federal treatment — only § 1222 net long-term capital gains get the 3% / 4.1% rates");
  } else {
    notes.push(`MT line 8: ${fmtD(l7)} taxed on the rate schedule → ${fmtD(l8)}. Montana has no tax table at any income level — the rate schedule is the only method for every filer at every income`);
  }

  // ---- line 9: nonrefundable credits ----
  const oscInputs = D(input.mtOtherStateOrdinaryIncome) + D(input.mtOtherStateCapitalGains);
  const osc = oscInputs > 0n
    ? tryEval("us.mt.other_state_credit", 0n, {
        mtOtherStateOrdinaryIncome: D(input.mtOtherStateOrdinaryIncome),
        mtOtherStateCapitalGains: D(input.mtOtherStateCapitalGains),
        mtOtherStateTotalIncome: D(input.mtOtherStateTotalIncome),
        mtOrdinaryIncomeSourcedToMontana: D(input.mtOrdinaryIncomeSourcedToMontana),
        mtFederalNetLongTermCapitalGains: D(input.mtFederalNetLongTermCapitalGains),
        mtOtherStateTaxPaid: D(input.mtOtherStateTaxPaid),
        mtOrdinaryIncomeTax: wsOrdinaryTax,
        mtCapitalGainsTax: wsGainsTax,
      }, "Schedule III Part II (other-state credit)") ?? 0n
    : 0n;
  if (osc > 0n) notes.push(`MT Schedule III Part II: other-state credit ${fmtD(osc)} — computed SEPARATELY for ordinary income (lines 1-10) and for net long-term capital gains (lines 11-20) and summed on line 21, each block taking the least of the tax paid, the tax paid times the sourced ratio, and the Montana tax times the sourced ratio, at six decimal places. North Dakota WAGES are not eligible (reciprocity)`);
  if (oscInputs > 0n && osc === 0n && !missing.has("us.mt.other_state_credit")) {
    notes.push("MT Schedule III Part II: other-state credit computed as $0 — check that the DENOMINATORS were supplied: mtOtherStateTotalIncome (lines 2 and 12), mtOrdinaryIncomeSourcedToMontana (line 3) and mtFederalNetLongTermCapitalGains (line 13). Each block returns $0 when its ratio has no denominator");
  }
  const otherNonrefundable = D(input.nonrefundableCredits);
  const l9raw = osc + otherNonrefundable;
  const l9 = min2(l9raw, l8);
  if (l9raw > l8) notes.push(`MT line 9: nonrefundable credits ${fmtD(l9raw)} exceed the ${fmtD(l8)} tax and are limited to it — the printed line 10 is a bare subtraction, but Schedule III credits are nonrefundable by definition and cannot produce a negative liability`);
  const l10 = max0(l8 - l9);

  // ---- lines 11-21: payments and refundable credits ----
  const l11 = D(input.stateWithholding) + D(input.spouseStateWithholding) + D(input.mtPassThroughEntityTaxCredit) + D(input.mtScheduleK1Withholding) + D(input.mtLoanOutWithholding);
  const l12 = D(input.estimatedPayments);
  const l13 = D(input.priorYearOverpaymentCredited);
  const l14 = D(input.extensionPayment);
  const federalEic = D(input.federalEITC);
  const l15 = federalEic > 0n ? tryEval("us.mt.eitc", 0n, { mtFederalEic: federalEic }, "line 15 (earned income credit)") ?? 0n : 0n;
  if (l15 > 0n) notes.push(`MT line 15: earned income credit ${fmtD(l15)} of the ${fmtD(federalEic)} federal credit — refundable, and payable even with no Montana tax. Nonresidents do not qualify, and Worksheet A prorates it for part-year and mixed-residency filers, enrolled tribal members living on their own reservation, IRC § 501(d) members and resident active-duty servicemembers (none of which this full-year-resident composer models)`);
  const claimsElderly = input.mtAge62 === true && input.mtGrossHouseholdIncome !== undefined && (D(input.mtPropertyTaxBilled) > 0n || D(input.mtRentPaid) > 0n);
  const l16 = claimsElderly
    ? tryEval("us.mt.elderly_homeowner_renter_credit", 0n, {
        mtAge62: true,
        mtResided9Months: input.mtResided9Months === true,
        mtOccupied6Months: input.mtOccupied6Months === true,
        mtSoleHouseholdClaimant: input.mtSoleHouseholdClaimant === true,
        mtGrossHouseholdIncome: D(input.mtGrossHouseholdIncome),
        mtPropertyTaxBilled: D(input.mtPropertyTaxBilled),
        mtRentPaid: D(input.mtRentPaid),
      }, "line 16 (Schedule 2EC)") ?? 0n
    : 0n;
  if (input.mtAge62 === true && input.mtGrossHouseholdIncome === undefined && (D(input.mtPropertyTaxBilled) > 0n || D(input.mtRentPaid) > 0n)) {
    notes.push("MT line 16: elderly homeowner/renter credit NOT claimed — Schedule 2EC keys off GROSS HOUSEHOLD INCOME (all income of all household members, taxable and non-taxable, including the full amount of Social Security and pensions, public assistance and the 2024 Montana property tax rebate), which is not federal AGI and has no safe default. Pass mtGrossHouseholdIncome");
  } else if (claimsElderly && l16 === 0n && !missing.has("us.mt.elderly_homeowner_renter_credit")) {
    notes.push("MT line 16: no elderly homeowner/renter credit — Schedule 2EC requires ALL of its attestations — age 62 by year end, nine months of Montana residency, six months of occupancy, and being the only household member claiming it (mtSoleHouseholdClaimant) — plus gross household income under $45,000");
  } else if (l16 > 0n) notes.push(`MT line 16: elderly homeowner/renter credit ${fmtD(l16)} — refundable, maximum $1,150, and claimable even with no Montana tax liability (§ 15-30-2340(7))`);
  const l17 = D(input.refundableCredits);
  const l18 = D(input.mtAmendedPaymentsWithOriginal);
  const l19 = D(input.mtScheduleIvOtherTaxes);
  const l20 = D(input.mtAmendedPreviousOverpayment);
  const l21 = l11 + l12 + l13 + l14 + l15 + l16 + l17 + l18 - l19 - l20;
  if (l19 > 0n) notes.push(`MT line 19: ${fmtD(l19)} of contributions, penalties, interest and other taxes from Schedule IV is SUBTRACTED from total payments rather than added to the tax`);

  // ---- lines 22-26 ----
  const due = l21 < l10;
  const l22 = due ? l10 - l21 : 0n;
  const l23 = due ? 0n : l21 - l10;
  const l24 = min2(D(input.mtAppliedToNextYear), l23);
  const l25 = min2(D(input.mt529Deposit), max0(l23 - l24));
  const l26 = max0(l23 - l24 - l25);
  notes.push(due ? `MT line 22: tax due ${fmtD(l22)}` : `MT line 23: overpaid ${fmtD(l23)}${l24 > 0n ? `, ${fmtD(l24)} applied to 2026 estimated taxes` : ""}${l25 > 0n ? `, ${fmtD(l25)} deposited to a 529/529A account` : ""} — refund ${fmtD(l26)}`);

  return {
    "1_federal_agi": fmtD(l1),
    "2_federal_deductions": fmtD(l2),
    "3_federal_taxable_income": fmtD(l3),
    "4_montana_additions": fmtD(l4),
    "5_montana_subtractions": fmtD(l5),
    "6_age65_subtraction": fmtD(l6),
    "7_montana_taxable_income": fmtD(l7),
    "8_tax_before_credits": fmtD(l8),
    "9_nonrefundable_credits": fmtD(l9),
    "10_tax_after_nonrefundable_credits": fmtD(l10),
    // printed line 11 is "Add lines 11a through 11e" (W-2, 1099, pass-through entity credit, K-1
    // withholding, LOWCERT); the composer carries the TOTAL from stateWithholding + spouseStateWithholding
    // and does not break out the five sub-lines
    "11_montana_withholding": fmtD(l11),
    "12_estimated_payments": fmtD(l12),
    "13_overpayment_applied_from_2024": fmtD(l13),
    "14_extension_payment": fmtD(l14),
    "15_earned_income_credit": fmtD(l15),
    "16_elderly_homeowner_renter_credit": fmtD(l16),
    "17_refundable_credits": fmtD(l17),
    "18_amended_payments_with_original": fmtD(l18),
    "19_schedule_iv_other_taxes": fmtD(l19),
    "20_amended_previous_overpayment": fmtD(l20),
    "21_total_payments": fmtD(l21),
    "22_tax_due": fmtD(l22),
    "23_tax_overpaid": fmtD(l23),
    "24_applied_to_2026": fmtD(l24),
    "25_529_deposit": fmtD(l25),
    "26_refund": fmtD(l26),
    // page 2 worksheet and Schedule I detail the form itself prints
    "W_11_capital_gains_tax": fmtD(wsGainsTax),
    "W_12_ordinary_income_tax": fmtD(wsOrdinaryTax),
    "W_4_montana_ordinary_income": fmtD(ordinaryIncome),
    "III_1_other_state_credit": fmtD(osc),
    "I_16_tuition_savings_subtraction": fmtD(s529),
    "I_13_military_retirement_subtraction": fmtD(sMil),
  };
}
