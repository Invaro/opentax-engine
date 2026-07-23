/**
 * Form 8606 Part I — nontaxable IRA distributions when there is basis.
 * Verified July 2026 from the statute and the printed 2025 Form 8606.
 *
 * § 408(d)(1): distributions are included in income "in the manner provided
 * under section 72". § 408(d)(2) aggregates: all IRAs are one contract, all
 * distributions in a year one distribution, and value/basis are computed as
 * of the close of the calendar year — that is the pro-rata rule the form
 * mechanizes: nontaxable = amount × (basis ÷ (year-end value + distributions
 * + conversions)), the ratio "rounded to at least 3 places" and capped at
 * 1.000 (2025 Form 8606 line 10, verbatim below). Full-precision integer
 * arithmetic satisfies "at least 3 places"; each nontaxable amount is then
 * rounded to whole dollars per the form.
 *
 * STANDALONE targets, per individual (spouses file SEPARATE Forms 8606):
 *   us.federal.ira8606.taxable_amount    → enter into taxableIraDistributions
 *   us.federal.ira8606.basis_carryforward → next year's line 2
 *
 * The evaluation that motivated this rule: two agents given the same
 * documents took opposite branches on this exact worksheet — the arithmetic
 * convention now lives here instead of in an agent's judgment.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

// line 3 = line 1 + line 2 (line 4's January–April split is not modeled —
// line 1 must already be the full year's nondeductible contributions)
const line3: Expr = {
  kind: "add",
  args: [fact("ira8606NondeductibleContributions"), fact("ira8606Basis")],
};

// line 9 = line 6 + line 7 + line 8
const line9: Expr = {
  kind: "add",
  args: [
    fact("ira8606YearEndValue"),
    fact("ira8606Distributions"),
    fact("ira8606Conversions"),
  ],
};

/**
 * Nontaxable portion of `amount` (form lines 11/12): amount × line 10 ratio,
 * whole-dollar rounded, capped at the amount itself (the "enter 1.000" cap).
 * Guarded so the division only happens when the amount is positive — then
 * line 9 ≥ amount > 0, so the denominator cannot be zero.
 */
function nontaxablePortion(amount: Expr): Expr {
  return {
    kind: "if",
    cond: gt0(amount),
    then: {
      kind: "min",
      args: [
        amount,
        {
          kind: "roundToDollar",
          value: { kind: "mulDiv", a: amount, b: line3, c: line9, round: "half-up" },
          mode: "half-up",
        },
      ],
    },
    else: zero,
  };
}

const line11 = nontaxablePortion(fact("ira8606Conversions")); // nontaxable conversion
const line12 = nontaxablePortion(fact("ira8606Distributions")); // nontaxable distribution

const CITATION_EXCERPT = `Distributions are included in gross income 'in the manner provided under section 72'; for that purpose 'all individual retirement plans shall be treated as 1 contract, all distributions during any taxable year shall be treated as 1 distribution, and the value of the contract, income on the contract, and investment in the contract shall be computed as of the close of the calendar year in which the taxable year begins' (§ 408(d)(1)–(2), verbatim). The 2025 Form 8606 mechanizes this: line 6 'Enter the value of all your traditional IRAs as of December 31, 2025, plus any outstanding rollovers'; line 7 'Enter your distributions from traditional IRAs in 2025. Do not include rollovers…. Also, do not include qualified charitable distributions' [exclusions attested by the input]; line 8 'Enter the net amount you converted from traditional IRAs to Roth IRAs in 2025'; line 10 'Divide line 5 by line 9. Enter the result as a decimal rounded to at least 3 places. If the result is 1.000 or more, enter "1.000"' [full-precision integer arithmetic satisfies 'at least 3 places'; the cap is the min against the amount]; line 11 'Multiply line 8 by line 10. This is the nontaxable portion of the amount you converted to Roth IRAs'; line 12 'Multiply line 7 by line 10. This is the nontaxable portion of your distributions that you did not convert to a Roth IRA'; line 18 'Taxable amount. Subtract line 17 from line 16… include this amount on 2025 Form 1040… line 4b.' [PER INDIVIDUAL — spouses file separate Forms 8606; enter the result into taxableIraDistributions yourself (a STANDALONE determination, like the home-office safe harbor). SEP/SIMPLE values belong in line 6. Line 4 (contributions made January–April for the prior year), line 15b qualified disaster distributions, inherited-IRA basis, and qualified charitable distributions are not modeled — disclosed. PRIORITY WHEN SOURCES CONFLICT: if the interview or source documents already STATE this year's taxable amount, that documented figure controls the FACTS — transcribe it into taxableIraDistributions and disclose the pro-rata dissent; run this target only when basis exists and no taxable amount is documented.]`;

export const ira8606Rules: Rule[] = [
  {
    id: "us.federal.ira8606.taxable_amount",
    version: 1,
    jurisdiction: J,
    title:
      "Taxable IRA distributions and Roth conversions with basis — Form 8606 Part I pro-rata (§ 408(d))",
    citation: {
      source: "26 U.S.C. § 408(d)(1)–(2); 2025 Form 8606 Part I",
      section: "§ 408(d)(2); Form 8606 lines 6–18",
      url: "https://www.law.cornell.edu/uscode/text/26/408",
      excerpt: CITATION_EXCERPT,
    },
    effectiveFrom: "2025-01-01", // statutory mechanics, un-indexed
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        // line 15a/15c: taxable non-converted distributions (15b disaster
        // repayments not modeled)
        { kind: "max0", arg: { kind: "sub", left: fact("ira8606Distributions"), right: line12 } },
        // line 18: taxable conversions = line 16 − line 17
        { kind: "max0", arg: { kind: "sub", left: fact("ira8606Conversions"), right: line11 } },
      ],
    },
  },
  {
    id: "us.federal.ira8606.basis_carryforward",
    version: 1,
    jurisdiction: J,
    title: "Traditional IRA basis carried to next year — Form 8606 line 14",
    citation: {
      source: "26 U.S.C. § 408(d)(2); 2025 Form 8606 Part I",
      section: "Form 8606 lines 13–14",
      url: "https://www.law.cornell.edu/uscode/text/26/408",
      excerpt:
        "Line 13: 'Add lines 11 and 12. This is the nontaxable portion of all your distributions'; line 14: 'Subtract line 13 from line 3. This is your total basis in traditional IRAs for 2025 and earlier years' (2025 Form 8606, verbatim). [This target reports next year's line 2 for the SAME individual; prior-year basis is an input, not tracked across years.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: line3,
        right: { kind: "add", args: [line11, line12] },
      },
    },
  },
];
