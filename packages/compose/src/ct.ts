/**
 * 2025 Connecticut Form CT-1040 line composer (line numbers per the printed
 * form, Rev. 12/25). The Tax Calculation Schedule (Tables A-E on Connecticut
 * AGI), the property tax credit, the Connecticut EITC, the Social Security
 * benefit adjustment, and the pension/annuity subtraction are oracle targets;
 * the Schedule 1 buckets (50% teachers' retirement, CHET/ABLE caps), the
 * Schedule 2 other-jurisdiction credit arithmetic, the line 10/11 cap
 * interplay, and the lines 21-30 refund/owe chain are composed here per the
 * printed form.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

export function composeCT(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const fs = (input as { filingStatus?: string }).filingStatus;
  const jointColumn = isJoint(input) || fs === "qss";
  const fagi = rd(c(input.federalAGI));

  // ---- lines 1-5: Connecticut AGI ----
  const l1 = fagi;
  const l2 = rd(c(input.additions)); // Schedule 1 line 38
  if (l2 > 0n) notes.push(`CT line 2: Schedule 1 additions ${fmtD(l2)} (non-Connecticut municipal interest and exempt-interest dividends, Form 4972 lump sums, 100% of § 168(k) bonus depreciation, 80% of § 179, Connecticut tax deducted above the line — transcribed)`);
  const l3 = l1 + l2;

  // Schedule 1 subtractions
  const other = rd(c(input.subtractions)); // lines 39, 40, 42, 46, 47, 48a, 48c, 49
  const l43 = rd(c(input.ctRailroadRetirement));
  const l44 = rd(c(input.ctMilitaryRetirement));
  if (l44 > 0n) notes.push(`CT Schedule 1 line 44: military retirement pay ${fmtD(l44)} subtracted in full (§ 12-701(a)(20)(B)(xvi))`);
  const teachers = rd(c(input.ctTeachersRetirement));
  const l45 = rd(teachers / 2n);
  if (teachers > 0n) notes.push(`CT Schedule 1 line 45: 50% of Connecticut Teachers' Retirement income ${fmtD(teachers)} → ${fmtD(l45)} (a teacher under the pension AGI threshold may instead take the line 48b pension subtraction on the full amount — never both)`);
  const taxableSs = rd(c(input.taxableSocialSecurity));
  let l41 = 0n;
  if (taxableSs > 0n) {
    l41 = rd(
      evalStateTax("us.ct.social_security_adjustment", 0n, {
        ctFederalAgi: fagi,
        ctTaxableSs: taxableSs,
        ctSsTotalBenefits: rd(c(input.ctSsTotalBenefits)),
        ctSsProvisionalExcess: rd(c(input.ctSsProvisionalExcess)),
      }),
    );
    const threshold = fs === "single" || fs === "mfs" ? 7500000n : 10000000n;
    if (fagi < threshold) notes.push(`CT Schedule 1 line 41: taxable Social Security ${fmtD(taxableSs)} subtracted in full (federal AGI under ${fmtD(threshold)})`);
    else if (l41 > 0n) notes.push(`CT Schedule 1 line 41: Social Security benefit adjustment ${fmtD(l41)} (worksheet: taxable benefits less 25% of the lesser of total benefits or the § 86(b)(1) excess${c(input.ctSsTotalBenefits) === 0n ? " — ctSsTotalBenefits was not supplied, so the worksheet ran with $0 benefits" : ""})`);
    else notes.push("CT Schedule 1 line 41: Social Security benefit adjustment $0 — 25% of the lesser of total benefits or the provisional-income excess equals or exceeds the taxable benefits (or the worksheet inputs were not supplied)");
  }
  const chetRaw = rd(c(input.ctChetContributions));
  const chetCap = jointColumn ? 1000000n : 500000n;
  const l48 = min2(chetRaw, chetCap);
  if (chetRaw > l48) notes.push(`CT Schedule 1 line 48: CHET contributions ${fmtD(chetRaw)} capped at ${fmtD(chetCap)} (excess carries forward five years)`);
  const pension = rd(c(input.ctPensionAnnuityIncome));
  const ira = rd(c(input.ctIraDistributions));
  let l48b = 0n;
  if (pension + ira > 0n) {
    l48b = rd(evalStateTax("us.ct.pension_annuity_subtraction", 0n, { ctFederalAgi: fagi, ctPensionAnnuityIncome: pension, ctIraDistributions: ira }));
    notes.push(`CT Schedule 1 line 48b: pension and annuity subtraction ${fmtD(l48b)} (100% of pensions/annuities ${fmtD(pension)} + the IRA percentage of ${fmtD(ira)}, × the federal-AGI phase-out decimal — $75,000-$100,000 single/MFS/HOH, $100,000-$150,000 MFJ/QSS)`);
  }
  const ableRaw = rd(c(input.ctAbleContributions));
  const l48d = min2(ableRaw, chetCap);
  if (ableRaw > l48d) notes.push(`CT Schedule 1 line 48d: ABLE contributions ${fmtD(ableRaw)} capped at ${fmtD(chetCap)}`);
  const l4 = other + l41 + l43 + l44 + l45 + l48 + l48b + l48d; // Schedule 1 line 50
  const l5 = l3 - l4; // Connecticut AGI

  // ---- line 6: tax from the Tax Calculation Schedule (or the tax tables) ----
  const useTable = input.ctUseTaxTable === true;
  const l6 = rd(evalStateTax("us.ct.income_tax", 0n, { ctAgi: l5, ctUseTaxTable: useTable }));
  notes.push(`CT line 6: ${fmtD(l6)} from the Tax Calculation Schedule on Connecticut AGI ${fmtD(l5)} (Table A exemption, Table B rates, Table C 2% add-back, Table D recapture, Table E credit percentage${useTable ? " — DRS tax-table midpoint method" : ""})`);

  // ---- line 11 (raw) first: Schedule 2 line 55 needs it ----
  const auto2 = rd(c(input.ctPropertyTaxAuto2));
  if (auto2 > 0n && !jointColumn) notes.push(`CT Schedule 3 line 62: second vehicle ${fmtD(auto2)} IGNORED — only married filing jointly or qualifying surviving spouse may claim two vehicles`);
  const l63 = rd(c(input.ctPropertyTaxResidence)) + rd(c(input.ctPropertyTaxAuto1)) + (jointColumn ? auto2 : 0n);
  const l11raw = l63 > 0n ? rd(evalStateTax("us.ct.property_tax_credit", 0n, { ctAgi: l5, ctPropertyTaxPaid: l63 })) : 0n;

  // ---- line 7: credit for income taxes paid to qualifying jurisdictions (Schedule 2, one jurisdiction) ----
  let l7 = 0n;
  const ojIncome = rd(c(input.ctOtherJurisdictionIncome));
  const ojPaid = rd(c(input.ctOtherJurisdictionTaxPaid));
  if (ojIncome > 0n && ojPaid > 0n) {
    const l51 = l5; // modified Connecticut AGI (= line 5 absent the § 12-704 modifications)
    const l55 = max0(l6 - l11raw);
    // line 54: four decimals, not more than 1.0000
    const ratio4 = l51 <= 0n || ojIncome >= l51 ? 10000n : (ojIncome * 10000n + l51 / 2n) / l51;
    const l56 = rd((l55 * ratio4) / 10000n); // truncate to cents, then whole dollars half-up = one half-up rounding
    l7 = min2(l56, ojPaid);
    notes.push(`CT line 7: credit for taxes paid to a qualifying jurisdiction ${fmtD(l7)} (Schedule 2: ${fmtD(ojIncome)} ÷ ${fmtD(l51)} = ${(Number(ratio4) / 10000).toFixed(4)} × (line 6 − line 11 ${fmtD(l55)}) = ${fmtD(l56)}, limited to the ${fmtD(ojPaid)} paid; attach the other jurisdiction's return)`);
  }
  const l8 = max0(l6 - l7);
  const l9 = rd(c(input.ctAmt));
  if (l9 > 0n) notes.push(`CT line 9: Connecticut alternative minimum tax ${fmtD(l9)} (Form CT-6251 — transcribed)`);
  const l10 = l8 + l9;
  const l11 = l10 > 0n ? min2(l11raw, l10) : 0n;
  if (l63 > 0n) {
    if (l10 === 0n) notes.push("CT line 11: property tax credit skipped — line 10 is $0 (Schedule 3 is not completed)");
    else if (l11 === 0n) notes.push(`CT line 11: property tax credit $0 — Connecticut AGI ${fmtD(l5)} is past the phase-out (decimal 1.00)`);
    else notes.push(`CT line 11: property tax credit ${fmtD(l11)} (Schedule 3: ${fmtD(l63)} paid, capped at $300, reduced by the AGI decimal${l11 < l11raw ? `, limited to the line 10 tax` : ""}; nonrefundable, no carryforward)`);
  }
  const l12 = max0(l10 - l11);
  const l13 = min2(rd(c(input.nonrefundableCredits)), l12);
  if (l13 > 0n) notes.push(`CT line 13: Schedule CT-IT credits ${fmtD(l13)} (capped at line 12)`);
  const l14 = max0(l12 - l13);
  const l15 = rd(c(input.useTax));
  if (l15 === 0n) notes.push("CT line 15: individual use tax $0 — the form requires an explicit '0' when none is due (Schedule 4: 1% / 6.35% / 7.75% / 2.99%)");
  const l16 = l14 + l15;
  const l17 = l16;

  // ---- lines 18-21: payments and refundable credits ----
  const l18 = rd(c(input.stateWithholding)) + rd(c(input.spouseStateWithholding));
  const l19 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  const l20 = rd(c(input.extensionPayment));
  const fedEic = rd(c(input.federalEITC));
  let l20a = 0n;
  if (fedEic > 0n) {
    const jointFagi = rd(c(input.ctEitcJointFagi));
    l20a = rd(
      evalStateTax("us.ct.eitc", 0n, {
        ctFederalEic: fedEic,
        ctEitcQualifyingChild: input.ctEitcQualifyingChild === true,
        ctEitcSeparateFagi: jointFagi > 0n ? fagi : 0n,
        ctEitcJointFagi: jointFagi,
      }),
    );
    notes.push(`CT line 20a: Connecticut EITC ${fmtD(l20a)} (40% of the ${fmtD(fedEic)} federal EIC${input.ctEitcQualifyingChild === true ? " + the $250 qualifying-child add-on (PA 25-168)" : ""}${jointFagi > 0n ? `, prorated by separate ÷ joint federal AGI ${fmtD(fagi)} ÷ ${fmtD(jointFagi)}` : ""}; refundable; Schedule CT-EITC attached; full-year residents only)`);
  }
  const l20b = rd(c(input.ctClaimOfRightCredit));
  const l20c = rd(c(input.ctPteCredit));
  const l20d = rd(c(input.ctHistoricHomesCredit));
  const l21 = l18 + l19 + l20 + l20a + l20b + l20c + l20d;

  // ---- lines 22-30: refund or amount owed ----
  const l22 = max0(l21 - l17);
  const l23 = min2(rd(c(input.ctAppliedToNextYear)), l22);
  const l24 = min2(rd(c(input.ctChetRefundContribution)), l22 - l23);
  const l24a = min2(rd(c(input.ctCharityContributions)), l22 - l23 - l24);
  const l25 = max0(l22 - l23 - l24 - l24a);
  const l26 = max0(l17 - l21);
  const l27 = input.ctLate === true && l26 > 0n ? rd(l26 / 10n) : 0n;
  if (l27 > 0n) notes.push(`CT line 27: late payment penalty 10% of the ${fmtD(l26)} due = ${fmtD(l27)}`);
  const l28 = rd(c(input.ctLateInterest));
  const l29 = rd(c(input.ctUnderpaymentInterest));
  const l30 = l26 + l27 + l28 + l29;

  notes.push("CT scope: Form CT-1040 is the full-year RESIDENT return — part-year and nonresident filers use Form CT-1040NR/PY (not composed); Connecticut has no local income taxes; Schedule 2 is composed for ONE qualifying jurisdiction (add further columns by hand); Form CT-6251, Schedule CT-IT, Schedule CT-PE, and Form CT-2210 amounts are transcribed inputs");

  return {
    "1_federal_agi": fmtD(l1),
    ...(l2 !== 0n ? { "2_additions": fmtD(l2) } : {}),
    "3_total": fmtD(l3),
    ...(l4 !== 0n ? { "4_subtractions": fmtD(l4) } : {}),
    ...(l41 !== 0n ? { "41_social_security_adjustment": fmtD(l41) } : {}),
    ...(l43 !== 0n ? { "43_railroad_retirement": fmtD(l43) } : {}),
    ...(l44 !== 0n ? { "44_military_retirement": fmtD(l44) } : {}),
    ...(l45 !== 0n ? { "45_teachers_retirement_50pct": fmtD(l45) } : {}),
    ...(l48 !== 0n ? { "48_chet_contributions": fmtD(l48) } : {}),
    ...(l48b !== 0n ? { "48b_pension_annuity_subtraction": fmtD(l48b) } : {}),
    ...(l48d !== 0n ? { "48d_able_contributions": fmtD(l48d) } : {}),
    "5_connecticut_agi": fmtD(l5),
    "6_income_tax": fmtD(l6),
    ...(l7 !== 0n ? { "7_other_jurisdiction_credit": fmtD(l7) } : {}),
    "8_tax_after_credit": fmtD(l8),
    ...(l9 !== 0n ? { "9_alternative_minimum_tax": fmtD(l9) } : {}),
    "10_total": fmtD(l10),
    ...(l11raw !== 0n ? { "68_schedule3_credit": fmtD(l11raw) } : {}),
    ...(l11 !== 0n ? { "11_property_tax_credit": fmtD(l11) } : {}),
    "12_tax_after_property_credit": fmtD(l12),
    ...(l13 !== 0n ? { "13_allowable_credits": fmtD(l13) } : {}),
    "14_connecticut_income_tax": fmtD(l14),
    "15_use_tax": fmtD(l15),
    "16_total_tax": fmtD(l16),
    "17_total_tax": fmtD(l17),
    "18_withholding": fmtD(l18),
    ...(l19 !== 0n ? { "19_estimated_payments": fmtD(l19) } : {}),
    ...(l20 !== 0n ? { "20_extension_payment": fmtD(l20) } : {}),
    ...(l20a !== 0n ? { "20a_earned_income_tax_credit": fmtD(l20a) } : {}),
    ...(l20b !== 0n ? { "20b_claim_of_right_credit": fmtD(l20b) } : {}),
    ...(l20c !== 0n ? { "20c_pass_through_entity_credit": fmtD(l20c) } : {}),
    ...(l20d !== 0n ? { "20d_historic_homes_credit": fmtD(l20d) } : {}),
    "21_total_payments_and_refundable_credits": fmtD(l21),
    "22_overpayment": fmtD(l22),
    ...(l23 !== 0n ? { "23_applied_to_2026_estimated_tax": fmtD(l23) } : {}),
    ...(l24 !== 0n ? { "24_chet_contribution": fmtD(l24) } : {}),
    ...(l24a !== 0n ? { "24a_charity_contributions": fmtD(l24a) } : {}),
    "25_refund": fmtD(l25),
    "26_tax_due": fmtD(l26),
    ...(l27 !== 0n ? { "27_late_penalty": fmtD(l27) } : {}),
    ...(l28 !== 0n ? { "28_late_interest": fmtD(l28) } : {}),
    ...(l29 !== 0n ? { "29_underpayment_interest": fmtD(l29) } : {}),
    "30_total_amount_due": fmtD(l30),
  };
}
