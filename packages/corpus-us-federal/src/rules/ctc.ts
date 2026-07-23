/**
 * Child Tax Credit, TY2025 — 26 U.S.C. § 24.
 *
 * tentative  = $2,000 per qualifying child (§ 24(a), (h)(2))
 * reduction  = $50 per $1,000 (OR FRACTION THEREOF) of AGI over the
 *              threshold (§ 24(b)) — "or fraction thereof" is a CEILING;
 *              encoding it as floor would be a silent $50 error.
 * ctc        = min(max0(tentative - reduction), tax before credits)
 *              (v0.1 models the nonrefundable credit only; the refundable
 *              additional child tax credit (§ 24(d), (h)(5)) is out of scope
 *              and stated so — the proof never claims more than it covers.)
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const FROM = { effectiveFrom: "2025-01-01" }; // structural rules: open-ended
const TY25_26 = { effectiveFrom: "2025-01-01", effectiveTo: "2027-01-01" };
const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });

export const ctcRules: Rule[] = [
  {
    id: "us.federal.ctc.tentative",
    version: 3, // v2 predated the § 24(h)(4) $500 credit for other dependents
    jurisdiction: J,
    title:
      "Child tax credit + credit for other dependents, before phase-out (as amended by OBBBA)",
    citation: {
      source:
        "26 U.S.C. § 24(a), (h)(4), as amended by Pub. L. 119-21 (OBBBA) § 70104; Rev. Proc. 2025-32 § 4.05",
      section: "§ 24(a), (h)(2), (h)(4)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "The One Big Beautiful Bill Act (enacted July 4, 2025) raised the child tax credit to $2,200 per qualifying child for taxable years beginning in 2025; Rev. Proc. 2025-32 § 4.05 confirms $2,200 for 2026. § 24(h)(4): 'The credit determined under subsection (a) (after the application of paragraph (2)) shall be increased by $500 for each dependent of the taxpayer (as defined in section 152) other than a qualifying child' — unindexed, never refundable (the § 24(d)(1)(A) ACTC cross-reference excludes it via (h)(5)'s per-child cap), subject to the same § 24(b) phase-out as part of the combined credit (Schedule 8812 line 8). [§ 24(h)(4)(B) noncitizen exception and the dependent's TIN requirement (§ 24(e)) attested by the count.]",
    },
    ...TY25_26,
    output: { type: "money" },
    parameters: {
      perChild: { value: "220000", type: "money" }, // $2,200
      perOtherDependent: { value: "50000", type: "money" }, // $500, unindexed
    },
    formula: {
      kind: "add",
      args: [
        {
          kind: "mulInt",
          base: { kind: "param", name: "perChild" },
          count: fact("qualifyingChildren"),
        },
        {
          kind: "mulInt",
          base: { kind: "param", name: "perOtherDependent" },
          count: fact("otherDependents"),
        },
      ],
    },
  },
  {
    id: "us.federal.ctc.phaseout_threshold",
    version: 1,
    jurisdiction: J,
    title: "CTC phase-out threshold by filing status",
    citation: {
      source: "26 U.S.C. § 24(h)(3) (made permanent by Pub. L. 119-21 § 70104)",
      section: "§ 24(h)(3)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "…subsection (b)(2) shall be applied by substituting '$400,000' for '$110,000' [joint returns] and '$200,000' for the [other] amounts…",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        // $400,000 applies only "in the case of a joint return" — every
        // other status (including QSS and MFS) gets $200,000.
        { when: "mfj", value: money("40000000") }, // $400,000
        { when: "single", value: money("20000000") }, // $200,000
        { when: "hoh", value: money("20000000") }, // $200,000
        { when: "mfs", value: money("20000000") }, // $200,000
        { when: "qss", value: money("20000000") }, // $200,000
      ],
    },
  },
  {
    id: "us.federal.ctc.reduction",
    version: 1,
    jurisdiction: J,
    title: "CTC phase-out reduction",
    citation: {
      source: "26 U.S.C. § 24(b)(1), (2)",
      section: "§ 24(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "…reduced (but not below zero) by $50 for each $1,000 (or fraction thereof) by which the taxpayer's modified adjusted gross income exceeds the threshold amount.",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      perStep: { value: "5000", type: "money" }, // $50
    },
    formula: {
      kind: "mulInt",
      base: { kind: "param", name: "perStep" },
      count: {
        kind: "stepUnits",
        value: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.agi"),
            right: ruleRef("us.federal.ctc.phaseout_threshold"),
          },
        },
        unitCents: "100000", // $1,000
        mode: "ceil", // "or fraction thereof"
      },
    },
  },
  {
    id: "us.federal.ctc.after_phaseout",
    version: 1,
    jurisdiction: J,
    title: "Child tax credit after phase-out (before the liability limit)",
    citation: {
      source: "26 U.S.C. § 24(a), (b)",
      section: "§ 24(a)–(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "…credit… reduced (but not below zero) by $50 for each $1,000 (or fraction thereof) by which… modified adjusted gross income exceeds the threshold amount.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: ruleRef("us.federal.ctc.tentative"),
        right: ruleRef("us.federal.ctc.reduction"),
      },
    },
  },
  {
    id: "us.federal.ctc",
    version: 6, // v5 predated the Schedule R credit ahead of it in the ordering
    jurisdiction: J,
    title: "Child tax credit + ODC (nonrefundable portion, after other Schedule 3 credits)",
    citation: {
      source: "26 U.S.C. § 24; § 26(a); Schedule 8812 Credit Limit Worksheet",
      section: "§ 24(a)–(b); § 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "credit… limited to tax liability under § 26(a) reduced by the other nonrefundable credits (the Schedule 8812 Credit Limit Worksheet subtracts Schedule 3 credits — here the § 21 dependent-care, § 25A education, § 25B saver's, § 23 adoption, and § 22 Schedule R credits — before limiting the CTC); the refundable additional child tax credit (§ 24(d)) is computed separately.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.ctc.after_phaseout"),
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: {
              kind: "add",
              args: [
                ruleRef("us.federal.income_tax_before_credits"),
                ruleRef("us.federal.amt"),
              ],
            },
            right: {
              kind: "add",
              args: [
                ruleRef("us.federal.cdcc"),
                ruleRef("us.federal.education.nonrefundable"),
                ruleRef("us.federal.savers_credit"),
                ruleRef("us.federal.adoption.nonrefundable"),
                ruleRef("us.federal.schedule_r_credit"),
              ],
            },
          },
        },
      ],
    },
  },
  {
    id: "us.federal.actc",
    version: 3, // v2 predated the Schedule C net-loss reduction of earned income
    jurisdiction: J,
    title:
      "Additional child tax credit — refundable (simplified: 3+-child SS-tax alternative not modeled)",
    citation: {
      source: "26 U.S.C. § 24(d), (h)(5); Rev. Proc. 2024-40 § 2.05 / Rev. Proc. 2025-32 § 4.05",
      section: "§ 24(d)(1); § 24(h)(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/24",
      excerpt:
        "The credit is refundable up to $1,700 per qualifying child (2025 and 2026, as adjusted), limited to 15 percent of so much of earned income as exceeds $2,500, and to the portion of the credit not used against tax. [The § 24(d)(1)(B)(ii) alternative for taxpayers with 3+ children (social security taxes minus EIC) is NOT modeled — it can only increase the refund at very low earned income; disclosed. Earned income approximated as wages.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      refundableCapPerChild: { value: "170000", type: "money" }, // $1,700
      earnedIncomeFloor: { value: "250000", type: "money" }, // $2,500
    },
    formula: {
      kind: "min",
      args: [
        // the part of the credit the liability limit left unused
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.ctc.after_phaseout"),
            right: ruleRef("us.federal.ctc"),
          },
        },
        // refundable cap: $1,700 per qualifying child
        {
          kind: "mulInt",
          base: { kind: "param", name: "refundableCapPerChild" },
          count: fact("qualifyingChildren"),
        },
        // 15% of earned income (wages + SE earnings net of ½ SE tax) above $2,500
        {
          kind: "mulRate",
          base: {
            kind: "max0",
            arg: {
              kind: "sub",
              left: {
                kind: "add",
                args: [
                  fact("wages"),
                  {
                    kind: "max0",
                    arg: {
                      kind: "sub",
                      left: fact("selfEmploymentNetProfit"),
                      right: ruleRef("us.federal.se_tax_half_deduction"),
                    },
                  },
                ],
              },
              right: {
                kind: "add",
                args: [
                  { kind: "param", name: "earnedIncomeFloor" },
                  // Schedule C net loss reduces § 24(d) earned income too
                  fact("scheduleCNetLoss"),
                ],
              },
            },
          },
          rate: { num: "15", den: "100" },
          round: "half-up",
        },
      ],
    },
  },
  {
    id: "us.federal.income_tax_after_credits",
    version: 5, // v4 predated the Schedule R credit
    jurisdiction: J,
    title:
      "Income tax after nonrefundable credits (CDCC + education + saver's + adoption + Schedule R + CTC/ODC)",
    citation: {
      source: "26 U.S.C. § 26(a)",
      section: "§ 26(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/26",
      excerpt:
        "The aggregate amount of credits allowed by this subpart… shall not exceed the taxpayer's regular tax liability for the taxable year… [modeled nonrefundable credits, in the forms' worksheet order: § 21 dependent care, § 25A education, § 25B saver's, § 23 adoption (nonrefundable portion), § 24 child tax credit + credit for other dependents].",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: {
          kind: "add",
          args: [
            ruleRef("us.federal.income_tax_before_credits"),
            ruleRef("us.federal.amt"), // Schedule 2 line 1 joins line 16 before credits
          ],
        },
        right: {
          kind: "add",
          args: [
            ruleRef("us.federal.cdcc"),
            ruleRef("us.federal.education.nonrefundable"),
            ruleRef("us.federal.savers_credit"),
            ruleRef("us.federal.adoption.nonrefundable"),
            ruleRef("us.federal.schedule_r_credit"),
            ruleRef("us.federal.ctc"),
          ],
        },
      },
    },
  },
];
