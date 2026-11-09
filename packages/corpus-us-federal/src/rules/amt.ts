/**
 * Individual alternative minimum tax — 26 U.S.C. §§ 55–59, Form 6251,
 * line by line. Verified November 2026 against the 2025 Form 6251 and its
 * instructions, the 2026 draft Form 6251 (created 5/26/26), and the Rev.
 * Procs. (all read from the PDFs):
 *
 *   TY2025 (Rev. Proc. 2024-40 § 2.11): exemptions $88,100 single/HoH,
 *   $137,000 joint/QSS, $68,500 MFS; phase-out at 25% above $626,350 /
 *   $1,252,700 / $626,350; 28% rate above $239,100 ($119,550 MFS), i.e.
 *   28% less $4,782 ($2,391 MFS). MFS line 4 add-back above $900,350.
 *
 *   TY2026 (Rev. Proc. 2025-32 §§ 3.10–3.11, verbatim): exemptions
 *   $90,100 / $140,200 / $70,100; the OBBBA RESET the phase-out to
 *   $500,000 / $1,000,000 / $500,000 at a 50% rate (§ 55(d)(4)(A)(ii)(IV)
 *   substitutes "50 percent" for "25 percent" in § 55(d)(2), and the MFS
 *   add-back sentence is part of § 55(d)(2), so its rate is 50% too — read
 *   from the statute; the 2026 instructions are not out, and the draft
 *   form's $640,200 MFS line 4 threshold confirms only where the exemption
 *   reaches zero); 28% above $244,500 ($122,250 MFS), i.e. 28% less $4,890
 *   ($2,445 MFS).
 *
 *   TY2027 (Rev. Proc. 2026-35 § 3.11): exemptions $93,000 / $144,700 /
 *   $72,350; phase-out at 50% above $515,950 / $1,031,900 / $515,950
 *   (complete at $701,950 / $1,321,300 / $660,650 — the MFS figure is the
 *   line 4 add-back threshold); 28% above $252,500 ($126,250 MFS), i.e.
 *   28% less $5,050 ($2,525 MFS).
 *
 * Part I. Line 1b is Form 1040 line 11b (AGI) less line 14 (the standard or
 * itemized deduction, the § 170(p) deduction for 2026, Schedule 1-A and
 * § 199A) with the Schedule 1-A senior deduction left in (2025 Form 6251
 * instructions: it is a personal exemption, which § 56(b)(1)(D) disallows;
 * the instructions print the cite as "section 56(b)(5)(D)").
 * An itemizer also subtracts the TY2026+ § 68 reduction ("Section 68 shall
 * not apply", § 56(b)(1)(E)); a non-itemizer whose standard deduction was
 * increased by a net qualified disaster loss adds back only the standard
 * deduction before the increase (2025 instructions, lines 2a and 3).
 * Unlike taxable income it is NOT floored at zero: "if less than zero,
 * enter as a negative amount". Line 2a adds back the Schedule A taxes when
 * itemizing, the line 12e deduction otherwise; line 2i is the § 56(b)(3)
 * ISO spread; other adjustments come in as one attested amount.
 *
 * Part III. Line 13 is line 4 of the Qualified Dividends and Capital Gain
 * Tax Worksheet (net capital gain plus qualified dividends), NOT limited
 * to taxable income; line 16 takes the smaller of it and line 12, so the
 * 26/28% rates reach only the part of the AMT base that is not adjusted net
 * capital gain (§ 55(b)(3)). The 0% and 15% bands are positioned by the
 * regular worksheet's line 5 (lines 20 and 27), and line 40 caps the result
 * at the flat 26/28% tax on the whole base (line 39).
 *
 * § 59(j) (a kiddie-tax child's exemption capped at earned income plus a
 * dollar amount) does not apply: § 55(d)(4)(A)(iii) switches it off for
 * taxable years beginning after December 31, 2017, and the 2025 Exemption
 * Worksheet has no such step. The Rev. Procs. still print the amount.
 *
 * Disclosed simplifications: of Schedule 2 line 1z only the excess advance
 * premium tax credit repayment is modeled; no Schedule D Tax Worksheet (unrecaptured
 * § 1250 and 28% gain are not modeled, so lines 14 and 35–37 are zero);
 * line 13 is not refigured for AMT basis differences; no AMT foreign tax
 * credit (line 8); no § 53 credit carryforward.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { TY2025, TY2026, TY2027, type YearTables } from "./income-tax.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const d = (dollars: number): Expr => money(String(BigInt(dollars) * 100n));
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const pct = (base: Expr, num: string, den = "100"): Expr => ({
  kind: "mulRate",
  base,
  rate: { num, den },
  round: "half-up",
});
const isMfs: Expr = {
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: "mfs" },
};

const amti = ruleRef("us.federal.amt.amti");
const line12 = ruleRef("us.federal.amt.taxable_excess");
const line13 = ruleRef("us.federal.amt.capital_gain_amount");
const qdcgLine5 = ruleRef("us.federal.ordinary_taxable_income");

const SOURCE_2025 = "Form 6251 (2025) and instructions; Rev. Proc. 2024-40 § 2.11";
const SOURCE_2026 = "Form 6251 (2026, draft created 5/26/26); Rev. Proc. 2025-32 §§ 3.10–3.11; Pub. L. 119-21 (OBBBA) § 70107";
const SOURCE_2027 = "Rev. Proc. 2026-35 §§ 3.03, 3.11; Form 6251 line structure as on the 2026 draft (the 2027 form is not yet published); Pub. L. 119-21 (OBBBA) § 70107";
const F6251_URL = "https://www.irs.gov/pub/irs-pdf/f6251.pdf";

interface AmtYear {
  year: string;
  from: string;
  to: string;
  source: string;
  exemptSingle: string; exemptJoint: string; exemptMfs: string;
  threshSingle: string; threshJoint: string; threshMfs: string;
  /** § 55(d)(2) phase-out rate, also the MFS add-back rate */
  phaseRate: string;
  /** MFS AMTI at which the exemption reaches zero (line 4 instruction) */
  mfsZeroAt: string;
  break28: string; break28Mfs: string;
  sub28: string; sub28Mfs: string;
  cg: YearTables;
  amountsNote: string;
}

const Y2025: AmtYear = {
  year: "2025", from: "2025-01-01", to: "2026-01-01", source: SOURCE_2025,
  exemptSingle: "8810000", exemptJoint: "13700000", exemptMfs: "6850000",
  threshSingle: "62635000", threshJoint: "125270000", threshMfs: "62635000",
  phaseRate: "25",
  mfsZeroAt: "90035000",
  break28: "23910000", break28Mfs: "11955000",
  sub28: "478200", sub28Mfs: "239100",
  cg: TY2025,
  amountsNote: "For 2025: exemptions $88,100 ($137,000 joint/QSS; $68,500 MFS) phasing out at 25% of AMTI over $626,350 ($1,252,700 joint/QSS; $626,350 MFS); 26% up to $239,100 ($119,550 MFS), above that 28% less $4,782 ($2,391 MFS).",
};

const Y2026: AmtYear = {
  year: "2026", from: "2026-01-01", to: "2027-01-01", source: SOURCE_2026,
  exemptSingle: "9010000", exemptJoint: "14020000", exemptMfs: "7010000",
  threshSingle: "50000000", threshJoint: "100000000", threshMfs: "50000000",
  phaseRate: "50",
  mfsZeroAt: "64020000",
  break28: "24450000", break28Mfs: "12225000",
  sub28: "489000", sub28Mfs: "244500",
  cg: TY2026,
  amountsNote: "For 2026: exemptions $90,100 ($140,200 joint/QSS; $70,100 MFS) phasing out at 50% of AMTI over $500,000 ($1,000,000 joint/QSS; $500,000 MFS); 26% up to $244,500 ($122,250 MFS), above that 28% less $4,890 ($2,445 MFS).",
};

const Y2027: AmtYear = {
  year: "2027", from: "2027-01-01", to: "2028-01-01", source: SOURCE_2027,
  exemptSingle: "9300000", exemptJoint: "14470000", exemptMfs: "7235000",
  threshSingle: "51595000", threshJoint: "103190000", threshMfs: "51595000",
  phaseRate: "50",
  mfsZeroAt: "66065000",
  break28: "25250000", break28Mfs: "12625000",
  sub28: "505000", sub28Mfs: "252500",
  cg: TY2027,
  amountsNote: "For 2027: exemptions $93,000 ($144,700 joint/QSS; $72,350 MFS) phasing out at 50% of AMTI over $515,950 ($1,031,900 joint/QSS; $515,950 MFS), completely phased out at $701,950 / $1,321,300 / $660,650; 26% up to $252,500 ($126,250 MFS), above that 28% less $5,050 ($2,525 MFS).",
};

const byStatus = (single: string, joint: string, mfs: string): Expr => ({
  kind: "match",
  on: fact("filingStatus"),
  cases: [
    { when: "single", value: param(single) },
    { when: "hoh", value: param(single) },
    { when: "mfj", value: param(joint) },
    { when: "qss", value: param(joint) },
    { when: "mfs", value: param(mfs) },
  ],
});

/** 26% up to the breakpoint, otherwise 28% less the subtraction (lines 18 and 39) */
const tax2628 = (base: Expr): Expr => ({
  kind: "if",
  cond: {
    kind: "cmp",
    op: "le",
    left: base,
    right: { kind: "if", cond: isMfs, then: param("break28Mfs"), else: param("break28") },
  },
  then: pct(base, "26"),
  else: sub(
    pct(base, "28"),
    { kind: "if", cond: isMfs, then: param("sub28Mfs"), else: param("sub28") },
  ),
});

// the same decision as us.federal.deduction_election: a forced election, or
// itemized deductions above the standard side (which carries the § 170(p)
// deduction and the net qualified disaster loss increase)
const itemizing: Expr = {
  kind: "or",
  args: [
    fact("forceItemized"),
    {
      kind: "cmp",
      op: "gt",
      left: ruleRef("us.federal.itemized_deductions"),
      right: add(
        ruleRef("us.federal.standard_deduction"),
        ruleRef("us.federal.charitable_deduction_nonitemizer"),
        fact("casualtyQualifiedDisasterLosses"),
      ),
    },
  ],
};

// Part I lines 1a–1b: AGI less Form 1040 line 14 without the senior deduction
const line1b: Expr = sub(
  ruleRef("us.federal.agi"),
  add(
    ruleRef("us.federal.deduction_election"),
    ruleRef("us.federal.tips_deduction"),
    ruleRef("us.federal.overtime_deduction"),
    ruleRef("us.federal.car_loan_interest_deduction"),
    ruleRef("us.federal.qbi_deduction"),
  ),
);
// line 2e: the Schedule 1 line 8a NOL deduction, as a positive amount
const line2e: Expr = sub(money("0"), ruleRef("us.federal.nol_deduction"));
const line4BeforeMfsAndAtnold: Expr = add(
  line1b,
  line2e,
  {
    kind: "if",
    cond: itemizing,
    then: sub(
      ruleRef("us.federal.salt_deduction"), // line 2a: Schedule A line 7
      // line 3: "Section 68 shall not apply" (§ 56(b)(1)(E)) — the AMT
      // allows the itemized deductions before the TY2026+ overall
      // limitation (zero for 2025, when § 68 is suspended)
      sub(
        ruleRef("us.federal.itemized_deductions_before_limitation"),
        ruleRef("us.federal.itemized_deductions"),
      ),
    ),
    // line 2a (Form 1040 line 12e), or with a net qualified disaster loss,
    // line 3: the standard deduction before the increase (2025 instructions)
    else: ruleRef("us.federal.standard_deduction"),
  },
  fact("amtIsoExerciseSpread"), // line 2i
  fact("amtOtherPreferences"), // lines 2b–3, attested
);
// line 2f: the ATNOLD, "limited to 90% of" lines 1 through 3 figured with line 2f
// treated as zero. The deduction itself is attested, and asked only when there are NOL
// carryovers and those lines exceed the full exemption: at or below it the AMT is zero
// whatever the ATNOLD, and line 2f is left at zero
const nolCarryovers: Expr = add(fact("nolCarryforwardPre2018"), fact("nolCarryforwardPost2017"));
const line2f: Expr = {
  kind: "if",
  cond: {
    kind: "and",
    args: [
      { kind: "cmp", op: "gt", left: nolCarryovers, right: money("0") },
      { kind: "cmp", op: "gt", left: line4BeforeMfsAndAtnold, right: byStatus("exemptSingle", "exemptJoint", "exemptMfs") },
    ],
  },
  then: min(max0(fact("alternativeTaxNolDeduction")), max0(pct(line4BeforeMfsAndAtnold, "90"))),
  else: money("0"),
};
const line4BeforeMfs: Expr = sub(line4BeforeMfsAndAtnold, line2f);

function amtiRule(version: number, y: AmtYear): Rule {
  return {
    id: "us.federal.amt.amti",
    version,
    jurisdiction: J,
    title: `Alternative minimum taxable income — Form 6251 line 4 (TY${y.year})`,
    citation: {
      source: `26 U.S.C. §§ 55(b)(2), (d)(2), 56; ${y.source}`,
      section: "Form 6251 lines 1a–4; § 55(d)(2) last sentence",
      url: F6251_URL,
      excerpt: `Line 1b: "Subtract line 1a from Form 1040, 1040-SR, or 1040-NR, line 11b (if less than zero, enter as a negative amount)", where line 1a is Form 1040 line 14 less the Schedule 1-A enhanced deduction for seniors. Line 2a: "If filing Schedule A (Form 1040), enter the taxes from Schedule A, line 7; otherwise, enter the amount from Form 1040 or 1040-SR, line 12e." An itemizer also subtracts the § 68 reduction, since "Section 68 shall not apply" (§ 56(b)(1)(E)); a filer who used Schedule A only for the net qualified disaster loss increase enters zero on line 2a and adds back the standard deduction before the increase on line 3 (2025 instructions). Line 2e: "Net operating loss deduction from Schedule 1 (Form 1040), line 8a. Enter as a positive amount". Line 2f, the alternative tax net operating loss deduction: "first figure a tentative amount for line 2d by treating line 2f as if it were zero. Next, figure a tentative total of lines 1 through 3 using the tentative line 2d amount and treating line 2f as if it were zero. This is your AMTI figured without regard to the ATNOLD. Your ATNOLD is limited to 90% of the result." [The ATNOLD before that limit is entered (alternativeTaxNolDeduction) and asked only with NOL carryovers when lines 1–3 exceed the full exemption — at or below it the AMT is zero whatever the ATNOLD, so line 2f is left at zero and AMTI is shown without it; an alternative tax NOL with no regular NOL carryover is not modeled; the exceptions to the 90% limit (pre-2005 qualified disaster, Gulf Opportunity Zone, Kansas and Midwestern disaster losses, § 172(b)(1)(H) elections) are not modeled.] Line 2i adds the incentive stock option spread; other adjustments and preferences come in as one entered amount. Married filing separately: AMTI "shall be increased by the lesser of" ${y.phaseRate}% of the excess over $${(Number(y.mfsZeroAt) / 100).toLocaleString("en-US")} or the exemption amount (§ 55(d)(2)).`,
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      exemptSingle: { value: y.exemptSingle, type: "money" },
      exemptJoint: { value: y.exemptJoint, type: "money" },
      exemptMfs: { value: y.exemptMfs, type: "money" },
      mfsZeroAt: { value: y.mfsZeroAt, type: "money" },
    },
    formula: add(
      line4BeforeMfs,
      {
        kind: "if",
        cond: isMfs,
        then: min(pct(max0(sub(line4BeforeMfs, param("mfsZeroAt"))), y.phaseRate), param("exemptMfs")),
        else: money("0"),
      },
    ),
  };
}

function exemptionRule(version: number, y: AmtYear): Rule {
  return {
    id: "us.federal.amt.exemption",
    version,
    jurisdiction: J,
    title: `AMT exemption — Form 6251 line 5 (TY${y.year})`,
    citation: {
      source: `26 U.S.C. § 55(d); ${y.source}`,
      section: "§ 55(d)(1), (d)(2), (d)(4); Form 6251 Exemption Worksheet",
      url: "https://www.law.cornell.edu/uscode/text/26/55",
      excerpt: `${y.amountsNote} The exemption is "reduced (but not below zero)" by the phase-out (§ 55(d)(2)). § 59(j) does not cap a kiddie-tax child's exemption: "subsection (j) of section 59 shall not apply" (§ 55(d)(4)(A)(iii)).`,
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      exemptSingle: { value: y.exemptSingle, type: "money" },
      exemptJoint: { value: y.exemptJoint, type: "money" },
      exemptMfs: { value: y.exemptMfs, type: "money" },
      threshSingle: { value: y.threshSingle, type: "money" },
      threshJoint: { value: y.threshJoint, type: "money" },
      threshMfs: { value: y.threshMfs, type: "money" },
    },
    formula: max0(
      sub(
        byStatus("exemptSingle", "exemptJoint", "exemptMfs"),
        pct(max0(sub(amti, byStatus("threshSingle", "threshJoint", "threshMfs"))), y.phaseRate),
      ),
    ),
  };
}

function tmtRule(version: number, y: AmtYear): Rule {
  // Part III, lines 16–40 (lines 14 and 35–37 are zero without a Schedule D Tax Worksheet)
  const line16 = min(line12, line13);
  const line17 = sub(line12, line16);
  const line18 = tax2628(line17);
  const bands = (s: { zeroMax: number; fifteenMax: number }): Expr => {
    const line21 = max0(sub(d(s.zeroMax), qdcgLine5));
    const line22 = min(line12, line13);
    const line23 = min(line21, line22);
    const line24 = sub(line22, line23);
    const line29 = max0(sub(d(s.fifteenMax), add(line21, qdcgLine5)));
    const line30 = min(line24, line29);
    const line33 = sub(line22, add(line23, line30));
    return add(pct(line30, "15"), pct(line33, "20"));
  };
  const line38 = add(line18, {
    kind: "match",
    on: fact("filingStatus"),
    cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((st) => ({
      when: st,
      value: bands(y.cg[st]),
    })),
  });
  return {
    id: "us.federal.amt.tentative_minimum_tax",
    version,
    jurisdiction: J,
    title: `Tentative minimum tax — Form 6251 lines 7 and 9, Part III (TY${y.year})`,
    citation: {
      source: `26 U.S.C. § 55(b)(1), (b)(3); ${y.source}`,
      section: "§ 55(b)(1)(A), (b)(3); Form 6251 lines 12–40",
      url: F6251_URL,
      excerpt: `Line 13: "Enter the amount from line 4 of the Qualified Dividends and Capital Gain Tax Worksheet"; line 16: "Enter the smaller of line 12 or line 15"; lines 20 and 27: the worksheet's line 5; line 22: "Enter the smaller of line 12 or line 13"; line 40: "Enter the smaller of line 38 or line 39". ${y.amountsNote} The 0% band ends at $${y.cg.single.zeroMax.toLocaleString("en-US")} single / $${y.cg.mfj.zeroMax.toLocaleString("en-US")} joint / $${y.cg.hoh.zeroMax.toLocaleString("en-US")} HoH / $${y.cg.mfs.zeroMax.toLocaleString("en-US")} MFS and the 15% band at $${y.cg.single.fifteenMax.toLocaleString("en-US")} / $${y.cg.mfj.fifteenMax.toLocaleString("en-US")} / $${y.cg.hoh.fifteenMax.toLocaleString("en-US")} / $${y.cg.mfs.fifteenMax.toLocaleString("en-US")}. [Not modeled, disclosed: the Schedule D Tax Worksheet (unrecaptured § 1250 and 28% gain), AMT refiguring of line 13, the AMT foreign tax credit (line 8).]`,
    },
    effectiveFrom: y.from,
    effectiveTo: y.to,
    output: { type: "money" },
    parameters: {
      break28: { value: y.break28, type: "money" },
      break28Mfs: { value: y.break28Mfs, type: "money" },
      sub28: { value: y.sub28, type: "money" },
      sub28Mfs: { value: y.sub28Mfs, type: "money" },
    },
    formula: min(line38, tax2628(line12)),
  };
}

export const amtRules: Rule[] = [
  // v1–v3 had no line 2e/2f (the NOL deduction did not exist)
  amtiRule(4, Y2025),
  amtiRule(5, Y2026),
  amtiRule(6, Y2027),
  exemptionRule(1, Y2025),
  exemptionRule(2, Y2026),
  exemptionRule(3, Y2027),
  {
    id: "us.federal.amt.taxable_excess",
    version: 1,
    jurisdiction: J,
    title: "AMT taxable excess — Form 6251 line 6 (AMTI less the exemption)",
    citation: {
      source: "26 U.S.C. § 55(b)(1)(A)(ii), (b)(2)",
      section: "§ 55(b)(1)(A)(ii); Form 6251 line 6",
      url: F6251_URL,
      excerpt: "Line 6: \"Subtract line 5 from line 4. If more than zero, go to line 7. If zero or less, enter -0- here and on lines 7, 9, and 11.\"",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: max0(sub(amti, ruleRef("us.federal.amt.exemption"))),
  },
  {
    id: "us.federal.amt.capital_gain_amount",
    version: 1,
    jurisdiction: J,
    title: "Form 6251 line 13: net capital gain plus qualified dividends (QDCG worksheet line 4, not limited to taxable income)",
    citation: {
      source: "26 U.S.C. § 55(b)(3); § 1(h)(3), (h)(11); Form 6251 line 13",
      section: "§ 55(b)(3); Form 6251 line 13",
      url: F6251_URL,
      excerpt: "Line 13: \"Enter the amount from line 4 of the Qualified Dividends and Capital Gain Tax Worksheet in the Instructions for Form 1040\". Worksheet line 4 adds qualified dividends (line 2) and the smaller of Schedule D line 15 or 16 (line 3); taxable income enters only at line 5.",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: add(ruleRef("us.federal.schedule_d.preferential_lt_gain"), fact("qualifiedDividends")),
  },
  tmtRule(1, Y2025),
  tmtRule(2, Y2026),
  tmtRule(3, Y2027),
  {
    id: "us.federal.amt",
    version: 3, // v1/v2 capped line 13 at taxable income, never applied line 39, floored line 1 at zero, applied § 59(j) and skipped the MFS add-back
    jurisdiction: J,
    title: "Alternative minimum tax — Form 6251 line 11",
    citation: {
      source: "26 U.S.C. § 55(a); Form 6251 lines 9–11",
      section: "§ 55(a)",
      url: "https://www.law.cornell.edu/uscode/text/26/55",
      excerpt: "The alternative minimum tax is \"the excess (if any) of the tentative minimum tax for the taxable year, over the regular tax for the taxable year\" (§ 55(a)). Line 10: \"Add Form 1040 or 1040-SR, line 16 (minus any tax from Form 4972), and Schedule 2 (Form 1040), line 1z\" — of line 1z the engine models line 1a, the excess advance premium tax credit repayment; line 11: \"Subtract line 10 from line 9. If zero or less, enter -0-.\" [Not modeled, disclosed: AMT foreign tax credit, § 53 credit carryforward.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: max0(
      sub(
        ruleRef("us.federal.amt.tentative_minimum_tax"),
        add(
          ruleRef("us.federal.income_tax_before_credits"),
          // Schedule 2 line 1z: of its items the engine models line 1a,
          // the excess advance premium tax credit repayment
          ruleRef("us.federal.ptc.excess_aptc_repayment"),
        ),
      ),
    ),
  },
];
