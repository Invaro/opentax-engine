/**
 * Individual alternative minimum tax — 26 U.S.C. §§ 55–59, Form 6251.
 * Verified July 2026 from the Rev. Procs. (read from the PDFs):
 *
 *   TY2025 (Rev. Proc. 2024-40 § 2.11): exemptions $88,100 single/HoH,
 *   $137,000 joint/QSS, $68,500 MFS; phase-out at 25% above $626,350 /
 *   $1,252,700 / $626,350; 28% rate above $239,100 ($119,550 MFS);
 *   § 59(j) kiddie-child exemption ≤ earned income + $9,550.
 *
 *   TY2026 (Rev. Proc. 2025-32 §§ 3.10–3.11, verbatim): exemptions
 *   $90,100 / $140,200 / $70,100; the OBBBA RESET the phase-out to
 *   $500,000 / $1,000,000 / $500,000 at a 50% rate — the printed
 *   complete-phase-out amounts ($680,200 / $1,280,400 / $640,200)
 *   arithmetically confirm the 50% rate; 28% above $244,500 ($122,250
 *   MFS); kiddie exemption ≤ earned income + $9,750.
 *
 * AMTI here = taxable income plus the adjustments our fact space can
 * produce: the SALT deduction (§ 56(b)(1)(A)(ii)) when itemizing, the
 * standard deduction (§ 56(b)(1)(E)) when not, the OBBBA senior
 * deduction (added back per the 2025 Form 6251 instructions — treated
 * as a personal-exemption adjustment), the ISO exercise spread
 * (§ 56(b)(3)), and a catch-all preferences fact (private-activity-bond
 * interest, depreciation adjustments, …). The §§ 224/225/163(h)(4)/
 * 170(p) OBBBA deductions and § 199A have no AMT addback — allowed.
 * Capital gains keep their 0/15/20 treatment (Form 6251 Part III),
 * positioned by the regular worksheet's quantities.
 *
 * Disclosed simplifications: the § 55(d)(3) MFS add-back above the
 * complete phase-out and the new-§ 68 unwind question are not modeled;
 * when the AMT base is smaller than the preferential gains (deep
 * exemption territory) the ordinary part floors at zero — TMT is far
 * below the regular tax there and the max0 yields zero AMT.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { TY2025, TY2026, type YearTables } from "./income-tax.js";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const d = (dollars: number): Expr => money(String(BigInt(dollars) * 100n));

const taxable = ruleRef("us.federal.taxable_income");
const regOrdinary = ruleRef("us.federal.ordinary_taxable_income");

interface AmtYear {
  exemptSingle: string; exemptJoint: string; exemptMfs: string;
  threshSingle: string; threshJoint: string; threshMfs: string;
  phaseRate: { num: string; den: string };
  break28: string; break28Mfs: string;
  kiddiePlus: string;
}

function amtRule(
  version: number,
  from: string,
  to: string,
  year: string,
  p: AmtYear,
  cg: YearTables,
  source: string,
  amountsNote: string,
): Rule {
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

  // AMTI = taxable income + the addbacks our chain produced
  const itemizing: Expr = {
    kind: "cmp",
    op: "gt",
    left: ruleRef("us.federal.itemized_deductions"),
    right: {
      kind: "add",
      args: [
        ruleRef("us.federal.standard_deduction"),
        ruleRef("us.federal.charitable_deduction_nonitemizer"),
      ],
    },
  };
  const amti: Expr = {
    kind: "add",
    args: [
      taxable,
      {
        kind: "if",
        cond: itemizing,
        then: ruleRef("us.federal.salt_deduction"),
        else: ruleRef("us.federal.standard_deduction"),
      },
      ruleRef("us.federal.senior_deduction"),
      fact("amtIsoExerciseSpread"),
      fact("amtOtherPreferences"),
    ],
  };

  // exemption with phase-out, capped for a § 1(g) child (§ 59(j))
  const exemptionPhased: Expr = {
    kind: "max0",
    arg: {
      kind: "sub",
      left: byStatus("exemptSingle", "exemptJoint", "exemptMfs"),
      right: {
        kind: "mulRate",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: amti,
            right: byStatus("threshSingle", "threshJoint", "threshMfs"),
          },
        },
        rate: p.phaseRate,
        round: "half-up",
      },
    },
  };
  const exemption: Expr = {
    kind: "if",
    cond: fact("isSubjectToKiddieTax"),
    then: {
      kind: "min",
      args: [
        exemptionPhased,
        { kind: "add", args: [fact("wages"), param("kiddiePlus")] }, // earned ≈ wages
      ],
    },
    else: exemptionPhased,
  };

  const base: Expr = { kind: "max0", arg: { kind: "sub", left: amti, right: exemption } };
  // Part III: gains keep 0/15/20, positioned by the regular worksheet
  const prefRegular: Expr = { kind: "sub", left: taxable, right: regOrdinary };
  const amtOrdinary: Expr = { kind: "max0", arg: { kind: "sub", left: base, right: prefRegular } };
  const break28: Expr = {
    kind: "if",
    cond: {
      kind: "cmp",
      op: "eq",
      left: fact("filingStatus"),
      right: { kind: "enum", value: "mfs" },
    },
    then: param("break28Mfs"),
    else: param("break28"),
  };
  const tmt26_28: Expr = {
    kind: "add",
    args: [
      {
        kind: "mulRate",
        base: { kind: "min", args: [amtOrdinary, break28] },
        rate: { num: "26", den: "100" },
        round: "half-up",
      },
      {
        kind: "mulRate",
        base: { kind: "max0", arg: { kind: "sub", left: amtOrdinary, right: break28 } },
        rate: { num: "28", den: "100" },
        round: "half-up",
      },
    ],
  };
  // the same 15%/20% gain slices as the regular computation
  const gainSlices = (sy: { zeroMax: number; fifteenMax: number }): Expr => {
    const gain0: Expr = {
      kind: "max0",
      arg: {
        kind: "sub",
        left: { kind: "min", args: [d(sy.zeroMax), taxable] },
        right: regOrdinary,
      },
    };
    const gain15: Expr = {
      kind: "max0",
      arg: {
        kind: "sub",
        left: {
          kind: "sub",
          left: { kind: "min", args: [d(sy.fifteenMax), taxable] },
          right: regOrdinary,
        },
        right: gain0,
      },
    };
    const gain20: Expr = {
      kind: "max0",
      arg: {
        kind: "sub",
        left: { kind: "sub", left: prefRegular, right: gain0 },
        right: gain15,
      },
    };
    return {
      kind: "add",
      args: [
        { kind: "mulRate", base: gain15, rate: { num: "15", den: "100" }, round: "half-up" },
        { kind: "mulRate", base: gain20, rate: { num: "20", den: "100" }, round: "half-up" },
      ],
    };
  };
  const gainsTax: Expr = {
    kind: "match",
    on: fact("filingStatus"),
    cases: (["single", "mfj", "hoh", "mfs", "qss"] as const).map((st) => ({
      when: st,
      value: gainSlices(cg[st]),
    })),
  };

  return {
    id: "us.federal.amt",
    version,
    jurisdiction: J,
    title: `Alternative minimum tax — Form 6251 (TY${year})`,
    citation: {
      source: `26 U.S.C. §§ 55–59; ${source}`,
      section: "§ 55(b), (d); §§ 56–59; § 59(j)",
      url: "https://www.law.cornell.edu/uscode/text/26/55",
      excerpt: `The excess of the tentative minimum tax — 26 percent of the taxable excess up to the 28-percent breakpoint and 28 percent above, with capital gains keeping their §1(h) rates (Form 6251 Part III) — over the regular tax. ${amountsNote} AMTI adds back the SALT deduction when itemizing, the standard deduction otherwise (§ 56(b)(1)), the OBBBA senior deduction (2025 Form 6251 instructions), the § 56(b)(3) ISO exercise spread, and entered preference items; the §§ 224/225/163(h)(4)/170(p) deductions and § 199A carry no addback. A § 1(g) child's exemption is capped at earned income (≈ wages) plus the § 59(j) amount. [Not modeled, disclosed: the § 55(d)(3) MFS add-back, AMT credit carryforward (§ 53), and the new-§ 68 unwind question.]`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    parameters: {
      exemptSingle: { value: p.exemptSingle, type: "money" },
      exemptJoint: { value: p.exemptJoint, type: "money" },
      exemptMfs: { value: p.exemptMfs, type: "money" },
      threshSingle: { value: p.threshSingle, type: "money" },
      threshJoint: { value: p.threshJoint, type: "money" },
      threshMfs: { value: p.threshMfs, type: "money" },
      break28: { value: p.break28, type: "money" },
      break28Mfs: { value: p.break28Mfs, type: "money" },
      kiddiePlus: { value: p.kiddiePlus, type: "money" },
    },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: { kind: "add", args: [tmt26_28, gainsTax] },
        right: ruleRef("us.federal.income_tax_before_credits"),
      },
    },
  };
}

export const amtRules: Rule[] = [
  amtRule(
    1, "2025-01-01", "2026-01-01", "2025",
    {
      exemptSingle: "8810000", exemptJoint: "13700000", exemptMfs: "6850000",
      threshSingle: "62635000", threshJoint: "125270000", threshMfs: "62635000",
      phaseRate: { num: "25", den: "100" },
      break28: "23910000", break28Mfs: "11955000",
      kiddiePlus: "955000",
    },
    TY2025,
    "Rev. Proc. 2024-40 §§ 2.11–2.12",
    "For 2025: exemptions $88,100 ($137,000 joint/QSS; $68,500 MFS) phasing out at 25% of AMTI over $626,350 ($1,252,700 joint); the 28% rate applies above $239,100 ($119,550 MFS); the § 59(j) kiddie amount is $9,550.",
  ),
  amtRule(
    2, "2026-01-01", "2027-01-01", "2026",
    {
      exemptSingle: "9010000", exemptJoint: "14020000", exemptMfs: "7010000",
      threshSingle: "50000000", threshJoint: "100000000", threshMfs: "50000000",
      phaseRate: { num: "50", den: "100" },
      break28: "24450000", break28Mfs: "12225000",
      kiddiePlus: "975000",
    },
    TY2026,
    "Rev. Proc. 2025-32 §§ 3.10–3.11; Pub. L. 119-21 (OBBBA)",
    "For 2026: exemptions $90,100 ($140,200 joint/QSS; $70,100 MFS) — but the OBBBA RESET the phase-out thresholds to $500,000 ($1,000,000 joint) at a DOUBLED 50% rate (the printed complete-phase-out amounts $680,200/$1,280,400 confirm it arithmetically); the 28% rate applies above $244,500 ($122,250 MFS); the § 59(j) kiddie amount is $9,750.",
  ),
];
