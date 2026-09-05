/**
 * Filed-return parity gate for Connecticut: the DRS 2025 income tax tables
 * (CT AGI to $102,000, "all exemptions and credits are included") have no
 * text layer, so 40 rows across all 10 pages were transcribed by eye by two
 * independent readers; the engine's table method must reproduce every one of
 * those 160 cells at both edges of the "more than / less than or equal to"
 * band. The Tax Calculation Schedule's own printed examples gate the
 * schedule method.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Row {
  moreThan: number;
  lessThanOrEqual: number;
  single: number;
  mfj: number;
  mfs: number;
  hoh: number;
}

const cells = JSON.parse(readFileSync(path.join(import.meta.dirname, "ct-tax-table-2025-cells.json"), "utf8")) as { rows: Row[] };
const corpus = getCorpus();

function ctTax(agi: number, filingStatus: string, table: boolean): number {
  const facts = coerceFacts(corpus, { filingStatus, ctAgi: agi, ctUseTaxTable: table });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ct.income_tax" });
  return Number((value as { cents: bigint }).cents) / 100;
}

describe("2025 Connecticut income tax tables — transcribed rows, all four columns", () => {
  it("has the transcribed sample (40 rows spanning $12,000-$102,000)", () => {
    expect(cells.rows.length).toBe(40);
  });

  it("reproduces every transcribed cell just above the low bound and at the high bound", () => {
    const bad: string[] = [];
    for (const row of cells.rows) {
      for (const agi of [row.moreThan + 1, row.lessThanOrEqual]) {
        const got = { single: ctTax(agi, "single", true), mfj: ctTax(agi, "mfj", true), mfs: ctTax(agi, "mfs", true), hoh: ctTax(agi, "hoh", true) };
        for (const k of ["single", "mfj", "mfs", "hoh"] as const) {
          if (got[k] !== row[k]) bad.push(`${k} ${agi}: got ${got[k]}, printed ${row[k]}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("QSS uses the MFJ column of the tables", () => {
    expect(ctTax(100025, "qss", true)).toBe(3961);
  });
});

describe("2025 Connecticut Tax Calculation Schedule — the booklet's printed Table B examples", () => {
  // Table B is evaluated on taxable income = AGI − exemption; at these AGIs
  // the exemption is $0, so the printed line 4 examples apply directly, with
  // Tables C, D added and Table E at .00
  it("single $525,000 -> $32,998 + $250 + $3,200", () => {
    expect(ctTax(525000, "single", false)).toBe(36448);
  });
  it("MFJ $1,100,000 -> $69,490 + $500 + $6,800", () => {
    expect(ctTax(1100000, "mfj", false)).toBe(76790);
  });
  it("HOH $825,000 -> $51,748 + $400 + $4,920", () => {
    expect(ctTax(825000, "hoh", false)).toBe(57068);
  });
  it("zero tax at the no-tax thresholds for every status", () => {
    expect(ctTax(15000, "single", false)).toBe(0);
    expect(ctTax(24000, "mfj", false)).toBe(0);
    expect(ctTax(12000, "mfs", false)).toBe(0);
    expect(ctTax(19000, "hoh", false)).toBe(0);
  });
});
