/**
 * Business losses through AGI: the § 461(l) excess business loss (Form 461 →
 * Schedule 1 line 8p), the § 172 net operating loss deduction (Schedule 1
 * line 8a, with the 80% limit), the NOL a loss year generates (Form 172 Part
 * I), and the NOL carryovers to the next year (§ 172(b)(2)).
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. §§ 461(l) (made
 * permanent and re-indexed by OBBBA § 70601), 172(a)–(d); Form 461 and its
 * instructions (2025; 2026 draft); Form 172 (Dec. 2024) and its instructions
 * (Rev. Dec. 2024), which replaced Publication 536 after tax year 2023;
 * Schedule 1 (Form 1040) lines 8a and 8p; Reg. § 1.199A-3(b)(1)(v); the
 * § 461(l)(3)(A)(ii)(II) thresholds from Rev. Procs. 2024-40 § 2.32,
 * 2025-32 § 4.31 and 2026-35 § 3.33.
 *
 * Both Schedule 1 line 8 items reach gross income and the § 86 provisional
 * income through us.federal.schedule1_other_income, as contributions. The
 * NOL deduction's 80% base is taxable income evaluated EXCLUDING the
 * deduction — every AGI-dependent item (medical floor, Social Security,
 * phase-outs) recomputed without it — the literal "taxable income computed
 * without regard to the deductions under this section and sections 199A and
 * 250" (§ 172(a)(2)(B)(ii)(I)). No official source spells out whether those
 * items are refigured; this reading is disclosed in the citation.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const neg = (e: Expr): Expr => sub(zero, e);
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const pct = (base: Expr, num: string, den = "100"): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });

const NOL = "us.federal.nol_deduction";
const NOL_PRE = "us.federal.nol_deduction.pre2018";
const NOL_POST = "us.federal.nol_deduction.post2017";
const CAP_LOSS = "us.federal.capital_loss_against_ordinary_income.section1211";
/** a rule's value in the pass that leaves out the NOL deduction ("computed without regard to" it) */
const withoutNol = (ruleId: string): Expr => ({ kind: "rule", ruleId, excluding: [NOL_PRE, NOL_POST] });
/**
 * § 172(b)(2)(A) modified taxable income for one pool: the pass without the § 1211(b)
 * deduction ((d)(2)(A)) and without this pool's and later NOLs, so AGI and everything that
 * depends on it is refigured ("You must figure any item affected by the amount of your AGI
 * after making the changes", I172)
 */
const modified = (ruleId: string, excluding: string[]): Expr => ({ kind: "rule", ruleId, excluding: [...excluding, CAP_LOSS] });

const F461_URL = "https://www.irs.gov/forms-pubs/about-form-461";
const F172_URL = "https://www.irs.gov/forms-pubs/about-form-172";

// ---------------------------------------------------------------------------
// § 461(l): Form 461 lines 2–16

// trade-or-business income and loss other than Schedule E (Form 461 lines 2, 5 (K-1), 6);
// passive businesses count after § 469 (I8582: "allowable business losses after taking into
// account first the at-risk limitations and then the passive loss limitations")
const netLossOutsideE: Expr = sub(
  add(fact("scheduleCNetLoss"), fact("k1OrdinaryBusinessLoss")),
  add(ruleRef("us.federal.se_net_profit"), fact("k1OrdinaryBusinessIncome"), ruleRef("us.federal.passive.business_net")),
);
// Schedule E rental/royalty results (Form 461 line 5), counted only when a trade or business
const scheduleENet: Expr = sub(
  add(fact("scheduleENetIncome"), ruleRef("us.federal.rental.net_income"), ruleRef("us.federal.passive.rental_net")),
  fact("nonpassiveScheduleELoss"),
);
const isJoint: Expr = { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } };
const threshold: Expr = iff(isJoint, param("thresholdJoint"), param("threshold"));
const eblWithoutE = max0(sub(netLossOutsideE, threshold));
const eblWithE = max0(sub(sub(netLossOutsideE, scheduleENet), threshold));
const ebl: Expr = iff(
  { kind: "cmp", op: "eq", left: eblWithoutE, right: eblWithE },
  eblWithoutE, // the Schedule E classification doesn't change the answer: don't ask
  iff(fact("scheduleEIsTradeOrBusiness"), eblWithE, eblWithoutE),
);

// capital items are taken as investment (nonbusiness) items. Without capital GAINS the
// classification can't matter: a business capital loss is disallowed beyond business gains
// just like a nonbusiness one (Form 172 lines 2–4 and 11–15 give the same line 22), and only
// gains count in § 461(l) (Form 461 line 3 drops losses). With gains, in a loss year, it's asked.
const rawCapitalGains: Expr = add(fact("longTermCapitalGains"), fact("shortTermCapitalGains"));
const capitalItemsPresent: Expr = gt0(rawCapitalGains);
const capitalItemsNonbusiness = (e: Expr): Expr =>
  iff(
    gt0(ruleRef("us.federal.form4797.present")),
    {
      kind: "unsupported",
      reason:
        "a loss year with business property sales (Form 4797): their § 461(l) and § 172(d)(4) treatment (Form 461 lines 3–4; Form 172 lines 2–22) is not modeled",
    },
    iff(
    capitalItemsPresent,
    iff(
      fact("capitalItemsAreNonbusiness"),
      e,
      {
        kind: "unsupported",
        reason:
          "capital gains or losses from property used in a trade or business: their § 461(l) and § 172(d)(4) treatment (Form 461 line 3; Form 172 lines 11–14) is not modeled",
      },
    ),
    e,
    ),
  );

function eblRule(version: number, from: string, to: string, single: string, joint: string, source: string, year: string): Rule {
  return {
    id: "us.federal.excess_business_loss",
    version,
    jurisdiction: J,
    title: `Excess business loss — Form 461 line 16 → Schedule 1 line 8p (§ 461(l), TY${year})`,
    citation: {
      source: `26 U.S.C. § 461(l) as amended by Pub. L. 119-21 (OBBBA) § 70601; ${source}; Form 461 and Instructions`,
      section: "§ 461(l)(1)–(3); Form 461 lines 2–16; Schedule 1 line 8p",
      url: F461_URL,
      excerpt: `"An excess business loss is the amount by which the total deductions (computed without regard to any deduction allowed under section 172 or 199A) from your trades or businesses are more than your total gross income or gains from your trades or businesses, plus the threshold amount. Such excess losses should be determined without regard to any deductions, gross income, or gains attributable to any trade or business of performing services of an employee." (I461) Threshold for TY${year}: $${(Number(single) / 100).toLocaleString("en-US")} ($${(Number(joint) / 100).toLocaleString("en-US")} married filing jointly). "If the resulting figure on this line is a negative amount, then it's your excess business loss. [...] report the excess business loss adjustment as a positive number on the 'Other income' line [...] Schedule 1 (Form 1040), line 8p", and it "is treated as a net operating loss (NOL) carryover for subsequent years". [Counted: Schedule C/F profit and loss (both spouses), nonpassive K-1 ordinary business income and loss (after basis and at-risk), passive trade or business activities after the § 469 limits (us.federal.passive.business_net), and — when they are a trade or business (scheduleEIsTradeOrBusiness, asked only when it changes the answer) — Schedule E rental and royalty results, passive rentals after § 469 included. Wages are never counted. Form 4797 sales are refused in an excess-business-loss year and capital gains and losses must be investment items (capitalItemsAreNonbusiness, asked when there is an excess business loss and capital items), so no capital or § 1231 amount enters (Form 461 lines 3 and 4). Schedule 1 Part II adjustments are not pulled in, as Form 461 pulls only Schedule 1 lines 3–6 and Form 1040 line 7.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    contributesTo: "us.federal.schedule1_other_income",
    output: { type: "money" },
    parameters: {
      threshold: { value: single, type: "money" },
      thresholdJoint: { value: joint, type: "money" },
    },
    formula: iff(gt0(ebl), capitalItemsNonbusiness(ebl), zero),
  };
}

// ---------------------------------------------------------------------------
// § 172: the deduction (Schedule 1 line 8a)

const P = fact("nolCarryforwardPre2018");
const Q = fact("nolCarryforwardPost2017");
const tiWithoutNol = withoutNol("us.federal.taxable_income_before_qbi");
/** § 172(a)(2)(B)(ii): 80% of (taxable income without the NOL deduction and § 199A) over the pre-2018 NOLs */
const eightyPercentCap: Expr = pct(max0(sub(tiWithoutNol, P)), "80");
const post2017Deduction: Expr = min(Q, eightyPercentCap);
// QBI sources: a deducted excess-business-loss NOL reduces QBI (Reg. § 1.199A-3(b)(1)(v));
// every listed QBI business is already inside these two totals
const qbiSources: Expr = add(ruleRef("us.federal.se_net_profit"), fact("k1OrdinaryBusinessIncome"));

// ---------------------------------------------------------------------------
// Form 172 Part I: the NOL this year generates

// the same decision as us.federal.deduction_election (and the Form 6251 line 2a test)
const itemizing: Expr = {
  kind: "or",
  args: [
    fact("forceItemized"),
    {
      kind: "cmp",
      op: "gt",
      left: ruleRef("us.federal.itemized_deductions"),
      right: add(
        ruleRef("us.federal.standard_deduction"),
        ruleRef("us.federal.charitable_deduction_nonitemizer"),
        fact("casualtyQualifiedDisasterLosses"),
      ),
    },
  ],
};
// line 1: AGI minus the standard deduction or itemized deductions
const f172line1 = sub(ruleRef("us.federal.agi"), ruleRef("us.federal.deduction_election"));
// line 5: nonbusiness capital gains over nonbusiness capital losses (every capital fact is an investment item)
const f172line5 = add(ruleRef("us.federal.schedule_d.preferential_lt_gain"), ruleRef("us.federal.schedule_d.ordinary_st_gain"));
// line 6: nonbusiness deductions (I172 line 6 list), with the itemizer's business share taken out
const f172line6 = (businessItemized: Expr): Expr =>
  add(
    sub(ruleRef("us.federal.deduction_election"), businessItemized),
    ruleRef("us.federal.hsa_deduction"),
    ruleRef("us.federal.ira_deduction"),
    ruleRef("us.federal.sep_deduction"),
    ruleRef("us.federal.student_loan_interest_deduction"),
    fact("alimonyPaidPre2019"),
    fact("earlyWithdrawalPenaltyPaid"),
  );
// line 7: nonbusiness income other than capital gains (I172 line 7 list)
const f172line7 = add(
  fact("taxableInterest"),
  fact("ordinaryDividends"),
  fact("qualifiedDividends"),
  fact("taxableIraDistributions"),
  fact("taxablePensionsAndAnnuities"),
  ruleRef("us.federal.pension.simplified_method_taxable"),
  ruleRef("us.federal.taxable_social_security"),
  fact("alimonyReceivedPre2019"),
  fact("otherOrdinaryIncome"),
  max0(sub(fact("hsaDistributions"), fact("hsaQualifiedMedicalExpenses"))),
);
// line 9: nonbusiness deductions over nonbusiness income and net nonbusiness capital gain
const f172line9 = (businessItemized: Expr): Expr => max0(sub(f172line6(businessItemized), add(f172line5, f172line7)));
// lines 2–22 with every capital item nonbusiness: line 22 is the § 1211(b) loss actually deducted
const f172line22 = ruleRef("us.federal.capital_loss_ordinary_offset");
// line 23: this year's NOL deduction (added back)
const f172line23 = neg(ruleRef(NOL));
const f172line24 = (businessItemized: Expr): Expr => add(f172line1, f172line9(businessItemized), f172line22, f172line23);
// a business share of itemized deductions only lowers line 24, so when line 24 is not
// negative even with ALL of them business (and the capital loss too), there is no NOL and
// nothing is asked
// the lowest line 24 can be: all itemized deductions business and, with capital gains, every
// gain nonbusiness and every loss business (the largest line 5, and line 22 at zero)
const allItemizedBusiness = iff(itemizing, ruleRef("us.federal.deduction_election"), zero);
const f172line24Lowest = iff(
  capitalItemsPresent,
  add(f172line1, max0(sub(f172line6(allItemizedBusiness), add(rawCapitalGains, f172line7))), f172line23),
  f172line24(allItemizedBusiness),
);
const businessItemized: Expr = iff(
  itemizing,
  iff(
    { kind: "cmp", op: "gt", left: fact("itemizedDeductionsBusinessPortion"), right: ruleRef("us.federal.deduction_election") },
    { kind: "unsupported", reason: "itemizedDeductionsBusinessPortion can't exceed the itemized deductions taken" },
    fact("itemizedDeductionsBusinessPortion"),
  ),
  zero,
);
const unresolvedInNolYear = add(
  ruleRef("us.federal.tips_deduction"),
  ruleRef("us.federal.overtime_deduction"),
  ruleRef("us.federal.car_loan_interest_deduction"),
  fact("otherAdjustments"),
  fact("qsbsGain"),
  // a disaster loss is business when itemized (I172 line 6); the standard deduction increase isn't addressed
  iff(itemizing, zero, fact("casualtyQualifiedDisasterLosses")),
);

// ---------------------------------------------------------------------------
// § 172(b)(2): what each pool absorbs this year, and the carryover

/**
 * taxable income in that pass, NOT floored at zero, before § 199A and without the senior
 * deduction ((d)(3): a § 151 deduction); the § 1211(b) add-back is the pass itself
 */
const modifiedTaxableIncome = (excluding: string[]): Expr =>
  sub(
    modified("us.federal.agi", excluding),
    add(
      modified("us.federal.deduction_election", excluding),
      modified("us.federal.tips_deduction", excluding),
      modified("us.federal.overtime_deduction", excluding),
      modified("us.federal.car_loan_interest_deduction", excluding),
    ),
  );
// § 172(b)(2)(C): reduced by 20% of the § 172(a)(2)(B)(ii) excess
const twentyPercentOfExcess: Expr = pct(max0(sub(tiWithoutNol, P)), "20");
// the pre-2018 losses are the oldest: no NOL deduction at all; the post-2017 pool keeps the pre-2018 one
const absorbedPre2018: Expr = max0(sub(max0(modifiedTaxableIncome([NOL_PRE, NOL_POST])), twentyPercentOfExcess));
const absorbedPost2017: Expr = max0(sub(max0(modifiedTaxableIncome([NOL_POST])), twentyPercentOfExcess));

const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const I172_EXCERPT_80 =
  '"There shall be allowed as a deduction for the taxable year an amount equal to [...] (2) in the case of a taxable year beginning after December 31, 2020, the sum of— (A) the aggregate amount of net operating losses arising in taxable years beginning before January 1, 2018, carried to such taxable year, plus (B) the lesser of— (i) the aggregate amount of net operating losses arising in taxable years beginning after December 31, 2017, carried to such taxable year, or (ii) 80 percent of the excess (if any) of— (I) taxable income computed without regard to the deductions under this section and sections 199A and 250, over (II) the amount determined under subparagraph (A)." (§ 172(a))';

export const businessLossRules: Rule[] = [
  {
    id: "us.federal.schedule1_other_income",
    version: 1,
    jurisdiction: J,
    title: "Schedule 1 line 8 items computed by the engine: 8a NOL deduction (negative) and 8p § 461(l) excess business loss adjustment",
    citation: {
      source: "Schedule 1 (Form 1040) lines 8a, 8p and instructions; 26 U.S.C. §§ 172, 461(l)",
      section: "Schedule 1 lines 8a, 8p",
      url: "https://www.irs.gov/forms-pubs/about-schedule-1-form-1040",
      excerpt:
        'Line 8a: "Net operating loss (NOL) deduction. Enter any deduction for an NOL from an earlier year. Enter the amount in the preprinted parentheses (as a negative number)." Line 8p: "461(l) excess business loss adjustment. Enter the amount of your excess business loss from Form 461, line 16." (2025 Instructions for Form 1040) [Both items are contributions to this total; it is part of gross income and of § 86 provisional income.]',
    },
    ...FROM,
    output: { type: "money" },
    formula: zero,
  },
  // v1–v3 had no passive activities (§ 469 by activity); v4–v6 didn't refuse Form 4797 sales in an excess-business-loss year
  eblRule(7, "2025-01-01", "2026-01-01", "31300000", "62600000", "Rev. Proc. 2024-40 § 2.32", "2025"),
  eblRule(8, "2026-01-01", "2027-01-01", "25600000", "51200000", "Rev. Proc. 2025-32 § 4.31 (base year moved to 2024 by OBBBA § 70601(b))", "2026"),
  eblRule(9, "2027-01-01", "2028-01-01", "26400000", "52800000", "Rev. Proc. 2026-35 § 3.33", "2027"),
  {
    id: NOL,
    version: 1,
    jurisdiction: J,
    title: "Net operating loss deduction — Schedule 1 line 8a (§ 172(a), 80% limit for post-2017 NOLs), as a negative amount",
    citation: {
      source: "26 U.S.C. § 172(a), (b)(1)(A); Instructions for Form 172 (Rev. December 2024); Schedule 1 line 8a",
      section: "§ 172(a)(2)",
      url: F172_URL,
      excerpt: `${I172_EXCERPT_80} [The pre-2018 and the post-2017 parts, each its own contribution to Schedule 1 line 8.]`,
    },
    ...FROM,
    output: { type: "money" },
    formula: add(ruleRef(NOL_PRE), ruleRef(NOL_POST)),
  },
  {
    id: NOL_PRE,
    version: 1,
    jurisdiction: J,
    title: "NOL deduction for losses from tax years before 2018 — deducted in full (§ 172(a)(2)(A)), as a negative amount",
    citation: {
      source: "26 U.S.C. § 172(a)(2)(A), (b)(1)(A)(ii)(I)",
      section: "§ 172(a)(2)(A)",
      url: "https://www.law.cornell.edu/uscode/text/26/172",
      excerpt: `${I172_EXCERPT_80} [No limit applies to the pre-2018 aggregate; taxable income then floors at zero (Form 1040 line 15). Each loss is usable for 20 years after its loss year, which the engine does not track: enter only live losses.]`,
    },
    ...FROM,
    contributesTo: "us.federal.schedule1_other_income",
    output: { type: "money" },
    formula: iff(gt0(P), neg(P), zero),
  },
  {
    id: NOL_POST,
    version: 1,
    jurisdiction: J,
    title: "NOL deduction for losses from 2018 and later — limited to 80% of taxable income without the NOL deduction (§ 172(a)(2)(B)), as a negative amount",
    citation: {
      source: "26 U.S.C. § 172(a)(2)(B); Instructions for Form 172 (Rev. December 2024); Reg. § 1.199A-3(b)(1)(v)",
      section: "§ 172(a)(2)(B)",
      url: F172_URL,
      excerpt: `${I172_EXCERPT_80} "Further, when carryforwards can be used, they can only offset 80% of taxable income in future years." (I172) [The 80% base is taxable income before § 199A evaluated without the NOL deduction, with every AGI-dependent item recomputed on AGI before the deduction — the literal reading; no official source states how those items are treated. A deducted NOL that came from an excess business loss reduces QBI (Reg. § 1.199A-3(b)(1)(v)); when some is deducted with QBI present, that interaction is not modeled and the rule refuses.]`,
    },
    ...FROM,
    contributesTo: "us.federal.schedule1_other_income",
    output: { type: "money" },
    formula: iff(
      gt0(Q),
      iff(
        { kind: "cmp", op: "gt", left: fact("nolCarryforwardFromExcessBusinessLoss"), right: Q },
        { kind: "unsupported", reason: "nolCarryforwardFromExcessBusinessLoss is part of nolCarryforwardPost2017 and can't exceed it" },
        iff(
          { kind: "and", args: [gt0(fact("nolCarryforwardFromExcessBusinessLoss")), gt0(post2017Deduction), gt0(qbiSources)] },
          {
            kind: "unsupported",
            reason:
              "an NOL carryover from an excess business loss reduces qualified business income in the year it is deducted (Reg. § 1.199A-3(b)(1)(v)); combining it with QBI is not modeled",
          },
          neg(post2017Deduction),
        ),
      ),
      zero,
    ),
  },
  {
    id: "us.federal.nol.taxable_income_without_nol",
    version: 1,
    jurisdiction: J,
    title: "Taxable income figured without the NOL deduction and § 199A (the § 172(a)(2)(B)(ii)(I) base)",
    citation: {
      source: "26 U.S.C. § 172(a)(2)(B)(ii)(I)",
      section: "§ 172(a)(2)(B)(ii)(I)",
      url: "https://www.law.cornell.edu/uscode/text/26/172",
      excerpt: `${I172_EXCERPT_80} [Evaluated with the NOL deduction left out, so AGI and everything that depends on it are as they would be without it.]`,
    },
    ...FROM,
    output: { type: "money" },
    formula: tiWithoutNol,
  },
  {
    id: "us.federal.nol.generated",
    version: 2, // v1 didn't refuse Form 4797 sales in a loss year
    jurisdiction: J,
    title: "Net operating loss this year generates — Form 172 Part I line 24 (as a positive amount; excludes the excess business loss)",
    citation: {
      source: "26 U.S.C. § 172(c), (d); Form 172 (Dec. 2024) Part I and Instructions (Rev. Dec. 2024)",
      section: "§ 172(c)–(d); Form 172 lines 1–24",
      url: F172_URL,
      excerpt:
        '"the term \'net operating loss\' means the excess of the deductions allowed by this chapter over the gross income. Such excess shall be computed with the modifications specified in subsection (d)." (§ 172(c)) Line 1: "For individuals, subtract your standard deduction or itemized deductions from your adjusted gross income (AGI)". Line 6 (nonbusiness deductions): "Health savings account deduction, [...] Deductions for payments on behalf of a self-employed individual to a SEP, SIMPLE, or qualified plan, IRA deductions, Alimony paid, Most itemized deductions (except for casualty and theft losses resulting from a federally declared disaster and state income tax on trade or business income), and Standard deduction." Line 7 (nonbusiness income): "ordinary dividends, annuities, and interest on investments [...] Your taxable IRA distributions. Pension benefits. Social security benefits." Business income includes "Salaries and wages. Self-employment income. Unemployment compensation. Rental income." Line 23: "Enter the total amount of your NOL deduction for losses from other years." Line 24: "Combine lines 1, 9, 17, and 21 through 23. If the result is less than zero, enter it here." (I172) [Form 4797 sales are refused in a loss year and capital gains and losses must be investment (nonbusiness) items — attested by capitalItemsAreNonbusiness when the year has capital items and could have an NOL — so lines 2–22 reduce to adding back the § 1211(b) deduction; the senior deduction is a § 151 deduction (§ 172(d)(3)) and line 1 excludes it. The student loan interest deduction and the early withdrawal penalty are on neither printed list; both are personal or investment items, not "attributable to a taxpayer\'s trade or business" (§ 172(d)(4)), so they are nonbusiness. Educator expenses, the deductible half of self-employment tax and self-employed health insurance are business deductions (I172) and stay out of line 6. An itemizer enters the business share of itemized deductions (itemizedDeductionsBusinessPortion), asked only when the year could have an NOL. With Schedule 1-A tips, overtime or car-loan deductions, other adjustments or a § 1202 exclusion in a loss year, the business/nonbusiness split is unsettled and the rule refuses. The excess business loss (Schedule 1 line 8p) is already in AGI, so it is NOT in this amount; it carries over separately (us.federal.nol.carryover_post2017).]',
    },
    ...FROM,
    output: { type: "money" },
    formula: iff(
      { kind: "cmp", op: "lt", left: f172line24Lowest, right: zero },
      iff(
        gt0(unresolvedInNolYear),
        {
          kind: "unsupported",
          reason:
            "a loss year with Schedule 1-A tips/overtime/car-loan deductions, other Schedule 1 line 24 adjustments or a § 1202 exclusion: whether they are business or nonbusiness for § 172(d)(4) is not settled by the Form 172 instructions",
        },
        capitalItemsNonbusiness(max0(neg(f172line24(businessItemized)))),
      ),
      zero,
    ),
  },
  {
    id: "us.federal.nol.carryover_pre2018",
    version: 1,
    jurisdiction: J,
    title: "Pre-2018 NOL carried to next year (§ 172(b)(2))",
    citation: {
      source: "26 U.S.C. § 172(b)(2), (d); Instructions for Form 172 (Rev. December 2024)",
      section: "§ 172(b)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/172",
      excerpt:
        '"The portion of such loss which shall be carried to each of the other taxable years shall be the excess, if any, of the amount of such loss over the sum of the taxable income for each of the prior taxable years to which such loss may be carried. For purposes of the preceding sentence, the taxable income for any such prior taxable year shall— (A) be computed with the modifications specified in subsection (d) other than paragraphs (1), (4), and (5) thereof, and by determining the amount of the net operating loss deduction without regard to the net operating loss for the loss year or for any taxable year thereafter, (B) not be considered to be less than zero, and (C) for taxable years beginning after December 31, 2020, be reduced by 20 percent of the excess (if any) described in subsection (a)(2)(B)(ii) for such taxable year." [Modified taxable income adds back the § 1211(b) capital loss deduction ((d)(2)(A)) and leaves out the senior deduction ((d)(3)); § 199A is already excluded. It is evaluated without the § 1211(b) deduction and without the NOL deductions for this pool and later ones, so Social Security, phase-outs and the other AGI-dependent items are refigured, as I172 directs ("You must figure any item affected by the amount of your AGI after making the changes"). The pre-2018 NOLs are the oldest. Each loss keeps its own 20-year limit, which the engine does not track: drop any that expire.]',
    },
    ...FROM,
    output: { type: "money" },
    formula: iff(gt0(P), max0(sub(P, absorbedPre2018)), zero),
  },
  {
    id: "us.federal.nol.carryover_post2017",
    version: 1,
    jurisdiction: J,
    title: "Post-2017 NOL carried to next year: unabsorbed carryover + this year's NOL + this year's excess business loss",
    citation: {
      source: "26 U.S.C. §§ 172(b)(1)(A)(ii)(II), (b)(2), 461(l)(2); Instructions for Form 172 (Rev. December 2024)",
      section: "§ 172(b)(2); § 461(l)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/172",
      excerpt:
        '§ 172(b)(2) as quoted for the pre-2018 carryover, applied after the pre-2018 NOLs (whose deduction counts in this loss\'s modified taxable income). "Any loss which is disallowed under paragraph (1) shall be treated as a net operating loss for the taxable year for purposes of determining any net operating loss carryover under section 172(b) for subsequent taxable years." (§ 461(l)(2)) "Excess business losses that are disallowed are treated as an NOL carryover to the following tax year." (I172) [Post-2017 NOLs carry forward indefinitely. Several post-2017 loss years absorb in order, oldest first; their total carryover is the same as one pool\'s.]',
    },
    ...FROM,
    output: { type: "money" },
    formula: add(
      iff(gt0(Q), max0(sub(Q, absorbedPost2017)), zero),
      ruleRef("us.federal.nol.generated"),
      ruleRef("us.federal.excess_business_loss"),
    ),
  },
  {
    id: "us.federal.capital_loss_against_ordinary_income",
    version: 1,
    jurisdiction: J,
    title: "Capital loss deducted against ordinary income (Form 1040 line 7, § 1211(b)), as a positive amount — the total gross income subtracts",
    citation: {
      source: "26 U.S.C. §§ 1211(b), 172(b)(2)(A), (d)(2)(A); Instructions for Form 172 (Rev. December 2024)",
      section: "§ 1211(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/1211",
      excerpt:
        'The § 1211(b) deduction (up to $3,000, $1,500 married filing separately) as a contribution, so the § 172(b)(2) modified taxable income can be figured without it with AGI refigured: "You must figure any item affected by the amount of your AGI after making the changes in (1), (2), and (3) above" (I172, Modified taxable income).',
    },
    ...FROM,
    output: { type: "money" },
    formula: zero,
  },
  {
    id: CAP_LOSS,
    version: 1,
    jurisdiction: J,
    title: "The § 1211(b) capital loss deduction, contributed to the amount gross income subtracts",
    citation: {
      source: "26 U.S.C. § 1211(b)",
      section: "§ 1211(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/1211",
      excerpt: "us.federal.capital_loss_ordinary_offset, unchanged.",
    },
    ...FROM,
    contributesTo: "us.federal.capital_loss_against_ordinary_income",
    output: { type: "money" },
    formula: ruleRef("us.federal.capital_loss_ordinary_offset"),
  },
];
