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
    version: 2, // v1 predated the standalone shortTermCapitalGains fact (the "both entered" guard now also catches it)
    jurisdiction: J,
    title: "Capital loss allowed against ordinary income ($3,000 / $1,500 MFS limit)",
    citation: {
      ...CITE,
      section: "§ 1211(b)",
      excerpt:
        "…losses from sales or exchanges of capital assets shall be allowed only to the extent of the gains from such sales or exchanges, plus (if such losses exceed such gains) the lower of $3,000 ($1,500 in the case of a married individual filing a separate return), or the excess of such losses over such gains. [The fact model takes Schedule D's NET result — a net gain (long and/or short term) or a net loss, not both; both at once refuses rather than guess the netting.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      limit: { value: "300000", type: "money" }, // $3,000
      limitMfs: { value: "150000", type: "money" }, // $1,500
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("netCapitalLoss"), right: zero },
      then: {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            { kind: "cmp", op: "gt", left: fact("longTermCapitalGains"), right: zero },
            { kind: "cmp", op: "gt", left: fact("shortTermCapitalGains"), right: zero },
          ],
        },
        then: {
          kind: "unsupported",
          reason:
            "both a net capital gain and a net capital loss were entered — provide the single NET result of Schedule D netting",
        },
        else: {
          kind: "min",
          args: [
            fact("netCapitalLoss"),
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
      else: zero,
    },
  },
  {
    id: "us.federal.capital_loss_carryover",
    version: 1,
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
        left: fact("netCapitalLoss"),
        right: ruleRef("us.federal.capital_loss_ordinary_offset"),
      },
    },
  },
];
