/** 2025 Form IL-1040 line composer (line numbers per the printed form). */
import { c, rd, max0, fmtD, type Cents } from "./money.js";
import { isJoint, type StateReturnInput, type StateTaxEvaluator } from "./types.js";

const EXEMPTION = 285000n; // $2,850 per exemption (2025)
const AGE_BLIND_BOX = 100000n; // $1,000 per 65+/blind box

export function composeIL(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Record<string, string> {
  const fagi = c(input.federalAGI);
  const fedEITC = c(input.federalEITC);
  const wh = c(input.stateWithholding);
  const est = c(input.estimatedPayments);
  const l1 = rd(fagi);
  const l4 = rd(l1 + c(input.additions));
  const l9 = max0(rd(l4 - c(input.subtractions))); // "may not be less than zero"
  const nExemptions = (input.exemptions as number) ?? 1;
  let l10 = rd(BigInt(nExemptions) * EXEMPTION + BigInt((input.ageOrBlindBoxes as number) ?? 0) * AGE_BLIND_BOX);
  // IL-1040 line 10: a taxpayer someone else can claim as a dependent gets NO
  // exemption allowance when base income exceeds the exemption amount.
  if (input.claimedAsDependent === true && l9 > EXEMPTION) {
    l10 = 0n;
    notes.push("IL exemption allowance $0: taxpayer is claimable as a dependent on another return and base income exceeds $2,850");
  }
  const l11 = max0(l9 - l10); // "may not be less than zero"
  const l12 = rd(evalStateTax("us.il.income_tax", l11));
  const l14 = l12;
  const l18 = ilNonrefundableCredits(input, l14, notes);
  const l21 = rd(c(input.useTax));
  const l23 = l14 - l18 + l21;
  const l29 = input.ilEitcOverride !== undefined ? rd(c(input.ilEitcOverride)) : rd((fedEITC * 20n) / 100n);
  const l30 = input.ilChildUnder12 ? rd((l29 * 40n) / 100n) : 0n;
  if (!input.ilChildUnder12 && l29 > 0n) notes.push("IL CTC $0: no dependent child under 12 indicated");
  const l31 = wh + est + l29 + l30;
  const l32 = max0(l31 - l23);
  const l41 = max0(l23 - l31);
  return {
    "1_federal_agi": fmtD(l1), "4_total_income": fmtD(l4), "9_base_income": fmtD(l9),
    "10_exemption_allowance": fmtD(l10), "11_net_income": fmtD(l11), "12_tax": fmtD(l12),
    "14_income_tax": fmtD(l14), "18_nonrefundable_credits": fmtD(l18),
    "21_use_tax": fmtD(l21), "23_total_tax": fmtD(l23),
    "29_il_eitc": fmtD(l29), "30_il_ctc": fmtD(l30), "31_payments_refundable": fmtD(l31),
    "32_overpayment": fmtD(l32), "38_refund": fmtD(l32), "41_amount_owed": fmtD(l41),
  };
}

/** Schedule ICR (property tax + K-12) + 1299-C educator credit, capped at tax due. */
function ilNonrefundableCredits(input: StateReturnInput, taxDue: Cents, notes: string[]): Cents {
  const propertyTax = rd((c(input.ilPropertyTaxPaid) * 5n) / 100n);
  const k12 = (() => {
    const over = max0(c(input.ilK12Expenses) - 25000n);
    const credit = rd((over * 25n) / 100n);
    return credit > 75000n ? 75000n : credit;
  })();
  const teacher = (() => {
    const t = rd(c(input.ilTeacherExpenses));
    // 1299-C cap: $500, or $1,000 MFJ when both spouses are educators
    const cap = isJoint(input) ? 100000n : 50000n;
    return t > cap ? cap : t;
  })();
  const available = propertyTax + k12 + teacher + rd(c(input.nonrefundableCredits));
  const allowed = available > taxDue ? taxDue : available;
  if (available > allowed) notes.push(`IL credits available ${fmtD(available)} capped at tax due — line 18 reports the ALLOWED amount`);
  return allowed;
}
