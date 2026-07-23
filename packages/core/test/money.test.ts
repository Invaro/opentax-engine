import { describe, expect, it } from "vitest";
import {
  divRound,
  max0,
  mulRate,
  parseCents,
  parseDollars,
  roundToDollar,
  stepUnits,
} from "@invaro/opentax-core";

describe("parseDollars", () => {
  it("accepts integer numbers as whole dollars", () => {
    expect(parseDollars(50000)).toBe(5000000n);
    expect(parseDollars(0)).toBe(0n);
  });

  it("accepts human-formatted strings exactly", () => {
    expect(parseDollars("50000")).toBe(5000000n);
    expect(parseDollars("$50,000")).toBe(5000000n);
    expect(parseDollars("1234.56")).toBe(123456n);
    expect(parseDollars("1234.5")).toBe(123450n);
    expect(parseDollars("-12.50")).toBe(-1250n);
  });

  it("rejects floats and malformed strings — no IEEE floats in tax math", () => {
    expect(() => parseDollars(1234.56)).toThrow(/string/);
    expect(() => parseDollars("12.345")).toThrow(/invalid money/);
    expect(() => parseDollars("abc")).toThrow(/invalid money/);
  });
});

describe("divRound", () => {
  it("returns exact quotients unchanged in every mode", () => {
    for (const mode of ["half-up", "half-even", "floor", "ceil"] as const) {
      expect(divRound(10n, 2n, mode)).toBe(5n);
      expect(divRound(-10n, 2n, mode)).toBe(-5n);
    }
  });

  it("floor and ceil behave on negatives", () => {
    expect(divRound(7n, 2n, "floor")).toBe(3n);
    expect(divRound(-7n, 2n, "floor")).toBe(-4n);
    expect(divRound(7n, 2n, "ceil")).toBe(4n);
    expect(divRound(-7n, 2n, "ceil")).toBe(-3n);
  });

  it("half-up rounds ties away from zero", () => {
    expect(divRound(5n, 2n, "half-up")).toBe(3n);
    expect(divRound(-5n, 2n, "half-up")).toBe(-3n);
    expect(divRound(49n, 100n, "half-up")).toBe(0n);
    expect(divRound(50n, 100n, "half-up")).toBe(1n);
    expect(divRound(51n, 100n, "half-up")).toBe(1n);
  });

  it("half-even rounds ties to even", () => {
    expect(divRound(5n, 2n, "half-even")).toBe(2n);
    expect(divRound(7n, 2n, "half-even")).toBe(4n);
    expect(divRound(-5n, 2n, "half-even")).toBe(-2n);
  });

  it("throws on division by zero", () => {
    expect(() => divRound(1n, 0n, "half-up")).toThrow();
  });
});

describe("mulRate", () => {
  it("computes 12% of $230.75 exactly", () => {
    // 23075 cents * 12/100 = 2769 exactly
    expect(mulRate(23075n * 100n, { num: 12n, den: 100n }, "half-up")).toBe(
      276900n,
    );
  });

  it("rounds a half-cent tie away from zero", () => {
    // 125 cents * 10% = 12.5 cents
    expect(mulRate(125n, { num: 10n, den: 100n }, "half-up")).toBe(13n);
    expect(mulRate(125n, { num: 10n, den: 100n }, "half-even")).toBe(12n);
    expect(mulRate(125n, { num: 10n, den: 100n }, "floor")).toBe(12n);
  });
});

describe("stepUnits", () => {
  it('implements "or fraction thereof" via ceil', () => {
    const thousand = 100000n; // $1,000 in cents
    expect(stepUnits(1200000n, thousand, "ceil")).toBe(12n); // exactly $12,000
    expect(stepUnits(1200100n, thousand, "ceil")).toBe(13n); // $12,001 -> 13
    expect(stepUnits(1200100n, thousand, "floor")).toBe(12n);
    expect(stepUnits(0n, thousand, "ceil")).toBe(0n);
  });

  it("rejects non-positive units", () => {
    expect(() => stepUnits(1n, 0n, "ceil")).toThrow();
  });
});

describe("roundToDollar / max0 / parseCents", () => {
  it("rounds cents to whole dollars", () => {
    expect(roundToDollar(396150n, "half-up")).toBe(396200n);
    expect(roundToDollar(396149n, "floor")).toBe(396100n);
  });

  it("max0 clamps negatives to zero", () => {
    expect(max0(-1n)).toBe(0n);
    expect(max0(1n)).toBe(1n);
  });

  it("parseCents rejects non-integer strings", () => {
    expect(parseCents("396150")).toBe(396150n);
    expect(() => parseCents("39.61")).toThrow();
    expect(() => parseCents("1e5")).toThrow();
  });
});
