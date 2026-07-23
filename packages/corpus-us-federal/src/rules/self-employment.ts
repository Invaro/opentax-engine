/**
 * Self-employment tax — 26 U.S.C. §§ 1401, 1402 — and the § 164(f)
 * deduction for half of it.
 *
 * net earnings = 92.35% of net profit (§ 1402(a)(12))
 * no SE tax if net earnings < $400 (§ 1402(b)(2))
 * OASDI 12.4% up to the SSA wage base MINUS W-2 social security wages
 *   (wages fill the base first — § 1402(b)(1); W-2 SS wages ≈ wages, disclosed)
 * Medicare 2.9% uncapped
 *
 * Wage base: $176,100 (2025) / $184,500 (2026) — SSA-announced.
 * Method note: DEFAULT follows the printed Schedule SE — lines 10 (OASDI),
 * 11 (Medicare), and 13 (half deduction) each rounded to whole dollars
 * before entry, exactly as filed returns compute them; useFormulaMethod
 * opts back to exact-cents arithmetic (apples-to-apples with PolicyEngine,
 * like the Tax Table). The 0.9% Additional Medicare Tax is a separate rule.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");

const seNetEarnings = ruleRef("us.federal.se_net_earnings");

function seTaxRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  wageBaseCents: string,
  yearLabel: string,
): Rule {
  return {
    id: "us.federal.se_tax",
    version,
    jurisdiction: "us.federal",
    title: `Self-employment tax (TY${yearLabel}; Schedule SE line 8a uses socialSecurityWages when given, else box-1 wages)`,
    citation: {
      source: `26 U.S.C. § 1401; § 1402(b); SSA ${yearLabel} contribution and benefit base`,
      section: "§ 1401(a) 12.4% OASDI; § 1401(b) 2.9% Medicare",
      url: "https://www.ssa.gov/oact/cola/cbb.html",
      excerpt: `12.4 percent of self-employment income up to the contribution and benefit base (${yearLabel}: as announced by SSA) reduced by W-2 social security wages (Schedule SE line 8a = box 3; approximated by box 1 when socialSecurityWages is not supplied), plus 2.9 percent hospital insurance on all self-employment income. No tax if net earnings are under $400 (§ 1402(b)(2)). DEFAULT method matches the printed Schedule SE: line 10 'Multiply the smaller of line 9 or line 10 by 12.4%' and line 11 'Multiply line 6 by 2.9% (0.029)' are each rounded to whole dollars before line 12 'Self-employment tax. Add lines 10 and 11' — useFormulaMethod opts back to exact-cents arithmetic. The 0.9% Additional Medicare Tax (§ 1401(b)(2)) is computed separately.`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      wageBase: { value: wageBaseCents, type: "money" },
      seFloor: { value: "40000", type: "money" }, // $400
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "lt", left: seNetEarnings, right: param("seFloor") },
      then: zero,
      else: {
        kind: "if",
        cond: fact("useFormulaMethod"),
        then: { kind: "add", args: [oasdiComponent, medicareComponent] },
        else: {
          // printed Schedule SE: lines 10 and 11 each entered in whole dollars
          kind: "add",
          args: [
            { kind: "roundToDollar", value: oasdiComponent, mode: "half-up" },
            { kind: "roundToDollar", value: medicareComponent, mode: "half-up" },
          ],
        },
      },
    },
  };
}

// Schedule SE line 8a wants W-2 BOX 3 social security wages; box 1 is the
// fallback approximation when box 3 was not supplied (box 3 caps at the
// wage base and excludes some box-1 items, so box 1 can only overstate
// the subtraction — conservative for SE tax)
const wagesForBase: Expr = {
  kind: "if",
  cond: { kind: "cmp", op: "gt", left: fact("socialSecurityWages"), right: zero },
  then: fact("socialSecurityWages"),
  else: fact("wages"),
};

// OASDI: 12.4% of net earnings, capped at (wage base − W-2 SS wages)
const oasdiComponent: Expr = {
  kind: "mulRate",
  base: {
    kind: "min",
    args: [
      seNetEarnings,
      {
        kind: "max0",
        arg: {
          kind: "sub",
          left: param("wageBase"),
          right: wagesForBase,
        },
      },
    ],
  },
  rate: { num: "124", den: "1000" },
  round: "half-up",
};

// Medicare: 2.9% of all net earnings
const medicareComponent: Expr = {
  kind: "mulRate",
  base: seNetEarnings,
  rate: { num: "29", den: "1000" },
  round: "half-up",
};

export const selfEmploymentRules: Rule[] = [
  {
    id: "us.federal.se_net_earnings",
    version: 1,
    jurisdiction: "us.federal",
    title: "Net earnings from self-employment (92.35% of net profit)",
    citation: {
      source: "26 U.S.C. § 1402(a)(12)",
      section: "§ 1402(a)(12)",
      url: "https://www.law.cornell.edu/uscode/text/26/1402",
      excerpt:
        "…reduced by an amount equal to the product of such net earnings and one-half of the [15.3%] rate — i.e., net profit × 92.35%.",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: {
      kind: "mulRate",
      base: fact("selfEmploymentNetProfit"),
      rate: { num: "9235", den: "10000" },
      round: "half-up",
    },
  },
  // v5/v6: box-3 socialSecurityWages coordination (v3/v4 added the printed
  // Schedule SE per-line whole-dollar rounding)
  seTaxRule(5, "2025-01-01", "2026-01-01", "17610000", "2025"), // $176,100
  seTaxRule(6, "2026-01-01", "2027-01-01", "18450000", "2026"), // $184,500
  {
    id: "us.federal.se_tax_half_deduction",
    version: 2, // v1 kept exact cents; v2 follows Schedule SE line 13 (whole dollars)
    jurisdiction: "us.federal",
    title: "Deduction for one-half of self-employment tax",
    citation: {
      source: "26 U.S.C. § 164(f); Schedule SE (Form 1040) line 13",
      section: "§ 164(f)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/164",
      excerpt:
        "…there shall be allowed as a deduction… an amount equal to one-half of the taxes imposed by section 1401 (other than the taxes imposed by section 1401(b)(2)) for such taxable year. [Schedule SE line 13: 'Multiply line 12 by 50% (0.50). Enter here and on Schedule 1 (Form 1040), line 15' — entered in whole dollars by DEFAULT; useFormulaMethod keeps exact cents.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: fact("useFormulaMethod"),
      then: {
        kind: "mulRate",
        base: ruleRef("us.federal.se_tax"),
        rate: { num: "50", den: "100" },
        round: "half-up",
      },
      else: {
        kind: "roundToDollar",
        value: {
          kind: "mulRate",
          base: ruleRef("us.federal.se_tax"),
          rate: { num: "50", den: "100" },
          round: "half-up",
        },
        mode: "half-up",
      },
    },
  },
];
