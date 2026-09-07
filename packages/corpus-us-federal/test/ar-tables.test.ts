/**
 * Filed-return parity gate for Arkansas: the engine must reproduce EVERY row
 * of the 2025 Regular Income Tax Table (booklet pp. 26-30: 950 rows, 'As Much
 * As' inclusive / 'But Less Than' exclusive) at both ends of each row and for
 * every whole dollar, the printed '$3,809 + 3.9%' rule above the table, and
 * every row of the five 2025 Low Income Tax Tables (pp. 24-25, inclusive
 * FROM/TO on AGI) at both ends. Both assets were parsed from the booklet and
 * cross-checked byte-for-byte against DFA's standalone 2025 Tax Tables sheet.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate, NotModeledError } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface RegularRow {
  asMuchAs: number;
  butLessThan: number;
  tax: number;
}
interface LowRow {
  from: number;
  to: number;
  tax: number;
}

const regular = JSON.parse(readFileSync(path.join(import.meta.dirname, "ar-regular-table-2025.json"), "utf8")) as { rows: RegularRow[] };
const low = JSON.parse(readFileSync(path.join(import.meta.dirname, "ar-low-income-tables-2025.json"), "utf8")) as {
  tables: Record<string, { caption: string; rows: LowRow[] }>;
};
const corpus = getCorpus();

function arTax(taxable: number, filingStatus = "single"): number {
  const facts = coerceFacts(corpus, { filingStatus, stateTaxableIncome: taxable });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ar.income_tax" });
  return Number((value as { cents: bigint }).cents) / 100;
}

function lowTax(agi: number, filingStatus: string, dependents: number, status4 = false): number {
  const facts = coerceFacts(corpus, { filingStatus, arAgi: agi, arDependents: dependents, arStatus4: status4 });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ar.low_income_tax" });
  return Number((value as { cents: bigint }).cents) / 100;
}

describe("2025 Arkansas Regular Income Tax Table — every printed row", () => {
  it("has the full table (950 rows from $0 to $100,001)", () => {
    expect(regular.rows.length).toBe(950);
    expect(regular.rows[0]).toMatchObject({ asMuchAs: 0, butLessThan: 5100, tax: 0 });
    expect(regular.rows[949]).toMatchObject({ asMuchAs: 99901, butLessThan: 100001, tax: 3809 });
    // the row boundaries shift by $1 at $75,001
    expect(regular.rows.find((r) => r.asMuchAs === 74900)).toMatchObject({ butLessThan: 75001, tax: 2503 });
    expect(regular.rows.find((r) => r.asMuchAs === 75001)).toMatchObject({ butLessThan: 75101, tax: 2507 });
    for (let i = 1; i < regular.rows.length; i++) expect(regular.rows[i].asMuchAs).toBe(regular.rows[i - 1].butLessThan === 75001 ? 75001 : regular.rows[i - 1].butLessThan);
  });

  it("reproduces every row at both ends", () => {
    const bad: string[] = [];
    for (const row of regular.rows) {
      for (const taxable of [row.asMuchAs, row.butLessThan - 1]) {
        const got = arTax(taxable);
        if (got !== row.tax) bad.push(`${taxable}: got ${got}, printed ${row.tax}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("reproduces the table for every whole dollar from $1 to $100,000", () => {
    const bad: string[] = [];
    let i = 0;
    for (let x = 1; x <= 100000; x++) {
      while (regular.rows[i].butLessThan <= x) i++;
      const got = arTax(x);
      if (got !== regular.rows[i].tax) bad.push(`${x}: got ${got}, printed ${regular.rows[i].tax}`);
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("is the same table for every filing status", () => {
    for (const fs of ["mfj", "hoh", "mfs", "qss"]) {
      expect(arTax(30000, fs)).toBe(752);
      expect(arTax(96000, fs)).toBe(arTax(96000));
    }
  });

  it("applies '$3,809 + 3.9% of the excess over $100,000' above the table", () => {
    expect(arTax(100001)).toBe(3809); // 3,809.04
    expect(arTax(100013)).toBe(3810); // 3,809.51
    expect(arTax(150000)).toBe(5759);
    expect(arTax(1000000)).toBe(38909);
  });

  it("matches DFA's own midpoint examples", () => {
    expect(arTax(75950)).toBe(2542); // Example 1: $75,900-$76,000 row
    expect(arTax(14850)).toBe(222); // Example 2: $14,800-$14,900 row
  });
});

describe("2025 Arkansas Low Income Tax Tables — every printed row", () => {
  const cases: { key: string; filingStatus: string; dependents: number; rows: number; last: number }[] = [
    { key: "single", filingStatus: "single", dependents: 0, rows: 29, last: 17500 },
    { key: "hoh1", filingStatus: "hoh", dependents: 1, rows: 45, last: 25300 },
    { key: "hoh2", filingStatus: "hoh", dependents: 2, rows: 42, last: 29000 },
    { key: "mfj1", filingStatus: "mfj", dependents: 1, rows: 44, last: 29000 },
    { key: "mfj2", filingStatus: "mfj", dependents: 2, rows: 64, last: 36100 },
  ];

  for (const tc of cases) {
    it(`${low.tables[tc.key].caption}: ${tc.rows} rows, both ends, zero row, and the cutoff`, () => {
      const rows = low.tables[tc.key].rows;
      expect(rows.length).toBe(tc.rows);
      expect(rows[rows.length - 1].to).toBe(tc.last);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].from).toBe(rows[i - 1].to + 1);
        expect(rows[i].tax).toBeGreaterThan(rows[i - 1].tax);
      }
      const bad: string[] = [];
      for (const row of rows) {
        for (const agi of [row.from, row.to]) {
          const got = lowTax(agi, tc.filingStatus, tc.dependents);
          if (got !== row.tax) bad.push(`${tc.key} ${agi}: got ${got}, printed ${row.tax}`);
        }
      }
      expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
      expect(lowTax(rows[0].from - 1, tc.filingStatus, tc.dependents)).toBe(0);
      expect(lowTax(0, tc.filingStatus, tc.dependents)).toBe(0);
      expect(() => lowTax(tc.last + 1, tc.filingStatus, tc.dependents)).toThrow(NotModeledError);
    });
  }

  it("shares the HOH tables with a federal QSS (Arkansas status 6) and picks the column by dependents", () => {
    expect(lowTax(22550, "qss", 0)).toBe(227);
    expect(lowTax(22550, "qss", 1)).toBe(227);
    expect(lowTax(26350, "qss", 2)).toBe(280);
    expect(lowTax(26350, "hoh", 5)).toBe(280);
  });

  it("refuses statuses 4 and 5", () => {
    expect(() => lowTax(15000, "mfs", 0)).toThrow(NotModeledError);
    expect(() => lowTax(20000, "mfj", 0, true)).toThrow(NotModeledError);
  });

  it("MFJ with no or one dependent uses the smaller table; two or more the larger", () => {
    expect(lowTax(28950, "mfj", 0)).toBe(524);
    expect(lowTax(28950, "mfj", 1)).toBe(524);
    expect(() => lowTax(30000, "mfj", 1)).toThrow(NotModeledError);
    expect(lowTax(30000, "mfj", 2)).toBe(132);
  });
});
