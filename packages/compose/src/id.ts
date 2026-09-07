/**
 * 2025 Idaho Form 40 line composer (full-year resident; line numbers per the
 * printed form EFO00089). Oracle targets: the line 20 tax worksheet, the
 * standard and itemized deductions, the Form 39R retirement, child care,
 * health, long-term care, alternative energy, and capital gains deductions,
 * the other-state credit (Part C), the three Part D credits, the $205 child
 * tax credit, the $10 permanent building fund tax, the Food Tax Credit, the
 * maintaining-a-home credit, and the use tax. Composed here per the printed
 * form: the line 6 household count, the Part A/B totals with their statutory
 * caps (adoption $10,000, MSA $10,000/$20,000, IDeal $6,000/$12,000, first-time
 * home buyer $15,000/$30,000, home for the aged $1,000 × 3), the line 17
 * larger-of, the credit order 21-26, other taxes 27-32, donations, payments
 * 42-50, and the lines 51-56 due/refund chain.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

const D = (x: unknown): Cents => rd(c(x));

export function composeID(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Idaho Form 40 composer");
  const mfj = fs === "mfj";
  const mfs = fs === "mfs";
  const dependentFiler = input.claimedAsDependent === true;
  const deps = (input.dependents as number) ?? 0;
  const boxes = Math.min((input.ageOrBlindBoxes as number) ?? 0, 4);
  if (dependentFiler && typeof input.idEarnedIncome !== "number")
    throw new Error("idEarnedIncome is required when claimedAsDependent — the Idaho standard deduction for a dependent filer is the larger of $1,350 or earned income + $450 (Standard Deduction Worksheet line 3)");
  if (fs === "hoh" || fs === "qss") notes.push(`ID filing status: a federal ${fs === "hoh" ? "head of household" : "qualifying surviving spouse"} uses the $9,622 joint threshold on the line 20 worksheet (§ 63-3024(2)(b)) with the ${fs === "hoh" ? "$23,625" : "$31,500"} standard deduction`);
  if (mfs) notes.push("ID married filing separately: the $4,811 threshold and $15,750 deduction apply; the retirement benefits deduction is not allowed; you must itemize if your spouse itemizes; the filing threshold is $5");

  // ---- line 6: household ----
  const l6a = dependentFiler ? 0 : 1;
  const l6b = mfj ? 1 : 0;
  const l6d = l6a + l6b + deps;

  // ---- lines 7-11: income and Form 39R adjustments ----
  const l7 = rd(c(input.federalAGI));
  const addNol = D(input.idFederalNolDeduction);
  const addBond = D(input.idNonIdahoBondInterest);
  const addOther = D(input.additions);
  const l8 = addNol + addBond + addOther;
  if (l8 > 0n) notes.push(`ID line 8 (Form 39R Part A): additions ${fmtD(l8)} — federal NOL deduction ${fmtD(addNol)}, non-Idaho state and local bond interest ${fmtD(addBond)}, other ${fmtD(addOther)} (non-Idaho capital loss carryover, IDeal nonqualified withdrawals, bonus depreciation, Form 4972 lump sums, bullion losses)`);
  const l9 = l7 + l8;
  const ss = D(input.taxableSocialSecurity);
  const nol = D(input.idIdahoNolCarryover);
  const refund = D(input.idStateRefund);
  const usInt = D(input.idUsInterest);
  const energy = rd(evalStateTax("us.id.alternative_energy_device_deduction", 0n, { idEnergyDeviceCost2025: c(input.idEnergyDeviceCost2025), idEnergyDeviceCost2024: c(input.idEnergyDeviceCost2024), idEnergyDeviceCost2023: c(input.idEnergyDeviceCost2023), idEnergyDeviceCost2022: c(input.idEnergyDeviceCost2022) }));
  if (energy > 0n) notes.push(`ID Form 39R line 5e: alternative energy device deduction ${fmtD(energy)} (40% first year, 20% the next three, $5,000 cap)`);
  let childCare = 0n;
  if (c(input.idChildCareExpenses) > 0n) {
    childCare = rd(evalStateTax("us.id.child_care_deduction", 0n, { idChildCareExpenses: c(input.idChildCareExpenses), idDependentCareBenefitsExcluded: c(input.idDependentCareBenefitsExcluded), idEarnedIncome: c(input.idEarnedIncome), idSpouseEarnedIncome: c(input.idSpouseEarnedIncome) }));
    notes.push(`ID Form 39R line 6: child and dependent care deduction ${fmtD(childCare)} — the smallest of expenses, $12,000 less excluded benefits, and each spouse's earned income${typeof input.idEarnedIncome !== "number" ? " (pass idEarnedIncome — assumed $0 → $0 deduction)" : ""}; attach federal Form 2441`);
  }
  let retirement = 0n;
  if (c(input.idQualifyingRetirementBenefits) > 0n) {
    retirement = rd(evalStateTax("us.id.retirement_benefits_deduction", 0n, { idRetirementEligible: input.idRetirementEligible === true, idRailroadBenefits: c(input.idRailroadBenefits), idSocialSecurityBenefits: c(input.idSocialSecurityBenefits), idQualifyingRetirementBenefits: c(input.idQualifyingRetirementBenefits) }));
    if (retirement > 0n) notes.push(`ID Form 39R line 8: retirement benefits deduction ${fmtD(retirement)} — the smaller of the ${mfj ? "$72,324" : "$48,216"} maximum less Social Security and railroad benefits received and the ${fmtD(D(input.idQualifyingRetirementBenefits))} of qualifying benefits (CSRS/FSRDS, Idaho firefighter, Idaho city police, military — not FERS or private pensions)`);
    else notes.push(`ID Form 39R line 8: no retirement benefits deduction — ${mfs ? "not allowed married filing separately" : input.idRetirementEligible !== true ? "pass idRetirementEligible (65, or 62 and disabled; military: disabled, 62, or employed)" : "Social Security and railroad benefits received exceed the maximum"}`);
  }
  let capGain = 0n;
  if (c(input.idQualifiedCapitalGain) > 0n) {
    capGain = rd(evalStateTax("us.id.capital_gains_deduction", 0n, { idQualifiedCapitalGain: c(input.idQualifiedCapitalGain), idNetCapitalGain: c(input.idNetCapitalGain) }));
    notes.push(`ID Form 39R line 10: Idaho capital gains deduction ${fmtD(capGain)} — 60% of qualified Idaho property gain, limited to the capital gain net income${typeof input.idNetCapitalGain !== "number" ? " (pass idNetCapitalGain — assumed $0 → $0)" : ""}; attach Form CG`);
  }
  const military = D(input.idMilitaryPayOutsideIdaho);
  const adoption = min2(D(input.idAdoptionExpenses), 1000000n);
  if (D(input.idAdoptionExpenses) > adoption) notes.push("ID Form 39R line 12: adoption expenses capped at $10,000 per adoption");
  const msaCap = mfj ? 2000000n : 1000000n;
  const msa = min2(D(input.idMedicalSavingsContributions), msaCap);
  if (D(input.idMedicalSavingsContributions) > msa) notes.push(`ID Form 39R line 13: Idaho medical savings account contributions capped at ${fmtD(msaCap)}`);
  const idealCap = mfj ? 1200000n : 600000n;
  const ideal = min2(D(input.idCollegeSavingsContributions), idealCap);
  if (D(input.idCollegeSavingsContributions) > ideal) notes.push(`ID Form 39R line 14: IDeal college savings contributions capped at ${fmtD(idealCap)}`);
  const homeMembers = Math.min((input.idHomeFamilyMembers as number) ?? 0, 3);
  const homeMonths = (input.idHomeFamilyPartialMonths as number) ?? 0;
  const homeDeduction = input.idHomeFamilyDeduction === true ? min2(rd(100000n * BigInt(homeMembers) + 8333n * BigInt(homeMonths)), 300000n) : 0n; // "no more than three deductions of $1,000"
  if (homeDeduction > 0n) notes.push(`ID Form 39R line 15: home for the aged or developmentally disabled deduction ${fmtD(homeDeduction)} ($1,000 per member, at most three; $83.33 per month) — the $100 Part E credit is then not allowed`);
  const itemizedFederally = input.idFederalItemized === true;
  // health / LTC worksheets depend on whether the filer itemizes FOR IDAHO, which depends on line 15 vs 16 — computed below, so the
  // deductions are evaluated after the deduction choice with a provisional pass first.
  const fthbCap = mfj ? 3000000n : 1500000n;
  const fthb = min2(D(input.idFirstTimeHomeBuyerContributions), fthbCap);
  if (D(input.idFirstTimeHomeBuyerContributions) > fthb) notes.push(`ID Form 39R line 22: first-time home buyer savings contributions capped at ${fmtD(fthbCap)}`);
  const otherSub = D(input.subtractions);
  if (otherSub > 0n) notes.push(`ID Form 39R other subtractions ${fmtD(otherSub)} transcribed (energy efficiency upgrades, technological equipment donation, Idaho lottery prizes under $600, reservation income, workers' compensation premiums, bonus depreciation, bullion gains, Idaho Build America Bond interest)`);
  if (ss > 0n) notes.push(`ID Form 39R line 7: Social Security and railroad benefits taxed federally ${fmtD(ss)} subtracted in full (§ 63-3022(l))`);

  const healthFacts = (itemizing: boolean) => ({
    idItemizingForIdaho: itemizing,
    idSchAHealthPremiums: c(input.idSchAHealthPremiums),
    idSchALtcPremiums: c(input.idSchALtcPremiums),
    idSchAOtherMedical: c(input.idSchAOtherMedical),
    idAgi: l7,
    idHealthPremiumsPaid: c(input.idHealthPremiumsPaid),
    idHealthPremiumsDeductedElsewhere: c(input.idHealthPremiumsDeductedElsewhere),
    idLtcPremiumsPaid: c(input.idLtcPremiumsPaid),
    idLtcDeductedElsewhere: c(input.idLtcDeductedElsewhere),
  });
  const wantsHealth = c(input.idHealthPremiumsPaid) > 0n || c(input.idLtcPremiumsPaid) > 0n;
  const subtractionsExcludingHealth = nol + refund + usInt + energy + childCare + ss + retirement + capGain + military + adoption + msa + ideal + homeDeduction + fthb + otherSub;

  // ---- lines 12-19: deductions and taxable income ----
  const spouseItemizes = mfs && input.idSpouseItemizes === true;
  const l16 = spouseItemizes ? 0n : rd(evalStateTax("us.id.standard_deduction", 0n, { idAgeBlindBoxes: boxes, isClaimedAsDependent: dependentFiler, idEarnedIncome: c(input.idEarnedIncome) }));
  if (spouseItemizes) notes.push("ID line 16: standard deduction $0 — 'You Must Itemize If: Your filing status is married filing separately and your spouse itemizes' (IRC § 63(c)(6)(A)); line 17 uses Idaho itemized deductions" + (itemizedFederally ? "" : " (pass idFederalItemized and the Schedule A amounts — assumed $0)"));
  if (dependentFiler) notes.push(`ID line 16: a filer claimable as a dependent gets the larger of $1,350 or earned income + $450, capped at the filing-status amount${boxes > 0 ? ", plus the age/blind amounts" : ""} — ${fmtD(l16)}`);
  const l13 = itemizedFederally ? D(input.idFederalItemizedDeductions) + D(input.idForeignTaxCredit) : 0n;
  let l15 = 0n;
  let l14 = 0n;
  if (itemizedFederally) {
    l15 = rd(evalStateTax("us.id.itemized_deductions", 0n, { idFederalItemizedDeductions: c(input.idFederalItemizedDeductions), idForeignTaxCredit: c(input.idForeignTaxCredit), idSaltIncomeOrSalesTaxes: c(input.idSaltIncomeOrSalesTaxes), idRealEstateTaxes: c(input.idRealEstateTaxes), idPersonalPropertyTaxes: c(input.idPersonalPropertyTaxes), idSaltAllowed: c(input.idSaltAllowed) }));
    l14 = l13 - l15;
    if (D(input.idForeignTaxCredit) > 0n) notes.push(`ID line 13: the ${fmtD(D(input.idForeignTaxCredit))} federal foreign tax credit is added to itemized deductions (Idaho has no matching credit)`);
  }
  // deduction choice: itemizing for Idaho changes the health/LTC worksheet, which changes line 10 and thus line 11 — but not the
  // line 15 vs 16 comparison itself, so decide first, then evaluate health/LTC once.
  const itemizeForIdaho = spouseItemizes || (itemizedFederally && l15 > l16);
  let health = 0n;
  let ltc = 0n;
  if (wantsHealth) {
    health = rd(evalStateTax("us.id.health_insurance_deduction", 0n, healthFacts(itemizeForIdaho)));
    ltc = rd(evalStateTax("us.id.long_term_care_deduction", 0n, healthFacts(itemizeForIdaho)));
    if (health > 0n) notes.push(`ID Form 39R line 18: health insurance premiums deduction ${fmtD(health)}${itemizeForIdaho ? " (reduced by the part of the federal medical deduction allocated to health insurance — you itemize for Idaho)" : " (no reduction — the Idaho standard deduction is used)"}; pre-tax and business-deducted premiums excluded`);
    if (ltc > 0n) notes.push(`ID Form 39R line 19: long-term care insurance premiums deduction ${fmtD(ltc)}`);
  }
  const l10 = subtractionsExcludingHealth + health + ltc;
  const l11 = l9 - l10;
  if (l11 < 0n) notes.push("ID line 11: total adjusted income is negative — see Form 56 (Idaho NOL)");
  const deduction = itemizeForIdaho ? l15 : l16;
  if (itemizedFederally && !spouseItemizes) notes.push(itemizeForIdaho ? `ID line 17: Idaho itemized deductions ${fmtD(l15)} (federal ${fmtD(l13)} less ${fmtD(l14)} of state and local income or sales taxes) beat the ${fmtD(l16)} standard deduction` : `ID line 17: the ${fmtD(l16)} standard deduction beats Idaho itemized deductions of ${fmtD(l15)} after removing state and local taxes ('it might be more beneficial to itemize for federal purposes but use the standard deduction for Idaho')`);
  const l17 = max0(l11 - deduction);
  const l18 = D(input.idQbiDeduction); // "If less than zero, enter zero" — printed as entered, not limited to line 17
  if (l18 > 0n) notes.push(`ID line 18: qualified business income and Schedule 1-A deductions ${fmtD(l18)} (federal Form 1040 lines 13a + 13b)`);
  const l19 = max0(l17 - l18);

  // ---- line 20: tax ----
  const l20 = rd(evalStateTax("us.id.income_tax", l19, {}));
  notes.push(`ID line 20: 5.3% of Idaho taxable income over ${fs === "single" || mfs ? "$4,811" : "$9,622"} (no tax table — the line 20 worksheet)`);

  // ---- lines 21-26: credits ----
  let l21 = 0n;
  if (D(input.idOtherStateIncome) > 0n && D(input.idOtherStateTaxDue) > 0n) {
    l21 = rd(evalStateTax("us.id.other_state_credit", 0n, { idTaxBeforeCredits: l20, idOtherStateIncome: c(input.idOtherStateIncome), idAdjustedIncome: l11, idOtherStateTaxDue: c(input.idOtherStateTaxDue) }));
    notes.push(`ID line 21 (Form 39R Part C): credit for tax paid to another state ${fmtD(l21)} — the smaller of Idaho tax × ${fmtD(D(input.idOtherStateIncome))} ÷ ${fmtD(l11)} (four decimals) and the other state's ${fmtD(D(input.idOtherStateTaxDue))}; attach that state's return; one Form 39R per state`);
  }
  const l23 = D(input.idBusinessCredits);
  let d1 = 0n;
  let d2 = 0n;
  let d3 = 0n;
  if (D(input.idEducationalContributions) > 0n) {
    d1 = rd(evalStateTax("us.id.educational_contribution_credit", 0n, { idTaxBeforeCredits: l20, idOtherStateCredit: l21, idEducationalContributions: c(input.idEducationalContributions) }));
    notes.push(`ID Form 39R Part D line 1: Idaho educational entity credit ${fmtD(d1)} — the smallest of half the ${fmtD(D(input.idEducationalContributions))} donated, 50% of the tax, ${mfj ? "$1,000" : "$500"}, and the tax after line 21`);
  }
  if (D(input.idYouthContributions) > 0n) {
    d2 = rd(evalStateTax("us.id.youth_rehab_contribution_credit", 0n, { idTaxBeforeCredits: l20, idOtherStateCredit: l21, idEducationalCredit: d1, idInvestmentTaxCredit: c(input.idInvestmentTaxCredit), idYouthContributions: c(input.idYouthContributions) }));
    notes.push(`ID Form 39R Part D line 2: youth and rehabilitation facility credit ${fmtD(d2)} — the smallest of half the donation, 20% of the tax, ${mfj ? "$200" : "$100"}, and the remaining tax`);
  }
  if (D(input.idOrganDonationExpenses) > 0n) {
    d3 = rd(evalStateTax("us.id.live_organ_donation_credit", 0n, { idTaxBeforeCredits: l20, idOtherStateCredit: l21, idEducationalCredit: d1, idYouthCredit: d2, idBusinessCredits: l23, idOrganDonationExpenses: c(input.idOrganDonationExpenses) }));
    notes.push(`ID Form 39R Part D line 3: live organ donation credit ${fmtD(d3)} (≤ $5,000; unused credit carries over five years)`);
  }
  const l22 = d1 + d2 + d3;
  const children = (input.idQualifyingChildren as number) ?? 0;
  let l24 = 0n;
  if (children > 0) {
    l24 = rd(evalStateTax("us.id.child_tax_credit", 0n, { idQualifyingChildren: children, idTaxBeforeCredits: l20, idOtherStateCredit: l21, idContributionCredits: l22, idBusinessCredits: l23 }));
    notes.push(`ID line 24: Idaho Child Tax Credit ${fmtD(l24)} — $205 × ${children} qualifying child(ren) 16 or under, limited to the tax after lines 21-23; § 63-3029L sunsets this credit for tax years beginning in 2026 (the 2026 extension bills did not pass)`);
  }
  const l25 = l21 + l22 + l23 + l24;
  const l26 = max0(l20 - l25);
  if (l25 > l20) notes.push(`ID line 26: credits ${fmtD(l25)} exceed the tax ${fmtD(l20)} — the excess is lost (only the live organ credit carries over)`);

  // ---- lines 27-32: other taxes ----
  const l27 = D(input.idFuelsTaxDue);
  const purchases = D(input.idUseTaxPurchases);
  const l28 = purchases > 0n ? rd(evalStateTax("us.id.use_tax", 0n, { idUseTaxPurchases: purchases })) : 0n;
  if (l28 > 0n) notes.push(`ID line 28: use tax ${fmtD(l28)} = 6% of ${fmtD(purchases)} of untaxed purchases`);
  const l29_30 = D(input.idCreditRecapture);
  const requiredToFile = input.idRequiredToFile !== false;
  const l31 = rd(evalStateTax("us.id.permanent_building_fund_tax", 0n, { idReceivedPublicAssistance: input.idReceivedPublicAssistance === true, idBlind: input.idBlindFiler === true, idRequiredToFile: requiredToFile }));
  if (l31 === 0n) notes.push(`ID line 31: no $10 permanent building fund tax — ${!requiredToFile ? "not required to file ('NRF')" : input.idReceivedPublicAssistance === true ? "receiving Idaho public assistance (box checked)" : "legally blind"}`);
  else notes.push("ID line 31: $10 permanent building fund tax (§ 63-3082) — every filer required to file, unless on Idaho public assistance or legally blind (pass idBlindFiler)");
  const l32 = l26 + l27 + l28 + l29_30 + l31;

  // ---- lines 33-41: donations ----
  const donations = D(input.idDonations);
  const l41 = l32 + donations;
  if (donations > 0n) notes.push(`ID lines 33-40: voluntary donations ${fmtD(donations)} added to the tax (they can't be reduced on an amended return)`);

  // ---- lines 42-50: payments and refundable credits ----
  const l42 = D(input.idParentalChoiceCredit);
  let l43 = 0n;
  const excluded = (input.idFoodCreditExcludedPersons as number) ?? 0;
  const partialMonths = (input.idFoodCreditPartialMonths as number) ?? 0;
  const partialPersons = (input.idFoodCreditPartialPersons as number) ?? (partialMonths > 0 ? 1 : 0);
  const foodPersons = Math.max(0, l6d - excluded - partialPersons);
  if (input.idDonateFoodCredit === true) notes.push("ID line 43: Food Tax Credit donated to the Cooperative Welfare Fund (box checked, $0 entered) — this can't be changed on an amended return");
  else if (dependentFiler) notes.push("ID line 43: no Food Tax Credit — 'You can't claim this credit if someone else, such as a parent, can claim you as a dependent'");
  else {
    l43 = rd(evalStateTax("us.id.food_tax_credit", 0n, { idFoodCreditPersons: foodPersons, idFoodCreditPartialMonths: partialMonths }));
    notes.push(`ID line 43: Food Tax Credit ${fmtD(l43)} — $155 × ${foodPersons} household member(s) qualified all year${partialMonths > 0 ? ` + $12.92 × ${partialMonths} qualified month(s)` : ""}; refundable; months on food stamps, incarcerated, or as a nonresident don't qualify (pass idFoodCreditPartialMonths / idFoodCreditExcludedPersons); receipts for actual sales tax paid (≤ $250 each) are an alternative not composed`);
  }
  let l44 = 0n;
  if (homeMembers + homeMonths > 0 && input.idHomeFamilyDeduction !== true) {
    l44 = rd(evalStateTax("us.id.home_for_family_member_credit", 0n, { idHomeFamilyMembers: homeMembers, idHomeFamilyPartialMonths: homeMonths }));
    notes.push(`ID line 44 (Form 39R Part E): maintaining a home for a family member credit ${fmtD(l44)} ($100 per member, $8.33 per month, at most $300); refundable`);
  }
  const l45 = D(input.idFuelsTaxRefund);
  const l46 = D(input.stateWithholding) + D(input.spouseStateWithholding);
  const l47 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited) + D(input.extensionPayment);
  const l48 = D(input.idEntityPayments);
  const l49 = D(input.idOtherRefundableCredits);
  const l50 = l42 + l43 + l44 + l45 + l46 + l47 + l48 + l49;

  // ---- lines 51-56 ----
  const l52 = D(input.idPenaltyAndInterest);
  const l53 = D(input.idPriorYearCredit);
  const l51 = max0(l41 - l50);
  const l54 = l41 >= l50 ? max0(l51 + l52 - l53) : 0n; // "Add lines 51 and 52, then subtract line 53" — penalty/interest is due even when 41 = 50
  const l55 = l41 < l50 ? max0(l50 - l41 - l52) : 0n;
  const apply = min2(D(input.idApplyToNextYear), l55);
  const l56 = l55 - apply;
  if (l54 > 0n && l54 < 100n) notes.push("ID line 54: 'Payments of less than $1 aren't required'");
  if (l56 > 0n && l56 < 100n) notes.push("ID line 56: 'We don't issue refunds of less than $1'");
  if (l54 > 0n && l52 === 0n) notes.push(`ID line 52: balance due ${fmtD(l54)} — interest runs from the due date at 6% for 2026; Idaho doesn't require estimated payments, so no underpayment penalty applies to a timely-filed return`);

  notes.push("ID scope: Form 40 is composed for a full-year RESIDENT — part-year residents and nonresidents file Form 43 with Form 39NR (not composed); Form 44 business credits, Form 75 fuels tax, Form CG, Form 56 (NOL), the Parental Choice Tax Credit approval, and Part A/B lines not modeled are inputs; Idaho has no local income taxes");

  const put = (k: string, v: Cents): Record<string, string> => (v !== 0n ? { [k]: fmtD(v) } : {});
  return {
    "6d_household": String(l6d),
    "7_federal_agi": fmtD(l7),
    ...put("8_additions", l8),
    "9_total": fmtD(l9),
    ...put("10_subtractions", l10),
    ...put("39R_B6_child_care_deduction", childCare),
    ...put("39R_B7_social_security", ss),
    ...put("39R_B8_retirement_benefits_deduction", retirement),
    ...put("39R_B10_capital_gains_deduction", capGain),
    ...put("39R_B18_health_insurance", health),
    ...put("39R_B19_long_term_care", ltc),
    "11_total_adjusted_income": fmtD(l11),
    ...put("13_federal_itemized", l13),
    ...put("14_state_local_taxes", l14),
    ...put("15_idaho_itemized", l15),
    "16_standard_deduction": fmtD(l16),
    _deduction_method: itemizeForIdaho ? "itemized" : "standard",
    "17_income_after_deduction": fmtD(l17),
    ...put("18_qbi_deduction", l18),
    "19_idaho_taxable_income": fmtD(l19),
    "20_tax": fmtD(l20),
    ...put("21_other_state_credit", l21),
    ...put("22_part_d_credits", l22),
    ...put("23_business_credits", l23),
    ...put("24_child_tax_credit", l24),
    "25_total_credits": fmtD(l25),
    "26_tax_after_credits": fmtD(l26),
    ...put("27_fuels_tax", l27),
    ...put("28_use_tax", l28),
    ...put("29_30_recapture", l29_30),
    "31_permanent_building_fund_tax": fmtD(l31),
    "32_total_tax": fmtD(l32),
    ...put("33_40_donations", donations),
    "41_total_tax_plus_donations": fmtD(l41),
    ...put("42_parental_choice_credit", l42),
    ...put("43_food_tax_credit", l43),
    ...put("44_home_for_family_member_credit", l44),
    ...put("45_fuels_tax_refund", l45),
    ...put("46_withholding", l46),
    ...put("47_estimated_payments", l47),
    ...put("48_entity_payments", l48),
    ...put("49_other_credits", l49),
    "50_total_payments_credits": fmtD(l50),
    "51_tax_due": fmtD(l51),
    ...put("52_penalty_interest", l52),
    ...put("53_prior_year_credit", l53),
    "54_total_due": fmtD(l54),
    "55_overpaid": fmtD(l55),
    ...put("56_apply_to_2026", apply),
    "56_refund": fmtD(l56),
  };
}
