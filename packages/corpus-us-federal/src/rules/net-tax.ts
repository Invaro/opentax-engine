/**
 * The bottom line: nonrefundable-credit tax minus refundable credits.
 * NEGATIVE means the government owes the taxpayer (a refundable-credit
 * refund) — deliberately NOT clamped at zero. This is the corpus's default
 * answer target.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const FROM = { effectiveFrom: "2025-01-01" }; // structural: open-ended

export const netTaxRules: Rule[] = [
  {
    id: "us.federal.refundable_credits",
    version: 3, // v2 predated the refundable adoption credit and the net premium tax credit
    jurisdiction: "us.federal",
    title:
      "Refundable credits (EITC + ACTC + 40% AOTC + refundable adoption + net PTC)",
    citation: {
      source: "26 U.S.C. §§ 23(a)(4), 24(d), 25A(i), 32, 36B",
      section: "§§ 23(a)(4), 24(d), 25A(i), 32, 36B",
      url: "https://www.law.cornell.edu/uscode/text/26/32",
      excerpt:
        "Refundable credits are allowed against tax and, to the extent they exceed it, treated as an overpayment (§ 6401(b)) — the EITC, the additional child tax credit, the 40% refundable portion of the American Opportunity Tax Credit, the § 23(a)(4) refundable adoption portion (OBBBA), and the § 36B net premium tax credit (in excess of advance payments).",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.eitc"),
        ruleRef("us.federal.actc"),
        ruleRef("us.federal.education.aotc_refundable"),
        ruleRef("us.federal.adoption.refundable"),
        ruleRef("us.federal.ptc.net"),
      ],
    },
  },
  {
    id: "us.federal.net_tax",
    version: 2, // v1 predated SE tax / NIIT / Additional Medicare
    jurisdiction: "us.federal",
    title:
      "Total federal tax net of refundable credits (income + SE + NIIT + Add'l Medicare; negative = refund)",
    citation: {
      source: "26 U.S.C. § 6401(b); Form 1040 lines 22–24",
      section: "§ 6401(b)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/6401",
      excerpt:
        "Total tax includes income tax after nonrefundable credits plus other taxes (Schedule 2); refundable credits in excess of it are treated as an overpayment (§ 6401(b)).",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: {
        kind: "add",
        args: [
          ruleRef("us.federal.income_tax_after_credits"),
          ruleRef("us.federal.other_taxes"),
        ],
      },
      right: ruleRef("us.federal.refundable_credits"),
    },
  },
  {
    id: "us.federal.balance_due",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Balance due after withholding (negative = refund expected at filing)",
    citation: {
      source: "26 U.S.C. § 31(a)",
      section: "§ 31(a)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/31",
      excerpt:
        "The amount withheld as tax under chapter 24 shall be allowed to the recipient of the income as a credit against the tax imposed by this subtitle. [The mid-year withholding checkup: liability minus what has already been paid in.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "sub",
      left: ruleRef("us.federal.net_tax"),
      right: { kind: "fact", factId: "federalTaxWithheld" },
    },
  },
];
