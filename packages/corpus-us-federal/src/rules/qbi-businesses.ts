/**
 * § 199A per trade or business — Form 8995-A Part II and Schedules A, B and C
 * (2025 forms; Schedules B and C Rev. December 2022). Verified October 2026.
 *
 * Up to seven businesses, each with its own QBI, W-2 wages, UBIA and SSTB
 * status:
 *   main      everything QBI-eligible in the return's totals not listed
 *             separately: the first spouse's Schedule C (net of the ½-SE,
 *             SEP and SE-health deductions, Reg. § 1.199A-3(b)(1)(vi)) plus
 *             k1OrdinaryBusinessIncome, less qbiLossOffset, less every listed
 *             business; W-2 wages qbiW2Wages, UBIA qbiUBIA, SSTB businessIsSSTB
 *   spouse    the second spouse's Schedule C on a joint return (their own
 *             ½-SE deduction)
 *   business2–business6
 *             listed by the caller (qbiAdditionalBusinesses of them). A listed
 *             business stays in the return's totals: its profit is part of the
 *             Schedule C / K-1 QBI and its loss part of qbiLossOffset; listing
 *             it only takes it out of main for § 199A.
 *
 * At or below the threshold the businesses are simply added (Form 8995 lines
 * 2–5). Above it, in the form's order:
 *   Schedule A  an SSTB in the phase-in range keeps the applicable percentage
 *               (1 − excess/range) of its QBI, W-2 wages and UBIA; past the
 *               range it has none (§ 199A(d)(3))
 *   Schedule B  businesses in one aggregation group add their QBI, W-2 wages
 *               and UBIA and are one business from then on (Reg. § 1.199A-4);
 *               an SSTB may not be aggregated (§ 1.199A-4(b)(1)(iii)) — refused
 *   Schedule C  losses, with the prior-year carryforward, are apportioned
 *               among the businesses with QBI in proportion to their QBI
 *               (§ 1.199A-1(d)(2)(iii)); a business left at zero or less keeps
 *               no W-2 wages or UBIA; the unabsorbed loss carries to next year
 *               (§ 199A(c)(2))
 *   Part II     each business: 20% of its adjusted QBI, limited by the greater
 *               of 50% of its W-2 wages or 25% of them plus 2.5% of its UBIA,
 *               phased in over the range (Part III)
 *
 * Not modeled, disclosed: REIT dividends and PTP income (Part IV lines 28–31),
 * cooperative patrons (Schedule D), and an SSTB carryforward loss's own
 * applicable percentage (the carryforward nets at face value). The loss
 * apportionment rounds each business's share to the cent.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const int = (value: string): Expr => ({ kind: "int", value });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const neg = (e: Expr): Expr => sub(zero, e);
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const pct = (num: string, den: string, base: Expr): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
const isStatus = (status: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: status });

const CORNELL = "https://www.law.cornell.edu/uscode/text/26/199A";
const REG_1 = "https://www.law.cornell.edu/cfr/text/26/1.199A-1";
const REG_4 = "https://www.law.cornell.edu/cfr/text/26/1.199A-4";
const F8995A = "https://www.irs.gov/forms-pubs/about-form-8995-a";

export const QBI_LISTED = 5; // business2..business6

interface Unit {
  key: string;
  label: string;
  w2Fact: string;
  ubiaFact: string;
  sstbFact: string;
  groupFact: string;
}

export const QBI_UNITS: Unit[] = [
  { key: "main", label: "the main business (QBI not listed separately)", w2Fact: "qbiW2Wages", ubiaFact: "qbiUBIA", sstbFact: "businessIsSSTB", groupFact: "qbiAggregationGroup" },
  { key: "spouse", label: "the second spouse's Schedule C business", w2Fact: "spouseQbiW2Wages", ubiaFact: "spouseQbiUBIA", sstbFact: "spouseBusinessIsSSTB", groupFact: "spouseQbiAggregationGroup" },
  ...Array.from({ length: QBI_LISTED }, (_, i) => {
    const n = i + 2;
    return {
      key: `business${n}`,
      label: `listed business ${n}`,
      w2Fact: `qbiBusiness${n}W2Wages`,
      ubiaFact: `qbiBusiness${n}UBIA`,
      sstbFact: `qbiBusiness${n}IsSSTB`,
      groupFact: `qbiBusiness${n}AggregationGroup`,
    };
  }),
];
const LISTED = QBI_UNITS.slice(2);

const id = (u: Unit, line: string) => `${J}.qbi.${u.key}.${line}`;
const qbiOf = (u: Unit) => ruleRef(id(u, "qbi"));
const presentOf = (u: Unit) => ruleRef(id(u, "present"));
const groupOf = (u: Unit) => ruleRef(id(u, "aggregation_group"));
const excess = ruleRef(`${J}.qbi.excess_over_threshold`);
const range = ruleRef(`${J}.qbi.phase_in_range`);

function rule(
  ruleId: string,
  title: string,
  section: string,
  url: string,
  excerpt: string,
  type: "money" | "int" | "bool",
  formula: Expr,
  source = "26 U.S.C. § 199A; Form 8995-A (2025) and Schedules A–C",
): Rule {
  return {
    id: ruleId,
    version: 1,
    jurisdiction: J,
    title,
    citation: { source, section, url, excerpt },
    effectiveFrom: "2025-01-01",
    output: { type },
    formula,
  };
}

// --- per-business QBI ------------------------------------------------------

const scheduleCPool: Expr = add(
  max0(
    sub(
      fact("selfEmploymentNetProfit"),
      add(
        ruleRef(`${J}.se_tax_half_deduction.taxpayer`),
        ruleRef(`${J}.sep_deduction`),
        ruleRef(`${J}.sehi_deduction`),
      ),
    ),
  ),
  fact("k1OrdinaryBusinessIncome"),
);
const listedProfits = add(...LISTED.map((u) => max0(qbiOf(u))));
const listedLosses = add(...LISTED.map((u) => max0(neg(qbiOf(u)))));

const rawQbiRules: Rule[] = [
  rule(
    id(QBI_UNITS[0], "qbi"),
    "QBI of the main business: the return's Schedule C and K-1 QBI less qbiLossOffset, less every listed business",
    "§ 199A(c); Reg. § 1.199A-3(b)(1)(vi)",
    "https://www.law.cornell.edu/cfr/text/26/1.199A-3",
    "QBI includes the deductible part of self-employment tax, the self-employed health insurance deduction and contributions to qualified retirement plans attributable to the trade or business. [Main = max(0, selfEmploymentNetProfit − its ½-SE, SEP and SE-health deductions) + k1OrdinaryBusinessIncome − qbiLossOffset, less each listed business: a listed profit comes out of the Schedule C / K-1 QBI and a listed loss out of qbiLossOffset; listing more than the return holds is refused.]",
    "money",
    iff(
      cmp("gt", listedProfits, scheduleCPool),
      {
        kind: "unsupported",
        reason:
          "the listed businesses' QBI (qbiBusiness2Income–qbiBusiness6Income) is more than the return's Schedule C and K-1 QBI: a listed business must already be in the totals (selfEmploymentNetProfit or k1OrdinaryBusinessIncome)",
      },
      iff(
        cmp("gt", listedLosses, fact("qbiLossOffset")),
        {
          kind: "unsupported",
          reason:
            "the listed businesses' QBI losses are more than qbiLossOffset: a listed loss business's QBI loss must already be in qbiLossOffset",
        },
        sub(sub(scheduleCPool, listedProfits), sub(fact("qbiLossOffset"), listedLosses)),
      ),
    ),
  ),
  rule(
    id(QBI_UNITS[1], "qbi"),
    "QBI of the second spouse's Schedule C business (net of their own ½-SE deduction)",
    "§ 199A(c); Reg. § 1.199A-3(b)(1)(vi)",
    "https://www.law.cornell.edu/cfr/text/26/1.199A-3",
    "QBI includes the deductible part of self-employment tax attributable to the trade or business. [On a joint return the second spouse's Schedule C is its own trade or business: their net profit less their own ½-SE deduction. Their SEP, solo 401(k) and SE health insurance are not modeled (those inputs are the first spouse's).]",
    "money",
    max0(sub(ruleRef(`${J}.se_net_profit.spouse`), ruleRef(`${J}.se_tax_half_deduction.spouse`))),
  ),
  ...LISTED.map((u, i) =>
    rule(
      id(u, "qbi"),
      `QBI of ${u.label} (qbiBusiness${i + 2}Income, when qbiAdditionalBusinesses ≥ ${i + 1})`,
      "§ 199A(c)(1)",
      CORNELL,
      "The term 'qualified business income' means, for any taxable year, the net amount of qualified items of income, gain, deduction, and loss with respect to any qualified trade or business of the taxpayer. [Entered per business, a loss as a negative number; read only when the return lists at least this many businesses.]",
      "money",
      iff(cmp("ge", fact("qbiAdditionalBusinesses"), int(String(i + 1))), fact(`qbiBusiness${i + 2}Income`), zero),
    ),
  ),
  rule(
    `${J}.qbi.total`,
    "Total QBI of all businesses (Form 8995 line 2)",
    "§ 199A(c)",
    CORNELL,
    "Qualified business income... with respect to any qualified trade or business of the taxpayer. [The sum over every business, losses included; the prior-year carryforward is separate.]",
    "money",
    add(...QBI_UNITS.map(qbiOf)),
  ),
  ...QBI_UNITS.map((u, i) =>
    rule(
      id(u, "present"),
      `Whether the return has ${u.label}`,
      "Reg. § 1.199A-4(b)",
      REG_4,
      i === 0
        ? "[The main business is present when it has QBI or a QBI loss, or above the threshold when it has W-2 wages or UBIA: a business that breaks even can still bring its W-2 wages and UBIA to an aggregation group.]"
        : i === 1
          ? "[The second spouse's business is present when it has QBI.]"
          : `[A listed business is present whenever the return lists it (qbiAdditionalBusinesses ≥ ${i - 1}), even at zero QBI: a business that breaks even can still bring its W-2 wages and UBIA to an aggregation group.]`,
      "bool",
      i === 0
        ? {
            kind: "or",
            args: [
              cmp("ne", qbiOf(u), zero),
              and(
                cmp("gt", excess, zero),
                { kind: "or", args: [cmp("gt", fact(u.w2Fact), zero), cmp("gt", fact(u.ubiaFact), zero)] },
              ),
            ],
          }
        : i === 1
          ? cmp("ne", qbiOf(u), zero)
          : cmp("ge", fact("qbiAdditionalBusinesses"), int(String(i - 1))),
    ),
  ),
  rule(
    `${J}.qbi.business_count`,
    "Number of businesses on the return",
    "Reg. § 1.199A-4(a)",
    REG_4,
    "[Counts the businesses present; aggregation is asked about only when there are two or more.]",
    "int",
    add(...QBI_UNITS.map((u) => iff(presentOf(u), int("1"), int("0")))),
  ),
];

// --- threshold and phase-in range -------------------------------------------

const thresholdRules: Rule[] = [
  {
    id: `${J}.qbi.threshold`,
    version: 1,
    jurisdiction: J,
    title: "§ 199A threshold amount (TY2025)",
    citation: {
      source: "26 U.S.C. § 199A(e)(2); Rev. Proc. 2024-40 § 2.27",
      section: "§ 199A(e)(2)",
      url: CORNELL,
      excerpt: "Threshold amount: $394,600 married filing jointly, $197,300 for all others (including married filing separately).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: iff(isStatus("mfj"), money("39460000"), money("19730000")),
  },
  {
    id: `${J}.qbi.threshold`,
    version: 2,
    jurisdiction: J,
    title: "§ 199A threshold amount (TY2026)",
    citation: {
      source: "26 U.S.C. § 199A(e)(2); Rev. Proc. 2025-32 § 4.26",
      section: "§ 199A(e)(2)",
      url: CORNELL,
      excerpt: "Threshold amount: $403,500 married filing jointly, $201,775 married filing separately, $201,750 for all others.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    formula: {
      kind: "match",
      on: fact("filingStatus"),
      cases: [
        { when: "mfj", value: money("40350000") },
        { when: "mfs", value: money("20177500") },
        { when: "single", value: money("20175000") },
        { when: "hoh", value: money("20175000") },
        { when: "qss", value: money("20175000") },
      ],
    },
  },
  {
    id: `${J}.qbi.phase_in_range`,
    version: 1,
    jurisdiction: J,
    title: "§ 199A phase-in range (TY2025: $50,000, $100,000 joint)",
    citation: {
      source: "26 U.S.C. § 199A(b)(3)(B), (d)(3) as enacted by Pub. L. 115-97",
      section: "§ 199A(b)(3)(B)(ii)(II)",
      url: CORNELL,
      excerpt: "Form 8995-A line 23: Phase-in range. Enter $50,000 ($100,000 if married filing jointly).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: iff(isStatus("mfj"), money("10000000"), money("5000000")),
  },
  {
    id: `${J}.qbi.phase_in_range`,
    version: 2,
    jurisdiction: J,
    title: "§ 199A phase-in range (TY2026: $75,000, $150,000 joint — OBBBA § 70105)",
    citation: {
      source: "26 U.S.C. § 199A(b)(3)(B), (d)(3) as amended by OBBBA § 70105",
      section: "§ 199A(b)(3)(B)(ii)(II)",
      url: CORNELL,
      excerpt: "For taxable years beginning after December 31, 2025, the phase-in range is $75,000 ($150,000 for a joint return).",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    formula: iff(isStatus("mfj"), money("15000000"), money("7500000")),
  },
  rule(
    `${J}.qbi.excess_over_threshold`,
    "Taxable income before the QBI deduction over the § 199A threshold (Form 8995-A line 22)",
    "§ 199A(b)(3)(B)",
    CORNELL,
    "Form 8995-A Part III line 22: subtract line 21 (threshold) from line 20 (taxable income before qualified business income deduction). [Zero at or below the threshold.]",
    "money",
    max0(sub(ruleRef(`${J}.taxable_income_before_qbi`), ruleRef(`${J}.qbi.threshold`))),
  ),
];

// --- Schedule A: SSTB applicable percentage -----------------------------------

/** a business's own QBI, W-2 wages or UBIA after Schedule A */
function scheduleA(u: Unit, amount: Expr): Expr {
  return iff(
    { kind: "not", arg: presentOf(u) },
    zero, // no business, no questions
    iff(
      cmp("eq", excess, zero),
      amount, // at or below the threshold the SSTB rules do not apply
      iff(
        and(cmp("eq", qbiOf(u), zero), cmp("eq", groupOf(u), int("0"))),
        zero, // breaks even and stands alone: nothing to limit, no SSTB question
        iff(
          fact(u.sstbFact),
          iff(
            cmp("ge", excess, range),
            zero,
            { kind: "mulDiv", a: amount, b: sub(range, excess), c: range, round: "half-up" },
          ),
          amount,
        ),
      ),
    ),
  );
}

const scheduleALines: { line: string; title: string; amount: (u: Unit) => Expr; formLine: string }[] = [
  { line: "sstb_qbi", title: "QBI after the SSTB applicable percentage", amount: qbiOf, formLine: "Schedule A line 11" },
  { line: "sstb_w2_wages", title: "W-2 wages after the SSTB applicable percentage", amount: (u) => fact(u.w2Fact), formLine: "Schedule A line 12" },
  { line: "sstb_ubia", title: "UBIA after the SSTB applicable percentage", amount: (u) => fact(u.ubiaFact), formLine: "Schedule A line 13" },
];

const scheduleARules: Rule[] = QBI_UNITS.flatMap((u) =>
  scheduleALines.map(({ line, title, amount, formLine }) =>
    rule(
      id(u, line),
      `${title} — ${u.label} (${formLine})`,
      "§ 199A(d)(3)",
      CORNELL,
      `§ 199A(d)(3): a specified service trade or business is a qualified trade or business only for the applicable percentage (100% less the excess over the threshold as a percentage of the phase-in range) of its items, and not at all past the range. [${formLine}; a business that is not an SSTB, or a return at or below the threshold, keeps the full amount. Exact ratio where the form rounds the percentage.]`,
      "money",
      scheduleA(u, amount(u)),
    ),
  ),
);

// --- Schedule B: aggregation ------------------------------------------------

const aggregationGroupRules: Rule[] = QBI_UNITS.map((u) =>
  rule(
    id(u, "aggregation_group"),
    `Aggregation group of ${u.label} (0 = not aggregated)`,
    "Reg. § 1.199A-4(b)(1)",
    REG_4,
    "An individual may aggregate trades or businesses if... (iii) none of the aggregated trades or businesses can be a specified service trade or business. [Asked only above the threshold, for a business on the return, when the return has two or more businesses; an SSTB in a group is refused.]",
    "int",
    iff(
      and(cmp("gt", excess, zero), presentOf(u), cmp("ge", ruleRef(`${J}.qbi.business_count`), int("2"))),
      iff(
        cmp("eq", fact(u.groupFact), int("0")),
        int("0"),
        iff(
          fact(u.sstbFact),
          {
            kind: "unsupported",
            reason: `${u.label} is a specified service trade or business, which may not be aggregated (Reg. § 1.199A-4(b)(1)(iii)): set ${u.groupFact} to 0`,
          },
          fact(u.groupFact),
        ),
      ),
      int("0"),
    ),
  ),
);

/** the business that carries an aggregation group's totals is its first member */
function aggregated(u: Unit, idx: number, line: string): Expr {
  const own = ruleRef(id(u, line));
  const g = groupOf(u);
  const earlierInGroup = QBI_UNITS.slice(0, idx).map((v) => cmp("eq", groupOf(v), g));
  const members = add(...QBI_UNITS.map((v) => iff(cmp("eq", groupOf(v), g), ruleRef(id(v, line)), zero)));
  return iff(
    cmp("eq", g, int("0")),
    own,
    earlierInGroup.length === 0 ? members : iff({ kind: "or", args: earlierInGroup }, zero, members),
  );
}

const scheduleBLines = [
  { from: "sstb_qbi", line: "aggregated_qbi", what: "QBI" },
  { from: "sstb_w2_wages", line: "aggregated_w2_wages", what: "W-2 wages" },
  { from: "sstb_ubia", line: "aggregated_ubia", what: "UBIA" },
];

const scheduleBRules: Rule[] = QBI_UNITS.flatMap((u, idx) =>
  scheduleBLines.map(({ from, line, what }) =>
    rule(
      id(u, line),
      `${what} of ${u.label} after aggregation (Schedule B line 4)`,
      "Reg. § 1.199A-4(b)(1); Schedule B (Form 8995-A) line 4",
      REG_4,
      `Schedule B line 4: total the QBI, W-2 wages and UBIA of the aggregated trades or businesses. [The group's totals sit on its first member in the order main, spouse, business2–business6; the other members carry zero. A business that is not aggregated keeps its own ${what}.]`,
      "money",
      aggregated(u, idx, from),
    ),
  ),
);

// --- Schedule C: loss netting -------------------------------------------------

const aggQbi = (u: Unit) => ruleRef(id(u, "aggregated_qbi"));
const nettingIncome = ruleRef(`${J}.qbi.loss_netting.income`);
const nettingNetted = ruleRef(`${J}.qbi.loss_netting.netted`);

const scheduleCRules: Rule[] = [
  rule(
    `${J}.qbi.loss_netting.losses`,
    "Business losses with the prior-year carryforward (Schedule C line 3, as a positive amount)",
    "§ 199A(c)(2); Reg. § 1.199A-1(d)(2)(iii)",
    REG_1,
    "Schedule C line 3: combine the negative amounts on line 1, column (a), and line 2 (qualified business net loss carryforward from prior years).",
    "money",
    add(fact("qbiLossCarryforward"), ...QBI_UNITS.map((u) => max0(neg(aggQbi(u))))),
  ),
  rule(
    `${J}.qbi.loss_netting.income`,
    "Business income (Schedule C line 4)",
    "Reg. § 1.199A-1(d)(2)(iii)(A)",
    REG_1,
    "Schedule C line 4: add the positive amounts on line 1, column (a), for all trades, businesses, or aggregations.",
    "money",
    add(...QBI_UNITS.map((u) => max0(aggQbi(u)))),
  ),
  rule(
    `${J}.qbi.loss_netting.netted`,
    "Losses netted against other businesses' income (Schedule C line 5)",
    "Reg. § 1.199A-1(d)(2)(iii)(A)",
    REG_1,
    "Schedule C line 5: the smaller of the absolute value of line 3 or line 4.",
    "money",
    min(ruleRef(`${J}.qbi.loss_netting.losses`), nettingIncome),
  ),
  ...QBI_UNITS.map((u) =>
    rule(
      id(u, "adjusted_qbi"),
      `Adjusted QBI of ${u.label} after loss netting (Schedule C line 1(c))`,
      "Reg. § 1.199A-1(d)(2)(iii)(A)",
      REG_1,
      "If the net QBI from any trade or business is negative, it is apportioned among the trades or businesses with positive QBI in proportion to their relative amounts of QBI. [Schedule C line 1(c): this business's QBI less its share of line 5; zero for a business with no QBI or a loss.]",
      "money",
      iff(
        cmp("gt", aggQbi(u), zero),
        sub(aggQbi(u), { kind: "mulDiv", a: nettingNetted, b: aggQbi(u), c: nettingIncome, round: "half-up" }),
        zero,
      ),
    ),
  ),
];

// --- Part II: each business's component ---------------------------------------

function component(u: Unit): Expr {
  const adj = ruleRef(id(u, "adjusted_qbi"));
  const tentative = pct("20", "100", adj); // line 3
  const w2 = ruleRef(id(u, "aggregated_w2_wages"));
  const ubia = ruleRef(id(u, "aggregated_ubia"));
  const wageLimit: Expr = {
    // line 10: greater of 50% of W-2 wages, or 25% of W-2 wages + 2.5% of UBIA
    kind: "max",
    args: [pct("50", "100", w2), add(pct("25", "100", w2), pct("25", "1000", ubia))],
  };
  return iff(
    cmp("le", adj, zero),
    zero, // no QBI left: its W-2 wages and UBIA do not count (Schedule C instructions)
    iff(
      cmp("ge", excess, range),
      min(tentative, wageLimit), // line 11
      sub(
        // Part III: line 17 − (line 17 − line 18) × line 24, never below the wage limit
        tentative,
        { kind: "mulDiv", a: max0(sub(tentative, wageLimit)), b: excess, c: range, round: "half-up" },
      ),
    ),
  );
}

const partIIRules: Rule[] = QBI_UNITS.map((u) =>
  rule(
    id(u, "component"),
    `QBI component of ${u.label} (Form 8995-A line 15)`,
    "§ 199A(b)(2), (b)(3)",
    CORNELL,
    "The combined qualified business income amount is the sum of the lesser of 20 percent of the taxpayer's QBI with respect to the qualified trade or business, or the greater of 50 percent of the W-2 wages, or 25 percent of the W-2 wages plus 2.5 percent of the UBIA of qualified property, with respect to the qualified trade or business. [Form 8995-A lines 3–13 for this business; within the phase-in range the excess of 20% of QBI over the wage limit is reduced by the excess-over-threshold fraction (Part III). Exact ratio where the form rounds the percentage.]",
    "money",
    component(u),
  ),
);

const totalRules: Rule[] = [
  rule(
    `${J}.qbi.active_total`,
    "QBI from qualified trades or businesses for the $1,000 test of the § 199A(i) minimum deduction",
    "§ 199A(i)(2), (d)(3)",
    CORNELL,
    "§ 199A(i): a taxpayer whose aggregate QBI with respect to all active qualified trades or businesses is at least $1,000. Draft 2026 Form 8995 instructions, line 16: aggregate all active qualified business income taken into account for purposes of this form. [At or below the threshold, total QBI; above it, each business after Schedule A, so an SSTB past the phase-in range is not a qualified trade or business and one within it counts at its applicable percentage. The prior-year carryforward is its own line on the form and is not active QBI of this year. Material participation is assumed — disclosed.]",
    "money",
    iff(
      cmp("eq", excess, zero),
      ruleRef(`${J}.qbi.total`),
      add(...QBI_UNITS.map((u) => ruleRef(id(u, "sstb_qbi")))),
    ),
  ),
  rule(
    `${J}.qbi.total_component`,
    "Total QBI component (Form 8995 line 5 at or below the threshold; Form 8995-A line 16 above it)",
    "§ 199A(b)(1)–(2)",
    CORNELL,
    "Form 8995: total QBI (line 2) combined with the prior-year carryforward (line 3), times 20% if more than zero. Form 8995-A line 16: add all amounts reported on line 15.",
    "money",
    iff(
      cmp("eq", excess, zero),
      pct("20", "100", max0(sub(ruleRef(`${J}.qbi.total`), fact("qbiLossCarryforward")))),
      add(...QBI_UNITS.map((u) => ruleRef(id(u, "component")))),
    ),
  ),
  rule(
    `${J}.qbi.loss_carryforward`,
    "Qualified business net loss carried to next year, as a positive amount (Form 8995 line 16; Schedule C line 6)",
    "§ 199A(c)(2)",
    CORNELL,
    "If the net amount of qualified business income from all qualified trades or businesses during any taxable year is less than zero, such amount shall be treated as a loss from a qualified trade or business in the succeeding taxable year. [Form 8995 line 16 at or below the threshold; Schedule C (Form 8995-A) line 6 above it.]",
    "money",
    iff(
      cmp("eq", excess, zero),
      max0(sub(fact("qbiLossCarryforward"), ruleRef(`${J}.qbi.total`))),
      sub(ruleRef(`${J}.qbi.loss_netting.losses`), nettingNetted),
    ),
  ),
];

export const qbiBusinessRules: Rule[] = [
  ...rawQbiRules,
  ...thresholdRules,
  ...scheduleARules,
  ...aggregationGroupRules,
  ...scheduleBRules,
  ...scheduleCRules,
  ...partIIRules,
  ...totalRules,
];
