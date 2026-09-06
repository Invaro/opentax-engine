/**
 * Filed-return parity gate for Kansas: the engine must reproduce EVERY printed
 * row of the 2025 Kansas Tax Table (booklet pp. 27-33: 2,000 rows × 2
 * columns, 'at least / but not more than', inclusive both ends) at both ends
 * of each row, plus the printed Tax Computation Worksheet above $100,000.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Row {
  atLeast: number;
  notMoreThan: number;
  singleHohMfs: number;
  mfj: number;
}

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "ks-tax-table-2025.json"), "utf8")) as { rows: Row[] };
const corpus = getCorpus();

function ksTax(taxable: number, filingStatus: string, formula = false): number {
  const facts = coerceFacts(corpus, { filingStatus, stateTaxableIncome: taxable, useFormulaMethod: formula });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ks.income_tax" });
  return Number((value as { cents: bigint }).cents) / 100;
}

describe("2025 Kansas Tax Table — every printed row, both columns", () => {
  it("has the full table (2,000 rows from $26 to $100,000)", () => {
    expect(table.rows.length).toBe(2000);
    expect(table.rows[0]).toMatchObject({ atLeast: 26, notMoreThan: 50 });
    expect(table.rows[1999]).toMatchObject({ atLeast: 99951, notMoreThan: 100000 });
  });

  it("reproduces every row at both inclusive ends", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.notMoreThan]) {
        const s = ksTax(taxable, "single");
        const j = ksTax(taxable, "mfj");
        if (s !== row.singleHohMfs) bad.push(`single ${taxable}: got ${s}, printed ${row.singleHohMfs}`);
        if (j !== row.mfj) bad.push(`mfj ${taxable}: got ${j}, printed ${row.mfj}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("routes HOH, MFS, and a federal QSS to the single column", () => {
    const row = table.rows.find((r) => r.atLeast === 29951)!;
    expect(ksTax(30000, "hoh")).toBe(row.singleHohMfs);
    expect(ksTax(30000, "mfs")).toBe(row.singleHohMfs);
    expect(ksTax(30000, "qss")).toBe(row.singleHohMfs);
    expect(row.singleHohMfs).not.toBe(row.mfj);
  });

  it("uses the printed Tax Computation Worksheet above $100,000 and the exact schedule under useFormulaMethod", () => {
    expect(ksTax(150000, "mfj")).toBe(8195); // 8,370 − 175
    expect(ksTax(150000, "single")).toBe(8283); // 8,370 − 87
    expect(ksTax(100010, "single")).toBe(5494); // printed constant
    expect(ksTax(100010, "single", true)).toBe(5493); // exact schedule
    expect(ksTax(25, "single")).toBe(1); // no printed row under $26: exact 5.2% x 25 = 1.30
    expect(ksTax(9, "single")).toBe(0);
  });
});
