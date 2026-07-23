/**
 * § 911 Foreign Earned Income Exclusion — verified July 2026.
 *
 * Exclusion: $130,000 for TY2025 (Rev. Proc. 2024-40 § 2.39) / $132,900
 * for TY2026 (Rev. Proc. 2025-32 § 4.39). Qualification (§ 911(d)(1):
 * bona fide residence for an entire taxable year, or 330 full days of
 * foreign presence in 12 months, each with a foreign tax home) is
 * ATTESTED by the input. The § 911(c) housing exclusion is NOT modeled —
 * its 30% cap is "adjusted as may be provided" by annual per-locality
 * IRS Notices (hundreds of city-specific limits) — conservative.
 *
 * THE STACKING RULE (§ 911(f)(1)(A), quoted in the rule): tax is NOT the
 * ordinary brackets on the reduced taxable income — it is
 *   tax(TI + excluded) − tax(excluded),
 * so the remaining income is taxed at the marginal rates it would have
 * faced without the exclusion. Encoded as an override on
 * income_tax_before_credits using the shared ordinary-rates builder
 * (Tax Table method below $100k, as the Foreign Earned Income Tax
 * Worksheet prescribes). Preferential-rate income (capital gains /
 * qualified dividends) REFUSES — the § 911(f)(2) coordination is not
 * modeled; nonzero AMT REFUSES — the § 911(f)(1)(B) AMT stacking is not
 * modeled.
 *
 * § 32(c)(1)(C): claiming § 911 denies the EITC — wired as an override.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { ordinaryRateTaxExpr } from "./income-tax.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

const exclusion = ruleRef("us.federal.feie.exclusion");

function feieExclusionRule(
  version: number,
  from: string,
  to: string,
  limitCents: string,
  limitLabel: string,
  sourceLabel: string,
): Rule {
  return {
    id: "us.federal.feie.exclusion",
    version,
    jurisdiction: J,
    title: `Foreign earned income exclusion (§ 911, ${limitLabel})`,
    citation: {
      source: `26 U.S.C. § 911(a), (b)(2)(D), (d); ${sourceLabel}`,
      section: "§ 911(a)(1), (b)(2)(D)(i)",
      url: "https://www.law.cornell.edu/uscode/text/26/911",
      excerpt: `"the foreign earned income exclusion amount under § 911(b)(2)(D)(i) is ${limitLabel}" (${sourceLabel}, verbatim). Qualification is attested by the input: a tax home in a foreign country AND either bona fide residence for an uninterrupted period including an entire taxable year (§ 911(d)(1)(A)) or presence in a foreign country during at least 330 full days in 12 consecutive months (§ 911(d)(1)(B)). The § 911(c) housing exclusion is NOT modeled (its cap is adjusted by annual per-locality IRS Notices) — conservative. Foreign earned income must be INCLUDED in the wages/SE inputs; this exclusion subtracts from gross income.`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: { limit: { value: limitCents, type: "money" } },
    formula: {
      kind: "min",
      args: [fact("foreignEarnedIncome"), param("limit")],
    },
  };
}

function feieStackingRule(version: number, from: string, to: string, year: "2025" | "2026"): Rule {
  const withExcluded = ordinaryRateTaxExpr(
    {
      kind: "add",
      args: [ruleRef("us.federal.taxable_income"), exclusion],
    },
    "filingStatus",
    year,
  );
  const onExcluded = ordinaryRateTaxExpr(exclusion, "filingStatus", year);
  return {
    id: `us.federal.income_tax_before_credits.feie`,
    version,
    jurisdiction: J,
    title: `§ 911(f) stacking: tax at the rates that would apply with the excluded income (TY${year})`,
    citation: {
      source: "26 U.S.C. § 911(f)(1); Foreign Earned Income Tax Worksheet (Form 1040 instructions)",
      section: "§ 911(f)(1)(A)",
      url: "https://www.law.cornell.edu/uscode/text/26/911",
      excerpt:
        "If, for any taxable year, any amount is excluded from gross income of a taxpayer under subsection (a)… the tax imposed by section 1… shall be equal to the excess (if any) of— (i) the tax which would be imposed by section 1… if the taxpayer's taxable income were increased by the amount excluded under subsection (a)…, over (ii) the tax which would be imposed by section 1… if the taxpayer's taxable income were equal to the amount excluded under subsection (a)… [Both terms use the Tax Table method below $100,000 per the Foreign Earned Income Tax Worksheet. REFUSES with preferential-rate income (the § 911(f)(2) capital-gains coordination is not modeled) and with nonzero AMT (the § 911(f)(1)(B) AMT stacking is not modeled).]",
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    applicability: gt0(exclusion),
    formula: {
      kind: "if",
      // amt itself references income_tax_before_credits (§ 55 compares TMT
      // to the regular tax), so the guard keys on the AMT-triggering INPUT
      // facts rather than the amt rule — referencing it here would cycle
      cond: {
        kind: "or",
        args: [
          gt0(fact("longTermCapitalGains")),
          gt0(fact("qualifiedDividends")),
          gt0(fact("amtIsoExerciseSpread")),
          gt0(fact("amtOtherPreferences")),
        ],
      },
      then: {
        kind: "unsupported",
        reason:
          "the § 911(f)(2) preferential-rate coordination and the § 911(f)(1)(B) AMT stacking are not modeled — a § 911 return with capital gains/qualified dividends or entered AMT preference items refuses",
      },
      else: {
        kind: "max0",
        arg: { kind: "sub", left: withExcluded, right: onExcluded },
      },
    },
    overrides: {
      ruleId: "us.federal.income_tax_before_credits",
      priority: 15, // above the base; below the kiddie override (20) — a kiddie child abroad is the rarer, stricter case
    },
  };
}

export const feieRules: Rule[] = [
  feieExclusionRule(1, "2025-01-01", "2026-01-01", "13000000", "$130,000", "Rev. Proc. 2024-40 § 2.39"),
  feieExclusionRule(2, "2026-01-01", "2027-01-01", "13290000", "$132,900", "Rev. Proc. 2025-32 § 4.39"),
  // v3/v4: the preferential-income refusal guard also catches the standalone qualifiedDividends fact
  feieStackingRule(3, "2025-01-01", "2026-01-01", "2025"),
  feieStackingRule(4, "2026-01-01", "2027-01-01", "2026"),
  {
    id: "us.federal.eitc.feie_denial",
    version: 1,
    jurisdiction: J,
    title: "§ 911 claimants get no earned income credit",
    citation: {
      source: "26 U.S.C. § 32(c)(1)(C)",
      section: "§ 32(c)(1)(C)",
      url: "https://www.law.cornell.edu/uscode/text/26/32",
      excerpt:
        "The term 'eligible individual' does not include any individual who claims the benefits of section 911 (relating to citizens or residents living abroad) for the taxable year.",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    applicability: gt0(exclusion),
    formula: zero,
    overrides: {
      ruleId: "us.federal.eitc",
      priority: 30,
    },
  },
];
