/**
 * Itemized deductions (Schedule A) and the standard-or-itemized election —
 * 26 U.S.C. §§ 63, 68, 163(h)(3), 164(b)(6)–(7), 170(b), 213, as amended by
 * Pub. L. 119-21 (OBBBA).
 *
 * Verified from the amended statute text (law.cornell.edu, fetched July 2026):
 *
 * SALT (§ 164(b)(6)–(7), OBBBA § 70120) — the cap ESCALATES 1%/year:
 *   TY2025: $40,000 cap · $500,000 MAGI threshold ($20,000/$250,000 MFS)
 *   TY2026: $40,400 cap · $505,000 MAGI threshold ($20,200/$252,500 MFS)
 *   Cap reduced by 30% of MAGI over the threshold, floored at $10,000
 *   ($5,000 MFS). Reverts to a flat $10,000 in 2030.
 *
 * Mortgage interest (§ 163(h)(3)) — $750,000 ($375,000 MFS) acquisition-debt
 * limit, made PERMANENT by OBBBA (the pre-2026 sunset in (h)(3)(F) struck).
 *
 * Charitable, itemizers (§ 170(b)(1)(G), (b)(1)(I)) — 60%-of-AGI cash limit
 * permanent; NEW 0.5%-of-contribution-base floor effective TY2026
 * (OBBBA § 70425), applied to the otherwise-allowable amount.
 *
 * Medical (§ 213(a)) — expenses over 7.5% of AGI (permanent since P.L. 116-260).
 *
 * Overall limitation (§ 68, replaced by OBBBA § 70111, TY2026+) — itemized
 * deductions reduced by 2/37 of the lesser of (1) the deductions or (2)
 * taxable income (without regard to § 68, increased by the deductions) over
 * the 37%-bracket start; applied after every other limitation (§ 68(b)).
 * The old Pease phase-out stays suspended for 2025 (TCJA § 68(f)).
 *
 * Election (§ 63(a), (b), (d), (e)) — modeled as the larger deduction bundle:
 * max(standard deduction + § 170(p), itemized). § 170(p) requires NOT
 * itemizing, so it switches off automatically when the itemized side wins.
 * The §§ 151(d)(5)/224/225/163(h)(4) OBBBA deductions and § 199A are listed
 * in § 63(b) and excluded from "itemized deductions" by § 63(d)(2), so they
 * apply on BOTH sides of the election and stay outside the max.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const isStatus = (status: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: status },
});
const mfsHalf = (full: string, half: string): Expr => ({
  kind: "if",
  cond: isStatus("mfs"),
  then: param(half),
  else: param(full),
});

const agi = ruleRef("us.federal.agi");

/** Per-year § 164(b)(6)–(7) SALT deduction rule (MAGI ≈ AGI, disclosed). */
function saltRule(
  version: number,
  effectiveFrom: string,
  effectiveTo: string,
  amounts: { cap: string; capMfs: string; threshold: string; thresholdMfs: string },
  label: { year: string; cap: string; threshold: string },
): Rule {
  return {
    id: "us.federal.salt_deduction",
    version,
    jurisdiction: J,
    title: `State and local tax deduction with the OBBBA cap (TY${label.year}: ${label.cap}, 30% phase-down over ${label.threshold} MAGI, $10,000 floor)`,
    citation: {
      source: "26 U.S.C. § 164(b)(6)–(7), as amended by Pub. L. 119-21 (OBBBA) § 70120",
      section: "§ 164(b)(6), (b)(7)",
      url: "https://www.law.cornell.edu/uscode/text/26/164",
      excerpt: `State and local income (or sales) and property taxes are capped at the applicable limitation amount — ${label.cap} for taxable years beginning in ${label.year} (halved for a married individual filing separately) — "reduced by 30 percent of the excess (if any) of the taxpayer's modified adjusted gross income over the threshold amount" of ${label.threshold} (halved MFS); the reduction "shall not result in the applicable limitation amount being less than $10,000" ($5,000 MFS). Both the cap and the threshold escalate 1% per year through 2029, then revert to a flat $10,000 in 2030. [MAGI ≈ AGI: the § 911/931/933 foreign-exclusion add-backs are not modeled — disclosed.]`,
    },
    effectiveFrom,
    effectiveTo,
    output: { type: "money" },
    parameters: {
      cap: { value: amounts.cap, type: "money" },
      capMfs: { value: amounts.capMfs, type: "money" },
      threshold: { value: amounts.threshold, type: "money" },
      thresholdMfs: { value: amounts.thresholdMfs, type: "money" },
      floor: { value: "1000000", type: "money" }, // $10,000
      floorMfs: { value: "500000", type: "money" }, // $5,000
    },
    formula: {
      kind: "min",
      args: [
        fact("stateAndLocalTaxesPaid"),
        {
          // applicable limitation amount = max(floor, cap − 30% × excess MAGI)
          kind: "max",
          args: [
            mfsHalf("floor", "floorMfs"),
            {
              kind: "sub",
              left: mfsHalf("cap", "capMfs"),
              right: {
                kind: "mulRate",
                base: {
                  kind: "max0",
                  arg: {
                    kind: "sub",
                    left: agi,
                    right: mfsHalf("threshold", "thresholdMfs"),
                  },
                },
                rate: { num: "30", den: "100" },
                round: "half-up",
              },
            },
          ],
        },
      ],
    },
  };
}

/** § 170(b)(1)(G) 60%-of-AGI cash limit (both years’ common core). */
const charityCashLimited: Expr = {
  kind: "min",
  args: [
    fact("charitableCashContributions"),
    { kind: "mulRate", base: agi, rate: { num: "60", den: "100" }, round: "half-up" },
  ],
};

const CHARITY_CITE = {
  source:
    "26 U.S.C. § 170(b)(1)(G), (b)(1)(I), as amended by Pub. L. 119-21 (OBBBA) §§ 70424–70425",
  section: "§ 170(b)(1)(G), (b)(1)(I)",
  url: "https://www.law.cornell.edu/uscode/text/26/170",
};

export const itemizedRules: Rule[] = [
  saltRule(
    1, "2025-01-01", "2026-01-01",
    { cap: "4000000", capMfs: "2000000", threshold: "50000000", thresholdMfs: "25000000" },
    { year: "2025", cap: "$40,000", threshold: "$500,000" },
  ),
  saltRule(
    2, "2026-01-01", "2027-01-01",
    { cap: "4040000", capMfs: "2020000", threshold: "50500000", thresholdMfs: "25250000" },
    { year: "2026", cap: "$40,400", threshold: "$505,000" },
  ),
  {
    id: "us.federal.mortgage_interest_deduction",
    version: 1,
    jurisdiction: J,
    title:
      "Home mortgage interest on acquisition debt up to $750,000 ($375,000 MFS)",
    citation: {
      source: "26 U.S.C. § 163(h)(3), as amended by Pub. L. 119-21 (OBBBA)",
      section: "§ 163(h)(3)(B)(ii), (h)(3)(F)",
      url: "https://www.law.cornell.edu/uscode/text/26/163",
      excerpt:
        "Qualified residence interest on acquisition indebtedness, applying the $750,000 ($375,000 in the case of a married individual filing a separate return) limitation — made permanent by the OBBBA (the before-January-1-2026 sunset struck from § 163(h)(3)(F)). When the average acquisition-debt balance exceeds the limit, deductible interest is prorated by limit/balance (the Publication 936 method). [Assumed and disclosed: debt incurred after December 15, 2017 and secured by a qualified residence (the grandfathered $1,000,000 pre-2018 limit is NOT modeled — conservative); home-equity interest is not deductible (§ 163(h)(3)(F)(i)(I)); mortgage insurance premiums treated as qualified residence interest from 2026 (OBBBA) are NOT modeled — conservative.]",
    },
    effectiveFrom: "2025-01-01", // limit permanent under OBBBA: open-ended
    output: { type: "money" },
    parameters: {
      limit: { value: "75000000", type: "money" }, // $750,000
      limitMfs: { value: "37500000", type: "money" }, // $375,000
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("mortgageInterestPaid"), right: zero },
      then: {
        kind: "if",
        cond: {
          kind: "cmp",
          op: "le",
          left: fact("mortgageAverageBalance"),
          right: mfsHalf("limit", "limitMfs"),
        },
        then: fact("mortgageInterestPaid"),
        else: {
          kind: "mulDiv",
          a: fact("mortgageInterestPaid"),
          b: mfsHalf("limit", "limitMfs"),
          c: fact("mortgageAverageBalance"),
          round: "half-up",
        },
      },
      else: zero,
    },
  },
  {
    id: "us.federal.charitable_deduction_itemizer",
    version: 1,
    jurisdiction: J,
    title: "Charitable deduction for itemizers (TY2025: cash, 60% of AGI limit)",
    citation: {
      ...CHARITY_CITE,
      excerpt:
        "Cash contributions to public charities are deductible up to 60 percent of the taxpayer's contribution base (≈ AGI) — the 60% limit is permanent (OBBBA § 70424 struck the pre-2026 sunset from § 170(b)(1)(G)). The § 170(b)(1)(I) 0.5% floor does not apply to taxable years beginning before 2026. [Modeled and disclosed: CASH gifts to 60%-limit organizations only; excess-contribution carryovers (§ 170(d)) are not modeled — conservative for the current year.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: charityCashLimited,
  },
  {
    id: "us.federal.charitable_deduction_itemizer",
    version: 2,
    jurisdiction: J,
    title:
      "Charitable deduction for itemizers (TY2026+: 60% of AGI limit, then the OBBBA 0.5% floor)",
    citation: {
      ...CHARITY_CITE,
      excerpt:
        "For taxable years beginning after December 31, 2025 (OBBBA § 70425), § 170(b)(1)(I) provides: \"Any charitable contribution otherwise allowable (without regard to this subparagraph) as a deduction under this section shall be allowed only to the extent that the aggregate of such contributions exceeds 0.5 percent of the taxpayer's contribution base for the taxable year.\" Encoded as the otherwise-allowable amount (cash capped at 60% of AGI, § 170(b)(1)(G), permanent) minus 0.5% of AGI. [Modeled and disclosed: CASH gifts to 60%-limit organizations only; § 170(d) carryovers and the (b)(1)(I)(ii)–(iii) carryover coordination are not modeled — conservative for the current year.]",
    },
    effectiveFrom: "2026-01-01", // permanent: open-ended
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: charityCashLimited,
        right: {
          kind: "mulRate",
          base: agi,
          rate: { num: "5", den: "1000" }, // 0.5%
          round: "half-up",
        },
      },
    },
  },
  {
    id: "us.federal.medical_expense_deduction",
    version: 1,
    jurisdiction: J,
    title: "Medical expense deduction (expenses over 7.5% of AGI)",
    citation: {
      source: "26 U.S.C. § 213(a)",
      section: "§ 213(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/213",
      excerpt:
        "There shall be allowed as a deduction the expenses paid during the taxable year, not compensated for by insurance or otherwise, for medical care of the taxpayer, his spouse, or a dependent… to the extent that such expenses exceed 7.5 percent of adjusted gross income. [The 7.5% floor is permanent — P.L. 116-260 struck the temporary § 213(f).]",
    },
    effectiveFrom: "2025-01-01", // permanent: open-ended
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("medicalExpenses"),
        right: {
          kind: "mulRate",
          base: agi,
          rate: { num: "75", den: "1000" }, // 7.5%
          round: "half-up",
        },
      },
    },
  },
  {
    id: "us.federal.casualty_loss_deduction",
    version: 1,
    jurisdiction: J,
    title:
      "Personal casualty losses — federally declared disasters (10% AGI floor) + qualified disaster losses (no AGI floor)",
    citation: {
      source: "26 U.S.C. § 165(h); 2025 Instructions for Form 4684",
      section: "§ 165(h)(1), (2), (5)",
      url: "https://www.law.cornell.edu/uscode/text/26/165",
      excerpt:
        "A personal casualty loss 'shall be allowed as a deduction under subsection (a) only to the extent it is attributable to a Federally declared disaster… or a State declared disaster' (§ 165(h)(5), verbatim — non-declared losses are nondeductible and must not be entered); each casualty is reduced by the § 165(h)(1) floor and the excess of losses over gains is 'allowed… only to the extent… such excess… exceeds 10 percent of the adjusted gross income of the individual' (§ 165(h)(2)(A), verbatim). Qualified disaster losses differ: 'Personal casualty and theft losses attributable to a qualified disaster loss are not subject to the 10% of the AGI reduction and the $100 reduction is increased to $500' (2025 Instructions for Form 4684, verbatim). [Per-event floors and insurance netting are attested by the two inputs; personal casualty GAINS are not modeled — enter net losses only. The qualified portion also increases the STANDARD deduction when not itemizing — see the deduction election.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        {
          kind: "max0",
          arg: {
            kind: "sub",
            left: fact("casualtyFederalDisasterLosses"),
            right: {
              kind: "mulRate",
              base: ruleRef("us.federal.agi"),
              rate: { num: "10", den: "100" },
              round: "half-up",
            },
          },
        },
        fact("casualtyQualifiedDisasterLosses"),
      ],
    },
  },
  {
    id: "us.federal.itemized_deductions_before_limitation",
    version: 4, // v2 lacked investment interest (§ 163(d)) and noncash charitable; v4 adds gambling losses (§ 165(d), Schedule A line 16) as an attested-limited fact
    jurisdiction: J,
    title:
      "Itemized deductions before the § 68 overall limitation (SALT + mortgage + charitable cash/noncash + medical + casualty + investment interest + gambling losses)",
    citation: {
      source: "26 U.S.C. § 63(d)",
      section: "§ 63(d)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "'Itemized deductions' means the deductions allowable under this chapter other than (1) the deductions allowable in arriving at adjusted gross income, and (2) any deduction referred to in any paragraph of subsection (b). [Modeled Schedule A lines: taxes (§ 164), home mortgage interest (§ 163(h)), gifts to charity (§ 170) — cash via the limited charitable rule, noncash as the attested-allowed Form 8283 amount — medical (§ 213), casualty losses (§ 165(h), Form 4684), investment interest (§ 163(d)) as the attested post-Form-4952 allowed amount, and gambling losses (§ 165(d), Schedule A line 16) as the attested winnings-limited amount (TY2025: 100% of the limited amount; the OBBBA 90% haircut begins TY2026). Other miscellaneous itemized deductions are not modeled — conservative.]",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        ruleRef("us.federal.salt_deduction"),
        ruleRef("us.federal.mortgage_interest_deduction"),
        ruleRef("us.federal.charitable_deduction_itemizer"),
        fact("noncashCharitableContributions"),
        ruleRef("us.federal.medical_expense_deduction"),
        ruleRef("us.federal.casualty_loss_deduction"),
        fact("investmentInterestDeduction"),
        fact("gamblingLossesItemized"),
        fact("otherItemizedDeductions"),
      ],
    },
  },
  {
    id: "us.federal.itemized_deductions",
    version: 1,
    jurisdiction: J,
    title: "Itemized deductions (TY2025: no overall limitation — § 68 suspended)",
    citation: {
      source: "26 U.S.C. § 68(f) (as in effect for 2025; P.L. 115-97 § 11046)",
      section: "§ 68(f)",
      url: "https://www.law.cornell.edu/uscode/text/26/68",
      excerpt:
        "Section 68 shall not apply to any taxable year beginning after December 31, 2017, and before January 1, 2026 — for 2025, itemized deductions carry no overall (Pease) limitation.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: ruleRef("us.federal.itemized_deductions_before_limitation"),
  },
  {
    id: "us.federal.itemized_deductions",
    version: 2,
    jurisdiction: J,
    title:
      "Itemized deductions after the § 68 overall limitation (TY2026+: 2/37 of the amount over the 37% bracket)",
    citation: {
      source: "26 U.S.C. § 68, as amended by Pub. L. 119-21 (OBBBA) § 70111",
      section: "§ 68(a), (b)",
      url: "https://www.law.cornell.edu/uscode/text/26/68",
      excerpt:
        "For taxable years beginning after December 31, 2025, itemized deductions are reduced by 2/37 of the lesser of (1) such amount of itemized deductions, or (2) so much of the taxable income of the taxpayer for the taxable year (determined without regard to this section and increased by such amount of itemized deductions) as exceeds the dollar amount at which the 37 percent rate bracket under section 1 begins (Rev. Proc. 2025-32 § 4.01: $640,600 single/HoH, $768,700 MFJ/QSS, $384,350 MFS for 2026); applied after the application of any other limitation (§ 68(b)). [The taxable-income term nets out every deduction except the itemized deductions themselves; the § 199A interaction is NOT modeled — when both would apply, this rule refuses rather than guess.]",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01", // the 37%-bracket start is indexed — TY2027 needs a new version
    output: { type: "money" },
    formula: (() => {
      const itemizedPre = ruleRef("us.federal.itemized_deductions_before_limitation");
      // "taxable income … determined without regard to this section and
      // increased by such amount of itemized deductions" = AGI minus the
      // § 63(b)-listed deductions that apply either way (senior/tips/
      // overtime/car-loan) minus § 199A. § 199A is guarded below instead of
      // subtracted: subtracting it would create a rule cycle through the
      // election, and any scenario where it is nonzero in § 68 territory
      // either refuses at § 199A's own threshold guard or refuses here.
      const tiIncreased: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: agi,
          right: {
            kind: "add",
            args: [
              ruleRef("us.federal.senior_deduction"),
              ruleRef("us.federal.tips_deduction"),
              ruleRef("us.federal.overtime_deduction"),
              ruleRef("us.federal.car_loan_interest_deduction"),
            ],
          },
        },
      };
      const bracket37Start: Expr = {
        kind: "match",
        on: fact("filingStatus"),
        cases: [
          { when: "single", value: money("64060000") }, // $640,600
          { when: "hoh", value: money("64060000") }, // $640,600
          { when: "mfj", value: money("76870000") }, // $768,700
          { when: "qss", value: money("76870000") }, // $768,700
          { when: "mfs", value: money("38435000") }, // $384,350
        ],
      };
      const reductionBase: Expr = {
        kind: "min",
        args: [
          itemizedPre,
          { kind: "max0", arg: { kind: "sub", left: tiIncreased, right: bracket37Start } },
        ],
      };
      return {
        kind: "if",
        cond: {
          kind: "and",
          args: [
            {
              kind: "cmp",
              op: "gt",
              left: fact("selfEmploymentNetProfit"),
              right: zero,
            },
            { kind: "cmp", op: "gt", left: reductionBase, right: zero },
          ],
        },
        then: {
          kind: "unsupported",
          reason:
            "the § 68 overall limitation and the § 199A deduction interact through the taxable-income term — this combination is not modeled yet",
        },
        else: {
          kind: "sub",
          left: itemizedPre,
          right: {
            kind: "mulRate",
            base: reductionBase,
            rate: { num: "2", den: "37" },
            round: "half-up",
          },
        },
      } satisfies Expr;
    })(),
  },
  {
    id: "us.federal.deduction_election",
    version: 3, // v2 lacked the qualified-disaster standard-deduction increase
    jurisdiction: J,
    title:
      "Standard-or-itemized election (greater bundle by default; qualified disaster losses increase the standard side; forceItemized honors an explicit § 63(e) election)",
    citation: {
      source: "26 U.S.C. § 63(a), (b), (d), (e); § 170(p); § 165(h)(5); 2025 Instructions for Form 4684",
      section: "§ 63(b), (e); § 165(h)(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/63",
      excerpt:
        "A non-itemizer's taxable income is adjusted gross income minus the standard deduction and the § 170(p) non-itemizer charitable deduction (§ 63(b)); an individual who elects to itemize (§ 63(e)) subtracts itemized deductions instead and — because § 170(p) applies only to 'an individual who does not elect to itemize deductions' — forgoes § 170(p). 'You can deduct qualified disaster losses without itemizing other deductions on Schedule A' (2025 Instructions for Form 4684, verbatim) — the net qualified disaster loss increases the STANDARD side of the election. Encoded as the larger bundle (the election that minimizes tax) UNLESS forceItemized attests an explicit § 63(e) election to itemize regardless — then itemized deductions apply even when smaller. The §§ 151(d)(5)/224/225/163(h)(4) and § 199A deductions are excluded from 'itemized deductions' by § 63(d)(2) and apply on both sides. The § 63(c)(6)(A) zero standard deduction for an MFS filer whose spouse itemizes flows through the standard-deduction term.",
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: fact("forceItemized"),
      then: ruleRef("us.federal.itemized_deductions"),
      else: {
        kind: "max",
        args: [
          {
            kind: "add",
            args: [
              ruleRef("us.federal.standard_deduction"),
              ruleRef("us.federal.charitable_deduction_nonitemizer"),
              fact("casualtyQualifiedDisasterLosses"),
            ],
          },
          ruleRef("us.federal.itemized_deductions"),
        ],
      },
    },
  },
];
