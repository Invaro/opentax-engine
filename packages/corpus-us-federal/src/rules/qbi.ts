/**
 * Qualified business income deduction — 26 U.S.C. § 199A. Verified July
 * 2026; per business since October 2026.
 *
 * The combined QBI amount is us.federal.qbi.total_component
 * (qbi-businesses.ts): at or below the threshold 20% of total QBI less any
 * prior-year loss carryforward (Form 8995); above it each business's own
 * component after the SSTB applicable percentage, aggregation and loss
 * netting (Form 8995-A with Schedules A–C).
 *
 * Thresholds (Rev. Procs.) and the phase-in range — an OBBBA trap:
 *   2025: threshold $394,600 MFJ / $197,300 others; range $50,000
 *         ($100,000 joint) — § 199A(b)(3)(B) as enacted by the TCJA
 *   2026: threshold $403,500 MFJ / $201,775 MFS / $201,750 others;
 *         range WIDENED by OBBBA § 70105 to $75,000 ($150,000 joint)
 *
 * This rule applies the overall § 199A(a)(2) limit (20% of taxable income
 * less net capital gain, qualified dividends included) and the OBBBA
 * § 70105 $400 minimum (TY2026+). No REIT/PTP component — disclosed.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { qbiBusinessRules } from "./qbi-businesses.js";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const pctOf = (num: string, den: string, base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den },
  round: "half-up",
});

const hasBusinessIncome: Expr = {
  kind: "or",
  args: [
    { kind: "cmp", op: "gt", left: ruleRef("us.federal.se_net_profit"), right: zero },
    { kind: "cmp", op: "gt", left: fact("k1OrdinaryBusinessIncome"), right: zero },
  ],
};

const taxableBeforeQbi = ruleRef("us.federal.taxable_income_before_qbi");

function qbiRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  yearLabel: string,
  source: string,
  withMinimum: boolean,
): Rule {
  // overall § 199A(a)(2) limit: 20% of (taxable income − net capital gain),
  // and § 199A(e)(3) treats qualified dividend income as net capital gain here
  const overall: Expr = pctOf("20", "100", {
    kind: "max0",
    arg: {
      kind: "sub",
      left: taxableBeforeQbi,
      right: {
        kind: "add",
        args: [ruleRef("us.federal.schedule_d.preferential_lt_gain"), fact("qualifiedDividends")],
      },
    },
  });
  const limited: Expr = { kind: "min", args: [ruleRef("us.federal.qbi.total_component"), overall] };

  const withFloor: Expr = withMinimum
    ? {
        // OBBBA § 70105: $400 minimum when QBI ≥ $1,000 (TY2026+)
        kind: "if",
        cond: { kind: "cmp", op: "ge", left: ruleRef("us.federal.qbi.active_total"), right: param("minQbiFloor") },
        then: { kind: "max", args: [limited, param("minDeduction")] },
        else: limited,
      }
    : limited;

  return {
    id: "us.federal.qbi_deduction",
    version,
    jurisdiction: "us.federal",
    title: `Qualified business income deduction (TY${yearLabel}; per business, with aggregation and loss netting)`,
    citation: {
      source: `26 U.S.C. § 199A; ${source}`,
      section: "§ 199A(a)–(d)",
      url: "https://www.law.cornell.edu/uscode/text/26/199A",
      excerpt: `The lesser of the combined qualified business income amount — 20 percent of each business's QBI, limited above the § 199A(e)(2) threshold by that business's W-2 wages and UBIA and phased in over the ${yearLabel === "2025" ? "$50,000 ($100,000 joint) range" : "OBBBA-widened $75,000 ($150,000 joint) range (§ 70105, taxable years after 2025)"}, after the SSTB applicable percentage, aggregation and loss netting (us.federal.qbi.total_component) — or 20 percent of taxable income (without this deduction) less net capital gain.${withMinimum ? " OBBBA § 70105 $400 minimum deduction with at least $1,000 of QBI (active participation assumed — disclosed)." : ""} [No REIT/PTP component or cooperative patron reduction; W-2 wages and UBIA default to $0, which is conservative; exact ratios where Form 8995-A rounds percentages — disclosed.]`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: withMinimum
      ? {
          minDeduction: { value: "40000", type: "money" as const }, // $400
          minQbiFloor: { value: "100000", type: "money" as const }, // $1,000
        }
      : {},
    formula: {
      kind: "if",
      cond: hasBusinessIncome,
      then: withFloor,
      else: zero,
    },
  };
}

export const qbiRules: Rule[] = [
  qbiRule(
    13, // v11 computed one business above the threshold and refused two spouses' businesses; v13 sums each business's component (us.federal.qbi.total_component). v9 counted one self-employed person; v7 counted qualifiedDividends in the § 199A(a)(2)/(e)(3) overall limit
    "2025-01-01", "2026-01-01", "2025",
    "Rev. Proc. 2024-40 § 2.27",
    false,
  ),
  qbiRule(
    14, // v12 computed one business above the threshold and refused two spouses' businesses; v14 sums each business's component. v10 counted one self-employed person; v8 counted qualifiedDividends in the overall limit
    "2026-01-01", "2027-01-01", "2026",
    "Rev. Proc. 2025-32 § 4.26; OBBBA § 70105 (range + $400 minimum)",
    true,
  ),
  ...qbiBusinessRules,
];
