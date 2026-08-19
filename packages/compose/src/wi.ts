/**
 * 2025 Wisconsin Form 1 line composer (line numbers per the printed form).
 * The chart tax, sliding standard deduction, EIC, married couple credit,
 * school property tax credit, and the Act 15 retirement subtraction are
 * oracle targets; the dependent standard-deduction worksheet, the Schedule 1
 * itemized-deduction credit, and the line-16 CREDITS FORFEITURE (claiming
 * the SB-16 retirement subtraction bars every line 13-20 / 30-35 / Schedule
 * CR credit) are applied here per the printed instructions.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const EXEMPTION = 70000n; // $700 per exemption
const EXEMPTION_65 = 25000n; // $250 per 65+ box (taxpayer/spouse)
const DEP_STD_MIN = 135000n; // $1,350 (dependent worksheet)
const DEP_STD_ADDITION = 45000n; // $450

export function composeWI(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const mfs = isMfs(input);
  const fagi = c(input.federalAGI);

  const l1 = rd(fagi);
  const l2 = rd(c(input.wiScheduleIAdjustments)); // signed (IRC as of 12/31/2022)
  if (l2 !== 0n) notes.push(`WI Schedule I adjustment ${fmtD(l2)} (Wisconsin conforms to the IRC as of December 31, 2022 — post-2022 federal changes incl. the 2025 OBBBA need Schedule I conversion)`);
  const l3 = l1 + l2;
  const l4 = rd(c(input.additions)); // Schedule AD
  const l5 = l3 + l4;

  // ---- Schedule SB subtractions (line 6) ----
  const ss = rd(c(input.taxableSocialSecurity));
  if (ss > 0n) notes.push(`WI SB line 4: federally taxable Social Security ${fmtD(ss)} subtracted (Wisconsin never taxes it)`);
  const cgSub = rd(c(input.wiCapitalGainSubtraction));
  if (cgSub > 0n) notes.push(`WI SB line 5 capital gain subtraction ${fmtD(cgSub)} (Schedule WD: 30% net LTCG exclusion, 60% farm; loss limit $3,000/$1,500-MFS for TY2023+)`);
  const ret67 =
    c(input.wiRetirement67Income) > 0n
      ? rd(
          evalStateTax("us.wi.retirement_subtraction_67", 0n, {
            wiRetirementIncome67: c(input.wiRetirement67Income),
            wiBothSpouses67: input.wiBothSpouses67 === true,
          }),
        )
      : 0n;
  const creditsForfeited = ret67 > 0n;
  if (creditsForfeited) notes.push(`WI SB line 16 retirement subtraction ${fmtD(ret67)} (2025 Act 15, 67+, cap $${input.wiBothSpouses67 === true && joint ? "48,000" : "24,000"}) — ALL Form 1 credits on lines 13-20 and 30-35 and Schedule CR are FORFEITED (including carryforwards); compare both ways before electing`);
  const l6 = rd(c(input.subtractions)) + ss + cgSub + ret67;
  const l7 = l5 - l6; // Wisconsin income (signed)

  // ---- line 8: sliding standard deduction (oracle; dependent worksheet here) ----
  let l8 = rd(evalStateTax("us.wi.standard_deduction", 0n, { wiIncome: l7 }));
  if (input.claimedAsDependent === true) {
    const earned = rd(c(input.wiDependentEarnedIncome));
    const limit = earned + DEP_STD_ADDITION < DEP_STD_MIN ? DEP_STD_MIN : earned + DEP_STD_ADDITION;
    if (limit < l8) {
      l8 = limit;
      notes.push(`WI dependent standard deduction ${fmtD(l8)} (worksheet: greater of $1,350 or earned income + $450, capped at the table amount)`);
    }
  }
  const l9 = max0(l7 - l8);

  // ---- line 10: exemptions ----
  const nExemptions = (input.exemptions as number) ?? (joint ? 2 : 1);
  const boxes65 = BigInt((input.wiAge65Boxes as number) ?? 0);
  const l10a = BigInt(nExemptions) * EXEMPTION;
  const l10b = boxes65 * EXEMPTION_65;
  const l10c = l10a + l10b;
  if (input.claimedAsDependent === true && nExemptions > 0) notes.push("WI exemptions: a filer claimable as a dependent gets NO $700 exemption for themself — the exemptions count should exclude them (line 10a instructions)");
  if (boxes65 > 0n && nExemptions === 0) notes.push("WI line 10b: the $250 age-65 exemption is allowed only for a person allowed the $700 line 10a exemption — verify the boxes");
  const l11 = max0(l9 - l10c);
  const l12 = rd(evalStateTax("us.wi.income_tax", l11));

  // ---- lines 13-20: nonrefundable credit stack (forfeited under SB-16) ----
  const forfeit = (v: Cents, label: string): Cents => {
    if (creditsForfeited && v > 0n) {
      notes.push(`WI ${label} forced to $0 — forfeited by the SB line 16 retirement subtraction election`);
      return 0n;
    }
    return v;
  };
  const itemizedComponents = rd(c(input.wiItemizedComponents));
  const l13 = forfeit(itemizedComponents > l8 ? rd(((itemizedComponents - l8) * 5n) / 100n) : 0n, "itemized deduction credit");
  const l14 = forfeit(rd(c(input.wi2441Credit)), "additional child and dependent care credit");
  const l15 = forfeit(rd((rd(c(input.wiBlindWorkerExpenses)) * 50n) / 100n), "blind worker transportation credit");
  const sptcInputs = c(input.wiRentHeatIncluded) + c(input.wiRentHeatNotIncluded) + c(input.wiPropertyTaxesPaid);
  let l16 = forfeit(
    sptcInputs > 0n
      ? rd(
          evalStateTax("us.wi.school_property_tax_credit", 0n, {
            wiRentHeatIncluded: c(input.wiRentHeatIncluded),
            wiRentHeatNotIncluded: c(input.wiRentHeatNotIncluded),
            wiPropertyTaxesPaid: c(input.wiPropertyTaxesPaid),
          }),
        )
      : 0n,
    "school property tax credit",
  );
  if (input.wiMarriedHoh === true && l16 > 15000n) {
    l16 = 15000n;
    notes.push("WI school property tax credit capped at $150: 'Head of household, married' filers share the MFS cap (instructions p.18)");
  }
  if (l16 > 0n && c(input.wiVeteransCredit) > 0n) {
    notes.push("WI conflict: the school property tax credit is NOT claimable when the line 34 veterans and surviving spouses credit is claimed (instructions p.18) — resolve before filing");
  }
  const l17 = 0n; // working families tax credit — 2025 instructions: "No credit is allowable"
  let l18 = 0n;
  if (c(input.wiLowerQualifiedEarnedIncome) > 0n) {
    if (!joint) notes.push("WI married couple credit $0: joint returns with two earners only");
    else l18 = forfeit(rd(evalStateTax("us.wi.married_couple_credit", 0n, { wiLowerQualifiedEarnedIncome: c(input.wiLowerQualifiedEarnedIncome) })), "married couple credit");
  }
  const l19 = forfeit(rd(c(input.nonrefundableCredits)), "Schedule CR nonrefundable credits");
  const l20 = forfeit(rd(c(input.wiOtherStateCredit)), "credit for net tax paid to another state");
  const l21 = l13 + l14 + l15 + l16 + l17 + l18 + l19 + l20;
  const l22 = max0(l12 - l21);

  const l23 = rd(c(input.useTax));
  const l24 = rd(c(input.wiDonations));
  const l25 = rd((rd(c(input.wiFederalRetirementPenalties)) * 33n) / 100n); // "x .33" printed
  if (l25 > 0n) notes.push(`WI line 25: 33% of the federal retirement-plan/IRA/MSA penalties = ${fmtD(l25)}`);
  const l26 = rd(c(input.wiOtherPenalties));
  const l27 = l22 + l23 + l24 + l25 + l26;

  // ---- lines 28-35: payments and refundable credits ----
  const l28 = rd(c(input.stateWithholding));
  const l29 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  let l30 = 0n;
  const eicBase = input.wiFederalEicForWi !== undefined ? c(input.wiFederalEicForWi) : c(input.federalEITC);
  const kids = (input.wiEicQualifyingChildren as number) ?? 0;
  if (eicBase > 0n && kids > 0) {
    if (mfs) notes.push("WI earned income credit $0: married filing separately is ineligible (unless IRC § 7703(b) applies — then file as 'head of household, married')");
    else {
      l30 = rd(evalStateTax("us.wi.eic", 0n, { wiFederalEicForWi: eicBase, wiQualifyingChildren: kids }));
      if (creditsForfeited) {
        notes.push("WI earned income credit forced to $0 — forfeited by the SB line 16 retirement subtraction election");
        l30 = 0n;
      } else notes.push(`WI earned income credit ${fmtD(l30)} (${kids >= 3 ? 34 : kids === 2 ? 11 : 4}% of the federal EIC as computed under Wisconsin's IRC)`);
    }
  } else if (eicBase > 0n && kids === 0) notes.push("WI earned income credit $0: no credit without a qualifying child (unlike federal)");
  if (c(input.wiVeteransCredit) > 0n && (c(input.wiFarmlandCredit) > 0n || c(input.wiHomesteadCredit) > 0n)) {
    notes.push("WI conflict: farmland preservation and homestead credits are NOT claimable together with the veterans and surviving spouses credit — resolve before filing");
  }
  const l31 = forfeit(rd(c(input.wiFarmlandCredit)), "farmland preservation credit");
  const l32 = forfeit(rd(c(input.wiRepaymentCredit)), "repayment credit");
  const l33 = forfeit(rd(c(input.wiHomesteadCredit)), "homestead credit");
  const l34 = forfeit(rd(c(input.wiVeteransCredit)), "veterans and surviving spouses property tax credit");
  const l35 = forfeit(rd(c(input.refundableCredits)), "Schedule CR refundable credits");
  const l37 = l28 + l29 + l30 + l31 + l32 + l33 + l34 + l35;
  const l39 = l37; // lines 36/38 amended-only

  const l40 = max0(l39 - l27);
  const l42 = rd(c(input.wiAppliedToNextYear));
  const l41 = max0(l40 - l42);
  const l43 = max0(l27 - l39);
  const l44 = rd(c(input.wiScheduleUInterest));
  const l45 = l43 + l44;

  return {
    "1_federal_agi": fmtD(l1),
    ...(l2 !== 0n ? { "2_schedule_i_adjustments": fmtD(l2) } : {}),
    "4_additions": fmtD(l4), "6_subtractions": fmtD(l6), "7_wisconsin_income": fmtD(l7),
    "8_standard_deduction": fmtD(l8), "9_after_deduction": fmtD(l9),
    "10c_exemptions": fmtD(l10c), "11_taxable_income": fmtD(l11), "12_tax": fmtD(l12),
    "13_itemized_deduction_credit": fmtD(l13),
    ...(l14 !== 0n ? { "14_additional_cdcc": fmtD(l14) } : {}),
    "16_school_property_tax_credit": fmtD(l16),
    "18_married_couple_credit": fmtD(l18),
    "21_total_nonrefundable_credits": fmtD(l21), "22_net_tax": fmtD(l22),
    ...(l23 !== 0n ? { "23_sales_use_tax": fmtD(l23) } : {}),
    ...(l25 !== 0n ? { "25_retirement_penalties_33pct": fmtD(l25) } : {}),
    "27_total_tax": fmtD(l27), "28_withholding": fmtD(l28),
    "30_earned_income_credit": fmtD(l30),
    ...(l33 !== 0n ? { "33_homestead_credit": fmtD(l33) } : {}),
    "37_total_payments": fmtD(l37), "40_overpaid": fmtD(l40), "41_refund": fmtD(l41),
    "43_underpaid": fmtD(l43), "45_amount_owed": fmtD(l45),
  };
}
