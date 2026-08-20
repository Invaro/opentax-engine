/**
 * 2025 Oregon Form OR-40 line composer (line numbers per the printed form).
 * The table/chart tax, federal tax liability subtraction (with the printed
 * worksheet composed here), standard deduction, exemption credit, EIC,
 * Kids Credit, and kicker are oracle targets; the Schedule OR-ASC buckets,
 * political contribution credit, itemized-vs-standard choice, and the
 * lines 41-53 settle chain are composed here per the printed form.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

export function composeOR(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const mfs = isMfs(input);
  const fagi = rd(c(input.federalAGI));

  // ---- lines 7-15: income and subtractions ----
  const l7 = fagi;
  const l8 = rd(c(input.orAdditions));
  if (l8 > 0n) notes.push(`OR line 8 additions ${fmtD(l8)} (Schedule OR-ASC line A5 — transcribed)`);
  const l9 = l7 + l8;

  // line 10: federal tax liability subtraction — the printed worksheet
  // composed from federal components, then the Table 4 cap via the oracle
  let worksheetLine10: Cents;
  if (input.orFederalTaxLiabilityOverride !== undefined) {
    worksheetLine10 = rd(c(input.orFederalTaxLiabilityOverride));
    notes.push("OR line 10: federal tax liability taken from override (amended/foreign-tax/1040-NR/recapture situations per Publication OR-17)");
  } else {
    const wl3 = max0(rd(c(input.orFederal1040Line22)) - rd(c(input.orExcessAptcRepayment)));
    const wl5 = wl3 + rd(c(input.orFederalOtherIncomeTaxes));
    const wl9 = rd(c(input.orFederalAoc)) + rd(c(input.orFederalRefundableAdoption)) + rd(c(input.orFederalPtc));
    worksheetLine10 = max0(wl5 - wl9);
  }
  const l10 = rd(
    evalStateTax("us.or.federal_tax_subtraction", 0n, {
      orFederalTaxLiability: worksheetLine10,
      orAgi: fagi,
    }),
  );
  if (l10 > 0n) notes.push(`OR line 10: federal tax liability subtraction ${fmtD(l10)} (1040 line 22 − excess-APTC + other income taxes, minus AOC/refundable-adoption/PTC — NOT the EITC or ACTC; capped $8,500/$4,250-MFS and AGI-phased per Table 4)`);
  else if (worksheetLine10 > 0n) notes.push(`OR line 10: the $${fmtD(worksheetLine10)} federal tax liability is fully phased out by AGI (Table 4: $0 at $145,000+ single/MFS, $290,000+ joint/HOH/QSS)`);

  const l11 = rd(c(input.taxableSocialSecurity));
  if (l11 > 0n) notes.push(`OR line 11: Social Security subtraction ${fmtD(l11)} (federal line 6b in full — Oregon never taxes SS; tier 2/windfall Railroad Retirement subtracts on OR-ASC instead)`);
  const l12 = rd(c(input.orStateRefund));
  const l13 = rd(c(input.orSubtractions));
  if (l13 > 0n) notes.push(`OR line 13 subtractions ${fmtD(l13)} (Schedule OR-ASC line B7: OBBBA-conforming tips/overtime/vehicle-interest codes 390/391/392, US government interest, federal pension %, OR-HOME first-time home buyer, 529 contributions — transcribed)`);
  const l14 = l10 + l11 + l12 + l13;
  const l15 = l9 - l14;

  // ---- lines 16-19: deductions and taxable income ----
  const boxes = (input.orStdBoxes as number) ?? 0;
  const l17 = rd(
    evalStateTax("us.or.standard_deduction", 0n, {
      orStdBoxes: boxes,
      isClaimedAsDependent: input.claimedAsDependent === true,
      orDependentEarnedIncome: c(input.orDependentEarnedIncome),
      spouseItemizes: input.orSpouseItemizes === true,
    }),
  );
  const l16 = rd(c(input.orItemizedDeductions));
  const l18 = l16 > l17 ? l16 : l17;
  if (l16 > l17) notes.push(`OR itemized deductions ${fmtD(l16)} (Schedule OR-A — Oregon's own amounts, NOT the federal Schedule A) beat the standard deduction ${fmtD(l17)}`);
  if (mfs && input.orSpouseItemizes === true) notes.push("OR MFS: standard deduction is $0 because the spouse itemizes — Schedule OR-A required");
  const l19 = max0(l15 - l18);

  // ---- lines 20-24: tax ----
  let l20: Cents;
  if (input.orTaxMethodOverride !== undefined) {
    l20 = rd(c(input.orTaxMethodOverride));
    notes.push("OR line 20: tax from an alternate method (20a farm income averaging OR-FIA-40 / 20b farm capital gain Worksheet FCG / 20c the IRREVOCABLE OR-PTE-FY reduced rate — agent-computed, box checked)");
  } else {
    l20 = rd(evalStateTax("us.or.income_tax", l19));
  }
  const l21 = rd(c(input.orInstallmentInterest));
  if (l21 > 0n) notes.push("OR line 21: interest on installment-sale deferred tax (9% annual rate for 2025)");
  const l22 = rd(c(input.orCreditRecaptures));
  const l23 = l21 + l22;
  const l24 = l20 + l23;

  // ---- lines 25-31: standard and carryforward credits ----
  const l25 = rd(
    evalStateTax("us.or.exemption_credit", 0n, {
      orRegularExemptions: (input.orRegularExemptions as number) ?? 0,
      orDisabilityExemptions: (input.orDisabilityExemptions as number) ?? 0,
      orAgi: fagi,
    }),
  );
  if (l25 > 0n) notes.push(`OR line 25: exemption credit ${fmtD(l25)} ($256 per exemption; $0 cliff above $100,000/$200,000 federal AGI — disability exemptions cliff at $100,000 for every status)`);
  // political contribution credit: $50/$100 cap, AGI cliff $75,000/$150,000
  const polRaw = rd(c(input.orPoliticalContributions));
  let l26 = 0n;
  if (polRaw > 0n) {
    const agiLimit = joint ? 15000000n : 7500000n;
    if (fagi > agiLimit) {
      notes.push(`OR line 26: political contribution credit $0 — federal AGI exceeds ${fmtD(agiLimit)}`);
    } else {
      l26 = min2(polRaw, joint ? 10000n : 5000n);
      notes.push(`OR line 26: political contribution credit ${fmtD(l26)} (standard credit, max $${joint ? "100" : "50"})`);
    }
  }
  const l27 = rd(c(input.nonrefundableCredits)); // OR-ASC D16 standard credits
  const l28 = l25 + l26 + l27;
  const l29 = max0(l24 - l28);
  const l30 = min2(rd(c(input.orCarryforwardCredits)), l29);
  const l31 = l29 - l30;

  // ---- lines 32-40: kicker, payments, refundable credits ----
  let l32 = 0n;
  const liab2024 = rd(c(input.or2024TaxLiability));
  if (input.orKickerDonate === true) {
    notes.push("OR line 32: kicker $0 — filer irrevocably donates the entire kicker to the State School Fund (box 55)");
  } else if (liab2024 > 0n) {
    l32 = rd(evalStateTax("us.or.kicker", 0n, { or2024TaxLiability: liab2024 }));
    notes.push(`OR line 32: surplus kicker ${fmtD(l32)} (9.863% of the 2024 liability ${fmtD(liab2024)} — the 2024 after-other-state-credit liability; requires the 2024 return filed first)`);
  }
  const l33 = rd(c(input.stateWithholding));
  const l34 = rd(c(input.priorYearOverpaymentCredited));
  const l35 = rd(c(input.estimatedPayments)) + rd(c(input.extensionPayment));
  const l36 = rd(c(input.orPtePayments));
  const fedEic = rd(c(input.federalEITC));
  let l37 = 0n;
  if (fedEic > 0n) {
    l37 = rd(evalStateTax("us.or.eic", 0n, { orFederalEic: fedEic, orYoungestUnder3: input.orYoungestUnder3 === true }));
    notes.push(`OR line 37: earned income credit ${fmtD(l37)} (${input.orYoungestUnder3 === true ? "12% — youngest dependent under 3" : "9%"} of the federal EITC, refundable)`);
  }
  let l38 = 0n;
  const kidsUnder6 = (input.orKidsUnder6 as number) ?? 0;
  if (kidsUnder6 > 0) {
    if (mfs) {
      notes.push("OR line 38: Oregon Kids Credit $0 — married filing separately is ineligible");
    } else {
      // qualifying income: line 15 + OBBBA-code subtractions + loss/exclusion addback
      const qi = l15 + rd(c(input.orKidsObbbaAddback)) + rd(c(input.orKidsLossAddback));
      l38 = rd(evalStateTax("us.or.kids_credit", 0n, { orKidsQualifyingIncome: qi, orKidsUnder6: kidsUnder6 }));
      if (l38 > 0n) notes.push(`OR line 38: Oregon Kids Credit ${fmtD(l38)} (${Math.min(kidsUnder6, 5)} × $1,050, refundable; qualifying income ${fmtD(qi)} vs the $26,550-$31,550 phase-out)`);
      else notes.push(`OR line 38: Oregon Kids Credit $0 — qualifying income ${fmtD(qi)} is $31,550 or more`);
    }
  }
  const l39 = rd(c(input.refundableCredits)); // OR-ASC F7
  const l40 = l32 + l33 + l34 + l35 + l36 + l37 + l38 + l39;

  // ---- lines 41-53: settle ----
  const l41 = max0(l40 - l31);
  const l42 = max0(l31 - l40);
  const l45 = rd(c(input.orPenalty)) + rd(c(input.orInterest));
  // printed line 46 note: when the line 41 overpayment is less than line 45,
  // line 46 = line 45 minus line 41 (also covers l41 = l42 = 0 with penalties)
  const l46 = l42 > 0n ? l42 + l45 : l45 > l41 ? l45 - l41 : 0n;
  const l47 = l41 > 0n ? max0(l41 - l45) : 0n;
  if (l41 > 0n && l45 > l41) notes.push(`OR penalty and interest ${fmtD(l45)} exceed the overpayment ${fmtD(l41)} — see the line 46 instructions (the excess is owed)`);
  const l48to51 = rd(c(input.orAppliedToNextYear)) + rd(c(input.orCharitableCheckoffs)) + rd(c(input.orPoliticalPartyCheckoff)) + rd(c(input.or529Deposits));
  const l52 = min2(l48to51, l47);
  const l53 = l47 - l52;

  notes.push("OR scope: the statewide transit tax (0.1% of wages, employer-withheld), Portland Metro SHS, Multnomah County PFA, and TriMet/LTD self-employment taxes are SEPARATE filings — never on Form OR-40");

  return {
    "7_federal_agi": fmtD(l7),
    ...(l8 !== 0n ? { "8_additions": fmtD(l8) } : {}),
    "10_federal_tax_subtraction": fmtD(l10),
    ...(l11 !== 0n ? { "11_social_security": fmtD(l11) } : {}),
    ...(l12 !== 0n ? { "12_state_refund": fmtD(l12) } : {}),
    ...(l13 !== 0n ? { "13_asc_subtractions": fmtD(l13) } : {}),
    "14_total_subtractions": fmtD(l14),
    "15_income_after_subtractions": fmtD(l15),
    "18_deduction": fmtD(l18), "_deduction_method": l16 > l17 ? "itemized" : "standard",
    "19_taxable_income": fmtD(l19),
    "20_tax": fmtD(l20),
    ...(l23 !== 0n ? { "23_additions_to_tax": fmtD(l23) } : {}),
    "24_tax_before_credits": fmtD(l24),
    ...(l25 !== 0n ? { "25_exemption_credit": fmtD(l25) } : {}),
    ...(l26 !== 0n ? { "26_political_contribution_credit": fmtD(l26) } : {}),
    "28_standard_credits": fmtD(l28),
    ...(l30 !== 0n ? { "30_carryforward_credits": fmtD(l30) } : {}),
    "31_tax_after_credits": fmtD(l31),
    ...(l32 !== 0n ? { "32_kicker": fmtD(l32) } : {}),
    "33_withholding": fmtD(l33),
    ...(l37 !== 0n ? { "37_eic": fmtD(l37) } : {}),
    ...(l38 !== 0n ? { "38_kids_credit": fmtD(l38) } : {}),
    "40_total_payments": fmtD(l40),
    "41_overpayment": fmtD(l41), "42_tax_to_pay": fmtD(l42),
    "46_amount_owed": fmtD(l46), "47_refund": fmtD(l47),
    ...(l52 !== 0n ? { "52_refund_applications": fmtD(l52) } : {}),
    "53_net_refund": fmtD(l53),
  };
}
