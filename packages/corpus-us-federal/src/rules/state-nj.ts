/**
 * New Jersey deep state pack — TY2025, encoded from primary sources 2026-08-02:
 * 2025 NJ-1040 form + instruction booklet (nj.gov/treasury/taxation, printed
 * pp. 3-63, read page-by-page), N.J.S.A. 54A:2-1 rate text (via the enacted
 * P.L.2020 c.95 bill text) and 54A:3-1 exemption text, cross-checked against
 * the Division's rate pages and the Tax Foundation 2025 survey.
 *
 * NJ is a CATEGORY-BASED gross income tax (like PA, unlike the AGI states):
 * income is reported in the NJ-1040 line 15-26 categories, a net loss in any
 * category is simply NOT ENTERED (never negative, never offsets another
 * category, no carryover) — but unlike PA, spouses on a joint return DO
 * combine within a category, and same-category netting is allowed. There is
 * no standard deduction; exemptions and a short list of statutory deductions
 * (medical over 2%, alimony paid, college deductions, property taxes) come
 * off gross income instead.
 */
import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money, printedSchedule, ruleRef } from "./state-helpers.js";

const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const param = (name: string): Expr => ({ kind: "param", name });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const tableB: Expr = {
  kind: "or",
  args: [isStatus("mfj"), isStatus("hoh"), isStatus("qss")],
};

export const njRules: Rule[] = [
  {
    id: "us.nj.income_tax",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey gross income tax — 2025 rate schedules with the NJ Tax Table convention (NJ-1040 line 43)",
    citation: {
      source:
        "N.J.S.A. 54A:2-1 (rates, P.L.2020 c.95 text); 2025 NJ-1040 instructions pp. 31, 54-63 (Tax Table + Tax Rate Schedules)",
      section: "N.J.S.A. 54A:2-1; NJ-1040 line 43",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 New Jersey Tax Rate Schedules (instructions p. 63, verbatim subtraction-constant form). TABLE A, Single / Married-CU partner filing separate: to $20,000 × .014 − 0; $20,000-$35,000 × .0175 − $70.00; $35,000-$40,000 × .035 − $682.50; $40,000-$75,000 × .05525 − $1,492.50; $75,000-$500,000 × .0637 − $2,126.25; $500,000-$1,000,000 × .0897 − $15,126.25; over $1,000,000 × .1075 − $32,926.25. TABLE B, Married-CU couple filing joint / Head of household / Qualifying widow(er)-surviving CU partner: to $20,000 × .014 − 0; $20,000-$50,000 × .0175 − $70.00; $50,000-$70,000 × .0245 − $420.00; $70,000-$80,000 × .035 − $1,154.50; $80,000-$150,000 × .05525 − $2,775.00; $150,000-$500,000 × .0637 − $4,042.50; $500,000-$1,000,000 × .0897 − $17,042.50; over $1,000,000 × .1075 − $34,842.50. STATUTE CROSS-CHECK (54A:2-1 fixed-dollar form, P.L.2020 c.95): single over $75,000-$500,000 = '$2,651.25 plus 6.370% of the excess over $75,000'; single over $1,000,000 = '$74,573.75 plus 10.750%'; joint over $1,000,000 = '$72,657.50 plus 10.750%' — arithmetically identical to the printed subtraction constants (this rule encodes the equivalent fixed-plus-rate rows). METHOD (line 43 instructions, verbatim): 'If the income on line 42 is less than $100,000, use the Tax Table on page 54. Otherwise, calculate the tax by using the Tax Rate Schedule for your filing status.' The printed Tax Table runs in $50 rows with two columns (filing status '1 or 3' = single/MFS; '2, 4, or 5' = MFJ/HOH/QSS); verified rows (88,000-88,050 → 3,481/2,088; 97,000-97,050 → 4,054/2,586) reproduce the rate schedule EVALUATED AT THE $50-ROW MIDPOINT, rounded to the dollar — this rule's default below $100,000 is that midpoint-table method (rows under $50 of income were not individually verified; divergence there is bounded by $1); useFormulaMethod=true evaluates the raw schedule at the exact income instead (the Division's website permits either method below $100,000). ROUNDING (instructions p. 4): 'Round amounts of 50 cents or more up to the next whole dollar' (half-up). NOT APPLIED HERE (composer/agent responsibility, disclosed): the line-29 FILING THRESHOLD — a filer whose NJ gross income (line 29, BEFORE exemptions/deductions but AFTER the pension exclusion) is $10,000 or less (single/MFS) / $20,000 or less (MFJ/HOH/QSS) pays NO tax regardless of this schedule; this target computes the schedule tax on the already-composed line-42 taxable income and cannot see line 29. Civil-union partners file NJ as married even when federally single (N.J.S.A. 37:1-31).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tableThreshold: { value: "10000000", type: "money" }, // $100,000 (table below, schedule at/above)
      filingThresholdSingleMfs: { value: "1000000", type: "money" }, // $10,000 (line 29 gate, documented)
      filingThresholdJointHohQss: { value: "2000000", type: "money" }, // $20,000 (line 29 gate, documented)
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      const scheduleFor = (b: Expr, table: "a" | "b"): Expr => {
        const rows = {
          // fixed = rate × threshold − printed subtraction constant (exact)
          a: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "14", den: "1000" } },
            { thresholdCents: "2000000", fixedCents: "28000", rate: { num: "175", den: "10000" } },
            { thresholdCents: "3500000", fixedCents: "54250", rate: { num: "35", den: "1000" } },
            { thresholdCents: "4000000", fixedCents: "71750", rate: { num: "5525", den: "100000" } },
            { thresholdCents: "7500000", fixedCents: "265125", rate: { num: "637", den: "10000" } },
            { thresholdCents: "50000000", fixedCents: "2972375", rate: { num: "897", den: "10000" } },
            { thresholdCents: "100000000", fixedCents: "7457375", rate: { num: "1075", den: "10000" } },
          ],
          b: [
            { thresholdCents: "0", fixedCents: "0", rate: { num: "14", den: "1000" } },
            { thresholdCents: "2000000", fixedCents: "28000", rate: { num: "175", den: "10000" } },
            // NOTE: the printed Table B constants are DISCONTINUOUS at $70,000
            // (+$0.53) and $80,000 (−$0.50): each fixed anchor below is
            // rate × threshold − printed constant for the SAME row, never the
            // prior row's value at the boundary — this is what reproduces the
            // printed "multiply, then subtract" arithmetic and the Tax Table.
            { thresholdCents: "5000000", fixedCents: "80500", rate: { num: "245", den: "10000" } },
            { thresholdCents: "7000000", fixedCents: "129550", rate: { num: "35", den: "1000" } },
            { thresholdCents: "8000000", fixedCents: "164500", rate: { num: "5525", den: "100000" } },
            { thresholdCents: "15000000", fixedCents: "551250", rate: { num: "637", den: "10000" } },
            { thresholdCents: "50000000", fixedCents: "2780750", rate: { num: "897", den: "10000" } },
            { thresholdCents: "100000000", fixedCents: "7265750", rate: { num: "1075", den: "10000" } },
          ],
        };
        return printedSchedule(b, rows[table]);
      };
      // $50-row midpoint (the printed Tax Table convention below $100,000)
      const mid50: Expr = {
        kind: "add",
        args: [
          {
            kind: "mulInt",
            base: money("5000"),
            count: { kind: "stepUnits", value: base, unitCents: "5000", mode: "floor" },
          },
          money("2500"),
        ],
      };
      const byStatus = (b: Expr): Expr => ({
        kind: "if",
        cond: tableB,
        then: scheduleFor(b, "b"),
        else: scheduleFor(b, "a"),
      });
      return {
        kind: "if",
        cond: {
          kind: "and",
          args: [
            { kind: "cmp", op: "lt", left: base, right: param("tableThreshold") },
            { kind: "not", arg: fact("useFormulaMethod") },
          ],
        },
        then: rd(byStatus(mid50)),
        else: rd(byStatus(base)),
      } as Expr;
    })(),
  },
  {
    id: "us.nj.eitc",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Earned Income Tax Credit — 40% of the federal EIC, plus the flat $260 age-decoupled credit (NJ-1040 line 58, refundable)",
    citation: {
      source: "N.J.S.A. 54A:4-7; 2025 NJ-1040 instructions p. 42 (line 58)",
      section: "NJ-1040 line 58",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 line 58 instructions, verbatim: 'The NJEITC is 40% of the federal EIC. If you claimed and were allowed a federal earned income credit (EIC), enter 40% of your federal EIC amount.' Refundable (line 58 aggregates into line 66 payments; excess drives the line 68/80 refund). AGE DECOUPLING (verbatim): 'If you were at least 18 years old, you may be eligible for an NJEITC even if you did not meet the age requirement for a federal EIC. The maximum age limit has been eliminated. Did you meet the following requirements during 2025? You did not have a qualifying child; and You were at least 18 years old on the last day of the tax year; and You met all federal EIC requirements except the age requirement; and You are not listed as a dependent on another tax return. If so, enter $260 on line 58.' — UNLIKE Illinois (which recomputes 20% of the no-age-gate federal amount), NJ's decoupled credit is a FLAT $260 for 2025, encoded here as the answer whenever njEitcAgeDecoupled is attested AND the ordinary federal EITC is $0 (a filer with a nonzero federal EIC gets the ordinary 40%). MFS: eligible only with a qualifying child who lived with the filer more than half of 2025 while living apart from the spouse the last six months (attested by supplying the federal EITC; not separately gated here). Part-year residents prorate both the 40% amount and the $260 by resident months (not modeled — full-year resident target). Civil-union couples not filing a joint federal return compute the federal EIC from a mock joint federal return (agent-composed, disclosed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "40", type: "int" },
      ageDecoupledFlat: { value: "26000", type: "money" }, // $260 (2025)
    },
    formula: rd({
      kind: "if",
      cond: {
        kind: "and",
        args: [
          fact("njEitcAgeDecoupled"),
          { kind: "cmp", op: "eq", left: ruleRef("us.federal.eitc"), right: money("0") },
        ],
      },
      then: param("ageDecoupledFlat"),
      else: {
        kind: "mulRate",
        base: ruleRef("us.federal.eitc"),
        rate: { num: "40", den: "100" },
        round: "half-up",
      },
    }),
  },
  {
    id: "us.nj.cdcc",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Child and Dependent Care Credit — sliding percentage of the federal credit by NJ taxable income (NJ-1040 line 64, Worksheet J)",
    citation: {
      source: "N.J.S.A. 54A:4-17; 2025 NJ-1040 instructions pp. 43-44 (Worksheet J, line 64)",
      section: "NJ-1040 line 64; Worksheet J",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 Worksheet J (verbatim): line 1 'Enter your federal credit for child and dependent care expenses'; line 2 'Enter your taxable income from line 42, NJ-1040'; line 3 percentage by line 2: '$30,000 or less: 50%; Over $30,000 but not over $60,000: 40%; Over $60,000 but not over $90,000: 30%; Over $90,000 but not over $120,000: 20%; Over $120,000 but not over $150,000: 10%; Over $150,000: not eligible'; line 4 'Multiply line 1 by the percentage on line 3.' Refundable in effect: line 64 aggregates into line 66 total payments and can drive the line 68/80 refund. INPUT (njFederalCdcc): the federal § 21 child and dependent care credit computed on Form 2441 — for a filer whose federal credit was reduced only by the federal liability limit, the instructions' mock-return language for non-joint federal filers ('calculate the amount of the federal credit... you would have been eligible to receive') supports using the credit the filer WOULD have been eligible for; supply the appropriate 2441 amount and disclose which was used (the worksheet itself does not name a 2441 line number). MFS: 'you are only eligible for the credit if you meet certain exceptions for federal purposes' (the § 21(e) living-apart rules — attested by supplying a nonzero njFederalCdcc). Part-year residents prorate by resident months (not modeled). Enclose federal Form 2441.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "3000000", type: "money" }, // $30,000 → 50%
      tier2Max: { value: "6000000", type: "money" }, // $60,000 → 40%
      tier3Max: { value: "9000000", type: "money" }, // $90,000 → 30%
      tier4Max: { value: "12000000", type: "money" }, // $120,000 → 20%
      tier5Max: { value: "15000000", type: "money" }, // $150,000 → 10%; above: $0
    },
    formula: (() => {
      const ti: Expr = max0(fact("stateTaxableIncome"));
      const pct = (num: string): Expr => ({
        kind: "mulRate",
        base: fact("njFederalCdcc"),
        rate: { num, den: "100" },
        round: "half-up",
      });
      const tier = (max: string, num: string, next: Expr): Expr => ({
        kind: "if",
        cond: le(ti, param(max)),
        then: pct(num),
        else: next,
      });
      return rd(
        tier("tier1Max", "50",
          tier("tier2Max", "40",
            tier("tier3Max", "30",
              tier("tier4Max", "20",
                tier("tier5Max", "10", money("0")))))),
      );
    })(),
  },
  {
    id: "us.nj.ctc",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Child Tax Credit — $1,000 to $200 per child age 5 or younger, by NJ taxable income (NJ-1040 line 65, refundable)",
    citation: {
      source: "N.J.S.A. 54A:4-17.1; 2025 NJ-1040 instructions p. 44 (line 65); nj.gov 2025-changes page",
      section: "NJ-1040 line 65",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 line 65 instructions, verbatim: 'If your taxable income is $80,000 or less, you are eligible for a credit for each dependent who is age 5 or younger on the last day of the tax year. If your filing status is married filing separately, you are not eligible for this credit.' Per-child amount by line 42 taxable income (verbatim): '$30,000 or less: $1,000; Over $30,000 not over $40,000: $800; Over $40,000 not over $50,000: $600; Over $50,000 not over $60,000: $400; Over $60,000 not over $80,000: $200.' Multiply by 'the number of dependents claimed on lines 10 and 11, NJ-1040 who were age 5 or younger on the last day of the tax year (born 2020 or later).' Refundable in effect (line 65 aggregates into the line 66 payments total). Part-year residents prorate by resident months (not modeled — full-year resident target). The child must be a claimed dependent (line 10/11), not merely a household member.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "3000000", type: "money" }, // ≤$30,000 → $1,000/child
      tier2Max: { value: "4000000", type: "money" }, // ≤$40,000 → $800
      tier3Max: { value: "5000000", type: "money" }, // ≤$50,000 → $600
      tier4Max: { value: "6000000", type: "money" }, // ≤$60,000 → $400
      tier5Max: { value: "8000000", type: "money" }, // ≤$80,000 → $200; above: $0
      amount1: { value: "100000", type: "money" },
      amount2: { value: "80000", type: "money" },
      amount3: { value: "60000", type: "money" },
      amount4: { value: "40000", type: "money" },
      amount5: { value: "20000", type: "money" },
    },
    formula: (() => {
      const ti: Expr = max0(fact("stateTaxableIncome"));
      const tier = (max: string, amount: string, next: Expr): Expr => ({
        kind: "if",
        cond: le(ti, param(max)),
        then: param(amount),
        else: next,
      });
      const perChild = tier("tier1Max", "amount1",
        tier("tier2Max", "amount2",
          tier("tier3Max", "amount3",
            tier("tier4Max", "amount4",
              tier("tier5Max", "amount5", money("0"))))));
      return {
        kind: "if",
        cond: isStatus("mfs"),
        then: money("0"),
        else: { kind: "mulInt", base: perChild, count: fact("njChildrenUnder6") },
      };
    })(),
  },
  {
    id: "us.nj.pension_exclusion",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Pension/Retirement Exclusion — line 28a chart with the $150,000 income cliff",
    citation: {
      source: "N.J.S.A. 54A:6-10, 54A:6-15; 2025 NJ-1040 instructions pp. 20-21 (line 28a chart, Worksheet D)",
      section: "NJ-1040 line 28a",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 line 28a (verbatim): 'You can exclude all or part of the income reported on line 20a if you meet the following qualifications: You (and/or your spouse if filing jointly) were age 62 or older or blind/disabled as defined by Social Security guidelines on the last day of the tax year; and Your income on line 27 is $150,000 or less.' Exclusion = LESSER of the eligible line-20a pension income and the chart amount, by filing status and line-27 total income (verbatim chart): MFJ — $0-$100,000: $100,000; $100,001-$125,000: 50% of line 20a; $125,001-$150,000: 25% of line 20a. Single/HOH/QSS — $75,000; 37.5% of line 20a; 18.75% of line 20a. MFS — $50,000; 25% of line 20a; 12.5% of line 20a. HARD CLIFF: line 27 over $150,000 → NO exclusion (one dollar of income can destroy the entire exclusion — a findable cliff). JOINT FILERS (verbatim): 'If only one spouse is 62 or older or disabled, enter only the pension income of that spouse' — supply only the eligible spouse's line-20a amount in njPensionIncome. Social Security and Railroad Retirement are NOT in line 20a (fully exempt, p. 8 exempt list). The line-28b Other Retirement Income Exclusion (Worksheet D: unclaimed max for 62+ filers with ≤$3,000 of earned income) and the $6,000/$3,000 Special Exclusion (never SS-eligible) are composed separately by the return composer. Conservative default: njPensionEligible=false → $0.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      incomeCliff: { value: "15000000", type: "money" }, // $150,000 (line 27)
      fullTierMax: { value: "10000000", type: "money" }, // $100,000 (line 27)
      midTierMax: { value: "12500000", type: "money" }, // $125,000 (line 27)
      capJoint: { value: "10000000", type: "money" }, // $100,000
      capSingleHohQss: { value: "7500000", type: "money" }, // $75,000
      capMfs: { value: "5000000", type: "money" }, // $50,000
    },
    formula: (() => {
      const income: Expr = fact("njTotalIncome");
      const pension: Expr = max0(fact("njPensionIncome"));
      const pctOfPension = (num: string, den: string): Expr =>
        rd({ kind: "mulRate", base: pension, rate: { num, den }, round: "half-up" });
      // per-status (cap, mid %, low %): mfj 100k/50%/25%; single-hoh-qss 75k/37.5%/18.75%; mfs 50k/25%/12.5%
      const byStatus = (capParam: string, mid: [string, string], low: [string, string]): Expr => ({
        kind: "if",
        cond: le(income, param("fullTierMax")),
        then: { kind: "min", args: [pension, param(capParam)] },
        else: {
          kind: "if",
          cond: le(income, param("midTierMax")),
          then: pctOfPension(mid[0], mid[1]),
          else: pctOfPension(low[0], low[1]),
        },
      });
      return {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            { kind: "not", arg: fact("njPensionEligible") },
            { kind: "cmp", op: "gt", left: income, right: param("incomeCliff") },
          ],
        },
        then: money("0"),
        else: {
          kind: "if",
          cond: isStatus("mfs"),
          then: byStatus("capMfs", ["25", "100"], ["125", "1000"]),
          else: {
            kind: "if",
            cond: isStatus("single"),
            then: byStatus("capSingleHohQss", ["375", "1000"], ["1875", "10000"]),
            else: {
              kind: "if",
              cond: tableB, // mfj/hoh/qss
              then: {
                kind: "if",
                cond: isStatus("mfj"),
                then: byStatus("capJoint", ["50", "100"], ["25", "100"]),
                else: byStatus("capSingleHohQss", ["375", "1000"], ["1875", "10000"]),
              },
              else: byStatus("capSingleHohQss", ["375", "1000"], ["1875", "10000"]),
            },
          },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.nj.property_tax_deduction",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Property Tax Deduction — line 40a capped at $15,000 ($7,500 MFS same home); the $50 credit alternative is a composer selection",
    citation: {
      source: "N.J.S.A. 54A:3A-15 et seq.; 2025 NJ-1040 instructions pp. 25-30 (lines 40a-41, 56; Worksheets G/H)",
      section: "NJ-1040 lines 40a, 41, 56",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 line 41 (verbatim): 'you can take either a Property Tax Deduction of up to $15,000 ($7,500 if you and your spouse file separate returns but maintained the same main home) or a Property Tax Credit' — the credit is $50 ($25 MFS same home, refundable, line 56). Line 40a input: property taxes due AND paid on the principal residence; TENANTS (verbatim): 'Enter 18% of the rent paid for 2025. This is the amount that is considered property taxes' (mobile-home owners: 18% of site fees). Supply the already-computed line-40a amount in njPropertyTaxesPaid (for tenants, 18% × rent; multi-owner/multi-unit prorations per Worksheet G composed by the caller). DEDUCTION-VS-CREDIT (Worksheet H, composer's job — needs the tax computed both ways): take the deduction when tax-without minus tax-with is $50 or more ($25 MFS same home); otherwise the $50/$25 refundable credit on line 56. Eligibility (p. 25): NJ main home subject to property taxes, income over the filing threshold (seniors/blind/disabled at or below the threshold still get the $50 credit, via NJ-1040 or NJ-1040-HW). This rule computes the LINE 41 DEDUCTION only: min(line 40a, $15,000/$7,500).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      cap: { value: "1500000", type: "money" }, // $15,000
      capMfsSameHome: { value: "750000", type: "money" }, // $7,500
      creditAmount: { value: "5000", type: "money" }, // $50 ($25 MFS same home)
      creditThreshold: { value: "5000", type: "money" }, // Worksheet H line 8 test: savings ≥ $50
    },
    formula: {
      kind: "min",
      args: [
        max0(fact("njPropertyTaxesPaid")),
        {
          kind: "if",
          cond: { kind: "and", args: [isStatus("mfs"), fact("njMfsSameHome")] },
          then: param("capMfsSameHome"),
          else: param("cap"),
        },
      ],
    },
  },
  {
    id: "us.nj.use_tax",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey Estimated Use Tax Chart — no-receipts estimate by NJ gross income (NJ-1040 line 51, Worksheet K)",
    citation: {
      source: "N.J.S.A. 54:32B-14; 2025 NJ-1040 instructions pp. 35-36 (Worksheet K + Estimated Use Tax Chart)",
      section: "NJ-1040 line 51; Worksheet K",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040i.pdf",
      excerpt:
        "2025 Estimated Use Tax Chart (verbatim, 'for Part I, line 2 only' — items under $1,000 each, when exact purchase amounts are unknown), keyed to NJ gross income (line 29): 'up to $15,000: $14; $15,001-$30,000: $44; $30,001-$50,000: $64; $50,001-$75,000: $84; $75,001-$100,000: $106; $100,001-$150,000: $134; $150,001-$200,000: $170; $200,001 and over: .0852% (.000852) of income, or $494, whichever is less.' Items of $1,000 or more each must ALWAYS be computed exactly (6.625% minus other states' sales tax up to 6.625%) — not modeled here; the exact-records path (Worksheet K Part I lines 1a-1d) is likewise the caller's computation. A filer with NO untaxed purchases enters 0.00 (the form requires an explicit entry) — this chart applies only when use tax IS owed on under-$1,000 items without records. Input: njGrossIncome = NJ-1040 line 29.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "1500000", type: "money" }, // $15,000 → $14
      tier2Max: { value: "3000000", type: "money" }, // $30,000 → $44
      tier3Max: { value: "5000000", type: "money" }, // $50,000 → $64
      tier4Max: { value: "7500000", type: "money" }, // $75,000 → $84
      tier5Max: { value: "10000000", type: "money" }, // $100,000 → $106
      tier6Max: { value: "15000000", type: "money" }, // $150,000 → $134
      tier7Max: { value: "20000000", type: "money" }, // $200,000 → $170
      tier1Tax: { value: "1400", type: "money" },
      tier2Tax: { value: "4400", type: "money" },
      tier3Tax: { value: "6400", type: "money" },
      tier4Tax: { value: "8400", type: "money" },
      tier5Tax: { value: "10600", type: "money" },
      tier6Tax: { value: "13400", type: "money" },
      tier7Tax: { value: "17000", type: "money" },
      overCap: { value: "49400", type: "money" }, // $494 cap above $200,000
    },
    formula: (() => {
      const income: Expr = max0(fact("njGrossIncome"));
      const tier = (max: string, tax: string, next: Expr): Expr => ({
        kind: "if",
        cond: le(income, param(max)),
        then: param(tax),
        else: next,
      });
      return tier("tier1Max", "tier1Tax",
        tier("tier2Max", "tier2Tax",
          tier("tier3Max", "tier3Tax",
            tier("tier4Max", "tier4Tax",
              tier("tier5Max", "tier5Tax",
                tier("tier6Max", "tier6Tax",
                  tier("tier7Max", "tier7Tax", {
                    kind: "min",
                    args: [
                      rd({ kind: "mulRate", base: income, rate: { num: "852", den: "1000000" }, round: "half-up" }),
                      param("overCap"),
                    ],
                  })))))));
    })(),
  },
  {
    id: "us.nj.parameters",
    version: 1,
    jurisdiction: "us.nj",
    title: "New Jersey 2025 return parameters — exemptions, thresholds, deductions, credits, SRP (NJ-1040)",
    citation: {
      source:
        "N.J.S.A. 54A:3-1, 54A:3-1.1; 2025 NJ-1040 form + instructions (nj.gov/treasury/taxation, read 2026-08-02); nj.gov Income Tax Changes for Tax Year 2025",
      section: "NJ-1040 lines 6-13, 30-38, 46-65",
      url: "https://www.nj.gov/treasury/taxation/pdf/current/1040.pdf",
      excerpt:
        "EXEMPTIONS (printed form multipliers, verbatim): line 6 Regular $1,000 each (self; spouse/CU partner if joint; or registered domestic partner); line 7 Senior 65+ $1,000 each (self/spouse only, born 1960 or earlier); line 8 Blind/Disabled $1,000 each (self/spouse only); line 9 Veteran $6,000 each (honorably discharged, self/spouse only); line 10 Qualified Dependent Children $1,500 each; line 11 Other Dependents $1,500 each; line 12 Dependents Attending Colleges $1,000 each (under 22 all year — born 2004 or later for 2025 — full-time, five calendar months at school, taxpayer paid half or more of tuition and maintenance); line 13 total → line 30 deduction."
        + "\n\nFILING THRESHOLDS (line 29 NJ gross income): more than $10,000 (single/MFS) / $20,000 (MFJ/HOH/QSS) must file; at or below → NO TAX DUE (still file for withholding refunds or NJEITC). The threshold tests LINE 29 (after the pension exclusion, before exemptions/deductions)."
        + "\n\nDEDUCTIONS (lines 30-37c; NJ has NO standard deduction and NO federal itemized coupling): line 31 MEDICAL over the 2% floor — Worksheet F: unreimbursed medical expenses minus 2% × line 29, PLUS Archer MSA contributions (federal Form 8853) and the self-employed health insurance deduction (no HSA deduction exists anywhere on the NJ-1040 — NJ never adopted § 223); line 32 alimony PAID (court-ordered; NJ did not adopt the TCJA § 11051 repeal — post-2018 instruments still deduct; child support never); line 33 qualified conservation contribution (NJ land, federal amount); line 34 Health Enterprise Zone deduction (TB-56); line 35 Alternative Business Calculation Adjustment (Schedule NJ-BUS-2, the ONE cross-category softener: 50% sharing among the four business-type categories with a 20-year carryforward FOR THE ADJUSTMENT ONLY); line 36 organ/bone marrow donation up to $10,000; lines 37a-37c College Affordability (gross income ≤ $200,000 for all three): NJBEST 529 contributions up to $10,000, NJCLASS loan principal+interest up to $2,500, NJ-institution tuition up to $10,000. MFS: combined spouses' deductions cannot exceed the joint caps."
        + "\n\nCATEGORY/LOSS RULES (p. 7, verbatim): 'You cannot report a loss on your NJ-1040... You can net losses with gains in the same category of income... You cannot apply a net loss in one category of income against income or gains in a different category... If you have a net loss in any income category, make no entry on that line... No carryback or carryover of losses is allowed.' Spouses on a joint return combine within each category (unlike PA). Tax-exempt interest (line 16b) is reported but never taxed; Social Security and Railroad Retirement are exempt; NJ Lottery prizes of $10,000 or less are exempt (bigger prizes fully taxable); unemployment compensation is exempt."
        + "\n\nOTHER RETIREMENT INCOME EXCLUSION (line 28b, Worksheet D): a 62-or-older filer whose earned income (lines 15+18+21+22) is $3,000 or less may claim the UNUSED portion of the line-28a maximum exclusion; SPECIAL EXCLUSION $6,000 (MFJ/HOH/QSS) / $3,000 (single/MFS) for filers who will NEVER be eligible for Social Security or Railroad Retirement because their employer did not participate."
        + "\n\nCREDITS: line 44 Credit for Income Taxes Paid to Other Jurisdictions (Schedule NJ-COJ; cannot exceed line 43 tax; NO credit for Pennsylvania-reciprocal WAGES — the PA/NJ Reciprocal Agreement covers compensation, but NOT Philadelphia's wage tax, which does qualify); line 46 Sheltered Workshop Tax Credit (GIT-317, max $1,000 per disabled employee — transcribed); line 47 Gold Star Family Counseling Credit (hours × TRICARE rate); line 48 employer of organ/bone-marrow donor (25% of salary up to 30 days); lines 59-61 EXCESS UI/WF/SWF, DI, FLI withheld from two or more employers (2025 employee maximums, verbatim: UI/WF/SWF $184.02; DI $380.42; FLI $545.82 — Form NJ-2450); line 62 Wounded Warrior Caregivers Credit (gross income ≤ $100,000 MFJ/HOH/QSS, ≤ $50,000 single/MFS; Schedule NJ-WWC); line 63 Pass-Through Business Alternative Income Tax (BAIT) credit from PTE-K-1. Oracle targets: us.nj.eitc (40% of federal EIC + the $260 age-decoupled flat), us.nj.cdcc, us.nj.ctc, us.nj.pension_exclusion, us.nj.property_tax_deduction, us.nj.use_tax, us.nj.income_tax."
        + "\n\nSHARED RESPONSIBILITY PAYMENT (line 53c, NJ individual health-coverage mandate, Schedule NJ-HCC/Worksheet L): EXEMPT when line 29 is $20,000 or less ($10,000 single/MFS). Otherwise the payment = the GREATER of 2.5% of household income above the filing threshold or the flat amounts ($695 per adult, $347.50 per under-18, flat cap $2,085), capped by household size: 1 person $4,908; 2 $9,816; 3 $14,724; 4 $19,632; 5+ $24,540; partial-year months at $57.92/adult, $28.96/child per uncovered month — agent-composed from coverage months, disclosed."
        + "\n\nROUNDING (p. 4): rounding to whole dollars is OPTIONAL but all-or-nothing ('If you round, do so for all lines'); 50 cents or more rounds up. PROPERTY-TAX RELIEF PROGRAMS: ANCHOR, Senior Freeze, and Stay NJ are claimed on the separate combined PAS-1 application, NOT on the NJ-1040, and the benefits are exempt income; the only NJ-1040 touchpoint is Worksheet H's Senior-Freeze base-year property-tax amounts. CIVIL UNIONS: partners must file NJ as married (joint or separate) even when their federal status differs. Part-year residents prorate exemptions, deductions, credits, and exclusions by resident months (15+ days = a month) — the composer targets full-year residents only.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      exemptionRegular: { value: "100000", type: "money" }, // $1,000
      exemptionSenior: { value: "100000", type: "money" }, // $1,000
      exemptionBlindDisabled: { value: "100000", type: "money" }, // $1,000
      exemptionVeteran: { value: "600000", type: "money" }, // $6,000
      exemptionDependent: { value: "150000", type: "money" }, // $1,500
      exemptionCollegeDependent: { value: "100000", type: "money" }, // $1,000
      filingThresholdSingleMfs: { value: "1000000", type: "money" }, // $10,000
      filingThresholdJointHohQss: { value: "2000000", type: "money" }, // $20,000
      medicalFloorPct: { value: "2", type: "int" }, // 2% of line 29
      organDonationCap: { value: "1000000", type: "money" }, // $10,000
      collegeDeductionIncomeCap: { value: "20000000", type: "money" }, // $200,000
      njbestCap: { value: "1000000", type: "money" }, // $10,000
      njclassCap: { value: "250000", type: "money" }, // $2,500
      tuitionCap: { value: "1000000", type: "money" }, // $10,000
      specialExclusionJointHohQss: { value: "600000", type: "money" }, // $6,000
      specialExclusionSingleMfs: { value: "300000", type: "money" }, // $3,000
      otherRetirementEarnedIncomeCap: { value: "300000", type: "money" }, // $3,000
      excessUiWfSwfMax: { value: "18402", type: "money" }, // $184.02
      excessDiMax: { value: "38042", type: "money" }, // $380.42
      excessFliMax: { value: "54582", type: "money" }, // $545.82
      wwcIncomeCapJointHohQss: { value: "10000000", type: "money" }, // $100,000
      wwcIncomeCapSingleMfs: { value: "5000000", type: "money" }, // $50,000
      srpAdultFlat: { value: "69500", type: "money" }, // $695
      srpChildFlat: { value: "34750", type: "money" }, // $347.50
      srpFlatCap: { value: "208500", type: "money" }, // $2,085
      srpPctOfIncome: { value: "25", type: "int" }, // 2.5% (tenths of a percent × 10)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: use lookup_tax_parameter for the NJ amounts; tax → us.nj.income_tax, credits → us.nj.eitc / us.nj.cdcc / us.nj.ctc, exclusions → us.nj.pension_exclusion, property tax → us.nj.property_tax_deduction, use tax → us.nj.use_tax; the rest is agent-composed from the cited lines",
    },
  },
];
