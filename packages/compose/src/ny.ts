/** 2025 New York IT-201 line composer. */
import { c, rd, max0, fmtD } from "./money.js";
import { isJoint, isHoh, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const STD_DEDUCTION_JOINT = 1605000n; // $16,050
const STD_DEDUCTION_HOH = 1120000n; // $11,200
const STD_DEDUCTION_SINGLE = 800000n; // $8,000
const DEPENDENT_EXEMPTION = 100000n; // $1,000 (line 36)

export function composeNY(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  // IT-201 (2025 printed order): 72 = NYS withholding ONLY (W-2 box 17), 73 =
  // NYC, 74 = Yonkers, 75 = estimated tax payments AND IT-370 extension amount
  // (one combined line); refundable credits sit in the 63-71 block → line 76.
  const l1 = rd(c(input.wages));
  const l19 = rd(c(input.federalAGI));
  const l24 = rd(l19 + c(input.additions));
  // Line 27: taxable social security is ALWAYS subtracted — applied
  // automatically from taxableSocialSecurity.
  const ssSub = rd(c(input.taxableSocialSecurity));
  if (ssSub > 0n) notes.push(`NY subtraction: federally taxable social security ${fmtD(ssSub)} (IT-201 line 27)`);
  const l32 = rd(c(input.subtractions)) + ssSub;
  const l33 = l24 - l32;
  const l34 = isJoint(input) ? STD_DEDUCTION_JOINT : isHoh(input) ? STD_DEDUCTION_HOH : STD_DEDUCTION_SINGLE;
  const l37 = max0(l33 - l34 - BigInt((input.dependents as number) ?? 0) * DEPENDENT_EXEMPTION);
  // NYS/NYC tax via the raw rate schedule at the exact income (useFormulaMethod):
  // the IT-201 instructions require schedule-based computation above $65,000,
  // and the printed $50-bracket table below that is itself generated from the
  // schedule at bracket midpoints (so the two can differ by $1). Evaluating
  // the schedule directly keeps the computation deterministic across the full
  // income range.
  const l39 = rd(evalStateTax("us.ny.income_tax", l37, { useFormulaMethod: true }));
  const l43 = rd(c(input.nyHouseholdCredit)); // nonrefundable — line 44 floors at 0 below
  const l44 = max0(l39 - l43);
  let nycNet = 0n;
  if (input.nycTaxableIncome !== undefined && c(input.nycTaxableIncome) > 0n) {
    const nycTax = rd(evalStateTax("us.ny.nyc_income_tax", rd(c(input.nycTaxableIncome)), { useFormulaMethod: true }));
    nycNet = max0(nycTax - rd(c(input.nycHouseholdCredit)));
  }
  // Line 55: Yonkers resident income tax surcharge (us.ny.yonkers_surcharge,
  // 16.75% of the netted worksheet base) — NOT line 54 (MCTMT, out of scope).
  const yonkers = rd(c(input.yonkersSurcharge));
  const l62 = l44 + nycNet + yonkers + c(input.useTax);
  const l72 = c(input.stateWithholding);
  const l73 = c(input.cityWithholding);
  const l74 = c(input.yonkersWithholding);
  const l75 = c(input.estimatedPayments) + rd(c(input.extensionPayment));
  const l76 = l72 + l73 + l74 + l75 + rd(c(input.refundableCredits));
  const l77 = max0(l76 - l62);
  const owed = max0(l62 - l76);
  if (owed > 0n) notes.push(`balance due ${fmtD(owed)} (IT-201 line 80)`);
  return {
    "1_wages": fmtD(l1), "19_federal_agi": fmtD(l19), "24_fagi_plus_additions": fmtD(l24),
    "32_subtractions": fmtD(l32), "33_ny_agi": fmtD(l33), "34_deduction": fmtD(l34),
    "37_taxable_income": fmtD(l37), "39_nys_tax": fmtD(l39), "43_nonrefundable_credits": fmtD(l43),
    "44_nys_tax_after_credits": fmtD(l44),
    ...(yonkers !== 0n ? { "55_yonkers_surcharge": fmtD(yonkers) } : {}),
    "62_total_tax": fmtD(l62), "72_nys_withholding": fmtD(l72),
    "73_nyc_withholding": fmtD(l73), "74_yonkers_withholding": fmtD(l74), "75_estimated_payments": fmtD(l75),
    "76_total_payments": fmtD(l76), "77_overpaid": fmtD(l77), "78_refund": fmtD(l77),
  };
}
