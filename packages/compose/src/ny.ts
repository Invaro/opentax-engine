/** 2025 New York IT-201 line composer. */
import { c, rd, max0, fmtD } from "./money.js";
import { isJoint, isHoh, type StateReturnInput, type StateTaxEvaluator } from "./types.js";
import { incompleteItems } from "./incomplete.js";

const STD_DEDUCTION_JOINT = 1605000n; // $16,050
const STD_DEDUCTION_HOH = 1120000n; // $11,200
const STD_DEDUCTION_SINGLE = 800000n; // $8,000
const DEPENDENT_EXEMPTION = 100000n; // $1,000 (line 36)
const NYAGI_WORKSHEET_THRESHOLD = 10765000n; // $107,650 (line 39)

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
  // Line 39 (IT-201-I, 2025): with line 33 at $107,650 or less, the NYS Tax
  // Table, or the rate schedule when line 38 is $65,000 or more. us.ny.income_tax
  // does exactly that by default. Above $107,650 of NYAGI the tax computation
  // worksheets apply, which are not encoded: the schedule figure stands and the
  // line is reported incomplete.
  const overRecapture = l33 > NYAGI_WORKSHEET_THRESHOLD;
  const l39 = rd(evalStateTax("us.ny.income_tax", l37, overRecapture ? { useFormulaMethod: true } : {}));
  if (overRecapture) {
    notes.push(`NY line 39: New York AGI ${fmtD(l33)} is over $107,650, so the tax computation worksheets apply; line 39 shows the rate-schedule tax without them`);
    incompleteItems(notes).push({
      code: "NOT_COMPUTED",
      form: "NY IT-201",
      line: "39",
      item: "New York State tax for New York AGI over $107,650 (tax computation worksheets)",
      reason: "the IT-201-I tax computation worksheets for New York AGI over $107,650 are not encoded",
      action: "compute line 39 with the worksheet for your filing status and income in the IT-201 instructions",
      target: "us.ny.income_tax",
      affectedLines: ["39_nys_tax", "44_nys_tax_after_credits", "62_total_tax", "77_overpaid", "78_refund"],
      rendered: "rate-schedule tax without the worksheet adjustment",
    });
  }
  const l43 = rd(c(input.nyHouseholdCredit)); // nonrefundable — line 44 floors at 0 below
  const l44 = max0(l39 - l43);
  let nycNet = 0n;
  if (input.nycTaxableIncome !== undefined && c(input.nycTaxableIncome) > 0n) {
    const nycTax = rd(evalStateTax("us.ny.nyc_income_tax", rd(c(input.nycTaxableIncome))));
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
