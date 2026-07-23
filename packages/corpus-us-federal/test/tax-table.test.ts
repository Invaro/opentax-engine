/**
 * Filed-return parity gate: 41 rows sampled from the PRINTED 2025 IRS Tax
 * Table (Publication 1040) — the engine's table-method override must
 * reproduce every printed entry exactly, for every filing status.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Row {
  atLeast: number;
  lessThan: number;
  single: number;
  mfj: number;
  mfs: number;
  hoh: number;
}

const sample = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "tax-table-2025-sample.json"), "utf8"),
) as { source: string; rows: Row[] };

// 2025 standard deductions (OBBBA) — wages = taxable + deduction puts the
// desired taxable income on line 15 exactly
const STD: Record<string, number> = {
  single: 15750,
  mfj: 31500,
  mfs: 15750,
  hoh: 23625,
};

describe("2025 Tax Table override reproduces the printed IRS table", () => {
  const corpus = getCorpus();

  for (const row of sample.rows) {
    // probe at the low edge AND one dollar under the high edge of the band
    for (const taxable of [row.atLeast, Math.max(row.atLeast, row.lessThan - 1)]) {
      it(`taxable $${taxable} (band ${row.atLeast}–${row.lessThan})`, () => {
        for (const status of ["single", "mfj", "mfs", "hoh"] as const) {
          const facts = coerceFacts(corpus, {
            filingStatus: status,
            wages: taxable + STD[status],
            ...(status === "mfs" ? { spouseItemizes: false } : {}),
          });
          const { value } = evaluate(corpus, facts, {
            asOf: "2025-12-31",
            target: "us.federal.income_tax_before_credits",
          });
          expect(
            value,
            `${status} taxable ${taxable}`,
          ).toEqual({ type: "money", cents: BigInt(row[status]) * 100n });
        }
      });
    }
  }
});
