/**
 * 2025 Form RI-1040 line composer (full-year resident; line numbers per the
 * printed form, "Revised 07/2025"). Oracle targets: the line 8 tax (Tax Table
 * under $100,000 / Tax Computation Worksheet at $100,000 or more), the line 4
 * standard deduction and line 6 exemption with their $254,250 phase-outs, the
 * RI Schedule M line 1s Social Security and line 1t pension/annuity
 * modifications, the RI Schedule I child and dependent care credit, the RI
 * Schedule II other-state credit, the RI Schedule EIC earned income credit,
 * the Form RI-1040H property tax relief credit, and the RI Schedule U use tax.
 * Composed here per the printed form: the RI Schedule E exemption count, the
 * RI Schedule M net modification (line 2), lines 1-18, and the RI Checkoff
 * Schedule total.
 *
 * Rhode Island prints ONE rate schedule for every filing status, allows no
 * federal itemized deductions, and has no age-65 or blindness addition.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);

export function composeRI(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Rhode Island Form RI-1040 composer");
  if (typeof input.federalAGI !== "number") throw new Error("federalAGI is required for the Rhode Island Form RI-1040 composer — federal Form 1040 line 11 is RI-1040 line 1");
  const mfj = fs === "mfj";
  const qss = fs === "qss";
  const joint = mfj || qss;
  const mfs = fs === "mfs";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = Math.max(0, (input.dependents as number) ?? 0);
  if (qss) notes.push("RI filing status 'Qualifying widow(er)' — the instructions (p. I-4) direct a federal Qualifying Surviving Spouse to file as Qualifying Widow(er); the $21,800 standard deduction and the $133,750 modification threshold apply, and the rate schedule is the same for every status");

  let unpublished = false;
  const tryEval = (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      unpublished = true;
      notes.push(`RI ${label}: the Division has not published this tax year's inflation-adjusted amounts (${target} has no applicable rule as of this date — they publish in the ~November advisory) — line left blank; re-run once the advisory is out`);
      return null;
    }
  };

  // ---- line 1 ----
  const l1 = D(input.federalAGI);

  // ---- RI Schedule M: modifications DECREASING federal AGI (lines 1a-1y) ----
  const ssBenefits = D(input.riSocialSecurityBenefits);
  const ssTaxable = D(input.taxableSocialSecurity);
  const tpFra = input.riTaxpayerFullRetirementAge === true;
  const spFra = input.riSpouseFullRetirementAge === true;
  const mfjOneSpouseFra = mfj && tpFra !== spFra;
  // Worksheet line 9 has no safe default: assuming the whole of line 6a belongs to the qualifying
  // spouse would exclude ALL the taxable Social Security. Missing -> $0, and say so loudly.
  const fraShare = input.riSocialSecurityBenefitsFraPerson !== undefined ? D(input.riSocialSecurityBenefitsFraPerson) : mfjOneSpouseFra ? 0n : ssBenefits;
  const m1s = ssTaxable > 0n
    ? tryEval("us.ri.social_security_modification", 0n, {
        riFederalAgi: l1,
        riTaxpayerFullRetirementAge: tpFra,
        riSpouseFullRetirementAge: mfj && spFra,
        riSocialSecurityBenefits: ssBenefits,
        riSocialSecurityBenefitsFraPerson: fraShare,
        riTaxableSocialSecurity: ssTaxable,
      }, "Schedule M line 1s") ?? 0n
    : 0n;
  // the rule honors the SPOUSE's full-retirement-age attestation only on a joint return — a
  // qualifying widow(er) has no spouse column, so the reason given must not cite one
  if (ssTaxable > 0n && !tpFra && !(mfj && spFra)) notes.push("RI Schedule M line 1s: no Social Security modification — the worksheet's Step 1 question 5 (born on or before 03/01/1959, i.e. full retirement age) is not attested; pass riTaxpayerFullRetirementAge / riSpouseFullRetirementAge");
  else if (mfjOneSpouseFra && input.riSocialSecurityBenefitsFraPerson === undefined && ssTaxable > 0n) notes.push("RI Social Security Worksheet line 9: only one spouse reached full retirement age, so the modification is prorated by that person's share of the Form 1040 line 6a benefits — riSocialSecurityBenefitsFraPerson was not supplied, so the modification is $0. Pass it to claim the modification");
  else if (ssTaxable > 0n && m1s === 0n && !unpublished) notes.push(`RI Schedule M line 1s: no Social Security modification — federal AGI ${fmtD(l1)} is not LESS THAN the ${fmtD(joint ? 13375000n : 10700000n)} filing-status amount (worksheet line 7; § 44-30-12(c)(8) says "less than", so exactly the threshold does not qualify)`);
  else if (m1s > 0n && mfjOneSpouseFra) notes.push(`RI Schedule M line 1s: only one spouse has reached full retirement age — the modification is the taxable Social Security × the eligible percentage (worksheet lines 8-12, four decimals), ${fmtD(m1s)} of ${fmtD(ssTaxable)}`);
  else if (m1s > 0n) notes.push(`RI Schedule M line 1s: taxable Social Security modification ${fmtD(m1s)} (eligible percentage 1.0000)`);

  const tpPension = D(input.riTaxpayerPensionIncome);
  const spPension = D(input.riSpousePensionIncome);
  const m1t = tpPension + spPension > 0n
    ? tryEval("us.ri.pension_modification", 0n, {
        riFederalAgi: l1,
        riTaxpayerFullRetirementAge: tpFra,
        riSpouseFullRetirementAge: mfj && spFra,
        riTaxpayerPensionIncome: tpPension,
        riSpousePensionIncome: mfj ? spPension : 0n,
      }, "Schedule M line 1t") ?? 0n
    : 0n;
  if (!mfj && spPension > 0n) notes.push("RI Schedule M line 1t: riSpousePensionIncome ignored — the (b) Spouse column of the line 1t table exists only on a joint return (a qualifying widow(er) has no spouse)");
  if (tpPension + spPension > 0n && m1t === 0n && !unpublished) notes.push(`RI Schedule M line 1t: no pension/annuity modification — either no listed person reached full retirement age or federal AGI ${fmtD(l1)} is not less than ${fmtD(joint ? 13375000n : 10700000n)}. NOTE: the booklet's question 2 reads "less than or equal to", but § 44-30-12(c)(9) and the Social Security worksheet both say "less than" — the statute is applied`);
  else if (m1t > 0n) notes.push(`RI Schedule M line 1t: pension and annuity modification ${fmtD(m1t)} — up to $50,000 per qualifying person (Form 1040 line 5b only; NOT IRAs on line 4b, NOT railroad retirement, NOT a military service pension)`);

  const m1d = D(input.riRailroadRetirementBenefits);
  const m1g = min2(D(input.riTuitionSavingsContributions), mfj ? 100000n : 50000n); // "$500 ($1,000 if joint return)"
  if (D(input.riTuitionSavingsContributions) > m1g) notes.push(`RI Schedule M line 1g: tuition savings (§ 529) contributions capped at ${fmtD(mfj ? 100000n : 50000n)} ("Not to exceed $500 ($1,000 if joint return)", regardless of the number of accounts)`);
  const m1v = D(input.riMilitaryServicePension);
  if (m1v > 0n) notes.push(`RI Schedule M line 1v: military service pension ${fmtD(m1v)} subtracted in full (§ 44-30-12(c)(11), 20 C.F.R. § 212.2 — no dollar cap, no age or income test); it must NOT also appear on line 1t`);
  const m1other = D(input.subtractions);
  const decreases = m1s + m1t + m1d + m1g + m1v + m1other;

  // ---- RI Schedule M: modifications INCREASING federal AGI (lines 2a-2m) ----
  const m2a = D(input.riOutOfStateBondInterest);
  const m2k = D(input.riHr1Addback);
  if (m2k > 0n) notes.push(`RI Schedule M line 2k: H.R. 1 (P.L. 119-21) add-back ${fmtD(m2k)} from RI Schedule HR1 - Individual, line 1f (§ 44-30-12(b)(9)) — new for tax year 2025`);
  const m2other = D(input.additions);
  const increases = m2a + m2k + m2other;

  const l2 = increases - decreases;
  notes.push(`RI line 2 (RI Schedule M line 3): net modifications ${fmtD(l2)} — decreases ${fmtD(decreases)} (line 1y), increases ${fmtD(increases)} (line 2m). "If a modification is not listed, it is not an allowable Rhode Island adjustment to Federal AGI."`);

  // ---- lines 3-7 ----
  const l3 = l1 + l2;
  const l4 = rd(evalStateTax("us.ri.standard_deduction", 0n, { riModifiedAgi: l3 }));
  // the un-phased amount for THIS tax year, so the note never quotes a stale threshold
  const l4Full = rd(evalStateTax("us.ri.standard_deduction", 0n, { riModifiedAgi: 0n }));
  if (l4 < l4Full) notes.push(`RI line 4/6: modified federal AGI ${fmtD(l3)} is over this year's phase-out threshold — the Standard Deduction and Exemption Worksheets reduce both amounts by 20 points for each step (or fraction) of the excess; the standard deduction falls from ${fmtD(l4Full)} to ${fmtD(l4)}`);
  notes.push("RI line 4: Rhode Island does not allow the use of federal itemized deductions, and there is no additional standard deduction for age 65 or blindness");

  // RI Schedule E: yourself (unless claimable by another) + spouse on a joint return + dependents
  const selfExemptions = dependentFiler ? 0 : 1;
  // RI Schedule E line 1b: "If filing a joint return, also check the Spouse checkbox" — a
  // qualifying widow(er) files its own status and has no spouse to claim.
  const spouseExemption = mfj && input.riSpouseClaimedAsDependent !== true ? 1 : 0;
  const l6count = selfExemptions + spouseExemption + deps;
  if (dependentFiler) notes.push("RI Schedule E line 1a / line 6: no exemption for yourself — \"If someone else can claim you on their return, your exemption amount is zero\" (§ 44-30-2.6(c)(3)(C)(II))");
  const l6 = rd(evalStateTax("us.ri.exemption", 0n, { riModifiedAgi: l3, riExemptions: l6count }));
  notes.push(`RI line 6 (RI Schedule E line 5): ${l6count} exemption(s) → ${fmtD(l6)}`);
  const l5 = max0(l3 - l4);
  const l7 = max0(l5 - l6);

  // ---- line 8: tax ----
  const useSchedule = input.riUseRateSchedule === true;
  const l8 = rd(evalStateTax("us.ri.income_tax", l7, { riUseRateSchedule: useSchedule }));
  // The Tax Table exists only for a year whose booklet has published (TY2025: all 2,000 rows
  // proved). TY2026's rule applies the schedule at the exact income, so the note must not
  // claim a table that does not exist — it reads the tax year from asOf.
  // Number("") is 0, not NaN — an absent asOf must fall through to the "cannot say" note
  const asOf = (input as { asOf?: string }).asOf;
  const taxYear = typeof asOf === "string" && /^\d{4}/.test(asOf) ? Number(asOf.slice(0, 4)) : NaN;
  const tablePublished = taxYear === 2025;
  notes.push(
    l7 >= 10000000n || useSchedule
      ? `RI line 8: the uniform rate schedule applied at ${fmtD(l7)} — the same schedule for every filing status, one half-up rounding to whole dollars${useSchedule ? " (riUseRateSchedule)" : " (taxable income is $100,000 or more, so the Tax Table does not apply)"}`
      : tablePublished
        ? `RI line 8: Rhode Island Tax Table — the $50 row containing ${fmtD(l7)}, priced at the row midpoint${l7 < 5000n ? "; the printed first row (0 to 50) is $0" : ""}`
        : Number.isNaN(taxYear)
          ? `RI line 8: ${fmtD(l7)} is inside the range the Tax Table covers when one is published, but no asOf was supplied, so this note cannot say whether the table or the schedule produced the tax. Pass asOf (the year-end date) to resolve it`
          : `RI line 8: the uniform rate schedule applied at the exact ${fmtD(l7)}, NOT the Tax Table — the ${taxYear} RI-1040 booklet and its $50 table are not published, so the corpus applies the schedule exactly. Expect at most half a row of divergence from the eventual printed table, and re-run when it publishes`,
  );

  // ---- lines 9a-9d: credits ----
  const l20fed = D(input.riFederalChildCareCredit);
  const l21 = rd((l20fed + 2n) / 4n); // Schedule I line 21: 25% (0.2500)
  // line 22 comes from the rule so the credit has ONE definition
  const l22 = l20fed > 0n ? rd(evalStateTax("us.ri.child_dependent_care_credit", 0n, { riFederalChildCareCredit: l20fed, riIncomeTax: l8 })) : 0n;
  const l9a = l22;
  if (l20fed > 0n) notes.push(`RI Schedule I lines 19-22: 25% of the ${fmtD(l20fed)} federal child and dependent care credit (Form 1040 Schedule 3 line 2) = ${fmtD(l21)}, capped at the ${fmtD(l8)} line 8 tax → ${fmtD(l9a)} (nonrefundable)`);

  const l23 = max0(l8 - l22);
  const otherStateIncome = D(input.riOtherStateIncome);
  const otherStateTax = D(input.riOtherStateTaxPaid);
  const l9b = otherStateIncome > 0n || otherStateTax > 0n
    ? rd(evalStateTax("us.ri.other_state_credit", 0n, { riIncomeTaxAfterFederalCredit: l23, riModifiedAgi: l3, riOtherStateIncome: otherStateIncome, riOtherStateTaxPaid: otherStateTax }))
    : 0n;
  if (l9b > 0n || otherStateTax > 0n) notes.push(`RI Schedule II lines 23-29: the SMALLEST of the ${fmtD(l23)} tax after the Schedule I credit, that tax × (${fmtD(otherStateIncome)} ÷ the ${fmtD(l3)} modified federal AGI, four decimals, capped at 1.0000), and the ${fmtD(otherStateTax)} tax due and paid to the other state → ${fmtD(l9b)}. Attach a copy of the other state's return; more than one state uses Form RI-1040MU`);

  const l9c = D(input.nonrefundableCredits);
  if (l9c > 0n) notes.push("RI line 9c (RI Schedule CR line 9): certificate credits only — \"If the credit you are trying to use is not listed below, that means the credit is no longer allowed as a credit against personal income tax.\" § 44-30-2.6(c)(3)(F) is a closed list");
  const l9d = l9a + l9b + l9c;
  const l10a = max0(l8 - l9d);
  const l10b = D(input.riCreditRecapture);
  const l11 = D(input.riCheckoffContributions);
  if (l11 > 0n) notes.push(`RI line 11 (RI Checkoff Schedule lines 30-38): ${fmtD(l11)} of voluntary contributions — these INCREASE the balance due or reduce the refund`);

  // ---- line 12a: use tax ----
  const useLookup = input.riUseTaxLookupTable === true;
  const purchases = D(input.riUseTaxPurchases);
  const sharedUseTax = D(input.useTax);
  const l12a = sharedUseTax > 0n && !useLookup && purchases === 0n
    ? sharedUseTax
    : useLookup || purchases > 0n
    ? tryEval("us.ri.use_tax", 0n, {
        riFederalAgi: l1,
        riUseTaxLookupTable: useLookup,
        riUseTaxPurchases: purchases,
        riSalesTaxPaidOtherStates: D(input.riSalesTaxPaidOtherStates),
        riLargePurchasesNetUseTax: D(input.riLargePurchasesNetUseTax),
      }, "Schedule U") ?? 0n
    : 0n;
  if (l12a > 0n) notes.push(useLookup
    ? `RI Schedule U lines 5-8: safe-harbor lookup on the ${fmtD(l1)} federal AGI plus the net use tax on each single purchase of $1,000 or more → ${fmtD(l12a)} (§ 44-30-100). The taxpayer must proactively check the line 12a attestation box`
    : `RI Schedule U lines 1-4: 7% of ${fmtD(purchases)} less sales tax paid to other states → ${fmtD(l12a)}. The taxpayer must proactively check the line 12a attestation box`);
  else if (!useLookup && purchases === 0n) notes.push("RI line 12a: $0 use tax assumed — pass riUseTaxPurchases (actual) or riUseTaxLookupTable (the § 44-30-100 safe harbor). The line 12a certification box is the taxpayer's to check");
  const l12b = D(input.riIndividualMandatePenalty);
  const l13a = l10a + l10b + l11 + l12a + l12b;

  // ---- lines 14a-14i: payments and the refundable credits ----
  const l14a = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l14b = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited);
  const hhIncome = D(input.riHouseholdIncome);
  const hhIncomeGiven = input.riHouseholdIncome !== undefined;
  const claims1040H = input.riAge65OrDisabled === true && hhIncomeGiven && (D(input.riPropertyTaxPaid) > 0n || D(input.riRentPaid) > 0n);
  const l14c = claims1040H
    ? tryEval("us.ri.property_tax_relief_credit", 0n, {
        riHouseholdIncome: hhIncome,
        riHouseholdMembers: Math.max(1, (input.riHouseholdMembers as number) ?? 1),
        riAge65OrDisabled: true,
        riPropertyTaxPaid: D(input.riPropertyTaxPaid),
        riRentPaid: D(input.riRentPaid),
        isClaimedAsDependent: dependentFiler,
      }, "Form RI-1040H") ?? 0n
    : 0n;
  if (input.riAge65OrDisabled === true && !hhIncomeGiven && (D(input.riPropertyTaxPaid) > 0n || D(input.riRentPaid) > 0n)) notes.push("RI line 14c: property tax relief credit NOT claimed — Form RI-1040H Part 1 question E requires total household income of $40,730 or less, and riHouseholdIncome was not supplied. Household income is ALL income of ALL household members including non-taxable Social Security, public assistance and pensions (Part 5 line 32) — it is NOT federal AGI, and there is no safe default, so the credit is $0 until it is passed");
  if (claims1040H && l14c > 0n) notes.push(`RI line 14c (Form RI-1040H line 13): property tax relief credit ${fmtD(l14c)} — refundable, maximum $700, household income ${fmtD(hhIncome)} of the $40,730 limit`);
  if (claims1040H && D(input.riPropertyTaxPaid) > 0n && D(input.riRentPaid) > 0n) notes.push("RI Form RI-1040H: both property tax and rent were passed — the composer adds 20% of the rent to the property tax (the form's own rule for rented LAND). A homeowner who separately rents another dwelling completes Part 3 OR Part 4, line 13 being \"line 6 or line 12, whichever applies\" — check which part applies");
  if (input.riAge65OrDisabled === true && !claims1040H) notes.push("RI line 14c: no property tax relief credit computed — pass riPropertyTaxPaid or riRentPaid (Form RI-1040H must be filed by April 15, 2026 regardless of any extension)");

  const federalEic = D(input.federalEITC);
  const l14d = federalEic > 0n ? rd(evalStateTax("us.ri.eitc", 0n, { riFederalEic: federalEic })) : 0n;
  if (l14d > 0n) notes.push(`RI line 14d (RI Schedule EIC lines 39-41): 16% of the ${fmtD(federalEic)} federal earned income credit → ${fmtD(l14d)}, fully refundable (§ 44-30-2.6(c)(2)(N))`);
  const l14e = D(input.riLeadPaintCredit);
  if (l14e > 0n) notes.push("RI line 14e (Form RI-6238 line 7): residential lead abatement credit — refundable, but the program is capped at $250,000 statewide per year and lower-priority claimants are paid proportionately from whatever remains, so the amount actually received can be less. Maximums are $5,000 per unit for removal/abatement and $1,500 for reduction/mitigation, up to three units; the form is due April 15, 2026");
  const l14f = D(input.refundableCredits) + D(input.extensionPayment);
  if (D(input.extensionPayment) > 0n) notes.push(`RI line 14f: ${fmtD(D(input.extensionPayment))} paid with Form RI-4868 is included in "Other payments"`);
  const l14g = l14a + l14b + l14c + l14d + l14e + l14f;
  const l14h = D(input.riPreviouslyIssuedOverpayment);
  const l14i = l14g - l14h;

  // ---- lines 15-18 ----
  const l15b = D(input.riUnderestimatingInterest);
  // "This amount should be added to line 15a or subtracted from line 16, whichever applies" —
  // net line 15b in BEFORE choosing the branch, or interest above the overpayment disappears.
  const net = l13a + l15b - l14i;
  const due = net > 0n;
  const l15a = due ? max0(l13a - l14i) : 0n;
  const l15c = due ? net : 0n;
  // Printed line 16: "If line 14i is LARGER than line 13b, subtract line 13b from line 14i. If
  // there is an amount due for underestimating interest on line 15b, subtract line 15b from
  // line 16." — so the PRINTED line 16 is net of 15b, and lines 17 + 18 reconcile to it.
  // When the interest exceeds the overpayment the return is DUE: line 16 then keeps the gross
  // overpayment and booklet p. I-6 makes 15c = 15b − 16 (see `net` above).
  const l16 = due ? max0(l14i - l13a) : max0(l14i - l13a - l15b);
  const applied = min2(D(input.riAppliedToNextYear), l16);
  const l18 = due ? 0n : applied;
  const l17 = due ? 0n : l16 - l18;
  if (!due && l15b > 0n) notes.push(`RI line 15b: ${fmtD(l15b)} of underestimating interest (Form RI-2210/RI-2210A) is subtracted in arriving at line 16 — the gross overpayment is ${fmtD(l14i - l13a)} and the printed line 16 is net of it ("If there is an amount due for underestimating interest on line 15b, subtract line 15b from line 16")`);
  if (due) notes.push(`RI line 15c: total amount due ${fmtD(l15c)} — file Form RI-1040V with the payment`);
  else notes.push(`RI line 16: overpayment ${fmtD(l16)}${l18 > 0n ? `, ${fmtD(l18)} applied to 2026 estimated tax` : ""} — refund ${fmtD(l17)}`);

  const out: Record<string, string> = {
    "1_federal_agi": fmtD(l1),
    "2_net_modifications": fmtD(l2),
    "3_modified_federal_agi": fmtD(l3),
    "4_standard_deduction": fmtD(l4),
    "5_agi_less_deduction": fmtD(l5),
    "6_exemptions": fmtD(l6),
    "7_ri_taxable_income": fmtD(l7),
    "8_ri_income_tax": fmtD(l8),
    "9a_allowable_federal_credit": fmtD(l9a),
    "9b_other_state_credit": fmtD(l9b),
    "9c_other_ri_credits": fmtD(l9c),
    "9d_total_credits": fmtD(l9d),
    "10a_tax_after_credits": fmtD(l10a),
    "10b_recapture": fmtD(l10b),
    "11_checkoff_contributions": fmtD(l11),
    "12a_use_tax": fmtD(l12a),
    "12b_individual_mandate_penalty": fmtD(l12b),
    "13a_total_tax_and_checkoffs": fmtD(l13a),
    "13b_total_tax_and_checkoffs": fmtD(l13a),
    "14a_ri_withholding": fmtD(l14a),
    "14b_estimated_payments": fmtD(l14b),
    "14c_property_tax_relief_credit": fmtD(l14c),
    "14d_ri_earned_income_credit": fmtD(l14d),
    "14e_lead_paint_credit": fmtD(l14e),
    "14f_other_payments": fmtD(l14f),
    "14g_total_payments_and_credits": fmtD(l14g),
    "14h_previously_issued_overpayments": fmtD(l14h),
    "14i_net_payments": fmtD(l14i),
    "15a_amount_due": fmtD(l15a),
    "15b_underestimating_interest": fmtD(l15b),
    "15c_total_amount_due": fmtD(l15c),
    "16_amount_overpaid": fmtD(l16),
    "17_refund": fmtD(l17),
    "18_applied_to_2026": fmtD(l18),
  };
  // RI Schedule M / Schedule I / Schedule II detail lines the return itself prints
  out["M_1s_social_security_modification"] = fmtD(m1s);
  out["M_1t_pension_modification"] = fmtD(m1t);
  out["M_1y_total_decreasing"] = fmtD(-decreases);
  out["M_2m_total_increasing"] = fmtD(increases);
  out["I_21_tentative_federal_credit"] = fmtD(l21);
  out["I_22_maximum_credit"] = fmtD(l22);
  out["II_23_tax_less_federal_credit"] = fmtD(l23);
  out["E_5_total_exemptions"] = String(l6count);
  return out;
}
