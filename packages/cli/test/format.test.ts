import { describe, expect, it } from "vitest";
import { formatMoney, formatValue } from "../src/render/format.js";

describe("formatMoney", () => {
  it("formats cents with grouping", () => {
    expect(formatMoney("396150")).toBe("$3,961.50");
    expect(formatMoney("1032300")).toBe("$10,323.00");
    expect(formatMoney("0")).toBe("$0.00");
    expect(formatMoney("5")).toBe("$0.05");
    expect(formatMoney("40000000")).toBe("$400,000.00");
  });

  it("handles negatives", () => {
    expect(formatMoney("-396150")).toBe("-$3,961.50");
  });
});

describe("formatValue", () => {
  it("formats each value type", () => {
    expect(formatValue({ type: "money", value: "632300" })).toBe("$6,323.00");
    expect(formatValue({ type: "int", value: "13" })).toBe("13");
    expect(formatValue({ type: "bool", value: true })).toBe("true");
    expect(formatValue({ type: "enum", value: "mfj" })).toBe("mfj");
  });
});
