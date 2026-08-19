/**
 * 2025 Maryland Form 502 line composer (line numbers per the printed form,
 * COM/RAD-009 10/25). State tax, local tax, exemptions, CTC, poverty credit,
 * the H.B. 352 capital-gains surtax, and the pension exclusion are oracle
 * targets; the EIC worksheets (18A / 18A.1 / 21A), the local EIC/poverty
 * worksheets (19B/19C), the itemized phase-out (14A), and the two-income
 * subtraction cap (13D) are computed here per the printed worksheets.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, isHohOrQss, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const STD_SINGLE = 335000n; // $3,350 (single/MFS/dependent — H.B. 352 flat amount)
const STD_JOINT = 670000n; // $6,700 (MFJ/HOH/QSS)
const AGE_BLIND_BOX = 100000n; // $1,000 per 65+/blind box (unphased)
const CG_SURTAX_FAGI_GATE = 35000000n; // $350,000 (Form 502CG filing gate)

/** 2025 local rates in basis points (×10⁻⁴); AA and Frederick resolved separately. */
const LOCAL_RATES_BP: Record<string, bigint> = {
  baltimore_city: 320n, allegany: 303n, baltimore_county: 320n, calvert: 320n,
  caroline: 320n, carroll: 303n, cecil: 274n, charles: 303n, dorchester: 330n,
  garrett: 265n, harford: 306n, howard: 320n, kent: 320n, montgomery: 320n,
  prince_georges: 320n, queen_annes: 320n, st_marys: 320n, somerset: 320n,
  talbot: 240n, washington: 295n, wicomico: 320n, worcester: 225n, nonresident: 225n,
};

/** Frederick's tier rate (bp) — a single rate on the WHOLE income, with cliffs. */
function frederickRateBp(tni: Cents, jointSchedule: boolean): bigint {
  if (jointSchedule) {
    if (tni <= 2500000n) return 225n;
    if (tni <= 10000000n) return 275n;
    if (tni <= 25000000n) return 296n;
    return 320n;
  }
  if (tni <= 2500000n) return 225n;
  if (tni <= 5000000n) return 275n;
  if (tni <= 15000000n) return 296n;
  return 320n;
}

export function composeMD(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const jointSchedule = joint || isHohOrQss(input); // Schedule II / joint local columns
  const subdivision = input.mdSubdivision as string | undefined;
  if (!subdivision) {
    throw new Error(
      "mdSubdivision is required for a Maryland return — the county (or baltimore_city) where the filer resided on the last day of the tax year drives the mandatory local income tax (Form 502 line 28)",
    );
  }
  const dependentTaxpayer = input.claimedAsDependent === true;
  if (dependentTaxpayer) {
    notes.push("MD Filing Status 6 (dependent taxpayer): exemptions $0 (Chart 10A), no poverty level credit, Schedule I rates and the $3,350 standard deduction apply");
    if (jointSchedule) throw new Error("a Maryland dependent taxpayer (Filing Status 6) files the Schedule I columns — pass filingStatus single/mfs with claimedAsDependent, not mfj/hoh/qss");
  }

  const fagi = c(input.federalAGI);
  const l1 = rd(fagi);
  const l6 = rd(c(input.additions));
  const l7 = l1 + l6;

  // ---- subtractions (lines 8-15) ----
  const l8 = rd(c(input.mdStateRefunds));
  // line 9 cap: smaller of federal 2441 line 6 or $3,000 ($6,000, 2+ dependents)
  const careCap = input.mdChildCareTwoOrMoreDependents === true ? 600000n : 300000n;
  const l9 = min2(rd(c(input.mdChildCareExpenses)), careCap);
  if (l9 > 0n) notes.push(`MD line 9: child and dependent care EXPENSES ${fmtD(l9)} subtract from income (capped at ${fmtD(careCap)}; distinct from the 502CR Part B credit)`);
  if (rd(c(input.mdChildCareExpenses)) > careCap) notes.push("MD line 9 capped: the subtraction is the SMALLER of federal Form 2441 line 6 or $3,000 ($6,000 with two or more dependents)");
  const pension = (p: unknown, ss: unknown): Cents =>
    c(p) > 0n
      ? rd(evalStateTax("us.md.pension_exclusion", 0n, { mdQualifyingPension: c(p), mdSsRrBenefits: c(ss) }))
      : 0n;
  const l10a = pension(input.mdPensionYou, input.mdSsRrBenefitsYou) + pension(input.mdPensionSpouse, input.mdSsRrBenefitsSpouse);
  if (l10a > 0n) notes.push(`MD pension exclusion ${fmtD(l10a)} (Worksheet 13A per qualifying spouse: min(pension, $41,200 − TOTAL SS/RR benefits); 65+/disabled and § 401(a)/403/457(b) plans only — IRAs never qualify)`);
  const l10b = rd(c(input.mdRangerPension));
  const l11 = rd(c(input.taxableSocialSecurity));
  if (l11 > 0n) notes.push(`MD line 11: federally taxable Social Security/RR ${fmtD(l11)} subtracted (Maryland never taxes it)`);
  const l13 = rd(c(input.subtractions));
  let l14 = 0n;
  if (joint && input.mdTwoIncomeLesserSpouseNet !== undefined) {
    l14 = min2(120000n, max0(rd(c(input.mdTwoIncomeLesserSpouseNet))));
    notes.push(`MD two-income subtraction ${fmtD(l14)} (Worksheet 13D: lesser-income spouse's net Maryland income, capped $1,200)`);
  } else if (!joint && c(input.mdTwoIncomeLesserSpouseNet) > 0n) {
    notes.push("MD two-income subtraction $0: joint returns only");
  }
  const l15 = l8 + l9 + l10a + l10b + l11 + l13 + l14;
  const l16 = l7 - l15;

  // ---- deduction method (lines 17/17a-17c) ----
  const standard = jointSchedule ? STD_JOINT : STD_SINGLE;
  let l17 = standard;
  let method = "standard";
  let l17c = 0n;
  if (input.mdItemizing === true) {
    const l17a = rd(c(input.mdFederalItemized));
    const l17b = rd(c(input.mdItemizedStateLocalTaxes));
    const threshold = isMfs(input) ? 10000000n : 20000000n;
    l17c = rd(((max0(fagi - threshold)) * 75n) / 1000n); // 7.5% (Worksheet 14A, H.B. 352)
    if (l17c > 0n) notes.push(`MD itemized phase-out ${fmtD(l17c)} (Worksheet 14A: 7.5% of FAGI over ${fmtD(threshold)})`);
    const itemized = max0(l17a - l17b - l17c);
    if (itemized > standard) {
      l17 = itemized;
      method = "itemized";
    } else {
      notes.push(`MD deduction: standard ${fmtD(standard)} beats itemized ${fmtD(itemized)} — Maryland lets a federal itemizer still take the standard deduction (Instruction 16)`);
    }
  }
  const l18 = l16 - l17;

  // ---- exemptions (line 19) ----
  const nExemptions = (input.exemptions as number) ?? (joint ? 2 : 1);
  const chartAmount = rd(
    evalStateTax("us.md.exemption_amount", 0n, {
      mdFagi: fagi,
      mdExemptionCount: nExemptions,
      mdDependentTaxpayer: dependentTaxpayer,
    }),
  );
  const boxes = BigInt((input.ageOrBlindBoxes as number) ?? 0);
  const l19 = chartAmount + boxes * AGE_BLIND_BOX;
  const l20 = max0(l18 - l19);

  // ---- state tax (lines 20a-27) ----
  let l20a = 0n;
  if (c(input.mdNetCapitalGainSubject) > 0n) {
    if (fagi > CG_SURTAX_FAGI_GATE) {
      l20a = rd(c(input.mdNetCapitalGainSubject));
      notes.push(`MD Form 502CG line 9 net capital gain ${fmtD(l20a)} subject to the 2% H.B. 352 surtax (line 21b)`);
    } else {
      notes.push("MD line 20a forced to $0: FAGI does not exceed $350,000, so the Form 502CG surtax does not apply");
    }
  }
  const l21 = rd(evalStateTax("us.md.income_tax", l20));
  const l21a = rd(c(input.mdRecapturedCredit));
  const l21b = l20a > 0n ? rd(evalStateTax("us.md.capital_gains_surtax", 0n, { mdNetCapitalGainSubject: l20a })) : 0n;
  const mdTaxSum = l21 + l21a + l21b; // "the sum of Lines 21 through 21b" (EIC worksheets)

  const fedEIC = rd(c(input.federalEITC));
  const marriedOrQc = joint || isMfs(input) || input.mdEicQualifyingChild === true;
  // line 22: 50% (married / qualifying child, Worksheet 18A) or 100% (childless single/HOH/QSS, 18A.1)
  const l22 = fedEIC > 0n ? (marriedOrQc ? rd((fedEIC * 50n) / 100n) : fedEIC) : 0n;
  if (fedEIC > 0n) notes.push(marriedOrQc ? `MD EIC ${fmtD(l22)} = 50% of the federal EIC (Worksheet 18A)` : `MD EIC ${fmtD(l22)} = 100% of the federal EIC (childless single/HOH/QSS, Worksheet 18A.1)`);
  if (fedEIC > 0n && isMfs(input)) notes.push("MD MFS EIC: spouses who filed a JOINT federal return may claim a COMBINED total of at most one-half the federal credit across both separate Maryland returns (Instruction 18) — verify the other spouse's claim");

  // line 23: poverty level credit (oracle; needs household size + earned income)
  const earned = rd(c(input.mdEarnedIncome));
  const l23 =
    !dependentTaxpayer && earned > 0n && input.mdHouseholdSize !== undefined
      ? rd(
          evalStateTax("us.md.poverty_level_credit", 0n, {
            mdEarnedIncome: earned,
            mdFagiPlusAdditions: l7,
            mdHouseholdSize: (input.mdHouseholdSize as number) ?? 1,
            mdDependentTaxpayer: dependentTaxpayer,
          }),
        )
      : 0n;
  if (l23 > 0n && isMfs(input)) notes.push("MD poverty level credit (MFS): Worksheet 18B line 1 must use the JOINT federal AGI plus additions when a joint federal return was filed — pass that amount via the poverty inputs, not the separate-return line 7");
  const l24 = rd(c(input.nonrefundableCredits)); // Form 502CR Part AA
  const l25 = rd(c(input.mdBusinessCredits));
  const l26 = l22 + l23 + l24 + l25;
  const l27 = max0(mdTaxSum - l26);

  // ---- local tax (lines 28-33) ----
  const l28 = rd(evalStateTax("us.md.local_tax", l20, { mdSubdivision: subdivision }));
  // worksheet rate: AA fixed .0270 base; Frederick = the filer's tier rate; else chart
  const rateBp =
    subdivision === "anne_arundel" ? 270n
    : subdivision === "frederick" ? frederickRateBp(l20, jointSchedule)
    : (LOCAL_RATES_BP[subdivision] ?? 0n);
  const l29 = l22 > 0n ? rd((fedEIC * rateBp * 10n) / 10000n) : 0n; // 19B: federal EIC × (rate × 10)
  const l30 = l23 > 0n ? rd((earned * rateBp) / 10000n) : 0n; // 19C: earned income × rate
  const l31 = rd(c(input.md502crPartBB));
  const l32 = l29 + l30 + l31;
  const l33 = max0(l28 - l32);
  const l34 = l27 + l33;

  const contributions = rd(c(input.mdContributions));
  const l40 = l34 + contributions;

  // ---- payments and refundable credits (lines 41-46) ----
  const l41 = rd(c(input.stateWithholding)); // state AND local MD withholding, one combined line
  const l42 = rd(c(input.mdMw506nrs));
  const l43 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited)) + rd(c(input.extensionPayment));
  // line 44 refundable EIC: 21A (45%, married/QC, only when the 50% credit fully
  // absorbed the tax and lines 22/29 have entries) or 18A.1 line 4 (childless)
  let l44 = 0n;
  if (fedEIC > 0n) {
    if (marriedOrQc) {
      if (l22 >= mdTaxSum && l22 > 0n && l29 > 0n) l44 = max0(rd((fedEIC * 45n) / 100n) - mdTaxSum);
      else if (l22 < mdTaxSum) notes.push("MD refundable EIC $0: the 50% credit did not fully absorb the state tax (Worksheet 18A line 3 > 0 — poverty level credit path instead)");
    } else {
      l44 = max0(l22 - mdTaxSum); // 18A.1 line 4
    }
  }
  const ctc =
    ((input.mdCtcChildren as number) ?? 0) > 0
      ? rd(evalStateTax("us.md.ctc", 0n, { mdFagi: fagi, mdQualifiedChildren: (input.mdCtcChildren as number) ?? 0 }))
      : 0n;
  if (ctc > 0n) notes.push(`MD Child Tax Credit ${fmtD(ctc)} (Worksheet 21C: $500/child, −$50 per $1,000 of FAGI over $15,000 — refundable, 502CR Part CC line 8)`);
  const l45 = rd(c(input.refundableCredits)) + ctc;
  const l46 = l41 + l42 + l43 + l44 + l45;

  const l47 = max0(l40 - l46);
  const l48 = max0(l46 - l40);
  const l51 = rd(c(input.mdInterestCharges));
  const l51a = rd(c(input.mdHomebuyerPenalty));
  // Instruction 22 netting: an overpayment absorbs lines 51/51a before any
  // refund; only the excess of 51+51a over the overpayment is due
  const l50 = max0(l48 - l51 - l51a);
  const l52 = l48 > 0n ? max0(l51 + l51a - l48) : l47 + l51 + l51a;
  if (l48 > 0n && l51 + l51a > 0n) notes.push(`MD refund netting (Instruction 22): the ${fmtD(l48)} overpayment absorbs ${fmtD(min2(l48, l51 + l51a))} of interest/penalty before refunding`);

  return {
    "1_federal_agi": fmtD(l1), "6_total_additions": fmtD(l6), "7_fagi_plus_additions": fmtD(l7),
    ...(l10a !== 0n ? { "10a_pension_exclusion": fmtD(l10a) } : {}),
    ...(l11 !== 0n ? { "11_taxable_ss_rr_subtraction": fmtD(l11) } : {}),
    ...(l14 !== 0n ? { "14_two_income_subtraction": fmtD(l14) } : {}),
    "15_total_subtractions": fmtD(l15), "16_md_agi": fmtD(l16),
    ...(method === "itemized" ? { "17c_itemized_phaseout": fmtD(l17c) } : {}),
    "17_deduction": fmtD(l17), "18_net_income": fmtD(l18),
    "19_exemption_amount": fmtD(l19), "20_taxable_net_income": fmtD(l20),
    ...(l20a !== 0n ? { "20a_cg_surtax_base": fmtD(l20a) } : {}),
    "21_md_tax": fmtD(l21),
    ...(l21a !== 0n ? { "21a_recaptured_credit": fmtD(l21a) } : {}),
    ...(l21b !== 0n ? { "21b_cg_additional_tax": fmtD(l21b) } : {}),
    "22_eic": fmtD(l22), "23_poverty_level_credit": fmtD(l23),
    "24_502cr_part_aa": fmtD(l24), "26_total_credits": fmtD(l26),
    "27_md_tax_after_credits": fmtD(l27),
    "28_local_tax": fmtD(l28), "29_local_eic": fmtD(l29), "30_local_poverty_credit": fmtD(l30),
    "32_local_credits": fmtD(l32), "33_local_tax_after_credits": fmtD(l33),
    "34_total_md_and_local_tax": fmtD(l34), "40_total_tax_and_contributions": fmtD(l40),
    "41_withholding": fmtD(l41), "43_estimated_and_extension": fmtD(l43),
    "44_refundable_eic": fmtD(l44), "45_refundable_credits": fmtD(l45),
    "46_total_payments": fmtD(l46), "47_balance_due": fmtD(l47), "48_overpayment": fmtD(l48),
    "50_refund": fmtD(l50), "52_total_amount_due": fmtD(l52),
  };
}
