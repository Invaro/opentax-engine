/**
 * Charitable deduction for non-itemizers — 26 U.S.C. § 170(p), as amended
 * by Pub. L. 119-21 (OBBBA): permanent, effective for taxable years
 * beginning after December 31, 2025.
 *
 * Two versions so 2025 evaluations stay correct:
 *   v1 TY2025 — $0 (the provision is not yet effective)
 *   v2 TY2026+ — min(cash contributions, $1,000 / $2,000 joint), permanent
 *
 * Assumed satisfied and disclosed: contributions are CASH to qualifying
 * organizations (donor-advised funds and certain private foundations are
 * statutorily excluded).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });

const CITE = {
  source: "26 U.S.C. § 170(p), as amended by Pub. L. 119-21 (OBBBA)",
  section: "§ 170(p)",
  url: "https://www.law.cornell.edu/uscode/text/26/170",
};

export const charityRules: Rule[] = [
  {
    id: "us.federal.charitable_deduction_nonitemizer",
    version: 1,
    jurisdiction: "us.federal",
    title: "Charitable deduction for non-itemizers (not yet effective in 2025)",
    citation: {
      ...CITE,
      excerpt:
        "The OBBBA's permanent non-itemizer charitable deduction applies to taxable years beginning after December 31, 2025 — for 2025 the amount is $0.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: money("0"),
  },
  {
    id: "us.federal.charitable_deduction_nonitemizer",
    version: 2,
    jurisdiction: "us.federal",
    title: "Charitable deduction for non-itemizers (OBBBA, permanent from 2026)",
    citation: {
      ...CITE,
      excerpt:
        "…a deduction for charitable cash contributions of up to $1,000 ($2,000 in the case of a joint return) is allowed to individuals who do not itemize, for taxable years beginning after December 31, 2025; amounts are not indexed. [Cash to qualifying organizations only — donor-advised funds and certain private foundations excluded; assumed satisfied, disclosed.]",
    },
    effectiveFrom: "2026-01-01", // permanent: open-ended
    output: { type: "money" },
    parameters: {
      cap: { value: "100000", type: "money" }, // $1,000
      capJoint: { value: "200000", type: "money" }, // $2,000 (joint return)
    },
    formula: {
      kind: "min",
      args: [
        fact("charitableCashContributions"),
        {
          kind: "match",
          on: fact("filingStatus"),
          cases: [
            { when: "mfj", value: { kind: "param", name: "capJoint" } },
            { when: "single", value: { kind: "param", name: "cap" } },
            { when: "hoh", value: { kind: "param", name: "cap" } },
            { when: "mfs", value: { kind: "param", name: "cap" } },
            { when: "qss", value: { kind: "param", name: "cap" } },
          ],
        },
      ],
    },
  },
];
