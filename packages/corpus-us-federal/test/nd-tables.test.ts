/**
 * Filed-return parity gates for North Dakota: the engine must reproduce EVERY
 * cell of the 2025 Tax Table at both ends of every row — 1,195 rows across four
 * filing-status columns, 4,780 cells — plus the printed hand-off to the rate
 * schedules at $100,000 and the TY2026 indexed schedules.
 *
 * The table is MANDATORY in its range: N.D.C.C. § 57-38-30.3(10) provides that
 * if the commissioner prescribes tables "the tables must be followed by every
 * individual, estate, or trust determining a tax under this section".
 *
 * The convention proved on all 4,780 cells is the rate schedule evaluated at the
 * row midpoint (at least + $25), rounded half-up, with no exceptions. The table
 * never reaches the 2.50% bracket, since every 1.95% bracket top exceeds
 * $100,000.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

type Row = { atLeast: number; lessThan: number; single: number; mfj: number; mfs: number; hoh: number };
const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "nd-tax-table-2025.json"), "utf8")) as { rows: Row[] };
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const ndTax = (taxable: number, filingStatus: string, schedule = false, asOf?: string) =>
  evalMoney("us.nd.income_tax", { filingStatus, stateTaxableIncome: taxable, ndUseRateSchedule: schedule }, asOf);

describe("2025 North Dakota Tax Table — every cell", () => {
  it("has the full table (1,195 contiguous $50 rows from $40,250 to $100,000)", () => {
    expect(table.rows.length).toBe(1195);
    expect(table.rows[0]).toEqual({ atLeast: 40250, lessThan: 40300, single: 0, mfj: 0, mfs: 0, hoh: 0 });
    expect(table.rows[1194]).toEqual({ atLeast: 99950, lessThan: 100000, single: 1004, mfj: 371, mfs: 1160, hoh: 683 });
    // the booklet's own worked example: "$91,900 of ND taxable income falls in the
    // $91,900 - $91,950 row and owes $214"
    expect(table.rows.find((r) => r.atLeast === 91900)?.mfj).toBe(214);
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
    for (const k of ["single", "mfj", "mfs", "hoh"] as const)
      for (let i = 1; i < table.rows.length; i++) expect(table.rows[i][k]).toBeGreaterThanOrEqual(table.rows[i - 1][k]);
  });

  it("reproduces all 4,780 printed cells at both ends of every row", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        const checks: [string, number][] = [
          ["single", row.single], ["mfj", row.mfj], ["qss", row.mfj], // the footnote sends QSS to the joint column
          ["mfs", row.mfs], ["hoh", row.hoh],
        ];
        for (const [fs, printed] of checks) {
          const got = ndTax(taxable, fs);
          if (got !== printed) bad.push(`${fs} ${taxable}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 300_000);

  it("charges nothing in the zero bracket, and starts each column at its own threshold", () => {
    expect(ndTax(0, "single")).toBe(0);
    expect(ndTax(40000, "mfs")).toBe(0); // below the table's own first row
    // the first nonzero cell in each column, each one $50 past that status's zero-bracket top
    expect(ndTax(40475, "mfs")).toBe(0);
    expect(ndTax(40500, "mfs")).toBe(1);
    expect(ndTax(48500, "single")).toBe(1);
    expect(ndTax(65000, "hoh")).toBe(1);
    expect(ndTax(81000, "mfj")).toBe(1);
    expect(ndTax(81000, "qss")).toBe(1);
  });

  it("hands off to the rate schedules at $100,000 with the printed anchors", () => {
    // still 1.95% just above the table
    expect(ndTax(100000, "single")).toBe(Math.round(0.0195 * (100000 - 48475)));
    // the 2.50% bracket, off the printed anchors
    expect(ndTax(300000, "single")).toBe(Math.round(3828.83 + 0.025 * (300000 - 244825)));
    expect(ndTax(300000, "mfj")).toBe(Math.round(4233.45 + 0.025 * (300000 - 298075)));
    expect(ndTax(200000, "mfs")).toBe(Math.round(2116.73 + 0.025 * (200000 - 149025)));
    expect(ndTax(300000, "hoh")).toBe(Math.round(4026.75 + 0.025 * (300000 - 271450)));
    // qualifying surviving spouse shares the joint schedule above the table too
    expect(ndTax(300000, "qss")).toBe(ndTax(300000, "mfj"));
  });

  it("applies the schedule inside the table's range when asked, differing by less than a row", () => {
    expect(ndTax(48475, "single", true)).toBe(0); // exactly the zero-bracket top
    expect(ndTax(50000, "single", true)).toBe(Math.round(0.0195 * (50000 - 48475))); // 30
    let maxDiff = 0;
    for (let x = 40250; x < 100000; x += 373) maxDiff = Math.max(maxDiff, Math.abs(ndTax(x, "single") - ndTax(x, "single", true)));
    expect(maxDiff).toBeLessThanOrEqual(1);
  });

  it("moves to the TY2026 indexed thresholds, with the rates unchanged", () => {
    // Form ND-1ES 2026: single 0% to $49,575, then 1.95%
    expect(ndTax(49575, "single", false, "2026-12-31")).toBe(0);
    expect(ndTax(60000, "single", false, "2026-12-31")).toBe(Math.round(0.0195 * (60000 - 49575)));
    expect(ndTax(300000, "single", false, "2026-12-31")).toBe(Math.round(3916.09 + 0.025 * (300000 - 250400)));
    // $300,000 joint is still UNDER the 2026 $304,850 top of the 1.95% band
    expect(ndTax(300000, "mfj", false, "2026-12-31")).toBe(Math.round(0.0195 * (300000 - 82800)));
    // and just past it the printed anchor takes over
    expect(ndTax(310000, "mfj", false, "2026-12-31")).toBe(Math.round(4329.98 + 0.025 * (310000 - 304850)));
    expect(ndTax(100000, "mfj", false, "2026-12-31")).toBe(Math.round(0.0195 * (100000 - 82800)));
    // the 2026 thresholds really did move
    expect(ndTax(49000, "single", false, "2026-12-31")).toBe(0);
    expect(ndTax(49000, "single")).toBeGreaterThan(0);
    expect(() => ndTax(50000, "single", false, "2027-06-30")).toThrow();
  });
});

describe("2025 North Dakota subtractions and the marriage penalty credit", () => {
  it("excludes 40% of the net long-term capital gain, net of gain excluded elsewhere", () => {
    const ex = (gain: number, already = 0) =>
      evalMoney("us.nd.capital_gain_exclusion", { filingStatus: "single", ndNetLongTermCapitalGain: gain, ndCapitalGainAlreadyExcluded: already });
    expect(ex(10000)).toBe(4000);
    expect(ex(10000, 2500)).toBe(3000); // worksheet line 6 removes the ineligible portion first
    expect(ex(0)).toBe(0);
  });

  it("excludes 40% of qualified dividends", () => {
    expect(evalMoney("us.nd.qualified_dividend_exclusion", { filingStatus: "single", ndQualifiedDividends: 5000 })).toBe(2000);
  });

  it("caps the College SAVE deduction at $5,000, doubled only on a joint return", () => {
    const d = (fs: string, amt: number) => evalMoney("us.nd.college_save_deduction", { filingStatus: fs, ndCollegeSaveContributions: amt });
    expect(d("single", 8000)).toBe(5000);
    expect(d("mfj", 12000)).toBe(10000);
    expect(d("qss", 12000)).toBe(5000); // shares the joint RATE column, but is not a joint return
    expect(d("mfs", 12000)).toBe(5000);
  });

  it("gates the marriage penalty credit on both thresholds and caps it at $312", () => {
    const c = (facts: Record<string, unknown>) =>
      evalMoney("us.nd.marriage_penalty_credit", { filingStatus: "mfj", ndTaxableIncome: 120000, ndLowerQualifiedIncome: 55000, ...facts });
    // joint tax 900 against two single computations of 300 each -> 300, under the cap
    expect(c({ ndJointScheduleTax: 900, ndSingleScheduleTaxA: 300, ndSingleScheduleTaxB: 300 })).toBe(300);
    // the excess is capped at $312
    expect(c({ ndJointScheduleTax: 1200, ndSingleScheduleTaxA: 300, ndSingleScheduleTaxB: 300 })).toBe(312);
    // below the $81,036 taxable income floor
    expect(c({ ndTaxableIncome: 81036, ndJointScheduleTax: 900, ndSingleScheduleTaxA: 300, ndSingleScheduleTaxB: 300 })).toBe(0);
    // the lower-earning spouse must clear $47,550
    expect(c({ ndLowerQualifiedIncome: 47550, ndJointScheduleTax: 900, ndSingleScheduleTaxA: 300, ndSingleScheduleTaxB: 300 })).toBe(0);
    // not a joint return
    expect(evalMoney("us.nd.marriage_penalty_credit", { filingStatus: "qss", ndTaxableIncome: 120000, ndLowerQualifiedIncome: 55000, ndJointScheduleTax: 900, ndSingleScheduleTaxA: 300, ndSingleScheduleTaxB: 300 })).toBe(0);
  });
});
