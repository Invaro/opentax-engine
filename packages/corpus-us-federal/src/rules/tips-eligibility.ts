/**
 * Tips-deduction ELIGIBILITY — the determination layer for § 224.
 *
 * These rules answer the questions people actually ask ("does my job
 * qualify?", "can I claim it filing separately?") as boolean rules with
 * citations and full proof trees showing exactly which condition passed
 * or failed. The money rule (tips_deduction) defers to the eligibility
 * predicate, so the amount and the determination can never disagree.
 *
 * Conditions encoded (final regs, Treas. Reg. § 1.224-1, IR-2026-49):
 *   1. occupation is on the Treasury Tipped Occupation list
 *   2. tips were voluntary, payor-determined, non-negotiated
 *   3. not received in the course of an employer's SSTB
 *   4. married taxpayers must file jointly (§ 224)
 * SSN-on-return is assumed satisfied (disclosed).
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { TIPPED_OCCUPATIONS } from "../occupations.js";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const boolLit = (value: boolean): Expr => ({ kind: "bool", value });
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});

const WINDOW = { effectiveFrom: "2025-01-01", effectiveTo: "2029-01-01" };

export const tipsEligibilityRules: Rule[] = [
  {
    id: "us.federal.eligible.tips_occupation",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Occupation is on the Treasury Tipped Occupation list (§ 224 'customarily and regularly received tips')",
    citation: {
      source:
        "Treas. Reg. § 1.224-1 (final rule, IR-2026-49, Apr. 10, 2026; proposed 90 Fed. Reg. 45340)",
      section: "§ 1.224-1 occupation list (TTC 101–809 + final-rule additions)",
      url: "https://www.irs.gov/newsroom/treasury-irs-issue-final-regulations-listing-occupations-where-workers-customarily-and-regularly-receive-tips-under-the-one-big-beautiful-bill",
      excerpt:
        "The final regulations list the occupations that customarily and regularly received tips on or before December 31, 2024 — 68 proposed occupations across eight categories (Beverage & Food Service through Transportation & Delivery), with visual artists, floral designers, and gas pump attendants added in the final rule.",
    },
    ...WINDOW,
    output: { type: "bool" },
    formula: {
      kind: "match",
      on: fact("occupation"),
      cases: [
        ...TIPPED_OCCUPATIONS.map((o) => ({ when: o.slug, value: boolLit(true) })),
        { when: "other", value: boolLit(false) },
      ],
    },
  },
  {
    id: "us.federal.eligible.tips_deduction",
    version: 1,
    jurisdiction: "us.federal",
    title: "Eligible to claim the qualified-tips deduction (§ 224)",
    citation: {
      source: "26 U.S.C. § 224; Treas. Reg. § 1.224-1 (final, Apr. 10, 2026)",
      section: "§ 224(a), (d)",
      url: "https://www.law.cornell.edu/uscode/text/26/224",
      excerpt:
        "Qualified tips must be received in a listed occupation, paid voluntarily by the customer and not subject to negotiation (service charges excluded), and not received in the course of a § 199A(d)(2) specified service trade or business; married taxpayers must file a joint return. [SSN-on-return condition assumed satisfied — disclosed.]",
    },
    ...WINDOW,
    output: { type: "bool" },
    formula: {
      // Ordered so the no-new-facts conditions short-circuit first:
      // an MFS filer gets a definitive "false" without being asked their job.
      kind: "and",
      args: [
        { kind: "not", arg: isStatus("mfs") },
        { kind: "rule", ruleId: "us.federal.eligible.tips_occupation" },
        fact("tipsWereVoluntary"),
        { kind: "not", arg: fact("employerIsSSTB") },
      ],
    },
  },
];
