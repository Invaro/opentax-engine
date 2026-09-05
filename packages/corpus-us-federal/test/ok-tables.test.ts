/**
 * Filed-return parity gates for Oklahoma: the engine must reproduce EVERY
 * printed row of (1) the 2025 Oklahoma Income Tax Table (Form 511 packet
 * pp. 27-38, 2,000 rows × 2 columns) and (2) the 2020 Earned Income Credit
 * table printed in the 2025 Form 511-EIC (1,129 rows × 8 columns plus the 8
 * footnoted partial bands). Both JSON assets were text-extracted from the
 * official PDFs (see each file's `source`).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface TaxRow {
  atLeast: number;
  lessThan: number;
  singleMfs: number;
  jointHoh: number;
}
interface EicRow {
  atLeast: number;
  lessThan: number;
  other: number[];
  mfj: number[];
}
interface EicFootnote {
  atLeast: number;
  lessThan: number;
  children: number;
  mfj: boolean;
  credit: number;
}

const taxTable = JSON.parse(readFileSync(path.join(import.meta.dirname, "ok-tax-table-2025.json"), "utf8")) as {
  rows: TaxRow[];
  over100kAnchors: { singleMfs: number; jointHoh: number };
};
const eicTable = JSON.parse(readFileSync(path.join(import.meta.dirname, "ok-eic-2020-table.json"), "utf8")) as {
  rows: EicRow[];
  footnotes: EicFootnote[];
  starredRows: { atLeast: number; lessThan: number; other: (number | null)[]; mfj: (number | null)[] }[];
};

const corpus = getCorpus();
const dollars = (cents: bigint): number => Number(cents) / 100;

function okTax(taxable: number, filingStatus: string): number {
  const facts = coerceFacts(corpus, { filingStatus, stateTaxableIncome: taxable });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ok.income_tax" });
  return dollars((value as { cents: bigint }).cents);
}

function eic2020(earned: number, agi: number, children: number, filingStatus: string): number {
  const facts = coerceFacts(corpus, {
    filingStatus,
    okEicEligible: true,
    okEicQualifyingChildren: children,
    okEicEarnedIncome: earned,
    okEicAgi: agi,
  });
  const { value } = evaluate(corpus, facts, { asOf: "2025-12-31", target: "us.ok.eic_2020_rules" });
  return dollars((value as { cents: bigint }).cents);
}

describe("2025 Oklahoma Income Tax Table — every printed row, both columns", () => {
  it("has the full table (2,000 rows of $50 from $0 to $100,000)", () => {
    expect(taxTable.rows.length).toBe(2000);
  });

  it("reproduces every row at the low edge and one dollar under the high edge", () => {
    const bad: string[] = [];
    for (const row of taxTable.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        const s = okTax(taxable, "single");
        const j = okTax(taxable, "mfj");
        if (s !== row.singleMfs) bad.push(`single ${taxable}: got ${s}, printed ${row.singleMfs}`);
        if (j !== row.jointHoh) bad.push(`mfj ${taxable}: got ${j}, printed ${row.jointHoh}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("uses the joint column for MFS? no — MFS shares the single column; HOH and QSS share the joint column", () => {
    const row = taxTable.rows.find((r) => r.atLeast === 14750)!; // the packet's Jones example row
    expect(okTax(14793, "mfs")).toBe(row.singleMfs);
    expect(okTax(14793, "hoh")).toBe(row.jointHoh);
    expect(okTax(14793, "qss")).toBe(row.jointHoh);
    expect(row.jointHoh).toBe(325);
  });

  it("matches the printed $100,000 worksheet anchors and continues at 4.75%", () => {
    expect(okTax(100000, "single")).toBe(taxTable.over100kAnchors.singleMfs);
    expect(okTax(100000, "mfj")).toBe(taxTable.over100kAnchors.jointHoh);
    expect(okTax(150000, "single")).toBe(taxTable.over100kAnchors.singleMfs + 2375);
    expect(okTax(150000, "hoh")).toBe(taxTable.over100kAnchors.jointHoh + 2375);
  });
});

describe("2020 EIC table as printed in the 2025 Form 511-EIC — every printed row and footnote", () => {
  it("has the full table (1,129 unfootnoted rows)", () => {
    expect(eicTable.rows.length).toBe(1129);
  });

  it("reproduces every row for 0-3 children, both filing-status columns, at both band edges", () => {
    const bad: string[] = [];
    for (const row of eicTable.rows) {
      for (const amount of [row.atLeast, row.lessThan - 1]) {
        for (let k = 0; k < 4; k++) {
          // AGI = the looked-up amount, so the AGI test never binds below the earned-income look-up
          const o = eic2020(amount, amount, k, "single");
          const m = eic2020(amount, amount, k, "mfj");
          if (o !== row.other[k]) bad.push(`other k=${k} ${amount}: got ${o}, printed ${row.other[k]}`);
          if (m !== row.mfj[k]) bad.push(`mfj k=${k} ${amount}: got ${m}, printed ${row.mfj[k]}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("reproduces the other seven printed cells of each footnoted row (the starred cell is covered by the footnote test)", () => {
    expect(eicTable.starredRows.length).toBe(8);
    for (const row of eicTable.starredRows) {
      for (let k = 0; k < 4; k++) {
        if (row.other[k] !== null) expect(eic2020(row.atLeast, row.atLeast, k, "single"), `other k=${k} ${row.atLeast}`).toBe(row.other[k]);
        if (row.mfj[k] !== null) expect(eic2020(row.atLeast, row.atLeast, k, "mfj"), `mfj k=${k} ${row.atLeast}`).toBe(row.mfj[k]);
      }
    }
  });

  it("reproduces the eight footnoted partial bands and the zero beyond them", () => {
    for (const f of eicTable.footnotes) {
      const status = f.mfj ? "mfj" : "single";
      expect(eic2020(f.atLeast, f.atLeast, f.children, status), `${status} k=${f.children} at ${f.atLeast}`).toBe(f.credit);
      expect(eic2020(f.lessThan - 1, f.lessThan - 1, f.children, status), `${status} k=${f.children} at ${f.lessThan - 1}`).toBe(f.credit);
      expect(eic2020(f.lessThan, f.lessThan, f.children, status), `${status} k=${f.children} at ${f.lessThan}`).toBe(0);
    }
  });

  it("applies the AGI look-up only from the phase-out row and takes the smaller amount", () => {
    // single, one child, earned income on the plateau; AGI $30,000 → phase-out row
    const plateau = eic2020(15000, 15000, 1, "single");
    expect(plateau).toBe(3584);
    expect(eic2020(15000, 30000, 1, "single")).toBe(eic2020(30000, 30000, 1, "single"));
    expect(eic2020(15000, 30000, 1, "single")).toBe(1875);
    // AGI under the $19,350 row: earned income alone controls
    expect(eic2020(15000, 19000, 1, "single")).toBe(3584);
    // HOH and QSS use the 'other' column; MFS gets nothing
    expect(eic2020(2455, 2455, 1, "hoh")).toBe(842); // the form's own example
    expect(eic2020(2455, 2455, 1, "qss")).toBe(842);
    expect(eic2020(2455, 2455, 1, "mfs")).toBe(0);
  });
});
