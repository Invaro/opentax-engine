/**
 * Virginia Form 760 worksheets, as pure functions:
 *  - the age deduction (Va. Code § 58.1-322.03(2), AFAGI-reduced)
 *  - Virginia Schedule A with the overall (Pease) limitation
 *  - the Spouse Tax Adjustment worksheet (line 17)
 *  - the line-23 credit selection (CLI vs the TY2025 20% refundable EITC)
 */
import { rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateTaxEvaluator } from "./types.js";

export const VA_STD_DEDUCTION_JOINT = 1750000n; // $17,500 (TY2025-26)
export const VA_STD_DEDUCTION_OTHER = 875000n; // $8,750 — VA has no HOH column
export const VA_PERSONAL_EXEMPTION = 93000n; // $930
export const VA_AGE_BLIND_EXEMPTION = 80000n; // $800 per 65+/blind box
const AGE_DEDUCTION_EACH = 1200000n; // $12,000
const STA_CAP = 25900n; // $259

/**
 * Age deduction: $12,000 per qualifying filer; unconditional for births
 * on/before 1/1/1939, otherwise reduced dollar-for-dollar by AFAGI over the
 * threshold — AFAGI EXCLUDES federally taxable social security.
 */
export function vaAgeDeduction(
  args: { fullCount: number; testedCount: number; fagi: Cents; taxableSS: Cents; joint: boolean },
  notes: string[],
): Cents {
  const full = BigInt(args.fullCount) * AGE_DEDUCTION_EACH;
  const testedMax = BigInt(args.testedCount) * AGE_DEDUCTION_EACH;
  const afagi = args.fagi - args.taxableSS;
  const threshold = args.joint ? 7500000n : 5000000n;
  const reduction = max0(afagi - threshold);
  const deduction = rd(full + max0(testedMax - reduction));
  if (deduction > 0n || args.testedCount > 0) {
    notes.push(`VA age deduction ${fmtD(deduction)} (AFAGI ${fmtD(afagi)} = FAGI minus taxable social security; reduction ${fmtD(min2(reduction, testedMax))} against ${fmtD(testedMax)} income-tested)`);
  }
  return deduction;
}

export type VaScheduleAInput = {
  fagi: Cents;
  medical: Cents;
  incomeTaxes: Cents;
  salesTaxes: Cents;
  realEstateTaxes: Cents;
  personalPropertyTaxes: Cents;
  otherTaxes: Cents;
  mortgageInterest: Cents;
  investmentInterest: Cents;
  charitable: Cents;
  casualty: Cents;
  gambling: Cents;
  other: Cents;
  joint: boolean;
  mfs: boolean;
  hoh: boolean;
};

/** Virginia Schedule A → the Form 760 line 10 itemized deduction. */
export function vaScheduleA(a: VaScheduleAInput, notes: string[]): Cents {
  const med = max0(a.medical - rd((a.fagi * 10n) / 100n)); // 10% floor (VA deconforms from 7.5%)
  const vaSaltCap = a.mfs ? 2000000n : 4000000n; // TY2025 VA SALT cap (TB 26-1)
  const salesElected = a.salesTaxes > 0n;
  const line5a = salesElected ? min2(a.salesTaxes, vaSaltCap) : a.incomeTaxes;
  const taxes = line5a + a.realEstateTaxes + a.personalPropertyTaxes + a.otherTaxes;
  const protectedDed = med + a.investmentInterest + a.casualty + a.gambling;
  const total = med + taxes + a.mortgageInterest + a.investmentInterest + a.charitable + a.casualty + a.gambling + a.other;
  // Virginia overall limitation (Pease), Limited Itemized Deduction Worksheet
  const peaseThreshold = a.joint ? 39920000n : a.mfs ? 19960000n : a.hoh ? 36595000n : 33270000n;
  let limited = total;
  if (a.fagi > peaseThreshold && total > protectedDed) {
    const threePct = rd(((a.fagi - peaseThreshold) * 3n) / 100n);
    const eightyPct = rd(((total - protectedDed) * 80n) / 100n);
    const reduction = min2(threePct, eightyPct);
    limited = total - reduction;
    notes.push(`VA overall itemized limitation: ${fmtD(total)} reduced by ${fmtD(reduction)} (lesser of 3% of FAGI over ${fmtD(peaseThreshold)} or 80% of non-protected deductions) = ${fmtD(limited)}`);
  }
  // line 18 reduction for state/local INCOME taxes claimed (0 under the sales election)
  let line18Reduction = 0n;
  if (!salesElected && line5a > 0n) {
    const capped5a = min2(line5a, vaSaltCap);
    if (limited < total) {
      // Part B proration when the overall limitation applied (approximation, disclosed)
      line18Reduction = rd((capped5a * limited) / total);
      notes.push("VA Sch A line 18 (income-tax reduction) prorated per the Limited Itemized Deduction Worksheet Part B — verify against the printed worksheet if this return is limited");
    } else {
      line18Reduction = capped5a;
    }
  }
  return max0(limited - line18Reduction);
}

export type VaStaInput = {
  yourVagi: Cents;
  spouseVagi: Cents;
  yourAgeBlindBoxes: number;
  spouseAgeBlindBoxes: number;
  taxableIncome: Cents; // Form 760 line 15, floored at 0
  jointTax: Cents; // Form 760 line 16
};

/** Spouse Tax Adjustment worksheet (Form 760 line 17, MFJ only, ≤ $259). */
export function vaSpouseTaxAdjustment(
  w: VaStaInput,
  evalStateTax: StateTaxEvaluator,
  notes: string[],
): Cents {
  const exFor = (boxes: number): Cents => BigInt(boxes) * VA_AGE_BLIND_EXEMPTION + VA_PERSONAL_EXEMPTION;
  const you3 = w.yourVagi - exFor(w.yourAgeBlindBoxes);
  const sp3 = w.spouseVagi - exFor(w.spouseAgeBlindBoxes);
  if (you3 <= 0n || sp3 <= 0n) {
    notes.push("STA $0: one spouse's income net of personal exemptions is zero or less (worksheet Part 1 line 3 stop)");
    return 0n;
  }
  const line4 = w.taxableIncome;
  const line5 = min2(you3, sp3);
  if (line5 > 1700000n && line4 > 3400000n) {
    notes.push("STA = $259 (worksheet line 5 shortcut: smaller income > $17,000 and taxable income > $34,000)");
    return STA_CAP;
  }
  const line6 = max0(line4 - line5);
  const line7 = line4 / 2n;
  const t8 = rd(evalStateTax("us.va.income_tax", min2(line5, line7)));
  const t9 = rd(evalStateTax("us.va.income_tax", line6 > line7 ? line6 : line7));
  const sta = w.jointTax - (t8 + t9);
  const capped = sta < 0n ? 0n : sta > STA_CAP ? STA_CAP : sta;
  notes.push(`STA worksheet: joint tax ${fmtD(w.jointTax)} − split taxes ${fmtD(t8)}+${fmtD(t9)} = ${fmtD(capped)} (cap $259)`);
  return capped;
}

export type VaCredit23Input = {
  fedEITC: Cents;
  netTax: Cents; // Form 760 line 18
  vagi: Cents;
  familyVagi: Cents | undefined;
  exemptions: number;
  barred: boolean; // age deduction or any 65+/blind exemption claimed
};

/**
 * Form 760 line 23 selection (Schedule ADJ lines 10-17): refundable 20%
 * Virginia EITC vs the nonrefundable Credit for Low-Income Individuals,
 * subject to the 2025 age/blind mutual-exclusion rule.
 */
export function vaLine23Credit(a: VaCredit23Input, notes: string[]): Cents {
  if (a.barred) {
    if (a.fedEITC > 0n) notes.push("VA line 23 credit $0: the age deduction / 65+ or blind exemptions claimed on this return bar the Credit for Low-Income Individuals and Virginia EITC (2025 Form 760 instructions)");
    return 0n;
  }
  if (a.fedEITC <= 0n && a.familyVagi === undefined) return 0n;
  const refundable = rd((a.fedEITC * 20n) / 100n);
  const familyVagi = a.familyVagi ?? a.vagi;
  const povertyLine = 1565000n + BigInt(Math.max(0, a.exemptions - 1)) * 550000n;
  const cli = familyVagi <= povertyLine ? BigInt(a.exemptions) * 30000n : 0n;
  const cliUsable = min2(cli, a.netTax);
  if (refundable >= cliUsable) {
    if (refundable > 0n) notes.push(`VA line 23 = refundable Virginia EITC ${fmtD(refundable)} (20% of federal EIC ${fmtD(a.fedEITC)}, TY2025 — refundable, not capped at tax)`);
    return refundable;
  }
  notes.push(`VA line 23 = Credit for Low-Income Individuals ${fmtD(cliUsable)} (nonrefundable, capped at net tax)`);
  return cliUsable;
}
