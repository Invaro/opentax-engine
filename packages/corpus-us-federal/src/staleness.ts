/**
 * Staleness at the coverage horizon — the state treadmill's work queue, checked in.
 *
 * A rule is STALE when its latest version ends on or before the horizon (the
 * last day of the coming tax year), i.e. the corpus has nothing to say about
 * that year's figure. Two tiers, by consequence:
 *
 *   "return" — a rule the printed return cannot be composed without (the income
 *              tax, the standard deduction, the exemption, or a starting-point
 *              deduction) is stale: compute_state_return REFUSES a horizon-year
 *              return for this state until the listed publication is encoded.
 *   "lines"  — only credits, subtractions or a use-tax table are stale: the
 *              composer leaves those lines blank with a note and the rest of
 *              the return composes.
 *
 * staleness.test.ts recomputes both the set of stale rule ids per jurisdiction
 * and the tier from the corpus and fails if this declaration drifts — so adding
 * a horizon-year version of any rule forces an edit here, and a rule that quietly
 * expires cannot go unlisted. The coverage report reads this declaration to
 * label each row. Keep `unblockedBy` to what the Department actually publishes.
 */

export const STALE_HORIZON = "2026-12-31";

/** rule ids whose absence makes the horizon-year return non-composable */
export const CORE_RULE_SUFFIXES = [".income_tax", ".standard_deduction", ".personal_exemption", ".exemption_amount", ".exemptions", ".federal_tax_deduction"] as const;

export type StaleTier = "return" | "lines";
export type StaleEntry = { tier: StaleTier; rules: readonly string[]; unblockedBy: string };

export const STALE_AT_HORIZON: Readonly<Record<string, StaleEntry>> = {
  ar: {
    tier: "return",
    rules: ["us.ar.income_tax", "us.ar.low_income_tax", "us.ar.standard_deduction", "us.ar.personal_tax_credits", "us.ar.additional_tax_credit", "us.ar.child_care_credit", "us.ar.retirement_exclusion", "us.ar.capital_gains", "us.ar.itemized_deductions"],
    unblockedBy: "2026 DFA indexed bracket and threshold sheets and the 2026 AR1000F booklet (dfa.arkansas.gov/incometax, ~November-December 2026); Acts 1-2 of the 2026 1st Ex. Sess. already cut the top rate to 3.7%",
  },
  ca: {
    tier: "return",
    rules: ["us.ca.income_tax", "us.ca.caleitc", "us.ca.yctc", "us.ca.renters_credit", "us.ca.cdcc", "us.ca.amt", "us.ca.bhst"],
    unblockedBy: "FTB's 2026 indexed amounts (brackets, exemption credits, standard deduction, CalEITC tables) and the 2026 Form 540 booklet (~December 2026)",
  },
  ga: {
    tier: "lines",
    rules: ["us.ga.retirement_exclusion", "us.ga.low_income_credit", "us.ga.cdcc"],
    unblockedBy: "2026 Form 500 booklet (retirement exclusion, low income credit table, dependent care credit) (~January 2027)",
  },
  hi: {
    tier: "lines",
    rules: ["us.hi.reserve_pay_exclusion"],
    unblockedBy: "2026 Form N-11 instructions (the reserve pay exclusion is the E-5 pay-grade amount, re-set each year)",
  },
  id: {
    tier: "return",
    rules: ["us.id.income_tax", "us.id.standard_deduction", "us.id.itemized_deductions", "us.id.child_tax_credit", "us.id.retirement_benefits_deduction", "us.id.alternative_energy_device_deduction"],
    unblockedBy: "2026 Form 40 booklet (EIN00046: indexed brackets and federal standard deduction conformity; the $205 child tax credit sunset after TY2025 under § 63-3029L) (~December 2026)",
  },
  il: {
    tier: "return",
    rules: ["us.il.income_tax", "us.il.eitc", "us.il.subtractions", "us.il.use_tax"],
    unblockedBy: "2026 IL-1040 booklet (exemption allowance, use tax table) (~December 2026)",
  },
  md: {
    tier: "return",
    rules: ["us.md.income_tax", "us.md.local_tax", "us.md.exemption_amount", "us.md.ctc", "us.md.poverty_level_credit", "us.md.capital_gains_surtax", "us.md.pension_exclusion"],
    unblockedBy: "2026 Form 502 booklet and the Comptroller's 2026 local income tax rates (~December 2026)",
  },
  me: {
    tier: "lines",
    rules: ["us.me.pension_deduction", "us.me.dependent_exemption_credit", "us.me.property_tax_fairness_credit", "us.me.sales_tax_fairness_credit"],
    unblockedBy: "2026 Form 1040ME booklet (indexed pension deduction; P.L. 2025 c. 650's 2026 dependent credit repeal and PTFC $1,500 cap; STFC tables) (~December 2026)",
  },
  mn: {
    tier: "return",
    rules: ["us.mn.income_tax", "us.mn.standard_deduction", "us.mn.exemptions", "us.mn.social_security_subtraction", "us.mn.niit"],
    unblockedBy: "2026 Form M1 booklet and the Department of Revenue's 2026 inflation adjustments (~December 2026)",
  },
  mo: {
    tier: "return",
    rules: ["us.mo.income_tax", "us.mo.federal_tax_deduction", "us.mo.public_pension_exemption", "us.mo.wftc", "us.mo.business_income_deduction"],
    unblockedBy: "2026 MO-1040 booklet and tax chart (~December 2026)",
  },
  mt: {
    tier: "lines",
    rules: ["us.mt.age65_subtraction", "us.mt.tuition_savings_subtraction"],
    unblockedBy: "2026 Form 2 booklet (the CPI-indexed age-65 subtraction and the 529 subtraction cap) (~September 2026; the 2025 booklet already prints the TY2026 and TY2027 rate tables)",
  },
  nc: {
    tier: "lines",
    rules: ["us.nc.use_tax"],
    unblockedBy: "2026 Form D-400 booklet use tax table (~January 2027)",
  },
  nd: {
    tier: "lines",
    rules: ["us.nd.marriage_penalty_credit"],
    unblockedBy: "2026 Form ND-1 booklet's Marriage Penalty Credit Worksheet (the preprinted half-standard-deduction figure, the gates and the maximum are re-set yearly) (~December 2026)",
  },
  nj: {
    tier: "return",
    rules: ["us.nj.income_tax", "us.nj.eitc", "us.nj.cdcc", "us.nj.ctc", "us.nj.pension_exclusion", "us.nj.property_tax_deduction", "us.nj.use_tax"],
    unblockedBy: "2026 NJ-1040 booklet (~December 2026)",
  },
  nm: {
    tier: "lines",
    rules: ["us.nm.lictr", "us.nm.child_income_tax_credit"],
    unblockedBy: "2026 PIT-RC (LICTR and child income tax credit tables are CPI-indexed) (~December 2026)",
  },
  ny: {
    tier: "lines",
    rules: ["us.ny.it214", "us.ny.nyc_cdcc", "us.ny.nyc_income_tax", "us.ny.yonkers_surcharge"],
    unblockedBy: "2026 IT-201 instructions and the 2026 NYC rate schedule / IT-214 (~December 2026)",
  },
  oh: {
    tier: "return",
    rules: ["us.oh.exemption_amount", "us.oh.joint_filing_credit", "us.oh.retirement_income_credit", "us.oh.senior_citizen_credit", "us.oh.exemption_credit", "us.oh.eic", "us.oh.cdcc"],
    unblockedBy: "2026 Ohio IT 1040 booklet — the indexed personal exemption amount, without which the return cannot be composed, and the Schedule of Credits (~December 2026); HB 96's TY2026 rate changes are already encoded",
  },
  ok: {
    tier: "lines",
    rules: ["us.ok.use_tax"],
    unblockedBy: "2026 Form 511 packet use tax table (~December 2026)",
  },
  or: {
    tier: "return",
    rules: ["us.or.income_tax", "us.or.federal_tax_subtraction", "us.or.standard_deduction", "us.or.exemption_credit", "us.or.eic", "us.or.kids_credit", "us.or.kicker"],
    unblockedBy: "2026 Form OR-40 booklet and the Department of Revenue's 2026 indexed amounts (~December 2026)",
  },
  pa: {
    tier: "lines",
    rules: ["us.pa.cdcc"],
    unblockedBy: "2026 PA-40 booklet (the child and dependent care enhancement credit) (~December 2026)",
  },
  ri: {
    tier: "lines",
    rules: ["us.ri.social_security_modification", "us.ri.pension_modification", "us.ri.property_tax_relief_credit", "us.ri.use_tax"],
    unblockedBy: "Division of Taxation ADV 2026-xx (the indexed Social Security and pension modification limits and RI-1040H figures, ~November 2026) and the 2026 RI-1040 booklet",
  },
  sc: {
    tier: "lines",
    rules: ["us.sc.dependent_exemption", "us.sc.retirement_deduction", "us.sc.age65_deduction", "us.sc.two_wage_earner_credit", "us.sc.cdcc"],
    unblockedBy: "2026 SC1040 booklet (~December 2026)",
  },
  va: {
    tier: "return",
    rules: ["us.va.income_tax", "us.va.subtractions", "us.va.spouse_tax_adjustment"],
    unblockedBy: "2026 Form 760 booklet and Tax Table (~December 2026)",
  },
  vt: {
    tier: "return",
    rules: ["us.vt.standard_deduction", "us.vt.use_tax"],
    unblockedBy: "2026 Form IN-111 booklet — the indexed standard deduction and per-box amount (§ 5811(21)(D)) and the Estimated Use Tax Table (~December 2026); the 2026 rate schedules and $5,400 exemption are already encoded from the 2026 IN-114 instructions and GB-1210-2026",
  },
  wi: {
    tier: "return",
    rules: ["us.wi.income_tax", "us.wi.standard_deduction", "us.wi.eic", "us.wi.married_couple_credit", "us.wi.school_property_tax_credit", "us.wi.retirement_subtraction_67"],
    unblockedBy: "2026 Form 1 booklet and the Department of Revenue's 2026 indexed brackets and standard deduction table (~December 2026)",
  },
  wv: {
    tier: "lines",
    rules: ["us.wv.family_tax_credit", "us.wv.senior_citizens_tax_credit", "us.wv.homestead_excess_property_tax_credit"],
    unblockedBy: "2026 IT-140 booklet (the Family Tax Credit table follows the 2026 HHS poverty guideline; SCTC-A and HEPTC-1) (~December 2026); SB 392's TY2026 rates are already encoded",
  },
};
