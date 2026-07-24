/**
 * Pennsylvania deep state pack — TY2025 (+TY2026 where verified), encoded from
 * primary sources 2026-07-24: 2025 PA-40 form + instructions (rev 04-25),
 * 2025 PA Schedules SP / O / DC + instructions, 72 P.S. §§ 7302/7303 (current
 * as of Jan 1, 2026), PA DOR Working Pennsylvanians Tax Credit pages.
 *
 * PA is a CLASS-BASED system, not a federal-AGI-based one: eight income
 * classes, losses confined to their class (and their spouse), no carryovers,
 * no standard deduction, no personal exemptions. The class facts here are
 * TRANSCRIBED separately from the federal facts because PA classification
 * diverges from federal (capital-gain distributions are dividends; 401(k)
 * deferrals are taxable compensation; retirement income of eligible retirees
 * is exempt entirely).
 */
import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, ruleRef } from "./state-helpers.js";

const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const isMarried: Expr = {
  kind: "or",
  args: [
    { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
    { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfs" } },
  ],
};

/**
 * Schedule SP forgiveness percentage applied to net tax: printed-table
 * if-chain. t100 = base + $9,500/dependent; each +$250 of eligibility income
 * drops the percentage 10 points (100% .. 10%, then 0). Encoded as the
 * printed thresholds verbatim rather than derived arithmetic so the proof
 * mirrors the table the filer reads.
 */
const spForgiveness = (netTax: Expr, ei: Expr, t100: Expr): Expr => {
  let expr: Expr = money("0"); // eligibility income above the 10% column
  for (let k = 9; k >= 0; k--) {
    expr = {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "le",
        left: ei,
        right: k === 0 ? t100 : add(t100, money(String(k * 25000))),
      },
      then: {
        kind: "mulRate",
        base: netTax,
        rate: { num: String(100 - 10 * k), den: "100" },
        round: "half-up",
      },
      else: expr,
    };
  }
  return expr;
};

/** PA-40 Line 9 for a given year window (structure is statutory, 72 P.S. § 7303). */
const taxableIncomeRule = (version: number, from: string, to: string): Rule => ({
  id: "us.pa.taxable_income",
  version,
  jurisdiction: "us.pa",
  title: "Pennsylvania total taxable income (PA-40 line 9) — positive class amounts only",
  citation: {
    source: "72 P.S. § 7303(a)(1)-(8); 2025 PA-40 Instructions (rev 04-25) pp. 8-20",
    section: "72 P.S. § 7303; PA-40 lines 1a-9",
    url: "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40in.pdf",
    excerpt:
      "Line 9 (2025 PA-40, verbatim): 'Add only the positive income amounts from Lines 1c, 2, 3, 4, 5, 6, 7 and 8. DO NOT ADD any losses.' Eight classes per § 7303(a): compensation; interest; dividends (mutual-fund capital gains DISTRIBUTIONS are dividends, Line 3); net business/profession/farm; net gains from disposition of property; net rents/royalties/patents/copyrights; estate or trust income (cannot be negative); gambling and lottery winnings (noncash PA Lottery prizes exempt; cash prizes taxable, ticket costs for tickets bought on/after 1/1/2016 deductible from winnings). NO cross-class offset, NO carryforward/carryback, and NO spousal sharing: on a joint return, per class, one spouse's loss NEVER offsets the other's income (both-positive add; one-income-one-loss counts ONLY the income) — encoded as max0(taxpayer net) + max0(spouse net) for each loss-capable class (lines 4/5/6; PA-40 IN p.15, Mary & Ben examples). COMPENSATION: PA compensation is W-2 BOX 16, not Box 1 — 401(k)/elective deferrals ARE taxable compensation; IRA contributions are NOT deductible; supply the Box16-Box1 difference via paCompensationAdjustment (default 0 assumes Box 16 = Box 1). Retirement income is NOT compensation when paid by an eligible employer plan after meeting the plan's age/years-of-service conditions AND retiring (code 7), and Social Security / RR / military pensions / Civil Service annuities / SERS / PSERS are always exempt; early distributions (codes 1-2) and pre-59½ IRA distributions are taxable compensation under the COST RECOVERY method (distribution minus previously-taxed contributions; PA has NO federal-style early-withdrawal exceptions) — cost-recovery basis math is agent-composed into the class facts, disclosed. Unemployment compensation, workers' comp, third-party sick pay, child support, alimony, and W-2 box-10 dependent care up to $5,000 are not taxable. APPROXIMATIONS (disclosed): compensation and its unreimbursed-expense offset (Sch UE, line 1b) are modeled at the return level, not per spouse — a spouse whose UE exceeds own compensation on a joint return would be overstated (rare; compose per-spouse and supply via paCompensationAdjustment if it matters). Reciprocal compensation states (IN, MD, NJ, OH, VA, WV) and part-year/nonresident apportionment are out of scope for this resident-return target.",
  },
  effectiveFrom: from,
  effectiveTo: to,
  output: { type: "money" },
  formula: add(
    // line 1c: net compensation (never negative on the printed form)
    max0(
      sub(add(fact("wages"), fact("paCompensationAdjustment")), fact("paUnreimbursedBusinessExpenses")),
    ),
    fact("paInterestIncome"), // line 2 (gross class)
    fact("paDividendIncome"), // line 3 (gross class)
    max0(fact("paBusinessNetIncome")), // line 4, taxpayer
    max0(fact("paSpouseBusinessNetIncome")), // line 4, spouse
    max0(fact("paPropertyGainNet")), // line 5, taxpayer
    max0(fact("paSpousePropertyGainNet")), // line 5, spouse
    max0(fact("paRentRoyaltyNet")), // line 6, taxpayer
    max0(fact("paSpouseRentRoyaltyNet")), // line 6, spouse
    fact("paEstateTrustIncome"), // line 7 (cannot be negative)
    fact("paGamblingWinnings"), // line 8 (gross class)
  ),
});

const otherDeductionsRule = (version: number, from: string, to: string): Rule => ({
  id: "us.pa.other_deductions",
  version,
  jurisdiction: "us.pa",
  title: "Pennsylvania other deductions (PA-40 line 10, Schedule O) — the exhaustive five",
  citation: {
    source: "2025 PA-40 Instructions (rev 04-25) pp. 9, 20-21; 2025 PA Schedule O + instructions",
    section: "PA-40 line 10; Schedule O",
    url: "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40o.pdf",
    excerpt:
      "'PA law does not allow standard deductions, deductions for personal exemptions, itemized deductions, or deductions for personal expenses' (PA-40 IN p.9). Exactly FIVE line-10 deductions exist for 2025: (M) Medical Savings Account contributions and (H) Health Savings Account contributions, each limited to the amount 'allowed for federal income tax purposes'; (S) STUDENT LOAN INTEREST — NEW for 2025 — up to $2,500 per taxable year (no PA income phase-out; the federal studentLoanInterest fact is reused as the interest-paid input and capped here); (T) IRC § 529 qualified tuition program contributions — maximum $19,000 PER BENEFICIARY, PER TAXPAYER-SPOUSE (2025; no deduction for 529-to-529 rollovers or beneficiary changes); (A) § 529A PA ABLE contributions capped at the annual federal gift-tax exclusion ($19,000 for 2025). The per-beneficiary 529 cap and the ABLE cap CANNOT be enforced without per-beneficiary detail — the caller must supply already-capped totals (disclosed). Line 10 cannot exceed line 9; the Schedule O Section III PER-SPOUSE cap (each spouse limited to own line-9 income) is approximated at the return level (disclosed). Unreimbursed employee business expenses are a line-1b class expense (Schedule UE), never a line-10 deduction. The 2026 federal gift-exclusion amount for the ABLE cap must be re-verified at 2026 encoding.",
  },
  effectiveFrom: from,
  effectiveTo: to,
  output: { type: "money" },
  parameters: {
    studentLoanInterestCap: { value: "250000", type: "money" }, // $2,500 (2025 PA cap)
    per529BeneficiaryCap: { value: "1900000", type: "money" }, // $19,000 (disclosure)
    ableGiftExclusionCap: { value: "1900000", type: "money" }, // $19,000 (2025)
  },
  formula: {
    kind: "min",
    args: [
      add(
        { kind: "min", args: [fact("studentLoanInterest"), { kind: "param", name: "studentLoanInterestCap" }] },
        fact("pa529Contributions"),
        fact("paAbleContributions"),
        fact("paMsaHsaContributions"),
      ),
      ruleRef("us.pa.taxable_income"),
    ],
  },
});

const incomeTaxRule = (version: number, from: string, to: string, yearLabel: string): Rule => ({
  id: "us.pa.income_tax",
  version,
  jurisdiction: "us.pa",
  title: `Pennsylvania income tax — 3.07% flat on adjusted PA taxable income (PA-40 line 12, ${yearLabel})`,
  citation: {
    source: "72 P.S. § 7302 (current as of Jan 1, 2026); 2025 PA-40 line 12",
    section: "72 P.S. § 7302",
    url: "https://codes.findlaw.com/pa/title-72-ps-taxation-and-fiscal-affairs/pa-st-sect-72-7302/",
    excerpt:
      "§ 7302 imposes 'three and seven hundredths per cent' (3.07%) on residents' taxable income; PA-40 line 12: 'Multiply Line 11 by 3.07 percent (0.0307)', where line 11 = line 9 total PA taxable income minus line 10 other deductions. Rate verified unchanged for TY2026 (statute text current as of Jan 1, 2026; the Senate's proposed 2.8% cut was NOT enacted). This target computes GROSS tax (line 12); Tax Forgiveness (Schedule SP) is the separate us.pa.tax_forgiveness target, and the resident credit / WPTC / PA CDCC net against tax in the return composition. Local earned income tax (Act 32) is filed separately with local collectors and is out of scope. Rounding: PA-40 uses whole dollars (drop <$0.50, round up ≥$0.50 = half-up). Filing threshold: PA gross taxable income over $33 (or any loss transaction) requires a return.",
  },
  effectiveFrom: from,
  effectiveTo: to,
  output: { type: "money" },
  parameters: {
    filingThreshold: { value: "3300", type: "money" }, // $33 gross-income filing trigger
  },
  formula: rd({
    kind: "mulRate",
    base: max0(sub(ruleRef("us.pa.taxable_income"), ruleRef("us.pa.other_deductions"))),
    rate: { num: "307", den: "10000" },
    round: "half-up",
  }),
});

export const paRules: Rule[] = [
  taxableIncomeRule(1, "2025-01-01", "2027-01-01"),
  otherDeductionsRule(1, "2025-01-01", "2027-01-01"),
  incomeTaxRule(2, "2025-01-01", "2026-01-01", "TY2025"),
  incomeTaxRule(3, "2026-01-01", "2027-01-01", "TY2026 — rate unchanged"),
  {
    id: "us.pa.tax_forgiveness",
    version: 1,
    jurisdiction: "us.pa",
    title: "Pennsylvania Tax Forgiveness credit (Schedule SP, 72 P.S. § 7304) — PA-40 line 21",
    citation: {
      source:
        "72 P.S. § 7304; 2025 PA Schedule SP + instructions (PA-40 SP IN 04-25); 2025 PA-40 Instructions p. 36-39 (eligibility income tables)",
      section: "Schedule SP Sections III-IV; PA-40 lines 19a-21",
      url: "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40sp.pdf",
      excerpt:
        "Printed 2025 eligibility-income tables (statutory, NOT indexed — structure verified against every printed cell): unmarried/separated/deceased base $6,500 at 100% forgiveness; MARRIED (even filing separately, using JOINT eligibility income) base $13,000; PLUS $9,500 per dependent child on every column; each additional $250 of eligibility income drops the forgiveness percentage 10 points (100/90/.../10%), so income beyond base+dependents+$2,250 gets nothing. Forgiveness applies to line 12 tax MINUS the line 22 resident credit (SP Section IV: the resident credit subtracts BEFORE forgiveness), never below zero. ELIGIBILITY INCOME = PA-40 line 9 taxable income PLUS nontaxable add-backs supplied via paEligibilityIncomeAddbacks: nontaxable interest/dividends/gains, alimony received, insurance proceeds and inheritances (incl. 1099-R code-4 box 1), gifts/awards/prizes (incl. noncash PA Lottery), non-PA income, nontaxable military pay (not combat), excluded home-sale gain, nontaxable educational assistance, and outside cash support (foster payments, spousal support from outside the household, cafeteria-plan benefits). NOT added back: Social Security/RRB, eligible retirement benefits, child support, military pensions, workers' comp, personal-injury damages, sick/disability pay. DEPENDENT = a CHILD (natural/adopted/step; grandchild of a grandparent; foster child of a foster parent — never aunts/uncles/unrelated persons) claimable as a federal dependent; adult qualifying children count. A claimant who is someone else's federal dependent is ineligible unless that person also qualifies (not modeled — disclose). 'Separated' (apart the last six months of the year or under written separation agreement) uses the unmarried table — supply via filingStatus; QSS/widowed is NOT married (Table 1); MFS IS married (Table 2, joint eligibility income — return-level approximation disclosed). Deceased-claimant annualization not modeled (refuse-by-disclosure). Defaults are CONSERVATIVE: paSpDependentChildren defaults to 0 (understates the threshold, never overstates the credit).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      baseUnmarried: { value: "650000", type: "money" }, // $6,500
      baseMarried: { value: "1300000", type: "money" }, // $13,000
      perDependentChild: { value: "950000", type: "money" }, // $9,500
      stepWidth: { value: "25000", type: "money" }, // $250 per 10-point drop
    },
    formula: rd(
      spForgiveness(
        // net tax: line 12 minus resident credit, floored at zero
        max0(sub(ruleRef("us.pa.income_tax"), fact("paResidentCredit"))),
        // eligibility income: line 9 + add-backs
        add(ruleRef("us.pa.taxable_income"), fact("paEligibilityIncomeAddbacks")),
        // 100% threshold: base + $9,500 x dependent children
        add(
          { kind: "if", cond: isMarried, then: { kind: "param", name: "baseMarried" }, else: { kind: "param", name: "baseUnmarried" } },
          { kind: "mulInt", base: { kind: "param", name: "perDependentChild" }, count: fact("paSpDependentChildren") },
        ),
      ),
    ),
  },
  {
    id: "us.pa.cdcc",
    version: 1,
    jurisdiction: "us.pa",
    title:
      "Pennsylvania Child and Dependent Care Enhancement Tax Credit (Schedule DC) — 100% of the federal § 21 credit, refundable (TY2025)",
    citation: {
      source: "2025 PA Schedule DC + instructions (PA-40 DC IN 04-25); 2025 PA-40 Instructions pp. 22-23",
      section: "Schedule DC; PA-40 line 23",
      url: "https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforindividuals/pit/documents/2025/2025_pa-40dc.pdf",
      excerpt:
        "2025 Schedule DC: for PA residents receiving the federal IRC § 21 credit, 'the credit is 100 percent of that amount' — the federal Form 2441 LINE 9a tentative credit (expenses capped $3,000 one / $6,000 two-or-more qualifying persons at the 35%→20% AGI slide), i.e. the PRE-liability-limit federal amount, because the PA credit is REFUNDABLE. Encoded as 100% of us.federal.cdcc.tentative (which already carries the § 21 expense caps, earned-income limits, AGI percentage slide, and the MFS disallowance). The DC chart's printed caps ($1,050/$600 one dependent, $2,100/$1,200 two-plus at the $43,000 household-income break) are the federal formula's own outputs, not separate limits. Federal Form 2441 + Schedule 3 must be attached or DOR removes the credit (procedural, not modeled). TY2025 window only: the TY2026 federal § 21 percentages change under OBBBA § 70405 and PA's 100%-match treatment for 2026 was not yet verified at encoding — extend only after re-verification (refuses loudly for 2026 rather than guessing).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: rd(ruleRef("us.federal.cdcc.tentative")),
  },
  {
    id: "us.pa.wptc",
    version: 1,
    jurisdiction: "us.pa",
    title:
      "Working Pennsylvanians Tax Credit — 10% of the federal EITC, max $805, refundable (first PA state EITC, TY2025+)",
    citation: {
      source:
        "2025-26 Pennsylvania budget (signed Nov 12, 2025); PA DOR Working Pennsylvanians Tax Credit page; PA DOR press release Jan 27, 2026 (web-verified 2026-07-24)",
      section: "PA DOR WPTC guidance",
      url: "https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax/working-pennsylvanians-tax-credit",
      excerpt:
        "DOR: 'If you receive the federal EITC, you automatically qualify' — the credit is 10 percent of the federal Earned Income Tax Credit, maximum $805, REFUNDABLE, and 'the Department of Revenue will automatically calculate your WPTC' from the attached federal 1040. Effective beginning with the 2026 filing season (TY2025 returns, per the DOR's Jan 27, 2026 press release promoting the credit for the then-current season). NOTE: the printed 2025 PA-40 (rev 04-25, which predates the November 2025 budget) has NO WPTC line — DOR applies it in processing; composers should report it as a DOR-applied credit note. CAVEAT (disclosed): the statutory text's effective-tax-year language should be re-verified against the enrolled act when published; this encoding follows the agency's own filing-season guidance. The $805 cap can bind only via rounding in TY2025 (max federal EITC $8,046 → 10% = $804.60).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "10", type: "int" },
      cap: { value: "80500", type: "money" }, // $805
    },
    formula: rd({
      kind: "min",
      args: [
        { kind: "mulRate", base: ruleRef("us.federal.eitc"), rate: { num: "10", den: "100" }, round: "half-up" },
        { kind: "param", name: "cap" },
      ],
    }),
  },
];
