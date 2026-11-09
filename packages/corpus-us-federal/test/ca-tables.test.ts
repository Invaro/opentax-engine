/**
 * Filed-return parity gates for California: the engine must reproduce EVERY row of the
 * 2025 California Tax Table (1,001 rows, three columns) at both ends, every cell of the
 * 2025 EITC Table (658 rows × four columns), and the printed 2025 and 2026 rate schedules.
 * The 2024 table is kept as a second year of evidence for the whole-dollar-midpoint
 * convention the 2026 table is generated with until the 2026 booklet prints it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

type TaxRow = [atLeast: number, butNotOver: number, single: number, mfj: number, hoh: number];
type EitcRow = [atLeast: number, butNotOver: number, k0: number, k1: number, k2: number, k3: number];
const load = <T>(file: string): T[] => (JSON.parse(readFileSync(path.join(import.meta.dirname, file), "utf8")) as { rows: T[] }).rows;
const table2025 = load<TaxRow>("ca-tax-table-2025.json");
const table2024 = load<TaxRow>("ca-tax-table-2024.json");
const eitc2025 = load<EitcRow>("ca-eitc-table-2025.json");
const corpus = getCorpus();

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const caTax = (taxable: number, filingStatus: string, asOf?: string, schedule = false) =>
  evalMoney("us.ca.income_tax", { filingStatus, stateTaxableIncome: taxable, useFormulaMethod: schedule }, asOf);

function contiguous(rows: readonly (readonly number[])[]): void {
  for (let i = 1; i < rows.length; i++) expect(rows[i][0]).toBe(rows[i - 1][1] + 1);
}

/** A printed schedule: [over, fixed amount in cents] for each of the nine tiers. */
type Sched = [over: number, fixedCents: number][];
type Col = "single" | "mfj" | "hoh";
const RATES_BP = [100, 200, 400, 600, 800, 930, 1030, 1130, 1230]; // basis points
const halfUp = (n: number, d: number) => Math.floor((2 * n + d) / (2 * d));
/** the printed "How to Figure Tax" steps, in cents: fixed amount + (excess × rate rounded to cents) */
const schedCents = (s: Sched, xCents: number) => {
  let i = 0;
  while (i + 1 < s.length && xCents > s[i + 1][0] * 100) i++;
  return s[i][1] + halfUp((xCents - s[i][0] * 100) * RATES_BP[i], 10000);
};
const SCHED_2024: Record<Col, Sched> = {
  single: [[0, 0], [10756, 10756], [25499, 40242], [40245, 99226], [55866, 192952], [70606, 310872], [360659, 3008365], [432787, 3751283], [721314, 7011638]],
  mfj: [[0, 0], [21512, 21512], [50998, 80484], [80490, 198452], [111732, 385904], [141212, 621744], [721318, 6016730], [865574, 7502567], [1442628, 14023277]],
  hoh: [[0, 0], [21527, 21527], [51000, 80473], [65744, 139449], [81364, 233169], [96107, 351113], [490493, 4018903], [588593, 5029333], [980987, 9463385]],
};
const SCHED_2026: Record<Col, Sched> = {
  single: [[0, 0], [11456, 11456], [27157, 42858], [42861, 105674], [59498, 205496], [75197, 331088], [384109, 3203970], [460927, 3995195], [768213, 7467527]],
  mfj: [[0, 0], [22912, 22912], [54314, 85716], [85722, 211348], [118996, 410992], [150394, 662176], [768218, 6407939], [921854, 7990390], [1536426, 14935054]],
  hoh: [[0, 0], [22927, 22927], [54316, 85705], [70018, 148513], [86654, 248329], [102356, 373945], [522385, 4280215], [626864, 5356349], [1044771, 10078698]],
};
/** a table row's tax at a midpoint given in cents, rounded to dollars */
const rowTax = (s: Sched, midCents: number) => halfUp(schedCents(s, midCents), 100);
const wholeMid = (lo: number, hi: number) => Math.floor((lo + hi) / 2) * 100;
const halfMid = (lo: number, hi: number) => (lo + hi) * 50;

describe("2025 California Tax Table — every row", () => {
  it("has the full printed table ($1-$50, $100 rows, and the $50 row 99,951-100,000)", () => {
    expect(table2025.length).toBe(1001);
    expect(table2025[0]).toEqual([1, 50, 0, 0, 0]);
    expect(table2025[1]).toEqual([51, 150, 1, 1, 1]);
    expect(table2025.find((r) => r[0] === 40051)).toEqual([40051, 40150, 968, 580, 580]);
    expect(table2025.find((r) => r[0] === 95051)).toEqual([95051, 95150, 5283, 2776, 3305]);
    expect(table2025[1000]).toEqual([99951, 100000, 5736, 3068, 3708]);
    contiguous(table2025);
  });

  it("reproduces every row at both ends for single, MFS, MFJ, QSS, and HOH", () => {
    const bad: string[] = [];
    for (const [lo, hi, single, mfj, hoh] of table2025) {
      for (const taxable of [lo, hi]) {
        const checks: [string, number][] = [["single", single], ["mfs", single], ["mfj", mfj], ["qss", mfj], ["hoh", hoh]];
        for (const [fs, printed] of checks) {
          const got = caTax(taxable, fs);
          if (got !== printed) bad.push(`${fs} ${taxable}: got ${got}, printed ${printed}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 180_000);

  it("uses the schedule only above $100,000, and at every income when asked", () => {
    expect(caTax(100000, "single")).toBe(5736); // the table's last row
    expect(caTax(100001, "single")).toBe(5738.73); // Schedule X: $3,201.97 + 9.3% × 27,277
    expect(caTax(100000, "single", undefined, true)).toBe(5738.64);
    expect(caTax(0, "single")).toBe(0);
  });

  it("applies the 10.3%, 11.3% and 12.3% tiers of the printed 2025 schedules", () => {
    expect(caTax(400000, "single")).toBe(33923.85); // $30,986.19 + 10.3% × 28,521 (v5 charged 9.3% here)
    expect(caTax(500000, "mfs")).toBe(44766.15); // $38,638.27 + 11.3% × 54,229
    expect(caTax(800000, "mfj")).toBe(67847.7); // $61,972.37 + 10.3% × 57,042
    expect(caTax(1100000, "hoh")).toBe(108491.62); // $97,472.91 + 12.3% × 89,583
  });
});

describe("the whole-dollar-midpoint convention (evidence for the generated 2026 table)", () => {
  it("reproduces every cell of the printed 2024 table from the 2024 schedules", () => {
    expect(table2024.length).toBe(1001);
    contiguous(table2024);
    const bad: string[] = [];
    for (const [lo, hi, single, mfj, hoh] of table2024) {
      for (const [col, printed] of [["single", single], ["mfj", mfj], ["hoh", hoh]] as const) {
        const got = rowTax(SCHED_2024[col], wholeMid(lo, hi));
        if (got !== printed) bad.push(`${col} ${lo}-${hi}: ${got} vs ${printed}`);
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("the half-dollar midpoint misses 33 cells of the 2024 table, e.g. single 70,651-70,750", () => {
    let misses = 0;
    for (const [lo, hi, single, mfj, hoh] of table2024) {
      for (const [col, printed] of [["single", single], ["mfj", mfj], ["hoh", hoh]] as const) if (rowTax(SCHED_2024[col], halfMid(lo, hi)) !== printed) misses++;
    }
    expect(misses).toBe(33);
    expect(rowTax(SCHED_2024.single, halfMid(70651, 70750))).toBe(3118); // $3,108.72 + 9.3% × 94.50 = 3,117.51
    expect(table2024.find((r) => r[0] === 70651)?.[2]).toBe(3117); // printed: the whole-dollar midpoint $70,700
  });
});

describe("2026 California rate schedules and the generated Tax Table", () => {
  it("each printed fixed amount is the previous one plus the previous band at its rate, to the cent", () => {
    for (const s of [...Object.values(SCHED_2024), ...Object.values(SCHED_2026)]) {
      for (let i = 1; i < s.length; i++) expect(schedCents(s, s[i][0] * 100)).toBe(s[i][1]);
    }
  });

  it("the engine's 2026 table is the printed 2026 schedules at every row's whole-dollar midpoint, both ends", () => {
    const rows: [number, number][] = [[1, 50], ...Array.from({ length: 999 }, (_, i): [number, number] => [51 + 100 * i, 150 + 100 * i]), [99951, 100000]];
    expect(rows[999]).toEqual([99851, 99950]);
    const bad: string[] = [];
    for (const [lo, hi] of rows) {
      for (const [fs, col] of [["single", "single"], ["mfs", "single"], ["mfj", "mfj"], ["qss", "mfj"], ["hoh", "hoh"]] as const) {
        const want = rowTax(SCHED_2026[col], wholeMid(lo, hi));
        for (const taxable of [lo, hi]) {
          const got = caTax(taxable, fs, "2026-12-31");
          if (got !== want) bad.push(`${fs} ${taxable}: ${got} vs ${want}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 180_000);

  it("prices income above $100,000 on the printed 2026 schedules, all nine tiers", () => {
    expect(caTax(100000, "single", "2026-12-31")).toBe(5615);
    expect(caTax(100001, "single", "2026-12-31")).toBe(5617.65); // $3,310.88 + 9.3% × 24,804
    expect(caTax(125000, "mfj", "2026-12-31")).toBe(4590.24); // FTB's own example: 'they will enter $4,590'
    expect(caTax(400000, "single", "2026-12-31")).toBe(33676.47);
    expect(caTax(1000000, "mfj", "2026-12-31")).toBe(88734.4);
    expect(caTax(600000, "hoh", "2026-12-31")).toBe(50796.5);
    expect(caTax(800000, "single", "2026-12-31")).toBe(78585.07);
  });
});

describe("2025 California EITC Table — every cell", () => {
  const credit = (income: number, kids: number, agiExtra = 0) =>
    evalMoney("us.ca.caleitc", { filingStatus: "single", wages: income, qualifyingChildren: Math.min(kids, 3), eitcAdditionalQualifyingChildren: Math.max(0, kids - 3), unemploymentCompensation: agiExtra });

  it("has the full printed table (658 rows of $50 from $1 to $32,900)", () => {
    expect(eitc2025.length).toBe(658);
    expect(eitc2025[0]).toEqual([1, 50, 2, 7, 9, 10]);
    expect(eitc2025[657]).toEqual([32851, 32900, 1, 1, 1, 1]);
    expect(eitc2025.find((r) => r[0] === 13251)).toEqual([13251, 13300, 181, 590, 2166, 2437]);
    contiguous(eitc2025);
  });

  it("reproduces every cell at both ends of every row, all four columns", () => {
    const bad: string[] = [];
    for (const row of eitc2025) {
      for (const income of [row[0], row[1]]) {
        for (let k = 0; k < 4; k++) {
          const got = credit(income, k);
          if (got !== row[2 + k]) bad.push(`${k} children, ${income}: got ${got}, printed ${row[2 + k]}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 300_000);

  it("is $0 at the $32,901 limit and above, and $0 at $0", () => {
    for (let k = 0; k < 4; k++) {
      expect(credit(32901, k)).toBe(0);
      expect(credit(0, k)).toBe(0);
    }
  });

  it("Step 6: with a different federal AGI at or above the floor, takes the smaller lookup", () => {
    // earned $10,000 (one child) → $1,162; AGI $16,000 → $509
    expect(credit(10000, 1, 6000)).toBe(509);
    // AGI below the one-child floor $6,998 → the earned-income lookup stands
    expect(credit(3000, 1, 3000)).toBe(eitc2025.find((r) => r[0] <= 3000 && 3000 <= r[1])![3]);
  });
});
