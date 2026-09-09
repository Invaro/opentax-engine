/**
 * Filed-return parity gates for Vermont: the engine must reproduce EVERY cell of
 * the 2025 Vermont Tax Tables at both ends of every row — 750 rows of $100 from
 * $0 to $75,000 across four filing-status columns, 3,000 cells — plus the
 * printed hand-off to the rate schedules at $75,000 and the 3%-of-AGI minimum.
 *
 * The table is mandatory in its range: the rate schedule page prints "TAXABLE
 * INCOME UNDER $75,000 USE THE TAX TABLES" in every column.
 *
 * The convention proved on all 3,000 cells is the rate schedule with its
 * PRINTED whole-dollar anchors evaluated at the row midpoint (at least + $50),
 * rounded half-up — except the first row (0 to 100), which prints $0 where the
 * arithmetic gives $2. At the 154 cells where the printed anchor and the exact
 * cumulative schedule disagree, the table follows the printed anchor.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

type Row = { atLeast: number; lessThan: number; single: number; mfj: number; mfs: number; hoh: number };
const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "vt-tax-table-2025.json"), "utf8")) as { rows: Row[] };
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const vtTax = (taxable: number, filingStatus: string, schedule = false, asOf?: string, agi = 0) =>
  evalMoney("us.vt.income_tax", { filingStatus, stateTaxableIncome: taxable, vtUseRateSchedule: schedule, vtFederalAgi: agi }, asOf);

describe("2025 Vermont Tax Tables — every cell", () => {
  it("has the full table (750 contiguous $100 rows from $0 to $75,000)", () => {
    expect(table.rows.length).toBe(750);
    expect(table.rows[0]).toEqual({ atLeast: 0, lessThan: 100, single: 0, mfj: 0, mfs: 0, hoh: 0 });
    expect(table.rows[749]).toEqual({ atLeast: 74900, lessThan: 75000, single: 3341, mfj: 2511, mfs: 3606, hoh: 2796 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
    for (const k of ["single", "mfj", "mfs", "hoh"] as const)
      for (let i = 1; i < table.rows.length; i++) expect(table.rows[i][k]).toBeGreaterThanOrEqual(table.rows[i - 1][k]);
  });

  it("reproduces all 3,000 printed cells at both ends of every row", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        const checks: [string, number][] = [
          ["single", row.single], ["mfj", row.mfj], ["qss", row.mfj], // the footnote sends qualifying widow(er)s to the joint column
          ["mfs", row.mfs], ["hoh", row.hoh],
        ];
        for (const [fs, printed] of checks) {
          const got = vtTax(taxable, fs);
          if (got !== printed) bad.push(`${fs} ${taxable}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 300_000);

  it("prints $0 on the first row and follows the printed anchor where it differs from the exact schedule", () => {
    expect(vtTax(0, "single")).toBe(0);
    expect(vtTax(99, "hoh")).toBe(0);
    expect(vtTax(100, "single")).toBe(5); // 3.35% x $150 = 5.025
    // 41,300-41,400 separate: printed anchor 1,382 + 6.6% x 100 = 1,388.60 -> 1,389; the exact
    // 1,381.875 + 6.60 = 1,388.475 would print 1,388. The table prints 1,389.
    expect(vtTax(41300, "mfs")).toBe(1389);
    expect(vtTax(41399, "mfs")).toBe(1389);
  });

  it("hands off to the rate schedules at $75,000 with the printed split-row anchors", () => {
    // the schedule's own worked example: joint $85,000 -> 2,764 + 6.6% x 2,500 = $2,929
    expect(vtTax(85000, "mfj")).toBe(2929);
    expect(vtTax(85000, "qss")).toBe(2929);
    expect(vtTax(75000, "single")).toBe(3345); // "over 49,400 but not over 75,000": 1,655 + 6.6% x 25,600 = 3,344.60
    expect(vtTax(75001, "single")).toBe(Math.round(3345 + 0.066 * 1)); // the printed 75,000 row
    expect(vtTax(100000, "single")).toBe(Math.round(3345 + 0.066 * 25000)); // 4,995
    expect(vtTax(300000, "single")).toBe(Math.round(16175 + 0.0875 * (300000 - 249700)));
    expect(vtTax(300000, "hoh")).toBe(Math.round(17179 + 0.0875 * (300000 - 276850)));
    expect(vtTax(200000, "mfs")).toBe(Math.round(9214 + 0.0875 * (200000 - 152000)));
    // the literal separate-schedule blip: at exactly $75,000 the row "over 41,250 but not over
    // 75,000" gives 1,382 + 6.6% x 33,750 = 3,609.50 -> 3,610, one dollar MORE than the
    // "over 75,000" row's printed base of 3,609 that applies at $75,000.01
    expect(vtTax(75000, "mfs")).toBe(3610);
    expect(vtTax(75001, "mfs")).toBe(3609);
  });

  it("applies the schedule inside the table's range when asked, differing by at most a row", () => {
    expect(vtTax(50000, "single", true)).toBe(Math.round(1655 + 0.066 * 600)); // 1,694.60 -> 1,695
    let maxDiff = 0;
    for (let x = 0; x < 75000; x += 373) maxDiff = Math.max(maxDiff, Math.abs(vtTax(x, "single") - vtTax(x, "single", true)));
    expect(maxDiff).toBeLessThanOrEqual(4);
  });

  it("charges at least 3% of federal AGI less U.S. obligation interest when federal AGI exceeds $150,000", () => {
    // taxable $40,000 single but AGI $200,000: the table gives $1,340; 3% x $200,000 = $6,000 governs
    expect(vtTax(40000, "single", false, undefined, 200000)).toBe(6000);
    // U.S. obligation interest comes off the AGI base first
    expect(evalMoney("us.vt.income_tax", { filingStatus: "single", stateTaxableIncome: 40000, vtFederalAgi: 200000, vtUsObligationInterest: 50000 })).toBe(4500);
    // at exactly $150,000 the minimum does not apply
    expect(vtTax(40000, "single", false, undefined, 150000)).toBe(vtTax(40000, "single"));
    // a high schedule tax beats the floor
    expect(vtTax(400000, "single", false, undefined, 420000)).toBe(Math.round(16175 + 0.0875 * (400000 - 249700)));
  });

  it("moves to the 2026 preliminary schedules for TY2026 and refuses beyond the corpus window", () => {
    expect(vtTax(50750, "single", false, "2026-12-31")).toBe(Math.round(0.0335 * 50750)); // 1,700.125 -> 1,700
    expect(vtTax(100000, "single", false, "2026-12-31")).toBe(Math.round(1700 + 0.066 * (100000 - 50750)));
    expect(vtTax(85000, "mfj", false, "2026-12-31")).toBe(Math.round(2837 + 0.066 * 300));
    expect(vtTax(300000, "hoh", false, "2026-12-31")).toBe(Math.round(17630 + 0.0875 * (300000 - 284150)));
    expect(vtTax(200000, "mfs", false, "2026-12-31")).toBe(Math.round(9458 + 0.0875 * (200000 - 156025)));
    // no 2026 table: below $75,000 the schedule applies at the exact income
    expect(vtTax(41300, "mfs", false, "2026-12-31")).toBe(Math.round(0.0335 * 41300));
    expect(() => vtTax(50000, "single", false, "2027-06-30")).toThrow();
  });
});

describe("2025 Vermont deductions, exclusions and credits", () => {
  it("adds $1,250 per federal age/blind box to the standard deduction, capped by the chart", () => {
    const d = (fs: string, boxes = 0) => evalMoney("us.vt.standard_deduction", { filingStatus: fs, vtAdditionalDeductionBoxes: boxes });
    expect(d("single")).toBe(7650);
    expect(d("mfj")).toBe(15300);
    expect(d("qss")).toBe(15300);
    expect(d("hoh")).toBe(11450);
    expect(d("mfs")).toBe(7650);
    expect(d("single", 2)).toBe(10150);
    expect(d("single", 3)).toBe(10150); // the chart prints n/a
    expect(d("mfj", 4)).toBe(20300);
    expect(d("mfs", 4)).toBe(12650);
    expect(d("hoh", 2)).toBe(13950);
  });

  it("excludes Social Security in full, then proportionally, then not at all", () => {
    const ss = (fs: string, agi: number, benefits = 20000) =>
      evalMoney("us.vt.retirement_income_exclusion", { filingStatus: fs, vtFederalAgi: agi, vtRetirementElection: "social_security", vtTaxableSocialSecurity: benefits });
    expect(ss("single", 55000)).toBe(20000);
    expect(ss("single", 60000)).toBe(10000); // (65,000 - 60,000) / 10,000 = .50
    expect(ss("single", 60190)).toBe(9600); // .481 -> .48 exactly as the worksheet's own example rounds
    expect(ss("single", 65000)).toBe(0);
    expect(ss("mfj", 70000)).toBe(20000);
    expect(ss("mfj", 75000)).toBe(10000);
    expect(ss("mfj", 80000)).toBe(0);
    expect(ss("qss", 70000)).toBe(0); // a surviving spouse uses the $55,000 / $65,000 thresholds
    // the other election caps at $10,000, and no election claims nothing
    expect(evalMoney("us.vt.retirement_income_exclusion", { filingStatus: "single", vtFederalAgi: 50000, vtRetirementElection: "contributory_system", vtContributorySystemIncome: 30000 })).toBe(10000);
    expect(evalMoney("us.vt.retirement_income_exclusion", { filingStatus: "single", vtFederalAgi: 50000, vtTaxableSocialSecurity: 20000 })).toBe(0);
  });

  it("phases the military retirement exclusion between $125,000 and $175,000 for every status", () => {
    const m = (agi: number, fs = "single") => evalMoney("us.vt.military_retirement_exclusion", { filingStatus: fs, vtFederalAgi: agi, vtMilitaryRetirementIncome: 30000 });
    expect(m(125000)).toBe(30000);
    expect(m(150000)).toBe(15000);
    expect(m(150000, "mfj")).toBe(15000);
    expect(m(174999)).toBe(0); // (175,000 - 174,999) / 50,000 = .00002 -> .00
    expect(m(175000)).toBe(0);
  });

  it("takes the greater of the flat and 40% capital gains methods, capped at 40% of federal taxable income", () => {
    const cg = (net: number, eligible: number, fti: number) =>
      evalMoney("us.vt.capital_gains_exclusion", { filingStatus: "single", vtNetAdjustedCapitalGain: net, vtEligibleLongTermGain: eligible, vtFederalTaxableIncome: fti });
    expect(cg(20000, 0, 100000)).toBe(5000); // flat
    expect(cg(20000, 20000, 100000)).toBe(8000); // 40% beats $5,000
    expect(cg(20000, 20000, 15000)).toBe(6000); // 40% of federal taxable income caps it
    expect(cg(1000000, 1000000, 2000000)).toBe(350000); // the $350,000 cap
    expect(cg(0, 0, 100000)).toBe(0); // a net loss
  });

  it("pays the credits as printed", () => {
    expect(evalMoney("us.vt.eitc", { filingStatus: "single", vtFederalEic: 1000, vtEitcQualifyingChildren: 1 })).toBe(380);
    expect(evalMoney("us.vt.eitc", { filingStatus: "single", vtFederalEic: 649, vtEitcQualifyingChildren: 0 })).toBe(649);
    const ctc = (agi: number, kids = 2) => evalMoney("us.vt.child_tax_credit", { filingStatus: "mfj", vtFederalAgi: agi, vtChildrenSixOrUnder: kids });
    expect(ctc(125000)).toBe(2000);
    expect(ctc(125001)).toBe(1960); // the printed table: 125,001-126,000 -> 980 per child
    expect(ctc(137500)).toBe(1480); // 137,001-138,000 -> 740
    expect(ctc(174000)).toBe(40); // 173,001-174,000 -> 20
    expect(ctc(174001)).toBe(0);
    expect(evalMoney("us.vt.child_dependent_care_credit", { filingStatus: "single", vtFederalChildCareCredit: 1200 })).toBe(864);
    expect(evalMoney("us.vt.charitable_credit", { filingStatus: "single", vtCharitableContributions: 30000 })).toBe(1000);
    expect(evalMoney("us.vt.charitable_credit", { filingStatus: "single", vtCharitableContributions: 1230 })).toBe(62); // 61.50 -> 62
    const vet = (agi: number, attested = true) => evalMoney("us.vt.veteran_credit", { filingStatus: "single", vtFederalAgi: agi, vtVeteranDischargeRecord: attested });
    expect(vet(25000)).toBe(250);
    expect(vet(25099)).toBe(250); // 99 / 100 rounds DOWN to 0 steps
    expect(vet(25100)).toBe(245);
    expect(vet(29999)).toBe(5);
    expect(vet(30000)).toBe(0);
    expect(vet(20000, false)).toBe(0);
    expect(evalMoney("us.vt.vheip_credit", { filingStatus: "single", vtVheipContributions: 4000, vtVheipBeneficiaries: 1 })).toBe(250);
    expect(evalMoney("us.vt.vheip_credit", { filingStatus: "mfj", vtVheipContributions: 4000, vtVheipBeneficiaries: 1 })).toBe(400);
  });

  it("estimates use tax from the AGI table and rounds the 0.05% tier once", () => {
    const use = (agi: number) => evalMoney("us.vt.use_tax", { filingStatus: "single", vtFederalAgi: agi, vtUseTaxEstimateFromTable: true });
    expect(use(20000)).toBe(0);
    expect(use(20001)).toBe(10);
    expect(use(100000)).toBe(45);
    expect(use(100001)).toBe(50); // 0.05% x 100,001 = 50.0005
    expect(use(299000)).toBe(150); // 149.50 -> 150
    expect(use(500000)).toBe(150); // capped
    expect(evalMoney("us.vt.use_tax", { filingStatus: "single", vtFederalAgi: 50000, vtUseTaxSmallPurchases: 500, vtUseTaxLargePurchases: 2000, vtUseTaxPaidOtherState: 40 })).toBe(110); // 30 + 120 - 40
    expect(evalMoney("us.vt.child_care_contribution", { filingStatus: "single", vtSelfEmploymentIncome: 45000, vtSelfEmploymentIncomeOutsideVermont: 5000 })).toBe(44);
  });
});
