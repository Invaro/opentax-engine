/**
 * International + remaining business machinery — verified July 2026.
 *
 * § 250 deduction: TY2025 keeps prior law — 37.5% of FDII and 50% of the
 * GILTI inclusion (+ § 78 gross-up). For taxable years beginning after
 * 2025 the OBBBA renames and re-rates: 33.34% of FOREIGN-DERIVED
 * DEDUCTION ELIGIBLE INCOME (FDDEI) and 40% of NET CFC TESTED INCOME
 * (NCTI), with QBAI (the deemed tangible return) ABOLISHED — effective
 * rates 14% and 12.6–14%. The § 250(a)(2) limitation scales both
 * amounts pro-rata when their sum exceeds taxable income (computed
 * without § 250).
 *
 * Corporate FTC (§§ 901/904/960(d)): two baskets — general (limited to
 * US tax × foreign-source income / TI) and the § 951A CFC basket, whose
 * deemed-paid credit takes the 80% haircut in 2025 and the OBBBA's 90%
 * from 2026, with basket income net of its § 250 share.
 *
 * BEAT (§ 59A): applicable taxpayers ($500M+ receipts, 3%+ base-erosion
 * percentage) pay the excess of 10% (2025) / 10.5% (2026+, OBBBA-fixed,
 * repealing the scheduled 12.5%) of modified taxable income over regular
 * tax; general business credits stay protected per the OBBBA.
 *
 * § 38(c) general business credit limitation: credits allowed up to net
 * income tax minus 25% of net regular tax over $25,000; for a corporation
 * that is not a CAMT "applicable corporation," tentative minimum tax is
 * ZERO (§ 38(c)(6)(E)) — applicable corporations already refuse at the
 * CAMT guard. Unused credit carries back 1 / forward 20 (§ 39) — the
 * carryforward is exposed as its own target, not tracked across years.
 *
 * § 461(l) excess business loss (noncorporate): OBBBA made the limitation
 * PERMANENT and re-based the indexing — the thresholds went DOWN:
 *   2025: $313,000 ($626,000 joint) — Form 461 instructions
 *   2026: $256,000 ($512,000 joint) — Rev. Proc. 2025-32 § 3.31, verbatim
 * The disallowed excess becomes an NOL carryforward (§ 461(l)(2)) — this
 * corpus's income facts are non-negative, so the limitation is exposed as
 * a standalone determination target.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { preSpecialBase } from "./corporate-1120.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const gt0 = (e: Expr): Expr => ({ kind: "cmp", op: "gt", left: e, right: zero });

// § 250(a)(2): scale each amount by TI/total when total exceeds TI
function section250Rule(
  version: number,
  from: string,
  to: string | undefined,
  fdRate: { num: string; den: string },
  cfcRate: { num: string; den: string },
  yearLabel: string,
  excerpt: string,
): Rule {
  const total: Expr = { kind: "add", args: [fact("corpFDDEI"), fact("corpNCTI")] };
  const ti = ruleRef("us.federal.corp.taxable_income");
  const scaled = (amount: Expr): Expr => ({
    kind: "if",
    cond: { kind: "cmp", op: "gt", left: total, right: ti },
    then: { kind: "mulDiv", a: amount, b: ti, c: total, round: "half-up" },
    else: amount,
  });
  return {
    id: "us.federal.corp.section250_deduction",
    version,
    jurisdiction: J,
    title: `§ 250 deduction (${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 250${version > 1 ? ", as amended by Pub. L. 119-21 (OBBBA)" : ""}`,
      section: "§ 250(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/250",
      excerpt,
    },
    effectiveFrom: from,
    ...(to ? { effectiveTo: to } : {}),
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "or", args: [gt0(fact("corpFDDEI")), gt0(fact("corpNCTI"))] },
      then: {
        kind: "add",
        args: [
          { kind: "mulRate", base: scaled(fact("corpFDDEI")), rate: fdRate, round: "half-up" },
          { kind: "mulRate", base: scaled(fact("corpNCTI")), rate: cfcRate, round: "half-up" },
        ],
      },
      else: zero,
    },
  };
}

function eblRule(
  version: number,
  from: string,
  to: string,
  singleCents: string,
  jointCents: string,
  source: string,
  yearLabel: string,
  note: string,
): Rule {
  return {
    id: "us.federal.excess_business_loss_disallowed",
    version,
    jurisdiction: J,
    title: `Excess business loss disallowed (§ 461(l), TY${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 461(l), as made permanent by Pub. L. 119-21 (OBBBA); ${source}`,
      section: "§ 461(l)(1), (3)",
      url: "https://www.law.cornell.edu/uscode/text/26/461",
      excerpt: `A noncorporate taxpayer's aggregate business deductions in excess of aggregate business gross income plus the threshold — ${note} — are disallowed and treated as an NOL carryforward to the following year (§ 461(l)(2)). The OBBBA made the limitation permanent and re-based its indexing: the 2026 thresholds are LOWER than 2025's. [Standalone determination: this corpus's income facts are non-negative, so the disallowed amount is answered as its own target; enter the net aggregate business LOSS as a positive number.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      threshold: { value: singleCents, type: "money" },
      thresholdJoint: { value: jointCents, type: "money" },
    },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("aggregateBusinessLoss"),
        right: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "eq",
            left: fact("filingStatus"),
            right: { kind: "enum", value: "mfj" },
          },
          then: param("thresholdJoint"),
          else: param("threshold"),
        },
      },
    },
  };
}

// taxable income net of § 250 — the denominator for § 904 and the base for BEAT MTI
const tiAfter250: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: ruleRef("us.federal.corp.taxable_income"),
    right: ruleRef("us.federal.corp.section250_deduction"),
  },
};

/** § 904 basket limitation: US tax × basket foreign income / total TI */
const basketLimit = (basketIncome: Expr): Expr => ({
  kind: "mulDiv",
  a: ruleRef("us.federal.corp.income_tax"),
  b: { kind: "min", args: [basketIncome, tiAfter250] },
  c: tiAfter250,
  round: "half-up",
});

function ftcRule(
  version: number,
  from: string,
  to: string | undefined,
  haircut: { num: string; den: string },
  netOf250: { num: string; den: string }, // the basket income share NET of § 250 (50% in 2025, 60% in 2026)
  yearLabel: string,
  haircutLabel: string,
): Rule {
  // the CFC basket's income net of its allocable § 250 deduction
  const cfcBasketIncome: Expr = {
    kind: "mulRate",
    base: fact("corpNCTI"),
    rate: netOf250,
    round: "half-up",
  };
  return {
    id: "us.federal.corp.ftc",
    version,
    jurisdiction: J,
    title: `Corporate foreign tax credit — § 904 basket limitation (${yearLabel})`,
    citation: {
      source: `26 U.S.C. §§ 901, 904, 960(d)${version > 1 ? ", as amended by Pub. L. 119-21 (OBBBA)" : ""}`,
      section: "§ 904(a), (d); § 960(d)",
      url: "https://www.law.cornell.edu/uscode/text/26/904",
      excerpt: `Foreign taxes credited up to the § 904 limitation per basket — the US tax multiplied by the basket's foreign-source taxable income over total taxable income (net of § 250). The § 951A-basket deemed-paid credit is limited to ${haircutLabel} of the foreign taxes (§ 960(d)), and that basket's income is net of its allocable § 250 deduction; no carryovers exist in the § 951A basket, and the general basket's 1-back/10-forward carryovers are not tracked — disclosed. [Two baskets modeled (general + CFC); the foreign-branch and passive baskets, § 861 expense allocation, and § 78 fine structure are attested by the inputs.]`,
    },
    effectiveFrom: from,
    ...(to ? { effectiveTo: to } : {}),
    output: { type: "money" },
    formula: {
      kind: "add",
      args: [
        {
          kind: "if",
          cond: gt0(fact("corpForeignTaxesGeneral")),
          then: {
            kind: "min",
            args: [
              fact("corpForeignTaxesGeneral"),
              basketLimit(fact("corpForeignSourceIncomeGeneral")),
            ],
          },
          else: zero,
        },
        {
          kind: "if",
          cond: gt0(fact("corpForeignTaxesNCTI")),
          then: {
            kind: "min",
            args: [
              { kind: "mulRate", base: fact("corpForeignTaxesNCTI"), rate: haircut, round: "half-up" },
              basketLimit(cfcBasketIncome),
            ],
          },
          else: zero,
        },
      ],
    },
  };
}

function beatRule(
  version: number,
  from: string,
  to: string | undefined,
  rate: { num: string; den: string },
  yearLabel: string,
  rateLabel: string,
): Rule {
  return {
    id: "us.federal.corp.beat",
    version,
    jurisdiction: J,
    title: `Base erosion and anti-abuse tax (§ 59A, ${yearLabel})`,
    citation: {
      source: `26 U.S.C. § 59A${version > 1 ? ", as amended by Pub. L. 119-21 (OBBBA)" : ""}`,
      section: "§ 59A(a)–(c), (e)",
      url: "https://www.law.cornell.edu/uscode/text/26/59A",
      excerpt: `An applicable taxpayer — a corporation with 3-year-average gross receipts of at least $500,000,000 whose base erosion percentage is 3 percent or higher (2% for banks/dealers; attested by the test fact) — pays the excess of ${rateLabel} of modified taxable income over the regular tax liability. ${version > 1 ? "The OBBBA fixed the rate permanently at 10.5% for taxable years beginning after December 31, 2025 (repealing the scheduled 12.5% and the add-back of all credits)" : "10% for taxable years beginning in 2025"}; general business credits (incl. § 41) remain protected from the regular-tax reduction — modeled by subtracting only the foreign tax credit. [MTI = taxable income (net of § 250) plus base erosion tax benefits — include the § 59A(c)(1)(B) base-erosion percentage of any NOL deduction in the benefits input; disclosed.]`,
    },
    effectiveFrom: from,
    ...(to ? { effectiveTo: to } : {}),
    output: { type: "money" },
    parameters: {
      receiptsThreshold: { value: "50000000000", type: "money" }, // $500,000,000
    },
    formula: {
      kind: "if",
      cond: fact("corpBaseErosionTestMet"),
      then: {
        kind: "if",
        cond: {
          kind: "cmp",
          op: "lt",
          left: fact("corpAvgGrossReceipts3yr"),
          right: { kind: "param", name: "receiptsThreshold" },
        },
        then: zero, // under $500M: not an applicable taxpayer
        else: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: {
              kind: "mulRate",
              base: {
                kind: "add",
                args: [tiAfter250, fact("corpBaseErosionTaxBenefits")],
              },
              rate,
              round: "half-up",
            },
            right: {
              kind: "max0",
              arg: {
                kind: "sub",
                left: ruleRef("us.federal.corp.income_tax"),
                right: ruleRef("us.federal.corp.ftc"),
              },
            },
          },
        },
      },
      else: zero,
    },
  };
}

// § 38(c)(1) "net income tax": the § 11 tax reduced by the FTC
const netIncomeTax: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: ruleRef("us.federal.corp.income_tax"),
    right: ruleRef("us.federal.corp.ftc"),
  },
};

export const internationalAndRemainderRules: Rule[] = [
  ftcRule(
    1, "2025-01-01", "2026-01-01",
    { num: "80", den: "100" }, { num: "50", den: "100" },
    "TY2025: 80% GILTI-basket haircut", "80 percent",
  ),
  ftcRule(
    2, "2026-01-01", undefined,
    { num: "90", den: "100" }, { num: "60", den: "100" },
    "TY2026+: the OBBBA 90% NCTI-basket allowance", "90 percent",
  ),
  beatRule(1, "2025-01-01", "2026-01-01", { num: "10", den: "100" }, "TY2025", "10 percent"),
  beatRule(2, "2026-01-01", undefined, { num: "105", den: "1000" }, "TY2026+, permanent", "10.5 percent"),
  section250Rule(
    1, "2025-01-01", "2026-01-01",
    { num: "375", den: "1000" }, { num: "50", den: "100" },
    "TY2025: 37.5% of FDII + 50% of GILTI",
    "For taxable years beginning in 2025 (prior law): a deduction of 37.5 percent of foreign-derived intangible income plus 50 percent of the § 951A GILTI inclusion (and the § 78 gross-up attributable to it — include it in the input amount), limited by § 250(a)(2): when the sum exceeds taxable income (computed without this section), each amount is reduced pro-rata. [FDII/GILTI amounts (QBAI-based under prior law) are taken as computed inputs; foreign tax credits and § 59A BEAT are not modeled — disclosed.]",
  ),
  section250Rule(
    2, "2026-01-01", undefined,
    { num: "3334", den: "10000" }, { num: "40", den: "100" },
    "TY2026+: 33.34% of FDDEI + 40% of NCTI (OBBBA)",
    "For taxable years beginning after December 31, 2025 (OBBBA): FDII becomes FOREIGN-DERIVED DEDUCTION ELIGIBLE INCOME and GILTI becomes NET CFC TESTED INCOME, QBAI (the 10% deemed tangible return) is ABOLISHED, and the deduction is 33.34 percent of FDDEI plus 40 percent of NCTI (effective rates 14% and 12.6–14%), limited by § 250(a)(2) pro-rata scaling against taxable income computed without this section. [Include the § 78 gross-up in the NCTI input; the 90% NCTI foreign-tax-credit allowance and § 59A BEAT (10.5% from 2026) are not modeled — disclosed.]",
  ),
  eblRule(
    1, "2025-01-01", "2026-01-01",
    "31300000", "62600000",
    "2025 Instructions for Form 461",
    "2025",
    "$313,000 ($626,000 for joint returns) for 2025",
  ),
  eblRule(
    2, "2026-01-01", "2027-01-01",
    "25600000", "51200000",
    "Rev. Proc. 2025-32 § 3.31",
    "2026",
    "\"$256,000 ($512,000 for joint returns)\" for 2026 (Rev. Proc. 2025-32 § 3.31, verbatim — a DECREASE from 2025)",
  ),
  {
    id: "us.federal.corp.gbc_allowed",
    version: 2, // v1 predated the foreign tax credit in "net income tax"
    jurisdiction: J,
    title: "General business credit allowed (§ 38(c) limitation)",
    citation: {
      source: "26 U.S.C. § 38(c); § 38(c)(6)(E)",
      section: "§ 38(c)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/38",
      excerpt:
        "The credit allowed… shall not exceed the excess of the taxpayer's net income tax over the greater of the tentative minimum tax or 25 percent of so much of the net regular tax liability as exceeds $25,000. For a corporation that is not a CAMT applicable corporation, the tentative minimum tax is zero (§ 38(c)(6)(E)) — applicable corporations already refuse at this corpus's $1B-AFSI guard. [Input the aggregate current-year § 38(b) credits — e.g. the § 41 research credit target's result; the § 39 1-back/20-forward carryover is exposed as its own target, not tracked.]",
    },
    effectiveFrom: "2025-01-01", // statutory, unindexed: open-ended
    output: { type: "money" },
    parameters: {
      floor: { value: "2500000", type: "money" }, // $25,000
    },
    formula: {
      kind: "min",
      args: [
        fact("generalBusinessCredits"),
        {
          // "net income tax" = tax after the foreign tax credit (§ 38(c)(1))
          kind: "max0",
          arg: {
            kind: "sub",
            left: netIncomeTax,
            right: {
              kind: "mulRate",
              base: {
                kind: "max0",
                arg: { kind: "sub", left: netIncomeTax, right: param("floor") },
              },
              rate: { num: "25", den: "100" },
              round: "half-up",
            },
          },
        },
      ],
    },
  },
  {
    id: "us.federal.corp.income_tax_after_credits",
    version: 2, // v1 predated the foreign tax credit
    jurisdiction: J,
    title: "Corporate income tax after the general business credit",
    citation: {
      source: "26 U.S.C. § 38(a); § 11",
      section: "§ 38(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/38",
      excerpt:
        "The § 901 foreign tax credit and the § 38 general business credit (limited under § 38(c)) are allowed against the § 11 tax — FTC first, then the GBC against the net income tax.",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: netIncomeTax,
        right: ruleRef("us.federal.corp.gbc_allowed"),
      },
    },
  },
  {
    id: "us.federal.corp.gbc_carryforward",
    version: 1,
    jurisdiction: J,
    title: "General business credit carryforward generated (§ 39)",
    citation: {
      source: "26 U.S.C. § 39(a)",
      section: "§ 39(a)(1)",
      url: "https://www.law.cornell.edu/uscode/text/26/39",
      excerpt:
        "…the excess credit is carried back 1 year and forward 20. [The 1-year carryback and multi-year tracking are not modeled — this target reports the excess generated this year.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("generalBusinessCredits"),
        right: ruleRef("us.federal.corp.gbc_allowed"),
      },
    },
  },
  {
    id: "us.federal.corp.section245a_drd",
    version: 1,
    jurisdiction: J,
    title: "§ 245A participation-exemption DRD (100% of eligible foreign-sub dividends)",
    citation: {
      source: "26 U.S.C. § 245A; § 246(c)(5)",
      section: "§ 245A(a), (d), (e); § 246(c)(5)",
      url: "https://www.law.cornell.edu/uscode/text/26/245A",
      excerpt:
        "In the case of any dividend received from a specified 10-percent owned foreign corporation by a domestic corporation which is a United States shareholder with respect to such foreign corporation, there shall be allowed as a deduction an amount equal to the foreign-source portion of such dividend. [Attested by the input: NOT a § 245A(e) hybrid dividend, and the § 246(c)(5) holding period met ('365 days' during the '731-day period' around the ex-dividend date). No foreign tax credit or deduction is allowed for taxes attributable to the deducted portion (§ 245A(d)) — keep them out of the FTC inputs. Never subject to the § 246(b) taxable-income limit. The dividend must be included in corpGrossIncome.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: fact("corpSection245ADividends"),
  },
  {
    id: "us.federal.corp.charitable_carryover",
    version: 2, // v1 predated § 179 in the § 170(b)(2) base
    jurisdiction: J,
    title: "Corporate charitable contribution carryover generated (§ 170(d)(2))",
    citation: {
      source: "26 U.S.C. § 170(d)(2), as amended by Pub. L. 119-21 (OBBBA)",
      section: "§ 170(d)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/170",
      excerpt:
        "Contributions in excess of the 10% ceiling carry to the 5 succeeding taxable years — and under the OBBBA, when the ceiling binds, the 1%-floored amount carries over as well (contributions lost to the floor alone do NOT carry). Encoded as contributions minus the allowed deduction whenever the ceiling binds, zero otherwise. [The 5-year expiry and re-application of the floor to carried amounts are not tracked — this target reports the carryover generated this year.]",
    },
    effectiveFrom: "2025-01-01", // references the year-versioned deduction rule
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "gt",
        left: fact("corpCharitableContributions"),
        right: {
          // the ceiling from the SAME § 170(b)(2) base the deduction uses
          kind: "mulRate",
          base: preSpecialBase,
          rate: { num: "10", den: "100" },
          round: "half-up",
        },
      },
      // ceiling binds: everything not deducted this year carries
      then: {
        kind: "max0",
        arg: {
          kind: "sub",
          left: fact("corpCharitableContributions"),
          right: ruleRef("us.federal.corp.charitable_deduction"),
        },
      },
      else: zero,
    },
  },
  {
    id: "us.federal.corp.interest_carryforward",
    version: 1,
    jurisdiction: J,
    title: "Disallowed business interest carried forward (§ 163(j)(2))",
    citation: {
      source: "26 U.S.C. § 163(j)(2)",
      section: "§ 163(j)(2)",
      url: "https://www.law.cornell.edu/uscode/text/26/163",
      excerpt:
        "The amount of any business interest not allowed as a deduction for any taxable year shall be treated as business interest paid or accrued in the succeeding taxable year — carried forward indefinitely. [This target reports the carryforward generated this year; prior-year carryforwards belong in the interest-expense input.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("corpBusinessInterestExpense"),
        right: ruleRef("us.federal.corp.interest_deduction"),
      },
    },
  },
];
