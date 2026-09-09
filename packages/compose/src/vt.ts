/**
 * 2025 Vermont Form IN-111 line composer (full-year resident; line numbers per
 * the printed form, Rev. 10/25, lines 1-32). Oracle targets: the line 8 tax
 * (Tax Table below $75,000, rate schedule at or above it, the 3%-of-AGI
 * minimum), the line 4 standard deduction, the line 5e exemption, the Schedule
 * IN-112 capital gains, retirement, military and student-loan subtractions, the
 * line 13 charitable credit, the Schedule IN-119 24% adjustments, the Schedule
 * IN-117 other-state credit, the VHEIP credit, the four Schedule IN-112 Part II
 * refundable credits, the line 21 child care contribution and the line 22 use tax.
 *
 * Vermont starts from FEDERAL AGI (line 1), modifies it on Schedule IN-112 (line
 * 2), and subtracts its own standard deduction and personal exemptions — there is
 * no Vermont itemized deduction. Line 15 (Schedule IN-113) is 100% for a
 * full-year resident; part-year and nonresident returns are out of scope.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);

export function composeVT(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Vermont Form IN-111 composer");
  const mfj = fs === "mfj";
  const qss = fs === "qss";
  const l1 = D(input.federalAGI);

  const tryEval = (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      notes.push(`VT ${label}: ${target} has no applicable rule as of this date — line left blank; re-run once the year's forms publish`);
      return null;
    }
  };
  const agiFacts = { vtFederalAgi: l1 };

  if (qss) notes.push("VT filing status Qualifying Widow(er): takes the joint $15,300 standard deduction and the joint rate column (Schedule Y-1; the Tax Table footnote), but NO spouse exemption on line 5b (\"Do not enter '1' if your filing status is Qualifying Widow(er)\"), the single-filer retirement thresholds ($55,000 / $65,000), and the $120,000 student loan limit. Note: 32 V.S.A. § 5811(21)(C)(i) grants an exemption for 'the deceased spouse' of a surviving spouse — the printed form instruction forbids it and governs the filed return");

  // ---- Schedule IN-112 Part I: modifications (line 2) ----
  const m3 = D(input.vtNonVermontBondInterest);
  const m4 = D(input.vtBonusDepreciationAddback) + D(input.additions);
  const m6 = m3 + m4;
  const m7 = D(input.vtUsObligationInterest);
  const m8 = D(input.vtNetAdjustedCapitalGain) > 0n || D(input.vtEligibleLongTermGain) > 0n
    ? tryEval("us.vt.capital_gains_exclusion", 0n, {
        vtNetAdjustedCapitalGain: D(input.vtNetAdjustedCapitalGain), vtEligibleLongTermGain: D(input.vtEligibleLongTermGain),
        vtFederalTaxableIncome: D(input.vtFederalTaxableIncome),
      }, "Schedule IN-112 line 8 (IN-153 capital gains exclusion)") ?? 0n
    : 0n;
  if (m8 > 0n) notes.push(`VT Schedule IN-112 line 8 (Schedule IN-153 line 21): capital gains exclusion ${fmtD(m8)} — the greater of the $5,000 flat exclusion and 40% of eligible gain on assets held over three years (up to $350,000), limited to 40% of federal taxable income (${fmtD(D(input.vtFederalTaxableIncome))}). Qualified dividends, a primary or nonprimary residence, depreciable personal property and publicly traded securities never qualify for the 40% method`);
  if ((D(input.vtNetAdjustedCapitalGain) > 0n || D(input.vtEligibleLongTermGain) > 0n) && input.vtFederalTaxableIncome === undefined) notes.push("VT Schedule IN-153 line 20: vtFederalTaxableIncome was not supplied, so the 40%-of-federal-taxable-income cap is $0 and the exclusion is $0 — pass federal Form 1040 line 15");
  const m9 = D(input.vtPriorYearBonusDepreciation);
  const m10 = D(input.vtTaxableStateRefunds);
  const m14 = D(input.vtRailroadRetirement);
  const m15 = D(input.vtExemptBondInterest);
  const election = (input.vtRetirementElection as string | undefined) ?? "none";
  const ssTaxable = D(input.taxableSocialSecurity);
  const m12 = election !== "none"
    ? tryEval("us.vt.retirement_income_exclusion", 0n, {
        ...agiFacts, vtRetirementElection: election, vtTaxableSocialSecurity: ssTaxable, vtContributorySystemIncome: D(input.vtContributorySystemIncome),
      }, "Schedule IN-112 line 12 (retirement income exclusion)") ?? 0n
    : 0n;
  if (election === "none" && (ssTaxable > 0n || D(input.vtContributorySystemIncome) > 0n)) notes.push("VT Schedule IN-112 line 12: no retirement income exclusion — 32 V.S.A. § 5830e(e)(1) requires the filer to ELECT one of the Social Security exclusion and the $10,000 Civil Service / contributory-system exclusion; pass vtRetirementElection ('social_security' or 'contributory_system')");
  if (election !== "none") notes.push(m12 > 0n
    ? `VT Schedule IN-112 line 12: ${election === "social_security" ? "Social Security" : "Civil Service / contributory retirement system"} exclusion ${fmtD(m12)} — in full at federal AGI up to ${mfj ? "$70,000" : "$55,000"}, proportional to ${mfj ? "$80,000" : "$65,000"} (the worksheet rounds the ratio to two decimals), nothing beyond. Only ONE of the two may be elected`
    : `VT Schedule IN-112 line 12: the ${election === "social_security" ? "Social Security" : "contributory-system"} election produces $0 — federal AGI ${fmtD(l1)} is at or above the ${mfj ? "$80,000" : "$65,000"} ceiling, or the elected income is $0`);
  const m13 = D(input.vtMilitaryRetirementIncome) > 0n
    ? tryEval("us.vt.military_retirement_exclusion", 0n, { ...agiFacts, vtMilitaryRetirementIncome: D(input.vtMilitaryRetirementIncome) }, "Schedule IN-112 line 13 (military retirement exclusion)") ?? 0n
    : 0n;
  if (D(input.vtMilitaryRetirementIncome) > 0n) notes.push(m13 > 0n
    ? `VT Schedule IN-112 line 13: military retirement and survivor benefit exclusion ${fmtD(m13)} (2025 Act 71) — in full at federal AGI up to $125,000, phased out to $175,000 for every filing status, and claimable IN ADDITION to the line 12 election`
    : `VT Schedule IN-112 line 13: no military retirement exclusion — federal AGI ${fmtD(l1)} is at or above $175,000`);
  const m16 = D(input.vtStudentLoanInterestPaid) > 0n
    ? tryEval("us.vt.student_loan_interest_subtraction", 0n, { ...agiFacts, vtStudentLoanInterestPaid: D(input.vtStudentLoanInterestPaid), vtStudentLoanInterestDeductedFederally: D(input.vtStudentLoanInterestDeductedFederally) }, "Schedule IN-112 line 16c (student loan interest)") ?? 0n
    : 0n;
  if (D(input.vtStudentLoanInterestPaid) > 0n && m16 === 0n) notes.push(`VT Schedule IN-112 line 16c: no student loan interest subtraction — either it was all deducted federally, or federal AGI ${fmtD(l1)} exceeds the ${mfj ? "$200,000 joint" : "$120,000"} limit (§ 5811(29)(B))`);
  const m18base = m7 + m8 + m9 + m10 + m12 + m13 + m14 + m15 + m16 + D(input.subtractions);

  // ---- lines 3-7: the medical deduction needs line 6, so lines 4-6 come first ----
  const boxes = Math.max(0, (input.ageOrBlindBoxes as number) ?? 0);
  const l4 = tryEval("us.vt.standard_deduction", 0n, { vtAdditionalDeductionBoxes: boxes }, "line 4 (standard deduction)");
  const boxCap = mfj || qss || fs === "mfs" ? 4 : 2;
  if (l4 === null) throw new Error("The Vermont standard deduction for this tax year is not published (us.vt.standard_deduction has no applicable rule as of this date) — Form IN-111 line 4 cannot be composed. The 2026 Form IN-111 publishes around December 2026; re-run then");
  if (boxes > 0) notes.push(`VT line 4: standard deduction ${fmtD(l4)} — ${fmtD(l4 - 125000n * BigInt(Math.min(boxes, boxCap)))} for the filing status plus $1,250 for each of ${Math.min(boxes, boxCap)} federal age-65/blind box(es) (the chart allows at most two for single and head of household, four for the joint / qualifying widow(er) row and for separate)`);
  const dependentFiler = input.claimedAsDependent === true;
  const l5a = dependentFiler ? 0 : 1;
  const l5b = mfj && input.vtSpouseClaimedAsDependent !== true ? 1 : 0;
  const l5c = Math.max(0, (input.dependents as number) ?? 0);
  const l5d = l5a + l5b + l5c;
  const l5e = tryEval("us.vt.personal_exemption", 0n, { vtExemptions: l5d }, "line 5e (personal exemptions)") ?? 0n;
  notes.push(`VT line 5: ${l5d} exemption(s) x ${l5d > 0 ? fmtD(l5e / BigInt(l5d)) : "$5,300"} = ${fmtD(l5e)}${dependentFiler ? " — no exemption for yourself because someone can claim you" : ""}${!mfj && !qss && fs !== "single" && fs !== "hoh" ? " — married filing separately takes no spouse exemption" : ""}`);
  const l6 = l4 + l5e;
  // Medical Deduction Worksheet: federal Schedule A line 4 medical less non-allowable amounts, less line 6
  const medGross = D(input.vtFederalMedicalExpenses) - D(input.vtNonAllowableMedicalExpenses);
  const m11 = medGross > l6 ? medGross - l6 : 0n;
  if (D(input.vtFederalMedicalExpenses) > 0n) notes.push(m11 > 0n
    ? `VT Schedule IN-112 line 11: medical expense deduction ${fmtD(m11)} — federal Schedule A line 4 medical and dental expenses (${fmtD(medGross)} after non-allowable continuing-care fees) in excess of the ${fmtD(l6)} Vermont standard deduction plus exemptions (§ 5811(21)(C)(iv))`
    : `VT Schedule IN-112 line 11: no medical expense deduction — ${fmtD(medGross)} of allowable medical expenses does not exceed the ${fmtD(l6)} of line 6 (the worksheet stops when line 3 is negative)`);
  const m18 = m18base + m11;
  const m19 = m6 - m18; // may be negative
  const l2 = m19;
  const l3 = l1 + l2;
  const l7 = max0(l3 - l6);

  // ---- line 8: tax ----
  const useSchedule = input.vtUseRateSchedule === true;
  const l8 = rd(evalStateTax("us.vt.income_tax", l7, { ...agiFacts, vtUsObligationInterest: m7, vtUseRateSchedule: useSchedule }));
  const asOf = (input as { asOf?: string }).asOf;
  const taxYear = typeof asOf === "string" && /^\d{4}/.test(asOf) ? Number(asOf.slice(0, 4)) : NaN;
  const tablePublished = taxYear === 2025;
  // the table/schedule tax WITHOUT the minimum (evaluated with AGI 0 so the floor cannot apply), to say which one governed
  const pureTax = rd(evalStateTax("us.vt.income_tax", l7, { vtFederalAgi: 0n, vtUsObligationInterest: 0n, vtUseRateSchedule: useSchedule || l1 > 15000000n }));
  const floor3 = l1 > 15000000n ? rd(c(Number((l1 - m7) * 3n) / 100 / 100)) : 0n; // 3% of (AGI − U.S. obligation interest), whole dollars
  const inTableRange = l7 < 7500000n && !useSchedule && l1 <= 15000000n;
  if (l1 > 15000000n && floor3 > pureTax) {
    notes.push(`VT line 8: the 3% MINIMUM TAX applies — federal AGI ${fmtD(l1)} exceeds $150,000, and 3% of AGI less U.S. obligation interest (${fmtD(l1 - m7)} x 3% = ${fmtD(floor3)}) is more than the ${fmtD(pureTax)} rate-schedule tax on ${fmtD(l7)} of taxable income (§ 5822(a)(6); the booklet subtracts U.S. obligation interest first where the statute does not, and names only the rate schedule for this comparison)`);
  } else if (l1 > 15000000n && l7 < 7500000n) {
    notes.push(`VT line 8: the rate schedule applied at ${fmtD(l7)} even though that is under $75,000 — federal AGI ${fmtD(l1)} exceeds $150,000, and the line 8 instruction for that case compares the 3% minimum (${fmtD(floor3)}) with "tax calculated on Vermont Taxable Income, Line 7, using the applicable tax rate schedule", not the Tax Table`);
  } else {
    notes.push(
      !inTableRange
        ? `VT line 8: the rate schedule applied at ${fmtD(l7)}${useSchedule ? " (vtUseRateSchedule)" : " (taxable income is $75,000 or more, above the Tax Table)"} — the printed VT Base Tax anchor plus the rate on the excess, one whole-dollar rounding${l1 > 15000000n ? `; the 3% minimum (${fmtD(floor3)}) did not exceed it` : ""}`
        : tablePublished
          ? `VT line 8: the 2025 Vermont Tax Table — the $100 row containing ${fmtD(l7)}, priced at the row midpoint through the printed schedule ("TAXABLE INCOME UNDER $75,000 USE THE TAX TABLES")${l7 < 10000n ? "; the first row (0 to 100) prints $0" : ""}${l1 > 15000000n ? `; the 3% minimum (${fmtD(floor3)}) did not exceed it` : ""}`
          : Number.isNaN(taxYear)
            ? `VT line 8: ${fmtD(l7)} is inside the range the Tax Table covers when one is published, but no asOf was supplied, so this note cannot say whether the table or the schedule produced the tax`
            : `VT line 8: the rate schedule applied at the exact ${fmtD(l7)}, NOT a Tax Table — the ${taxYear} Vermont Tax Tables are not published, and the ${taxYear} rates are the Department's PRELIMINARY schedules from the 2026 Form IN-114 instructions; re-run when the ${taxYear} Form IN-111 publishes`,
    );
  }

  // ---- lines 9-16 ----
  const addBase = D(input.vtFederalAdditionalTaxes);
  const p5 = addBase > 0n ? tryEval("us.vt.federal_tax_adjustment", 0n, { vtFederalTaxAdjustmentBase: addBase }, "Schedule IN-119 line 5") ?? 0n : 0n;
  const p7 = p5 + D(input.vtVermontCreditRecapture);
  const credBase = D(input.vtFederalElderlyDisabledCredit) + D(input.vtVermontInvestmentCredit) + D(input.vtFarmIncomeAveragingCredit);
  const p12 = credBase > 0n ? tryEval("us.vt.federal_tax_adjustment", 0n, { vtFederalTaxAdjustmentBase: credBase }, "Schedule IN-119 line 12") ?? 0n : 0n;
  const p14 = p12 + D(input.vtSolarCreditCarryforward);
  const l9 = p7 - p14; // may be negative
  if (p7 > 0n || p14 > 0n) notes.push(`VT line 9 (Schedule IN-119 Part I): net adjustment ${fmtD(l9)} — 24% of ${fmtD(addBase)} of federal additional taxes (qualified plans, investment credit recapture, Form 4972) plus ${fmtD(D(input.vtVermontCreditRecapture))} of Vermont credit recapture, less 24% of ${fmtD(credBase)} of federal elderly/disabled, Vermont investment and farm income averaging credits and ${fmtD(D(input.vtSolarCreditCarryforward))} of solar carryforward (§ 5822(c), (d))`);
  const l10 = max0(l8 + l9);
  const l11 = D(input.vtCharitableContributions);
  const l13 = l11 > 0n ? tryEval("us.vt.charitable_credit", 0n, { vtCharitableContributions: l11 }, "line 13 (charitable credit)") ?? 0n : 0n;
  const l12 = l11 > 0n ? rd(c(Number(l11) * 5 / 100 / 100)) : 0n;
  if (l13 > 0n) notes.push(`VT line 13: charitable contribution credit ${fmtD(l13)} — 5% of the first $20,000 of contributions allowable under IRC § 170, whether or not itemized federally, maximum $1,000; the form labels it a "Deduction" but it is subtracted from the tax (§ 5822(d)(3))`);
  const l14 = max0(l10 - l13);
  const l16 = l14; // line 15 is 100.0000% for a full-year resident
  notes.push("VT line 15: 100.0000% — this composer produces a FULL-YEAR RESIDENT return; a part-year resident or nonresident needs Schedule IN-113, whose line 35 percentage multiplies line 14 and whose lines 14A/14B prorate the refundable credits, and which 2026 Act 164 §§ 56-57 recast onto modified AGI retroactively for 2025 — out of scope here");

  // ---- lines 17-20: credits ----
  const otherIncome = D(input.vtOtherStateIncome);
  const l17 = otherIncome > 0n && D(input.vtOtherStateTaxPaid) > 0n
    ? tryEval("us.vt.other_state_credit", 0n, {
        // IN-117 lines 10-17: AGI ("If less than zero, enter -0-") plus the WHOLE of IN-112 lines 3 and 4, less lines 7 and 9
        vtOtherStateIncome: otherIncome, vtModifiedAgi: max0(l1) + m3 + m4 - m7 - m9, vtIncomeTax: l14, vtOtherStateTaxPaid: D(input.vtOtherStateTaxPaid),
      }, "line 17 (Schedule IN-117 other-state credit)") ?? 0n
    : 0n;
  if (l17 > 0n) notes.push(`VT line 17 (Schedule IN-117): credit for tax paid to another state or Canadian province ${fmtD(l17)} — the line 14 tax times the ratio of the doubly-taxed modified AGI to Vermont modified AGI, capped at 100%, limited to the tax actually PAID there (not withholding; no city or county tax). One schedule per state, summed`);
  const vheip = D(input.vtVheipContributions) > 0n
    ? tryEval("us.vt.vheip_credit", 0n, { vtVheipContributions: D(input.vtVheipContributions), vtVheipBeneficiaries: Math.max(0, (input.vtVheipBeneficiaries as number) ?? 0) }, "Schedule IN-119 Part II line 1 (VHEIP credit)") ?? 0n
    : 0n;
  if (D(input.vtVheipContributions) > 0n && vheip === 0n) notes.push("VT Schedule IN-119 Part II line 1: no VHEIP credit — pass vtVheipBeneficiaries (the credit is 10% of the first $2,500 per beneficiary, $5,000 on a joint return)");
  const l18 = vheip + D(input.nonrefundableCredits);
  if (l18 > 0n) notes.push(`VT line 18 (Schedule IN-119 Part II line 9): nonrefundable credits ${fmtD(l18)}${vheip > 0n ? ` including ${fmtD(vheip)} of Vermont Higher Education Investment Plan credit` : ""}`);
  const l19 = l17 + l18;
  const l20 = max0(l16 - l19);
  if (l19 > l16) notes.push(`VT line 20: credits of ${fmtD(l19)} exceed the ${fmtD(l16)} tax; the excess is lost — "If Line 19 is greater than Line 16, enter -0-"`);

  // ---- lines 21-25 ----
  const se = D(input.vtSelfEmploymentIncome);
  const l21 = se > 0n ? tryEval("us.vt.child_care_contribution", 0n, { vtSelfEmploymentIncome: se, vtSelfEmploymentIncomeOutsideVermont: D(input.vtSelfEmploymentIncomeOutsideVermont) }, "line 21 (child care contribution)") ?? 0n : 0n;
  if (l21 > 0n) notes.push(`VT line 21: child care contribution ${fmtD(l21)} — 0.11% of ${fmtD(se - D(input.vtSelfEmploymentIncomeOutsideVermont))} of Vermont-source self-employment income (2023 Act 76; Schedule SE line 6 less work performed outside Vermont)`);
  const useInputs = input.vtUseTaxEstimateFromTable === true || D(input.vtUseTaxSmallPurchases) > 0n || D(input.vtUseTaxLargePurchases) > 0n;
  const l22 = useInputs
    ? tryEval("us.vt.use_tax", 0n, {
        ...agiFacts, vtUseTaxEstimateFromTable: input.vtUseTaxEstimateFromTable === true,
        vtUseTaxSmallPurchases: D(input.vtUseTaxSmallPurchases), vtUseTaxLargePurchases: D(input.vtUseTaxLargePurchases), vtUseTaxPaidOtherState: D(input.vtUseTaxPaidOtherState),
      }, "line 22 (use tax)") ?? 0n
    : 0n;
  if (useInputs) notes.push(`VT line 22: use tax ${fmtD(l22)} — ${input.vtUseTaxEstimateFromTable === true ? "the Estimated Use Tax Table on federal AGI (no records kept)" : "6% of recorded purchases under $1,000"}, plus 6% of items of $1,000 or more, less sales tax paid to another state`);
  else notes.push("VT line 22: use tax $0 — no untaxed purchases were reported; the form requires the filer to check the certification box if no use tax is due");
  const l23 = l20 + l21 + l22;
  const l24e = D(input.vtVoluntaryContributions);
  const l25 = l23 + l24e;

  // ---- lines 26-32: payments and refundable credits ----
  const l26a = D(input.stateWithholding) + (mfj ? D(input.spouseStateWithholding) : 0n);
  const l26b = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  const cdcc = D(input.vtFederalChildCareCredit) > 0n ? tryEval("us.vt.child_dependent_care_credit", 0n, { vtFederalChildCareCredit: D(input.vtFederalChildCareCredit) }, "Schedule IN-112 line 2 (child and dependent care credit)") ?? 0n : 0n;
  const kids = Math.max(0, (input.vtChildrenSixOrUnder as number) ?? 0);
  const ctc = kids > 0 ? tryEval("us.vt.child_tax_credit", 0n, { ...agiFacts, vtChildrenSixOrUnder: kids }, "Schedule IN-112 line 4 (child tax credit)") ?? 0n : 0n;
  const fedEic = D(input.federalEITC);
  const eitc = fedEic > 0n ? tryEval("us.vt.eitc", 0n, { vtFederalEic: fedEic, vtEitcQualifyingChildren: Math.max(0, (input.vtEitcQualifyingChildren as number) ?? 0) }, "Schedule IN-112 line 7 (earned income credit)") ?? 0n : 0n;
  const veteran = input.vtVeteranDischargeRecord === true ? tryEval("us.vt.veteran_credit", 0n, { ...agiFacts, vtVeteranDischargeRecord: true }, "Schedule IN-112 line 12 (veteran credit)") ?? 0n : 0n;
  if (cdcc > 0n) notes.push(`VT Schedule IN-112 line 2: child and dependent care credit ${fmtD(cdcc)} — 72% of the federal credit, REFUNDABLE (§ 5828c)`);
  if (kids > 0) notes.push(ctc > 0n
    ? `VT Schedule IN-112 line 4: child tax credit ${fmtD(ctc)} for ${kids} child(ren) six or younger — $1,000 each less $20 per $1,000 or fraction of federal AGI over $125,000 regardless of filing status, REFUNDABLE (§ 5830f; 2025 Act 71 raised the age from five to six)`
    : `VT Schedule IN-112 line 4: no child tax credit — federal AGI ${fmtD(l1)} is above $174,000, where the $20-per-$1,000 reduction exhausts the $1,000`);
  if (fedEic > 0n) notes.push(`VT Schedule IN-112 line 7: earned income credit ${fmtD(eitc)} — ${(input.vtEitcQualifyingChildren as number) > 0 ? "38% of the federal credit with qualifying children" : "100% of the federal credit with NO qualifying children (2025 Act 71 § 2, up from 38%)"}, REFUNDABLE`);
  if (input.vtVeteranDischargeRecord === true) notes.push(veteran > 0n
    ? `VT Schedule IN-112 line 12: veteran tax credit ${fmtD(veteran)} — $250 less $5 per full $100 of federal AGI over $25,000, REFUNDABLE (§ 5830g, new for 2025)`
    : `VT Schedule IN-112 line 12: no veteran credit — federal AGI ${fmtD(l1)} is $30,000 or more`);
  const l26c = cdcc + ctc + eitc + veteran + D(input.refundableCredits);
  const l26d = D(input.vtRealEstateWithholding);
  const l26e = D(input.vtNonresidentEstimatedPayments);
  const l26f = l26a + l26b + l26c + l26d + l26e;
  const l27 = l26f > l25 ? l26f - l25 : 0n;
  const l28a = l27 > 0n ? min2(D(input.vtAppliedToNextYear), l27) : 0n;
  const l28b = l27 > 0n ? min2(D(input.vtAppliedToPropertyTaxBill), l27 - l28a) : 0n;
  const l29 = l27 - l28a - l28b;
  const l30 = l25 > l26f ? l25 - l26f : 0n;
  const l31 = D(input.vtUnderpaymentInterestPenalty);
  const l32 = l30 + l31;
  if (l32 > 0n) notes.push(`VT line 32: amount due ${fmtD(l32)}${l31 > 0n ? ` including ${fmtD(l31)} of Worksheet IN-152 underpayment interest and penalty` : ""}`);
  else notes.push(`VT line 29: refund ${fmtD(l29)}${l28a > 0n ? `, ${fmtD(l28a)} credited to ${Number.isNaN(taxYear) ? "next year's" : `${taxYear + 1}`} estimated tax` : ""}${l28b > 0n ? `, ${fmtD(l28b)} credited to the ${Number.isNaN(taxYear) ? "next" : `${taxYear + 1}`} property tax bill` : ""}`);
  notes.push("VT: the Renter Credit (Form RCC-146) and the Property Tax Credit (Form HS-122 / HI-144) are separate claims computed by the Department from household income, family size and county figures — they are not lines of Form IN-111 and are not composed here");

  return {
    "1_federal_agi": fmtD(l1),
    "IN112_3_non_vermont_obligations": fmtD(m3),
    "IN112_4_bonus_depreciation_and_other_additions": fmtD(m4),
    "IN112_6_total_additions": fmtD(m6),
    "IN112_7_us_obligation_interest": fmtD(m7),
    "IN112_8_capital_gains_exclusion": fmtD(m8),
    "IN112_9_prior_year_bonus_depreciation": fmtD(m9),
    "IN112_10_taxable_state_refunds": fmtD(m10),
    "IN112_11_medical_expense_deduction": fmtD(m11),
    "IN112_12_retirement_exclusion": fmtD(m12),
    "IN112_13_military_retirement_exclusion": fmtD(m13),
    "IN112_14_railroad_retirement": fmtD(m14),
    "IN112_15_exempt_bond_interest": fmtD(m15),
    "IN112_16c_student_loan_interest": fmtD(m16),
    "IN112_18_total_subtractions": fmtD(m18),
    "2_net_modifications": fmtD(l2),
    "3_agi_with_modifications": fmtD(l3),
    "4_standard_deduction": fmtD(l4),
    "5d_total_exemptions": String(l5d),
    "5e_personal_exemptions": fmtD(l5e),
    "6_deduction_plus_exemptions": fmtD(l6),
    "7_vt_taxable_income": fmtD(l7),
    "8_vt_income_tax": fmtD(l8),
    "IN119_5_24pct_of_federal_additional_taxes": fmtD(p5),
    "IN119_7_additions_to_vt_tax": fmtD(p7),
    "IN119_12_24pct_of_federal_credits": fmtD(p12),
    "IN119_14_subtractions_from_vt_tax": fmtD(p14),
    "9_net_adjustment": fmtD(l9),
    "10_tax_with_adjustment": fmtD(l10),
    "11_charitable_contributions": fmtD(l11),
    "12_five_percent": fmtD(l12),
    "13_charitable_credit": fmtD(l13),
    "14_vt_income_tax": fmtD(l14),
    "15_income_adjustment_pct": "100.0000%",
    "16_adjusted_vt_income_tax": fmtD(l16),
    "17_other_state_credit": fmtD(l17),
    "IN119_II_1_vheip_credit": fmtD(vheip),
    "18_vt_tax_credits": fmtD(l18),
    "19_total_credits": fmtD(l19),
    "20_tax_after_credits": fmtD(l20),
    "21_child_care_contribution": fmtD(l21),
    "22_use_tax": fmtD(l22),
    "23_total_vt_taxes": fmtD(l23),
    "24e_voluntary_contributions": fmtD(l24e),
    "25_total_taxes_and_contributions": fmtD(l25),
    "26a_withholding": fmtD(l26a),
    "26b_estimated_and_extension_payments": fmtD(l26b),
    "IN112_II_2_child_dependent_care_credit": fmtD(cdcc),
    "IN112_II_4_child_tax_credit": fmtD(ctc),
    "IN112_II_7_earned_income_credit": fmtD(eitc),
    "IN112_II_12_veteran_credit": fmtD(veteran),
    "IN112_II_13_total_refundable_credits": fmtD(l26c),
    "26c_refundable_credits": fmtD(l26c),
    "26d_real_estate_withholding": fmtD(l26d),
    "26e_nonresident_estimated_payments": fmtD(l26e),
    "26f_total_payments_and_credits": fmtD(l26f),
    "27_overpayment": fmtD(l27),
    "28a_credited_to_2026_estimated_tax": fmtD(l28a),
    "28b_credited_to_2026_property_tax": fmtD(l28b),
    "29_refund": fmtD(l29),
    "30_tax_due": fmtD(l30),
    "31_underpayment_interest_penalty": fmtD(l31),
    "32_amount_due": fmtD(l32),
  };
}
