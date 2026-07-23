/**
 * Income chain: gross income → above-the-line adjustments → AGI →
 * taxable income before § 199A → taxable income.
 *
 * Ordering notes encoded here:
 * - § 221 MAGI is AGI computed BEFORE the student-loan deduction, so the
 *   chain exposes agi_before_student_loan explicitly.
 * - § 199A is applied AFTER all other deductions, against taxable income
 *   computed without it — hence taxable_income_before_qbi.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const FROM = { effectiveFrom: "2025-01-01" }; // structural rules: open-ended

export const incomeRules: Rule[] = [
  {
    id: "us.federal.gross_income",
    version: 14, // v13 lacked taxable HSA distributions; // v11 predated the standalone shortTermCapitalGains/ordinaryDividends facts
    jurisdiction: J,
    title:
      "Gross income (simplified: wages + interest + capital gains (long/short-term) + qualified/ordinary dividends + SE net profit + K-1 pass-through income − allowed capital loss − § 911 exclusion)",
    citation: {
      source: "26 U.S.C. § 61(a); §§ 701, 1366(a); § 1211(b); § 1222(5)",
      section: "§ 61(a)(1)–(4); § 1366(a); § 1211(b); § 1222(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/61",
      excerpt:
        "gross income means all income from whatever source derived, including… compensation for services… gains derived from dealings in property… interest… dividends… annuities… pensions [and] distributions (§§ 61(a), 72, 85, 408(d)); net short-term capital gain (§ 1222(5)) and ordinary (non-qualified) dividends are taxed at ordinary rates, unlike net long-term capital gain/qualified dividends; other fully-includible ordinary income — gambling winnings, prizes, Alaska Permanent Fund dividends, jury duty pay (Schedule 1 line 8) — enters through the otherOrdinaryIncome fact; a partner's or S-corporation shareholder's share passes through under §§ 701–702 and 1366(a); social security benefits are included per the § 86 formula — reduced by the capital loss allowed against ordinary income under § 1211(b) (up to $3,000/$1,500 MFS) and by the \u00a7 911(a) foreign earned income exclusion (foreign earnings stay IN the wages/SE inputs; the exclusion subtracts here \u2014 the \u00a7 911(f) stacking override taxes the remainder at the right rates). [IRA/pension inputs are the TAXABLE amounts — Form 8606 basis and § 72 exclusion-ratio machinery attested.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: {
        kind: "add",
        args: [
          fact("wages"),
          fact("taxableInterest"),
          fact("longTermCapitalGains"),
          fact("qualifiedDividends"),
          fact("shortTermCapitalGains"),
          fact("ordinaryDividends"),
          fact("selfEmploymentNetProfit"),
          fact("k1OrdinaryBusinessIncome"),
          fact("taxableIraDistributions"),
          fact("taxablePensionsAndAnnuities"),
          fact("unemploymentCompensation"),
          fact("otherOrdinaryIncome"),
          fact("alimonyReceivedPre2019"),
          // § 223(f)(2): HSA distributions beyond qualified medical expenses
          {
            kind: "max0",
            arg: {
              kind: "sub",
              left: fact("hsaDistributions"),
              right: fact("hsaQualifiedMedicalExpenses"),
            },
          },
          fact("scheduleENetIncome"),
          ruleRef("us.federal.taxable_social_security"),
        ],
      },
      right: {
        kind: "add",
        args: [
          ruleRef("us.federal.capital_loss_ordinary_offset"),
          ruleRef("us.federal.feie.exclusion"),
          fact("nonpassiveScheduleELoss"),
          fact("scheduleCNetLoss"),
        ],
      },
    },
  },
  {
    id: "us.federal.above_the_line_adjustments",
    version: 5, // v4 lacked the Schedule 1 line-24 write-in adjustments (jury pay, reforestation, SUB repayments, § 501(c)(18)(D), discrimination/whistleblower attorney fees) — otherAdjustments, attested
    jurisdiction: J,
    title:
      "Above-the-line adjustments before the student-loan deduction (½ SE tax + HSA + SEP + SE health insurance + educator + early-withdrawal penalty)",
    citation: {
      source: "26 U.S.C. § 62(a)(1), (a)(2)(D), (a)(6), (a)(9), (a)(17), (a)(19)",
      section: "§ 62(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/62",
      excerpt:
        "adjusted gross income means gross income minus… the deduction allowed by section 164(f) [half of SE tax]… the deduction allowed by section 223 [HSA]… the deductions allowed by section 404 [self-employed retirement plans]… the deduction allowed by section 162(l) [self-employed health insurance]… the deductions… [for] expenses… of eligible educators (§ 62(a)(2)(D) — $300 cap PER ELIGIBLE EDUCATOR for 2025 (an MFJ couple of two educators deducts up to $600: use educatorExpenses for the taxpayer and spouseEducatorExpenses for the spouse, each capped separately), the 2025 indexed amount)… [and] penalties forfeited because of premature withdrawal of funds from time savings accounts or deposits (§ 62(a)(9), uncapped).",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      educatorCap: { value: "30000", type: "money" }, // $300 (2025)
    },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.se_tax_half_deduction"),
        ruleRef("us.federal.hsa_deduction"),
        ruleRef("us.federal.sep_deduction"),
        ruleRef("us.federal.sehi_deduction"),
        {
          kind: "min",
          args: [fact("educatorExpenses"), { kind: "param", name: "educatorCap" }],
        },
        // § 62(a)(2)(D): the $300 cap is PER eligible educator — a spouse who
        // is also an eligible educator gets their own cap
        {
          kind: "min",
          args: [fact("spouseEducatorExpenses"), { kind: "param", name: "educatorCap" }],
        },
        fact("earlyWithdrawalPenaltyPaid"),
        // pre-TCJA § 215/§ 62(a)(10): pre-2019-instrument alimony paid
        fact("alimonyPaidPre2019"),
        // Schedule 1 lines 24a-z write-in adjustments (attested total)
        fact("otherAdjustments"),
      ],
    },
  },
  {
    id: "us.federal.agi_before_student_loan",
    version: 2, // v1 predated the § 219 IRA deduction
    jurisdiction: J,
    title: "AGI before the student-loan deduction (§ 221(b)(2)(C) MAGI base)",
    citation: {
      source: "26 U.S.C. § 221(b)(2)(C); § 62(a)(7)",
      section: "§ 221(b)(2)(C)",
      url: "https://www.law.cornell.edu/uscode/text/26/221",
      excerpt:
        "'modified adjusted gross income' means adjusted gross income determined… without regard to this section… [The § 219 IRA deduction IS subtracted here — § 221 disregards only itself; § 219's own MAGI is computed one step earlier, without regard to both §§ 219 and 221.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: ruleRef("us.federal.gross_income"),
      right: {
        kind: "add",
        args: [
          ruleRef("us.federal.above_the_line_adjustments"),
          ruleRef("us.federal.ira_deduction"),
        ],
      },
    },
  },
  {
    id: "us.federal.agi",
    version: 2, // v1 had no above-the-line adjustments
    jurisdiction: J,
    title: "Adjusted gross income",
    citation: {
      source: "26 U.S.C. § 62(a)",
      section: "§ 62(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/62",
      excerpt:
        "the term 'adjusted gross income' means, in the case of an individual, gross income minus the following deductions…",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: ruleRef("us.federal.agi_before_student_loan"),
      right: ruleRef("us.federal.student_loan_interest_deduction"),
    },
  },
  {
    id: "us.federal.taxable_income_before_qbi",
    version: 2, // v1 was non-itemizer only (no Schedule A, no election)
    jurisdiction: J,
    title:
      "Taxable income before § 199A (standard-or-itemized election + OBBBA senior/tips/overtime/car-loan deductions)",
    citation: {
      source: "26 U.S.C. § 63(a), (b), as amended by Pub. L. 119-21 (OBBBA)",
      section: "§ 63(a), (b)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "A non-itemizer's taxable income is adjusted gross income minus the standard deduction and the deductions provided by §§ 151, 170(p), 199A, 224, 225, and 163(h)(4) (§ 63(b)); an electing itemizer subtracts itemized deductions in place of the standard deduction and § 170(p) (§ 63(a), (d), (e)). Computed here without the § 199A deduction (which § 199A applies against taxable income determined without regard to it).",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.agi"),
        right: {
          kind: "add",
          args: [
            ruleRef("us.federal.deduction_election"),
            ruleRef("us.federal.senior_deduction"),
            ruleRef("us.federal.tips_deduction"),
            ruleRef("us.federal.overtime_deduction"),
            ruleRef("us.federal.car_loan_interest_deduction"),
          ],
        },
      },
    },
  },
  {
    id: "us.federal.taxable_income",
    version: 5, // v4 predated the § 199A deduction
    jurisdiction: J,
    title: "Taxable income",
    citation: {
      source: "26 U.S.C. § 63(b); § 199A(a)",
      section: "§ 63(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "…taxable income equals the amount computed under § 63(b) less the deduction allowable under § 199A for qualified business income.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.taxable_income_before_qbi"),
        right: ruleRef("us.federal.qbi_deduction"),
      },
    },
  },
];
