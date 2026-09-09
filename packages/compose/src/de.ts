/**
 * 2025 Delaware Form PIT-RES line composer (full-year resident; line numbers per
 * the printed form, "Revision 20260407"). Oracle targets: the line 24 tax (the
 * printed Tax Table below $60,000, the rate schedule at or above it), the line
 * 20a/21 standard deduction, the line 27a-27b personal credits, the line 6
 * pension exclusion, the line 11 elderly/disabled exclusion, the line 28
 * other-state credit, the line 31 child care credit, the line 29 volunteer
 * firefighter credit, and the line 34 earned income credit.
 *
 * DELAWARE'S TWO-COLUMN RETURN. Filing status 4 — "Married & Filing Combined
 * Separate on this form" — is, in the Division's own words, "in fact filing two
 * separate returns which have been combined on the same form for convenience".
 * Column A is the SPOUSE and column B the taxpayer, and each column runs the
 * whole computation independently: its own subtractions, its own $3,250
 * standard deduction, its own trip through the bracket structure, and its own
 * personal credits. Every other filing status uses column B alone. This
 * composer therefore computes a column at a time and emits A/B line pairs for
 * status 4.
 *
 * Income splitting is the caller's job: the printed "LINE 1 WORKSHEET —
 * ALLOCATION OF FEDERAL ADJUSTED GROSS INCOME BETWEEN SPOUSES" requires each
 * spouse to report their own income plus one half of income from jointly titled
 * securities, bank accounts and real estate.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);

/** one column of the return — status 4 runs two of these, every other status one */
type Column = {
  label: string;
  federalAgi: Cents;
  additions: Cents;
  usObligations: Cents;
  pensionExclusion: Cents;
  otherSubtractions: Cents;
  socialSecurity: Cents;
  tuitionAble: Cents;
  elderlyExclusion: Cents;
  deductions: Cents;
  taxableIncome: Cents;
  tax: Cents;
  personalCredits: Cents;
  otherStateCredit: Cents;
  firefighterCredit: Cents;
  childCareCredit: Cents;
  nonrefundableTotal: Cents;
  taxAfterNonrefundable: Cents;
  eitc: Cents;
  eitcRefundable: boolean;
};

export function composeDE(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Delaware Form PIT-RES composer");
  if (typeof input.federalAGI !== "number") throw new Error("federalAGI is required for the Delaware Form PIT-RES composer — federal Form 1040 line 11 is Form PIT-RES line 1");
  const mfj = fs === "mfj";
  const combinedSeparate = input.deCombinedSeparate === true;
  if (combinedSeparate && mfj) throw new Error("deCombinedSeparate (Delaware filing status 4, married filing combined separate) cannot be used with filingStatus 'mfj' — status 4 is an alternative to the joint return, so pass filingStatus 'mfs' with deCombinedSeparate: true");
  if (combinedSeparate && typeof input.deSpouseFederalAgi !== "number") {
    throw new Error("deSpouseFederalAgi is required for Delaware filing status 4 — column A is the spouse's own federal AGI. The printed Line 1 Worksheet requires each spouse to report their own income plus one half of income from jointly titled securities, bank accounts and real estate.");
  }

  const missing = new Set<string>();
  const tryEvalTo = (sink: string[]) => (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      missing.add(target);
      sink.push(`DE ${label}: ${target} has no applicable rule as of this date — line left blank; re-run once the year's forms are published`);
      return null;
    }
  };
  const tryEval = tryEvalTo(notes);

  if (combinedSeparate) {
    notes.push("DE filing status 4 (Married & Filing Combined Separate on this form): the Division treats this as \"in fact filing two separate returns which have been combined on the same form for convenience\". Column A is the spouse and column B the taxpayer; each column takes its own $3,250 standard deduction, its own trip through the brackets and its own personal credits. Income from jointly titled securities, bank accounts and real estate must be split one half to each column by the caller (the printed Line 1 Worksheet)");
    notes.push("DE filing status 3 or 4: \"both you and your spouse must compute your taxable income the same way. This means if one itemizes deductions, the other must itemize. If one takes the standard deduction, the other must take the standard deduction\" (30 Del. C. § 1109(b))");
  }
  if (mfj) notes.push("DE filing status 2 (Joint) is the ONLY status with the doubled $6,500 standard deduction — statuses 1, 3, 4 and 5 each take $3,250, and on a combined separate return EACH column takes its own $3,250");

  const itemizes = input.deItemizes === true;
  const itemized = D(input.deItemizedDeductions);
  if (itemizes) notes.push(`DE line 20b: itemizing ${fmtD(itemized)} on Form PIT-RSA. Delaware's election is INDEPENDENT of the federal one — "If you claimed a standard deduction on your federal return, you may still elect to itemize your deductions on the Delaware return" — but itemizing forfeits the line 21 additional standard deduction entirely, even at 65 or blind`);

  const buildColumn = (label: string, p: {
    federalAgi: unknown; additions: unknown; usObligations: unknown; otherSubtractions: unknown; socialSecurity: unknown;
    tuitionAble: unknown; pensionIncome: unknown; eligibleRetirementIncome: unknown; age60: boolean; militaryPension: boolean;
    deductionBoxes: unknown; exemptions: unknown; age60Persons: unknown; earnedIncome: unknown;
    qualifiesElderly: boolean; spouseQualifiesElderly: boolean; firefighters: unknown; includeSpousePension: boolean;
    itemizedDeductions: unknown; includeGenericNonrefundable: boolean;
    otherStateIncome: unknown; otherStateTaxPaid: unknown; federalChildCareCredit: unknown; federalEic: unknown;
    domiciled: boolean;
  }, sink: string[] = notes): Column => {
    const tryEval = tryEvalTo(sink);
    const l1 = D(p.federalAgi);
    const l4 = l1 + D(p.additions);
    const l5 = D(p.usObligations);
    // "Each taxpayer may receive ONLY ONE pension exclusion ... Spouses who each receive
    // pensions are entitled to one exclusion each." So the exclusion is computed PER PERSON
    // and summed, on every filing status — not once over the couple's combined pensions.
    const excl = (pension: unknown, eligible: unknown, age60: boolean, military: boolean, domiciled: boolean, who: string): Cents =>
      D(pension) > 0n || D(eligible) > 0n
        ? tryEval("us.de.pension_exclusion", 0n, {
            deAge60OrOver: age60, deMilitaryPension: military, deDomiciledForPensionExclusion: domiciled,
            dePensionIncome: D(pension), deEligibleRetirementIncome: D(eligible),
          }, `line 6 pension exclusion (${who})`) ?? 0n
        : 0n;
    const l6self = excl(p.pensionIncome, p.eligibleRetirementIncome, p.age60, p.militaryPension, p.domiciled, label);
    // on a JOINT return both spouses' pensions run through the same single column, so the
    // spouse's own exclusion is added here; on a combined separate return each column is
    // already one person and the spouse column carries its own.
    const l6spouse = p.includeSpousePension
      ? excl(input.deSpousePensionIncome, input.deSpouseEligibleRetirementIncome, input.deSpouseAge60OrOver === true, input.deSpouseMilitaryPension === true, input.deSpouseDomiciledForPensionExclusion === true, "spouse")
      : 0n;
    const l6 = l6self + l6spouse;
    const l7 = D(p.otherSubtractions);
    const l8a = D(p.socialSecurity);
    const l8b = D(p.tuitionAble);
    const l9 = l5 + l6 + l7 + l8a + l8b;
    const l10 = l4 - l9;
    const l11 = p.qualifiesElderly
      ? tryEval("us.de.elderly_disabled_exclusion", 0n, {
          deQualifiesElderlyDisabled: true, deSpouseQualifiesElderlyDisabled: p.spouseQualifiesElderly,
          deEarnedIncome: D(p.earnedIncome), deAgiBeforeExclusion: l10,
        }, `line 11 elderly/disabled exclusion (${label})`) ?? 0n
      : 0n;
    const l12 = l10 - l11;
    const l22 = itemizes
      ? D(p.itemizedDeductions)
      : tryEval("us.de.standard_deduction", 0n, { deAdditionalDeductionBoxes: Math.max(0, (p.deductionBoxes as number) ?? 0), deItemizes: false }, `line 20a standard deduction (${label})`) ?? 0n;
    const l23 = max0(l12 - l22);
    const l24 = rd(evalStateTax("us.de.income_tax", l23, { deUseRateSchedule: input.deUseRateSchedule === true }));
    const l27 = tryEval("us.de.personal_credits", 0n, {
      deExemptions: Math.max(0, (p.exemptions as number) ?? 0),
      deAge60Persons: Math.max(0, (p.age60Persons as number) ?? 0),
      isClaimedAsDependent: input.claimedAsDependent === true,
    }, `lines 27a-27b personal credits (${label})`) ?? 0n;
    const l28 = D(p.otherStateIncome) > 0n && D(p.otherStateTaxPaid) > 0n
      ? tryEval("us.de.other_state_credit", 0n, {
          deAdjustedGrossIncome: l12, deIncomeTax: l24,
          deOtherStateIncome: D(p.otherStateIncome), deOtherStateTaxPaid: D(p.otherStateTaxPaid),
        }, `line 28 other-state credit (${label})`) ?? 0n
      : 0n;
    const l29 = Math.max(0, (p.firefighters as number) ?? 0) > 0
      ? tryEval("us.de.volunteer_firefighter_credit", 0n, { deVolunteerFirefighters: Math.max(0, (p.firefighters as number) ?? 0) }, `line 29 volunteer firefighter credit (${label})`) ?? 0n
      : 0n;
    const l31 = D(p.federalChildCareCredit) > 0n
      ? tryEval("us.de.child_care_credit", 0n, { deFederalChildCareCredit: D(p.federalChildCareCredit) }, `line 31 child care credit (${label})`) ?? 0n
      : 0n;
    const earned = l27 + l28 + l29 + l31 + (p.includeGenericNonrefundable ? D(input.nonrefundableCredits) : 0n);
    const l32 = min2(earned, l24); // "The total of all non-refundable credits (Lines 27a through 31) is limited to ... Line 26"
    const l33 = max0(l24 - l32);
    const fed = D(p.federalEic);
    const l34 = fed > 0n
      ? tryEval("us.de.eitc", 0n, { deFederalEic: fed, deEitcTaxAfterCredits: l33 }, `line 34 earned income credit (${label})`) ?? 0n
      : 0n;
    // derive the branch from the SAME arithmetic the rule uses, not floating point:
    // the refundable branch is taken exactly when 4.5% of the federal credit reaches l33.
    const refundable45 = fed > 0n ? (tryEval("us.de.eitc", 0n, { deFederalEic: fed, deEitcTaxAfterCredits: 0n }, `line 34 branch probe (${label})`) ?? 0n) : 0n;
    const refundableBranch = fed > 0n && refundable45 >= l33;
    if (earned > l24) sink.push(`DE line 32 (${label}): non-refundable credits ${fmtD(earned)} exceed the ${fmtD(l24)} tax and are limited to it — "The total of all non-refundable credits (Lines 27a through 31) is limited to the amount of your Delaware tax liability"`);
    return {
      label, federalAgi: l1, additions: D(p.additions), usObligations: l5, pensionExclusion: l6, otherSubtractions: l7,
      socialSecurity: l8a, tuitionAble: l8b, elderlyExclusion: l11, deductions: l22, taxableIncome: l23, tax: l24,
      personalCredits: l27, otherStateCredit: l28, firefighterCredit: l29, childCareCredit: l31,
      nonrefundableTotal: l32, taxAfterNonrefundable: l33, eitc: l34, eitcRefundable: refundableBranch,
    };
  };

  // Line 21 boxes: two per person. Status 3 may carry the spouse's boxes (§ 1108(b)(2)/(4): the
  // spouse is 65+/blind, has NO gross income and is nobody's dependent) — the rule allows four
  // there; a status-4 column is one person and is clamped to two here.
  const boxCount = (raw: unknown): number => Math.max(0, (raw as number) ?? 0);
  const clampBoxes = (raw: unknown, who: string): number => {
    const n = boxCount(raw);
    if (combinedSeparate && n > 2) notes.push(`DE line 21 (${who}): ${n} boxes reduced to 2 — each column of a combined separate return is ONE person, and "a maximum of $5,000 per individual" is two boxes`);
    return combinedSeparate ? Math.min(2, n) : n;
  };
  if (fs === "mfs" && !combinedSeparate && boxCount(input.deAdditionalDeductionBoxes) > 2) notes.push("DE line 21 (status 3): more than two boxes are the SPOUSE's boxes under § 1108(b)(2) and (b)(4) — allowed only if that spouse is 65 or over (or blind), has NO gross income, and is not another taxpayer's dependent");

  const paramsB = {
    federalAgi: input.federalAGI, additions: input.additions, usObligations: input.deUsObligationInterest,
    otherSubtractions: input.subtractions, socialSecurity: input.taxableSocialSecurity, tuitionAble: input.deTuitionAbleContributions,
    pensionIncome: input.dePensionIncome, eligibleRetirementIncome: input.deEligibleRetirementIncome,
    age60: input.deAge60OrOver === true, militaryPension: input.deMilitaryPension === true,
    domiciled: input.deDomiciledForPensionExclusion === true,
    deductionBoxes: clampBoxes(input.deAdditionalDeductionBoxes, "Column B"), exemptions: input.deExemptions, age60Persons: input.deAge60Persons,
    earnedIncome: input.deEarnedIncome, qualifiesElderly: input.deQualifiesElderlyDisabled === true,
    spouseQualifiesElderly: input.deSpouseQualifiesElderlyDisabled === true, firefighters: input.deVolunteerFirefighters,
    includeSpousePension: !combinedSeparate, itemizedDeductions: input.deItemizedDeductions, includeGenericNonrefundable: true,
    otherStateIncome: input.deOtherStateIncome, otherStateTaxPaid: input.deOtherStateTaxPaid,
    federalChildCareCredit: input.deFederalChildCareCredit, federalEic: input.federalEITC,
  };
  const paramsA = {
    federalAgi: input.deSpouseFederalAgi, additions: input.deSpouseAdditions, usObligations: input.deSpouseUsObligationInterest,
    otherSubtractions: input.deSpouseSubtractions, socialSecurity: input.deSpouseTaxableSocialSecurity, tuitionAble: input.deSpouseTuitionAbleContributions,
    pensionIncome: input.deSpousePensionIncome, eligibleRetirementIncome: input.deSpouseEligibleRetirementIncome,
    age60: input.deSpouseAge60OrOver === true, militaryPension: input.deSpouseMilitaryPension === true,
    domiciled: input.deSpouseDomiciledForPensionExclusion === true,
    deductionBoxes: clampBoxes(input.deSpouseAdditionalDeductionBoxes, "Column A"), exemptions: input.deSpouseExemptions, age60Persons: input.deSpouseAge60Persons,
    earnedIncome: input.deSpouseEarnedIncome, qualifiesElderly: input.deSpouseQualifiesElderlyDisabled === true,
    spouseQualifiesElderly: input.deQualifiesElderlyDisabled === true, firefighters: input.deSpouseVolunteerFirefighters,
    includeSpousePension: false, itemizedDeductions: input.deSpouseItemizedDeductions, includeGenericNonrefundable: false,
    otherStateIncome: input.deSpouseOtherStateIncome, otherStateTaxPaid: input.deSpouseOtherStateTaxPaid,
    federalChildCareCredit: 0, federalEic: 0,
  };

  let colA: Column | null = null;
  let colB: Column;
  if (combinedSeparate) {
    // A joint federal return carries ONE federal EIC and ONE federal child care credit, and
    // Delaware assigns each to exactly one spouse: § 1117(b) — the earned income credit "may
    // only be used by the spouse with the greater tax otherwise due" (Schedule II line 12:
    // "enter the PIT-RES Line 33 amount from the same column with the higher taxable
    // income"); § 1114(b) — the child care credit "may only be applied against the tax imposed
    // on the spouse with the lower taxable income ... and shall not exceed such tax". The
    // columns are built once without either credit to find the taxable incomes, then built
    // for real with each credit routed. A tie goes to Column B (the taxpayer).
    const scratch: string[] = [];
    const a0 = buildColumn("Column A", paramsA, scratch);
    const b0 = buildColumn("Column B", { ...paramsB, federalChildCareCredit: 0, federalEic: 0 }, scratch);
    const eicToA = a0.taxableIncome > b0.taxableIncome;
    const childCareToA = a0.taxableIncome < b0.taxableIncome;
    colA = buildColumn("Column A", { ...paramsA, federalEic: eicToA ? input.federalEITC : 0, federalChildCareCredit: childCareToA ? input.deFederalChildCareCredit : 0 });
    colB = buildColumn("Column B", { ...paramsB, federalEic: eicToA ? 0 : input.federalEITC, federalChildCareCredit: childCareToA ? 0 : input.deFederalChildCareCredit });
    if (D(input.federalEITC) > 0n) notes.push(`DE line 34 (status 4): the earned income credit is taken ONCE, in Column ${eicToA ? "A" : "B"} — the column with the higher taxable income (${fmtD(eicToA ? a0.taxableIncome : b0.taxableIncome)} vs ${fmtD(eicToA ? b0.taxableIncome : a0.taxableIncome)}), per § 1117(b) and Schedule II line 12; there is one federal credit on the joint federal return, not one per spouse`);
    if (D(input.deFederalChildCareCredit) > 0n) notes.push(`DE line 31 (status 4): the child care credit is applied ONCE, against Column ${childCareToA ? "A" : "B"} — the spouse with the LOWER taxable income (${fmtD(childCareToA ? a0.taxableIncome : b0.taxableIncome)}), and limited to that spouse's tax, per § 1114(b)`);
  } else {
    colB = buildColumn("Column B", paramsB);
  }

  const cols = colA ? [colA, colB] : [colB];
  const sum = (pick: (col: Column) => Cents): Cents => cols.reduce((t, col) => t + pick(col), 0n);

  for (const col of cols) {
    if (col.pensionExclusion > 0n) {
      const colAge60 = col === colA ? input.deSpouseAge60OrOver === true : input.deAge60OrOver === true;
      notes.push(`DE line 6 (${col.label}): pension exclusion ${fmtD(col.pensionExclusion)} — ${colAge60 ? "the 60-or-over tier caps pension PLUS eligible retirement income at $12,500" : "under 60, so only the pension itself counts and eligible retirement income does not"}. Each taxpayer receives ONLY ONE exclusion even with several pensions; spouses who each receive a pension get one each, computed separately`);
    }
    if (col.socialSecurity > 0n) notes.push(`DE line 8a (${col.label}): ${fmtD(col.socialSecurity)} of taxable Social Security and Railroad Retirement is subtracted IN FULL — no cap, no age test, no phase-out, and independent of the line 6 pension exclusion`);
    if (col.eitc > 0n) notes.push(`DE line 34 (${col.label}): earned income credit ${fmtD(col.eitc)}, taken on the ${col.eitcRefundable ? "REFUNDABLE 4.5%" : "NON-REFUNDABLE 20%"} branch. 30 Del. C. § 1117(a)(2) gives the taxpayer the choice; DE Schedule II prescribes the comparison, and it is provably the larger of the two in every case`);
  }

  if (cols.some((col) => col.pensionExclusion > 0n)) {
    notes.push("DE line 6, 85 Del. Laws c. 426 (Senate Bill 219 with Senate Amendment 1, signed and effective August 17, 2026): for TY2026 the 60-or-over pension exclusion requires the person to have been legally domiciled in Delaware for at least three years (§ 1106(b)(3)f.4) — the corpus applies that gate to a 2026 return through deDomiciledForPensionExclusion / deSpouseDomiciledForPensionExclusion, and a 60-or-over person without the attestation gets NO exclusion. The same Act raises the MILITARY pension exclusion to $15,000 for 2027, $20,000 for 2028 and $25,000 for 2029 and after. Neither touches a TY2025 return, which was due before enactment");
  }
  const withholding = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const estimated = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  const totalTax = sum((col) => col.taxAfterNonrefundable);
  const totalEitc = sum((col) => col.eitc);
  const refundableBusiness = D(input.refundableCredits);
  const contributions = D(input.deCharitableContributions);
  // Printed line 40 "TOTAL REFUNDABLE CREDITS" = lines 35 through 39 (Instructions p. 10); the
  // line 34 earned income credit is tested on line 41 separately: "If Line 34 plus Line 40 is
  // less than or equal to Line 33 ..."
  const l40 = withholding + estimated + refundableBusiness;
  const payments = l40 + totalEitc;
  const balance = totalTax + contributions - payments;
  const due = balance > 0n;
  if (contributions > 0n) notes.push(`DE line 43: ${fmtD(contributions)} of DE Schedule III special-fund contributions INCREASE the balance due or reduce the refund — they are contributions, not credits`);

  const out: Record<string, string> = {
    "1_federal_agi": fmtD(sum((col) => col.federalAgi)),
    "4_total_additions": fmtD(sum((col) => col.federalAgi + col.additions)),
    "6_pension_exclusion": fmtD(sum((col) => col.pensionExclusion)),
    "8a_social_security_rr": fmtD(sum((col) => col.socialSecurity)),
    "11_elderly_disabled_exclusion": fmtD(sum((col) => col.elderlyExclusion)),
    "12_delaware_agi": fmtD(sum((col) => col.federalAgi + col.additions - col.usObligations - col.pensionExclusion - col.otherSubtractions - col.socialSecurity - col.tuitionAble - col.elderlyExclusion)),
    "22_total_deductions": fmtD(sum((col) => col.deductions)),
    "23_taxable_income": fmtD(sum((col) => col.taxableIncome)),
    "24_tax": fmtD(sum((col) => col.tax)),
    "27_personal_credits": fmtD(sum((col) => col.personalCredits)),
    "28_other_state_credit": fmtD(sum((col) => col.otherStateCredit)),
    "29_volunteer_firefighter_credit": fmtD(sum((col) => col.firefighterCredit)),
    "31_child_care_credit": fmtD(sum((col) => col.childCareCredit)),
    "32_total_nonrefundable_credits": fmtD(sum((col) => col.nonrefundableTotal)),
    "33_tax_after_nonrefundable_credits": fmtD(totalTax),
    "34_earned_income_credit": fmtD(totalEitc),
    "35_withholding": fmtD(withholding),
    "36_estimated_and_extension_payments": fmtD(estimated),
    "38_refundable_business_credits": fmtD(refundableBusiness),
    "40_total_refundable_credits": fmtD(l40),
    "43_contributions": fmtD(contributions),
    "balance_due": fmtD(due ? balance : 0n),
    "refund": fmtD(due ? 0n : -balance),
  };
  if (colA) {
    for (const [col, suffix] of [[colA, "A"], [colB, "B"]] as [Column, string][]) {
      out[`23_taxable_income_col${suffix}`] = fmtD(col.taxableIncome);
      out[`24_tax_col${suffix}`] = fmtD(col.tax);
      out[`22_deductions_col${suffix}`] = fmtD(col.deductions);
      out[`27_personal_credits_col${suffix}`] = fmtD(col.personalCredits);
      out[`33_tax_after_nonrefundable_col${suffix}`] = fmtD(col.taxAfterNonrefundable);
    }
    notes.push(`DE combined separate: column A taxable income ${fmtD(colA.taxableIncome)} → tax ${fmtD(colA.tax)}; column B taxable income ${fmtD(colB.taxableIncome)} → tax ${fmtD(colB.tax)}. Each column climbs the brackets on its own, which is why status 4 usually beats a joint return once both spouses have Delaware AGI over $9,400`);
  }
  if (D(input.deOtherStateIncome) > 0n && sum((col) => col.otherStateCredit) === 0n && !missing.has("us.de.other_state_credit")) {
    notes.push("DE line 28: the other-state credit computed as $0 — check that deOtherStateTaxPaid was supplied (the credit is the LESSER of the ratio-limited amount and the tax actually PAID to that state), and note that city and county taxes do not qualify");
  }
  if (input.deQualifiesElderlyDisabled === true && sum((col) => col.elderlyExclusion) === 0n && !missing.has("us.de.elderly_disabled_exclusion")) {
    notes.push("DE line 11: no elderly/disabled exclusion — all three tests are CLIFFS: at least 60 or totally and permanently disabled, earned income strictly under $2,500 ($5,000 joint), and line 10 income of $10,000 or less ($20,000 joint). On a JOINT return BOTH spouses must qualify; with only one, the booklet advises filing status 3 or 4 instead");
  }
  notes.push(due ? `DE: balance due ${fmtD(balance)}` : `DE: refund ${fmtD(-balance)}`);
  return out;
}
