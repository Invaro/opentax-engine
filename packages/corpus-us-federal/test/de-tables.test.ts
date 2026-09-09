/**
 * Filed-return parity gates for Delaware: the engine must reproduce EVERY row
 * of the 2025 State Income Tax Table at both ends, for every filing status —
 * Delaware prints ONE "Tax due" column, and § 1102(a) draws no distinction by
 * status (filing status moves the standard deduction and the personal credits,
 * never the rate).
 *
 * Table asset parsed from the Division's TY25_taxtable.pdf. The convention
 * proved on all 1,162 printed cells is the § 1102(a)(14) schedule evaluated at
 * the row midpoint, rounded half-up, with NO exceptions: two $1,000 rows below
 * $2,000 (both $0, which the zero bracket already gives) and $50 rows from
 * $2,000 to $60,000.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const table = JSON.parse(readFileSync(path.join(import.meta.dirname, "de-tax-table-2025.json"), "utf8")) as { rows: { atLeast: number; lessThan: number; tax: number }[] };
const corpus = getCorpus();
const STATUSES = ["single", "mfj", "mfs", "hoh", "qss"];

function evalMoney(target: string, facts: Record<string, unknown>, asOf = "2025-12-31"): number {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  return Number((value as { cents: bigint }).cents) / 100;
}
const deTax = (taxable: number, filingStatus: string, schedule = false, asOf?: string) =>
  evalMoney("us.de.income_tax", { filingStatus, stateTaxableIncome: taxable, deUseRateSchedule: schedule }, asOf);

describe("2025 Delaware State Income Tax Table — every row", () => {
  it("has the full table (1,162 contiguous rows from $0 to $60,000)", () => {
    expect(table.rows.length).toBe(1162);
    expect(table.rows[0]).toEqual({ atLeast: 0, lessThan: 1000, tax: 0 });
    expect(table.rows[1]).toEqual({ atLeast: 1000, lessThan: 2000, tax: 0 });
    expect(table.rows[2]).toEqual({ atLeast: 2000, lessThan: 2050, tax: 1 }); // first $50 row
    expect(table.rows[1161]).toEqual({ atLeast: 59950, lessThan: 60000, tax: 2942 });
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].atLeast).toBe(table.rows[i - 1].lessThan);
    for (let i = 1; i < table.rows.length; i++) expect(table.rows[i].tax).toBeGreaterThanOrEqual(table.rows[i - 1].tax);
  });

  it("reproduces every printed row at both ends, for every filing status", () => {
    const bad: string[] = [];
    for (const row of table.rows) {
      for (const taxable of [row.atLeast, row.lessThan - 1]) {
        for (const fs of STATUSES) {
          const got = deTax(taxable, fs);
          if (got !== row.tax) bad.push(`${fs} ${taxable}: got ${got}, printed ${row.tax}`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  }, 300_000);

  it("charges no tax on the first $2,000 (the zero bracket)", () => {
    for (const fs of STATUSES) {
      expect(deTax(0, fs)).toBe(0);
      expect(deTax(1999, fs)).toBe(0);
      // the TABLE governs below $60,000, and its first $50 row prices the midpoint:
      // 2.2% x $25 = $0.55 -> $1. A filer at exactly $2,000 pays $1, where the
      // schedule (which taxes only the excess over $2,000) would give $0.
      expect(deTax(2000, fs)).toBe(1);
      expect(deTax(2049, fs)).toBe(1);
      expect(deTax(2000, fs, true)).toBe(0); // deUseRateSchedule shows the schedule's $0
    }
  });

  it("hands off to the rate schedule at $60,000 with the exact $2,943.50 anchor", () => {
    // the Division's own worked example: $67,751 -> 2,943.50 + 6.6% x 7,751 = 3,455.07 -> $3,455
    expect(deTax(67751, "single")).toBe(3455);
    expect(deTax(60000, "single")).toBe(2944); // 2,943.50 rounds half-up
    expect(deTax(59999, "single")).toBe(2942); // still the last printed table row
    expect(deTax(100000, "mfj")).toBe(Math.round(2943.5 + 0.066 * 40000)); // 5,584 (2,943.50 + 2,640 = 5,583.50)
    // the schedule is filing-status blind
    for (const fs of STATUSES) expect(deTax(250000, fs)).toBe(deTax(250000, "single"));
  });

  it("applies the schedule below $60,000 when asked, differing from the table by less than a row", () => {
    expect(deTax(25000, "single", true)).toBe(1001); // exactly the printed anchor
    let maxDiff = 0;
    for (let x = 2000; x < 60000; x += 397) maxDiff = Math.max(maxDiff, Math.abs(deTax(x, "single") - deTax(x, "single", true)));
    expect(maxDiff).toBeLessThanOrEqual(2);
  });

  it("carries the same unindexed schedule into TY2026 and refuses beyond the corpus window", () => {
    // Delaware does not index; §§ 1102, 1108 and 1110 were not amended in the 152nd or 153rd General Assembly
    expect(deTax(50000, "single", false, "2026-12-31")).toBe(deTax(50000, "single"));
    expect(deTax(100000, "mfj", false, "2026-12-31")).toBe(deTax(100000, "mfj"));
    expect(() => deTax(50000, "single", false, "2027-06-30")).toThrow();
  });
});

describe("2025 Delaware deductions, credits and exclusions", () => {
  const deduction = (filingStatus: string, boxes = 0, itemizes = false) =>
    evalMoney("us.de.standard_deduction", { filingStatus, deAdditionalDeductionBoxes: boxes, deItemizes: itemizes });
  const credits = (deExemptions: number, deAge60Persons = 0, dependent = false) =>
    evalMoney("us.de.personal_credits", { filingStatus: "single", deExemptions, deAge60Persons, isClaimedAsDependent: dependent });

  it("doubles the standard deduction only on a joint return", () => {
    expect(deduction("mfj")).toBe(6500);
    for (const fs of ["single", "mfs", "hoh", "qss"]) expect(deduction(fs), fs).toBe(3250);
  });

  it("adds $2,500 per checked box, and nothing at all to an itemizer", () => {
    expect(deduction("single", 1)).toBe(3250 + 2500);
    expect(deduction("single", 2)).toBe(3250 + 5000); // 65 or over AND blind
    expect(deduction("mfj", 4)).toBe(6500 + 10000); // both spouses, both boxes
    expect(deduction("single", 2, true)).toBe(0);
  });

  it("grants $110 per exemption plus $110 per person 60 or over, and nothing to a dependent filer", () => {
    expect(credits(2)).toBe(220); // the booklet's own example: joint, no dependents
    expect(credits(4, 2)).toBe(440 + 220);
    expect(credits(3, 0, true)).toBe(0);
  });

  it("splits the pension exclusion at age 60 and at the military test", () => {
    const pension = (facts: Record<string, unknown>) => evalMoney("us.de.pension_exclusion", { filingStatus: "single", ...facts });
    expect(pension({ deAge60OrOver: true, dePensionIncome: 10000, deEligibleRetirementIncome: 4500 })).toBe(12500); // capped
    expect(pension({ deAge60OrOver: true, dePensionIncome: 3000, deEligibleRetirementIncome: 1500 })).toBe(4500);
    expect(pension({ deAge60OrOver: false, dePensionIncome: 30000 })).toBe(2000); // under 60, non-military
    expect(pension({ deAge60OrOver: false, dePensionIncome: 30000, deMilitaryPension: true })).toBe(12500);
    // eligible retirement income counts ONLY for the 60-or-over tier
    expect(pension({ deAge60OrOver: false, dePensionIncome: 0, deEligibleRetirementIncome: 20000 })).toBe(0);
  });

  it("treats the elderly/disabled exclusion as three cliffs", () => {
    const ex = (facts: Record<string, unknown>) => evalMoney("us.de.elderly_disabled_exclusion", { filingStatus: "single", deQualifiesElderlyDisabled: true, ...facts });
    expect(ex({ deEarnedIncome: 2499, deAgiBeforeExclusion: 10000 })).toBe(2000);
    expect(ex({ deEarnedIncome: 2500, deAgiBeforeExclusion: 10000 })).toBe(0); // "less than $2,500"
    expect(ex({ deEarnedIncome: 2499, deAgiBeforeExclusion: 10001 })).toBe(0); // "$10,000 or less"
    const joint = (facts: Record<string, unknown>) => evalMoney("us.de.elderly_disabled_exclusion", { filingStatus: "mfj", deQualifiesElderlyDisabled: true, ...facts });
    expect(joint({ deSpouseQualifiesElderlyDisabled: true, deEarnedIncome: 4999, deAgiBeforeExclusion: 20000 })).toBe(4000);
    expect(joint({ deSpouseQualifiesElderlyDisabled: false, deEarnedIncome: 4999, deAgiBeforeExclusion: 20000 })).toBe(0); // both must qualify
  });

  it("picks the better earned income credit branch the way DE Schedule II prescribes", () => {
    const eitc = (fed: number, taxAfterCredits: number) => evalMoney("us.de.eitc", { filingStatus: "single", deFederalEic: fed, deEitcTaxAfterCredits: taxAfterCredits });
    // 4.5% ($225) >= the $100 remaining tax -> take the refundable 4.5%
    expect(eitc(5000, 100)).toBe(225);
    // 4.5% ($225) < the $2,000 remaining tax -> the smaller of that tax and 20% ($1,000)
    expect(eitc(5000, 2000)).toBe(1000);
    // 20% exceeds the remaining tax -> limited to the tax
    expect(eitc(5000, 600)).toBe(600);
    // no tax at all -> the fully refundable branch
    expect(eitc(4000, 0)).toBe(180);
  });
});
