/**
 * Filed-return parity gate for Nebraska: with neUseTaxTable the engine must
 * reproduce EVERY cell of the 2025 Nebraska Tax Table (777 rows × 4 columns,
 * "over lo / but not over hi") at both ends of each row, plus the printed
 * over-$77,760 worksheet; without it, the Tax Calculation Schedule's printed
 * anchors must reproduce at every bracket boundary. The table asset was parsed
 * from DOR's 2025_Tax_Tables.pdf.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Row {
  over: number;
  butNotOver: number;
  single: number;
  mfj: number;
  mfs: number;
  hoh: number;
}

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "ne-tax-table-2025.json"), "utf8")) as { rows: Row[] };
const corpus = getCorpus();

function neTax(taxable: number, filingStatus: string, useTable: boolean): number {
  const facts = coerceFacts(corpus, { filingStatus, stateTaxableIncome: taxable, neUseTaxTable: useTable });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ne.income_tax" });
  return Number((value as { cents: bigint }).cents) / 100;
}

describe("2025 Nebraska Tax Table — every cell (neUseTaxTable)", () => {
  it("has the full table (777 rows from $60 to $77,760)", () => {
    expect(table.rows.length).toBe(777);
    expect(table.rows[0]).toMatchObject({ over: 60, butNotOver: 160, single: 3, mfj: 3, mfs: 3, hoh: 3 });
    expect(table.rows[776]).toMatchObject({ over: 77660, butNotOver: 77760, single: 3563, mfj: 3085, mfs: 3563, hoh: 3274 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].over).toBe(table.rows[i - 1].butNotOver);
    expect(table.rows.every((r) => r.mfs === r.single)).toBe(true);
  });

  it("reproduces every row at both ends for all four columns", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.over + 1, row.butNotOver]) {
        const got = { single: neTax(taxable, "single", true), mfj: neTax(taxable, "mfj", true), mfs: neTax(taxable, "mfs", true), hoh: neTax(taxable, "hoh", true) };
        for (const col of ["single", "mfj", "mfs", "hoh"] as const) if (got[col] !== row[col]) bad.push(`${col} ${taxable}: got ${got[col]}, printed ${row[col]}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 120_000);

  it("routes a federal QSS to the joint column and applies the endpoint worksheet above $77,760", () => {
    expect(neTax(25325, "qss", true)).toBe(table.rows.find((r) => r.over === 25260)!.mfj);
    expect(neTax(77761, "single", true)).toBe(3566);
    expect(neTax(77761, "mfj", true)).toBe(3088);
    expect(neTax(77761, "hoh", true)).toBe(3276);
    expect(neTax(100000, "single", true)).toBe(3566 + Math.round(0.052 * 22240)); // 3,566 + 1,156.48 → 4,722
    expect(neTax(100000, "mfj", true)).toBe(4244);
  });
});

describe("2025 Nebraska Tax Calculation Schedule (default method)", () => {
  it("matches the printed anchors at every bracket floor and the exact rate above", () => {
    // single / MFS
    expect(neTax(4030, "single", false)).toBe(99); // 2.46% × 4,030 = 99.138
    expect(neTax(24120, "single", false)).toBe(804); // $804.30 anchor
    expect(neTax(38870, "mfs", false)).toBe(1543); // $1,543.28 anchor
    expect(neTax(100000, "single", false)).toBe(4722); // 1,543.28 + 5.2% × 61,130 = 4,722.04
    // MFJ / QSS
    expect(neTax(8040, "mfj", false)).toBe(198); // 197.784
    expect(neTax(48250, "qss", false)).toBe(1609); // $1,609.15
    expect(neTax(77730, "mfj", false)).toBe(3086); // $3,086.10
    expect(neTax(200000, "mfj", false)).toBe(9444);
    // HOH
    expect(neTax(7510, "hoh", false)).toBe(185); // 184.746
    expect(neTax(38590, "hoh", false)).toBe(1276); // $1,275.66
    expect(neTax(57630, "hoh", false)).toBe(2230); // $2,229.56
    expect(neTax(80000, "hoh", false)).toBe(3393); // 2,229.56 + 5.2% × 22,370 = 3,392.80 → 3,393 (the paper worksheet gives 3,392)
  });

  it("differs from the paper table by at most $3 across the table's range (the table prices the row midpoint, up to $50 away)", () => {
    let maxDiff = 0;
    for (let x = 100; x <= 77760; x += 1234) {
      for (const fs of ["single", "mfj", "hoh"]) maxDiff = Math.max(maxDiff, Math.abs(neTax(x, fs, false) - neTax(x, fs, true)));
    }
    expect(maxDiff).toBeLessThanOrEqual(3);
  });
});
