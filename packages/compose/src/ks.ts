/**
 * 2025 Kansas Form K-40 line composer (line numbers per the printed form).
 * The table/worksheet tax, standard deduction, exemption allowance, Kansas
 * itemized deductions, the 17% EITC, and the 50% child care credit are
 * oracle targets; the Schedule S buckets (100% Social Security, exempt
 * retirement, 529 caps), the standard-vs-itemized choice, the other-state
 * credit worksheet, the 13% lump-sum tax, the EITC nonrefundable/refundable
 * split, and the lines 27-43 balance/refund chain are composed here per the
 * printed form. A federal QSS is composed as Kansas HEAD OF HOUSEHOLD.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

export function composeKS(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const fs = (input as { filingStatus?: string }).filingStatus;
  if (fs === "qss") notes.push("KS filing status: 'If your federal filing status is Qualifying Widow(er) with Dependent Child, check the Head of Household box' — composed as Kansas head of household (single-column rates, $6,180 deduction, $9,160 exemption). The form's HOH box also carries the $2,320 additional exemption and this composer follows the form; K.S.A. 79-32,121b(b)(1) grants it to 'head of household, as defined in 26 U.S.C. § 2(b)', which a federal QSS (§ 2(a)) is not — a preparer may take the stricter view; disclose");
  const fagi = rd(c(input.federalAGI));

  // ---- Schedule S Part A ----
  const a9 = rd(c(input.additions));
  if (a9 > 0n) notes.push(`KS Schedule S line A9: additions ${fmtD(a9)} (non-Kansas municipal interest, KPERS employee contributions from W-2 box 14, § 163(j) carryforward, unqualified savings-account withdrawals, other — transcribed)`);
  const a10 = rd(c(input.taxableSocialSecurity));
  if (a10 > 0n) notes.push(`KS Schedule S line A10: taxable Social Security ${fmtD(a10)} subtracted in full (100% exempt since TY2024 — no AGI limit)`);
  const a12 = rd(c(input.ksUsInterest));
  const a13 = rd(c(input.ksStateRefund));
  const a14 = rd(c(input.ksExemptRetirement));
  if (a14 > 0n) notes.push(`KS Schedule S line A14: exempt retirement benefits ${fmtD(a14)} (KPERS, federal civil service and military retirement, Railroad Retirement, Kansas police/fire/teachers/judges systems — keep the 1099-Rs)`);
  const c529 = rd(c(input.ks529Contributions));
  let a16 = 0n;
  if (c529 > 0n) {
    const beneficiaries = BigInt((input.ks529Beneficiaries as number) ?? 1);
    const cap = (joint ? 600000n : 300000n) * beneficiaries;
    a16 = min2(c529, cap);
    if (a16 < c529) notes.push(`KS Schedule S line A16: 529 contributions ${fmtD(c529)} capped at ${fmtD(cap)} (${joint ? "$6,000" : "$3,000"} per beneficiary × ${beneficiaries})`);
    else notes.push(`KS Schedule S line A16: 529 contributions ${fmtD(a16)} subtracted`);
  }
  const aOther = rd(c(input.subtractions));
  if (aOther > 0n) notes.push(`KS Schedule S other subtractions ${fmtD(aOther)} (lines A11, A15, A17-A25 — KPERS lump sums, military bonuses, ABLE $3,000/$6,000, first-time home buyer, adoption savings, organ donor ≤ $5,000 — transcribed)`);
  const a26 = a10 + a12 + a13 + a14 + a16 + aOther;
  const l2 = a9 - a26;
  const l1 = fagi;
  const l3 = l1 + l2; // Kansas AGI

  // ---- lines 4-7: deductions, exemptions, taxable income ----
  const boxes = (input.ksStdBoxes as number) ?? 0;
  const standard = rd(evalStateTax("us.ks.standard_deduction", 0n, { ksStdBoxes: boxes }));
  const hasItemized = c(input.ksMedicalExpenses) > 0n || c(input.ksPropertyTaxes) > 0n || c(input.ksMortgageInterest) > 0n || c(input.ksCharitableContributions) > 0n;
  let itemized = 0n;
  if (hasItemized) {
    itemized = rd(
      evalStateTax("us.ks.itemized_deductions", 0n, {
        ksMedicalExpenses: c(input.ksMedicalExpenses),
        ksFederalAgi: fagi,
        ksPropertyTaxes: c(input.ksPropertyTaxes),
        ksMortgageInterest: c(input.ksMortgageInterest),
        ksCharitableContributions: c(input.ksCharitableContributions),
      }),
    );
  }
  let l4: Cents;
  let method: string;
  if (input.ksItemize === true) {
    l4 = itemized;
    method = "itemized";
  } else if (input.ksItemize === false || !hasItemized) {
    l4 = standard;
    method = "standard";
  } else if (itemized > standard) {
    l4 = itemized;
    method = "itemized";
    notes.push(`KS line 4: Kansas itemized deductions ${fmtD(itemized)} beat the ${fmtD(standard)} standard deduction (Kansas lets you itemize regardless of the federal election)`);
  } else {
    l4 = standard;
    method = "standard";
    notes.push(`KS line 4: standard deduction ${fmtD(standard)} kept (Kansas Schedule A total ${fmtD(itemized)})`);
  }
  if (fs === "mfs") notes.push(`KS line 4 (MFS): both spouses must use the same method — K.S.A. 79-32,115(g): neither is allowed the Kansas itemized deduction unless both itemize, and neither may use the tax table unless both do; this return is ${method} — pass ksItemize to match the spouse`);
  const l5 = rd(
    evalStateTax("us.ks.exemptions", 0n, {
      ksDependents: (input.dependents as number) ?? 0,
      ksChildrenBornThisYear: (input.ksChildrenBornThisYear as number) ?? 0,
      ksStillbirths: (input.ksStillbirths as number) ?? 0,
      ksDisabledVeterans: (input.ksDisabledVeterans as number) ?? 0,
      isClaimedAsDependent: input.claimedAsDependent === true,
    }),
  );
  const l6 = l4 + l5;
  const l7 = max0(l3 - l6);

  // ---- lines 8-12: tax ----
  const l8 = rd(evalStateTax("us.ks.income_tax", l7));
  const lumpFed = rd(c(input.ksFederalLumpSumTax));
  const l11 = lumpFed > 0n ? rd((lumpFed * 13n + 50n) / 100n) : 0n;
  if (l11 > 0n) notes.push(`KS line 11: Kansas tax on lump-sum distributions ${fmtD(l11)} = 13% of the federal Form 4972 tax ${fmtD(lumpFed)}`);
  const l12 = l8 + l11;

  // ---- lines 13-18: credits ----
  let l13 = 0n;
  const osPaid = rd(c(input.ksOtherStateTaxPaid));
  const osIncome = rd(c(input.ksOtherStateIncome));
  if (osPaid > 0n && osIncome > 0n && l3 > 0n) {
    // Worksheet for Residents: maximum credit = Kansas tax × (other-state income ÷ KAGI), lesser of that or the tax paid
    const maxCredit = osIncome >= l3 ? l12 : rd((l12 * osIncome) / l3);
    l13 = min2(osPaid, maxCredit);
    notes.push(`KS line 13: credit for taxes paid to another state ${fmtD(l13)} (lesser of ${fmtD(osPaid)} paid or ${fmtD(l12)} × ${fmtD(osIncome)} ÷ ${fmtD(l3)} = ${fmtD(maxCredit)}; enclose the other state's return; not the amount withheld)`);
  }
  let l14 = 0n;
  const fedCdcc = rd(c(input.ksFederalChildCareCredit));
  if (fedCdcc > 0n) {
    l14 = rd(evalStateTax("us.ks.child_care_credit", 0n, { ksFederalChildCareCredit: fedCdcc }));
    const room = max0(l12 - l13);
    if (l14 > room) {
      notes.push(`KS line 14: child and dependent care credit ${fmtD(l14)} limited to the remaining tax ${fmtD(room)} (nonrefundable)`);
      l14 = room;
    } else notes.push(`KS line 14: child and dependent care credit ${fmtD(l14)} (50% of the federal credit; residents only; valid SSNs required)`);
  }
  const l15 = min2(rd(c(input.nonrefundableCredits)), max0(l12 - l13 - l14));
  if (l15 > 0n) notes.push(`KS line 15: other credits ${fmtD(l15)} (Schedule K credits — capped at the remaining tax)`);
  const l16 = max0(l12 - l13 - l14 - l15);
  const fedEic = rd(c(input.federalEITC));
  let l17 = 0n;
  let l22 = 0n;
  if (fedEic > 0n) {
    const ksEitc = rd(evalStateTax("us.ks.eitc", 0n, { ksFederalEic: fedEic }));
    l17 = min2(ksEitc, l16);
    l22 = ksEitc - l17;
    notes.push(`KS EITC ${fmtD(ksEitc)} = 17% of the ${fmtD(fedEic)} federal EIC: ${fmtD(l17)} nonrefundable on line 17 (up to line 16) and ${fmtD(l22)} refundable on line 22 (residents only)`);
  }
  const l18 = max0(l16 - l17);

  // ---- lines 19-27: withholding and payments ----
  const l19 = rd(c(input.stateWithholding)) + rd(c(input.spouseStateWithholding));
  const l20 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  const l21 = rd(c(input.extensionPayment));
  const l23 = rd(c(input.refundableCredits));
  const l24 = rd(c(input.ksAmendedPaid));
  const l25 = rd(c(input.ksK120sCredit));
  const l26 = rd(c(input.ksAmendedOverpayment));
  const l27 = l19 + l20 + l21 + l22 + l23 + l24 + l25 - l26;

  // ---- lines 28-43: balance due or overpayment ----
  const l28 = max0(l18 - l27);
  const l29 = rd(c(input.ksInterest));
  const l30 = rd(c(input.ksPenalty));
  const l31 = rd(c(input.ksEstimatedTaxPenalty));
  const checkoffs = rd(c(input.ksCheckoffs));
  const l33 = max0(l27 - l18);
  const l34 = min2(rd(c(input.ksCreditForward)), l33);
  // checkoffs reduce the refund or increase the amount owed
  const refundBeforeCheckoffs = max0(l33 - l34);
  const checkoffsFromRefund = min2(checkoffs, refundBeforeCheckoffs);
  const l43 = refundBeforeCheckoffs - checkoffsFromRefund;
  const l32 = l28 > 0n ? l28 + l29 + l30 + l31 + checkoffs : l29 + l30 + l31 + (checkoffs - checkoffsFromRefund);
  if (l43 > 0n && l43 < 500n) notes.push("KS line 43: a refund under $5 is not issued — carry it forward (line 34) or donate it (lines 35-42)");
  if (l28 === 0n && l29 + l30 + l31 > 0n && l33 > 0n) notes.push(`KS lines 32/33: interest, penalty, or the K-210 estimated tax penalty ${fmtD(l29 + l30 + l31)} is owed on line 32 while line 33 shows an overpayment of ${fmtD(l33)} — the printed form keeps both (line 32 = 'add lines 28 through 31'); pay line 32 and receive line 43`);
  if (l28 > 0n && l28 < 500n) notes.push("KS line 32: a balance due under $5 need not be paid");

  notes.push("KS scope: Form K-40 is composed for a full-year RESIDENT — nonresidents and part-year residents prorate on Schedule S Part B (lines 9-10, not composed); Kansas has no local income taxes; the homestead/property tax refunds (K-40H, K-40PT, K-40SVR) are separate claims; Schedule K credits, Form K-9, and Schedule K-210 amounts are transcribed inputs");

  return {
    "1_federal_agi": fmtD(l1),
    ...(l2 !== 0n ? { "2_modifications": fmtD(l2) } : {}),
    ...(a10 !== 0n ? { "A10_social_security": fmtD(a10) } : {}),
    ...(a14 !== 0n ? { "A14_exempt_retirement": fmtD(a14) } : {}),
    ...(a16 !== 0n ? { "A16_529_contributions": fmtD(a16) } : {}),
    "3_kansas_agi": fmtD(l3),
    "4_deduction": fmtD(l4),
    _deduction_method: method,
    "5_exemption_allowance": fmtD(l5),
    "6_total_deductions": fmtD(l6),
    "7_taxable_income": fmtD(l7),
    "8_tax": fmtD(l8),
    ...(l11 !== 0n ? { "11_lump_sum_tax": fmtD(l11) } : {}),
    "12_total_income_tax": fmtD(l12),
    ...(l13 !== 0n ? { "13_other_state_credit": fmtD(l13) } : {}),
    ...(l14 !== 0n ? { "14_child_care_credit": fmtD(l14) } : {}),
    ...(l15 !== 0n ? { "15_other_credits": fmtD(l15) } : {}),
    "16_subtotal": fmtD(l16),
    ...(l17 !== 0n ? { "17_eitc_nonrefundable": fmtD(l17) } : {}),
    "18_total_tax_balance": fmtD(l18),
    "19_withholding": fmtD(l19),
    ...(l20 !== 0n ? { "20_estimated_payments": fmtD(l20) } : {}),
    ...(l21 !== 0n ? { "21_extension_payment": fmtD(l21) } : {}),
    ...(l22 !== 0n ? { "22_eitc_refundable": fmtD(l22) } : {}),
    ...(l23 !== 0n ? { "23_refundable_credits": fmtD(l23) } : {}),
    ...(l24 !== 0n ? { "24_amended_payments": fmtD(l24) } : {}),
    ...(l25 !== 0n ? { "25_k120s_credit": fmtD(l25) } : {}),
    ...(l26 !== 0n ? { "26_amended_overpayment": fmtD(l26) } : {}),
    "27_total_refundable_credits": fmtD(l27),
    "28_underpayment": fmtD(l28),
    ...(l29 !== 0n ? { "29_interest": fmtD(l29) } : {}),
    ...(l30 !== 0n ? { "30_penalty": fmtD(l30) } : {}),
    ...(l31 !== 0n ? { "31_estimated_tax_penalty": fmtD(l31) } : {}),
    "32_amount_you_owe": fmtD(l32),
    "33_overpayment": fmtD(l33),
    ...(l34 !== 0n ? { "34_credit_forward": fmtD(l34) } : {}),
    ...(checkoffs !== 0n ? { "35_42_checkoffs": fmtD(checkoffs) } : {}),
    "43_refund": fmtD(l43),
  };
}
