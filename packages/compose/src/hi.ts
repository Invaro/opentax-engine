/**
 * 2025 Hawaii Form N-11 line composer (full-year resident; line numbers per
 * the printed form). Oracle targets: the line 27 tax (Tax Table / Tax Rate
 * Schedules / Tax on Capital Gains Worksheet), the standard deduction and
 * the Worksheets A-1 to A-6 itemized deductions with the § 68 limitation,
 * the line 25 exemptions, the line 15 reserve pay exclusion, the refundable
 * food/excise, renters, child and dependent care, and earned income credits,
 * and the other-state credit. Composed here per the printed form: the line
 * 6a-6e exemption counts, lines 8-20, the itemize-or-standard selection, the
 * Tax Computation Worksheet, Schedule CR totals, lines 33-50.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));

export function composeHI(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Hawaii Form N-11 composer");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const joint = mfj || fs === "qss";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = Math.max(0, (input.dependents as number) ?? 0);
  const age65 = input.hiTaxpayerAge65 === true;
  const spouse65 = input.hiSpouseAge65 === true;
  if (fs === "qss") notes.push("HI filing status oval 5 'Qualifying surviving spouse' — Tax Rate Schedule II / the married filing jointly column and the $8,800 standard deduction");
  if (mfs) notes.push("HI married filing separate return (oval 3): Schedule I / the single column, the $4,400 standard deduction, the food/excise and renters credits add the spouse's AGI, the child care credit only if considered unmarried, and the EITC only if the federal EIC was allowed");

  // ---- lines 6a-6e ----
  let l6a = dependentFiler ? 0 : 1 + (age65 ? 1 : 0);
  let l6b = 0;
  if (mfj && !dependentFiler && input.hiSpouseClaimedAsDependent !== true) l6b = 1 + (spouse65 ? 1 : 0);
  else if (mfs && input.hiSpouseExemptionMfs === true) l6b = 1 + (spouse65 ? 1 : 0);
  // The $7,000 disability exemption is "in lieu of the regular personal exemption of $1,144.
  // If you claim the Disability Exemption, you will not be able to claim the additional
  // exemptions for your children or other dependents, or for being 65 or older" (booklet
  // p. 20) — so the printed counts drop the age-65 extras and the dependents. The dollar
  // amount on line 25 is computed by the rule from hiDisabledPersons separately.
  const disabilityClaimed = Math.max(0, (input.hiDisabledPersons as number) ?? 0) > 0;
  if (disabilityClaimed) {
    if (l6a > 1) l6a = 1;
    if (l6b > 1) l6b = 1;
  }
  const l6e = l6a + l6b + (disabilityClaimed ? 0 : deps);
  if (disabilityClaimed && (deps > 0 || age65 || spouse65)) notes.push("HI line 6: the disability exemption is claimed, so the age-65 extra exemptions and the exemptions for dependents are NOT available — lines 6a-6e print without them, and line 25 carries the $7,000-per-person amount in lieu of $1,144");
  if (dependentFiler) notes.push(`HI line 6a${mfj ? "-6b" : ""}: claimable as a dependent on another return — no exemption for yourself${mfj ? " or your spouse ('do not fill in the ovals on lines 6a and 6b')" : ""} (oval above line 21 filled); the standard deduction is the greater of $500 or earned income`);
  if (mfs && input.hiSpouseExemptionMfs === true) notes.push("HI line 6b: spouse exemption on a separate return — the spouse had no income, is not filing, and cannot be claimed as a dependent");
  if (mfs && input.hiSpouseAge65 === true && input.hiSpouseExemptionMfs !== true) notes.push("HI line 6b: the spouse's 'Age 65 or over' oval counts only with the spouse exemption (pass hiSpouseExemptionMfs)");

  // ---- lines 7-12 ----
  const l7 = rd(c(input.federalAGI));
  const l8 = D(input.hiWageDifference);
  const l9 = D(input.hiOutOfStateBondInterest);
  const l10 = D(input.additions);
  const l11 = l8 + l9 + l10;
  const l12 = l7 + l11;
  if (l11 > 0n) notes.push(`HI line 11: Hawaii additions ${fmtD(l11)} — state/federal wage difference ${fmtD(l8)}, out-of-state bond interest ${fmtD(l9)}, other additions (Hawaii Additions Worksheet) ${fmtD(l10)}`);

  // ---- lines 13-20 ----
  const l13 = D(input.hiPensionExclusion);
  const l14 = D(input.taxableSocialSecurity);
  const reserve = D(input.hiReservePay) + (mfj ? D(input.hiSpouseReservePay) : 0n);
  const l15 = reserve > 0n ? rd(evalStateTax("us.hi.reserve_pay_exclusion", 0n, { hiReservePay: c(input.hiReservePay), hiSpouseReservePay: mfj ? c(input.hiSpouseReservePay) : 0n })) : 0n;
  const ihaCap = mfj ? 1000000n : 500000n; // "not to exceed $10,000 shall be allowed for a married couple filing a joint return"
  const l16 = min2(D(input.hiIhaPayments), ihaCap);
  const l17 = D(input.hiExceptionalTreesDeduction);
  const l18 = D(input.subtractions);
  const l19 = l13 + l14 + l15 + l16 + l17 + l18;
  const l20 = l12 - l19;
  if (l13 > 0n) notes.push(`HI line 13: employer-funded pension distributions ${fmtD(l13)} excluded (§ 235-7(a)(3) — government retirement systems, military pensions, and private plans the employee did not contribute to; deferred compensation, 401(k), TSP, and IRA distributions stay taxable)`);
  if (l14 > 0n) notes.push(`HI line 14: taxable Social Security ${fmtD(l14)} subtracted in full (§ 235-2.3(b)(3))`);
  if (l15 > 0n) notes.push(`HI line 15: military reserve / National Guard duty pay exclusion ${fmtD(l15)} (first $8,636 per member)`);
  if (D(input.hiIhaPayments) > l16) notes.push(`HI line 16: individual housing account payments capped at ${fmtD(ihaCap)}`);
  if (l17 > 0n) notes.push(`HI line 17: exceptional trees deduction ${fmtD(l17)} (up to $3,000 per tree; notarized arborist affidavit)`);
  if (l18 > 0n) notes.push(`HI line 18: other Hawaii subtractions ${fmtD(l18)} (Hawaii Subtractions Worksheet — U.S. obligation interest, refund adjustment, moving expenses, etc.)`);
  if (l20 < 0n) notes.push("HI line 20: Hawaii AGI is negative — a net operating loss may exist (carryforward only, 80% limit)");

  // ---- lines 21-24: deductions ----
  const spouseItemizes = mfs && input.hiSpouseItemizes === true;
  const earned = c(input.hiEarnedIncome);
  const l23std = rd(evalStateTax("us.hi.standard_deduction", 0n, { isClaimedAsDependent: dependentFiler, hiEarnedIncome: earned }));
  if (dependentFiler && input.hiEarnedIncome === undefined) notes.push("HI line 23: dependent filer's standard deduction assumes $0 earned income → $500 — pass hiEarnedIncome");
  const itemInputs = ["hiMedicalExpenses", "hiStateLocalIncomeTaxes", "hiRealEstateTaxes", "hiPersonalPropertyTaxes", "hiOtherTaxes", "hiHomeMortgageInterest", "hiInvestmentInterest", "hiCharitableContributions", "hiCasualtyLosses", "hiJobAndMiscExpenses", "hiOtherMiscDeductions"] as const;
  const hasItemized = input.hiItemize === true || spouseItemizes || itemInputs.some((k) => c(input[k]) > 0n);
  let l22 = 0n;
  let itemLines: Record<string, Cents> = {};
  if (hasItemized) {
    const extra: Record<string, Cents | boolean | number | string> = { hiAgi: l20, hiFederalAgi: l7, hiGamblingLossesInMisc: c(input.hiGamblingLossesInMisc) };
    for (const k of itemInputs) extra[k] = c(input[k]);
    l22 = rd(evalStateTax("us.hi.itemized_deductions", 0n, extra));
    // display lines per Worksheets A-1 to A-6 (the rule applies the same arithmetic plus the overall limitation)
    const agiPos = max0(l20);
    const pctOf = (base: Cents, num: bigint, den: bigint): Cents => rd((base * num + den / 2n) / den);
    const saltLimit = joint ? 20000000n : fs === "hoh" ? 15000000n : 10000000n;
    const saltAllowed = l7 < saltLimit;
    const l21a = max0(D(input.hiMedicalExpenses) - pctOf(agiPos, 75n, 1000n));
    const l21b = (saltAllowed ? D(input.hiStateLocalIncomeTaxes) : 0n) + D(input.hiRealEstateTaxes) + D(input.hiPersonalPropertyTaxes) + D(input.hiOtherTaxes);
    const l21c = D(input.hiHomeMortgageInterest) + D(input.hiInvestmentInterest);
    const l21d = D(input.hiCharitableContributions);
    const l21e = max0(D(input.hiCasualtyLosses) - pctOf(agiPos, 10n, 100n));
    const l21f = max0(D(input.hiJobAndMiscExpenses) - pctOf(agiPos, 2n, 100n)) + D(input.hiOtherMiscDeductions);
    itemLines = { "21a_medical": l21a, "21b_taxes": l21b, "21c_interest": l21c, "21d_contributions": l21d, "21e_casualty": l21e, "21f_miscellaneous": l21f };
    const sum = l21a + l21b + l21c + l21d + l21e + l21f;
    if (!saltAllowed && D(input.hiStateLocalIncomeTaxes) > 0n) notes.push(`HI Worksheet A-2 line 5: state and local income (or sales) taxes not deductible — federal AGI ${fmtD(l7)} is not under ${fmtD(saltLimit)} (§ 235-2.4(k)(2))`);
    if (l22 < sum) notes.push(`HI line 22: itemized deductions ${fmtD(sum)} reduced to ${fmtD(l22)} by the overall limitation — Hawaii AGI ${fmtD(l20)} exceeds ${mfs ? "$83,400" : "$166,800"} (Total Itemized Deductions Worksheet: the smaller of 3% of the excess or 80% of the deductions other than medical, investment interest, casualty, and gambling losses)`);
  }
  const itemize = spouseItemizes || (hasItemized && l22 > l23std);
  if (spouseItemizes) notes.push("HI line 21: married filing separately and the spouse itemizes — you must itemize (no standard deduction)");
  else if (hasItemized) notes.push(itemize ? `HI line 22: itemized deductions ${fmtD(l22)} exceed the ${fmtD(l23std)} standard deduction — itemizing` : `HI line 23: the ${fmtD(l23std)} standard deduction is used — itemized deductions are ${fmtD(l22)}`);
  const ded = itemize ? l22 : l23std;
  const l24 = l20 - ded;

  // ---- lines 25-26 ----
  const disabled = Math.min(2, Math.max(0, (input.hiDisabledPersons as number) ?? 0));
  const spouseIsDisabled = input.hiSpouseDisabled === true;
  const nonDisabledSpouse65 = disabled === 1 && mfj && (spouseIsDisabled ? age65 : spouse65);
  const l25 = rd(evalStateTax("us.hi.personal_exemption", 0n, { hiExemptions: l6e, hiDisabledPersons: disabled, hiNonDisabledSpouseAge65: nonDisabledSpouse65 }));
  if (disabled > 0) notes.push(`HI line 25: disability exemption — $7,000 for each blind, deaf, or totally disabled person (Form N-172 certified) in lieu of the $1,144 regular exemptions; no dependent or age-65 exemptions with it${disabled === 1 && mfj ? ` (the non-disabled ${spouseIsDisabled ? "taxpayer" : "spouse"} keeps ${nonDisabledSpouse65 ? "$2,288 at 65 or older" : "$1,144"}${input.hiSpouseDisabled === undefined ? "; the taxpayer is assumed to be the disabled person — pass hiSpouseDisabled if it is the spouse" : ""})` : ""}`);
  else notes.push(`HI line 25: ${l6e} exemption(s) × $1,144${age65 || spouse65 ? " (including the extra exemption for age 65 or over)" : ""}`);
  const l26 = max0(l24 - l25);

  // ---- line 27: tax ----
  const useSched = input.hiUseRateSchedule === true;
  const ordinary = rd(evalStateTax("us.hi.income_tax", l26, { hiUseRateSchedule: useSched }));
  const ncg = c(input.hiNetCapitalGain);
  const ltcg = c(input.hiNetLongTermCapitalGain);
  const n158 = c(input.hiInvestmentInterestN158);
  const statutory = input.hiCapitalGainsStatutoryThreshold === true;
  const printedThr = joint ? 4800000n : fs === "hoh" ? 3600000n : 2400000n;
  const statutoryThr = joint ? 9600000n : fs === "hoh" ? 7200000n : 4800000n;
  const thr = statutory ? statutoryThr : printedThr;
  let tax = ordinary;
  let method = useSched || l26 >= 10000000n ? "tax rate schedule" : "tax table";
  let l27a = 0n;
  const l10cg = max0(min2(ltcg, ncg) - max0(n158));
  if (l10cg > 0n && l26 > thr) {
    const cg = rd(evalStateTax("us.hi.capital_gains_tax", l26, { hiNetLongTermCapitalGain: ltcg, hiNetCapitalGain: ncg, hiInvestmentInterestN158: n158, hiCapitalGainsStatutoryThreshold: statutory, hiUseRateSchedule: useSched }));
    const l13cg = l26 - l10cg > thr ? l26 - l10cg : thr;
    const l14cg = max0(l26 - l13cg);
    if (cg < ordinary) {
      tax = cg;
      method = "capital gains worksheet";
      l27a = l14cg;
      notes.push(`HI line 27: Tax on Capital Gains Worksheet — ${fmtD(l14cg)} of net capital gain at 7.25% plus the ${method === "capital gains worksheet" && (useSched || l13cg >= 10000000n) ? "schedule" : "table"} tax on ${fmtD(l13cg)} = ${fmtD(cg)}, below the ${fmtD(ordinary)} regular tax; line 27a = ${fmtD(l14cg)}`);
    } else notes.push(`HI line 27: the Tax on Capital Gains Worksheet (${fmtD(cg)}) does not beat the regular tax ${fmtD(ordinary)}`);
    notes.push(statutory ? "HI capital gains worksheet line 12: the statutory § 235-51(f)(1)(B) amount (income taxed below 7.25% under the 2025 brackets: $48,000 / $72,000 / $96,000) is used instead of the printed $24,000 / $36,000 / $48,000 — disclose the departure from the printed worksheet" : "HI capital gains worksheet line 12: the PRINTED 2025 amounts ($24,000 single/MFS, $36,000 HOH, $48,000 joint) are used; they predate Act 46's wider 7.2% bracket — pass hiCapitalGainsStatutoryThreshold to apply § 235-51(f)(1)(B)'s $48,000 / $72,000 / $96,000 (lower tax by up to about $60 / $120)");
  }
  notes.push(method === "tax table" ? `HI line 27: 2025 Tax Table ($50-row midpoint on the printed rate schedule) on taxable income ${fmtD(l26)} — pass hiUseRateSchedule for the schedule at the exact income (differs by at most $3)` : method === "tax rate schedule" ? `HI line 27: Tax Rate Schedule ${joint ? "II" : fs === "hoh" ? "III" : "I"} at the exact income${l26 >= 10000000n ? " (taxable income of $100,000 or more must use the schedules)" : ""}` : "");
  const otherFormsTax = D(input.hiOtherFormsTax);
  const l27 = tax + otherFormsTax;
  if (otherFormsTax > 0n) notes.push(`HI line 27: additional tax from other forms (Tax Computation Worksheet lines c-m) ${fmtD(otherFormsTax)} included`);

  // ---- lines 28-33: refundable credits ----
  const present = input.hiPresentOverNineMonths === true;
  const personsPresent = (l6a >= 1 ? 1 : 0) + (l6b >= 1 ? 1 : 0) + deps;
  const publicChildren = Math.max(0, (input.hiPublicSupportMinorChildren as number) ?? 0);
  const feCount = typeof input.hiFoodExciseQualifiedExemptions === "number" ? (input.hiFoodExciseQualifiedExemptions as number) : personsPresent + publicChildren;
  let l28 = 0n;
  if (!dependentFiler && present && feCount > 0) {
    l28 = rd(evalStateTax("us.hi.food_excise_credit", 0n, { hiFederalAgi: l7, hiSpouseFederalAgi: mfs ? c(input.hiSpouseFederalAgi) : 0n, hiFoodExciseQualifiedExemptions: feCount, isClaimedAsDependent: false }));
    notes.push(l28 > 0n ? `HI line 28 (Form N-311): refundable food/excise tax credit ${fmtD(l28)} — ${feCount} qualified exemption(s) × the per-exemption amount for federal AGI ${fmtD(l7 + (mfs ? D(input.hiSpouseFederalAgi) : 0n))}${publicChildren > 0 ? ` (including ${publicChildren} minor child(ren) supported by public agencies)` : ""}` : `HI line 28: no food/excise tax credit — federal AGI ${fmtD(l7 + (mfs ? D(input.hiSpouseFederalAgi) : 0n))}${mfs ? " (yours plus your spouse's)" : ""} is ${fs === "single" ? "$40,000" : "$60,000"} or more`);
  } else if (!dependentFiler && !present) notes.push("HI line 28: food/excise tax credit not claimed — pass hiPresentOverNineMonths (each qualified exemption must have been physically present in Hawaii more than nine months in 2025)");
  else if (dependentFiler) notes.push("HI lines 28-30: no food/excise, renters, or child care credit for a filer claimable as a dependent");
  let l29 = 0n;
  const rent = D(input.hiRentPaid);
  if (rent > 0n && !dependentFiler) {
    if (present) {
      const rCount = typeof input.hiRentersExemptions === "number" ? (input.hiRentersExemptions as number) : l6e;
      l29 = rd(evalStateTax("us.hi.renters_credit", 0n, { hiAgi: l20, hiSpouseAgi: mfs ? c(input.hiSpouseAgi) : 0n, hiRentPaid: rent, hiRentersExemptions: rCount, isClaimedAsDependent: false }));
      notes.push(l29 > 0n ? `HI line 29 (Schedule X Part I): credit for low-income household renters ${fmtD(l29)} — ${rCount} qualified exemption(s) × $50 (rent ${fmtD(rent)} net of exclusions; Hawaii AGI ${fmtD(l20)} under $30,000)` : `HI line 29: no renters credit — ${rent <= 100000n ? "rent net of exclusions is not more than $1,000" : "Hawaii AGI is $30,000 or more"}`);
    } else notes.push("HI line 29: renters credit not claimed — pass hiPresentOverNineMonths");
  }
  let l30 = 0n;
  if (c(input.hiChildCareExpenses) > 0n && !dependentFiler) {
    l30 = rd(
      evalStateTax("us.hi.child_dependent_care_credit", 0n, {
        hiChildCareExpenses: c(input.hiChildCareExpenses), hiChildCareQualifyingPersons: (input.hiChildCareQualifyingPersons as number) ?? 1, hiDependentCareBenefits: c(input.hiDependentCareBenefits),
        hiEarnedIncome: earned, hiSpouseEarnedIncome: c(input.hiSpouseEarnedIncome), hiAgi: l20, hiMfsConsideredUnmarried: input.hiMfsConsideredUnmarried === true, isClaimedAsDependent: false,
      }),
    );
    notes.push(l30 > 0n ? `HI line 30 (Schedule X Part II): credit for child and dependent care expenses ${fmtD(l30)} — qualified expenses up to $10,000 / $20,000, limited to earned income, × the Hawaii AGI percentage (25% to 15%); refundable` : mfs && input.hiMfsConsideredUnmarried !== true ? "HI line 30: no child care credit — married filing separately unless considered unmarried (pass hiMfsConsideredUnmarried)" : `HI line 30: no child care credit — the earned income limit${input.hiEarnedIncome === undefined ? " (pass hiEarnedIncome" + (mfj ? " and hiSpouseEarnedIncome" : "") + ")" : ""} or the expense cap net of benefits is zero`);
  }
  const l31 = input.hiChildRestraintSystemPurchased === true ? 2500n : 0n;
  if (l31 > 0n) notes.push("HI line 31: $25 child passenger restraint system credit (§ 235-15; attach the invoice)");
  const fedEic = D(input.federalEITC);
  const eitc = fedEic > 0n ? rd(evalStateTax("us.hi.eitc", 0n, { hiFederalEic: fedEic })) : 0n;
  if (eitc > 0n) notes.push(`HI Schedule CR line 8 (Form N-356): earned income tax credit ${fmtD(eitc)} = 40% of the ${fmtD(fedEic)} federal EIC; refundable (same filing status and dependents as the federal return${mfs ? " — a separate filer qualifies only when the federal EIC was allowed under § 32(d)(2)" : ""})`);
  const otherRef = D(input.refundableCredits);
  const l32 = eitc + otherRef;
  const l33 = l28 + l29 + l30 + l31 + l32;
  const l34 = l27 - l33;

  // ---- lines 35-36: nonrefundable credits ----
  let osc = 0n;
  if (c(input.hiOtherStateTaxEligible) > 0n) {
    osc = rd(evalStateTax("us.hi.other_state_credit", l26, { hiNetCapitalGainLine27a: l27a, hiOutOfStateIncome: c(input.hiOutOfStateIncome), hiOutOfStateLtcg: c(input.hiOutOfStateLtcg), hiOtherStateTaxEligible: c(input.hiOtherStateTaxEligible), hiTaxLine13: tax, hiAdjustedTaxLiability: l34, hiUseRateSchedule: useSched }));
    notes.push(`HI Schedule CR line 12: credit for income taxes paid to other states and countries ${fmtD(osc)} — the smaller of the ${fmtD(D(input.hiOtherStateTaxEligible))} paid and the Hawaii tax less the tax on Hawaii-source income (worksheet), limited to line 34; those taxes cannot also be itemized`);
  }
  const eitcCarry = D(input.hiEitcCarryover2022);
  const nonref = osc + eitcCarry + D(input.nonrefundableCredits);
  const l35 = min2(nonref, max0(l34));
  if (nonref > l35) notes.push(`HI line 35: nonrefundable credits ${fmtD(nonref)} limited to the ${fmtD(max0(l34))} adjusted tax liability ('If line 34 is zero or less, no tax credit may be used')`);
  if (eitcCarry > 0n) notes.push("HI Schedule CR line 24: the 2022 nonrefundable EITC carryover is usable through TY2025 only (Act 25, SLH 2025)");
  const l36 = l34 - l35;

  // ---- lines 37-50 ----
  // a spouse column exists only on a joint return — a qualifying surviving spouse has none
  const l37 = D(input.stateWithholding) + (mfj ? D(input.spouseStateWithholding) : 0n);
  const l38 = D(input.estimatedPayments);
  const l39 = D(input.priorYearOverpaymentCredited);
  const l40 = D(input.extensionPayment);
  const l41 = l37 + l38 + l39 + l40;
  const l42 = l36 < 0n ? -l36 + l41 : l41 > l36 ? l41 - l36 : 0n;
  const l44 = min2(D(input.hiFundContributions), l42);
  const l45 = l42 - l44;
  const l46 = min2(D(input.hiCreditForward), l45);
  const penalty = D(input.hiEstimatedTaxPenalty);
  let l47a = l45 - l46;
  const l48 = l36 > l41 ? l36 - l41 : 0n;
  let l49 = l48;
  if (penalty > 0n) {
    if (l48 > 0n) l49 = l48 + penalty;
    else {
      l47a = max0(l47a - penalty);
      notes.push(`HI line 50: the ${fmtD(penalty)} estimated tax penalty reduces the refund automatically`);
    }
  }
  if (l44 > 0n) notes.push(`HI line 44: ${fmtD(l44)} contributed to the Hawaii schools, libraries, and violence/child abuse funds from the overpayment`);
  if (l42 > 0n && l42 < 100n) notes.push("HI line 42: refunds and credit payments under $1 are not made");

  notes.push("HI scope: Form N-11 is composed for a full-year RESIDENT (part-year and nonresidents file Form N-15, not composed); additions and subtractions other than lines 8, 9, 13-17 are transcribed totals (Hawaii Additions / Subtractions Worksheets); Schedule CR credits other than the EITC and the other-state credit are inputs; Hawaii conforms to the IRC as of December 31, 2024 for 2025 (no OBBBA items, no QBI, no bonus depreciation); no county or local income tax");

  const put = (k: string, v: Cents): Record<string, string> => (v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    "6a_yourself": String(l6a),
    "6b_spouse": String(l6b),
    "6cd_dependents": String(deps),
    "6e_total_exemptions": String(l6e),
    "7_federal_agi": fmtD(l7),
    ...put("8_wage_difference", l8),
    ...put("9_out_of_state_bond_interest", l9),
    ...put("10_other_additions", l10),
    ...put("11_total_additions", l11),
    "12_federal_agi_plus_additions": fmtD(l12),
    ...put("13_pension_exclusion", l13),
    ...put("14_social_security", l14),
    ...put("15_reserve_pay_exclusion", l15),
    ...put("16_individual_housing_account", l16),
    ...put("17_exceptional_trees", l17),
    ...put("18_other_subtractions", l18),
    ...put("19_total_subtractions", l19),
    "20_hawaii_agi": fmtD(l20),
    ...(itemize ? Object.fromEntries(Object.entries(itemLines).map(([k, v]) => [k, fmtD(v)])) : {}),
    ...(itemize ? { "22_total_itemized_deductions": fmtD(l22) } : {}),
    ...(itemize ? {} : { "23_standard_deduction": fmtD(l23std) }),
    _deduction_method: itemize ? "itemized" : "standard",
    "24_agi_less_deductions": fmtD(l24),
    "25_exemptions": fmtD(l25),
    "26_taxable_income": fmtD(l26),
    "27_tax": fmtD(l27),
    _tax_method: method,
    ...put("27a_net_capital_gain", l27a),
    ...put("28_food_excise_credit", l28),
    ...put("29_renters_credit", l29),
    ...put("30_child_dependent_care_credit", l30),
    ...put("31_child_passenger_restraint_credit", l31),
    ...put("CR8_earned_income_credit", eitc),
    ...put("32_schedule_cr_refundable_credits", l32),
    "33_total_refundable_credits": fmtD(l33),
    "34_adjusted_tax_liability": fmtD(l34),
    ...put("CR12_other_state_credit", osc),
    "35_nonrefundable_credits": fmtD(l35),
    "36_balance": fmtD(l36),
    ...put("37_withholding", l37),
    ...put("38_estimated_payments", l38),
    ...put("39_prior_year_overpayment_applied", l39),
    ...put("40_extension_payment", l40),
    "41_total_payments": fmtD(l41),
    "42_overpaid": fmtD(l42),
    ...put("44_fund_contributions", l44),
    ...put("45_overpaid_less_contributions", l45),
    ...put("46_applied_to_2026", l46),
    "47a_refund": fmtD(l47a),
    "48_amount_owed": fmtD(l48),
    ...put("49_payment_amount", l49),
    ...put("50_estimated_tax_penalty", penalty),
  };
}
