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
 * § 1212(b): the remainder carries to the following year. The § 1212(b)(2)
 * adjustment that preserves carryover when taxable income is already
 * negative is NOT modeled (conservative: never overstates the carryover);
 * the short/long character split of the carryover is not tracked.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");

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
    id: "us.federal.capital_loss_carryover",
    version: 2, // v1 read the legacy netCapitalLoss fact directly; the netted schedule_d result also covers mixed-bucket years
    jurisdiction: J,
    title: "Capital loss carryover to the following year (simplified)",
    citation: {
      ...CITE,
      section: "§ 1212(b)",
      excerpt:
        "…the excess of the net capital loss over the amount allowed under § 1211(b) shall be treated as a capital loss in the succeeding taxable year. [Not modeled, disclosed: the § 1212(b)(2) adjustment that preserves carryover when taxable income is below the allowed amount (this rule never OVERstates the carryover), and the short-term/long-term character split.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.schedule_d.net_loss"),
        right: ruleRef("us.federal.capital_loss_ordinary_offset"),
      },
    },
  },
];
