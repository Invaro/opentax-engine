/**
 * Filed-return parity gates for Maine: the engine must reproduce EVERY row of
 * the 2025 Maine Income Tax Table (1,000 $100 rows to $100,000) at both ends
 * for all three columns (plus MFS = single, QSS = joint) and the printed
 * hand-off above $100,000, and every cell of the 2025 Sales Tax Fairness Credit
 * tables (single 17 rows; joint 15 rows × 3; HOH 18 rows × 3) at both ends of
 * each income band. Assets parsed from MRS's 25_tax_tables.pdf and Schedule
 * PTFC/STFC p. 18.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "me-tax-table-2025.json"), "utf8")) as { rows: { atLeast: number; lessThan: number; single: number; mfj: number; hoh: number }[] };
const stfc = JSON.parse(readFileSync(path.join(import.meta.dirname, "me-stfc-tables-2025.json"), "utf8")) as { single: [number, number, number][]; mfj: [number, number, number, number, number][]; hoh: [number, number, number, number, number][] };
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf: "2025-12-31", target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const meTax = (taxable: number, filingStatus: string, schedule = false) => evalMoney("us.me.income_tax", { filingStatus, stateTaxableIncome: taxable, meUseRateSchedule: schedule });

describe("2025 Maine Income Tax Table — every row", () => {
  it("has the full table (1,000 contiguous $100 rows from $0 to $100,000)", () => {
    expect(table.rows.length).toBe(1000);
    expect(table.rows[0]).toEqual({ atLeast: 0, lessThan: 100, single: 3, mfj: 3, hoh: 3 });
    expect(table.rows[999]).toEqual({ atLeast: 99900, lessThan: 100000, single: 6638, mfj: 6238, hoh: 6384 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
  });

  it("reproduces every row at both ends for single, MFS, MFJ, QSS, and HOH", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast === 0 ? 50 : row.atLeast, row.lessThan - 1]) {
        // the booklet prints the first $100 as '0 50 0' and '50 100 3'; the standalone table's '0 100 3' is tested from $50
        const checks: [string, number][] = [["single", row.single], ["mfs", row.single], ["mfj", row.mfj], ["qss", row.mfj], ["hoh", row.hoh]];
        for (const [fs, printed] of checks) {
          const got = meTax(taxable, fs);
          if (got !== printed) bad.push(`${fs} ${taxable}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 120_000);

  it("applies the printed hand-off above $100,000 and the rate schedules when asked", () => {
    expect(meTax(100000, "single")).toBe(6638); // "6,638 plus 7.15% of excess over 100,000"
    expect(meTax(110000, "hoh")).toBe(6384 + 715); // "6,384 plus 7.15% of excess over 100,000"
    expect(meTax(100000, "mfj")).toBe(Math.round(3109 + 0.0675 * 46400)); // "See the tax rate schedule" → 6,241
    expect(meTax(100000, "single", true)).toBe(6641); // schedule: 4,028 + 7.15% × 36,550 = 6,641.325
    expect(meTax(26800, "single", true)).toBe(1554);
    expect(meTax(53600, "mfj", true)).toBe(3109);
    let maxDiff = 0;
    for (let x = 100; x < 100000; x += 997) for (const fs of ["single", "mfj", "hoh"]) maxDiff = Math.max(maxDiff, Math.abs(meTax(x, fs) - meTax(x, fs, true)));
    expect(maxDiff).toBeLessThanOrEqual(4); // the table prices the row midpoint, up to $50 away at 7.15%
  });
});

describe("2025 Maine Sales Tax Fairness Credit tables — every cell", () => {
  const credit = (fs: string, income: number, deps: number) => evalMoney("us.me.sales_tax_fairness_credit", { filingStatus: fs, meTotalIncome: income, meDependents13a: deps, isClaimedAsDependent: false });

  it("reproduces the single table at both ends of every band", () => {
    const bad: string[] = [];
    for (const [lo, hi, c] of stfc.single) for (const income of [lo, hi]) if (credit("single", income, 0) !== c) bad.push(`single ${income}: got ${credit("single", income, 0)}, printed ${c}`);
    expect(bad).toEqual([]);
  });

  it("reproduces the joint table (0 / 1 / 2+ dependents) for MFJ and QSS", () => {
    const bad: string[] = [];
    for (const [lo, hi, c0, c1, c2] of stfc.mfj)
      for (const income of [lo, hi])
        for (const fs of ["mfj", "qss"])
          for (const [deps, c] of [[0, c0], [1, c1], [2, c2], [5, c2]] as [number, number][]) if (credit(fs, income, deps) !== c) bad.push(`${fs} ${income} deps ${deps}: got ${credit(fs, income, deps)}, printed ${c}`);
    expect(bad, bad.slice(0, 8).join("\n")).toEqual([]);
  });

  it("reproduces the head of household table (0-1 / 2 / 3+ dependents)", () => {
    const bad: string[] = [];
    for (const [lo, hi, c01, c2, c3] of stfc.hoh)
      for (const income of [lo, hi])
        for (const [deps, c] of [[0, c01], [1, c01], [2, c2], [3, c3], [6, c3]] as [number, number][]) if (credit("hoh", income, deps) !== c) bad.push(`hoh ${income} deps ${deps}: got ${credit("hoh", income, deps)}, printed ${c}`);
    expect(bad, bad.slice(0, 8).join("\n")).toEqual([]);
  });
});
