/**
 * 2025 Missouri Form MO-1040 line composer (line numbers per the printed
 * form). Missouri is a TWO-COLUMN state: married-filing-combined returns
 * split every income item between spouses (Y/S) and the tax chart runs per
 * spouse. The chart tax, federal tax deduction, public pension exemption,
 * BID, and WFTC are oracle targets; the Part 3 Section B/C worksheets, the
 * whole-percent line 7 income split, and the WFTC tax cap are computed here
 * per the printed worksheets.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, isHohOrQss, isHoh, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const STD_SINGLE_MFS = 1575000n; // $15,750 (federal 2025 amounts)
const STD_COMBINED_QW = 3150000n; // $31,500
const STD_HOH = 2362500n; // $23,625
const ADDL_STD_SINGLE_HOH = 200000n; // $2,000 per 65+/blind condition
const ADDL_STD_OTHER = 160000n; // $1,600
const HOH_QW_EXEMPTION = 140000n; // $1,400 (line 15)
const PRIVATE_PENSION_CAP = 600000n; // $6,000 per spouse (MO-A Part 3 Section B)

export function composeMO(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const mfs = isMfs(input);
  const fagi = c(input.federalAGI);

  // ---- lines 1-6: per-spouse income split ----
  let l1Y = input.moFagiYou !== undefined ? rd(c(input.moFagiYou)) : rd(fagi);
  let l1S = rd(c(input.moFagiSpouse));
  if (joint && input.moFagiSpouse === undefined) notes.push("MO combined return with no spouse split supplied — all income placed in the Yourself column (valid for a one-income couple; Missouri law otherwise requires splitting FAGI between spouses)");
  if (l1Y + l1S !== rd(fagi)) notes.push(`MO line 1 split (${fmtD(l1Y)} + ${fmtD(l1S)}) does not equal federal AGI ${fmtD(rd(fagi))} — verify the spouse allocation worksheet`);
  // 12 CSR 10-2.710 (instructions p.6): a negative FAGI enters as $0 — the
  // negative spouse zeroes and the other spouse takes the NETTED joint FAGI;
  // a negative combined FAGI zeroes both columns
  if (l1Y < 0n || l1S < 0n) {
    const combined = l1Y + l1S;
    if (combined <= 0n) {
      l1Y = 0n; l1S = 0n;
      notes.push("MO negative-FAGI zeroing (12 CSR 10-2.710): combined federal AGI is negative — both line 1 columns enter $0");
    } else if (l1Y < 0n) {
      l1Y = 0n; l1S = combined;
      notes.push(`MO negative-FAGI zeroing (12 CSR 10-2.710): the primary's negative FAGI enters $0 and the spouse enters the netted joint FAGI ${fmtD(combined)}`);
    } else {
      l1S = 0n; l1Y = combined;
      notes.push(`MO negative-FAGI zeroing (12 CSR 10-2.710): the spouse's negative FAGI enters $0 and the primary enters the netted joint FAGI ${fmtD(combined)}`);
    }
  }

  const l2Y = rd(c(input.moAdditionsYou));
  const l2S = rd(c(input.moAdditionsSpouse));
  const l3Y = l1Y + l2Y;
  const l3S = l1S + l2S;

  // capital gain subtraction (H.B. 594, 100%, floor $0 per the instructions)
  const cg = (v: unknown): Cents => {
    const x = rd(c(v));
    return x > 0n ? x : 0n;
  };
  const cgY = cg(input.moCapitalGainYou);
  const cgS = cg(input.moCapitalGainSpouse);
  if (cgY + cgS > 0n) notes.push(`MO capital gain subtraction ${fmtD(cgY + cgS)} (MO-A line 18, H.B. 594: 100% of federally reported capital gains, TY2025+; a negative federal amount enters as $0 but still reduced FAGI)`);
  const bid = (v: unknown): Cents =>
    c(v) > 0n ? rd(evalStateTax("us.mo.business_income_deduction", 0n, { moBusinessIncome: c(v) })) : 0n;
  const bidY = bid(input.moBusinessIncomeYou);
  const bidS = bid(input.moBusinessIncomeSpouse);
  if (bidY + bidS > 0n) notes.push(`MO business income deduction ${fmtD(bidY + bidS)} (MO-A line 17, § 143.022: 20% per spouse)`);

  const l4Y = rd(c(input.moSubtractionsYou)) + cgY + bidY;
  const l4S = rd(c(input.moSubtractionsSpouse)) + cgS + bidS;
  const l5Y = l3Y - l4Y;
  const l5S = l3S - l4S;
  const l6 = l5Y + l5S;

  // ---- line 7: whole-percent income split (printed rounding convention) ----
  let pctY = 100n;
  if (joint && (l5S !== 0n || l5Y < 0n)) {
    if (l5Y <= 0n && l5S > 0n) pctY = 0n;
    else if (l5S <= 0n) pctY = 100n;
    else pctY = (l5Y * 100n + l6 / 2n) / l6; // round to nearest whole percent
  }
  const pctS = 100n - pctY;
  if (joint && pctS > 0n) notes.push(`MO line 7 income percentages: ${pctY}% / ${pctS}% (rounded to whole percents per the instructions; deductions allocate by these ratios)`);

  // ---- line 8: MO-A Part 3 (pension + SS/SSD) ----
  const ssExY = rd(c(input.moSsExemptYou));
  const ssExS = rd(c(input.moSsExemptSpouse));
  const secC = ssExY + ssExS;
  if (secC > 0n) notes.push(`MO-A Section C SS/SSD exemption ${fmtD(secC)} (100% of taxable Social Security; requires the 62-and-older box or SSD — attested by the caller)`);
  const secA = (p: unknown, ssEx: Cents): Cents =>
    c(p) > 0n
      ? rd(evalStateTax("us.mo.public_pension_exemption", 0n, { moPublicPension: c(p), moSsSameSpouseExemption: ssEx }))
      : 0n;
  const secAY = secA(input.moPublicPensionYou, ssExY);
  const secAS = secA(input.moPublicPensionSpouse, ssExS);
  if (secAY + secAS > 0n) notes.push(`MO-A Section A public pension exemption ${fmtD(secAY + secAS)} (min(pension, $47,633) per spouse, less that spouse's Section C exemption)`);
  const privateLimit = joint ? 3200000n : mfs ? 1600000n : 2500000n;
  const privRaw = min2(rd(c(input.moPrivatePensionYou)), PRIVATE_PENSION_CAP) + min2(rd(c(input.moPrivatePensionSpouse)), PRIVATE_PENSION_CAP);
  let secB = 0n;
  if (privRaw > 0n) {
    const excess = max0(l6 - rd(c(input.taxableSocialSecurity)) - privateLimit);
    secB = max0(privRaw - excess);
    notes.push(`MO-A Section B private pension exemption ${fmtD(secB)} ($6,000/spouse cap, reduced by the excess of MO AGI less taxable SS over ${fmtD(privateLimit)})`);
  }
  const l8 = secAY + secAS + secB + secC;

  // ---- lines 9-13: federal tax deduction ----
  const l11 = rd(c(input.moFederalTax9)) + rd(c(input.moOtherFederalTax10));
  const l13 = l11 > 0n ? rd(evalStateTax("us.mo.federal_tax_deduction", 0n, { moFederalTaxTotal: l11, moMagi: l6 })) : 0n;
  if (l13 > 0n) notes.push(`MO federal income tax deduction ${fmtD(l13)} (line 11 ${fmtD(l11)} × the line 12 percentage by combined MO AGI, capped $${joint ? "10,000" : "5,000"})`);

  // ---- line 14: standard or itemized ----
  const boxes = BigInt((input.ageOrBlindBoxes as number) ?? 0);
  const addlPer = isHoh(input) || (!joint && !mfs && !isHohOrQss(input)) ? ADDL_STD_SINGLE_HOH : ADDL_STD_OTHER;
  let std = (joint || (isHohOrQss(input) && !isHoh(input)) ? STD_COMBINED_QW : isHoh(input) ? STD_HOH : STD_SINGLE_MFS) + boxes * addlPer;
  if (input.claimedAsDependent === true) {
    if (input.moStandardDeductionOverride !== undefined) {
      std = rd(c(input.moStandardDeductionOverride));
      notes.push("MO dependent-claimed filer: standard deduction taken from moStandardDeductionOverride (the federal dependent limit — greater of $1,350 or earned income + $450, up to $15,750)");
    } else {
      notes.push("MO dependent-claimed filer: pass moStandardDeductionOverride with the federal dependent standard deduction — the full amount was used absent it");
    }
  }
  let l14 = std;
  let method = "standard";
  if (input.moItemizing === true) {
    const itemized = max0(rd(c(input.moFederalItemized)) + rd(c(input.moPayrollTaxAddback)) - rd(c(input.moNetStateIncomeTaxes)));
    if (input.moRequiredToItemize === true || itemized > std) {
      l14 = itemized;
      method = "itemized";
      notes.push(`MO itemized deductions ${fmtD(itemized)} (MO-A Part 2: federal itemized + FICA/RR/Medicare/SE payroll taxes − net state income taxes${input.moRequiredToItemize === true ? "; itemizing required per the federal return" : ""})`);
    } else {
      notes.push(`MO deduction: standard ${fmtD(std)} beats itemized ${fmtD(itemized)} — Missouri allows whichever is higher unless federal itemizing was required`);
    }
  }

  const l15 = isHohOrQss(input) && !joint ? HOH_QW_EXEMPTION : 0n;
  if (l15 > 0n) notes.push("MO line 15: $1,400 additional exemption (head of household / qualifying widow(er))");
  const l16 = rd(c(input.moLtcDeduction));
  const l17 = rd(c(input.moHcsmDeduction));
  const l18 = rd(c(input.moActiveDutyMilitary));
  const l19 = rd(c(input.moInactiveDutyMilitary));
  const l2124 = rd(c(input.moOtherDeductions));
  const l25 = l8 + l13 + l14 + l15 + l16 + l17 + l18 + l19 + l2124;
  const l26 = l6 - l25;

  // ---- lines 27-36: per-spouse taxable income and chart tax ----
  const alloc = (pct: bigint): Cents => rd((l26 * pct + 50n) / 100n);
  const l27Y = pctY === 100n ? rd(l26) : alloc(pctY);
  const l27S = pctS === 0n ? 0n : pctS === 100n ? rd(l26) : alloc(pctS);
  const l28Y = rd(c(input.moEnterpriseZoneYou));
  const l28S = rd(c(input.moEnterpriseZoneSpouse));
  const l29Y = max0(l27Y - l28Y);
  const l29S = max0(l27S - l28S);
  const l30Y = rd(evalStateTax("us.mo.income_tax", l29Y));
  const l30S = l29S > 0n ? rd(evalStateTax("us.mo.income_tax", l29S)) : 0n;
  const l31Y = min2(rd(c(input.moResidentCreditYou)), l30Y);
  const l31S = min2(rd(c(input.moResidentCreditSpouse)), l30S);
  if (l31Y + l31S > 0n) notes.push(`MO resident credit ${fmtD(l31Y + l31S)} (Form MO-CR taxes paid to other states — agent-computed, capped at each spouse's line 30)`);
  const l33Y = l30Y - l31Y; // line 32 Missouri income percentage = 100% (resident; MO-NRI not composed)
  const l33S = l30S - l31S;
  const l34Y = rd(c(input.moOtherTaxesYou));
  const l34S = rd(c(input.moOtherTaxesSpouse));
  if (l34Y + l34S > 0n) notes.push("MO line 34 other taxes (Form 4972 lump sum × 10% / Form 4970 trusts — agent-computed, form attached)");
  const l35Y = l33Y + l34Y;
  const l35S = l33S + l34S;
  const l36 = l35Y + l35S;

  // ---- lines 37-45: payments and credits ----
  const l37 = rd(c(input.stateWithholding));
  const l38 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited));
  const l3940 = rd(c(input.moNrPayments));
  const l41 = rd(c(input.extensionPayment));
  const l42 = rd(c(input.nonrefundableCredits)); // Form MO-TC miscellaneous credits
  const l43 = rd(c(input.moPropertyTaxCredit)); // Form MO-PTS (refundable circuit breaker)
  const fedEIC = rd(c(input.federalEITC));
  let l44 = 0n;
  if (fedEIC > 0n) {
    if (mfs || input.claimedAsDependent === true) {
      notes.push("MO Working Family Tax Credit $0: married-filing-separately and dependent-claimed filers are denied (Form MO-WFTC question 2)");
    } else if (input.moWftcInvestmentOver4400 === true) {
      notes.push("MO Working Family Tax Credit $0: investment income over $4,400 (MO-WFTC question 3 — the credit follows EIC law FROZEN as of January 1, 2021 per the instructions, so the indexed pre-ARPA investment limit applies, computed the pre-2021 way including tax-exempt interest; the current federal $11,950 limit does NOT carry over)");
    } else {
      const raw = rd(evalStateTax("us.mo.wftc", 0n, { moFederalEic: fedEIC }));
      l44 = min2(raw, max0(l36 - l42 - l43));
      if (raw > l44) notes.push(`MO WFTC ${fmtD(raw)} (20% of the federal EIC) capped at ${fmtD(l44)} — nonrefundable against line 36 tax less lines 42/43 (no carryforward)`);
      else notes.push(`MO Working Family Tax Credit ${fmtD(l44)} (20% of the federal EIC for 2025 — the § 143.177 trigger raised it from 10%)`);
    }
  }
  const l45 = l37 + l38 + l3940 + l41 + l42 + l43 + l44;

  // ---- refund / amount due ----
  const l49 = max0(l45 - l36);
  const l50 = rd(c(input.moAppliedToNextYear));
  const l51 = rd(c(input.moTrustFundDonations));
  const l52 = rd(c(input.mo529Deposit));
  const l53 = max0(l49 - l50 - l51 - l52);
  const l54 = max0(l36 - l45);
  const l55 = rd(c(input.moUnderpaymentPenalty));
  const l56 = l54 + l55;

  return {
    "1Y_fagi": fmtD(l1Y), ...(joint ? { "1S_fagi": fmtD(l1S) } : {}),
    "5Y_mo_agi": fmtD(l5Y), ...(joint ? { "5S_mo_agi": fmtD(l5S) } : {}),
    "6_total_mo_agi": fmtD(l6),
    ...(joint ? { "7Y_income_pct": `${pctY}%`, "7S_income_pct": `${pctS}%` } : {}),
    "8_pension_ss_exemption": fmtD(l8),
    "11_total_federal_tax": fmtD(l11), "13_federal_tax_deduction": fmtD(l13),
    "14_deduction": fmtD(l14),
    ...(l15 !== 0n ? { "15_hoh_qw_exemption": fmtD(l15) } : {}),
    "25_total_deductions": fmtD(l25), "26_subtotal": fmtD(l26),
    "29Y_taxable_income": fmtD(l29Y), ...(joint ? { "29S_taxable_income": fmtD(l29S) } : {}),
    "30Y_tax": fmtD(l30Y), ...(joint ? { "30S_tax": fmtD(l30S) } : {}),
    "36_total_tax": fmtD(l36),
    "37_withholding": fmtD(l37), "42_mo_tc_credits": fmtD(l42), "43_property_tax_credit": fmtD(l43),
    "44_wftc": fmtD(l44), "45_total_payments": fmtD(l45),
    "49_overpayment": fmtD(l49), "53_refund": fmtD(l53),
    "54_underpayment": fmtD(l54), "56_amount_due": fmtD(l56),
    "_deduction_method": method,
  };
}
