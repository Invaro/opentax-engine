/**
 * Kiddie tax — 26 U.S.C. § 1(g) (parental-rate version; the TCJA
 * estate-rate variant was repealed in 2019), Form 8615.
 *
 * § 1(g)(1): the child's tax is the GREATER of
 *   (A) the regular tax on the child's taxable income, or
 *   (B) the tax on (taxable income − net unearned income)
 *       + the child's share of the "allocable parental tax" —
 *         tax on (parent's TI + the children's NUI) minus tax on parent's TI.
 *
 * § 1(g)(4): net unearned income = unearned income − [the § 63(c)(5)(A)
 * amount ($1,350 for 2025 and 2026, Rev. Proc. 2024-40 § 2.15(2) /
 * 2025-32 § 4.14(2)) + the greater of that amount or directly-connected
 * itemized deductions] — i.e. $2,700 with no such itemized deductions —
 * capped at the child's taxable income.
 *
 * Every sub-computation uses the Tax Table method below $100,000 (the
 * Form 8615 instructions prescribe it), via the shared ordinary-rates
 * builder — ordinary rates ONLY, so preferential income refuses:
 *   - the child having capital gains (long or short-term)/qualified or
 *     ordinary dividends → NOT_MODELED (preferential income needs the
 *     Form 8615 worksheets; short-term gains/ordinary dividends are ALSO
 *     unearned income the taxableInterest approximation below would drop)
 *   - the parent having preferential-rate income → NOT_MODELED
 * Also assumed and disclosed: this child is the parent's only § 1(g)
 * child (no sibling pro-rata allocation), unearned income ≈ taxable
 * interest, and the § 1(g)(7) parental election is not modeled.
 *
 * Whether § 1(g) APPLIES (under 18, or 18 / student under 24 with earned
 * income ≤ half of support, living parent, no joint return) is the
 * caller's determination via the isSubjectToKiddieTax fact.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { ordinaryRateTaxExpr } from "./income-tax.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");

const CITE = {
  source: "26 U.S.C. § 1(g); Form 8615",
  url: "https://www.law.cornell.edu/uscode/text/26/1",
};

const nui = ruleRef("us.federal.kiddie.net_unearned_income");

function kiddieTaxRule(version: number, from: string, to: string, year: "2025" | "2026"): Rule {
  const childRegular = ordinaryRateTaxExpr(
    ruleRef("us.federal.taxable_income"),
    "filingStatus",
    year,
  );
  const childReduced = ordinaryRateTaxExpr(
    {
      kind: "max0",
      arg: { kind: "sub", left: ruleRef("us.federal.taxable_income"), right: nui },
    },
    "filingStatus",
    year,
  );
  const parentWith = ordinaryRateTaxExpr(
    { kind: "add", args: [fact("parentTaxableIncome"), nui] },
    "parentFilingStatus",
    year,
  );
  const parentWithout = ordinaryRateTaxExpr(
    fact("parentTaxableIncome"),
    "parentFilingStatus",
    year,
  );
  return {
    id: "us.federal.kiddie_tax",
    version,
    jurisdiction: J,
    title: `Kiddie tax — the Form 8615 greater-of computation (TY${year})`,
    citation: {
      ...CITE,
      section: "§ 1(g)(1), (3)",
      excerpt:
        "…the greater of (A) the tax imposed… without regard to this subsection, or (B) the tax which would be imposed… if the taxable income of such child… were reduced by the net unearned income of such child, plus such child's share of the allocable parental tax — the excess of the tax on the parent's taxable income including the children's net unearned income over the tax on it alone. [Assumed and disclosed: this child is the parent's only § 1(g) child; child and parent preferential-rate income REFUSE rather than skip the capital-gains worksheets; Tax Table method used below $100,000 per the Form 8615 instructions.]",
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "not", arg: fact("isSubjectToKiddieTax") },
      then: {
        kind: "unsupported",
        reason:
          "the kiddie_tax target applies only to a child subject to § 1(g) — pass isSubjectToKiddieTax=true (or evaluate the normal net-tax target)",
      },
      else: {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            { kind: "cmp", op: "gt", left: fact("longTermCapitalGains"), right: zero },
            { kind: "cmp", op: "gt", left: fact("qualifiedDividends"), right: zero },
            { kind: "cmp", op: "gt", left: fact("shortTermCapitalGains"), right: zero },
            { kind: "cmp", op: "gt", left: fact("ordinaryDividends"), right: zero },
          ],
        },
        then: {
          kind: "unsupported",
          reason:
            "a § 1(g) child with capital gains, qualified dividends, or ordinary dividends needs the Form 8615 capital-gains worksheets, and/or is unearned income this corpus's 'unearned income ≈ taxable interest' approximation would silently drop — not modeled",
        },
        else: {
          kind: "if",
          cond: fact("parentHasPreferentialIncome"),
          then: {
            kind: "unsupported",
            reason:
              "the parent's taxable income includes preferential-rate income — the Form 8615 recomputation would need the parent's QDCGT worksheet, not modeled",
          },
          else: {
            kind: "max",
            args: [
              childRegular,
              {
                kind: "add",
                args: [
                  childReduced,
                  { kind: "max0", arg: { kind: "sub", left: parentWith, right: parentWithout } },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

export const kiddieRules: Rule[] = [
  {
    id: "us.federal.kiddie.net_unearned_income",
    version: 1,
    jurisdiction: J,
    title: "Net unearned income of a § 1(g) child",
    citation: {
      ...CITE,
      section: "§ 1(g)(4)",
      excerpt:
        "…the excess of the portion of adjusted gross income… not attributable to earned income, over the sum of the amount in effect under section 63(c)(5)(A) ($1,350 for taxable years beginning in 2025 and 2026) plus the greater of that amount or the itemized deductions directly connected — $2,700 with none such (child itemized deductions not modeled); shall not exceed the child's taxable income. [Unearned income ≈ taxable interest — the child's capital gains refuse in the tax rule; disclosed.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01", // pinned to the years the $1,350 amount is verified for
    output: { type: "money" },
    parameters: {
      threshold: { value: "270000", type: "money" }, // $2,700 = 2 × $1,350
    },
    formula: {
      kind: "min",
      args: [
        {
          kind: "max0",
          arg: { kind: "sub", left: fact("taxableInterest"), right: param("threshold") },
        },
        ruleRef("us.federal.taxable_income"),
      ],
    },
  },
  // v3/v4: the § 1(g) capital-gains refusal guard also catches the standalone qualifiedDividends fact
  // v5/v6: the refusal guard also catches shortTermCapitalGains/ordinaryDividends (unearned income
  // the "unearned income ≈ taxable interest" approximation in net_unearned_income would otherwise drop)
  kiddieTaxRule(5, "2025-01-01", "2026-01-01", "2025"),
  kiddieTaxRule(6, "2026-01-01", "2027-01-01", "2026"),
  {
    id: "us.federal.income_tax_before_credits.kiddie",
    version: 1,
    jurisdiction: J,
    title: "§ 1(g) override: a kiddie child's income tax is the Form 8615 tax",
    citation: {
      ...CITE,
      section: "§ 1(g)(1)",
      excerpt:
        "In the case of any child to whom this subsection applies, the tax imposed by this section shall be equal to the greater of [the regular tax or the Form 8615 sum] — this override replaces the ordinary income-tax computation (including the Tax Table method, which the Form 8615 computation applies internally).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    applicability: fact("isSubjectToKiddieTax"),
    formula: ruleRef("us.federal.kiddie_tax"),
    overrides: { ruleId: "us.federal.income_tax_before_credits", priority: 20 },
  },
];
