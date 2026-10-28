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
 *
 * Per person: on a joint return where both spouses are self-employed, each
 * files their own Schedule SE (own $400 floor, own wage base against their
 * own box 3). us.federal.se_tax.taxpayer and .spouse are the two Schedule SEs;
 * us.federal.se_tax (Schedule 2 line 4) and us.federal.se_tax_half_deduction
 * (Schedule 1 line 15) add them.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");


const seNetEarnings = ruleRef("us.federal.se_net_earnings");
const spouseSeNetEarnings = ruleRef("us.federal.se_net_earnings.spouse");

/** One person's Schedule SE: their net earnings and their own line-8a wages. */
interface Person {
  key: "taxpayer" | "spouse";
  netEarnings: Expr;
  wagesForBase: Expr;
}

function seTaxRule(
  person: Person,
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  wageBaseCents: string,
  yearLabel: string,
): Rule {
  const who =
    person.key === "taxpayer"
      ? "first spouse (or the single filer): selfEmploymentNetProfit; Schedule SE line 8a uses socialSecurityWages when given, else box-1 wages"
      : "second self-employed spouse on a joint return: spouseSelfEmploymentNetProfit; Schedule SE line 8a uses spouseSocialSecurityWages";
  const wagesNote =
    person.key === "taxpayer"
      ? "reduced by W-2 social security wages (Schedule SE line 8a = box 3; approximated by box 1 when socialSecurityWages is not supplied)"
      : "reduced by THIS spouse's own W-2 social security wages (Schedule SE line 8a = their box 3, spouseSocialSecurityWages)";
  // OASDI: 12.4% of net earnings, capped at (wage base − this person's W-2 SS wages)
  const oasdi: Expr = {
    kind: "mulRate",
    base: {
      kind: "min",
      args: [
        person.netEarnings,
        { kind: "max0", arg: { kind: "sub", left: param("wageBase"), right: person.wagesForBase } },
      ],
    },
    rate: { num: "124", den: "1000" },
    round: "half-up",
  };
  // Medicare: 2.9% of all net earnings
  const medicare: Expr = {
    kind: "mulRate",
    base: person.netEarnings,
    rate: { num: "29", den: "1000" },
    round: "half-up",
  };
  return {
    id: `us.federal.se_tax.${person.key}`,
    version,
    jurisdiction: "us.federal",
    title: `Self-employment tax, one Schedule SE (TY${yearLabel}; ${who})`,
    citation: {
      source: `26 U.S.C. § 1401; § 1402(b); SSA ${yearLabel} contribution and benefit base`,
      section: "§ 1401(a) 12.4% OASDI; § 1401(b) 2.9% Medicare",
      url: "https://www.ssa.gov/oact/cola/cbb.html",
      excerpt: `12.4 percent of self-employment income up to the contribution and benefit base (${yearLabel}: as announced by SSA) ${wagesNote}, plus 2.9 percent hospital insurance on all self-employment income. No tax if net earnings are under $400 (§ 1402(b)(2)). Schedule SE is figured per person: on a joint return where both spouses have self-employment income, each files their own (Schedule SE instructions, 'Who Must File'). DEFAULT method matches the printed Schedule SE: line 10 'Multiply the smaller of line 9 or line 10 by 12.4%' and line 11 'Multiply line 6 by 2.9% (0.029)' are each rounded to whole dollars before line 12 'Self-employment tax. Add lines 10 and 11' — useFormulaMethod opts back to exact-cents arithmetic. The 0.9% Additional Medicare Tax (§ 1401(b)(2)) is computed separately.`,
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
      cond: { kind: "cmp", op: "lt", left: person.netEarnings, right: param("seFloor") },
      then: zero,
      else: {
        kind: "if",
        cond: fact("useFormulaMethod"),
        then: { kind: "add", args: [oasdi, medicare] },
        else: {
          // printed Schedule SE: lines 10 and 11 each entered in whole dollars
          kind: "add",
          args: [
            { kind: "roundToDollar", value: oasdi, mode: "half-up" },
            { kind: "roundToDollar", value: medicare, mode: "half-up" },
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
// socialSecurityWagesProvided marks an EXPLICIT box-3 figure (including a genuine $0: the SE
// earner had no W-2 while the spouse did) — without it a zero would fall through to the
// couple's combined box-1 wages, which belong to the wrong person on a joint return
const taxpayer: Person = {
  key: "taxpayer",
  netEarnings: seNetEarnings,
  wagesForBase: {
    kind: "if",
    cond: {
      kind: "or",
      args: [fact("socialSecurityWagesProvided"), { kind: "cmp", op: "gt", left: fact("socialSecurityWages"), right: zero }],
    },
    then: fact("socialSecurityWages"),
    else: fact("wages"),
  },
};
// the second spouse's line 8a is always their own box 3 (no box-1 fallback:
// the couple's box 1 would mostly be the other spouse's wages)
const spouse: Person = {
  key: "spouse",
  netEarnings: spouseSeNetEarnings,
  wagesForBase: fact("spouseSocialSecurityWages"),
};

/** Schedule SE line 13 for one person: half their SE tax, whole dollars by default. */
function halfDeductionRule(person: Person): Rule {
  const tax = ruleRef(`us.federal.se_tax.${person.key}`);
  const half: Expr = { kind: "mulRate", base: tax, rate: { num: "50", den: "100" }, round: "half-up" };
  return {
    id: `us.federal.se_tax_half_deduction.${person.key}`,
    version: 1,
    jurisdiction: "us.federal",
    title: `Deduction for one-half of self-employment tax, one Schedule SE (${person.key === "taxpayer" ? "first spouse or single filer" : "second self-employed spouse"})`,
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
      then: half,
      else: { kind: "roundToDollar", value: half, mode: "half-up" },
    },
  };
}

export const selfEmploymentRules: Rule[] = [
  {
    id: "us.federal.se_net_profit.spouse",
    version: 1,
    jurisdiction: "us.federal",
    title: "Second self-employed spouse's net profit (joint returns only)",
    citation: {
      source: "26 U.S.C. § 1402(a); Schedule SE (Form 1040) instructions",
      section: "§ 1402(a); § 6017",
      url: "https://www.law.cornell.edu/uscode/text/26/1402",
      excerpt:
        "Schedule SE instructions: 'If you and your spouse both had self-employment income, each of you must file a separate Schedule SE.' [Only a joint return carries the other spouse's income; on any other status that spouse files their own return, so a spouse profit here refuses.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "eq", left: fact("spouseSelfEmploymentNetProfit"), right: zero },
      then: zero,
      else: {
        kind: "if",
        cond: { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
        then: fact("spouseSelfEmploymentNetProfit"),
        else: {
          kind: "unsupported",
          reason:
            "spouseSelfEmploymentNetProfit is for a joint return only — on any other filing status each spouse files their own return: enter the filer's own profit in selfEmploymentNetProfit",
        },
      },
    },
  },
  {
    id: "us.federal.se_net_profit",
    version: 1,
    jurisdiction: "us.federal",
    title: "Net profit from self-employment, both spouses (selfEmploymentNetProfit + the second spouse's)",
    citation: {
      source: "26 U.S.C. §§ 61(a)(2), 1402(a)",
      section: "§ 61(a)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/61",
      excerpt:
        "gross income means all income from whatever source derived, including… gross income derived from business. [On a joint return both spouses' Schedule C profits are income of the return; each spouse's self-employment tax is still figured on their own Schedule SE.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [fact("selfEmploymentNetProfit"), ruleRef("us.federal.se_net_profit.spouse")],
    },
  },
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
  {
    id: "us.federal.se_net_earnings.spouse",
    version: 1,
    jurisdiction: "us.federal",
    title: "Second self-employed spouse's net earnings from self-employment (92.35% of their net profit)",
    citation: {
      source: "26 U.S.C. § 1402(a)(12)",
      section: "§ 1402(a)(12)",
      url: "https://www.law.cornell.edu/uscode/text/26/1402",
      excerpt:
        "…reduced by an amount equal to the product of such net earnings and one-half of the [15.3%] rate — i.e., net profit × 92.35%, on the second spouse's own Schedule SE.",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "mulRate",
      base: ruleRef("us.federal.se_net_profit.spouse"),
      rate: { num: "9235", den: "10000" },
      round: "half-up",
    },
  },
  // the first spouse's Schedule SE keeps the formula us.federal.se_tax v5/v6 had
  // (box-3 socialSecurityWages coordination, printed per-line rounding)
  seTaxRule(taxpayer, 1, "2025-01-01", "2026-01-01", "17610000", "2025"), // $176,100
  seTaxRule(taxpayer, 2, "2026-01-01", "2027-01-01", "18450000", "2026"), // $184,500
  seTaxRule(spouse, 1, "2025-01-01", "2026-01-01", "17610000", "2025"),
  seTaxRule(spouse, 2, "2026-01-01", "2027-01-01", "18450000", "2026"),
  {
    id: "us.federal.se_tax",
    version: 7, // v5/v6 were one Schedule SE; v7 adds the second self-employed spouse's on a joint return
    jurisdiction: "us.federal",
    title: "Self-employment tax (Schedule 2 line 4): the first spouse's Schedule SE plus the second self-employed spouse's",
    citation: {
      source: "26 U.S.C. § 1401; Schedule 2 (Form 1040) line 4",
      section: "§ 1401",
      url: "https://www.law.cornell.edu/uscode/text/26/1401",
      excerpt:
        "Schedule 2 line 4: 'Self-employment tax. Attach Schedule SE.' [On a joint return where both spouses had self-employment income, each spouse's Schedule SE line 12 is added here.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [ruleRef("us.federal.se_tax.taxpayer"), ruleRef("us.federal.se_tax.spouse")],
    },
  },
  halfDeductionRule(taxpayer),
  halfDeductionRule(spouse),
  {
    id: "us.federal.se_tax_half_deduction",
    version: 3, // v2 was one Schedule SE line 13; v3 adds the second self-employed spouse's
    jurisdiction: "us.federal",
    title: "Deduction for one-half of self-employment tax (Schedule 1 line 15: both spouses' Schedule SE line 13)",
    citation: {
      source: "26 U.S.C. § 164(f); Schedule 1 (Form 1040) line 15",
      section: "§ 164(f)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/164",
      excerpt:
        "…there shall be allowed as a deduction… an amount equal to one-half of the taxes imposed by section 1401 (other than the taxes imposed by section 1401(b)(2)) for such taxable year. [Schedule 1 line 15 takes Schedule SE line 13; with two Schedule SEs on a joint return, the two line 13 amounts are added.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.se_tax_half_deduction.taxpayer"),
        ruleRef("us.federal.se_tax_half_deduction.spouse"),
      ],
    },
  },
];
