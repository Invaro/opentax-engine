/**
 * Filed-return parity gate for New Mexico: the engine must reproduce EVERY cell
 * of the 2025 Tax Rate Table (PIT-TRT: 1,001 rows × 4 columns, "more than lo /
 * but not over hi") at both ends of each row, the printed over-$100,000
 * worksheet, and every cell of the 2025 PIT-RC Tables 1-4 (LICTR, maximum
 * property tax liability, county rebate percentage, child income tax credit).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Row {
  moreThan: number;
  butNotOver: number;
  single: number;
  mfj: number;
  mfs: number;
  hoh: number;
}

const trt = JSON.parse(readFileSync(path.join(import.meta.dirname, "nm-tax-rate-table-2025.json"), "utf8")) as { rows: Row[] };
const rc = JSON.parse(readFileSync(path.join(import.meta.dirname, "nm-rc-tables-2025.json"), "utf8")) as {
  lictr: number[][];
  propertyTaxLiability: number[][];
  countyRebatePct: number[][];
  childCredit: [number, number | null, number][];
};
const corpus = getCorpus();

function ev(target: string, facts: Record<string, unknown>): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf: "2025-12-31", target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const nmTax = (taxable: number, filingStatus: string): number => ev("us.nm.income_tax", { filingStatus, stateTaxableIncome: taxable });

describe("2025 New Mexico Tax Rate Table — every cell", () => {
  it("has the full table (1,001 rows from $0 to $100,000)", () => {
    expect(trt.rows.length).toBe(1001);
    expect(trt.rows[0]).toMatchObject({ moreThan: 0, butNotOver: 60, single: 0, mfj: 0, mfs: 0, hoh: 0 });
    expect(trt.rows[1]).toMatchObject({ moreThan: 60, butNotOver: 100, single: 1 });
    expect(trt.rows[1000]).toMatchObject({ moreThan: 99900, butNotOver: 100000, single: 4356, mfj: 4087, mfs: 4492, hoh: 4087 });
    for (let i = 1; i < trt.rows.length; i++) expect(trt.rows[i].moreThan).toBe(trt.rows[i - 1].butNotOver);
    expect(trt.rows.every((r) => r.hoh === r.mfj)).toBe(true);
  });

  it("reproduces every row at both ends for all four columns", () => {
    const bad: string[] = [];
    for (const row of trt.rows) {
      for (const taxable of [row.moreThan + 1, row.butNotOver]) {
        const got = { single: nmTax(taxable, "single"), mfj: nmTax(taxable, "mfj"), mfs: nmTax(taxable, "mfs"), hoh: nmTax(taxable, "hoh") };
        for (const col of ["single", "mfj", "mfs", "hoh"] as const) if (got[col] !== row[col]) bad.push(`${col} ${taxable}: got ${got[col]}, printed ${row[col]}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 120_000);

  it("routes a federal QSS to the joint column and matches the Brown worked example", () => {
    const row = trt.rows.find((r) => r.moreThan === 25300)!;
    expect(row.mfj).toBe(679);
    expect(nmTax(25325, "qss")).toBe(679);
    expect(nmTax(25325, "mfj")).toBe(679);
    expect(nmTax(25325, "hoh")).toBe(679);
    expect(nmTax(25325, "single")).toBe(row.single);
  });

  it("applies the printed over-$100,000 worksheet and the exact statute under useFormulaMethod", () => {
    expect(nmTax(100001, "single")).toBe(4356);
    expect(nmTax(150000, "single")).toBe(6806);
    expect(nmTax(210000, "single")).toBe(9746);
    expect(nmTax(300000, "single")).toBe(15056);
    expect(nmTax(150000, "mfj")).toBe(6537);
    expect(nmTax(400000, "hoh")).toBe(19637);
    expect(nmTax(157500, "mfs")).toBe(7310);
    expect(nmTax(200000, "mfs")).toBe(9818);
    expect(ev("us.nm.income_tax", { filingStatus: "single", stateTaxableIncome: 150000, useFormulaMethod: true })).toBe(6808);
    expect(ev("us.nm.income_tax", { filingStatus: "mfj", stateTaxableIncome: 400000, useFormulaMethod: true })).toBe(19639);
  });
});

describe("2025 PIT-RC tables — every cell", () => {
  it("LICTR Table 1: 23 rows × 6 columns at both ends, MFS halves", () => {
    expect(rc.lictr.length).toBe(23);
    const bad: string[] = [];
    for (const row of rc.lictr) {
      for (const mgi of [row[0], row[1]]) {
        for (let ex = 1; ex <= 7; ex++) {
          const printed = row[Math.min(ex, 6) + 1];
          const got = ev("us.nm.lictr", { filingStatus: "single", nmModifiedGrossIncome: mgi, nmRebateExemptions: ex });
          if (got !== printed) bad.push(`mgi ${mgi} ex ${ex}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
    expect(ev("us.nm.lictr", { filingStatus: "single", nmModifiedGrossIncome: 36001, nmRebateExemptions: 3 })).toBe(0);
    expect(ev("us.nm.lictr", { filingStatus: "mfs", nmModifiedGrossIncome: 500, nmRebateExemptions: 3 })).toBe(187); // 373 / 2 = 186.50 → 187
  });

  it("Table 2 maximum property tax liability: every row at both ends", () => {
    expect(rc.propertyTaxLiability.length).toBe(16);
    for (const row of rc.propertyTaxLiability) {
      for (const mgi of [row[0], row[1]]) {
        // tax billed $1,000 → rebate = 1,000 − liability, under the $250 cap only when liability ≥ 750: use $260 so nothing caps
        const got = ev("us.nm.property_tax_rebate_65", { filingStatus: "single", nmModifiedGrossIncome: mgi, nmPropertyTaxBilled: 260, nmAge65Count: 1 });
        expect(got, `mgi ${mgi}`).toBe(Math.min(260 - row[2], 250));
      }
    }
    expect(ev("us.nm.property_tax_rebate_65", { filingStatus: "single", nmModifiedGrossIncome: 16001, nmPropertyTaxBilled: 260, nmAge65Count: 1 })).toBe(0);
  });

  it("Table 3 county rebate percentages: every row at both ends", () => {
    expect(rc.countyRebatePct.length).toBe(9);
    for (const row of rc.countyRebatePct) {
      for (const mgi of [row[0], row[1]]) {
        const got = ev("us.nm.county_property_tax_rebate", { filingStatus: "single", nmModifiedGrossIncome: mgi, nmPropertyTaxBilled: 400, nmRebateCounty: true });
        expect(got, `mgi ${mgi}`).toBe(Math.min((400 * row[2]) / 100, 350));
      }
    }
    expect(ev("us.nm.county_property_tax_rebate", { filingStatus: "single", nmModifiedGrossIncome: 24001, nmPropertyTaxBilled: 400, nmRebateCounty: true })).toBe(0);
  });

  it("Table 4 child income tax credit: every row at both ends", () => {
    expect(rc.childCredit.length).toBe(7);
    for (const [lo, hi, credit] of rc.childCredit) {
      const ends = hi === null ? [lo, 1_000_000] : [lo, hi];
      for (const agi of ends) expect(ev("us.nm.child_income_tax_credit", { filingStatus: "mfj", nmAgi: agi, nmQualifyingChildren: 1 }), `agi ${agi}`).toBe(credit);
    }
    expect(ev("us.nm.child_income_tax_credit", { filingStatus: "mfj", nmAgi: -1, nmQualifyingChildren: 2 })).toBe(1274);
  });
});
