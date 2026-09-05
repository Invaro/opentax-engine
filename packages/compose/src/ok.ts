/**
 * 2025 Oklahoma Form 511 line composer (line numbers per the printed form).
 * The table tax (with the printed $100,000 worksheet), standard/itemized
 * deduction, exemptions, per-person retirement exclusion, child care/child
 * tax credit, the 2020-rule EIC (both earned-income years) and its 5%
 * Oklahoma credit, sales tax relief, property tax relief, and the use tax
 * estimate are oracle targets; the Schedule 511-A/B/C buckets, the 529 cap,
 * the Schedule 511-E out-of-state proration, credit ordering, and the lines
 * 31-42 refund/owe chain are composed here per the printed form.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

export function composeOK(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const fs = (input as { filingStatus?: string }).filingStatus;
  const fagi = rd(c(input.federalAGI));

  // ---- Schedule 511-A: subtractions (line 2) ----
  const a1 = rd(c(input.okUsInterest));
  const a2 = rd(c(input.taxableSocialSecurity));
  if (a2 > 0n) notes.push(`OK Schedule 511-A line 2: taxable Social Security ${fmtD(a2)} subtracted in full (68 O.S. § 2358(E)(9) — Oklahoma never taxes it)`);
  const a3 = rd(c(input.okCsrsRetirement));
  if (a3 > 0n) notes.push(`OK Schedule 511-A line 3: CSRS retirement in lieu of Social Security ${fmtD(a3)} excluded 100% (Retirement Claim Number required; FERS does not qualify except the CSRS component / annuity supplement)`);
  const a4 = rd(c(input.okMilitaryRetirement));
  if (a4 > 0n) notes.push(`OK Schedule 511-A line 4: military retirement ${fmtD(a4)} excluded 100%`);
  const govYou = rd(c(input.okGovRetirementYou));
  const othYou = rd(c(input.okOtherRetirementYou));
  let govSp = rd(c(input.okGovRetirementSpouse));
  let othSp = rd(c(input.okOtherRetirementSpouse));
  if (!joint && govSp + othSp > 0n) {
    notes.push(`OK Schedule 511-A lines 5-6: spouse retirement ${fmtD(govSp + othSp)} IGNORED — the exclusion is per individual 'in your name', and a spouse's income is not on a ${fs ?? "non-joint"} return`);
    govSp = 0n;
    othSp = 0n;
  }
  let a56 = 0n;
  if (govYou + govSp + othYou + othSp > 0n) {
    a56 = rd(
      evalStateTax("us.ok.retirement_exclusion", 0n, {
        okGovRetirementYou: govYou,
        okGovRetirementSpouse: govSp,
        okOtherRetirementYou: othYou,
        okOtherRetirementSpouse: othSp,
      }),
    );
    const a5 = min2(govYou, 1000000n) + min2(govSp, 1000000n);
    notes.push(`OK Schedule 511-A lines 5-6: retirement exclusion ${fmtD(a56)} (line 5 government/civil-service ${fmtD(a5)}; line 6 other qualified plans/IRAs ${fmtD(a56 - a5)} — $10,000 combined cap PER PERSON, in that person's name, never pooled)`);
  }
  const a7 = rd(c(input.okRailroadRetirement));
  if (a7 > 0n) notes.push(`OK Schedule 511-A line 7: Railroad Retirement benefits ${fmtD(a7)} excluded`);
  const aOther = rd(c(input.subtractions));
  if (aOther > 0n) notes.push(`OK Schedule 511-A lines 8-17: other subtractions ${fmtD(aOther)} (US obligations handled on line 1; depletion, Oklahoma NOL, tribal income, Form 561 capital gain deduction, state refund of added-back tax, PTE income, bonus depreciation, misc codes — transcribed)`);
  const l2 = a1 + a2 + a3 + a4 + a56 + a7 + aOther;
  const l3 = fagi - l2;
  const l4 = rd(c(input.okOutOfStateIncome));
  if (l4 > 0n) notes.push(`OK line 4: out-of-state income ${fmtD(l4)} (real/tangible property or business income taxed by another state — never wages, interest, dividends, pensions; describe and attach the other state's return). Deductions and exemptions are prorated on Schedule 511-E.`);
  const l5 = l3 - l4;
  const l6 = rd(c(input.additions));
  if (l6 > 0n) notes.push(`OK line 6: Schedule 511-B additions ${fmtD(l6)} (non-Oklahoma municipal interest, out-of-state losses, lump sums, federal NOL, depletion/529 recapture, PTE loss, bonus depreciation add-back — transcribed)`);
  const l7 = l5 + l6; // Oklahoma AGI

  // ---- Schedule 511-C: adjustments (line 8) ----
  const c1 = rd(c(input.okMilitaryPay));
  if (c1 > 0n) notes.push(`OK Schedule 511-C line 1: active military pay ${fmtD(c1)} excluded 100% (Reserve and National Guard pay included)`);
  const c3raw = rd(c(input.ok529Contributions));
  const c3cap = joint ? 2000000n : 1000000n;
  const c3 = min2(c3raw, c3cap);
  if (c3raw > c3) notes.push(`OK Schedule 511-C line 3: Oklahoma 529 contributions ${fmtD(c3raw)} capped at ${fmtD(c3cap)} (${joint ? "$20,000 joint" : "$10,000"} per year — the excess carries forward up to five years)`);
  else if (c3 > 0n) notes.push(`OK Schedule 511-C line 3: Oklahoma 529 contributions ${fmtD(c3)} deducted`);
  const cOther = rd(c(input.okOtherAdjustments));
  if (cOther > 0n) notes.push(`OK Schedule 511-C lines 2, 4-6: other adjustments ${fmtD(cOther)} (disability modifications, foster care up to $5,000, Parental Choice payments, MSA/HSA, ABLE $10,000/$20,000, homebuyer savings, poll-worker leave — transcribed)`);
  const l8 = c1 + c3 + cOther;
  const l9 = l7 - l8;

  // ---- lines 10-13: deductions, exemptions, taxable income ----
  const itemizing = input.okFederalItemized === true;
  const standard = rd(evalStateTax("us.ok.standard_deduction", 0n));
  let ded = standard;
  if (itemizing) {
    if (input.okFederalItemizedTotal === undefined) {
      throw new Error("okFederalItemizedTotal (federal Schedule A line 17) is required when okFederalItemized is true — Oklahoma itemized deductions start from it (Schedule 511-D line 1)");
    }
    ded = rd(
      evalStateTax("us.ok.itemized_deductions", 0n, {
        okFederalItemizedTotal: c(input.okFederalItemizedTotal),
        okFederalSaltDeducted: c(input.okFederalSaltDeducted),
        okFederalMedical: c(input.okFederalMedical),
        okFederalCharity: c(input.okFederalCharity),
      }),
    );
    notes.push(`OK line 10: Oklahoma itemized deductions ${fmtD(ded)} (Schedule 511-D: federal Schedule A less state/local income or sales taxes, capped at $17,000 except medical and charity) — mandatory for a federal itemizer even when below the ${fmtD(standard)} standard deduction`);
  }
  const basic = ((input.exemptions as number) ?? 0) + ((input.okBlindExemptions as number) ?? 0);
  const special = (input.okSpecialExemptions65 as number) ?? 0;
  const exemptions = rd(
    evalStateTax("us.ok.exemptions", 0n, {
      okBasicExemptions: basic,
      okSpecialExemptions65: special,
      okFederalAgi: fagi,
      okRothConversionIncome: c(input.okRothConversionIncome),
    }),
  );
  if (special > 0 && exemptions === BigInt(basic) * 100000n) {
    notes.push(
      fs === "qss"
        ? "OK exemptions: the special 65+ exemption is NOT allowed for a qualifying surviving spouse by this composer — neither 68 O.S. § 2358(E)(1)(c) nor the packet lists a QSS income limit (only single/joint/MFS/HOH). A preparer who reads QSS as 'joint' (QSS uses the joint column and the $12,700 joint standard deduction everywhere else on Form 511) may add $1,000 per box via exemptions when federal AGI is $25,000 or less — disclose the position"
        : "OK exemptions: the special 65+ exemption is denied — federal AGI (less Roth conversions) exceeds the limit ($15,000 single / $25,000 joint / $12,500 MFS / $19,000 HOH)",
    );
  } else if (special > 0) notes.push(`OK exemptions: ${special} special 65+ exemption(s) allowed (federal AGI within the limit)`);

  let l12: Cents;
  const lines: Record<string, string> = {};
  if (l4 > 0n) {
    // Schedule 511-E: (deductions + exemptions) × Oklahoma AGI ÷ line 3, not more than 100%
    const total = ded + exemptions;
    let prorated = total;
    if (l3 > 0n && l7 < l3) {
      // exact ratio (no printed percentage precision is prescribed), half-up to the dollar
      prorated = l7 <= 0n ? 0n : (((total * l7) / l3 + 50n) / 100n) * 100n;
    }
    l12 = prorated;
    notes.push(`OK Schedule 511-E: deductions ${fmtD(ded)} + exemptions ${fmtD(exemptions)} prorated to ${fmtD(l12)} by Oklahoma AGI ${fmtD(l7)} ÷ line 3 ${fmtD(l3)} (not more than 100%); lines 10-11 left blank per the form`);
    lines["_schedule_511e_total_before_proration"] = fmtD(total);
  } else {
    lines["10_deduction"] = fmtD(ded);
    lines["_deduction_method"] = itemizing ? "itemized" : "standard";
    lines["11_exemptions"] = fmtD(exemptions);
    l12 = ded + exemptions;
  }
  const l13 = max0(l9 - l12);

  // ---- line 14: tax ----
  let l14a: Cents;
  if (input.okFarmIncomeAveragingTax !== undefined) {
    l14a = rd(c(input.okFarmIncomeAveragingTax));
    notes.push("OK line 14a: tax from Form 573 farm income averaging (box 1) — agent-computed, replaces the table tax");
  } else {
    l14a = rd(evalStateTax("us.ok.income_tax", l13));
  }
  const l14b = rd(c(input.okAdditionalTax));
  if (l14b > 0n) notes.push(`OK line 14b: additional tax ${fmtD(l14b)} (HSA non-qualified withdrawal 10% / Affordable Housing credit recapture / IRC § 965(h) installment — transcribed)`);
  const l14 = l14a + l14b;

  // ---- lines 15-18: nonrefundable credits ----
  const cdcc = rd(c(input.okFederalChildCareCredit));
  const ctc = rd(c(input.okFederalChildTaxCredit));
  let l15 = 0n;
  if (cdcc > 0n || ctc > 0n) {
    l15 = rd(
      evalStateTax("us.ok.child_care_child_tax_credit", 0n, {
        okFederalChildCareCredit: cdcc,
        okFederalChildTaxCredit: ctc,
        okFederalAgi: fagi,
        okAgi: l7,
      }),
    );
    if (fagi > 10000000n) notes.push("OK line 15: child care/child tax credit $0 — federal AGI exceeds $100,000 (a cliff, not a phase-out)");
    else if (l7 < fagi) notes.push(`OK line 15: child care/child tax credit ${fmtD(l15)} (greater of 20% of the federal child care credit or 5% of CTC + ACTC, PRORATED on Schedule 511-F by Oklahoma AGI ${fmtD(l7)} ÷ federal AGI ${fmtD(fagi)})`);
    else notes.push(`OK line 15: child care/child tax credit ${fmtD(l15)} (greater of 20% × ${fmtD(cdcc)} child care credit or 5% × ${fmtD(ctc)} CTC + ACTC)`);
    if (l15 > l14) {
      notes.push(`OK line 15 capped at the line 14 tax ${fmtD(l14)} (nonrefundable — line 18 may not go below zero)`);
      l15 = l14;
    }
  }
  const l16raw = rd(c(input.okOtherStateCredit));
  const l16 = min2(l16raw, l14 - l15);
  if (l16 > 0n) notes.push(`OK line 16: credit for tax paid to another state ${fmtD(l16)} (Form 511-TX — personal-services income only, capped at the remaining tax)`);
  const l17raw = rd(c(input.nonrefundableCredits));
  const l17 = min2(l17raw, l14 - l15 - l16);
  if (l17raw > l17) notes.push(`OK line 17: Form 511-CR credits ${fmtD(l17raw)} capped at the remaining tax ${fmtD(l17)}`);
  const l18 = max0(l14 - l15 - l16 - l17);

  // ---- lines 19-33: use tax, payments, refundable credits ----
  let l19: Cents;
  if (input.okUseTaxEstimate === true) {
    l19 = rd(evalStateTax("us.ok.use_tax", 0n, { okFederalAgi: fagi }));
    notes.push(`OK line 19: use tax estimate ${fmtD(l19)} from the printed Use Tax Table on federal AGI (0.056% of AGI at $54,670 and over) — the filer had no purchase records`);
  } else {
    l19 = rd(c(input.useTax));
    if (l19 === 0n) notes.push("OK line 19: no use tax reported — check the 'no use tax is due' certification box, or supply useTax / okUseTaxEstimate");
  }
  const l20 = l18 + l19;
  const l21 = rd(c(input.stateWithholding)) + rd(c(input.spouseStateWithholding));
  const l22 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  const l23 = rd(c(input.extensionPayment));
  const ghi = rd(c(input.okGrossHouseholdIncome));
  let l24 = 0n;
  if (input.okPtrEligible === true && c(input.okPropertyTaxPaid) > 0n) {
    l24 = rd(evalStateTax("us.ok.property_tax_relief_credit", 0n, { okPropertyTaxPaid: rd(c(input.okPropertyTaxPaid)), okGrossHouseholdIncome: ghi, okPtrEligible: true }));
    if (l24 > 0n) notes.push(`OK line 24: property tax relief credit ${fmtD(l24)} (Form 538-H: homestead tax over 1% of gross household income, max $200; 65+/totally disabled head of household, household income ≤ $12,000)`);
    else notes.push(`OK line 24: property tax relief credit $0 — gross household income ${fmtD(ghi)} exceeds $12,000 or the tax does not exceed 1% of household income`);
  }
  let l25 = 0n;
  if (input.okStrEligible === true) {
    const strEx = input.okStrExemptions !== undefined ? (input.okStrExemptions as number) : ((input.exemptions as number) ?? 0);
    if (input.okStrExemptions === undefined) notes.push(`OK Form 538-S Box D: qualified exemptions defaulted to the ${strEx} regular exemptions (self + spouse + dependents; the 65+/blind boxes never count) — pass okStrExemptions to override`);
    l25 = rd(
      evalStateTax("us.ok.sales_tax_relief_credit", 0n, {
        okGrossHouseholdIncome: ghi,
        okStrExemptions: strEx,
        okStrHasDependent: input.okStrHasDependent === true,
        okStrIs65: input.okStrIs65 === true,
        okStrDisabled: input.okStrDisabled === true,
        okStrEligible: true,
      }),
    );
    if (l25 > 0n) notes.push(`OK line 25: sales tax relief credit ${fmtD(l25)} (${strEx} × $40; gross household income ${fmtD(ghi)} within the ${input.okStrHasDependent === true || input.okStrIs65 === true || input.okStrDisabled === true ? "$50,000" : "$20,000"} limit; Form 538-S attached; refundable)`);
    else notes.push(`OK line 25: sales tax relief credit $0 — gross household income ${fmtD(ghi)} exceeds the limit ($20,000, or $50,000 with a dependent, a 65+ filer, or a qualifying disability)`);
  }
  const l26 = rd(c(input.okNaturalDisasterCredit));
  const l27 = rd(c(input.okForm578Credit));

  // line 28: Oklahoma EIC — Form 511-EIC computes the 2020-rule federal EIC on
  // 2025 earned income and, optionally, 2024 earned income; the larger feeds
  // Schedule 511-G (5%, prorated)
  let l28 = 0n;
  if (input.okEicEligible === true) {
    const kids = (input.okEicQualifyingChildren as number) ?? 0;
    const cur = rd(
      evalStateTax("us.ok.eic_2020_rules", 0n, {
        okEicEarnedIncome: rd(c(input.okEicEarnedIncome2025)),
        okEicAgi: fagi,
        okEicQualifyingChildren: kids,
        okEicEligible: true,
      }),
    );
    let prior = 0n;
    if (input.okEicEarnedIncome2024 !== undefined && input.okEicAgi2024 === undefined) {
      notes.push("OK Form 511-EIC 2024 column SKIPPED — okEicAgi2024 (2024 federal AGI, line 17) is required with okEicEarnedIncome2024 so the line 19 AGI look-up can run; only the 2025 column was used");
    } else if (input.okEicEarnedIncome2024 !== undefined) {
      prior = rd(
        evalStateTax("us.ok.eic_2020_rules", 0n, {
          okEicEarnedIncome: rd(c(input.okEicEarnedIncome2024)),
          okEicAgi: rd(c(input.okEicAgi2024)),
          okEicQualifyingChildren: kids,
          okEicEligible: true,
        }),
      );
    }
    const eic2020 = prior > cur ? prior : cur;
    if (eic2020 > 0n) {
      l28 = rd(evalStateTax("us.ok.eic", 0n, { okEic2020Amount: eic2020, okAgi: l7, okFederalAgi: fagi }));
      notes.push(`OK line 28: Oklahoma EIC ${fmtD(l28)} = 5% of the 2020-rule federal EIC ${fmtD(eic2020)} (Form 511-EIC line 20, ${prior > cur ? "2024" : "2025"} earned income column${prior > 0n && prior !== cur ? `; the other year gave ${fmtD(prior > cur ? cur : prior)}` : ""}${l7 < fagi ? `; prorated by Oklahoma AGI ÷ federal AGI on Schedule 511-G` : ""}; refundable)`);
    } else {
      notes.push("OK line 28: Oklahoma EIC $0 — no 2020-rule federal EIC at this earned income/AGI (or MFS)");
    }
    lines["_form_511_eic_line_20"] = fmtD(eic2020);
  }
  let l29 = rd(c(input.okHomeschoolCredit));
  if (l29 > 0n) {
    const students = (input.okHomeschoolStudents as number) ?? 0;
    if (students > 0 && l29 > BigInt(students) * 100000n) {
      notes.push(`OK line 29: Parental Choice homeschool credit ${fmtD(l29)} capped at $1,000 × ${students} student(s)`);
      l29 = BigInt(students) * 100000n;
    }
  }
  const l30 = rd(c(input.okAmendedPaid));
  const l31 = l21 + l22 + l23 + l24 + l25 + l26 + l27 + l28 + l29 + l30;
  const l32 = rd(c(input.okAmendedPriorOverpayment));
  const l33 = l31 - l32;

  // ---- lines 34-42: refund or amount owed ----
  const l34 = max0(l33 - l20);
  const l39 = max0(l20 - l33);
  const l40 = rd(c(input.okUnderpaymentInterest));
  const l35Requested = min2(rd(c(input.okAppliedToNextYear)), l34);
  const l36 = min2(rd(c(input.okDonations)), l34 - l35Requested);
  const l37 = l35Requested + l36;
  let l35 = l35Requested;
  let l38 = max0(l34 - l37);
  let owedInterest = l40;
  if (l34 > 0n && l40 > 0n) {
    // printed instruction: 'reduce the amount you are applying to estimated
    // tax (line 35) or your refund (line 38) by that same amount (but not
    // less than zero)' — the refund first, then the applied amount
    const fromRefund = min2(l40, l38);
    l38 -= fromRefund;
    const fromApplied = min2(l40 - fromRefund, l35);
    l35 -= fromApplied;
    owedInterest = l40 - fromRefund - fromApplied;
    notes.push(`OK line 40: underpayment-of-estimated-tax interest ${fmtD(l40)} paid from the overpayment per the line 40 instructions (refund reduced by ${fmtD(fromRefund)}${fromApplied > 0n ? `, line 35 application reduced by ${fmtD(fromApplied)}` : ""}); line 42 is printed as the form adds it, '_amount_to_pay' is what is still owed`);
  }
  const l41a = rd(c(input.okPenalty));
  const l41b = rd(c(input.okInterest));
  const l42 = l39 + l40 + l41a + l41b; // printed: 'add lines 39 through 41b'
  const amountToPay = l39 + (l34 > 0n ? owedInterest : l40) + l41a + l41b;

  notes.push("OK scope: Form 511 is the full-year RESIDENT return — part-year and nonresident filers use Form 511-NR (not composed); Oklahoma has no local income taxes; Form 511-TX, 511-CR, 573, and 561 amounts are transcribed inputs");

  return {
    "1_federal_agi": fmtD(fagi),
    ...(l2 !== 0n ? { "2_subtractions": fmtD(l2) } : {}),
    "3_line1_minus_line2": fmtD(l3),
    ...(l4 !== 0n ? { "4_out_of_state_income": fmtD(l4) } : {}),
    "5_line3_minus_line4": fmtD(l5),
    ...(l6 !== 0n ? { "6_additions": fmtD(l6) } : {}),
    "7_oklahoma_agi": fmtD(l7),
    ...(l8 !== 0n ? { "8_adjustments": fmtD(l8) } : {}),
    "9_income_after_adjustments": fmtD(l9),
    ...lines,
    "12_total_deductions_and_exemptions": fmtD(l12),
    "13_taxable_income": fmtD(l13),
    "14a_tax_from_table": fmtD(l14a),
    ...(l14b !== 0n ? { "14b_additional_tax": fmtD(l14b) } : {}),
    "14_oklahoma_income_tax": fmtD(l14),
    ...(l15 !== 0n ? { "15_child_care_child_tax_credit": fmtD(l15) } : {}),
    ...(l16 !== 0n ? { "16_other_state_credit": fmtD(l16) } : {}),
    ...(l17 !== 0n ? { "17_other_credits": fmtD(l17) } : {}),
    "18_income_tax": fmtD(l18),
    ...(l19 !== 0n ? { "19_use_tax": fmtD(l19) } : {}),
    "20_balance": fmtD(l20),
    "21_withholding": fmtD(l21),
    ...(l22 !== 0n ? { "22_estimated_payments": fmtD(l22) } : {}),
    ...(l23 !== 0n ? { "23_extension_payment": fmtD(l23) } : {}),
    ...(l24 !== 0n ? { "24_property_tax_relief_credit": fmtD(l24) } : {}),
    ...(l25 !== 0n ? { "25_sales_tax_relief_credit": fmtD(l25) } : {}),
    ...(l26 !== 0n ? { "26_natural_disaster_credit": fmtD(l26) } : {}),
    ...(l27 !== 0n ? { "27_form_578_credit": fmtD(l27) } : {}),
    ...(l28 !== 0n ? { "28_earned_income_credit": fmtD(l28) } : {}),
    ...(l29 !== 0n ? { "29_homeschool_credit": fmtD(l29) } : {}),
    ...(l30 !== 0n ? { "30_amended_prior_payments": fmtD(l30) } : {}),
    "31_payments_and_credits": fmtD(l31),
    ...(l32 !== 0n ? { "32_amended_prior_overpayment": fmtD(l32) } : {}),
    "33_total_payments_and_credits": fmtD(l33),
    "34_overpayment": fmtD(l34),
    ...(l35 !== 0n ? { "35_applied_to_2026_estimated_tax": fmtD(l35) } : {}),
    ...(l36 !== 0n ? { "36_donations": fmtD(l36) } : {}),
    ...(l37 !== 0n ? { "37_total_deductions_from_refund": fmtD(l37) } : {}),
    "38_refund": fmtD(l38),
    "39_tax_due": fmtD(l39),
    ...(l40 !== 0n ? { "40_underpayment_interest": fmtD(l40) } : {}),
    ...(l41a + l41b !== 0n ? { "41_penalty_and_interest": fmtD(l41a + l41b) } : {}),
    "42_total_tax_penalty_and_interest": fmtD(l42),
    ...(amountToPay !== l42 ? { _amount_to_pay: fmtD(amountToPay) } : {}),
  };
}
