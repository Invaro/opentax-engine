/**
 * Capital-loss limitation and carryover — 26 U.S.C. §§ 1211(b), 1212(b).
 *
 * The fact model takes the NET result of Schedule D's netting: either a net
 * capital gain (`longTermCapitalGains` and/or `shortTermCapitalGains`) or a
 * net capital loss (`netCapitalLoss`, entered positive) — never both;
 * entering a gain fact alongside a loss refuses (qualifiedDividends is NOT a
 * capital asset and is unaffected — it may coexist with netCapitalLoss).
 *
 * § 1211(b): losses are allowed against ordinary income up to $3,000
 * ($1,500 for a married individual filing separately).
 * § 1212(b): the remainder carries to the following year, short-term and
 * long-term separately (the Schedule D instructions' Capital Loss Carryover
 * Worksheet). § 1212(b)(2) treats as short-term gain only the lesser of the
 * § 1211(b) amount and adjusted taxable income, so a year with negative
 * taxable income carries forward more. The prior year's carryovers come back
 * in through priorYearShortTermCapitalLossCarryover and
 * priorYearLongTermCapitalLossCarryover (Schedule D lines 6 and 14).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });

// Capital Loss Carryover Worksheet line 4 and line 5
const used = ruleRef("us.federal.capital_loss_carryover.loss_used");
const stLoss = max0(sub(zero, ruleRef("us.federal.schedule_d.net_short_term")));

/** The character split needs the per-bucket facts; the overall netCapitalLoss has no character. */
const needsBuckets = (computation: Expr): Expr => ({
  kind: "if",
  cond: { kind: "cmp", op: "gt", left: fact("netCapitalLoss"), right: zero },
  then: {
    kind: "unsupported",
    reason:
      "the overall netCapitalLoss carries no short-term/long-term character — enter the per-bucket facts (shortTermCapitalLoss, longTermCapitalLoss, and the gains) to split the carryover",
  },
  else: computation,
});

const CITE = {
  source: "26 U.S.C. §§ 1211(b), 1212(b)",
  url: "https://www.law.cornell.edu/uscode/text/26/1211",
};

export const capitalLossRules: Rule[] = [
  {
    id: "us.federal.capital_loss_ordinary_offset",
    version: 3, // v2 predated schedule_d netting: the loss is now the § 1222(10) netted result (legacy netCapitalLoss passes through; mixed-bucket years compute), and the contradiction refusal lives in the schedule_d rules
    jurisdiction: J,
    title: "Capital loss allowed against ordinary income ($3,000 / $1,500 MFS limit)",
    citation: {
      ...CITE,
      section: "§ 1211(b)",
      excerpt:
        "…losses from sales or exchanges of capital assets shall be allowed only to the extent of the gains from such sales or exchanges, plus (if such losses exceed such gains) the lower of $3,000 ($1,500 in the case of a married individual filing a separate return), or the excess of such losses over such gains. [The loss here is the § 1222(10) net capital loss after Schedule D netting — computed by us.federal.schedule_d.net_loss from the per-bucket facts, or passed through from the legacy overall netCapitalLoss fact; contradictory fact combinations refuse there.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      limit: { value: "300000", type: "money" }, // $3,000
      limitMfs: { value: "150000", type: "money" }, // $1,500
    },
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.schedule_d.net_loss"),
        {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "eq",
            left: fact("filingStatus"),
            right: { kind: "enum", value: "mfs" },
          },
          then: param("limitMfs"),
          else: param("limit"),
        },
      ],
    },
  },
  {
    id: "us.federal.capital_loss_carryover.adjusted_taxable_income",
    version: 1,
    jurisdiction: J,
    title: "Adjusted taxable income for the capital loss carryover (§ 1212(b)(2)(B)), may be negative",
    citation: {
      ...CITE,
      section: "§ 1212(b)(2)(B)",
      excerpt:
        "…the term 'adjusted taxable income' means taxable income increased by the sum of— (i) the amount allowed for the taxable year under paragraph (1) or (2) of section 1211(b), and (ii) the deduction allowed for such year under section 151 or any deduction in lieu thereof. For purposes of the preceding sentence, any excess of the deductions allowed for the taxable year over the gross income for such year shall be taken into account as negative taxable income. [Capital Loss Carryover Worksheet lines 1–3: taxable income as it would be if Form 1040 line 15 could go below zero, plus the Schedule D line 21 loss. The § 151(d)(5) senior deduction is a § 151 deduction, so it is added back by (ii): this formula subtracts every deduction in us.federal.taxable_income_before_qbi except it, then the § 199A deduction.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: {
        kind: "add",
        args: [ruleRef("us.federal.agi"), ruleRef("us.federal.capital_loss_ordinary_offset")],
      },
      right: {
        kind: "add",
        args: [
          ruleRef("us.federal.deduction_election"),
          ruleRef("us.federal.tips_deduction"),
          ruleRef("us.federal.overtime_deduction"),
          ruleRef("us.federal.car_loan_interest_deduction"),
          ruleRef("us.federal.qbi_deduction"),
        ],
      },
    },
  },
  {
    id: "us.federal.capital_loss_carryover.loss_used",
    version: 1,
    jurisdiction: J,
    title: "Capital loss treated as used this year (§ 1212(b)(2)(A); carryover worksheet line 4)",
    citation: {
      ...CITE,
      section: "§ 1212(b)(2)(A)",
      excerpt:
        "…there shall be treated as a short-term capital gain in the taxable year an amount equal to the lesser of— (i) the amount allowed for the taxable year under paragraph (1) or (2) of section 1211(b), or (ii) the adjusted taxable income for such taxable year. [Capital Loss Carryover Worksheet line 4: the smaller of line 2 (the Schedule D line 21 loss) and line 3 (adjusted taxable income, if zero or less -0-).]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.capital_loss_ordinary_offset"),
        { kind: "max0", arg: ruleRef("us.federal.capital_loss_carryover.adjusted_taxable_income") },
      ],
    },
  },
  {
    id: "us.federal.capital_loss_carryover",
    version: 3, // v2 subtracted the full § 1211(b) amount even when taxable income could not absorb it (§ 1212(b)(2)), and had no character split
    jurisdiction: J,
    title: "Capital loss carryover to the following year (short-term + long-term)",
    citation: {
      ...CITE,
      section: "§ 1212(b)",
      excerpt:
        "…the excess of the net short-term capital loss over the net long-term capital gain for such year shall be a short-term capital loss in the succeeding taxable year, and… the excess of the net long-term capital loss over the net short-term capital gain for such year shall be a long-term capital loss in the succeeding taxable year. [The net capital loss less the amount § 1212(b)(2) treats as used: the sum of us.federal.capital_loss_carryover.short_term and .long_term. With the legacy overall netCapitalLoss fact the total is computed but the character split refuses.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.schedule_d.net_loss"),
        right: ruleRef("us.federal.capital_loss_carryover.loss_used"),
      },
    },
  },
  {
    id: "us.federal.capital_loss_carryover.short_term",
    version: 1,
    jurisdiction: J,
    title: "Short-term capital loss carryover to the following year (§ 1212(b)(1)(A))",
    citation: {
      ...CITE,
      section: "§ 1212(b)(1)(A), (b)(2)",
      excerpt:
        "…the excess of the net short-term capital loss over the net long-term capital gain for such year shall be a short-term capital loss in the succeeding taxable year… [Capital Loss Carryover Worksheet lines 5–8: the Schedule D line 7 loss, less line 4 and any Schedule D line 15 gain. Enter it next year as priorYearShortTermCapitalLossCarryover (Schedule D line 6).]",
    },
    ...FROM,
    output: { type: "money" },
    formula: needsBuckets(
      max0(sub(stLoss, add(used, max0(ruleRef("us.federal.schedule_d.net_long_term"))))),
    ),
  },
  {
    id: "us.federal.capital_loss_carryover.long_term",
    version: 1,
    jurisdiction: J,
    title: "Long-term capital loss carryover to the following year (§ 1212(b)(1)(B))",
    citation: {
      ...CITE,
      section: "§ 1212(b)(1)(B), (b)(2)",
      excerpt:
        "…the excess of the net long-term capital loss over the net short-term capital gain for such year shall be a long-term capital loss in the succeeding taxable year. [Capital Loss Carryover Worksheet lines 9–13: the Schedule D line 15 loss, less any Schedule D line 7 gain and whatever part of line 4 the short-term loss did not use. Enter it next year as priorYearLongTermCapitalLossCarryover (Schedule D line 14).]",
    },
    ...FROM,
    output: { type: "money" },
    formula: needsBuckets(
      max0(
        sub(
          max0(sub(zero, ruleRef("us.federal.schedule_d.net_long_term"))),
          add(max0(ruleRef("us.federal.schedule_d.net_short_term")), max0(sub(used, stLoss))),
        ),
      ),
    ),
  },
];
