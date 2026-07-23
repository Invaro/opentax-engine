import { describe, expect, it } from "vitest";
import { compileDocuments } from "../src/documents.js";

describe("document compiler: 1099-NEC/K/INT/DIV/B/G", () => {
  it("compiles the full mixed-document scenario deterministically", () => {
    const out = compileDocuments(
      {
        taxpayerDateOfBirth: "1980-03-14",
        w2s: [{ box1: 60000, box2: 6000 }],
        f1099necs: [{ box1: 30000 }],
        f1099ks: [{ box1a: 12000 }],
        scheduleCExpensesTotal: 17000,
        f1099ints: [{ box1: 800, box3: 200, box8: 500 }],
        f1099divs: [{ box1a: 3000, box1b: 2200, box2a: 1000, box4: 100 }],
        f1099bs: [
          { proceeds: 20000, basis: 15000, term: "short" },
          { proceeds: 8000, basis: 11000, term: "long", washSaleLossDisallowed: 500 },
        ],
        f1099gs: [{ box1: 4000, box2: 900 }],
      },
      "2025-12-31",
    );
    expect(out.facts).toMatchObject({
      wages: "60000.00",
      federalTaxWithheld: "6100.00", // W-2 box 2 + DIV box 4
      selfEmploymentNetProfit: "25000.00", // 30k NEC + 12k K − 17k expenses
      taxableInterest: "1000.00", // box 1 + Treasury box 3
      taxExemptInterest: "500.00",
      qualifiedDividends: "2200.00",
      ordinaryDividends: "800.00", // 1a − 1b
      shortTermCapitalGains: "5000.00",
      longTermCapitalLoss: "1500.00", // −3,000 lot + 500 wash-sale + 1,000 box 2a
      unemploymentCompensation: "4000.00",
    });
    // the state-refund judgment is a note, never an auto-included amount
    expect(out.facts).not.toHaveProperty("otherOrdinaryIncome");
    expect(out.notes.join("\n")).toContain("§ 111");
  });

  it("nets an expense-heavy Schedule C into scheduleCNetLoss", () => {
    const out = compileDocuments(
      { f1099necs: [{ box1: 5000 }], scheduleCExpensesTotal: 8000 },
      "2025-12-31",
    );
    expect(out.facts.scheduleCNetLoss).toBe("3000.00");
    expect(out.facts).not.toHaveProperty("selfEmploymentNetProfit");
  });

  it("rejects a 1099-DIV whose qualified box exceeds the total box", () => {
    expect(() =>
      compileDocuments({ f1099divs: [{ box1a: 1000, box1b: 1200 }] }, "2025-12-31"),
    ).toThrow(/box 1b.*exceeds box 1a/);
  });

  it("keeps pure-loss 1099-B buckets as per-bucket loss facts", () => {
    const out = compileDocuments(
      {
        f1099bs: [
          { proceeds: 1000, basis: 2500, term: "short" },
          { proceeds: 4000, basis: 5500, term: "long" },
        ],
      },
      "2025-12-31",
    );
    expect(out.facts.shortTermCapitalLoss).toBe("1500.00");
    expect(out.facts.longTermCapitalLoss).toBe("1500.00");
  });
});
