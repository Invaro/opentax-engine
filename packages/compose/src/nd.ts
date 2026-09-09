/**
 * 2025 North Dakota Form ND-1 line composer (full-year resident; line numbers
 * per the printed form, SFN 28702 (12-2025), lines 1-37). Oracle targets: the line 20 tax
 * (the printed Tax Table below $100,000, the rate schedules at or above it),
 * the line 6 net long-term capital gain exclusion, the line 12 College SAVE
 * deduction, the line 13 qualified dividend exclusion, the line 21 other-state
 * credit, and the line 22 marriage penalty credit.
 *
 * North Dakota starts from FEDERAL TAXABLE INCOME (Form 1040 line 15). Line 1a
 * captures federal AGI but feeds nothing — the chain is 1b -> 4b -> 18 -> 20.
 * There is no North Dakota standard deduction and no personal exemption; the
 * federal amounts flow through by conformity. Every credit is nonrefundable:
 * line 25 floors at zero and there is no refundable credit line on the form.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);

export function composeND(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the North Dakota Form ND-1 composer");
  if (typeof input.ndFederalTaxableIncome !== "number") {
    throw new Error(
      "ndFederalTaxableIncome is required for the North Dakota Form ND-1 composer — Form ND-1 line 1b is federal Form 1040 line 15, and North Dakota starts from federal TAXABLE income, not AGI. It may be NEGATIVE: the booklet directs a filer whose federal taxable income calculates below zero to enter the negative number on line 1b even though Form 1040 line 15 shows 0.",
    );
  }
  const mfj = fs === "mfj";
  const qss = fs === "qss";

  const tryEval = (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      notes.push(`ND ${label}: ${target} has no applicable rule as of this date — line left blank; re-run once the year's forms publish`);
      return null;
    }
  };

  // The $50 Tax Table is MANDATORY below $100,000 — but it exists only for a tax
  // year whose booklet has published. TY2025 has one (us.nd.income_tax v1, all
  // 4,780 printed cells reproduced); TY2026 does not, and v2 applies the rate
  // schedule at the exact income instead. The line 20 note must say which method
  // actually ran, so it reads the tax year rather than assuming the table.
  // Number("") is 0, not NaN — an absent asOf must fall through to the "cannot say" note
  const asOf = (input as { asOf?: string }).asOf;
  const taxYear = typeof asOf === "string" && /^\d{4}/.test(asOf) ? Number(asOf.slice(0, 4)) : NaN;
  const tablePublished = taxYear === 2025;

  if (qss) notes.push("ND filing status Qualifying surviving spouse: the Tax Table's footnote sends it to the Married filing jointly COLUMN and it shares the joint rate schedule, but it is NOT a joint return — the College SAVE cap stays at $5,000 and the marriage penalty credit is unavailable");

  // ---- lines 1-4: the starting point ----
  const l1a = D(input.federalAGI);
  const l1b = D(input.ndFederalTaxableIncome); // may be negative, deliberately
  if (l1b < 0n) notes.push(`ND line 1b: federal taxable income is negative (${fmtD(l1b)}). The booklet directs the filer to enter the negative number even though federal Form 1040 line 15 shows 0 ("Enter a minus sign (-) to the left of the number") — and gives the identical instruction for Form ND-EZ line 1b, so the negative entry does not by itself force Form ND-1`);
  notes.push("ND line 1a: federal adjusted gross income is captured but feeds NOTHING — North Dakota starts from federal TAXABLE income on line 1b. There is no North Dakota standard deduction and no personal exemption; the federal amounts flow through by perpetual conformity");
  const l2 = D(input.ndPlannedGiftAdjustment);
  const l3 = D(input.additions);
  const l4a = l2 + l3;
  const l4b = l1b + l4a;

  // ---- lines 5-17: subtractions ----
  const l5 = D(input.ndUsObligationInterest);
  const gain = D(input.ndNetLongTermCapitalGain);
  const l6 = gain > 0n
    ? tryEval("us.nd.capital_gain_exclusion", 0n, { ndNetLongTermCapitalGain: gain, ndCapitalGainAlreadyExcluded: D(input.ndCapitalGainAlreadyExcluded) }, "line 6 capital gain exclusion") ?? 0n
    : 0n;
  if (l6 > 0n) notes.push(`ND line 6: 40% net long-term capital gain exclusion ${fmtD(l6)}. The worksheet takes the SMALLER of federal Schedule D lines 15 and 16 and stops outright if either is zero or less, so a net loss produces no exclusion`);
  const l7 = D(input.ndExemptTribalIncome);
  const l8 = D(input.ndRailroadRetirementBenefits);
  const l9 = D(input.ndPeaceOfficerRetirement);
  const l11 = D(input.ndMilitaryPay);
  const l12 = D(input.ndCollegeSaveContributions) > 0n
    ? tryEval("us.nd.college_save_deduction", 0n, { ndCollegeSaveContributions: D(input.ndCollegeSaveContributions) }, "line 12 College SAVE deduction") ?? 0n
    : 0n;
  if (D(input.ndCollegeSaveContributions) > l12 && l12 > 0n) notes.push(`ND line 12: College SAVE contributions capped at ${fmtD(l12)} (${mfj ? "$10,000 on a joint return" : "$5,000"}). Rollovers from another section 529 plan do NOT qualify`);
  const l13 = D(input.ndQualifiedDividends) > 0n
    ? tryEval("us.nd.qualified_dividend_exclusion", 0n, { ndQualifiedDividends: D(input.ndQualifiedDividends) }, "line 13 qualified dividend exclusion") ?? 0n
    : 0n;
  const l14 = D(input.ndMilitaryRetirement);
  const l15 = D(input.taxableSocialSecurity);
  if (l15 > 0n) notes.push(`ND line 15: the entire ${fmtD(l15)} of federally taxable Social Security is excluded — no cap, no age test, no phase-out. Tier 1 Railroad Retirement goes on line 8 instead; a filer holding both an SSA-1099 and an RRB-1099 splits federal line 6b between lines 8 and 15 in the ratio of gross benefits of each type to combined gross benefits`);
  if (l11 > 0n) notes.push("ND line 11: military pay is excluded IN FULL — the exclusion covers federal pay for training, education, mobilization and bonuses, and state pay when called to state active duty");
  if (l14 > 0n) notes.push("ND line 14: military retirement benefits are excluded IN FULL, for the retiree or a surviving spouse, and also cover a dual-status military technician's federal civil-service retirement");
  const l16 = D(input.subtractions);
  // Line 10 is the nonresident Servicemembers Civil Relief Act adjustment. This is
  // a FULL-YEAR RESIDENT composer, for whom the correct entry is $0 — it is
  // emitted as $0 rather than skipped so lines 5-16 reconcile to line 17 on the
  // printed form. A nonresident or part-year filer needs Schedule ND-1NR, which
  // this composer does not produce.
  const l17 = l5 + l6 + l7 + l8 + l9 + l11 + l12 + l13 + l14 + l15 + l16;
  const l18 = max0(l4b - l17);
  const l19 = l18; // line 19 carries line 18 to page 2 unchanged
  notes.push("ND line 10: the nonresident Servicemembers Civil Relief Act adjustment is $0 — this composer produces a FULL-YEAR RESIDENT Form ND-1. A part-year or nonresident filer (including a joint return with one nonresident spouse) must use Schedule ND-1NR, which prorates the tax by the ratio of North Dakota federal AGI to total federal AGI under section 57-38-30.3(1)(f); that schedule is out of scope here");

  // ---- line 20: tax ----
  const useSchedule = input.ndUseRateSchedule === true;
  const l20 = rd(evalStateTax("us.nd.income_tax", l19, { ndUseRateSchedule: useSchedule }));
  const inTableRange = l19 < 10000000n && !useSchedule;
  notes.push(
    !inTableRange
      ? `ND line 20: the rate schedule applied at ${fmtD(l19)}${useSchedule ? " (ndUseRateSchedule)" : " (taxable income is $100,000 or more, above the Tax Table)"} — 0.00% / 1.95% / 2.50%`
      : tablePublished
        ? `ND line 20: the Tax Table — the $50 row containing ${fmtD(l19)}, priced at the row midpoint. Section 57-38-30.3(10) makes the table MANDATORY in its range: "the tables must be followed by every individual, estate, or trust determining a tax under this section"`
        : Number.isNaN(taxYear)
          ? `ND line 20: ${fmtD(l19)} is inside the range the Tax Table covers when one is published, but no asOf was supplied, so this note cannot say whether the table or the rate schedule produced the tax. Pass asOf (the year-end date) to resolve it`
          : `ND line 20: the RATE SCHEDULE applied at the exact ${fmtD(l19)}, NOT the Tax Table — the ${taxYear} Form ND-1 booklet and its $50 table are not published, so the corpus applies the schedule at the exact income. Section 57-38-30.3(10) will make the table mandatory in this range once it publishes; expect at most the value of half a row (about $0.49 at 1.95%) of divergence, and re-run then`,
  );
  if (l19 > 0n && l20 === 0n) notes.push(`ND: no tax at all — ${fmtD(l19)} of North Dakota taxable income falls entirely within the ZERO-PERCENT first bracket (House Bill 1158 of 2023)`);

  // ---- line 21: other-state credit ----
  const doubled = D(input.ndDoublyTaxedIncome);
  const l21 = doubled > 0n && D(input.ndOtherStateTaxPaid) > 0n
    ? tryEval("us.nd.other_state_credit", 0n, {
        ndDoublyTaxedIncome: doubled,
        ndOtherStateIncomeBase: input.ndOtherStateIncomeBase !== undefined ? D(input.ndOtherStateIncomeBase) : max0(l1a - l5),
        ndIncomeTaxBeforeCredits: l20,
        ndOtherStateTaxPaid: D(input.ndOtherStateTaxPaid),
      }, "line 21 other-state credit") ?? 0n
    : 0n;
  if (l21 > 0n) notes.push(`ND line 21 (Schedule ND-1CR): other-state credit ${fmtD(l21)} — the line 20 tax times the four-decimal ratio of doubly taxed income to the base, limited to the NET tax actually paid to that state. A SEPARATE Schedule ND-1CR is required per state and the results are summed. Montana and Minnesota WAGES are excluded by reciprocity (take a refund on that state's return instead); foreign country tax never qualifies`);

  // ---- line 22: marriage penalty credit ----
  let l22 = 0n;
  if (mfj && D(input.ndLowerQualifiedIncome) > 0n) {
    const lower = D(input.ndLowerQualifiedIncome);
    const w5 = 1575000n; // the worksheet's preprinted $15,750 = half the federal joint standard deduction
    const w6 = max0(lower - w5);
    const single = (amount: Cents): Cents => rd(evalStateTax("us.nd.income_tax", amount, { ndUseRateSchedule: true, filingStatus: "single" }));
    const w7 = single(w6);
    const w8 = max0(l18 - w6);
    const w9 = single(w8);
    const w10 = rd(evalStateTax("us.nd.income_tax", l18, { ndUseRateSchedule: true, filingStatus: "mfj" }));
    const credit = tryEval("us.nd.marriage_penalty_credit", 0n, {
      ndTaxableIncome: l18, ndLowerQualifiedIncome: lower,
      ndSingleScheduleTaxA: w7, ndSingleScheduleTaxB: w9, ndJointScheduleTax: w10,
    }, "line 22 marriage penalty credit");
    l22 = credit ?? 0n;
    // Only describe the worksheet when it actually ran. Every figure below is a
    // 2025 printed amount; quoting it for a year whose worksheet has not
    // published would contradict the note tryEval just pushed.
    if (credit !== null) notes.push(
      l22 > 0n
        ? `ND line 22: marriage penalty credit ${fmtD(l22)} — worksheet line 6 is ${fmtD(w6)} (the lower spouse's ${fmtD(lower)} of qualified income less the preprinted $15,750, which is half the federal joint standard deduction), lines 7 and 9 run ${fmtD(w6)} and ${fmtD(w8)} through the SINGLE schedule for ${fmtD(w7)} and ${fmtD(w9)}, line 10 runs ${fmtD(l18)} through the JOINT schedule for ${fmtD(w10)}, and line 12 takes the excess, capped at $312`
        : "ND line 22: no marriage penalty credit. The worksheet gates on a joint return, taxable income over $81,036 and the lower-earning spouse's qualified income over $47,550 — and the booklet warns that even meeting all of them, \"your fact situation may not produce a credit under the calculation formula prescribed by law\". NOTE: those screening gates do not line up with the 2025 bracket boundaries ($80,975 joint and $48,475 single zero-bracket tops); they are the Commissioner's printed figures and are applied as printed",
    );
  } else if (mfj && input.ndLowerQualifiedIncome === undefined) {
    notes.push("ND line 22: marriage penalty credit not computed — pass ndLowerQualifiedIncome (the qualified income of the lower-earning spouse: wages and tips from federal line 1z, net self-employment income less the self-employment tax deduction, and the taxable IRA, pension, annuity and Social Security amounts, reduced by the Form ND-1 line 8 and line 15 exclusions)");
  } else if (mfj) {
    notes.push("ND line 22: no marriage penalty credit — the lower-earning spouse has no qualified income, so worksheet line 4 is $0 and the line 5 gate ($47,550) fails. This is a computed $0, not a missing input");
  }

  const l23 = D(input.nonrefundableCredits);
  if (l23 > 0n) notes.push("ND line 23 (Schedule ND-1TC): every North Dakota credit is NONREFUNDABLE — line 25 floors at zero and the form has no refundable credit line. Several credits also require a property tax clearance record under section 57-01-15.1");
  const l24 = l21 + l22 + l23;
  const l25 = max0(l20 - l24);
  if (l24 > l20) notes.push(`ND line 25: credits of ${fmtD(l24)} exceed the ${fmtD(l20)} tax; the excess is lost — "Net tax liability. Subtract line 24 from line 20. If less than zero, enter 0"`);

  // ---- lines 26-37: payments, refund, balance due (printed SFN 28702 (12-2025) page 2) ----
  const l26 = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l27 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  const l28 = l26 + l27;
  const contributions = D(input.ndVoluntaryContributions);
  const deMinimis = 500n; // lines 29, 32 and 33 each print "If less than $5.00, enter 0"
  // 29: "Overpayment - If line 28 is MORE than line 25, subtract line 25 from line 28; otherwise, go to line 33. If less than $5.00, enter 0"
  const overpaidRaw = l28 > l25 ? l28 - l25 : 0n;
  const l29 = overpaidRaw < deMinimis ? 0n : overpaidRaw;
  if (overpaidRaw > 0n && l29 === 0n) notes.push(`ND line 29: the ${fmtD(overpaidRaw)} overpayment is under the printed $5.00 floor — "If less than $5.00, enter 0" — so no refund is issued`);
  // 30: "Amount of line 29 that you want applied to your 2026 estimated tax"
  const l30 = l29 > 0n ? min2(D(input.ndAppliedToNextYear), l29) : 0n;
  // 31: voluntary contributions on an overpaid return; 32: "Refund. Subtract lines 30 and 31 from line 29. If less than $5.00, enter 0"
  const l31 = l29 > 0n ? min2(contributions, l29 - l30) : 0n;
  const refundRaw = l29 - l30 - l31;
  const l32 = refundRaw < deMinimis ? 0n : refundRaw;
  if (refundRaw > 0n && l32 === 0n) notes.push(`ND line 32: the ${fmtD(refundRaw)} left after lines 30 and 31 is under the printed $5.00 floor, so the refund prints as $0`);
  // 33: "Tax due - If line 28 is LESS than line 25, subtract line 28 from line 25. If less than $5.00, enter 0"
  const dueRaw = l28 < l25 ? l25 - l28 : 0n;
  const l33 = dueRaw < deMinimis ? 0n : dueRaw;
  if (dueRaw > 0n && l33 === 0n) notes.push(`ND line 33: the ${fmtD(dueRaw)} of tax due is under the printed $5.00 floor — "If less than $5.00, enter 0" — so nothing is owed on it`);
  // 34: Penalty (AK) + Interest (AL); 35: voluntary contributions on a return with a balance due;
  // 37: Schedule ND-1UT interest; 36: "Balance due. Add lines 33, 34, 35, and, if applicable, line 37"
  const l34 = D(input.ndPenalty) + D(input.ndInterest);
  const l35 = l29 > 0n ? 0n : contributions;
  const l37 = D(input.ndUnderpaymentInterest);
  const l36 = l33 + l34 + l35 + l37;
  if (contributions > 0n && l29 > 0n && l31 < contributions) notes.push(`ND line 31: voluntary contributions limited to the ${fmtD(l31)} of overpayment left after line 30 — a larger gift on an overpaid return cannot be taken from the refund; pay it with the return instead`);
  if (l36 > 0n) notes.push(`ND line 36: balance due ${fmtD(l36)}${l34 > 0n ? ` including ${fmtD(l34)} of penalty and interest` : ""}${l37 > 0n ? ` and ${fmtD(l37)} of Schedule ND-1UT underpayment interest` : ""} — pay to the ND Office of State Tax Commissioner`);
  else if (l32 > 0n) notes.push(`ND line 32: refund ${fmtD(l32)}${l30 > 0n ? ` after ${fmtD(l30)} applied to 2026 estimated tax` : ""}${l31 > 0n ? ` and ${fmtD(l31)} of voluntary contributions` : ""}`);

  return {
    "1a_federal_agi": fmtD(l1a),
    "1b_federal_taxable_income": fmtD(l1b),
    "2_planned_gift_adjustment": fmtD(l2),
    "3_other_additions": fmtD(l3),
    "4a_total_additions": fmtD(l4a),
    "4b_income_plus_additions": fmtD(l4b),
    "5_us_obligation_interest": fmtD(l5),
    "6_capital_gain_exclusion": fmtD(l6),
    "7_exempt_tribal_income": fmtD(l7),
    "8_railroad_retirement": fmtD(l8),
    "9_peace_officer_retirement": fmtD(l9),
    "10_nonresident_scra_adjustment": fmtD(0n),
    "11_military_pay_exclusion": fmtD(l11),
    "12_college_save_deduction": fmtD(l12),
    "13_qualified_dividend_exclusion": fmtD(l13),
    "14_military_retirement_exclusion": fmtD(l14),
    "15_social_security_exclusion": fmtD(l15),
    "16_other_subtractions": fmtD(l16),
    "17_total_subtractions": fmtD(l17),
    "18_nd_taxable_income": fmtD(l18),
    "19_nd_taxable_income_page_2": fmtD(l19),
    "20_tax": fmtD(l20),
    "21_other_state_credit": fmtD(l21),
    "22_marriage_penalty_credit": fmtD(l22),
    "23_other_credits": fmtD(l23),
    "24_total_credits": fmtD(l24),
    "25_net_tax_liability": fmtD(l25),
    "26_withholding": fmtD(l26),
    "27_estimated_payments": fmtD(l27),
    "28_total_payments": fmtD(l28),
    "29_overpayment": fmtD(l29),
    "30_applied_to_2026": fmtD(l30),
    "31_voluntary_contributions": fmtD(l31),
    "32_refund": fmtD(l32),
    "33_tax_due": fmtD(l33),
    "34_penalty_and_interest": fmtD(l34),
    "35_voluntary_contributions": fmtD(l35),
    "36_balance_due": fmtD(l36),
    "37_underpayment_interest": fmtD(l37),
  };
}
