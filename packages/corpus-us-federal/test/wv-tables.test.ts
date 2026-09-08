/**
 * Filed-return parity gates for West Virginia: the engine must reproduce
 * EVERY row of the 2025 West Virginia Tax Table (1,702 rows, "At Least / But
 * Less Than") at both ends of each row for the four table statuses, and every
 * cell of the 2025 Family Tax Credit tables (2 tables × 8 family sizes × 11
 * rows) at both ends of each band. Both assets were parsed from the 2025
 * booklet (pp. 36-40 and p. 12).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "wv-tax-table-2025.json"), "utf8")) as { rows: { atLeast: number; lessThan: number; tax: number }[] };
const ftc = JSON.parse(readFileSync(path.join(import.meta.dirname, "wv-ftc-tables-2025.json"), "utf8")) as { table1: Record<string, [number, number | null, number][]>; table2: Record<string, [number, number | null, number][]> };
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf: "2025-12-31", target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const wvTax = (taxable: number, filingStatus: string, schedule = false) => evalMoney("us.wv.income_tax", { filingStatus, stateTaxableIncome: taxable, wvUseRateSchedule: schedule });

describe("2025 West Virginia Tax Table — every row", () => {
  it("has the full table (1,702 contiguous rows from $25 to $100,000)", () => {
    expect(table.rows.length).toBe(1702);
    expect(table.rows[0]).toEqual({ atLeast: 25, lessThan: 50, tax: 1 });
    expect(table.rows[1701]).toEqual({ atLeast: 99950, lessThan: 100000, tax: 3980 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
  });

  it("reproduces every row at both ends for single, HOH, MFJ, and widow(er)", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        for (const fs of ["single", "hoh", "mfj", "qss"]) {
          const got = wvTax(taxable, fs);
          if (got !== row.tax) bad.push(`${fs} ${taxable}: got ${got}, printed ${row.tax}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 120_000);

  it("MFS never uses the table, $100,000 and up uses Schedule I, and the schedule differs from the table by at most $2", () => {
    expect(wvTax(12345, "mfs")).toBe(328); // $111 + 2.96% × 7,345 = 328.41
    expect(wvTax(100000, "single")).toBe(3982); // 2,053.50 + 4.82% × 40,000 = 3,981.50
    expect(wvTax(117635, "mfj")).toBe(4832); // booklet example
    expect(wvTax(118460, "mfs")).toBe(5291); // booklet example
    let maxDiff = 0;
    for (let x = 100; x < 100000; x += 977) maxDiff = Math.max(maxDiff, Math.abs(wvTax(x, "single") - wvTax(x, "single", true)));
    expect(maxDiff).toBeLessThanOrEqual(2);
  });
});

describe("2025 West Virginia Family Tax Credit tables — every cell", () => {
  it("reproduces both tables at both ends of every band (credit on a $1,000 tax = the percentage × $10)", () => {
    const bad: string[] = [];
    for (const [name, fs] of [["table1", "mfj"], ["table2", "mfs"]] as const) {
      for (const size of Object.keys(ftc[name])) {
        for (const [lo, hi, pct] of ftc[name][size]) {
          const probes = hi === null ? [lo + 1, lo + 100000] : [lo + 1, hi]; // 'Greater Than' exclusive, 'Equal To or Less Than' inclusive
          for (const mfagi of probes) {
            const got = evalMoney("us.wv.family_tax_credit", { filingStatus: fs, wvFamilySize: Number(size), wvModifiedAgi: mfagi, wvTaxBeforeCredits: 1000, wvFederalAmt: false });
            if (got !== pct * 10) bad.push(`${name} size ${size} MFAGI ${mfagi}: got ${got}, table ${pct}%`);
          }
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("table ceilings are the 2025 poverty guideline ($15,650 + $5,500 per person) and Table 2 is half", () => {
    for (let n = 1; n <= 8; n++) {
      expect(ftc.table1[String(n)][0][1]).toBe(15650 + 5500 * (n - 1));
      expect(ftc.table2[String(n)][0][1]).toBe((15650 + 5500 * (n - 1)) / 2);
    }
  });
});
