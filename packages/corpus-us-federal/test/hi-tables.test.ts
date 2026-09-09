/**
 * Filed-return parity gates for Hawaii: the engine must reproduce EVERY row of
 * the 2025 Hawaii Tax Table (2,000 $50 rows to $100,000) at both ends for all
 * three columns (plus MFS = single, QSS = joint), the printed hand-off to the
 * Tax Rate Schedules at $100,000, and the statutory food/excise credit table.
 * Table asset parsed from the 2025 Form N-11 Instructions pp. 35-47 and checked
 * cell-for-cell against DOTAX's standalone "2025 Tax Tables" (25table-on.pdf).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "hi-tax-table-2025.json"), "utf8")) as { rows: { atLeast: number; lessThan: number; single: number; mfj: number; hoh: number }[] };
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const hiTax = (taxable: number, filingStatus: string, schedule = false, asOf?: string) => evalMoney("us.hi.income_tax", { filingStatus, stateTaxableIncome: taxable, hiUseRateSchedule: schedule }, asOf);

describe("2025 Hawaii Tax Table — every row", () => {
  it("has the full table (2,000 contiguous $50 rows from $0 to $100,000)", () => {
    expect(table.rows.length).toBe(2000);
    expect(table.rows[0]).toEqual({ atLeast: 0, lessThan: 50, single: 0, mfj: 0, hoh: 0 });
    expect(table.rows[465]).toEqual({ atLeast: 23250, lessThan: 23300, single: 813, mfj: 399, hoh: 524 }); // the printed example: $23,275 joint → $399
    expect(table.rows[1999]).toEqual({ atLeast: 99950, lessThan: 100000, single: 6489, mfj: 5380, hoh: 5935 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
  });

  it("reproduces every row at both ends for single, MFS, MFJ, QSS, and HOH", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        const checks: [string, number][] = [["single", row.single], ["mfs", row.single], ["mfj", row.mfj], ["qss", row.mfj], ["hoh", row.hoh]];
        for (const [fs, printed] of checks) {
          const got = hiTax(taxable, fs);
          if (got !== printed) bad.push(`${fs} ${taxable}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 180_000);

  it("hands off to the Tax Rate Schedules at $100,000 and applies them when asked", () => {
    expect(hiTax(100000, "single")).toBe(2539 + Math.round(0.076 * 52000)); // Schedule I: $2,539 + 7.6% × 52,000 = 6,491
    expect(hiTax(100000, "mfj")).toBe(5078 + Math.round(0.076 * 4000)); // Schedule II: 5,382
    expect(hiTax(100000, "hoh")).toBe(3809 + Math.round(0.076 * 28000)); // Schedule III: 5,937
    expect(hiTax(400000, "single")).toBe(25966 + 0.11 * 75000); // 34,216
    expect(hiTax(700000, "mfj")).toBe(51932 + 0.1 * 0 + 0.11 * 50000); // 57,432
    expect(hiTax(500000, "hoh")).toBe(38949 + 0.11 * 12500); // 40,324
    expect(hiTax(9600, "single", true)).toBe(134);
    expect(hiTax(23275, "mfj", true)).toBe(399); // 269 + 3.2% × 4,075 = 399.40
    let maxDiff = 0;
    for (let x = 100; x < 100000; x += 997) for (const fs of ["single", "mfj", "hoh"]) maxDiff = Math.max(maxDiff, Math.abs(hiTax(x, fs) - hiTax(x, fs, true)));
    expect(maxDiff).toBeLessThanOrEqual(3); // the table prices the row midpoint, up to $25 away at 7.6%
  });

  it("keeps the 2025 schedules for TY2026 (Act 24, SLH 2026 begins with TY2027)", () => {
    expect(hiTax(50000, "single", false, "2026-12-31")).toBe(hiTax(50000, "single"));
    expect(hiTax(250000, "mfj", true, "2026-12-31")).toBe(16782);
    expect(() => hiTax(50000, "single", false, "2027-06-30")).toThrow();
  });
});

describe("2025 Hawaii refundable food/excise tax credit — every statutory cell", () => {
  const credit = (fs: string, agi: number, count = 1) => evalMoney("us.hi.food_excise_credit", { filingStatus: fs, hiFederalAgi: agi, hiSpouseFederalAgi: 0, hiFoodExciseQualifiedExemptions: count, isClaimedAsDependent: false });
  const single: [number, number, number][] = [[0, 14999, 220], [15000, 19999, 200], [20000, 24999, 170], [25000, 29999, 140], [30000, 39999, 110], [40000, 200000, 0]];
  const other: [number, number, number][] = [...single.slice(0, 5), [40000, 49999, 90], [50000, 59999, 70], [60000, 200000, 0]];
  it("reproduces the single table at both ends of every band", () => {
    for (const [lo, hi, c] of single) for (const agi of [lo, hi]) expect(credit("single", agi, 3), `single ${agi}`).toBe(3 * c);
  });
  it("reproduces the joint / HOH / QSS / MFS table at both ends of every band", () => {
    for (const fs of ["mfj", "hoh", "qss", "mfs"]) for (const [lo, hi, c] of other) for (const agi of [lo, hi]) expect(credit(fs, agi, 2), `${fs} ${agi}`).toBe(2 * c);
  });
});
