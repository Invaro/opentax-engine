/**
 * 2025 South Carolina SC1040 line composer (line numbers per the printed
 * 3-page form). The base is FEDERAL TAXABLE INCOME (line 1, floored at $0
 * with a negative amount preserved on subtraction line r) — NOT federal AGI.
 * The SC1040TT tax, dependent exemption ($4,930), retirement/age-65
 * deductions, Two Wage Earner Credit, and CDCC are oracle targets; the 44%
 * LTCG deduction, military-retirement interplay, 125% EITC, consumer
 * protection cap, and the line 24-34 refund/due netting are composed here
 * per the printed form and instructions.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const SUBSISTENCE_PER_DAY = 1600n; // $16/day (police/fire/EMS)
const CONSUMER_PROTECTION_INDIVIDUAL = 30000n; // $300
const CONSUMER_PROTECTION_JOINT_OR_DEPS = 100000n; // $1,000

export function composeSC(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const mfs = isMfs(input);

  if (typeof input.scFederalTaxableIncome !== "number") {
    throw new Error(
      "scFederalTaxableIncome is required for SC returns — the SC1040 starts from FEDERAL TAXABLE INCOME (Form 1040 line 15), not federal AGI; run compute_return first and pass line 15 verbatim (a negative amount is allowed and handled via line r)",
    );
  }
  const fti = c(input.scFederalTaxableIncome);

  // ---- line 1: federal taxable income, floored (negative preserved on line r) ----
  const l1 = max0(rd(fti));
  const negFti = max0(-rd(fti));
  const l2 = rd(c(input.scAdditions));
  if (l2 > 0n) notes.push(`SC line 2 additions ${fmtD(l2)} (lines a-e: state tax addback for federal itemizers, out-of-state losses, non-SC municipal interest — transcribed)`);
  const l3 = l1 + l2;

  // ---- line 4 subtractions (f-w) ----
  // line i: 44% of net LT capital gain (SC nets LT gains against ALL capital
  // losses — including short-term — before applying 44%)
  const netLtcg = max0(rd(c(input.scNetLtcgAfterLosses)));
  const lineI = netLtcg > 0n ? rd((netLtcg * 44n + 50n) / 100n) : 0n;
  if (lineI > 0n) notes.push(`SC line i: 44% net long-term capital gain deduction ${fmtD(lineI)} (net of ALL capital losses first, incl. short-term, per the printed example)`);

  // line o: taxable Social Security / Railroad Retirement — SC never taxes SS
  const lineO = rd(c(input.taxableSocialSecurity));
  if (lineO > 0n) notes.push(`SC line o: Social Security/Railroad Retirement subtraction ${fmtD(lineO)} (100% of the federally taxed amount — automatic)`);

  // lines p/q per person: retirement deduction (capped $3,000/$10,000),
  // military retirement 100%, and the age-65 $15,000 deduction reduced by both
  const person = (retirement: Cents, military: Cents, is65: boolean, label: string): { p: Cents; mil: Cents; q: Cents } => {
    const mil = max0(rd(military));
    // the printed p-1/p-2 worksheet reduces the CAP by the military deduction
    const p =
      retirement > 0n
        ? rd(
            evalStateTax("us.sc.retirement_deduction", 0n, {
              scQualifiedRetirementIncome: retirement,
              scMilitaryRetirementDeduction: mil,
              scIs65: is65,
            }),
          )
        : 0n;
    if (mil > 0n) notes.push(`SC ${label} military retirement deduction ${fmtD(mil)} (100% since TY2022; the printed worksheet reduces the same person's retirement-deduction CAP and age-65 deduction by it)`);
    const q = is65 ? rd(evalStateTax("us.sc.age65_deduction", 0n, { scRetirementDeductionsClaimed: p + mil })) : 0n;
    return { p, mil, q };
  };
  const you = person(rd(c(input.scRetirementIncomeYou)), rd(c(input.scMilitaryRetirementYou)), input.scIs65You === true, "taxpayer");
  const spouse = joint
    ? person(rd(c(input.scRetirementIncomeSpouse)), rd(c(input.scMilitaryRetirementSpouse)), input.scIs65Spouse === true, "spouse")
    : { p: 0n, mil: 0n, q: 0n };
  const lineP = you.p + you.mil + spouse.p + spouse.mil;
  const lineQ = you.q + spouse.q;
  if (you.p + spouse.p > 0n) notes.push(`SC line p retirement deduction ${fmtD(you.p + spouse.p)} (per person: qualified retirement income capped $3,000 under 65 / $10,000 at 65+)`);
  if (lineQ > 0n) notes.push(`SC line q age-65 deduction ${fmtD(lineQ)} ($15,000 per 65+ person, REDUCED by that person's retirement + military retirement deductions; usable against any SC income)`);

  if (negFti > 0n) notes.push(`SC line r: negative federal taxable income ${fmtD(negFti)} entered as a subtraction (line 1 floors at $0; the loss is preserved here)`);

  const days = BigInt((input.scSubsistenceDays as number) ?? 0);
  const lineS = days * SUBSISTENCE_PER_DAY;
  if (lineS > 0n) notes.push(`SC line s: subsistence allowance ${fmtD(lineS)} (${days} days × $16 — federal/state/local police, full-time fire, EMS)`);

  const under6 = (input.scDependentsUnder6 as number) ?? 0;
  const lineT = under6 > 0 ? rd(evalStateTax("us.sc.dependent_exemption", 0n, { scDependents: under6 })) : 0n;
  if (lineT > 0n) notes.push(`SC line t: dependents under 6 deduction ${fmtD(lineT)} (${under6} × $4,930 — the SAME indexed amount as line w, claimed AGAIN for each child under 6 on December 31)`);

  const cpRaw = rd(c(input.scConsumerProtection));
  const deps = (input.scDependents as number) ?? (input.dependents as number) ?? 0;
  const cpCap = joint || deps > 0 ? CONSUMER_PROTECTION_JOINT_OR_DEPS : CONSUMER_PROTECTION_INDIVIDUAL;
  const lineU = min2(cpRaw, cpCap);
  if (cpRaw > lineU) notes.push(`SC line u: consumer protection services capped at ${fmtD(lineU)} ($300 individual / $1,000 joint-or-with-dependents)`);

  const lineW = deps > 0 ? rd(evalStateTax("us.sc.dependent_exemption", 0n, { scDependents: deps })) : 0n;
  if (lineW > 0n) notes.push(`SC line w: dependent exemption ${fmtD(lineW)} (${deps} × $4,930, 2025 indexed; must match the federal dependent count)`);

  const otherSubs = rd(c(input.scSubtractionsOther));
  if (otherSubs > 0n) notes.push(`SC other subtractions ${fmtD(otherSubs)} (lines f/g/h/j/k/l/m/n/v: state refund, disability retirement, out-of-state income, volunteer deductions, Future Scholar 529, active trade or business, US interest, Guard/Reserve pay — transcribed)`);

  const l4 = lineI + lineO + lineP + lineQ + negFti + lineS + lineT + lineU + lineW + otherSubs;
  const l5 = max0(l3 - l4); // SOUTH CAROLINA INCOME SUBJECT TO TAX
  const l6 = rd(evalStateTax("us.sc.income_tax", l5));

  const l7 = rd(c(input.scLumpSumTax));
  if (l7 > 0n) notes.push("SC line 7: tax on lump-sum distribution (SC4972 — agent-computed, form attached)");
  const l8 = rd(c(input.scActiveTradeTax));
  if (l8 > 0n) notes.push("SC line 8: tax on active trade or business income (I-335 flat 3% election — agent-computed; the electing income must be excluded from line 5 via subtraction line l)");
  const l9 = rd(c(input.scCatastropheTax));
  const l10 = l6 + l7 + l8 + l9;

  // ---- nonrefundable credits 11-14 ----
  let l11 = 0n;
  const careExpenses = rd(c(input.scCareExpenses));
  if (careExpenses > 0n) {
    if (mfs) {
      notes.push("SC line 11 Child and Dependent Care Credit $0: denied to married filing separately");
    } else {
      l11 = rd(evalStateTax("us.sc.cdcc", 0n, { scCareExpenses: careExpenses, scCareChildren: (input.scCareChildren as number) ?? 1 }));
      notes.push(`SC line 11: Child and Dependent Care Credit ${fmtD(l11)} (7% of the federal Form 2441 EXPENSES, max $210 one child / $420 two or more)`);
    }
  }
  let l12 = 0n;
  const lowerEarned = rd(c(input.scLowerQualifiedEarnedIncome));
  if (lowerEarned > 0n) {
    if (!joint) {
      notes.push("SC line 12 Two Wage Earner Credit $0: married-filing-jointly only");
    } else {
      l12 = rd(evalStateTax("us.sc.two_wage_earner_credit", 0n, { scLowerQualifiedEarnedIncome: lowerEarned }));
      notes.push(`SC line 12: Two Wage Earner Credit ${fmtD(l12)} (0.7% of the lesser spouse's SC qualified earned income, capped $50,000 — max $350)`);
    }
  }
  const fedEitc = rd(c(input.federalEITC));
  let scEitc = 0n;
  if (fedEitc > 0n) {
    scEitc = rd((fedEitc * 125n + 50n) / 100n);
    notes.push(`SC EITC ${fmtD(scEitc)} in line 13 (125% of the federal EIC, NONREFUNDABLE, full-year residents, via SC1040TC/TC-60 — § 12-6-3632, fully phased since 2023)`);
  }
  const l13 = scEitc + rd(c(input.nonrefundableCredits));
  const l14 = l11 + l12 + l13;
  const l15 = max0(l10 - l14);
  if (l14 > l10) notes.push(`SC nonrefundable credits ${fmtD(l14)} exceed the line 10 tax ${fmtD(l10)} — line 15 floors at $0 (no carryforward, no refund of the excess)`);

  // ---- payments and refundable credits 16-23 ----
  const l16 = rd(c(input.stateWithholding));
  const l17 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  const l18 = rd(c(input.extensionPayment));
  const l19 = rd(c(input.scI290Payments));
  const l20 = rd(c(input.scOtherWithholding));
  const l21 = rd(c(input.scTuitionCredit));
  if (l21 > 0n) notes.push("SC line 21: refundable tuition tax credit (I-319: 50% of qualifying SC-institution tuition within the form's limits — agent-computed, form attached)");
  const l22 = rd(c(input.refundableCredits));
  if (l22 > 0n) notes.push("SC line 22 refundable credits (22a-d: anhydrous ammonia I-333, milk I-334, classroom teacher I-360, parental refundable I-361 — transcribed, forms attached)");
  const l23 = l16 + l17 + l18 + l19 + l20 + l21 + l22;

  // ---- lines 24-34: refund / balance due netting per the printed form ----
  const l24 = max0(l23 - l15);
  const l25 = max0(l15 - l23);
  const l26 = rd(c(input.useTax));
  if (l26 > 0n) notes.push(`SC line 26: use tax ${fmtD(l26)} (county sales-tax rate on untaxed online/out-of-state purchases — transcribed)`);
  const l27 = rd(c(input.scAppliedToNextYear));
  const l28 = rd(c(input.scContributions));
  const l29 = l26 + l27 + l28;
  const l30 = l29 > l24 ? 0n : l24 - l29; // NET REFUND
  const l31 = l25 + max0(l29 - l24); // tax due (a line-29 shortfall flows here)
  if (l24 > 0n && l29 > l24) notes.push(`SC lines 26-28 (${fmtD(l29)}) exceed the line 24 overpayment (${fmtD(l24)}) — the shortfall becomes line 31 tax due`);
  const l32 = rd(c(input.scLatePenalties));
  const l33 = rd(c(input.scUnderpaymentPenalty));
  const l34 = l31 + l32 + l33;

  notes.push("SC OBBBA nonconformity (TY2025): South Carolina conforms to the IRC only through December 31, 2024 (the 2026 conformity bill failed) — federal OBBBA deductions taken in federal taxable income (tips, overtime premium, the $6,000 senior deduction, car-loan interest, OBBBA business items) MUST be added back in scAdditions (SC1040 line e); verify the federal return for these before composing");
  notes.push("SC filing note: the SCDOR granted ALL taxpayers an automatic extension to October 15, 2026 for 2025 returns (no form required) — FILING only; 90% of the liability was due April 15, 2026. TY2026 is restructured by H.4216 (federal-AGI base, phase-out Income Adjusted Deduction, 1.99%/5.21% rates, EITC capped $200)");

  return {
    "1_federal_taxable_income": fmtD(l1),
    ...(l2 !== 0n ? { "2_additions": fmtD(l2) } : {}),
    "3_subtotal": fmtD(l3),
    ...(lineI !== 0n ? { "i_ltcg_44pct": fmtD(lineI) } : {}),
    ...(lineO !== 0n ? { "o_social_security": fmtD(lineO) } : {}),
    ...(lineP !== 0n ? { "p_retirement_military": fmtD(lineP) } : {}),
    ...(lineQ !== 0n ? { "q_age65": fmtD(lineQ) } : {}),
    ...(negFti !== 0n ? { "r_negative_fti": fmtD(negFti) } : {}),
    ...(lineS !== 0n ? { "s_subsistence": fmtD(lineS) } : {}),
    ...(lineT !== 0n ? { "t_under6": fmtD(lineT) } : {}),
    ...(lineU !== 0n ? { "u_consumer_protection": fmtD(lineU) } : {}),
    ...(lineW !== 0n ? { "w_dependent_exemption": fmtD(lineW) } : {}),
    "4_total_subtractions": fmtD(l4),
    "5_sc_income_subject_to_tax": fmtD(l5),
    "6_tax": fmtD(l6),
    ...(l7 + l8 + l9 !== 0n ? { "7to9_other_taxes": fmtD(l7 + l8 + l9) } : {}),
    "10_total_tax": fmtD(l10),
    ...(l11 !== 0n ? { "11_cdcc": fmtD(l11) } : {}),
    ...(l12 !== 0n ? { "12_two_wage_earner": fmtD(l12) } : {}),
    ...(l13 !== 0n ? { "13_other_nonrefundable": fmtD(l13) } : {}),
    "14_total_credits": fmtD(l14),
    "15_tax_after_credits": fmtD(l15),
    "16_withholding": fmtD(l16),
    ...(l21 !== 0n ? { "21_tuition_credit": fmtD(l21) } : {}),
    "23_total_payments": fmtD(l23),
    "24_overpayment": fmtD(l24), "25_amount_due": fmtD(l25),
    ...(l26 !== 0n ? { "26_use_tax": fmtD(l26) } : {}),
    ...(l29 !== 0n ? { "29_use_tax_credit_contributions": fmtD(l29) } : {}),
    "30_net_refund": fmtD(l30),
    ...(l32 + l33 !== 0n ? { "32_33_penalties": fmtD(l32 + l33) } : {}),
    "34_balance_due": fmtD(l34),
  };
}
