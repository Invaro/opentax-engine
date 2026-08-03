/**
 * 2025 Form D-400 line composer (line numbers per the printed form, Web 7-25).
 *
 * NC is the cleanest AGI state in the corpus: FAGI + Schedule S additions −
 * Schedule S deductions − child deduction − standard/itemized deduction,
 * flat rate, one credit form. The composer runs the printed line flow,
 * auto-deducts taxable Social Security (Schedule S line 19 — NC never taxes
 * it), folds the Bailey / military-retirement / US-obligation subtractions
 * in with notes, and selects the LARGER of the NC standard deduction and NC
 * itemized deductions when the Schedule A components are supplied (NC's
 * election is independent of the federal one).
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

export function composeNC(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const fagi = rd(c(input.federalAGI));
  const l6 = fagi;
  const l7 = rd(c(input.additions));
  const l8 = l6 + l7;

  const taxableSS = rd(c(input.taxableSocialSecurity));
  if (taxableSS > 0n) notes.push("NC Schedule S line 19: taxable Social Security deducted automatically (NC never taxes it)");
  const bailey = rd(c(input.ncBaileyRetirement));
  if (bailey > 0n) notes.push("NC Schedule S line 20: Bailey settlement retirement deducted (5+ years of creditable service as of Aug 12, 1989 — attested; enclose the 1099-R)");
  const military = rd(c(input.ncMilitaryRetirement));
  if (military > 0n) notes.push("NC Schedule S line 21: military retirement deducted (20+ years of service OR Chapter 61 medical retirement — attested; never also on the Bailey line)");
  const usInterest = rd(c(input.ncUsObligationInterest));
  const l9 = rd(c(input.subtractions)) + taxableSS + bailey + military + usInterest;

  const nQc = (input.ncQualifyingChildren as number) ?? 0;
  const extra: Record<string, Cents | boolean | number> = {
    ncFederalAgi: fagi,
    qualifyingChildren: nQc,
  };
  const l10b = nQc > 0 ? rd(evalStateTax("us.nc.child_deduction", 0n, extra)) : 0n;

  const standard = rd(evalStateTax("us.nc.standard_deduction", 0n, extra));
  const wantsItemized =
    c(input.ncMortgageInterest) > 0n || c(input.ncRealEstateTaxes) > 0n ||
    c(input.ncCharitable) > 0n || c(input.ncMedicalExpenses) > 0n ||
    c(input.ncClaimOfRightRepayment) > 0n;
  let l11 = standard;
  if (wantsItemized) {
    const itemized = rd(
      evalStateTax("us.nc.itemized_deductions", 0n, {
        ...extra,
        ncMortgageInterest: c(input.ncMortgageInterest),
        ncRealEstateTaxes: c(input.ncRealEstateTaxes),
        ncCharitable: c(input.ncCharitable),
        ncMedicalExpenses: c(input.ncMedicalExpenses),
        ncClaimOfRightRepayment: c(input.ncClaimOfRightRepayment),
      }),
    );
    if (itemized > standard) {
      l11 = itemized;
      notes.push(`NC line 11: itemized deductions ${fmtD(itemized)} beat the ${fmtD(standard)} standard deduction (NC itemizing is independent of the federal election)`);
    } else {
      notes.push(`NC line 11: standard deduction ${fmtD(standard)} kept (itemized components total ${fmtD(itemized)})`);
    }
  }

  const l12a = l9 + l10b + l11;
  const l12b = l8 - l12a; // may be negative (printed negative circle)
  const l14 = l12b;
  const l15 = rd(evalStateTax("us.nc.income_tax", max0(l14)));
  const creditsRaw = rd(c(input.ncTaxCredits)) + rd(c(input.nonrefundableCredits));
  const l16 = min2(creditsRaw, l15);
  if (creditsRaw > l16) notes.push("NC line 16 capped at the line 15 tax (D-400TC credits are nonrefundable)");
  const l17 = l15 - l16;
  const l18 =
    input.ncUseTaxEstimate === true
      ? rd(evalStateTax("us.nc.use_tax", max0(l14)))
      : rd(c(input.useTax));
  if (input.ncUseTaxEstimate === true) notes.push(`NC line 18: no-receipts use tax estimate ${fmtD(l18)} from the printed table (keyed to line 14 taxable income)`);
  const l19 = l17 + l18;
  const l20 = rd(c(input.stateWithholding)) + rd(c(input.spouseStateWithholding));
  const l21 = rd(c(input.estimatedPayments)) + rd(c(input.extensionPayment)) + rd(c(input.ncPartnershipPayments)) + rd(c(input.ncScorpPayments));
  const l23 = l20 + l21;
  const l25 = l23;
  const l26a = max0(l19 - l25);
  const l26e = rd(c(input.ncUnderpaymentInterest));
  const l27 = l26a + l26e;
  const l28 = max0(l25 - l19);

  notes.push("NC part-year/nonresident Schedule PN proration is out of scope — resident return composed");

  return {
    "6_federal_agi": fmtD(l6),
    "7_additions": fmtD(l7),
    "8_agi_plus_additions": fmtD(l8),
    "9_deductions": fmtD(l9),
    "10a_qualifying_children": String(nQc),
    "10b_child_deduction": fmtD(l10b),
    "11_nc_deduction": fmtD(l11),
    "12a_total_deductions": fmtD(l12a),
    "12b_modified_income": fmtD(l12b),
    "14_nc_taxable_income": fmtD(l14),
    "15_nc_income_tax": fmtD(l15),
    "16_tax_credits": fmtD(l16),
    "17_tax_after_credits": fmtD(l17),
    "18_consumer_use_tax": fmtD(l18),
    "19_total_tax": fmtD(l19),
    "20_withholding": fmtD(l20),
    "21_other_payments": fmtD(l21),
    "23_total_payments": fmtD(l23),
    "25_net_payments": fmtD(l25),
    "26a_tax_due": fmtD(l26a),
    "26e_underpayment_interest": fmtD(l26e),
    "27_amount_due": fmtD(l27),
    "28_overpayment": fmtD(l28),
    "34_refund": fmtD(l28),
  };
}
