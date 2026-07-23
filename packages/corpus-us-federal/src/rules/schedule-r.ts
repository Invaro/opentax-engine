/**
 * § 22 credit for the elderly and the permanently and totally disabled
 * (Schedule R). Verified July 2026 from the statute — unindexed since 1986,
 * no OBBBA amendment.
 *
 * credit = 15% × max0( initial − § 22(c)(3) nontaxable benefits
 *                      − ½ × max0(AGI − threshold) )
 * initial: $5,000 single/HoH/QSS/joint-one-qualified; $7,500 joint-both;
 * $3,750 MFS — capped at §§ 72/105(a) disability income for an under-65
 * disabled individual. MFS living with the spouse: no credit (§ 22(e)(1)).
 * Nonrefundable; joins the § 26(a) cascade before the CTC (the Schedule
 * 8812 worksheet subtracts Schedule 3 credits first).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const isStatus = (v: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: v },
});

const qualified: Expr = {
  kind: "or",
  args: [fact("isAge65OrOlder"), fact("isRetiredOnTotalDisability")],
};

// $5,000 / $7,500 joint-both-qualified / $3,750 MFS
const initialByStatus: Expr = {
  kind: "if",
  cond: isStatus("mfs"),
  then: money("375000"),
  else: {
    kind: "if",
    cond: {
      kind: "and",
      args: [
        isStatus("mfj"),
        fact("spouseIsAge65OrOlder"), // spouse-disabled qualification not modeled — disclosed
      ],
    },
    then: money("750000"),
    else: money("500000"),
  },
};

// under-65 disabled: initial capped at §§ 72/105(a) disability income
const initial: Expr = {
  kind: "if",
  cond: fact("isAge65OrOlder"),
  then: initialByStatus,
  else: { kind: "min", args: [initialByStatus, fact("scheduleRDisabilityIncome")] },
};

const agiThreshold: Expr = {
  kind: "if",
  cond: isStatus("mfj"),
  then: money("1000000"), // $10,000
  else: {
    kind: "if",
    cond: isStatus("mfs"),
    then: money("500000"), // $5,000
    else: money("750000"), // $7,500
  },
};

const section22Amount: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: initial,
    right: {
      kind: "add",
      args: [
        fact("nontaxableBenefitsForScheduleR"),
        {
          kind: "mulRate",
          base: {
            kind: "max0",
            arg: { kind: "sub", left: ruleRef("us.federal.agi"), right: agiThreshold },
          },
          rate: { num: "50", den: "100" },
          round: "half-up",
        },
      ],
    },
  },
};

const CITATION = {
  source: "26 U.S.C. § 22; Schedule R (Form 1040)",
  section: "§ 22(a)-(e)",
  url: "https://www.law.cornell.edu/uscode/text/26/22",
  excerpt:
    "A credit equal to '15 percent of such individual's section 22 amount for such taxable year' (§ 22(a), verbatim) for a qualified individual — one 'who has attained age 65 before the close of the taxable year, or… who retired on disability… and who, when he retired, was permanently and totally disabled' (§ 22(b), verbatim; the physician's-statement substantiation is ATTESTED by isRetiredOnTotalDisability). Initial amounts: '$5,000 in the case of a single individual' or a joint return with one qualified spouse, '$7,500 in the case of a joint return where both spouses are qualified individuals', '$3,750 in the case of a married individual filing a separate return' (§ 22(c)(2)) — for an under-65 disabled individual, limited to §§ 72/105(a) disability income; reduced by § 22(c)(3) nontaxable social security, railroad retirement and VA benefits, and by 'one-half of the excess' of AGI over $7,500 / $10,000 joint / $5,000 MFS (§ 22(d)). [MFS living with the spouse at any time: no credit (§ 22(e)(1)) — gated on mfsLivedApartAllYear. A joint-return spouse qualifying by DISABILITY (rather than age 65) is not modeled for the $7,500 tier — conservative. Schedule R credit joins the § 26(a) cascade before the CTC.]",
};

export const scheduleRRules: Rule[] = [
  {
    id: "us.federal.schedule_r.tentative",
    version: 1,
    jurisdiction: J,
    title: "Credit for the elderly or the disabled — tentative (§ 22, Schedule R)",
    citation: CITATION,
    effectiveFrom: "2025-01-01", // statutory, unindexed
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "and",
        args: [
          qualified,
          {
            kind: "or",
            args: [{ kind: "not", arg: isStatus("mfs") }, fact("mfsLivedApartAllYear")],
          },
        ],
      },
      then: {
        kind: "roundToDollar",
        value: {
          kind: "mulRate",
          base: section22Amount,
          rate: { num: "15", den: "100" },
          round: "half-up",
        },
        mode: "half-up",
      },
      else: zero,
    },
  },
  {
    id: "us.federal.schedule_r_credit",
    version: 1,
    jurisdiction: J,
    title: "Schedule R credit, limited to remaining tax (§ 26(a) after CDCC + education + saver's + adoption)",
    citation: CITATION,
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "min",
      args: [
        ruleRef("us.federal.schedule_r.tentative"),
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
              ],
            },
          },
        },
      ],
    },
  },
];
