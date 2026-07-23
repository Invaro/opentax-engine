/**
 * Taxable Social Security benefits — 26 U.S.C. § 86 (the 0/50/85%
 * worksheet). Verified July 2026: the thresholds are STATUTORY and
 * unindexed — base amounts $25,000 ($32,000 joint), second tier $34,000
 * ($44,000 joint) — and the OBBBA did not change § 86 (its senior
 * deduction sits alongside; benefits remain includible by this formula).
 *
 * Provisional income = MAGI + one-half of benefits, where § 86(b)(2) MAGI
 * is AGI computed WITHOUT the benefits and without §§ 135/137/221/911/931/
 * 933 (the student-loan deduction is added back) plus tax-exempt interest
 * (the taxExemptInterest fact).
 *
 * Includible amount = the lesser of 85% of benefits, or
 *   85% × (PI − second tier) + the lesser of [the 50% tier amount] or
 *   [half the tier gap: $4,500 / $6,000],
 * where the 50% tier amount = min(50% of benefits, 50% × (PI − base)).
 * Married filing separately (not living apart all year — assumed,
 * conservative, § 86(c)(1)(C)(ii)): both thresholds are ZERO —
 * min(85% of benefits, 85% of provisional income).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const pct = (num: string, base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den: "100" },
  round: "half-up",
});

// § 86(b)(2) MAGI base: every income item EXCEPT the benefits, minus the
// pre-§221 adjustments (student loan added back; § 219 IRA is deducted)
const magiBase: Expr = {
  kind: "sub",
  left: {
    kind: "sub",
    left: {
      kind: "add",
      args: [
        fact("wages"),
        fact("taxableInterest"),
        fact("taxExemptInterest"), // § 86(b)(2)(B): "increased by the amount of interest… exempt from tax"
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
        fact("scheduleENetIncome"),
      ],
    },
    right: {
      kind: "add",
      args: [
        ruleRef("us.federal.capital_loss_ordinary_offset"),
        fact("nonpassiveScheduleELoss"),
      ],
    },
  },
  right: {
    kind: "add",
    args: [
      ruleRef("us.federal.above_the_line_adjustments"),
      ruleRef("us.federal.ira_deduction"),
    ],
  },
};

const ss = fact("socialSecurityBenefits");
const provisional: Expr = { kind: "add", args: [magiBase, pct("50", ss)] };

const isMfs: Expr = {
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: "mfs" },
};
const isMfj: Expr = {
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: "mfj" },
};
const byJoint = (joint: string, other: string): Expr => ({
  kind: "if",
  cond: isMfj,
  then: param(joint),
  else: param(other),
});

export const socialSecurityRules: Rule[] = [
  {
    id: "us.federal.taxable_social_security",
    version: 7, // v4 predated the nonpassive Schedule E loss fact; v5 predated the standalone qualifiedDividends fact; v6 predated shortTermCapitalGains/ordinaryDividends
    jurisdiction: "us.federal",
    title: "Taxable Social Security benefits (§ 86: the 0/50/85% worksheet)",
    citation: {
      source: "26 U.S.C. § 86",
      section: "§ 86(a)–(c)",
      url: "https://www.law.cornell.edu/uscode/text/26/86",
      excerpt:
        "Gross income includes social security benefits per the § 86(a) two-tier formula: up to 50 percent of benefits as provisional income (MAGI + ½ of benefits) exceeds the base amount ($25,000; $32,000 joint — statutory, unindexed, unchanged by the OBBBA), and up to 85 percent above the adjusted base amount ($34,000; $44,000 joint), never more than 85 percent of the benefits. A married individual filing separately who does not live apart the whole year has base amounts of zero — living-apart status is not modeled, so MFS gets the zero thresholds (conservative, disclosed). [MAGI adds back the § 221 student-loan deduction and includes tax-exempt interest (§ 86(b)(2)(B), the taxExemptInterest fact).]",
    },
    effectiveFrom: "2025-01-01", // statutory, unindexed: open-ended
    output: { type: "money" },
    parameters: {
      base: { value: "2500000", type: "money" }, // $25,000
      baseJoint: { value: "3200000", type: "money" }, // $32,000
      tier2: { value: "3400000", type: "money" }, // $34,000
      tier2Joint: { value: "4400000", type: "money" }, // $44,000
      halfGap: { value: "450000", type: "money" }, // $4,500
      halfGapJoint: { value: "600000", type: "money" }, // $6,000
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "eq", left: ss, right: money("0") },
      then: money("0"),
      else: {
        kind: "if",
        cond: isMfs,
        then: {
          kind: "min",
          args: [pct("85", ss), pct("85", { kind: "max0", arg: provisional })],
        },
        else: {
          kind: "min",
          args: [
            pct("85", ss),
            {
              kind: "add",
              args: [
                pct("85", {
                  kind: "max0",
                  arg: {
                    kind: "sub",
                    left: provisional,
                    right: byJoint("tier2Joint", "tier2"),
                  },
                }),
                {
                  kind: "min",
                  args: [
                    {
                      kind: "min",
                      args: [
                        pct("50", ss),
                        pct("50", {
                          kind: "max0",
                          arg: {
                            kind: "sub",
                            left: provisional,
                            right: byJoint("baseJoint", "base"),
                          },
                        }),
                      ],
                    },
                    byJoint("halfGapJoint", "halfGap"),
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  },
];
