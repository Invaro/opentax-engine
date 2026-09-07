/**
 * 2025 New Mexico Form PIT-1 line composer (resident; line numbers per the
 * printed form). The rate-table tax, the SALT add-back worksheet, the
 * dependents deduction, the low- and middle-income exemption, the 65+/blind
 * exemption, the Social Security exemption, the capital gains deduction, the
 * armed forces retirement exemption, the 65+ medical exemption and credit,
 * the LICTR, the working families tax credit, the child income tax credit,
 * and the two property tax rebates are oracle targets. Composed here per the
 * printed form: the line 5 exemption count, the PIT-ADJ totals, line 17, the
 * line 19 lump-sum averaging worksheet, the line 20 other-state credit
 * worksheet, the PIT-CR cap, the PIT-RC total (with the child day care and
 * special needs adopted child credits), and the lines 27-42 payment, due, and
 * refund chain. A federal QSS is a New Mexico "surviving spouse".
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));
const isNoApplicableRule = (err: unknown): boolean => err instanceof Error && /no applicable rule/i.test(err.message);
const half = (x: Cents): Cents => rd((x + 1n) / 2n); // ÷ 2, half-up to whole dollars (x is whole-dollar cents)

export function composeNM(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the New Mexico PIT-1 composer");
  if (typeof input.nmFederalDeduction !== "number") throw new Error("nmFederalDeduction is required for the New Mexico PIT-1 composer — Form 1040 line 12 (the federal standard or itemized deduction) is PIT-1 line 12");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = (input.dependents as number) ?? 0;
  const age65 = Math.min((input.nmAge65Count as number) ?? 0, mfj ? 2 : 1);
  const blind = Math.min((input.nmBlindCount as number) ?? 0, mfj ? 2 : 1);
  let age65OrBlind: number;
  if (typeof input.nmAge65OrBlindPersons === "number") age65OrBlind = Math.min(input.nmAge65OrBlindPersons, mfj ? 2 : 1);
  else {
    // one exemption per PERSON: a taxpayer who is both 65 and blind counts once; a 65-year-old taxpayer and a blind spouse count twice
    age65OrBlind = Math.min(age65 + blind, mfj ? 2 : 1);
    if (age65 > 0 && blind > 0) notes.push(`NM PIT-ADJ line 13: nmAge65OrBlindPersons not given — assumed the ${age65} person(s) 65 or older and the ${blind} blind person(s) are different people (${age65OrBlind} exemption(s)); 'The Department allows only one deduction per person. You cannot take deductions for being both 65 or older and blind' — pass nmAge65OrBlindPersons if the same person is both`);
  }
  const nmStatus = { single: "1", mfj: "2", mfs: "3", hoh: "4", qss: "5" }[fs] ?? "1";
  if (fs === "qss") notes.push("NM filing status (5) Surviving Spouse: a federal QSS uses the married-filing-jointly rate column, the joint low- and middle-income and 65+/blind tables, and the $150,000 Social Security limit — but NOT the $4,000 deduction for certain dependents (§ 7-2-39 names only head of household and married filing jointly)");
  if (mfs) notes.push("NM filing status (3) Married filing separately: the LICTR, property tax rebates, child day care credit, medical care credit, special needs adopted child credit, and child income tax credit are each one-half of the joint amount (each half rounded up independently, so the two returns can total $1 more than a joint claim); the capital gains caps are halved; PIT-RC line 2h — pass nmSpouseRebateExemptionsClaimed for the exemptions your spouse already claimed on their PIT-RC line 2g; New Mexico is a community property state — divide community income and payments 50/50 unless a statement shows otherwise");

  // ---- line 5: exemptions ----
  // the CPI-adjusted PIT-RC tables (LICTR, child income tax credit) are published each fall; before then a TY2026 evaluation has no applicable rule — leave the line blank and say so
  const tryEval = (target: string, base: Cents, extra: Record<string, Cents | boolean | number | string>, label: string): Cents | null => {
    try {
      return rd(evalStateTax(target, base, extra));
    } catch (err) {
      if (!isNoApplicableRule(err)) throw err;
      notes.push(`NM ${label}: the inflation-adjusted table for this tax year has not been published by TRD (${target} has no applicable rule as of this date) — line left blank; re-run when the PIT-RC instructions are out`);
      return null;
    }
  };
  const l5 = dependentFiler ? 0 : 1 + (mfj ? 1 : 0) + deps;
  if (dependentFiler) notes.push("NM line 5: '00' — a filer who can be claimed as another taxpayer's dependent has no exemptions, no low- and middle-income exemption, no dependents deduction, and no PIT-RC rebates or child income tax credit");

  // ---- lines 9-17: New Mexico taxable income ----
  const l9 = rd(c(input.federalAGI));
  const itemized = input.nmFederalItemized === true;
  const l12 = D(input.nmFederalDeduction);
  let l10 = 0n;
  if (itemized) {
    if (typeof input.nmSaltTotal !== "number" || typeof input.nmSaltIncomeTaxes !== "number" || typeof input.nmSaltAllowed !== "number" || typeof input.nmFederalStandardDeduction !== "number")
      notes.push("NM line 10: you itemized federally but the worksheet inputs (nmSaltIncomeTaxes = Schedule A 5a, nmSaltTotal = 5d, nmSaltAllowed = 5e, nmFederalStandardDeduction) are incomplete — the state and local tax add-back is composed from what was given; a missing input is treated as $0");
    l10 = rd(
      evalStateTax("us.nm.salt_addback", 0n, {
        nmFederalItemized: true,
        nmSaltIncomeTaxes: c(input.nmSaltIncomeTaxes),
        nmSaltTotal: c(input.nmSaltTotal),
        nmSaltAllowed: c(input.nmSaltAllowed),
        nmFederalStandardDeduction: c(input.nmFederalStandardDeduction),
        nmFederalItemizedDeductions: l12,
      }),
    );
    notes.push(`NM line 10: state and local tax add-back ${fmtD(l10)} — Schedule A line 5a income taxes prorated by 5e ÷ 5d and limited to the excess of the ${fmtD(l12)} itemized deductions over the ${fmtD(D(input.nmFederalStandardDeduction))} standard deduction (§ 7-2-2(N)(2))`);
  }
  const l11 = D(input.additions);
  if (l11 > 0n) notes.push(`NM line 11 (PIT-ADJ lines 1-5): additions ${fmtD(l11)} transcribed (federal tax-exempt bond interest, federal NOL carryover, refunded/rolled-out NM 529 contributions, land-conservation charitable deduction, PTE withholding paid)`);
  const l13 = rd(evalStateTax("us.nm.dependents_deduction", 0n, { nmDependents: deps, isClaimedAsDependent: dependentFiler }));
  if (l13 > 0n) notes.push(`NM line 13: deduction for certain dependents ${fmtD(l13)} = $4,000 × (${deps} dependents − 1) (§ 7-2-39; head of household or married filing jointly only)`);
  else if (deps > 1 && !dependentFiler && !mfj && fs !== "hoh") notes.push(`NM line 13: no deduction for certain dependents — § 7-2-39 allows it only to a head of household or married-filing-jointly filer (status ${nmStatus} composed)`);
  const l14 = rd(evalStateTax("us.nm.low_middle_income_exemption", 0n, { nmAgi: l9, nmExemptions: l5 }));
  if (l14 > 0n) notes.push(`NM line 14: low- and middle-income exemption ${fmtD(l14)} for ${l5} exemption(s) at AGI ${fmtD(l9)} (§ 7-2-5.8 phase-down)`);

  // PIT-ADJ deductions and exemptions (line 15)
  const adj: Record<string, Cents> = {};
  const taxableSs = D(input.taxableSocialSecurity);
  adj["25_social_security"] = taxableSs > 0n ? rd(evalStateTax("us.nm.social_security_exemption", 0n, { nmAgi: l9, nmTaxableSocialSecurity: taxableSs })) : 0n;
  if (taxableSs > 0n) notes.push(adj["25_social_security"] > 0n ? `NM PIT-ADJ line 25: Social Security exemption ${fmtD(adj["25_social_security"])} (AGI ${fmtD(l9)} within the § 7-2-5.14 limit)` : `NM PIT-ADJ line 25: no Social Security exemption — AGI ${fmtD(l9)} exceeds the § 7-2-5.14 limit ($100,000 single / $75,000 MFS / $150,000 MFJ, HOH, surviving spouse); it is a cliff`);
  adj["13_age65_blind"] = age65OrBlind > 0 ? rd(evalStateTax("us.nm.age65_blind_exemption", 0n, { nmAgi: l9, nmAge65OrBlindPersons: age65OrBlind })) : 0n;
  if (age65OrBlind > 0) notes.push(`NM PIT-ADJ line 13: exemption for persons 65 or older or blind ${fmtD(adj["13_age65_blind"])} for ${age65OrBlind} person(s) at AGI ${fmtD(l9)} (Table 1; one per person; mark boxes 1c/1d/2c/2d or the Department denies it)`);
  const ncg = c(input.nmNetCapitalGain);
  const biz = c(input.nmBusinessSaleGain);
  adj["16_capital_gains"] = ncg > 0n || biz > 0n ? rd(evalStateTax("us.nm.capital_gains_deduction", 0n, { nmNetCapitalGain: ncg, nmBusinessSaleGain: biz })) : 0n;
  if (adj["16_capital_gains"] > 0n) notes.push(`NM PIT-ADJ line 16: net capital gains deduction ${fmtD(adj["16_capital_gains"])} — the greater of the net capital gain up to $2,500 or 40% of up to $1,000,000 of New Mexico business-sale gain (§ 7-2-34 as amended for 2025${mfs ? "; MFS caps halved" : ""})`);
  const afr = c(input.nmArmedForcesRetirementPay);
  const afrS = mfj ? c(input.nmArmedForcesRetirementPaySpouse) : 0n;
  if (!mfj && c(input.nmArmedForcesRetirementPaySpouse) > 0n) notes.push("NM PIT-ADJ line 24: nmArmedForcesRetirementPaySpouse ignored — only a joint return has a spouse's $30,000");
  adj["24_armed_forces_retirement"] = afr > 0n || afrS > 0n ? rd(evalStateTax("us.nm.armed_forces_retirement_exemption", 0n, { nmArmedForcesRetirementPay: afr, nmArmedForcesRetirementPaySpouse: afrS })) : 0n;
  if (adj["24_armed_forces_retirement"] > 0n) notes.push(`NM PIT-ADJ line 24: armed forces retirement pay exemption ${fmtD(adj["24_armed_forces_retirement"])} ($30,000 per retiree or surviving spouse of a retiree)`);
  const medical = c(input.nmMedicalExpenses);
  adj["18_medical_65"] = medical > 0n ? rd(evalStateTax("us.nm.medical_expense_exemption_65", 0n, { nmAge65Count: age65, nmMedicalExpenses: medical })) : 0n;
  if (medical > 0n && adj["18_medical_65"] === 0n) notes.push(`NM PIT-ADJ line 18: no $3,000 medical care expense exemption — needs a taxpayer 65 or older (nmAge65Count) and $28,000 or more of unreimbursed medical care expenses (${fmtD(rd(medical))} given)`);
  const other = D(input.subtractions);
  if (other > 0n) notes.push(`NM PIT-ADJ other deductions and exemptions ${fmtD(other)} transcribed (lines 7 NM-exempt interest, 8 NM NOL, 9 U.S. obligation interest, 10 Railroad Retirement, 11 tribal-land income, 12 centenarians, 14 NM medical savings account, 15 NM 529 contributions, 17 active-duty pay, 19 organ donation ≤ $10,000, 20 National Guard reimbursement, 21 taxable state refunds, 22 nonresident USPHS pay, 23 liquor license lessor, 26 cannabis § 280E, 27 teacher supplies ≤ $1,000)`);
  const l15 = adj["25_social_security"] + adj["13_age65_blind"] + adj["16_capital_gains"] + adj["24_armed_forces_retirement"] + adj["18_medical_65"] + other;
  const l17raw = l9 + l10 + l11 - l12 - l13 - l14 - l15;
  const l17 = max0(l17raw);
  if (l17raw < 0n) notes.push(`NM line 17: deductions and exemptions exceed income by ${fmtD(-l17raw)} — taxable income is $0 ('Cannot be less than zero')`);

  // ---- lines 18-22: tax and nonrefundable credits ----
  const tax = (base: Cents): Cents => rd(evalStateTax("us.nm.income_tax", max0(base)));
  const l18 = tax(l17);
  let l19 = 0n;
  const lump = D(input.nmLumpSumAmount);
  if (lump > 0n) {
    // Line 19 worksheet: 5 × (tax on line 17 + 20% of the lump sum − tax on line 17) — § 7-2-7(D)
    const l19_3 = rd((lump * 20n + 50n) / 100n);
    l19 = (tax(l17 + l19_3) - l18) * 5n;
    notes.push(`NM line 19: lump-sum distribution averaging tax ${fmtD(l19)} = 5 × (tax on ${fmtD(l17 + l19_3)} − tax on ${fmtD(l17)}) for the ${fmtD(lump)} Form 4972 distribution`);
  }
  let l20 = 0n;
  const osTax = D(input.nmOtherStateTax);
  const osTaxable = D(input.nmOtherStateTaxableIncome);
  const dual = D(input.nmIncomeTaxedByBothStates);
  if (osTax > 0n && dual > 0n) {
    if (l17 > 0n && osTaxable > 0n) {
      // Line 20 worksheet: average effective rates to four decimals × the income taxed in both states, lesser of the two columns, not more than the New Mexico tax
      const rate4 = (t: Cents, inc: Cents): bigint => (t * 10000n * 2n + inc) / (2n * inc); // round half-up to 4 decimals (×10,000)
      const rNM = rate4(l18, l17);
      const rOS = rate4(osTax, osTaxable);
      const dualNM = min2(dual, l17);
      const dualOS = min2(dual, osTaxable);
      const col1 = rd((dualNM * rNM + 5000n) / 10000n);
      const col2 = rd((dualOS * rOS + 5000n) / 10000n);
      l20 = min2(min2(col1, col2), l18);
      notes.push(`NM line 20: credit for taxes paid to another state ${fmtD(l20)} — lesser of New Mexico's average rate ${(Number(rNM) / 10000).toFixed(4)} × ${fmtD(dualNM)} = ${fmtD(col1)} and the other state's ${(Number(rOS) / 10000).toFixed(4)} × ${fmtD(dualOS)} = ${fmtD(col2)}, not more than the ${fmtD(l18)} New Mexico tax; attach the worksheet and the other state's return (no credit for city or county taxes)`);
    } else notes.push("NM line 20: other-state credit not computed — New Mexico taxable income or the other state's taxable income is $0");
  }
  const roomForCr = max0(l18 + l19 - l20);
  const l21 = min2(D(input.nonrefundableCredits), roomForCr);
  if (D(input.nonrefundableCredits) > l21) notes.push(`NM line 21: PIT-CR credits ${fmtD(D(input.nonrefundableCredits))} limited to ${fmtD(l21)} — 'The sum of credits claimed on this PIT-CR and the credit for taxes paid to another state … may not exceed the sum of PIT-1, lines 18 and 19'`);
  else if (l21 > 0n) notes.push(`NM line 21: business-related credits applied ${fmtD(l21)} (PIT-CR line A, transcribed)`);
  const l22 = max0(l18 + l19 - l20 - l21);

  // ---- PIT-RC (line 24) ----
  const rc: Record<string, Cents> = {};
  const mgiGiven = typeof input.nmModifiedGrossIncome === "number";
  const mgi = D(input.nmModifiedGrossIncome);
  if (mgiGiven && mgi < l9) notes.push(`NM PIT-RC line 12: modified gross income ${fmtD(mgi)} is below federal AGI ${fmtD(l9)} — the form requires 'Total must equal or exceed Federal Adjusted Gross Income'`);
  const rebateEx = Math.max(0, l5 - ((input.nmNonQualifyingHouseholdMembers as number) ?? 0) + blind + 2 * age65 - (mfs ? ((input.nmSpouseRebateExemptionsClaimed as number) ?? 0) : 0));
  if (mgiGiven && !dependentFiler) {
    const lictr = tryEval("us.nm.lictr", 0n, { nmModifiedGrossIncome: mgi, nmRebateExemptions: rebateEx, isClaimedAsDependent: false }, "low income comprehensive tax rebate (PIT-RC line 14)");
    if (lictr !== null) rc["14_lictr"] = lictr;
    if ((rc["14_lictr"] ?? 0n) > 0n) notes.push(`NM PIT-RC line 14: low income comprehensive tax rebate ${fmtD(rc["14_lictr"])} (MGI ${fmtD(mgi)}, ${rebateEx} rebate exemption(s) = ${l5} + 2 per 65+ + 1 per blind${mfs ? "; half for MFS" : ""}) — requires residency, six months' physical presence, and no more than six months as an inmate`);
    const ptax = D(input.nmPropertyTaxBilled);
    const rent = D(input.nmRentPaid);
    if (age65 > 0 && (ptax > 0n || rent > 0n)) {
      rc["17c_property_tax_rebate_65"] = rd(evalStateTax("us.nm.property_tax_rebate_65", 0n, { nmModifiedGrossIncome: mgi, nmPropertyTaxBilled: ptax, nmRentPaid: rent, nmAge65Count: age65, isClaimedAsDependent: false }));
      if (rc["17c_property_tax_rebate_65"] > 0n) notes.push(`NM PIT-RC line 17c: property tax rebate for persons 65 or older ${fmtD(rc["17c_property_tax_rebate_65"])} (property tax ${fmtD(ptax)} + 6% of rent ${fmtD(rent)} over the Table 2 liability for MGI ${fmtD(mgi)}; cap $250${mfs ? ", $125 MFS" : ""})`);
      else if (mgi > 1600000n) notes.push(`NM PIT-RC Section 3: no 65+ property tax rebate — MGI ${fmtD(mgi)} exceeds $16,000`);
    }
    if (input.nmRebateCounty === true && ptax > 0n) {
      rc["18c_county_rebate"] = rd(evalStateTax("us.nm.county_property_tax_rebate", 0n, { nmModifiedGrossIncome: mgi, nmPropertyTaxBilled: ptax, nmRebateCounty: true, isClaimedAsDependent: false }));
      if (rc["18c_county_rebate"] > 0n) notes.push(`NM PIT-RC line 18c: additional low income property tax rebate ${fmtD(rc["18c_county_rebate"])} (Los Alamos / Santa Fe / Doña Ana / Bernalillo County; Table 3 percentage of ${fmtD(ptax)}; cap $350${mfs ? ", $175 MFS" : ""}; mark the county box)`);
      else notes.push(`NM PIT-RC Section 4: no county rebate — MGI ${fmtD(mgi)} exceeds $24,000`);
    }
    const dayCare = D(input.nmChildDayCareWorksheet);
    if (dayCare > 0n) {
      if (mgi <= 3016000n) {
        const l19rc = min2(dayCare, 120000n);
        const l22rc = max0(l19rc - D(input.nmFederalChildCareCredit));
        rc["22_child_day_care_credit"] = mfs ? half(l22rc) : l22rc;
        notes.push(`NM PIT-RC line 22: child day care credit ${fmtD(rc["22_child_day_care_credit"])} — worksheet total ${fmtD(dayCare)} capped at $1,200 (${fmtD(l19rc)}) less the ${fmtD(D(input.nmFederalChildCareCredit))} federal credit${mfs ? ", halved for MFS" : ""}; needs a New Mexico caregiver's PIT-CG for each provider and gainful employment (both spouses if joint)`);
      } else notes.push(`NM PIT-RC Section 5: no child day care credit — MGI ${fmtD(mgi)} exceeds $30,160`);
    }
  } else if (!dependentFiler && (c(input.nmPropertyTaxBilled) > 0n || c(input.nmRentPaid) > 0n || c(input.nmChildDayCareWorksheet) > 0n || l9 <= 3600000n)) {
    notes.push("NM PIT-RC Sections 2-5 skipped: nmModifiedGrossIncome (PIT-RC line 12 — all income of the household, taxable or not) was not given, so the LICTR, property tax rebates, and child day care credit could not be evaluated");
  }
  if (!dependentFiler) {
    if (medical > 0n && age65 > 0) {
      rc["23_medical_credit_65"] = rd(evalStateTax("us.nm.medical_care_credit_65", 0n, { nmAge65Count: age65, nmMedicalExpenses: medical, isClaimedAsDependent: false }));
      if (rc["23_medical_credit_65"] > 0n) notes.push(`NM PIT-RC line 23: refundable medical care credit for persons 65 or older ${fmtD(rc["23_medical_credit_65"])} (§ 7-2-18.13; expenses ${fmtD(rd(medical))} ≥ $28,000)`);
    }
    const sn = (input.nmSpecialNeedsAdoptedChildren as number) ?? 0;
    if (sn > 0) {
      rc["24_special_needs_adopted"] = BigInt(sn) * (mfs ? 75000n : 150000n);
      notes.push(`NM PIT-RC line 24: special needs adopted child tax credit ${fmtD(rc["24_special_needs_adopted"])} = ${sn} × ${mfs ? "$750" : "$1,500"} (CYFD certificate in the first year)`);
    }
    const kids = (input.nmQualifyingChildren as number) ?? 0;
    if (kids > 0) {
      const cc = tryEval("us.nm.child_income_tax_credit", 0n, { nmAgi: l9, nmQualifyingChildren: kids, isClaimedAsDependent: false }, "child income tax credit (PIT-RC line 25)");
      if (cc !== null) rc["25_child_income_tax_credit"] = cc;
      if (cc !== null) notes.push(`NM PIT-RC line 25: child income tax credit ${fmtD(rc["25_child_income_tax_credit"])} for ${kids} qualifying child(ren) at AGI ${fmtD(l9)} (2025 Table 4${mfs ? "; half for MFS" : ""})`);
    }
  }
  const l24 = Object.values(rc).reduce((a, b) => a + b, 0n);

  // ---- lines 25-32: refundable credits and payments ----
  const fedEic = D(input.federalEITC);
  const expansion = D(input.nmExpansionEic);
  const eicBase = fedEic > 0n ? fedEic : expansion;
  const l25 = eicBase > 0n ? rd(evalStateTax("us.nm.working_families_credit", 0n, { nmFederalEic: eicBase })) : 0n;
  if (l25 > 0n) notes.push(`NM line 25: working families tax credit ${fmtD(l25)} = 25% of the ${fmtD(eicBase)} ${fedEic > 0n ? "federal EIC (line 25a)" : "EIC computed under the NM Expansion (mark box 25b)"}; refundable`);
  const l26 = D(input.refundableCredits);
  if (l26 > 0n) notes.push(`NM line 26: refundable business-related credits ${fmtD(l26)} (PIT-CR line B, transcribed)`);
  const l27 = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l28 = D(input.nmOilGasWithholding);
  const l29 = D(input.nmPteWithholding);
  const l30 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited);
  const l31 = D(input.extensionPayment);
  const l32 = l24 + l25 + l26 + l27 + l28 + l29 + l30 + l31;

  // ---- lines 33-42 ----
  const l33 = max0(l22 - l32);
  const l34 = D(input.nmUnderpaymentPenalty);
  const l36 = D(input.nmLatePenalty);
  const l37 = D(input.nmInterest);
  const penalties = l34 + l36 + l37;
  const overpay = max0(l32 - l22);
  // "If you have penalty or interest due from lines 34, 36, or 37, reduce your overpayment by the sum" — a penalty larger than the overpayment leaves a balance due
  const l39 = max0(overpay - penalties);
  const l38 = l33 > 0n ? l33 + penalties : max0(penalties - overpay);
  if (overpay > 0n && penalties > 0n) notes.push(`NM line 39: overpayment ${fmtD(overpay)} reduced by penalty and interest ${fmtD(penalties)}${l38 > 0n ? ` — the ${fmtD(l38)} excess is due on line 38` : " (line 38 is $0: the amounts are netted here, not also due)"}`);
  const l40 = min2(D(input.nmContributions), l39);
  const l41 = min2(D(input.nmCreditForward), l39 - l40);
  const l42 = l39 - l40 - l41;
  if (l42 > 0n && l42 <= 100n) notes.push("NM line 42: a refund of $1 or less is not issued unless you attach a signed statement asking for it");
  if (l33 > 0n && l34 === 0n) notes.push(`NM line 34: tax due ${fmtD(l33)} — check the underpayment-of-estimated-tax penalty (§ 7-2-12.2: the required annual payment is the lesser of 90% of this year's tax or 100% of last year's; RPD-41272)`);

  notes.push("NM scope: Form PIT-1 is composed for a full-year RESIDENT using the rate tables (line 18a = R) — part-year and nonresidents allocate on Schedule PIT-B (18a = B), not composed; the PIT-RC rebates assume the filer was a resident, physically present in New Mexico at least six months, and not an inmate more than six months (Section 1 boxes A-D); New Mexico has no local income taxes; PIT-ADJ transcribed lines, PIT-CR, PIT-D, and the underpayment penalty are inputs");

  const put = (k: string, v: Cents, always = false): Record<string, string> => (always || v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    _filing_status: nmStatus,
    "5_exemptions": String(l5),
    "9_federal_agi": fmtD(l9),
    ...put("10_salt_addback", l10),
    ...put("11_additions", l11),
    "12_federal_deduction": fmtD(l12),
    ...(itemized ? { "12a_itemized": "X" } : {}),
    ...put("13_dependents_deduction", l13),
    ...put("14_low_middle_income_exemption", l14),
    ...put("ADJ13_age65_blind_exemption", adj["13_age65_blind"]),
    ...put("ADJ16_capital_gains_deduction", adj["16_capital_gains"]),
    ...put("ADJ18_medical_exemption_65", adj["18_medical_65"]),
    ...put("ADJ24_armed_forces_retirement", adj["24_armed_forces_retirement"]),
    ...put("ADJ25_social_security_exemption", adj["25_social_security"]),
    ...put("15_deductions_exemptions", l15),
    "17_taxable_income": fmtD(l17),
    "18_tax": fmtD(l18),
    "18a_rate_table_indicator": "R",
    ...put("19_lump_sum_tax", l19),
    ...put("20_other_state_credit", l20),
    ...put("21_business_credits_applied", l21),
    "22_net_tax": fmtD(l22),
    ...put("RC14_lictr", rc["14_lictr"] ?? 0n),
    ...put("RC17c_property_tax_rebate_65", rc["17c_property_tax_rebate_65"] ?? 0n),
    ...put("RC18c_county_property_tax_rebate", rc["18c_county_rebate"] ?? 0n),
    ...put("RC22_child_day_care_credit", rc["22_child_day_care_credit"] ?? 0n),
    ...put("RC23_medical_care_credit_65", rc["23_medical_credit_65"] ?? 0n),
    ...put("RC24_special_needs_adopted_child_credit", rc["24_special_needs_adopted"] ?? 0n),
    ...put("RC25_child_income_tax_credit", rc["25_child_income_tax_credit"] ?? 0n),
    ...put("24_rebates_and_credits", l24),
    ...put("25_working_families_credit", l25),
    ...put("26_refundable_business_credits", l26),
    ...put("27_withholding", l27),
    ...put("28_oil_gas_withholding", l28),
    ...put("29_pte_withholding", l29),
    ...put("30_estimated_payments", l30),
    ...put("31_other_payments", l31),
    "32_total_payments_credits": fmtD(l32),
    "33_tax_due": fmtD(l33),
    ...put("34_underpayment_penalty", l34),
    ...put("36_penalty", l36),
    ...put("37_interest", l37),
    "38_total_due": fmtD(l38),
    "39_overpayment": fmtD(l39),
    ...put("40_contributions", l40),
    ...put("41_credit_forward", l41),
    "42_refund": fmtD(l42),
  };
}
