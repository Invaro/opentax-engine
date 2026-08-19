/**
 * 2025 Minnesota Form M1 line composer (line numbers per the printed form).
 * The schedule/table tax, standard deduction (with the 3%/10%/80% limitation
 * and dependent worksheet), dependent exemptions, simplified Social Security
 * subtraction, and the 1% NIIT are oracle targets; the greater-of alternative
 * SS method, the larger-of deduction election, and the M1C/M1REF credit
 * buckets are composed here per the printed instructions.
 */
import { c, rd, max0, fmtD, type Cents } from "./money.js";
import { isJoint, isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

export function composeMN(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const joint = isJoint(input);
  const mfs = isMfs(input);
  const fagi = c(input.federalAGI);

  const l1 = rd(fagi);
  const l2 = rd(c(input.mnAdditions));
  if (l2 > 0n) notes.push(`MN line 2 additions ${fmtD(l2)} (M1M/M1MB; Minnesota's IRC is frozen at May 1, 2023 — 2025 OBBBA items convert on Schedule M1NC)`);
  const l3 = l1 + l2;

  // ---- line 4: standard (oracle: base + boxes + dependent + limitation) or itemized ----
  const boxes = (input.mnStdBoxes as number) ?? 0;
  const std = rd(
    evalStateTax("us.mn.standard_deduction", 0n, {
      mnAgi: fagi,
      mnStdBoxes: boxes,
      isClaimedAsDependent: input.claimedAsDependent === true,
      mnDependentEarnedIncome: c(input.mnDependentEarnedIncome),
    }),
  );
  let l4 = std;
  let method = "standard";
  const itemized = rd(c(input.mnItemized));
  if (mfs && input.mnMfsSpouseItemizes === true) {
    l4 = itemized;
    method = "itemized";
    notes.push("MN MFS: the standard deduction is barred because the other spouse itemizes — Schedule M1SA itemized deductions used");
  } else if (itemized > std) {
    l4 = itemized;
    method = "itemized";
    notes.push(`MN itemized deductions ${fmtD(itemized)} (Schedule M1SA, after its own 3%/10%/80% limitation) beat the standard deduction ${fmtD(std)}`);
  } else if (fagi > 23895000n && method === "standard") {
    notes.push(`MN standard deduction ${fmtD(std)} reflects the Worksheet A/B limitation (AGI over $238,950: reduced by the lesser of 3%/10% of the excess or 80%)`);
  }

  // ---- line 5: dependent exemptions (oracle) ----
  const deps = (input.mnDependents as number) ?? 0;
  const l5 =
    deps > 0
      ? rd(
          evalStateTax("us.mn.exemptions", 0n, {
            mnDependents: deps,
            mnAgi: fagi,
            isClaimedAsDependent: input.claimedAsDependent === true,
          }),
        )
      : 0n;
  if (deps > 0 && l5 < BigInt(deps) * 520000n) notes.push(`MN exemptions phased: ${deps} × $5,200 reduced to ${fmtD(l5)} (2% per $2,500 ceil-step of AGI over the threshold)`);

  const l6 = rd(c(input.mnStateRefund));

  // ---- line 7: subtractions incl. the greater-of Social Security methods ----
  const taxableSs = rd(c(input.taxableSocialSecurity));
  let ssSub = 0n;
  if (taxableSs > 0n) {
    const simplified = rd(evalStateTax("us.mn.social_security_subtraction", 0n, { mnAgi: fagi, mnTaxableSs: taxableSs }));
    const alternative = rd(c(input.mnSsAlternativeMethod));
    const rrOffset = rd(c(input.mnRrTier1Offset));
    const simplifiedNet = max0(simplified - rrOffset);
    const alternativeNet = alternative; // agent-computed alternative is already net per the worksheet
    if (rrOffset > 0n) notes.push(`MN SS subtraction reduced by ${fmtD(rrOffset)} of Tier 1 Railroad Retirement benefits already subtracted on M1M line 17 (worksheet steps 25-29 — no double subtraction)`);
    ssSub = alternativeNet > simplifiedNet ? alternativeNet : simplifiedNet;
    notes.push(
      ssSub === alternative && alternative > 0n
        ? `MN Social Security subtraction ${fmtD(ssSub)} — the M1M ALTERNATIVE method beat the simplified method`
        : `MN Social Security subtraction ${fmtD(ssSub)} (simplified method: full below the AGI threshold, then 10% steps per $4,000 of excess${alternative === 0n && fagi > (joint ? 10832000n : mfs ? 5416000n : 8449000n) ? "; compute the M1M alternative method too and pass mnSsAlternativeMethod if greater" : ""})`,
    );
  }
  const l7 = rd(c(input.mnSubtractions)) + ssSub;
  const l8 = l4 + l5 + l6 + l7;
  const l9 = max0(l3 - l8); // taxable income ("leave blank" if <= 0)
  const l10 = rd(evalStateTax("us.mn.income_tax", l9));
  const l11 = rd(c(input.mnAmt));
  if (l11 > 0n) notes.push(`MN alternative minimum tax ${fmtD(l11)} (Schedule M1MT, 6.75% — agent-computed)`);
  const l12 = l10 + l11;
  const l13 = l12; // full-year resident (M1NR not composed)

  // ---- line 14: other taxes ----
  const niit =
    c(input.mnNetInvestmentIncome) > 0n
      ? rd(evalStateTax("us.mn.niit", 0n, { mnNetInvestmentIncome: c(input.mnNetInvestmentIncome) }))
      : 0n;
  if (niit > 0n) notes.push(`MN net investment income tax ${fmtD(niit)} (Schedule NIIT: 1% over $1,000,000, TY2024+; attach federal Form 8960 and check M1 box 14a(d))`);
  const l14a = rd(c(input.mnOtherTaxes14a)) + niit;
  const l14b = rd(c(input.mnAdvanceCtcRepayment));
  if (l14b > 0n) notes.push(`MN line 14b: repayment of advance Child Tax Credit ${fmtD(l14b)} (2025 reconciliation of the advance-payment election)`);
  const l15 = l13 + l14a + l14b;

  const l16 = rd(c(input.nonrefundableCredits)); // Schedule M1C (marriage credit, LTC, other-state, student loan…)
  const l17 = max0(l15 - l16);
  const l18 = rd(c(input.mnWildlifeContribution));
  const l19 = l17 + l18;

  const l20 = rd(c(input.stateWithholding)); // Schedule M1W
  const l21 = rd(c(input.estimatedPayments)) + rd(c(input.extensionPayment)) + rd(c(input.priorYearOverpaymentCredited));
  const l22 = rd(c(input.refundableCredits)); // Schedule M1REF (CWFC, renter's credit, M1CD, M1ED, M1PSC…)
  if (l22 > 0n) notes.push("MN line 22 refundable credits (Schedule M1REF): Child and Working Family Credits (M1CWFC/M1DQC), the Renter's Credit (M1RENT — household income under $77,570, max $2,720, CRP attached), dependent care (M1CD), K-12 education (M1ED), stillborn-child credit — agent-computed per the schedules with disclosure");
  const l23 = l20 + l21 + l22;

  // line 24 is NET of the M15 penalty ("subtract the amount, if any, on
  // line 27"); a penalty exceeding the overpayment becomes an amount owed
  const l27 = rd(c(input.mnUnderpaymentPenalty));
  const l28 = rd(c(input.mnPenaltyInterest));
  const net = l23 - l19 - l27;
  const l24 = max0(net);
  const l30 = rd(c(input.mnAppliedToNextYear));
  const l29 = max0(l24 - l30); // lines 29 + 30 must equal line 24
  const owe = max0(-net) + l28;

  return {
    "1_federal_agi": fmtD(l1),
    ...(l2 !== 0n ? { "2_additions": fmtD(l2) } : {}),
    "4_deduction": fmtD(l4), "_deduction_method": method,
    "5_exemptions": fmtD(l5),
    ...(l6 !== 0n ? { "6_state_refund_subtraction": fmtD(l6) } : {}),
    "7_subtractions": fmtD(l7), "8_total_subtractions": fmtD(l8),
    "9_taxable_income": fmtD(l9), "10_tax": fmtD(l10),
    ...(l11 !== 0n ? { "11_amt": fmtD(l11) } : {}),
    ...(l14a !== 0n ? { "14a_other_taxes": fmtD(l14a) } : {}),
    ...(l14b !== 0n ? { "14b_advance_ctc_repayment": fmtD(l14b) } : {}),
    "15_tax_before_credits": fmtD(l15), "16_nonrefundable_credits": fmtD(l16),
    "17_tax_after_credits": fmtD(l17), "19_total_tax": fmtD(l19),
    "20_withholding": fmtD(l20), "22_refundable_credits": fmtD(l22),
    "23_total_payments": fmtD(l23), "24_overpaid": fmtD(l24),
    ...(l27 !== 0n ? { "27_m15_penalty": fmtD(l27) } : {}),
    "26_amount_owed": fmtD(owe), "29_refund": fmtD(l29),
  };
}
