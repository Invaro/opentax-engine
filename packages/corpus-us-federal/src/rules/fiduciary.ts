/**
 * Form 1041 — estates and non-grantor trusts, § 1(e) — verified July 2026.
 *
 * The compressed four-rate schedule (10/24/35/37, OBBBA-permanent per
 * Rev. Proc. 2025-32 § 2.01):
 *   TY2025 (Rev. Proc. 2024-40 § 2.01 Table 5): $3,150 / $11,450 / $15,650
 *   TY2026 (Rev. Proc. 2025-32 § 4.01 Table 5): $3,300 / $11,700 / $16,000
 * No Tax Table — Form 1041 uses its rate schedule directly.
 *
 * Exemption in lieu of § 151 (§ 642(b), statutory): $600 estate / $300
 * simple trust (required to distribute all income currently) / $100
 * complex trust. Qualified disability trusts (§ 642(b)(2)(C)) are not
 * modeled — refusable by entering the right type is impossible, so it is
 * disclosed instead (their higher exemption would LOWER tax — conservative).
 *
 * INPUT CONTRACT: fiduciaryIncomeBeforeExemption is Form 1041 taxable
 * income BEFORE the exemption but AFTER the income-distribution deduction
 * (the DNI machinery of §§ 651/661 is attested by the input). Preferential
 * income (the § 1(h) trust breakpoints: 0% to $3,250/$15,900 in 2025,
 * $3,300/$16,250 in 2026) REFUSES rather than tax gains at ordinary
 * rates; trust AMT (§ 55(d): $30,700/$31,400 exemptions) is not modeled —
 * disclosed.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

// § 642(b): $600 estate / $300 simple trust / $100 complex trust
const exemption: Expr = {
  kind: "match",
  on: fact("fiduciaryType"),
  cases: [
    { when: "estate", value: money("60000") },
    { when: "simple-trust", value: money("30000") },
    { when: "complex-trust", value: money("10000") },
  ],
};

function fiduciaryRule(
  version: number,
  from: string,
  to: string,
  b1: string, // 10% top, cents
  b2: string, // 24% top
  b3: string, // 35% top
  tableLabel: string,
  sourceLabel: string,
): Rule {
  return {
    id: "us.federal.fiduciary.income_tax",
    version,
    jurisdiction: J,
    title: `Estate/trust income tax — § 1(e) compressed brackets (${tableLabel})`,
    citation: {
      source: `26 U.S.C. § 1(e), (j)(2)(E); § 642(b); ${sourceLabel}`,
      section: "§ 1(j)(2)(E); § 642(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/1",
      excerpt: `${tableLabel} rate schedule for estates and trusts (${sourceLabel}, Table 5, verbatim thresholds): 10% to ${fmt(b1)}, 24% to ${fmt(b2)}, 35% to ${fmt(b3)}, 37% above. The § 642(b) exemption is deducted in lieu of § 151: 'An estate shall be allowed a deduction of $600'; a trust 'required to distribute all of its income currently' $300; any other trust $100 (statutory, unindexed). [Input is taxable income BEFORE the exemption, AFTER the §§ 651/661 income-distribution deduction — the DNI machinery is attested. Preferential-rate income REFUSES (the § 1(h) trust breakpoints are not modeled); the estate/trust AMT and § 642(b)(2)(C) qualified disability trusts are not modeled — disclosed. Grantor trusts are not taxed here at all — their items belong on the grantor's return.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: gt0(fact("fiduciaryLongTermGains")),
      then: {
        kind: "unsupported",
        reason:
          "preferential-rate income in an estate/trust is not modeled — the § 1(h) breakpoints for estates and trusts and the Schedule D Tax Worksheet stacking refuse rather than tax gains at ordinary rates",
      },
      else: {
        kind: "brackets",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: fact("fiduciaryIncomeBeforeExemption"),
            right: exemption,
          },
        },
        table: [
          { threshold: "0", rate: { num: "10", den: "100" } },
          { threshold: b1, rate: { num: "24", den: "100" } },
          { threshold: b2, rate: { num: "35", den: "100" } },
          { threshold: b3, rate: { num: "37", den: "100" } },
        ],
      },
    },
  };
}

function fmt(cents: string): string {
  const d = BigInt(cents) / 100n;
  return `$${d.toLocaleString("en-US")}`;
}

export const fiduciaryRules: Rule[] = [
  fiduciaryRule(
    1, "2025-01-01", "2026-01-01",
    "315000", "1145000", "1565000",
    "TY2025", "Rev. Proc. 2024-40 § 2.01",
  ),
  fiduciaryRule(
    2, "2026-01-01", "2027-01-01",
    "330000", "1170000", "1600000",
    "TY2026", "Rev. Proc. 2025-32 § 4.01",
  ),
];
