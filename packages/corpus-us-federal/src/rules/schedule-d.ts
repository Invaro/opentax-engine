/**
 * Schedule D netting — 26 U.S.C. § 1222 (verified against the 2025 Schedule D
 * (Form 1040): line 16 combines the net short-term result (line 7) with the
 * net long-term result (line 15); character survives per § 1222).
 *
 * Inputs are the per-bucket NET results (each bucket one sign only):
 *   ST: shortTermCapitalGains XOR shortTermCapitalLoss
 *   LT: longTermCapitalGains  XOR longTermCapitalLoss
 * plus the prior year's loss carryovers (Schedule D lines 6 and 14), which
 * net into their own bucket first (lines 7 and 15), and the legacy overall
 * `netCapitalLoss`, which remains supported but is mutually exclusive with
 * every per-bucket and carryover fact. Contradictory combinations
 * refuse — these facts are definitionally net results, so "both" cannot
 * describe any real Schedule D.
 *
 * Outputs (signed):
 *   net_short_term       — line 7: ST gains − ST losses − ST carryover
 *   net_long_term        — line 15: LT gains − LT losses − LT carryover
 * Outputs (all non-negative; at most one of gain/loss sides nonzero):
 *   preferential_lt_gain — § 1222(11) net capital gain: net LT gain minus
 *                          net ST loss; the amount the § 1(h) stack prices
 *   ordinary_st_gain     — net ST gain minus net LT loss (§ 1222(9)): stays
 *                          ordinary-rate income
 *   net_loss             — § 1222(10) overall net loss (positive), feeding
 *                          the § 1211(b) $3,000/$1,500 offset and § 1212(b)
 *                          carryover
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });

const stG = fact("shortTermCapitalGains");
const stL = fact("shortTermCapitalLoss");
const ltG = fact("longTermCapitalGains");
const ltL = fact("longTermCapitalLoss");
const stCarry = fact("priorYearShortTermCapitalLossCarryover");
const ltCarry = fact("priorYearLongTermCapitalLossCarryover");
const legacyLoss = fact("netCapitalLoss");
const neg = (e: Expr): Expr => sub(zero, e);

/**
 * Contradiction guard shared by all three outputs, so ANY consumer surfaces
 * the refusal: a bucket fact is its bucket's net result (never both signs),
 * and the legacy overall netCapitalLoss cannot coexist with bucket facts.
 */
const CONTRADICTORY: Expr = or(
  and(gt0(stG), gt0(stL)),
  and(gt0(ltG), gt0(ltL)),
  and(gt0(legacyLoss), or(gt0(stG), gt0(ltG), gt0(stL), gt0(ltL), gt0(stCarry), gt0(ltCarry))),
);

// Schedule D line 7 and line 15, signed
const line7 = sub(sub(stG, stL), stCarry);
const line15 = sub(sub(ltG, ltL), ltCarry);

const refuse = (computation: Expr): Expr => ({
  kind: "if",
  cond: CONTRADICTORY,
  then: {
    kind: "unsupported",
    reason:
      "contradictory Schedule D facts — each capital fact is a NET result: a bucket takes a gain OR a loss (never both), and the overall netCapitalLoss cannot be combined with per-bucket or carryover facts",
  },
  else: computation,
});

const CITE = {
  source: "26 U.S.C. § 1222; 2025 Schedule D (Form 1040)",
  url: "https://www.law.cornell.edu/uscode/text/26/1222",
};

export const scheduleDRules: Rule[] = [
  {
    id: "us.federal.schedule_d.net_short_term",
    version: 1,
    jurisdiction: J,
    title: "Net short-term capital gain or (loss), Schedule D line 7, including the prior-year carryover",
    citation: {
      ...CITE,
      section: "§ 1212(b)(1)(A); § 1222(5), (6)",
      excerpt:
        "…the excess of the net short-term capital loss over the net long-term capital gain for such year shall be a short-term capital loss in the succeeding taxable year. [2025 Schedule D: line 6 is the short-term capital loss carryover; line 7 combines lines 1a through 6. Negative = a net short-term loss.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: refuse(line7),
  },
  {
    id: "us.federal.schedule_d.net_long_term",
    version: 1,
    jurisdiction: J,
    title: "Net long-term capital gain or (loss), Schedule D line 15, including the prior-year carryover",
    citation: {
      ...CITE,
      section: "§ 1212(b)(1)(B); § 1222(7), (8)",
      excerpt:
        "…the excess of the net long-term capital loss over the net short-term capital gain for such year shall be a long-term capital loss in the succeeding taxable year. [2025 Schedule D: line 14 is the long-term capital loss carryover; line 15 combines lines 8a through 14. Negative = a net long-term loss.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: refuse(line15),
  },
  {
    id: "us.federal.schedule_d.preferential_lt_gain",
    version: 2, // v1 had no prior-year carryovers
    jurisdiction: J,
    title: "Net capital gain (§ 1222(11)): net LT gain reduced by any net ST loss",
    citation: {
      ...CITE,
      section: "§ 1222(11)",
      excerpt:
        "The term 'net capital gain' means the excess of the net long-term capital gain for the taxable year over the net short-term capital loss for such year. [Schedule D: line 16 combines line 7 (net short-term) and line 15 (net long-term); when line 7 is a loss and line 15 a gain, the remainder keeps long-term character and prices through the § 1(h) stack. Inputs are per-bucket NET results; contradictory combinations refuse.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: refuse(max0(sub(line15, max0(neg(line7))))),
  },
  {
    id: "us.federal.schedule_d.ordinary_st_gain",
    version: 2, // v1 had no prior-year carryovers
    jurisdiction: J,
    title: "Net short-term capital gain surviving netting (§ 1222(5), (9)): ordinary-rate",
    citation: {
      ...CITE,
      section: "§ 1222(5), (9)",
      excerpt:
        "'Net short-term capital gain' means the excess of short-term capital gains for the taxable year over the short-term capital losses for such year… 'net long-term capital loss' means the excess of long-term capital losses… over the long-term capital gains. [Schedule D line 16: a net LT loss reduces the net ST gain; whatever short-term gain survives is ordinary income — § 1(h) prices only the § 1222(11) net capital gain.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: refuse(max0(sub(line7, max0(neg(line15))))),
  },
  {
    id: "us.federal.schedule_d.net_loss",
    version: 2, // v1 had no prior-year carryovers
    jurisdiction: J,
    title: "Net capital loss after netting (§ 1222(10)), feeding the § 1211(b) offset",
    citation: {
      ...CITE,
      section: "§ 1222(10)",
      excerpt:
        "The term 'net capital loss' means the excess of the losses from sales or exchanges of capital assets over the sum allowed under section 1211. [Computed as the overall negative of Schedule D line 16, entered here positive: the legacy netCapitalLoss fact passes through unchanged, or Schedule D lines 7 and 15 (each including its prior-year carryover) net to a loss. § 1211(b) caps the ordinary-income offset; § 1212(b) carries the rest forward.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: refuse(add(legacyLoss, max0(neg(add(line7, line15))))),
  },
];
