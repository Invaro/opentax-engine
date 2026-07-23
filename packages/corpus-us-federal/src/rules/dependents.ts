/**
 * Dependent determination — 26 U.S.C. § 152. "Can I claim this person?"
 * for ONE candidate person, as boolean rules with proof trees.
 *
 * Qualifying child (§ 152(c)): relationship · age (<19, or <24 full-time
 * student, or permanently disabled; younger than the taxpayer unless
 * disabled) · same principal residence over half the year · did not provide
 * over half their own support · no joint return (refund-only exception
 * assumed satisfied when depFilesJointReturn is false).
 *
 * Qualifying relative (§ 152(d)): not anyone's qualifying child ·
 * § 152(d)(2) relationship (or full-year household member) · gross income
 * under the exemption amount ($5,200 TY2025 / $5,300 TY2026 — read from
 * the Rev. Procs.) · taxpayer provides over half the support.
 *
 * Statutory exceptions encoded as overrides (the proof shows why they did
 * or didn't fire): multiple-support agreements (§ 152(d)(3)) and the
 * divorced-parents release (§ 152(e), Form 8332) — in both directions:
 * the noncustodial parent gains the claim, the releasing custodial parent
 * loses it.
 *
 * Not modeled (disclosed): tie-breakers (§ 152(c)(4)) and the
 * taxpayer-side limits of § 152(b).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const intLit = (n: string): Expr => ({ kind: "int", value: n });
const FROM = { effectiveFrom: "2025-01-01" };

const CITE_URL = "https://www.law.cornell.edu/uscode/text/26/152";

// age test: disabled at any age; else younger than the taxpayer AND
// (<19, or <24 while a full-time student) — § 152(c)(3)
const ageTest: Expr = {
  kind: "or",
  args: [
    fact("depPermanentlyDisabled"),
    {
      kind: "and",
      args: [
        fact("depYoungerThanTaxpayer"),
        {
          kind: "or",
          args: [
            { kind: "cmp", op: "lt", left: fact("depAge"), right: intLit("19") },
            {
              kind: "and",
              args: [
                fact("depIsFullTimeStudent"),
                { kind: "cmp", op: "lt", left: fact("depAge"), right: intLit("24") },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function qualifyingRelativeRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  limitCents: string,
  yearLabel: string,
  revProc: string,
): Rule {
  return {
    id: "us.federal.dependent.qualifying_relative",
    version,
    jurisdiction: "us.federal",
    title: `Candidate is a qualifying relative (§ 152(d), TY${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 152(d); ${revProc}`,
      section: "§ 152(d)(1)",
      url: CITE_URL,
      excerpt: `…an individual who bears a § 152(d)(2) relationship to the taxpayer (or is a full-year member of the household), whose gross income for the calendar year is less than the exemption amount (TY${yearLabel}: as adjusted), with respect to whom the taxpayer provides over one-half of the individual's support, and who is not a qualifying child of the taxpayer or any other taxpayer. [Multiple-support agreements (§ 152(d)(3)) not modeled.]`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "bool" },
    parameters: {
      grossIncomeLimit: { value: limitCents, type: "money" },
    },
    formula: {
      kind: "and",
      args: [
        { kind: "not", arg: fact("depIsQualifyingChildOfAnother") },
        fact("depRelationshipRelative"),
        {
          kind: "cmp",
          op: "lt",
          left: fact("depGrossIncome"),
          right: { kind: "param", name: "grossIncomeLimit" },
        },
        fact("taxpayerProvidedOverHalfSupport"),
      ],
    },
  };
}

export const dependentRules: Rule[] = [
  {
    id: "us.federal.dependent.qualifying_child",
    version: 1,
    jurisdiction: "us.federal",
    title: "Candidate is a qualifying child (§ 152(c))",
    citation: {
      source: "26 U.S.C. § 152(c)",
      section: "§ 152(c)(1)–(3)",
      url: CITE_URL,
      excerpt:
        "…a child of the taxpayer or a descendant of such a child, or a brother, sister, stepbrother, or stepsister… or a descendant; who has the same principal place of abode as the taxpayer for more than one-half of the taxable year; who is younger than the taxpayer and has not attained age 19 (24 if a full-time student), or is permanently and totally disabled; who has not provided over one-half of such individual's own support; and who has not filed a joint return. [Tie-breakers (§ 152(c)(4)) and divorced-parent rules (§ 152(e)) not modeled.]",
    },
    ...FROM,
    output: { type: "bool" },
    formula: {
      kind: "and",
      args: [
        fact("depRelationshipChild"),
        ageTest,
        fact("depLivedWithTaxpayerOverHalfYear"),
        { kind: "not", arg: fact("depProvidedOwnSupportOverHalf") },
        { kind: "not", arg: fact("depFilesJointReturn") },
      ],
    },
  },
  qualifyingRelativeRule(
    1, "2025-01-01", "2026-01-01",
    "520000", "2025", "Rev. Proc. 2024-40 § 2.24 ($5,200)",
  ),
  qualifyingRelativeRule(
    2, "2026-01-01", "2027-01-01",
    "530000", "2026", "Rev. Proc. 2025-32 § 4.23 ($5,300)",
  ),
  ...([
    { version: 1, from: "2025-01-01", to: "2026-01-01", limit: "520000", year: "2025", revProc: "Rev. Proc. 2024-40 § 2.24 ($5,200)" },
    { version: 2, from: "2026-01-01", to: "2027-01-01", limit: "530000", year: "2026", revProc: "Rev. Proc. 2025-32 § 4.23 ($5,300)" },
  ].map(({ version, from, to, limit, year, revProc }): Rule => ({
    id: "us.federal.dependent.qualifying_relative.multiple_support",
    version,
    jurisdiction: "us.federal",
    title: `Multiple-support agreement: over-10% contributor treated as providing over half (§ 152(d)(3), TY${year})`,
    citation: {
      source: `26 U.S.C. § 152(d)(3); Form 2120; ${revProc}`,
      section: "§ 152(d)(3)",
      url: CITE_URL,
      excerpt:
        "…the taxpayer shall be treated as having contributed over one-half of the support of an individual if no one person contributed over one-half, over one-half was received from two or more persons each of whom (but for the support test) could claim the individual, the taxpayer contributed over 10 percent, and every other over-10% contributor files a written declaration waiving the claim (Form 2120). [The group conditions and waivers are attested by the hasMultipleSupportAgreement fact — disclosed.]",
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "bool" },
    applicability: fact("hasMultipleSupportAgreement"),
    parameters: {
      grossIncomeLimit: { value: limit, type: "money" },
    },
    formula: {
      kind: "and",
      args: [
        { kind: "not", arg: fact("depIsQualifyingChildOfAnother") },
        fact("depRelationshipRelative"),
        {
          kind: "cmp",
          op: "lt",
          left: fact("depGrossIncome"),
          right: { kind: "param", name: "grossIncomeLimit" },
        },
        // § 152(d)(3) replaces the over-half support test with over-10%
        fact("taxpayerProvidedOver10PercentSupport"),
      ],
    },
    overrides: { ruleId: "us.federal.dependent.qualifying_relative", priority: 10 },
  }))),
  {
    id: "us.federal.dependent.qualifying_child.divorced_release",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "Divorced or separated parents: the Form 8332 release reallocates the qualifying child (§ 152(e))",
    citation: {
      source: "26 U.S.C. § 152(e); Form 8332",
      section: "§ 152(e)(1), (2)",
      url: CITE_URL,
      excerpt:
        "…a child shall be treated as the qualifying child of the NONCUSTODIAL parent if the custodial parent signs a written declaration that such parent will not claim such child as a dependent (Form 8332) — provided the parents are divorced, separated, or lived apart during the last 6 months, the child received over one-half of support from the parents, and was in the custody of one or both for more than one-half of the year (attested by the depDivorcedParentsRule fact). The releasing CUSTODIAL parent correspondingly cannot claim the child. [§ 152(e) moves the DEPENDENCY (CTC); the EITC residency test is unaffected by a release — disclosed.]",
    },
    ...FROM,
    output: { type: "bool" },
    applicability: fact("depDivorcedParentsRule"),
    formula: {
      kind: "if",
      cond: fact("taxpayerIsCustodialParent"),
      // custodial parent: normal tests, but a signed release forfeits the claim
      then: {
        kind: "and",
        args: [
          { kind: "not", arg: fact("custodialParentReleasedClaim") },
          fact("depRelationshipChild"),
          ageTest,
          fact("depLivedWithTaxpayerOverHalfYear"),
          { kind: "not", arg: fact("depProvidedOwnSupportOverHalf") },
          { kind: "not", arg: fact("depFilesJointReturn") },
        ],
      },
      // noncustodial parent: the release stands in for the residency test
      else: {
        kind: "and",
        args: [
          fact("custodialParentReleasedClaim"),
          fact("depRelationshipChild"),
          ageTest,
          { kind: "not", arg: fact("depFilesJointReturn") },
        ],
      },
    },
    overrides: { ruleId: "us.federal.dependent.qualifying_child", priority: 10 },
  },
  {
    id: "us.federal.dependent.is_dependent",
    version: 1,
    jurisdiction: "us.federal",
    title: "Candidate can be claimed as the taxpayer's dependent (§ 152(a))",
    citation: {
      source: "26 U.S.C. § 152(a)",
      section: "§ 152(a)",
      url: CITE_URL,
      excerpt:
        "…the term 'dependent' means a qualifying child, or a qualifying relative. [§ 152(b) taxpayer-side limits (dependents of dependents, married dependents filing jointly, non-citizens) not modeled — disclosed.]",
    },
    ...FROM,
    output: { type: "bool" },
    formula: {
      // qualifying-child first: if it holds, none of the relative-test
      // facts (income, support) are ever demanded
      kind: "or",
      args: [
        { kind: "rule", ruleId: "us.federal.dependent.qualifying_child" },
        { kind: "rule", ruleId: "us.federal.dependent.qualifying_relative" },
      ],
    },
  },
];
