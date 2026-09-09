/**
 * Filed-return parity gates for Rhode Island: the engine must reproduce EVERY
 * row of the 2025 RI Tax Table (2,000 $50 rows to $100,000) at both ends, for
 * every filing status — Rhode Island prints ONE column, "TAX RATES APPLICABLE
 * TO ALL FILING STATUS TYPES" — plus the printed hand-off to the Tax
 * Computation Worksheet at $100,000 and the two phase-out worksheets.
 *
 * Table asset parsed from the Division's standalone "2025 RI Tax Tables"
 * (pages T-2 to T-7). The convention proved on all 2,000 printed cells is the
 * Tax Computation Worksheet arithmetic evaluated at the row midpoint
 * (at least + $25), rounded half-up — with exactly one printed exception: the
 * first row, 0 to 50, prints $0 where the midpoint rule would give $1.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "ri-tax-table-2025.json"), "utf8")) as { rows: { atLeast: number; lessThan: number; tax: number }[] };
const corpus = getCorpus();
const STATUSES = ["single", "mfj", "mfs", "hoh", "qss"];

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const riTax = (taxable: number, filingStatus: string, schedule = false, asOf?: string) =>
  evalMoney("us.ri.income_tax", { filingStatus, stateTaxableIncome: taxable, riUseRateSchedule: schedule }, asOf);

describe("2025 Rhode Island Tax Table — every row", () => {
  it("has the full table (2,000 contiguous $50 rows from $0 to $100,000)", () => {
    expect(table.rows.length).toBe(2000);
    expect(table.rows[0]).toEqual({ atLeast: 0, lessThan: 50, tax: 0 }); // printed $0, not the midpoint's $1
    expect(table.rows[1]).toEqual({ atLeast: 50, lessThan: 100, tax: 3 });
    expect(table.rows[506]).toEqual({ atLeast: 25300, lessThan: 25350, tax: 950 }); // the booklet's own worked EXAMPLE
    expect(table.rows[1999]).toEqual({ atLeast: 99950, lessThan: 100000, tax: 3950 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].tax).toBeGreaterThanOrEqual(table.rows[i - 1].tax);
  });

  it("reproduces every printed row at both ends, for every filing status", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        for (const fs of STATUSES) {
          const got = riTax(taxable, fs);
          if (got !== row.tax) bad.push(`${fs} ${taxable}: got ${got}, printed ${row.tax}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 300_000);

  it("prices the first row at the printed $0 rather than the midpoint's $1", () => {
    for (const fs of STATUSES) {
      expect(riTax(0, fs)).toBe(0);
      expect(riTax(49, fs)).toBe(0);
      expect(riTax(50, fs)).toBe(3);
      expect(riTax(25, fs, true)).toBe(1); // the worksheet arithmetic itself: 25 × 3.75% = 0.94 → $1
    }
  });

  it("hands off to the Tax Computation Worksheet at $100,000 and applies it when asked", () => {
    // (a) × (b) − (d), one half-up rounding: $0.00 / $799.00 / $3,051.46
    expect(riTax(100000, "single")).toBe(Math.round(100000 * 0.0475 - 799)); // 3,951
    expect(riTax(150000, "mfj")).toBe(Math.round(150000 * 0.0475 - 799)); // 6,326
    expect(riTax(181650, "hoh")).toBe(Math.round(181650 * 0.0475 - 799)); // 7,829
    expect(riTax(200000, "single")).toBe(Math.round(200000 * 0.0599 - 3051.46)); // 8,928
    expect(riTax(1000000, "mfj")).toBe(Math.round(1000000 * 0.0599 - 3051.46)); // 56,849
    // the worksheet is filing-status blind
    for (const fs of STATUSES) expect(riTax(250000, fs)).toBe(riTax(250000, "single"));
    // riUseRateSchedule applies the worksheet arithmetic below $100,000 too; the
    // table prices the midpoint, so it can sit up to ~$1.19 away at 4.75%
    let maxDiff = 0;
    for (let x = 100; x < 100000; x += 997) maxDiff = Math.max(maxDiff, Math.abs(riTax(x, "single") - riTax(x, "single", true)));
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  it("keeps the table below $100,000 and the worksheet at and above it", () => {
    expect(riTax(99999, "single")).toBe(3950); // last printed row
    expect(riTax(100000, "single")).toBe(3951); // worksheet takes over
  });

  it("uses the TY2026 schedule for TY2026 and refuses outside the corpus window", () => {
    expect(riTax(50000, "single", true, "2026-12-31")).toBe(Math.round(50000 * 0.0375)); // 1,875
    expect(riTax(100000, "single", false, "2026-12-31")).toBe(Math.round(100000 * 0.0475 - 820.5)); // 3,930
    expect(riTax(200000, "single", false, "2026-12-31")).toBe(Math.round(200000 * 0.0599 - 3132.48)); // 8,848
    expect(riTax(90000, "single", false, "2026-12-31")).not.toBe(riTax(90000, "single")); // 2026 brackets differ
    expect(() => riTax(50000, "single", false, "2027-06-30")).toThrow();
  });
});

describe("2025 Rhode Island standard deduction and exemption phase-outs — the printed worksheets", () => {
  const deduction = (filingStatus: string, riModifiedAgi: number, asOf?: string) => evalMoney("us.ri.standard_deduction", { filingStatus, riModifiedAgi }, asOf);
  const exemption = (riExemptions: number, riModifiedAgi: number, asOf?: string) => evalMoney("us.ri.exemption", { filingStatus: "single", riExemptions, riModifiedAgi }, asOf);

  it("pays the full amount at and below the $254,250 threshold", () => {
    expect(deduction("single", 0)).toBe(10900);
    expect(deduction("mfj", 254250)).toBe(21800);
    expect(deduction("qss", 254250)).toBe(21800);
    expect(deduction("mfs", 254250)).toBe(10900);
    expect(deduction("hoh", 254250)).toBe(16350);
    expect(exemption(3, 254250)).toBe(15300);
  });

  it("steps down 20 points per $7,250 or fraction, and zeroes only above $283,250", () => {
    const steps: [number, number][] = [
      [254251, 0.8], // any cent over the threshold is step 1
      [261500, 0.8], // exactly 1 step
      [261501, 0.6],
      [268750, 0.6],
      [276000, 0.4],
      [283250, 0.2], // line 5 = 29,000, which is NOT "more than $29,000"
    ];
    for (const [agi, pct] of steps) expect(deduction("single", agi), `agi ${agi}`).toBe(Math.round(10900 * pct));
    expect(deduction("single", 283251)).toBe(0);
    expect(deduction("mfj", 300000)).toBe(0);
    expect(exemption(4, 283250)).toBe(Math.round(4 * 5100 * 0.2));
    expect(exemption(4, 283251)).toBe(0);
  });

  it("moves to the TY2026 amounts and the $261,000 / $7,450 phase-out", () => {
    expect(deduction("single", 0, "2026-12-31")).toBe(11200);
    expect(deduction("mfj", 261000, "2026-12-31")).toBe(22400);
    expect(deduction("hoh", 261001, "2026-12-31")).toBe(Math.round(16800 * 0.8));
    expect(deduction("single", 290800, "2026-12-31")).toBe(Math.round(11200 * 0.2));
    expect(deduction("single", 290801, "2026-12-31")).toBe(0);
    expect(exemption(2, 0, "2026-12-31")).toBe(10500);
  });
});
