/**
 * Form 1120 taxable-income machinery, corporate estimated tax, and the
 * S-corporation entity-level taxes — verified July 2026.
 *
 * Charitable (§ 170(b)(2)): 10% of taxable income computed without § 170,
 * part VIII except § 248 (i.e. without the DRD), NOL carrybacks, capital
 * loss carrybacks, § 199A(g). The OBBBA adds a 1% FLOOR for taxable years
 * beginning after 2025: contributions deductible only to the extent the
 * aggregate exceeds 1% and does not exceed 10% of that base. NOL
 * carryFORWARDS interact circularly with the base — a return with both a
 * carryforward and contributions REFUSES rather than pick an ordering.
 *
 * DRD (§ 243; § 246(b)): 50% (<20% owned) / 65% (20–80%) / 100%
 * (affiliated, § 243(a)(3)); the 50%/65% deductions are capped at the same
 * percentage of taxable income computed without the DRD/NOL/§ 199A/§ 250 —
 * UNLESS the full deduction creates or increases an NOL (§ 246(b)(2)),
 * in which case the cap does not apply. The 100% DRD is never capped.
 *
 * NOL (§ 172): carryforward deduction limited to 80% of taxable income
 * computed without the NOL deduction; no carrybacks (post-TCJA).
 *
 * Estimated tax (§ 6655): installments of 25% of the lesser of 100% of the
 * current year's tax or 100% of the preceding year's tax — but a "large
 * corporation" ($1M+ taxable income in any of the 3 preceding years,
 * § 6655(g)(2)) may not use the prior-year prong (its first-installment
 * exception is not modeled — conservative). No addition if tax < $500.
 *
 * S-corp entity taxes: § 1375 — if the corporation has accumulated E&P
 * from C years AND passive investment income exceeds 25% of gross
 * receipts, tax at the highest § 11(b) rate (21%) on excess net passive
 * income = net passive income × (PII − 25%·GR)/PII, capped at as-if-C
 * taxable income. § 1374 — 21% on net recognized built-in gain (within
 * the 5-year recognition period after a C→S conversion), capped at
 * as-if-C taxable income. The § 1366(f) pass-through reductions for
 * these taxes are not modeled — disclosed.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });
const pct = (num: string, base: Expr): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den: "100" },
  round: "half-up",
});

// § 163(j)(8) adjusted taxable income, post-OBBBA (EBITDA): computed
// without interest, NOL, and depreciation/amortization — so the bonus-
// depreciation and foreign-R&D-amortization rules stay OUT of it, while
// expensed domestic research (§ 174A, not amortization) reduces it
// § 1211(a): a corporation's capital losses only offset capital gains;
// the excess carries (§ 1212(a): 3 back / 5 forward — reported as a target)
const netCapitalGainIncluded: Expr = {
  kind: "max0",
  arg: { kind: "sub", left: fact("corpCapitalGains"), right: fact("corpCapitalLosses") },
};

const ati163j: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: { kind: "add", args: [fact("corpGrossIncome"), netCapitalGainIncluded] },
    right: {
      kind: "add",
      args: [fact("corpOrdinaryDeductions"), fact("corpDomesticResearch")],
    },
  },
};

// § 179(b)(3)(A) active-conduct taxable-income limit base: computed WITHOUT
// § 179 and without investment items (capital gains excluded — conservative;
// gross income may still carry passive items, disclosed in the rule)
const active179Base: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: fact("corpGrossIncome"),
    right: {
      kind: "add",
      args: [
        fact("corpOrdinaryDeductions"),
        ruleRef("us.federal.corp.depreciation_deduction"),
        ruleRef("us.federal.corp.research_deduction"),
        ruleRef("us.federal.corp.interest_deduction"),
      ],
    },
  },
};

// the § 170(b)(2)/§ 246(b)-style base: gross income minus ordinary
// deductions INCLUDING the depreciation/§ 179/research/interest rules below
// (no charitable, no DRD, no NOL in it) — exported for the carryover
// target, which must test the ceiling against the SAME base
export const preSpecialBase: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: { kind: "add", args: [fact("corpGrossIncome"), netCapitalGainIncluded] },
    right: {
      kind: "add",
      args: [
        fact("corpOrdinaryDeductions"),
        ruleRef("us.federal.corp.depreciation_deduction"),
        ruleRef("us.federal.corp.section179_deduction"),
        ruleRef("us.federal.corp.research_deduction"),
        ruleRef("us.federal.corp.interest_deduction"),
      ],
    },
  },
};

/** § 179 expensing for one year's dollar limits */
function section179Rule(
  version: number,
  from: string,
  to: string,
  capCents: string,
  thresholdCents: string,
  capLabel: string,
  thresholdLabel: string,
  yearLabel: string,
  sourceLabel: string,
): Rule {
  // § 179(b)(1)–(2) dollar limitation
  const dollarLimited: Expr = {
    kind: "min",
    args: [
      fact("corpSection179Cost"),
      {
        kind: "max0",
        arg: {
          kind: "sub",
          left: money(capCents),
          right: {
            kind: "max0",
            arg: {
              kind: "sub",
              left: fact("corpSection179Cost"),
              right: money(thresholdCents),
            },
          },
        },
      },
    ],
  };
  return {
    id: "us.federal.corp.section179_deduction",
    version,
    jurisdiction: J,
    title: `§ 179 expensing — ${capLabel} limit, ${thresholdLabel} phase-out (${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 179, as amended by Pub. L. 119-21 (OBBBA § 70306); ${sourceLabel}`,
      section: "§ 179(b)(1)–(3)",
      url: "https://www.law.cornell.edu/uscode/text/26/179",
      excerpt: `"The aggregate cost which may be taken into account under subsection (a) for any taxable year shall not exceed ${capLabel}" — "reduced (but not below zero) by the amount by which the cost of section 179 property placed in service during such taxable year exceeds ${thresholdLabel}" (${yearLabel}; the OBBBA amounts apply to taxable years beginning after December 31, 2024). The § 179(b)(3)(A) limit caps the deduction at taxable income from the active conduct of a trade or business computed without § 179 — approximated here as gross income less ordinary/depreciation/research/interest deductions, capital gains excluded (enter active amounts only if this limit binds); the excess carries forward (§ 179(b)(3)(B), its own target). [The § 179(b)(5) SUV cap ($32,000 for 2026, Rev. Proc. 2025-32 § 3.24) and the § 280F passenger-auto interaction are not modeled — exclude vehicles; primary use: qualified real property that § 168(k) cannot reach.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: gt0(fact("corpSection179Cost")),
      then: { kind: "min", args: [dollarLimited, active179Base] },
      else: zero,
    },
  };
}

/** § 179(b)(3)(B) carryforward target for one year's dollar limits:
 *  the income-limit excess only — the dollar-cap excess does not carry. */
function section179CarryforwardRule(
  version: number,
  from: string,
  to: string,
  capCents: string,
  thresholdCents: string,
  yearLabel: string,
): Rule {
  const dollarLimited: Expr = {
    kind: "min",
    args: [
      fact("corpSection179Cost"),
      {
        kind: "max0",
        arg: {
          kind: "sub",
          left: money(capCents),
          right: {
            kind: "max0",
            arg: {
              kind: "sub",
              left: fact("corpSection179Cost"),
              right: money(thresholdCents),
            },
          },
        },
      },
    ],
  };
  return {
    id: "us.federal.corp.section179_carryforward",
    version,
    jurisdiction: J,
    title: `§ 179 deduction carried forward — the § 179(b)(3)(B) income-limit excess (${yearLabel})`,
    citation: {
      source: "26 U.S.C. § 179(b)(3)(B)",
      section: "§ 179(b)(3)(B)",
      url: "https://www.law.cornell.edu/uscode/text/26/179",
      excerpt:
        "The amount allowable as a deduction… for any taxable year shall be increased by the lesser of— (i) the aggregate amount disallowed under subparagraph (A) for all prior taxable years (to the extent not previously allowed…), or (ii) the excess (if any) of— (I) the limitation of paragraphs (1) and (2)… over (II) the amount allowable as a deduction… — the INCOME-limited excess carries forward; cost above the § 179(b)(1)–(2) dollar limitation does not (it is simply not elected). [This target reports the carryforward generated this year; prior-year carryforwards are not tracked.]",
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: gt0(fact("corpSection179Cost")),
      then: {
        kind: "max0",
        arg: {
          kind: "sub",
          left: dollarLimited,
          right: ruleRef("us.federal.corp.section179_deduction"),
        },
      },
      else: zero,
    },
  };
}

/** charitable rule for one year regime (floor only from 2026) */
function corpCharitableRule(
  version: number,
  from: string,
  to: string | undefined,
  withFloor: boolean,
  yearLabel: string,
): Rule {
  const capped: Expr = {
    kind: "min",
    args: [fact("corpCharitableContributions"), pct("10", preSpecialBase)],
  };
  return {
    id: "us.federal.corp.charitable_deduction",
    version,
    jurisdiction: J,
    title: `Corporate charitable deduction — 10% ceiling${withFloor ? " + the OBBBA 1% floor" : ""} (${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 170(b)(2)${withFloor ? ", as amended by Pub. L. 119-21 (OBBBA)" : ""}`,
      section: "§ 170(b)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/170",
      excerpt: withFloor
        ? "For taxable years beginning after December 31, 2025, a corporation's charitable contributions are deductible only to the extent the aggregate exceeds 1 percent of taxable income and does not exceed 10 percent of taxable income — taxable income computed without this section, part VIII (except § 248) [the DRD], any NOL carryback, any capital loss carryback, and § 199A(g). [Below-floor amounts are lost unless the 10% ceiling also binds; the 5-year carryover (§ 170(d)(2)) is not tracked — disclosed. A return with BOTH an NOL carryforward and contributions refuses: the carryforward belongs in the base and the § 172 limit depends on post-charitable income — circular.]"
        : "A corporation's charitable deduction cannot exceed 10 percent of taxable income computed without this section, part VIII (except § 248) [the DRD], any NOL carryback, any capital loss carryback, and § 199A(g). No floor applies to taxable years beginning before 2026. [5-year carryover (§ 170(d)(2)) not tracked; a return with BOTH an NOL carryforward and contributions refuses — circular base interaction.]",
    },
    effectiveFrom: from,
    ...(to ? { effectiveTo: to } : {}),
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "and",
        args: [gt0(fact("corpCharitableContributions")), gt0(fact("corpNOLCarryforward"))],
      },
      then: {
        kind: "unsupported",
        reason:
          "an NOL carryforward and charitable contributions interact circularly through the § 170(b)(2) base and the § 172 80% limit — not modeled together",
      },
      else: withFloor
        ? { kind: "max0", arg: { kind: "sub", left: capped, right: pct("1", preSpecialBase) } }
        : capped,
    },
  };
}

// § 243/246(b): tentative DRD by ownership tier, capped unless the full
// deduction would create or increase an NOL
const base246: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: preSpecialBase,
    right: ruleRef("us.federal.corp.charitable_deduction"),
  },
};
const drdExpr = (ratePct: string): Expr => {
  // § 246A: the 50%/65% percentages are reduced by the average-indebtedness
  // percentage of debt-financed portfolio stock (100%-DRD dividends exempt).
  // The int percent is lifted into money units (1¢ × pct) so the ratio is
  // computed with the all-money mulDiv: dividends × (100 − pct)/100.
  const keepShareCents: Expr = {
    kind: "sub",
    left: money("100"),
    right: {
      kind: "mulInt",
      base: money("1"),
      count: fact("corpPortfolioDebtFinancedPercent"),
    },
  };
  const debtAdjustedDividends: Expr = {
    kind: "mulDiv",
    a: fact("corpDividendsReceived"),
    b: keepShareCents,
    c: money("100"),
    round: "half-up",
  };
  const tentative = pct(ratePct, debtAdjustedDividends);
  return {
    kind: "if",
    // § 246(b)(2): if base − tentative < 0 the limitation does not apply
    cond: { kind: "cmp", op: "lt", left: base246, right: tentative },
    then: tentative,
    else: { kind: "min", args: [tentative, pct(ratePct, base246)] },
  };
};

/** § 163(j) interest limitation for one year's § 448(c) threshold */
function interestRule(
  version: number,
  from: string,
  to: string,
  thresholdCents: string,
  thresholdLabel: string,
  yearLabel: string,
): Rule {
  return {
    id: "us.federal.corp.interest_deduction",
    version,
    jurisdiction: J,
    title: `Business interest deduction — § 163(j) 30%-of-ATI limit, EBITDA base (${yearLabel})`,
    citation: {
      source:
        "26 U.S.C. § 163(j), as amended by Pub. L. 119-21 (OBBBA); § 448(c)",
      section: "§ 163(j)(1), (3), (8); § 448(c)",
      url: "https://www.law.cornell.edu/uscode/text/26/163",
      excerpt: `Business interest deduction limited to 30 percent of adjusted taxable income — computed, permanently for taxable years beginning after 2024 under the OBBBA, WITHOUT depreciation or amortization (the EBITDA base). The limitation does not apply to a taxpayer meeting the § 448(c) gross-receipts test: 3-year-average gross receipts of ${thresholdLabel} or less for ${yearLabel}. [Disallowed interest carries forward indefinitely (§ 163(j)(2)) — not tracked; business interest income and floor-plan financing are not modeled; a limited taxpayer WITH charitable contributions REFUSES — the § 170(b)(2) base and ATI interact circularly.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      grossReceiptsThreshold: { value: thresholdCents, type: "money" },
    },
    formula: {
      kind: "if",
      cond: gt0(fact("corpBusinessInterestExpense")),
      then: {
        kind: "if",
        cond: {
          kind: "cmp",
          op: "le",
          left: fact("corpAvgGrossReceipts3yr"),
          right: { kind: "param", name: "grossReceiptsThreshold" },
        },
        then: fact("corpBusinessInterestExpense"), // small-business exemption
        else: {
          kind: "if",
          cond: gt0(fact("corpCharitableContributions")),
          then: {
            kind: "unsupported",
            reason:
              "the § 163(j) ATI and the § 170(b)(2) charitable base interact circularly — a limited taxpayer with charitable contributions is not modeled",
          },
          else: {
            kind: "min",
            args: [fact("corpBusinessInterestExpense"), pct("30", ati163j)],
          },
        },
      },
      else: zero,
    },
  };
}

export const corporate1120Rules: Rule[] = [
  {
    id: "us.federal.corp.depreciation_deduction",
    version: 1,
    jurisdiction: J,
    title: "Bonus depreciation — 100% expensing (§ 168(k), OBBBA-permanent)",
    citation: {
      source: "26 U.S.C. § 168(k), as amended by Pub. L. 119-21 (OBBBA)",
      section: "§ 168(k)(1), (6)",
      url: "https://www.law.cornell.edu/uscode/text/26/168",
      excerpt:
        "The applicable percentage is 100 percent, permanently, for qualified property ACQUIRED after January 19, 2025 (the OBBBA struck the TCJA phase-down; property acquired January 1–19, 2025 kept the 40% rate — acquisition after January 19, 2025 is assumed and disclosed). At 100% expensing the § 179 election is redundant for this property class. [Qualified-property conditions (≤20-year recovery, original-use/used-acquisition rules) assumed satisfied — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: fact("corpEquipmentPurchases"),
  },
  {
    id: "us.federal.corp.research_deduction",
    version: 1,
    jurisdiction: J,
    title:
      "Research deduction — § 174A domestic expensing + § 174 foreign 15-year amortization",
    citation: {
      source:
        "26 U.S.C. § 174A (added by Pub. L. 119-21 (OBBBA)); § 174; Rev. Proc. 2025-28",
      section: "§ 174A(a); § 174(a)(2)(B)",
      url: "https://www.law.cornell.edu/uscode/text/26/174A",
      excerpt:
        "Domestic research or experimental expenditures are deductible currently (§ 174A, permanent for taxable years beginning after 2024); FOREIGN research remains capitalized under § 174 and amortized over 15 years beginning with the midpoint of the taxable year — the first-year deduction is 1/30 of the cost. [Prior-year foreign amortization belongs in ordinary deductions — the schedule is not tracked; the small-business retroactive catch-up elections of Rev. Proc. 2025-28 are not modeled — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        fact("corpDomesticResearch"),
        {
          kind: "mulDiv",
          a: fact("corpForeignResearch"),
          b: money("1"),
          c: money("30"),
          round: "half-up",
        },
      ],
    },
  },
  interestRule(1, "2025-01-01", "2026-01-01", "3100000000", "$31,000,000", "2025"),
  interestRule(2, "2026-01-01", "2027-01-01", "3200000000", "$32,000,000", "2026"),
  section179Rule(
    1, "2025-01-01", "2026-01-01",
    "250000000", "400000000", "$2,500,000", "$4,000,000",
    "TY2025", "Rev. Proc. 2025-32 § 2.10 (OBBBA statutory amounts)",
  ),
  section179Rule(
    2, "2026-01-01", "2027-01-01",
    "256000000", "409000000", "$2,560,000", "$4,090,000",
    "TY2026", "Rev. Proc. 2025-32 § 3.24, verbatim",
  ),
  section179CarryforwardRule(1, "2025-01-01", "2026-01-01", "250000000", "400000000", "TY2025"),
  section179CarryforwardRule(2, "2026-01-01", "2027-01-01", "256000000", "409000000", "TY2026"),
  corpCharitableRule(7, "2025-01-01", "2026-01-01", false, "TY2025"),
  corpCharitableRule(8, "2026-01-01", undefined, true, "TY2026+, permanent"),
  {
    id: "us.federal.corp.dividends_received_deduction",
    version: 4, // v3's excerpt misstated § 246A as unmodeled; v4 adds the § 246(c) attestation and the § 179-aware base
    jurisdiction: J,
    title: "Dividends-received deduction (50%/65%/100% by ownership tier, § 246(b) limit, § 246A reduction)",
    citation: {
      source: "26 U.S.C. §§ 243, 246(b), (c), 246A",
      section: "§ 243(a), (c); § 246(b), (c); § 246A",
      url: "https://www.law.cornell.edu/uscode/text/26/243",
      excerpt:
        "50 percent of dividends received (65 percent from a 20-percent-owned corporation; 100 percent for qualifying dividends from an affiliated group member, § 243(a)(3)). The 50%/65% deductions may not exceed the same percentage of taxable income computed without the DRD, § 172 NOL, § 199A, § 250, and capital loss carrybacks (§ 246(b)(1)) — but the limitation 'shall not apply for any taxable year for which there is a net operating loss' (§ 246(b)(2)): if the full deduction drives the base below zero it is allowed in full. The 100% DRD is never limited. The 50%/65% percentages ARE reduced by the average-indebtedness percentage of debt-financed portfolio stock (§ 246A, the corpPortfolioDebtFinancedPercent input). § 246(c): no deduction for stock held 45 days or less in the 91-day ex-dividend window (90/181 for certain preferred) — the holding period is ATTESTED by the dividends input. [Dividends must be included in corpGrossIncome; § 1059 extraordinary-dividend basis adjustments are not modeled — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: gt0(fact("corpDividendsReceived")),
      then: {
        kind: "match",
        on: fact("corpDrdOwnershipTier"),
        cases: [
          { when: "under-20", value: drdExpr("50") },
          { when: "20-to-80", value: drdExpr("65") },
          { when: "80-plus", value: pct("100", fact("corpDividendsReceived")) },
        ],
      },
      else: zero,
    },
  },
  {
    id: "us.federal.corp.nol_deduction",
    version: 4, // v3 predated § 179 in the base and § 245A in the 80%-limit subtraction
    jurisdiction: J,
    title: "Net operating loss deduction (80% of taxable income, § 172)",
    citation: {
      source: "26 U.S.C. § 172(a)(2)",
      section: "§ 172(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/172",
      excerpt:
        "…the aggregate of the net operating loss carryovers… shall not exceed 80 percent of taxable income computed without regard to the deduction allowable under this section (post-TCJA, permanent; carryforwards indefinite, no carrybacks). [The charitable interaction refuses in the charitable rule; the carryforward's remaining balance is not tracked — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      // guard first: a return with no carryforward must not demand the
      // component facts of the 80%-limit base
      kind: "if",
      cond: gt0(fact("corpNOLCarryforward")),
      then: {
        kind: "min",
        args: [
          fact("corpNOLCarryforward"),
          pct("80", {
            kind: "max0",
            arg: {
              kind: "sub",
              left: base246,
              right: {
                kind: "add",
                args: [
                  ruleRef("us.federal.corp.dividends_received_deduction"),
                  ruleRef("us.federal.corp.section245a_drd"),
                ],
              },
            },
          }),
        ],
      },
      else: zero,
    },
  },
  {
    id: "us.federal.corp.taxable_income",
    version: 4, // v3 predated the fiscal-year guard, § 179, and the § 245A DRD
    jurisdiction: J,
    title: "Corporate taxable income (Form 1120 line 30 — given, or computed)",
    citation: {
      source: "26 U.S.C. § 63(a); §§ 15, 443 (guarded); Form 1120 lines 28–30",
      section: "§ 63(a); Form 1120",
      url: "https://www.irs.gov/forms-pubs/about-form-1120",
      excerpt:
        "Taxable income = gross income minus deductions: here, gross income minus ordinary business deductions, depreciation/§ 179/research/interest, the (limited) charitable deduction, the special deductions (§ 243 DRD and the § 245A participation exemption), and the NOL deduction. If corpTaxableIncome (line 30) is provided directly it is used as-is. FISCAL-YEAR and § 443 short-period returns REFUSE: the OBBBA parameters (§ 250 rates, § 59A 10.5%, § 960(d) 90%, § 448(c) $32M, the § 170(b)(2) 1% floor, § 179 amounts) apply to 'taxable years beginning after' their effective dates, while this corpus selects rules by calendar date — and § 443(b) annualization ('placed on an annual basis by multiplying… by 12, dividing the result by the number of months') and § 15 proration are not encoded.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: fact("corpIsREITorRIC"),
      then: {
        kind: "unsupported",
        reason:
          "REITs (§ 857) and RICs (§ 852) are taxed on income NET of the dividends-paid deduction with 90% distribution requirements — ordinary Form 1120 logic would be silently wrong, so these returns refuse",
      },
      else: {
        kind: "if",
        cond: fact("corpFiscalYearFiler"),
        then: {
          kind: "unsupported",
          reason:
            "fiscal-year and short-period returns are not modeled — the OBBBA parameters apply by the taxable year's beginning date and §§ 15/443 annualization is not encoded; provide a calendar taxable year",
        },
        else: {
        kind: "if",
        cond: fact("corpFilesConsolidatedReturn"),
        then: {
          kind: "unsupported",
          reason:
            "consolidated returns (§§ 1501–1504: intercompany eliminations, SRLY, investment adjustments) are not modeled — evaluate each member separately or provide the consolidated line 30 with corpFilesConsolidatedReturn unset only if you accept single-entity treatment",
        },
        else: {
          kind: "if",
          cond: gt0(fact("corpTaxableIncome")),
          then: fact("corpTaxableIncome"),
          else: {
            kind: "max0",
            arg: {
              kind: "sub",
              left: base246,
              right: {
                kind: "add",
                args: [
                  ruleRef("us.federal.corp.dividends_received_deduction"),
                  ruleRef("us.federal.corp.section245a_drd"),
                  ruleRef("us.federal.corp.nol_deduction"),
                ],
              },
            },
          },
        },
        },
      },
    },
  },
  {
    id: "us.federal.corp.capital_loss_carryover_generated",
    version: 1,
    jurisdiction: J,
    title: "Corporate capital loss carryover generated (§ 1212(a))",
    citation: {
      source: "26 U.S.C. §§ 1211(a), 1212(a)",
      section: "§ 1211(a); § 1212(a)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/1211",
      excerpt:
        "…losses from sales or exchanges of capital assets shall be allowed only to the extent of gains from such sales or exchanges (§ 1211(a)); the excess is a capital loss carryback to each of the 3 preceding years and a carryover to the 5 succeeding years, treated as short-term (§ 1212(a)). [The 3-year carryback and multi-year tracking are not modeled — this target reports the excess generated; prior-year carryovers belong in the corpCapitalLosses input.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: { kind: "sub", left: fact("corpCapitalLosses"), right: fact("corpCapitalGains") },
    },
  },
  {
    id: "us.federal.corp.estimated.required_annual_payment",
    version: 2, // v1 used the gross § 11 tax; § 6655(g)(1) includes § 59A and subtracts credits
    jurisdiction: J,
    title: "Corporate required annual payment (§ 6655(d); tax per § 6655(g)(1) — after credits, plus BEAT)",
    citation: {
      source: "26 U.S.C. § 6655(d), (g)(1), (g)(2)",
      section: "§ 6655(d)(1)–(2); § 6655(g)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/6655",
      excerpt:
        "…the lesser of 100 percent of the tax shown on the return for the taxable year, or 100 percent of the tax shown on the return for the preceding taxable year — except that the preceding-year prong 'shall not apply in the case of a large corporation' (taxable income of $1,000,000 or more in any of the 3 preceding taxable years, § 6655(g)(2)). 'Tax' means 'the sum of— (i) the tax imposed by section 11…, (ii) the tax imposed by section 55, (iii) the tax imposed by section 59A, plus (iv) the tax imposed by section 887, over… the credits against tax provided by part IV' (§ 6655(g)(1)) — computed here as the income tax after the FTC and general business credit, plus BEAT (§ 55 CAMT already refuses above $1B AFSI; § 887 not modeled). [The large corporation's first-installment exception (§ 6655(d)(2)(B)) is not modeled — conservative; the § 6655(g)(4) S-corporation modifications are not modeled — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: fact("corpIsLargeCorporation"),
      then: {
        kind: "add",
        args: [
          ruleRef("us.federal.corp.income_tax_after_credits"),
          ruleRef("us.federal.corp.beat"),
        ],
      },
      else: {
        kind: "min",
        args: [
          {
            kind: "add",
            args: [
              ruleRef("us.federal.corp.income_tax_after_credits"),
              ruleRef("us.federal.corp.beat"),
            ],
          },
          fact("corpPriorYearTax"),
        ],
      },
    },
  },
  {
    id: "us.federal.corp.estimated.quarterly_payment",
    version: 2, // v1's de-minimis test used the gross § 11 tax; § 6655(f) keys to the § 6655(g)(1) tax
    jurisdiction: J,
    title: "Corporate required quarterly installment (25%; none if tax under $500)",
    citation: {
      source: "26 U.S.C. § 6655(d)(1)(A), (f), (g)(1)",
      section: "§ 6655(d)(1)(A), (f)",
      url: "https://www.law.cornell.edu/uscode/text/26/6655",
      excerpt:
        "…25 percent of the required annual payment; no addition to tax applies if the tax shown on the return (the § 6655(g)(1) tax — after credits, including § 59A) is less than $500. [The § 6655(e) annualized/adjusted-seasonal methods are modeled as their own targets.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: { deMinimis: { value: "50000", type: "money" } }, // $500
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "lt",
        left: {
          kind: "add",
          args: [
            ruleRef("us.federal.corp.income_tax_after_credits"),
            ruleRef("us.federal.corp.beat"),
          ],
        },
        right: { kind: "param", name: "deMinimis" },
      },
      then: zero,
      else: pct("25", ruleRef("us.federal.corp.estimated.required_annual_payment")),
    },
  },
  {
    id: "us.federal.corp.s_corp_entity_taxes",
    version: 1,
    jurisdiction: J,
    title:
      "S corporation entity-level taxes: § 1375 excess net passive income + § 1374 built-in gains",
    citation: {
      source: "26 U.S.C. §§ 1374, 1375",
      section: "§ 1374(a)–(b); § 1375(a)–(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/1375",
      excerpt:
        "§ 1375: if an S corporation has accumulated earnings and profits [from C years] at the close of the year and passive investment income exceeds 25 percent of gross receipts, a tax at the highest § 11(b) rate (21%) is imposed on excess net passive income — net passive income × (PII − 25% of gross receipts) / PII, not exceeding taxable income computed as if a C corporation. § 1374: 21% of net recognized built-in gain during the 5-year recognition period after a C→S conversion (the period condition is attested by the built-in-gain fact), likewise capped at as-if-C taxable income. [The § 1366(f)(2)–(3) reductions of shareholder pass-through amounts for these taxes are not modeled — disclosed.]",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        // § 1374 built-in gains
        {
          kind: "if",
          cond: gt0(fact("sCorpRecognizedBuiltInGain")),
          then: pct("21", {
            kind: "min",
            args: [fact("sCorpRecognizedBuiltInGain"), fact("sCorpTaxableIncomeAsC")],
          }),
          else: zero,
        },
        // § 1375 excess net passive income
        {
          kind: "if",
          cond: {
            kind: "and",
            args: [
              fact("sCorpHasAccumulatedEandP"),
              gt0(fact("sCorpPassiveInvestmentIncome")),
              {
                kind: "cmp",
                op: "gt",
                left: fact("sCorpPassiveInvestmentIncome"),
                right: pct("25", fact("sCorpGrossReceipts")),
              },
            ],
          },
          then: pct("21", {
            kind: "min",
            args: [
              {
                kind: "mulDiv",
                a: fact("sCorpNetPassiveIncome"),
                b: {
                  kind: "sub",
                  left: fact("sCorpPassiveInvestmentIncome"),
                  right: pct("25", fact("sCorpGrossReceipts")),
                },
                c: fact("sCorpPassiveInvestmentIncome"),
                round: "half-up",
              },
              fact("sCorpTaxableIncomeAsC"),
            ],
          }),
          else: zero,
        },
      ],
    },
  },
];
