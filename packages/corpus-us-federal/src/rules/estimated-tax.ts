/**
 * Estimated-tax safe harbor — 26 U.S.C. § 6654. The September-15 question:
 * "how much do I send the IRS this quarter to avoid a penalty?"
 *
 * required annual payment = lesser of
 *   90% of the current year's tax, or
 *   100% of the prior year's tax (110% if prior-year AGI > $150,000;
 *   $75,000 for MFS) — § 6654(d)(1)(B)-(C)
 * Each required installment is 25% of the RAP (§ 6654(d)(1)(A));
 * withholding is deemed paid evenly across installments (§ 6654(g)(1)).
 * No penalty at all if the balance after withholding is under $1,000
 * (§ 6654(e)(1)) or the prior year's tax was zero (§ 6654(e)(2), which the
 * 100%-of-zero prong reproduces; 12-month-year US-resident conditions
 * assumed — disclosed).
 *
 * All thresholds statutory, not indexed — open-ended windows.
 * Method note: the annualized-income installment method (§ 6654(d)(2)) for
 * uneven income is NOT modeled; these are the even-quarters amounts.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const FROM = { effectiveFrom: "2025-01-01" };
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

export const estimatedTaxRules: Rule[] = [
  {
    id: "us.federal.estimated.required_annual_payment",
    version: 1,
    jurisdiction: "us.federal",
    title: "Required annual payment (§ 6654 safe harbor)",
    citation: {
      source: "26 U.S.C. § 6654(d)(1)(B), (C)",
      section: "§ 6654(d)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/6654",
      excerpt:
        "…the lesser of (i) 90 percent of the tax shown on the return for the taxable year… or (ii) 100 percent of the tax shown on the return of the individual for the preceding taxable year. If the adjusted gross income… for the preceding taxable year exceeds $150,000 [$75,000 married filing separately], clause (ii) shall be applied by substituting '110 percent'.",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      highAGIThreshold: { value: "15000000", type: "money" }, // $150,000
      highAGIThresholdMFS: { value: "7500000", type: "money" }, // $75,000
    },
    formula: {
      kind: "min",
      args: [
        // 90% of this year's tax (income + SE/NIIT/Add'l Medicare, net of credits)
        {
          kind: "mulRate",
          base: ruleRef("us.federal.net_tax"),
          rate: { num: "90", den: "100" },
          round: "half-up",
        },
        // 100%/110% of last year's tax
        {
          kind: "mulRate",
          base: fact("priorYearTax"),
          rate: { num: "1", den: "1" },
          round: "half-up",
        },
      ],
    },
  },
  {
    // the 110% substitution as an OVERRIDE — the statute's own structure
    id: "us.federal.estimated.required_annual_payment.high_agi",
    version: 1,
    jurisdiction: "us.federal",
    title: "Required annual payment — 110% prong for prior-year AGI over $150,000",
    citation: {
      source: "26 U.S.C. § 6654(d)(1)(C)",
      section: "§ 6654(d)(1)(C)",
      url: "https://www.law.cornell.edu/uscode/text/26/6654",
      excerpt:
        "…clause (ii) of subparagraph (B) shall be applied by substituting '110 percent' for '100 percent'. …'$75,000' [is substituted for '$150,000'] in the case of a married individual filing separately.",
    },
    ...FROM,
    output: { type: "money" },
    applicability: {
      kind: "cmp",
      op: "gt",
      left: fact("priorYearAGI"),
      right: {
        kind: "if",
        cond: isStatus("mfs"),
        then: { kind: "param", name: "highAGIThresholdMFS" },
        else: { kind: "param", name: "highAGIThreshold" },
      },
    },
    parameters: {
      highAGIThreshold: { value: "15000000", type: "money" },
      highAGIThresholdMFS: { value: "7500000", type: "money" },
    },
    formula: {
      kind: "min",
      args: [
        {
          kind: "mulRate",
          base: ruleRef("us.federal.net_tax"),
          rate: { num: "90", den: "100" },
          round: "half-up",
        },
        {
          kind: "mulRate",
          base: fact("priorYearTax"),
          rate: { num: "110", den: "100" },
          round: "half-up",
        },
      ],
    },
    overrides: {
      ruleId: "us.federal.estimated.required_annual_payment",
      priority: 10,
    },
  },
  {
    id: "us.federal.estimated.quarterly_payment",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Required quarterly estimated payment (even installments, withholding deemed even)",
    citation: {
      source: "26 U.S.C. § 6654(d)(1)(A); § 6654(g)(1)",
      section: "§ 6654(d)(1)(A), (g)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/6654",
      excerpt:
        "…the amount of any required installment shall be 25 percent of the required annual payment; …an equal part of [withheld tax] shall be deemed paid on each due date. [Annualized-income method for uneven income not modeled.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "mulRate",
        base: {
          kind: "sub",
          left: ruleRef("us.federal.estimated.required_annual_payment"),
          right: fact("federalTaxWithheld"),
        },
        rate: { num: "25", den: "100" },
        round: "half-up",
      },
    },
  },
  {
    id: "us.federal.estimated.safe_harbor_met",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Withholding alone already satisfies § 6654 (no estimated payments needed)",
    citation: {
      source: "26 U.S.C. § 6654(e)(1); § 6654(d)(1)",
      section: "§ 6654(e)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/6654",
      excerpt:
        "No addition to tax shall be imposed… if the tax shown on the return…, reduced by the credit allowable under section 31 [withholding], is less than $1,000 — or if withholding alone reaches the required annual payment.",
    },
    ...FROM,
    output: { type: "bool" },
    parameters: {
      deMinimis: { value: "100000", type: "money" }, // $1,000
    },
    formula: {
      kind: "or",
      args: [
        // ordered: the de-minimis test needs NO prior-year facts — a person
        // whose balance is tiny gets a definitive yes without more questions
        {
          kind: "cmp",
          op: "lt",
          left: ruleRef("us.federal.balance_due"),
          right: { kind: "param", name: "deMinimis" },
        },
        {
          kind: "cmp",
          op: "ge",
          left: fact("federalTaxWithheld"),
          right: ruleRef("us.federal.estimated.required_annual_payment"),
        },
      ],
    },
  },
];
