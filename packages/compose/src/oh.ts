/**
 * 2025 Ohio IT 1040 line composer (line numbers per the printed form,
 * barcode 25000102/25000202) with the Schedule of Business Income BID
 * arithmetic and the Schedule of Credits ordering (R.C. 5747.98: lines 2-9
 * subtract before the joint filing credit's line-11 base).
 *
 * Ohio starts from federal AGI; the composer runs the printed line flow and
 * feeds the corpus targets (bracket tax, 3% business tax, exemption amount,
 * and the six computable credits) their transcribed inputs. Taxable Social
 * Security is deducted automatically (Schedule of Adjustments line 16) —
 * Ohio never taxes it.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import { isMfs, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const BID_CAP = 25000000n; // $250,000 single/MFJ
const BID_CAP_MFS = 12500000n; // $125,000 MFS

export function composeOH(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const fagi = rd(c(input.federalAGI));
  const l1 = fagi;
  const l2a = rd(c(input.additions));

  // Schedule of Business Income: line 10 total business income → line 11
  // lesser of line 10 or IT 1040 line 1 (floor 0) → BID cap → line 13
  const bizTotal = rd(c(input.ohBusinessIncome));
  const line11 = max0(min2(bizTotal, max0(fagi)));
  const bid = min2(line11, isMfs(input) ? BID_CAP_MFS : BID_CAP);
  if (bid > 0n) notes.push(`OH Business Income Deduction ${fmtD(bid)} (Schedule of Business Income line 13; cap ${isMfs(input) ? "$125,000 MFS" : "$250,000"})`);

  const taxableSS = rd(c(input.taxableSocialSecurity));
  if (taxableSS > 0n) notes.push("OH Schedule of Adjustments line 16: taxable Social Security deducted automatically (Ohio never taxes it)");
  const l2b = rd(c(input.subtractions)) + bid + taxableSS;

  const l3 = l1 + l2a - l2b;
  const nExemptions = (input.exemptions as number) ?? 1;
  const magi = l3 + bid; // booklet p. 8: MAGI = OAGI + BID
  const ohBase: Record<string, Cents | boolean | number> = {
    ohModifiedAgi: magi,
    ohExemptionCount: nExemptions,
  };
  const l4 = rd(evalStateTax("us.oh.exemption_amount", 0n, ohBase));
  if (input.claimedAsDependent === true) {
    notes.push("OH line 4: a taxpayer claimable as a dependent on another return takes NO exemption for self — pass the exemptions count accordingly");
  }
  const l5 = max0(l3 - l4);
  const line14 = max0(line11 - bid);
  const l6 = min2(line14, l5); // Schedule of Business Income line 15
  const l7 = max0(l5 - l6);
  const l8a = rd(evalStateTax("us.oh.income_tax", l7));
  const l8b = l6 > 0n ? rd(evalStateTax("us.oh.business_income_tax", 0n, { ohTaxableBusinessIncome: l6 })) : 0n;
  const l8c = l8a + l8b;

  // ---- Schedule of Credits ------------------------------------------------
  const age65 = input.ohAge65OrOlder === true;
  const sc2 = rd(evalStateTax("us.oh.retirement_income_credit", 0n, { ...ohBase, ohEligibleRetirementIncome: c(input.ohRetirementIncome) }));
  const sc4 = rd(evalStateTax("us.oh.senior_citizen_credit", 0n, { ...ohBase, isAge65OrOlder: age65 }));
  const sc6 =
    c(input.ohFederalCdccTentative) > 0n || c(input.ohFederalCdccAllowed) > 0n
      ? rd(
          evalStateTax("us.oh.cdcc", 0n, {
            ...ohBase,
            ohFederalCdccTentative: c(input.ohFederalCdccTentative),
            ohFederalCdccAllowed: c(input.ohFederalCdccAllowed),
          }),
        )
      : 0n;
  const sc9 = rd(evalStateTax("us.oh.exemption_credit", 0n, ohBase));
  const scOtherPre = rd(c(input.ohOtherCreditsPreJfc)); // lines 3, 5, 7, 8 (transcribed)
  const sc10 = sc2 + sc4 + sc6 + sc9 + scOtherPre;
  const sc11 = max0(l8c - sc10);
  const sc12 = rd(
    evalStateTax("us.oh.joint_filing_credit", 0n, {
      ...ohBase,
      ohTaxLessCredits: sc11,
      ohBothSpousesHaveQualifyingIncome: input.ohBothSpousesQualifyingIncome === true,
    }),
  );
  if (sc12 > 0n) notes.push("OH joint filing credit claimed — include the statement listing each spouse's qualifying income (R.C. 5747.05(E))");
  const fedEITC = rd(c(input.federalEITC));
  const sc13 = input.ohEicOverride !== undefined ? rd(c(input.ohEicOverride)) : rd((fedEITC * 30n) / 100n);
  const scOtherPost = rd(c(input.nonrefundableCredits)); // lines 14-35 (transcribed)
  const sc36 = sc12 + sc13 + scOtherPost;
  const sc38 = rd(c(input.ohNonresidentCredit));
  const sc39 = rd(c(input.ohResidentCredit));
  // line 40 adds the UNCAPPED line 36 ("add lines 10, 36, 38, and 39") — the
  // printed line 37 is a memo line nothing on the schedule consumes; excess
  // nonrefundable credits die at IT 1040 line 10's zero floor instead.
  const sc40 = sc10 + sc36 + sc38 + sc39;
  if (sc36 > sc11) notes.push(`OH Schedule of Credits: line 12-35 credits ${fmtD(sc36)} exceed the line 11 remaining tax ${fmtD(sc11)} — line 40 still reports the full sum (the printed form's line 37 is informational); the excess dies at IT 1040 line 10's zero floor, never refunds`);

  const l9 = sc40;
  const l10 = max0(l8c - l9);
  const l11 = rd(c(input.ohInterestPenalty));
  const l12 = rd(c(input.useTax));
  const l13 = l10 + l11 + l12;
  const l14 = rd(c(input.stateWithholding));
  const l15 = rd(c(input.estimatedPayments)) + rd(c(input.priorYearOverpaymentCredited)) + rd(c(input.extensionPayment));
  const l16 = rd(c(input.refundableCredits));
  const l17 = l14 + l15 + l16;
  const l20 = max0(l13 - l17);
  const l23 = max0(l17 - l13);

  notes.push("OH school district income tax (SD 100) is a SEPARATE return — if the taxpayer's district levies one (tax.ohio.gov/Finder), compute and disclose it separately");
  notes.push("OH municipal income taxes are separate city levies (RITA/CCA) — never on the IT 1040");
  if (l23 > 0n && l23 <= 100n) notes.push("OH: refunds of $1.00 or less are not issued");
  if (l20 > 0n && l20 <= 100n) notes.push("OH: amounts due of $1.00 or less need not be paid");

  return {
    "1_federal_agi": fmtD(l1),
    "2a_additions": fmtD(l2a),
    "2b_deductions": fmtD(l2b),
    "3_ohio_agi": fmtD(l3),
    "4_exemption_amount": fmtD(l4),
    "5_income_tax_base": fmtD(l5),
    "6_taxable_business_income": fmtD(l6),
    "7_taxable_nonbusiness_income": fmtD(l7),
    "8a_nonbusiness_tax": fmtD(l8a),
    "8b_business_tax": fmtD(l8b),
    "8c_tax_before_credits": fmtD(l8c),
    "9_nonrefundable_credits": fmtD(l9),
    "10_tax_after_credits": fmtD(l10),
    "11_interest_penalty": fmtD(l11),
    "12_use_tax": fmtD(l12),
    "13_total_liability": fmtD(l13),
    "14_withholding": fmtD(l14),
    "15_estimated_and_extension": fmtD(l15),
    "16_refundable_credits": fmtD(l16),
    "17_total_payments": fmtD(l17),
    "20_tax_due": fmtD(l20),
    "22_total_amount_due": fmtD(l20),
    "23_overpayment": fmtD(l23),
    "26_refund": fmtD(l23),
    "credits_2_retirement": fmtD(sc2),
    "credits_4_senior": fmtD(sc4),
    "credits_6_cdcc": fmtD(sc6),
    "credits_9_exemption_credit": fmtD(sc9),
    "credits_11_tax_less_credits": fmtD(sc11),
    "credits_12_joint_filing": fmtD(sc12),
    "credits_13_eic": fmtD(sc13),
    "credits_40_total_nonrefundable": fmtD(sc40),
  };
}
