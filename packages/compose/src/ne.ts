/**
 * 2025 Nebraska Form 1040N line composer (resident; line numbers per the
 * printed form). The line 15 tax (Calculation Schedule or paper table), the
 * standard and itemized deductions, the $171 personal exemption credit, the
 * 29.6% other tax, both child/dependent care credits, the 10% EIC, the line
 * 35 federal-tax-liability cap, the Schedule II other-state credit, and the
 * use tax are oracle targets. Composed here per the printed form: the line 4
 * exemption count, the line 10 larger-of choice, Schedule I (100% Social
 * Security and military retirement, NEST caps), lines 17-35 credits, the
 * payments block (36-55), and the lines 56-63 penalty, use tax, due, and
 * refund chain. A federal QSS uses the joint column.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));

export function composeNE(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Nebraska Form 1040N composer");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const dependentFiler = input.claimedAsDependent === true;
  const spouseDependent = mfj && input.neSpouseClaimedAsDependent === true;
  const capAtFederal = dependentFiler || spouseDependent; // line 2b: "you or your spouse can be claimed by another taxpayer"
  if (capAtFederal && typeof input.neFederalStandardDeduction !== "number")
    throw new Error("neFederalStandardDeduction (Form 1040 line 12e, the federal standard deduction actually allowed) is required when you or your spouse can be claimed as another taxpayer's dependent — Nebraska line 6 is the smaller of it and the chart amount");
  const deps = (input.dependents as number) ?? 0;
  const boxes = Math.min((input.ageOrBlindBoxes as number) ?? 0, mfj || mfs ? 4 : 2);
  const table = input.neUseTaxTable === true;
  if (fs === "qss") notes.push("NE filing status: a federal qualifying surviving spouse uses the married-filing-jointly column of the Tax Table / Calculation Schedule and the $17,200 standard deduction ('A qualifying surviving spouse must also use this column')");
  if (mfs) notes.push("NE married filing separately: the single rate schedule and $8,600 deduction apply; the spouse's 65+/blind boxes count only if you can claim the spouse's exemption; neither Nebraska child/dependent care credit is allowed to a couple that filed jointly federally but separately in Nebraska");

  // ---- line 4: personal exemptions ----
  const l4 = (dependentFiler ? 0 : 1) + (mfj && !spouseDependent ? 1 : 0) + deps;
  if (deps > 0) notes.push(`NE line 4c: ${deps} dependent(s) counted — only dependents who qualify for the federal child tax credit or other dependent credit are Nebraska personal exemptions`);

  // ---- lines 5-14: Nebraska taxable income ----
  const l5 = rd(c(input.federalAGI));
  const l6 = rd(evalStateTax("us.ne.standard_deduction", 0n, { neAgeBlindBoxes: boxes, isClaimedAsDependent: capAtFederal, neFederalStandardDeduction: c(input.neFederalStandardDeduction) }));
  if (capAtFederal) notes.push(`NE line 6: when you or your spouse can be claimed as another taxpayer's dependent (line 2b), the deduction is the smaller of the federal standard deduction allowed (${fmtD(D(input.neFederalStandardDeduction))}) and the Nebraska chart amount — ${fmtD(l6)} composed`);
  const itemized = input.neFederalItemized === true;
  const l7 = itemized ? D(input.neFederalItemizedDeductions) : 0n;
  const l8 = itemized ? D(input.neSaltIncomeTaxes) : 0n;
  const l9 = itemized ? rd(evalStateTax("us.ne.itemized_deductions", 0n, { neFederalItemizedDeductions: l7, neSaltIncomeTaxes: l8 })) : 0n;
  let l10 = l6;
  let method = "standard";
  if (itemized) {
    if (l9 > l6) {
      l10 = l9;
      method = "itemized";
      notes.push(`NE line 10: Nebraska itemized deductions ${fmtD(l9)} (federal itemized ${fmtD(l7)} minus state and local income taxes ${fmtD(l8)}) beat the ${fmtD(l6)} standard deduction`);
    } else notes.push(`NE line 10: standard deduction ${fmtD(l6)} kept — Nebraska itemized deductions after removing state and local income taxes are ${fmtD(l9)}`);
  }
  const l11 = l5 - l10;
  const l12 = D(input.additions);
  if (l12 > 0n) notes.push(`NE line 12 (Schedule I Part A): adjustments increasing federal AGI ${fmtD(l12)} transcribed (non-Nebraska state/local bond interest, financial institution tax credit claimed, 529/Enable recapture, federal NOL deduction, S corp/LLC non-Nebraska loss, PTET deducted, bullion loss, food donation add-back)`);
  const ss = D(input.taxableSocialSecurity);
  const mil = D(input.neMilitaryRetirement);
  const usInt = D(input.neUsInterest);
  const refund = D(input.neStateRefund);
  const nestRaw = D(input.neNestContributions);
  const nestCap = mfs ? 500000n : 1000000n;
  const nest = min2(nestRaw, nestCap);
  if (nestRaw > nest) notes.push(`NE Schedule I line 20: NEST contributions ${fmtD(nestRaw)} capped at ${fmtD(nestCap)}`);
  const other = D(input.subtractions);
  const l13 = ss + mil + usInt + refund + nest + other;
  if (ss > 0n) notes.push(`NE Schedule I line 31: Social Security ${fmtD(ss)} excluded in full (100% since TY2024, no AGI threshold)`);
  if (mil > 0n) notes.push(`NE Schedule I line 32: military retirement ${fmtD(mil)} excluded in full (§ 77-2716(15)(b); DoD or OPM 1099-R)`);
  if (other > 0n) notes.push(`NE Schedule I other subtractions ${fmtD(other)} transcribed (Railroad Retirement, special capital gains election, employer NEST / Enable contributions, S corp/LLC non-Nebraska income, Nebraska NOL, Nebraska bond interest, CSRS annuities, National Guard pay, Relocation Incentive wage exclusion, bullion gain, …)`);
  const l14 = max0(l11 + l12 - l13);
  if (l11 + l12 - l13 < 0n) notes.push("NE line 14: deductions and adjustments exceed income — Nebraska taxable income is $0 ('If less than -0-, enter -0-')");

  // ---- lines 15-17: tax ----
  const l15 = rd(evalStateTax("us.ne.income_tax", l14, { neUseTaxTable: table }));
  notes.push(table ? "NE line 15: computed from the paper 2025 Nebraska Tax Table (row midpoints; endpoint worksheet over $77,760) — 'Only taxpayers filing paper returns may use the Nebraska Tax Table'; for TY2026 no table is published yet, so the Tax Calculation Schedule is used regardless" : "NE line 15: computed from the 2025 Tax Calculation Schedule ('Electronic filers must use the Nebraska Tax Calculation Schedule'); pass neUseTaxTable for the paper table (differs by up to $3; it prices each $100 row at its midpoint)");
  const fedOther = D(input.neFederalOtherTax);
  const l16 = fedOther > 0n ? rd(evalStateTax("us.ne.other_tax", 0n, { neFederalOtherTax: fedOther })) : 0n;
  if (l16 > 0n) notes.push(`NE line 16: other tax ${fmtD(l16)} = 29.6% of the ${fmtD(fedOther)} federal lump-sum / early-distribution tax`);
  const l17 = l15 + l16;

  // ---- lines 18-35: nonrefundable credits ----
  const l18 = rd(evalStateTax("us.ne.personal_exemption_credit", 0n, { neExemptions: l4 }));
  let l19 = 0n;
  const osAgi = D(input.neOtherStateAgi);
  const osPaid = D(input.neOtherStateTaxPaid);
  if (osAgi > 0n && osPaid > 0n) {
    l19 = rd(evalStateTax("us.ne.other_state_credit", 0n, { neTaxBeforeCredits: l17, neAgi: l5, neAdjustmentsIncreasing: l12, neAdjustmentsDecreasing: l13, neOtherStateAgi: osAgi, neOtherStateTaxPaid: osPaid }));
    notes.push(`NE line 19 (Schedule II): credit for tax paid to another state ${fmtD(l19)} — the least of the Nebraska tax ${fmtD(l17)}, that tax × ${fmtD(osAgi)} ÷ ${fmtD(l5 + l12 - l13)} (ratio to five decimals), and the ${fmtD(osPaid)} paid; attach the other state's complete return; one Schedule II per state`);
  }
  const l20 = D(input.neFederalElderlyCredit);
  if (l20 > 0n) notes.push(`NE line 20: credit for the elderly or the disabled ${fmtD(l20)} = the federal Schedule R credit (attach Schedule R)`);
  let l23 = 0n;
  const fedCdcc = D(input.neFederalChildCareCredit);
  if (fedCdcc > 0n && l5 > 2900000n) {
    l23 = rd(evalStateTax("us.ne.child_care_credit_nonrefundable", 0n, { neAgi: l5, neFederalChildCareCredit: fedCdcc }));
    notes.push(`NE line 23: child/dependent care nonrefundable credit ${fmtD(l23)} = 25% of the ${fmtD(fedCdcc)} federal credit (AGI over $29,000; attach federal Form 2441)`);
  }
  const otherNonref = D(input.nonrefundableCredits);
  if (otherNonref > 0n) notes.push(`NE lines 21-33: other nonrefundable credits ${fmtD(otherNonref)} transcribed (CDAA, Form 3800N, financial institution tax, TANF employer, blighted area, School Readiness, Child Care contributor, CHIEF, Family Caregiver, Pregnancy Help ≤ 50% of line 15)`);
  const l34 = l18 + l19 + l20 + l23 + otherNonref;
  const netAdj = l12 - l13;
  let l35: Cents;
  if (typeof input.neFederalTaxBeforeCredits === "number") {
    l35 = rd(evalStateTax("us.ne.tax_after_credits", 0n, { neTaxBeforeCredits: l17, neNonrefundableCredits: l34, neNetAdjustments: netAdj, neFederalTaxBeforeCredits: c(input.neFederalTaxBeforeCredits) }));
    if (netAdj < 500000n && l35 < max0(l17 - l34)) notes.push(`NE line 35: Nebraska tax after credits ${fmtD(max0(l17 - l34))} is limited to the ${fmtD(D(input.neFederalTaxBeforeCredits))} federal tax before credits — net Schedule I adjustments ${fmtD(netAdj)} are under $5,000 (§ 77-2715(1); check the federal tax box and attach the federal return)`);
  } else {
    l35 = max0(l17 - l34);
    if (l35 > 0n && netAdj < 500000n) notes.push("NE line 35: the § 77-2715(1) federal tax liability cap was NOT evaluated — pass neFederalTaxBeforeCredits (Form 1040 line 16 + Schedule 2 lines 2 and 8); when it is lower than the Nebraska tax after credits, line 35 is the federal amount");
  }
  if (l34 > l17) notes.push(`NE line 35: nonrefundable credits ${fmtD(l34)} exceed the tax ${fmtD(l17)} — the excess is lost ('if line 34 is more than line 17, enter -0-')`);

  // ---- lines 36-55: payments and refundable credits ----
  const l36 = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l37 = D(input.neWithholding1099);
  const l38 = D(input.neK1nWithholding);
  const l39 = D(input.nePtetCredit);
  const l40 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  let l42 = 0n;
  const expenses = c(input.neChildCareExpenses);
  if (expenses > 0n) {
    if (l5 <= 2900000n) {
      l42 = rd(
        evalStateTax("us.ne.child_care_credit_refundable", 0n, {
          neAgi: l5,
          neChildCareExpenses: expenses,
          neChildCareQualifyingPersons: (input.neChildCareQualifyingPersons as number) ?? 1,
          neEarnedIncome: c(input.neEarnedIncome),
          neSpouseEarnedIncome: c(input.neSpouseEarnedIncome),
        }),
      );
      const missingEarned = typeof input.neEarnedIncome !== "number" ? " — pass neEarnedIncome (assumed $0 → $0 credit)" : mfj && typeof input.neSpouseEarnedIncome !== "number" ? " — pass neSpouseEarnedIncome (assumed $0 → $0 credit on a joint return)" : "";
      notes.push(`NE line 42 (Form 2441N): child/dependent care refundable credit ${fmtD(l42)} — AGI ${fmtD(l5)} is $29,000 or less: expenses × the federal percentage × the state percentage (100% to $22,000, −10 points per $1,000 over); attach Form 2441N, not the federal 2441${missingEarned}`);
    } else notes.push(`NE line 42: no refundable child care credit — AGI ${fmtD(l5)} exceeds $29,000 (the 25% nonrefundable credit on line 23 applies instead; pass neFederalChildCareCredit)`);
  }
  const fedEic = D(input.federalEITC);
  const l44 = fedEic > 0n ? rd(evalStateTax("us.ne.eitc", 0n, { neFederalEic: fedEic })) : 0n;
  if (l44 > 0n) notes.push(`NE line 44: Nebraska earned income credit ${fmtD(l44)} = 10% of the ${fmtD(fedEic)} federal EIC (line 27a); a filer deducting a federal NOL carryforward must pass the booklet's Nebraska Earned Income Worksheet limits`);
  const l45 = D(input.neCommunityCollegeTaxes);
  if (l45 > 0n) notes.push(`NE line 45 (Form PTC): credit for community college property taxes ${fmtD(l45)} — 100% of the community college taxes paid in 2025 on your parcels (Form PTC line 1 = line 2a); the school district credit ended with LB 34 (relief now appears on the property tax statement)`);
  const l46 = 25000n * BigInt((input.neVolunteerResponders as number) ?? 0);
  const l47 = 200000n * BigInt((input.neStillbornChildren as number) ?? 0);
  if (l46 > 0n) notes.push(`NE line 46: qualified volunteer emergency responder credit ${fmtD(l46)} ($250 each; DOR certification for at least two years)`);
  if (l47 > 0n) notes.push(`NE line 47: stillborn child tax credit ${fmtD(l47)} ($2,000 each; attach the Birth Resulting in Stillbirth Certificate)`);
  const otherRef = D(input.refundableCredits);
  if (otherRef > 0n) notes.push(`NE lines 41, 43, 48-51: other refundable credits ${fmtD(otherRef)} transcribed (Form 3800N, beginning farmer, Child Care Tax Credit for a parent ≤ $150,000 AGI, School Readiness staff, reverse osmosis, direct support professional $500)`);
  const l52 = D(input.neAmendedPaid);
  const l53 = l36 + l37 + l38 + l39 + l40 + l42 + l44 + l45 + l46 + l47 + otherRef + l52;
  const l54 = D(input.neAmendedOverpayment);
  const l55 = l53 - l54;

  // ---- lines 56-63 ----
  const l56 = D(input.neUnderpaymentPenalty);
  const l57 = l35 + l56;
  const purchases = D(input.neUseTaxPurchases);
  const localBps = Math.round(((input.neLocalUseTaxRate as number) ?? 0) * 100);
  const l58 = purchases > 0n ? rd(evalStateTax("us.ne.use_tax", 0n, { neUseTaxPurchases: purchases, neLocalUseTaxRateBps: localBps })) : 0n;
  if (l58 > 0n) notes.push(`NE line 58: use tax ${fmtD(l58)} on ${fmtD(purchases)} of untaxed purchases (5.5% state${localBps > 0 ? ` + ${(localBps / 100).toFixed(2)}% local` : ""}, each rounded); purchases in more than one local jurisdiction go on Form 3`);
  const l59 = max0(l57 + l58 - l55);
  const l60 = max0(l55 - l57 - l58);
  const l61 = min2(D(input.neCreditForward), l60);
  const l62 = min2(D(input.neWildlifeDonation), l60 - l61);
  const l63 = l60 - l61 - l62;
  if (l59 > 0n && l59 < 200n) notes.push("NE line 59: 'A balance due of less than $2 need not be paid'");
  if (l63 > 0n && l63 < 200n) notes.push("NE line 63: 'Amounts less than $2 will not be refunded'");
  if (l59 > 0n && l56 === 0n) notes.push(`NE line 56: balance due ${fmtD(l59)} — check Form 2210N for an underpayment-of-estimated-tax penalty; unpaid tax bears 8% interest from the due date`);

  notes.push("NE scope: Form 1040N is composed for a full-year RESIDENT — partial-year residents and nonresidents compute on Schedule III (income ratio), not composed; the high school district code, Schedule I transcribed lines, Forms 3800N/PTC/2210N, and certificated credits are inputs; Nebraska has no local income taxes");

  const put = (k: string, v: Cents, always = false): Record<string, string> => (always || v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    "4_personal_exemptions": String(l4),
    "5_federal_agi": fmtD(l5),
    "6_standard_deduction": fmtD(l6),
    ...put("7_federal_itemized", l7),
    ...put("8_state_local_income_taxes", l8),
    ...put("9_nebraska_itemized", l9),
    "10_nebraska_deductions": fmtD(l10),
    _deduction_method: method,
    "11_income_before_adjustments": fmtD(l11),
    ...put("12_adjustments_increasing", l12),
    ...put("13_adjustments_decreasing", l13),
    ...put("I31_social_security", ss),
    ...put("I32_military_retirement", mil),
    ...put("I20_nest_contributions", nest),
    "14_taxable_income": fmtD(l14),
    "15_income_tax": fmtD(l15),
    _tax_method: table ? "tax table" : "tax calculation schedule",
    ...put("16_other_tax", l16),
    "17_total_tax": fmtD(l17),
    "18_personal_exemption_credit": fmtD(l18),
    ...put("19_other_state_credit", l19),
    ...put("20_elderly_disabled_credit", l20),
    ...put("23_child_care_nonrefundable", l23),
    ...put("21_33_other_nonrefundable", otherNonref),
    "34_total_nonrefundable_credits": fmtD(l34),
    "35_tax_after_nonrefundable_credits": fmtD(l35),
    ...put("36_withholding_w2", l36),
    ...put("37_withholding_1099", l37),
    ...put("38_k1n_withholding", l38),
    ...put("39_ptet_credit", l39),
    ...put("40_estimated_payments", l40),
    ...put("42_child_care_refundable", l42),
    ...put("44_earned_income_credit", l44),
    ...put("45_community_college_property_tax_credit", l45),
    ...put("46_volunteer_responder_credit", l46),
    ...put("47_stillborn_child_credit", l47),
    ...put("41_43_48_51_other_refundable", otherRef),
    ...put("52_amended_paid", l52),
    "53_total_payments_credits": fmtD(l53),
    ...put("54_amended_overpayment", l54),
    "55_actual_tax_paid": fmtD(l55),
    ...put("56_underpayment_penalty", l56),
    "57_tax_and_penalty": fmtD(l57),
    ...put("58_use_tax", l58),
    "59_amount_due": fmtD(l59),
    "60_overpayment": fmtD(l60),
    ...put("61_credit_forward", l61),
    ...put("62_wildlife_donation", l62),
    "63_refund": fmtD(l63),
  };
}
