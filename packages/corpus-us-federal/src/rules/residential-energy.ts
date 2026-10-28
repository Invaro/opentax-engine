/**
 * Form 5695, Residential Energy Credits — 26 U.S.C. §§ 25D and 25C, as amended
 * by Pub. L. 119-21 (the One Big Beautiful Bill Act, enacted July 4, 2025)
 * §§ 70506 and 70505. Encoded line by line from the 2025 Form 5695 (created
 * 3/20/25) and its Instructions (rev. Jan. 22, 2026), verified against the
 * statute text (uscode via law.cornell.edu) and IRS Fact Sheet 2025-05
 * (Aug. 21, 2025) — October 2026.
 *
 * Part I — residential clean energy credit (§ 25D), Schedule 3 line 5a:
 *   30% of qualified solar electric, solar water heating, small wind,
 *   geothermal heat pump and battery storage (≥ 3 kWh) costs (lines 1–5b →
 *   6b), plus fuel cell costs at 30% capped at $500 per half kilowatt of
 *   capacity (lines 8–11, § 25D(b)(1)), plus the prior-year carryforward
 *   (line 12). Limited to the tax remaining after the credits the line-14
 *   worksheet subtracts first (line 14); the excess carries forward
 *   (line 16, § 25D(c)). TERMINATED for expenditures made after December 31,
 *   2025 (§ 25D(h)); an expenditure is made when installation is completed
 *   (§ 25D(e)(8)(A); FS-2025-05 Q7), so TY2026 inputs earn $0 — only the
 *   2025 carryforward survives into 2026 (2025 Form 5695 line 16: "Credit
 *   carryforward to 2026").
 *
 * Part II — energy efficient home improvement credit (§ 25C), Schedule 3
 *   line 5b: 30% of each category, each capped as the printed form caps it
 *   (18b $1,200 insulation; 19c $250 most-expensive door, 19h $500 all
 *   doors; 20d $600 windows; 22d/23d/24d/25e $600 per energy-property line;
 *   26c $150 audit), the sum capped at $1,200 (line 28, § 25C(b)(1)), plus
 *   heat pumps / heat pump water heaters / biomass stoves and boilers at 30%
 *   capped at $2,000 (line 29h, § 25C(b)(5)). No carryforward. Limited to
 *   the tax remaining after the line-31 worksheet credits. TERMINATED for
 *   property placed in service after December 31, 2025 (§ 25C(i)).
 *
 * Ordering (the 2025 credit-limit worksheets): the Part II worksheet
 * subtracts Schedule 3 lines 1–4 and 6d (foreign tax credit — not modeled;
 * § 21 dependent care; § 25A education; § 25B saver's; § 22 Schedule R) and
 * 6l (not modeled). Schedule 8812 Credit Limit Worksheet A subtracts line 5b
 * (Part II) before the child tax credit. The Part I worksheet subtracts all
 * of those plus line 5b, the clean-vehicle credits (not modeled), Form 1040
 * line 19 (CTC/ODC), the mortgage interest credit (not modeled), the
 * adoption credit and the DC homebuyer carryforward (not modeled). When
 * Schedule 8812 Credit Limit Worksheet B applies (a Part I credit is claimed,
 * at least one qualifying child, no Form 2555), line 19 is replaced by
 * Worksheet B line 14 — the portion of the CTC/ODC that cannot become
 * refundable ACTC — and the Part I credit as figured then reduces the CTC
 * limit (Worksheet A line 4), pushing that much CTC into the ACTC.
 *
 * Inputs attest the form's yes/no gates: United States home, original use,
 * 5-year expected life, main-home requirement for Part II and fuel cells,
 * battery capacity ≥ 3 kWh, QMID reported for 2025 specified property,
 * home-energy-audit certification, no subsidized energy financing, costs
 * net of utility subsidies and of any business-use allocation, and the
 * joint-occupancy allocation already applied (the instructions' pro-rata
 * rules for co-occupants are the caller's — pass the allocable share).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // structural: open-ended
const TY2025 = { effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" };
const TERMINATED = { effectiveFrom: "2026-01-01" }; // the credit is gone for good

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });

/** base × (rate rule, in percentage points carried as cents) ÷ 100 — the form's "Multiply line N by 30% (0.30)". */
const pctOf = (base: Expr, rateRule: string): Expr => ({
  kind: "mulDiv",
  a: base,
  b: ruleRef(rateRule),
  c: money("100"),
  round: "half-up",
});

/** § 26(a) base: regular tax + AMT (Form 1040 line 16 + Schedule 2 line 1) — the corpus's limit base for every nonrefundable credit. */
const limitBase: Expr = add(ruleRef("us.federal.income_tax_before_credits"), ruleRef("us.federal.amt"));

const F5695_2025 = "2025 Form 5695 (Cat. No. 13540P, created 3/20/25) and Instructions for Form 5695 (2025) (Cat. No. 66412G, rev. Jan. 22, 2026)";
const URL_25D = "https://www.law.cornell.edu/uscode/text/26/25D";
const URL_25C = "https://www.law.cornell.edu/uscode/text/26/25C";
const URL_I5695 = "https://www.irs.gov/pub/irs-pdf/i5695.pdf";

const line = (
  id: string,
  title: string,
  citation: Rule["citation"],
  formula: Expr,
  extra: Partial<Rule> = {},
): Rule => ({
  id: `${J}.energy.${id}`,
  version: 1,
  jurisdiction: J,
  title,
  citation,
  ...FROM,
  output: { type: "money" },
  formula,
  ...extra,
});

// ---------------------------------------------------------------------------
// Part I — residential clean energy credit (§ 25D)
// ---------------------------------------------------------------------------

type Window = { effectiveFrom: string; effectiveTo?: string };
const cleanRate = (version: number, window: Window, cents: string, title: string, excerpt: string, source: string): Rule => ({
  id: `${J}.energy.clean.rate`,
  version,
  jurisdiction: J,
  title,
  citation: { source, section: version === 1 ? "§ 25D(a), (g)(3)" : "§ 25D(h); § 25D(e)(8)(A)", url: URL_25D, excerpt },
  ...window,
  output: { type: "money" },
  parameters: { applicablePercentage: { value: cents, type: "money" } },
  formula: param("applicablePercentage"),
});

const improvementRate = (version: number, window: Window, cents: string, title: string, excerpt: string, source: string): Rule => ({
  id: `${J}.energy.improvement.rate`,
  version,
  jurisdiction: J,
  title,
  citation: { source, section: version === 1 ? "§ 25C(a)" : "§ 25C(i)", url: URL_25C, excerpt },
  ...window,
  output: { type: "money" },
  parameters: { creditPercentage: { value: cents, type: "money" } },
  formula: param("creditPercentage"),
});

/** Schedule 8812 Credit Limit Worksheet B lines 2–13 (the 3+-child social security alternative, lines 6–11, is not modeled — same disclosure as us.federal.actc). */
const actcMaximum: Rule = {
  id: `${J}.actc.maximum`,
  version: 1,
  jurisdiction: J,
  title: "Maximum additional child tax credit (Schedule 8812 Credit Limit Worksheet B, line 13)",
  citation: {
    source: "26 U.S.C. § 24(d)(1), (h)(5); 2025 Instructions for Schedule 8812, Credit Limit Worksheet B",
    section: "§ 24(d)(1)(B)(i); § 24(h)(5)",
    url: "https://www.irs.gov/instructions/i1040s8",
    excerpt:
      "Worksheet B line 2: number of qualifying children under age 17 with the required social security number × $1,700; line 4: earned income over $2,500; line 5: 15% of line 4; line 13: the smaller of line 2 or line 12. [Line 12 is the larger of line 5 and the 3+-child social security tax alternative (lines 6–11), which is NOT modeled — it can only raise the maximum at very low earned income; disclosed. Earned income approximated as wages + self-employment earnings net of the ½ SE deduction, less a Schedule C net loss.]",
  },
  ...FROM,
  output: { type: "money" },
  parameters: {
    refundableCapPerChild: { value: "170000", type: "money" }, // $1,700 (2025 and 2026)
    earnedIncomeFloor: { value: "250000", type: "money" }, // $2,500
  },
  formula: min(
    { kind: "mulInt", base: param("refundableCapPerChild"), count: fact("qualifyingChildren") },
    {
      kind: "mulRate",
      base: max0(
        sub(
          add(fact("wages"), max0(sub(ruleRef("us.federal.se_net_profit"), ruleRef("us.federal.se_tax_half_deduction")))),
          add(param("earnedIncomeFloor"), fact("scheduleCNetLoss")),
        ),
      ),
      rate: { num: "15", den: "100" },
      round: "half-up",
    },
  ),
};

const worksheetBApplies: Rule = {
  id: `${J}.energy.clean.worksheet_b_applies`,
  version: 1,
  jurisdiction: J,
  title: "Schedule 8812 Credit Limit Worksheet B applies (Part I or adoption credit claimed, a qualifying child, no Form 2555)",
  citation: {
    source: "2025 Instructions for Schedule 8812, Credit Limit Worksheet A line 3 / Worksheet B",
    section: "Credit Limit Worksheet A, line 3",
    url: "https://www.irs.gov/instructions/i1040s8",
    excerpt:
      "Complete Credit Limit Worksheet B only if you meet all the following. 1. You are claiming one or more of the following credits. a. Mortgage interest credit, Form 8396. b. Adoption credit, Form 8839. c. Residential clean energy credit, Form 5695, Part I. d. District of Columbia first-time homebuyer credit, Form 8859. 2. You are not filing Form 2555. 3. Line 4 of Schedule 8812 is more than zero. [Modeled triggers: a Form 5695 Part I credit (line 13 > 0) or a nonrefundable adoption credit (Form 8839 line 16 > 0); the mortgage interest and DC homebuyer credits are not modeled. Form 2555 is taken as filed when foreignEarnedIncome > 0.]",
  },
  ...FROM,
  output: { type: "bool" },
  formula: {
    kind: "and",
    args: [
      {
        kind: "or",
        args: [
          gt0(ruleRef(`${J}.energy.clean.line13`)),
          // Form 8839 line 16: the credit net of its refundable portion, before the limit
          gt0(sub(ruleRef("us.federal.adoption.allowed"), ruleRef("us.federal.adoption.refundable"))),
        ],
      },
      { kind: "cmp", op: "ge", left: fact("qualifyingChildren"), right: { kind: "int", value: "1" } },
      { kind: "not", arg: gt0(fact("foreignEarnedIncome")) },
    ],
  },
};

export const residentialEnergyRules: Rule[] = [
  // --- rates (the termination lives here, once per credit) -------------------
  cleanRate(
    1,
    TY2025,
    "30",
    "Residential clean energy credit rate — 30% (TY2025)",
    "In the case of an individual, there shall be allowed as a credit against the tax imposed by this chapter for the taxable year an amount equal to the sum of the applicable percentages of— (1) the qualified solar electric property expenditures, (2) the qualified solar water heating property expenditures, (3) the qualified fuel cell property expenditures, (4) the qualified small wind energy property expenditures, (5) the qualified geothermal heat pump property expenditures, and (6) the qualified battery storage technology expenditures… (g)(3) in the case of property placed in service after December 31, 2021, 30 percent. [Form 5695 line 6b: 'Multiply line 6a by 30% (0.30)'; line 9: 'Multiply line 8 by 30% (0.30)'.]",
    `26 U.S.C. § 25D(a), (g)(3); ${F5695_2025}`,
  ),
  cleanRate(
    2,
    TERMINATED,
    "0",
    "Residential clean energy credit — terminated for expenditures made after December 31, 2025 (OBBBA § 70506)",
    "§ 25D(h) Termination: 'The credit allowed under this section shall not apply with respect to any expenditures made after December 31, 2025.' § 25D(e)(8)(A): an expenditure is treated as made when the original installation of the item is completed. IRS FS-2025-05 Q7 (Aug. 21, 2025): 'If installation is completed after December 31, 2025, the expenditure will be treated as made after December 31, 2025, which will prevent the taxpayer from claiming the section 25D credit.' Costs entered for this year therefore earn 0%; only the carryforward from 2025 (2025 Form 5695 line 16, 'Credit carryforward to 2026') remains claimable (line 12).",
    "26 U.S.C. § 25D(h), as added by Pub. L. 119-21 (OBBBA) § 70506; § 25D(e)(8)(A); IRS Fact Sheet FS-2025-05, Q7",
  ),
  improvementRate(
    1,
    TY2025,
    "30",
    "Energy efficient home improvement credit rate — 30% (TY2025)",
    "In the case of an individual, there shall be allowed as a credit against the tax imposed by this chapter for the taxable year an amount equal to 30 percent of the sum of— (1) the amount paid or incurred by the taxpayer for qualified energy efficiency improvements installed during such taxable year, (2) the amount of the residential energy property expenditures paid or incurred by the taxpayer during such taxable year, and (3) the amount paid or incurred by the taxpayer during the taxable year for home energy audits.",
    `26 U.S.C. § 25C(a); ${F5695_2025}`,
  ),
  improvementRate(
    2,
    TERMINATED,
    "0",
    "Energy efficient home improvement credit — terminated for property placed in service after December 31, 2025 (OBBBA § 70505)",
    "§ 25C(i) Termination: 'This section shall not apply with respect to any property placed in service after December 31, 2025.' Instructions for Form 5695 (2025), What's New: 'You can't claim energy efficient home improvement credits for expenditures or property placed in service after December 31, 2025.' Costs entered for this year earn 0%; § 25C has no carryforward.",
    "26 U.S.C. § 25C(i), as amended by Pub. L. 119-21 (OBBBA) § 70505; Instructions for Form 5695 (2025)",
  ),

  // --- Part I lines -----------------------------------------------------------
  line(
    "clean.line6a",
    "Form 5695 line 6a — qualified clean energy property costs (lines 1 through 5b)",
    {
      source: `26 U.S.C. § 25D(a)(1), (2), (4), (5), (6), (d); ${F5695_2025}`,
      section: "§ 25D(a), (d)",
      url: URL_I5695,
      excerpt:
        "Line 6a: 'Add lines 1 through 5b' — qualified solar electric property costs (line 1), solar water heating (line 2), small wind energy (line 3), geothermal heat pump (line 4) and, if the battery storage technology has a capacity of at least 3 kilowatt hours, battery storage technology costs (line 5b). 'Include any labor costs properly allocable to the onsite preparation, assembly, or original installation of the residential clean energy property and for piping or wiring to interconnect such property to the home.' Costs are net of any nontaxable public-utility subsidy and of any non-business-use allocation below 80% (attested by the inputs).",
    },
    add(
      fact("solarElectricCosts"),
      fact("solarWaterHeatingCosts"),
      fact("smallWindEnergyCosts"),
      fact("geothermalHeatPumpCosts"),
      fact("batteryStorageCosts"),
    ),
  ),
  line(
    "clean.line6b",
    "Form 5695 line 6b — 30% of line 6a",
    {
      source: `26 U.S.C. § 25D(a), (g)(3); ${F5695_2025}`,
      section: "§ 25D(a), (g)(3)",
      url: URL_I5695,
      excerpt: "Line 6b: 'Multiply line 6a by 30% (0.30)'. [0% once § 25D(h) terminates the credit — see us.federal.energy.clean.rate.]",
    },
    pctOf(ruleRef(`${J}.energy.clean.line6a`), `${J}.energy.clean.rate`),
  ),
  line(
    "clean.line9",
    "Form 5695 line 9 — 30% of qualified fuel cell property costs (line 8)",
    {
      source: `26 U.S.C. § 25D(a)(3), (d)(3); ${F5695_2025}`,
      section: "§ 25D(a)(3)",
      url: URL_I5695,
      excerpt:
        "Line 8: 'Qualified fuel cell property costs' — installed on or in connection with the taxpayer's MAIN home in the United States (line 7a, attested); line 9: 'Multiply line 8 by 30% (0.30)'. On a joint return with two main homes, spouses add their fuel cell costs on one form; joint occupants (not spouses) allocate the $1,667-per-half-kilowatt qualifying-cost ceiling pro rata (attested by the input).",
    },
    pctOf(fact("fuelCellPropertyCosts"), `${J}.energy.clean.rate`),
  ),
  line(
    "clean.line10",
    "Form 5695 line 10 — fuel cell kilowatt capacity × $1,000 (the § 25D(b)(1) $500-per-half-kilowatt cap)",
    {
      source: `26 U.S.C. § 25D(b)(1); ${F5695_2025}`,
      section: "§ 25D(b)(1)",
      url: URL_25D,
      excerpt:
        "'In the case of any qualified fuel cell property expenditure, the credit allowed under subsection (a) (determined without regard to subsection (c)) for any taxable year shall not exceed $500 with respect to each half kilowatt of capacity.' Line 10: 'Kilowatt capacity of property on line 8 above. If less than 0.5 kW, enter -0-… × $1,000' — 'The nameplate capacity must be 0.5 kW or greater to claim the credit and may only be claimed in half kW increments' (input: whole half-kilowatt increments).",
    },
    { kind: "mulInt", base: param("perHalfKilowatt"), count: fact("fuelCellHalfKilowatts") },
    { parameters: { perHalfKilowatt: { value: "50000", type: "money" } } },
  ),
  line(
    "clean.line11",
    "Form 5695 line 11 — fuel cell credit: the smaller of line 9 or line 10",
    {
      source: `26 U.S.C. § 25D(b)(1); ${F5695_2025}`,
      section: "§ 25D(b)(1)",
      url: URL_I5695,
      excerpt: "Line 11: 'Enter the smaller of line 9 or line 10'.",
    },
    min(ruleRef(`${J}.energy.clean.line9`), ruleRef(`${J}.energy.clean.line10`)),
  ),
  line(
    "clean.line12",
    "Form 5695 line 12 — residential clean energy credit carryforward from the prior year",
    {
      source: `26 U.S.C. § 25D(c); ${F5695_2025}`,
      section: "§ 25D(c)",
      url: URL_25D,
      excerpt:
        "'If the credit allowable under subsection (a) exceeds the limitation imposed by section 26(a) for such taxable year reduced by the sum of the credits allowable under this subpart (other than this section), such excess shall be carried to the succeeding taxable year and added to the credit allowable under subsection (a) for such succeeding taxable year.' Line 12: 'Credit carryforward from 2024. Enter the amount, if any, from your 2024 Form 5695, line 16'. For TY2026 the input is the 2025 Form 5695 line 16 ('Credit carryforward to 2026') — the carryforward of a 2025 expenditure survives the § 25D(h) termination, which reaches only expenditures made after December 31, 2025.",
    },
    fact("residentialCleanEnergyCarryforward"),
  ),
  line(
    "clean.line13",
    "Form 5695 line 13 — tentative residential clean energy credit (lines 6b + 11 + 12)",
    {
      source: `26 U.S.C. § 25D(a)–(c); ${F5695_2025}`,
      section: "§ 25D(a)–(c)",
      url: URL_I5695,
      excerpt: "Line 13: 'Add lines 6b, 11, and 12'.",
    },
    add(ruleRef(`${J}.energy.clean.line6b`), ruleRef(`${J}.energy.clean.line11`), ruleRef(`${J}.energy.clean.line12`)),
  ),
  actcMaximum,
  worksheetBApplies,
  line(
    "clean.ctc_for_limit",
    "Child tax credit amount subtracted in the Form 5695 line 14 and Form 8839 line 17 worksheets (Form 1040 line 19, or Schedule 8812 Worksheet B line 14)",
    {
      source: "2025 Instructions for Form 5695, Residential Clean Energy Credit Limit Worksheet—Line 14, footnote; 2025 Instructions for Schedule 8812, Credit Limit Worksheet B line 14",
      section: "Line 14 worksheet, footnote *",
      url: URL_I5695,
      excerpt:
        "'+ Child tax credit or credit for other dependents, Form 1040, 1040-SR, or 1040-NR, line 19* … * Include the amount in the instructions for Schedule 8812 (Form 1040), Credit Limit Worksheet B, line 14, instead of the amount from Form 1040, 1040-SR, or 1040-NR, line 19, if the instructions for Schedule 8812 (Form 1040) direct you to complete Credit Limit Worksheet B.' Worksheet B line 14: 'Is the amount on line 13 of this worksheet more than the amount on line 1? No. Subtract line 13 from line 1. Enter the result. Yes. Enter -0-.' — line 1 is Schedule 8812 line 12 (the CTC/ODC after the phase-out), line 13 the maximum ACTC: the part of the credit that cannot be refunded is what the Part I credit must yield to.",
    },
    {
      kind: "if",
      cond: ruleRef(`${J}.energy.clean.worksheet_b_applies`),
      then: max0(sub(ruleRef("us.federal.ctc.after_phaseout"), ruleRef(`${J}.actc.maximum`))),
      else: ruleRef("us.federal.ctc"),
    },
  ),
  line(
    "clean.line14",
    "Form 5695 line 14 — limitation based on tax liability (Residential Clean Energy Credit Limit Worksheet)",
    {
      source: `26 U.S.C. § 25D(c); § 26(a); ${F5695_2025}, Residential Clean Energy Credit Limit Worksheet—Line 14`,
      section: "Line 14 worksheet",
      url: URL_I5695,
      excerpt:
        "Worksheet line 1: Form 1040 line 18; line 2: the total of Schedule 3 line 6l, the foreign tax credit (line 1), the credit for child and dependent care expenses (line 2), the credit for the elderly or the disabled (line 6d), nonrefundable education credits (line 3), the retirement savings contributions credit (line 4), the energy efficient home improvement credit (Form 5695 line 32), the credit for previously owned clean vehicles (line 6m), the clean vehicle credit (line 6f), the child tax credit or credit for other dependents (Form 1040 line 19*), the mortgage interest credit (line 6g), the adoption credit (line 6c) and the DC first-time homebuyer carryforward (line 6h); line 3: 'Subtract line 2 from line 1… If zero or less, enter -0-'. [Modeled subtractions: §§ 21, 25A, 25B, 22 (Schedule R), 25C (line 32), 24 (line 19 or Worksheet B line 14) and the nonrefundable § 23 adoption credit; the foreign tax, clean vehicle, mortgage interest, DC homebuyer and Form 8978 items are not modeled. Line 18 is taken as regular tax + AMT — the corpus's § 26(a) base.]",
    },
    max0(
      sub(
        limitBase,
        add(
          ruleRef("us.federal.cdcc"),
          ruleRef("us.federal.education.nonrefundable"),
          ruleRef("us.federal.savers_credit"),
          ruleRef("us.federal.schedule_r_credit"),
          ruleRef(`${J}.energy.home_improvement_credit`),
          ruleRef(`${J}.energy.clean.ctc_for_limit`),
          ruleRef("us.federal.adoption.nonrefundable"),
        ),
      ),
    ),
  ),
  line(
    "clean_energy_credit",
    "Residential clean energy credit — Form 5695 line 15 → Schedule 3 line 5a",
    {
      source: `26 U.S.C. § 25D(a)–(c); § 26(a); ${F5695_2025}`,
      section: "§ 25D(a); § 26(a)",
      url: URL_I5695,
      excerpt: "Line 15: 'Residential clean energy credit. Enter the smaller of line 13 or line 14. Also include this amount on Schedule 3 (Form 1040), line 5a'.",
    },
    min(ruleRef(`${J}.energy.clean.line13`), ruleRef(`${J}.energy.clean.line14`)),
  ),
  line(
    "clean.carryforward",
    "Form 5695 line 16 — residential clean energy credit carryforward to the next year",
    {
      source: `26 U.S.C. § 25D(c); ${F5695_2025}`,
      section: "§ 25D(c)",
      url: URL_25D,
      excerpt:
        "Line 16: 'Credit carryforward to 2026. If line 15 is less than line 13, subtract line 15 from line 13'. Instructions, line 16: 'If you can't use all of the credit because of the tax liability limit (that is, line 14 is less than line 13), you can carry the unused portion of the credit to 2026. File this form even if you can't use any of your credit in 2025.'",
    },
    max0(sub(ruleRef(`${J}.energy.clean.line13`), ruleRef(`${J}.energy.clean_energy_credit`))),
  ),

  // --- Part II lines ----------------------------------------------------------
  line(
    "improvement.line18b",
    "Form 5695 line 18b — insulation and air sealing: 30% of line 18a, not more than $1,200",
    {
      source: `26 U.S.C. § 25C(a)(1), (b)(1), (c)(2)(A); ${F5695_2025}`,
      section: "§ 25C(b)(1); § 25C(c)(2)(A)",
      url: URL_I5695,
      excerpt:
        "Line 18b: 'Multiply line 18a by 30% (0.30). Enter the results. Do not enter more than $1,200'. Line 18a: 'the cost of insulation material or system (include air sealing material or system) specifically and primarily designed to reduce heat loss or gain of your home that meets the criteria established by the IECC' — excluding onsite preparation, assembly or installation labor (Section A).",
    },
    min(pctOf(fact("insulationAirSealingCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "120000", type: "money" } } },
  ),
  line(
    "improvement.line19c",
    "Form 5695 line 19c — most expensive exterior door: 30% of line 19a, not more than $250",
    {
      source: `26 U.S.C. § 25C(b)(4)(A); ${F5695_2025}`,
      section: "§ 25C(b)(4)(A)",
      url: URL_I5695,
      excerpt: "'(4) Doors. The credit… shall not exceed— (A) $250 in the case of any exterior door'. Line 19c: 'Multiply line 19a by 30% (0.30). Do not enter more than $250'.",
    },
    min(pctOf(fact("exteriorDoorMostExpensiveCost"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "25000", type: "money" } } },
  ),
  line(
    "improvement.line19g",
    "Form 5695 line 19g — 30% of all other qualifying exterior doors (line 19f)",
    {
      source: `26 U.S.C. § 25C(a)(1), (c)(2)(C); ${F5695_2025}`,
      section: "§ 25C(a)(1)",
      url: URL_I5695,
      excerpt: "Line 19f: 'Add lines 19d and 19e' (the two next most expensive doors and all other qualifying exterior doors); line 19g: 'Multiply line 19f by 30% (0.30)'.",
    },
    pctOf(fact("exteriorDoorOtherCosts"), `${J}.energy.improvement.rate`),
  ),
  line(
    "improvement.line19h",
    "Form 5695 line 19h — exterior doors: lines 19c + 19g, not more than $500",
    {
      source: `26 U.S.C. § 25C(b)(4)(B); ${F5695_2025}`,
      section: "§ 25C(b)(4)(B)",
      url: URL_I5695,
      excerpt: "'(B) $500 in the aggregate with respect to all exterior doors.' Line 19h: 'Add lines 19c and 19g. Do not enter more than $500'.",
    },
    min(add(ruleRef(`${J}.energy.improvement.line19c`), ruleRef(`${J}.energy.improvement.line19g`)), param("cap")),
    { parameters: { cap: { value: "50000", type: "money" } } },
  ),
  line(
    "improvement.line20d",
    "Form 5695 line 20d — exterior windows and skylights: 30% of line 20c, not more than $600",
    {
      source: `26 U.S.C. § 25C(b)(3); ${F5695_2025}`,
      section: "§ 25C(b)(3)",
      url: URL_I5695,
      excerpt: "'(3) Windows. The credit… shall not exceed, in the aggregate with respect to all exterior windows and skylights, $600.' Line 20c: 'Add lines 20a and 20b'; line 20d: 'Multiply line 20c by 30% (0.30). Enter the results. Do not enter more than $600'.",
    },
    min(pctOf(fact("windowsSkylightsCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "60000", type: "money" } } },
  ),
  line(
    "improvement.line22d",
    "Form 5695 line 22d — central air conditioners: 30% of line 22c, not more than $600",
    {
      source: `26 U.S.C. § 25C(b)(2), (d)(2)(A)(iii); ${F5695_2025}`,
      section: "§ 25C(b)(2)",
      url: URL_I5695,
      excerpt: "'(2) Energy property. The credit… shall not exceed, with respect to any item of qualified energy property, $600.' Line 22c: 'Add lines 22a and 22b'; line 22d: 'Multiply line 22c by 30% (0.30). Enter the results. Do not enter more than $600' — the printed form applies the $600 to the line (all central air conditioners together). Include labor for onsite preparation, assembly and original installation (Section B).",
    },
    min(pctOf(fact("centralAirConditionerCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "60000", type: "money" } } },
  ),
  line(
    "improvement.line23d",
    "Form 5695 line 23d — natural gas, propane or oil water heaters: 30% of line 23c, not more than $600",
    {
      source: `26 U.S.C. § 25C(b)(2), (d)(2)(A)(iv); ${F5695_2025}`,
      section: "§ 25C(b)(2)",
      url: URL_I5695,
      excerpt: "Line 23c: 'Add lines 23a and 23b'; line 23d: 'Multiply line 23c by 30% (0.30). Enter the results. Do not enter more than $600'.",
    },
    min(pctOf(fact("gasOilWaterHeaterCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "60000", type: "money" } } },
  ),
  line(
    "improvement.line24d",
    "Form 5695 line 24d — natural gas, propane or oil furnaces and hot water boilers: 30% of line 24c, not more than $600",
    {
      source: `26 U.S.C. § 25C(b)(2), (d)(2)(A)(v), (d)(2)(C); ${F5695_2025}`,
      section: "§ 25C(b)(2)",
      url: URL_I5695,
      excerpt: "Line 24c: 'Add lines 24a and 24b'; line 24d: 'Multiply line 24c by 30% (0.30). Enter the results. Do not enter more than $600'.",
    },
    min(pctOf(fact("gasOilFurnaceBoilerCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "60000", type: "money" } } },
  ),
  line(
    "improvement.line25e",
    "Form 5695 line 25e — panelboards, subpanelboards, branch circuits or feeders (enabling property): 30% of line 25c, not more than $600",
    {
      source: `26 U.S.C. § 25C(b)(2), (d)(2)(D); ${F5695_2025}`,
      section: "§ 25C(b)(2); § 25C(d)(2)(D)",
      url: URL_I5695,
      excerpt: "Line 25c: 'the cost of improvements or replacement of enabling property' — installed per the National Electric Code, load capacity of at least 200 amps, installed with a qualified energy efficiency improvement or qualified energy property in the same year (line 25a, attested); line 25e: 'Multiply line 25c by 30% (0.30). Enter the results. Do not enter more than $600'.",
    },
    min(pctOf(fact("electricalPanelCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "60000", type: "money" } } },
  ),
  line(
    "improvement.line26c",
    "Form 5695 line 26c — home energy audits: 30% of line 26b, not more than $150",
    {
      source: `26 U.S.C. § 25C(a)(3), (b)(6), (e); ${F5695_2025}`,
      section: "§ 25C(b)(6)(A)",
      url: URL_I5695,
      excerpt: "'(6) Home energy audits. (A) Dollar limitation. The amount of the credit allowed under this section by reason of subsection (a)(3) shall not exceed $150.' Line 26c: 'Multiply line 26b by 30% (0.30). Enter the results. Do not enter more than $150' — audit of the main home by a Qualified Home Energy Auditor with the written report (line 26a, attested).",
    },
    min(pctOf(fact("homeEnergyAuditCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "15000", type: "money" } } },
  ),
  line(
    "improvement.line27",
    "Form 5695 line 27 — lines 18b, 19h, 20d, 22d, 23d, 24d, 25e and 26c",
    {
      source: F5695_2025,
      section: "Line 27",
      url: URL_I5695,
      excerpt: "Line 27: 'Add lines 18b, 19h, 20d, 22d, 23d, 24d, 25e, and 26c'.",
    },
    add(
      ruleRef(`${J}.energy.improvement.line18b`),
      ruleRef(`${J}.energy.improvement.line19h`),
      ruleRef(`${J}.energy.improvement.line20d`),
      ruleRef(`${J}.energy.improvement.line22d`),
      ruleRef(`${J}.energy.improvement.line23d`),
      ruleRef(`${J}.energy.improvement.line24d`),
      ruleRef(`${J}.energy.improvement.line25e`),
      ruleRef(`${J}.energy.improvement.line26c`),
    ),
  ),
  line(
    "improvement.line28",
    "Form 5695 line 28 — the smaller of line 27 or $1,200 (the § 25C(b)(1) annual limit)",
    {
      source: `26 U.S.C. § 25C(b)(1); ${F5695_2025}`,
      section: "§ 25C(b)(1)",
      url: URL_25C,
      excerpt: "'(1) In general. The credit allowed under this section with respect to any taxpayer for any taxable year shall not exceed $1,200.' Line 28: 'Enter the smaller of line 27 or $1,200'.",
    },
    min(ruleRef(`${J}.energy.improvement.line27`), param("cap")),
    { parameters: { cap: { value: "120000", type: "money" } } },
  ),
  line(
    "improvement.line29h",
    "Form 5695 line 29h — heat pumps, heat pump water heaters, biomass stoves and boilers: 30% of line 29g, not more than $2,000",
    {
      source: `26 U.S.C. § 25C(b)(5), (d)(2)(A)(i)–(ii), (d)(2)(B); ${F5695_2025}`,
      section: "§ 25C(b)(5)",
      url: URL_25C,
      excerpt:
        "'(5) Heat pump and heat pump water heaters; biomass stoves and boilers. Notwithstanding paragraphs (1) and (2), the credit allowed under this section by reason of subsection (a)(2) with respect to any taxpayer for any taxable year shall not, in the aggregate, exceed $2,000 with respect to amounts paid or incurred for property described in clauses (i) and (ii) of subsection (d)(2)(A) and in subsection (d)(2)(B).' Line 29g: 'Add lines 29a through 29f'; line 29h: 'Multiply line 29g by 30% (0.30). Enter the results. Do not enter more than $2,000'.",
    },
    min(pctOf(fact("heatPumpBiomassCosts"), `${J}.energy.improvement.rate`), param("cap")),
    { parameters: { cap: { value: "200000", type: "money" } } },
  ),
  line(
    "improvement.line30",
    "Form 5695 line 30 — tentative energy efficient home improvement credit (lines 28 + 29h)",
    {
      source: `26 U.S.C. § 25C(a)–(b); ${F5695_2025}`,
      section: "§ 25C(a)–(b)",
      url: URL_I5695,
      excerpt: "Line 30: 'Add lines 28 and 29h'.",
    },
    add(ruleRef(`${J}.energy.improvement.line28`), ruleRef(`${J}.energy.improvement.line29h`)),
  ),
  line(
    "improvement.line31",
    "Form 5695 line 31 — limitation based on tax liability (Energy Efficient Home Improvement Credit Limit Worksheet)",
    {
      source: `26 U.S.C. § 26(a); ${F5695_2025}, Energy Efficient Home Improvement Credit Limit Worksheet—Line 31`,
      section: "Line 31 worksheet",
      url: URL_I5695,
      excerpt:
        "Worksheet line 1: Form 1040 line 18; line 2: the total of Schedule 3 line 6l, the foreign tax credit (line 1), the credit for child or dependent care expenses (line 2), the credit for the elderly or the disabled (line 6d), nonrefundable education credits (line 3) and the retirement savings contributions credit (line 4); line 3: 'Subtract line 2 from line 1… If zero or less, enter -0-'. [Modeled subtractions: §§ 21, 25A, 25B and 22 (Schedule R); the foreign tax credit and Form 8978 are not modeled. Line 18 is taken as regular tax + AMT.]",
    },
    max0(
      sub(
        limitBase,
        add(
          ruleRef("us.federal.cdcc"),
          ruleRef("us.federal.education.nonrefundable"),
          ruleRef("us.federal.savers_credit"),
          ruleRef("us.federal.schedule_r_credit"),
        ),
      ),
    ),
  ),
  line(
    "home_improvement_credit",
    "Energy efficient home improvement credit — Form 5695 line 32 → Schedule 3 line 5b",
    {
      source: `26 U.S.C. § 25C(a)–(b); § 26(a); ${F5695_2025}`,
      section: "§ 25C(a); § 26(a)",
      url: URL_I5695,
      excerpt: "Line 32: 'Energy efficient home improvement credit. Enter the smaller of line 30 or line 31. Also include this amount on Schedule 3 (Form 1040), line 5b'. Nonrefundable; § 25C has no carryforward.",
    },
    min(ruleRef(`${J}.energy.improvement.line30`), ruleRef(`${J}.energy.improvement.line31`)),
  ),
];
