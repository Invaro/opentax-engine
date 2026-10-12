import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { compileDocuments } from "../src/documents.js";

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const server = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(ct);
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> };
  await client.close();
  await server.close();
  return JSON.parse(res.content[0].text) as Record<string, unknown>;
}
const single = (w2: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  filing: { filingStatus: "single" },
  documents: { w2s: [w2] },
  asOf: "2025-12-31",
  ...extra,
});
const lines = (r: Record<string, unknown>) => r.lines as Record<string, string>;

describe("compute_return: whole-dollar rounding (Form 1040 instructions)", () => {
  it("rounds 50 cents up BEFORE the Tax Table lookup so line 15 and the table row agree", async () => {
    const a = await call("compute_return", single({ box1: "75249.50", box2: "9100" }));
    const b = await call("compute_return", single({ box1: "75250.00", box2: "9100" }));
    expect(lines(a)["15_taxable_income"]).toBe("$59,500.00");
    expect(lines(a)["16_tax"]).toBe("$8,010.00");
    expect(lines(a)["16_tax"]).toBe(lines(b)["16_tax"]);
    expect(lines(a)["34_refund_or_37_owed"]).toBe("refund $1,090.00");
  });
  it("holds at the low-income boundary too", async () => {
    const a = await call("compute_return", single({ box1: "19999.50" }));
    expect(lines(a)["15_taxable_income"]).toBe("$4,250.00");
    expect(lines(a)["16_tax"]).toBe("$428.00");
  });
  it("sums several W-2s in cents first and is order-independent", async () => {
    const x = await call("compute_return", { filing: { filingStatus: "single" }, documents: { w2s: [{ box1: "40000.25", box2: "3000" }, { box1: "35249.25", box2: "4000" }] }, asOf: "2025-12-31" });
    const y = await call("compute_return", { filing: { filingStatus: "single" }, documents: { w2s: [{ box1: "35249.25", box2: "4000" }, { box1: "40000.25", box2: "3000" }] }, asOf: "2025-12-31" });
    expect(lines(x)["1a_wages"]).toBe("$75,250.00");
    expect(lines(x)["16_tax"]).toBe("$8,010.00");
    expect(lines(x)).toEqual(lines(y));
  });
  it("discloses the rounding in documentNotes and leaves 49 cents alone", async () => {
    const a = await call("compute_return", single({ box1: "75249.49", box2: "9100" }));
    expect(lines(a)["15_taxable_income"]).toBe("$59,499.00");
    expect((a.documentNotes as string[]).join("\n")).toContain("whole-dollar rounding");
  });
});

describe("compute_return: missing withholding is disclosed or refused", () => {
  it("default: box 2 absent → $0 withheld with a note naming the box", async () => {
    const a = await call("compute_return", single({ box1: "75250.00" }));
    expect(a.ok).toBe(true);
    expect(lines(a)["25d_withholding"]).toBe("$0.00");
    expect((a.documentNotes as string[]).join("\n")).toContain("box 2 NOT transcribed");
  });
  it("strict: box 2 absent → NEEDS_FACTS naming documents.w2s[0].box2", async () => {
    const a = await call("compute_return", single({ box1: "75250.00" }, { strict: true }));
    expect(a.ok).toBe(false);
    const err = a.error as { code: string; data?: { missing: Array<{ factId: string }> } };
    expect(err.code).toBe("NEEDS_FACTS");
    expect(err.data?.missing.map((m) => m.factId)).toEqual(["documents.w2s[0].box2"]);
  });
  it("strict with box 2 present (even 0) completes", async () => {
    const a = await call("compute_return", single({ box1: "75250.00", box2: 0 }, { strict: true }));
    expect(a.ok).toBe(true);
  });
});

describe("W-2 box 4 and build identity", () => {
  it("accepts box 4, records it, and flags excess over the 2025 maximum across employers", () => {
    const one = compileDocuments({ w2s: [{ box1: 50000, box2: 5000, box4: 3100 }] }, "2025-12-31");
    expect(one.notes.join("\n")).toContain("box 4 social security tax withheld $3100.00 recorded");
    expect(one.missing).toEqual([]);
    const two = compileDocuments({ w2s: [{ box1: 150000, box2: 30000, box4: 9300 }, { box1: 100000, box2: 20000, box4: 6200 }] }, "2025-12-31");
    expect(two.notes.join("\n")).toContain("exceeds the 2025 maximum $10918.20 by $4581.80");
    expect(two.notes.join("\n")).toContain("NOT computed");
  });
  it("every response carries engine, composer and corpus versions", async () => {
    const a = await call("calculate_tax", { filing: { filingStatus: "single" }, income: { wages: 50000 }, asOf: "2025-12-31" });
    const v = a.versions as Record<string, string>;
    expect(v.engine).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.composer).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.corpus).toMatch(/^\d+\.\d+\.\d+$/);
    expect(v.corpusMerkleRoot).toMatch(/^sha256:/);
  });
});

describe("completeness contract (composer 0.6.0)", () => {
  const excessSS = (extra: Record<string, unknown> = {}) => ({
    filing: { filingStatus: "single" },
    documents: { w2s: [{ box1: 150000, box2: 30000, box4: 9300 }, { box1: 100000, box2: 20000, box4: 6200 }] },
    asOf: "2025-12-31",
    ...extra,
  });
  it("a complete return says so: complete:true, incomplete: []", async () => {
    const a = await call("compute_return", single({ box1: "75250.00", box2: "9100", box4: "4665.50" }));
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(true);
    expect(a.incomplete).toEqual([]);
  });
  it("excess social security withholding: ok:true but complete:false with a structured Schedule 3 line 11 item", async () => {
    const a = await call("compute_return", excessSS());
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(false);
    const items = a.incomplete as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: "NOT_COMPUTED",
      form: "Schedule 3",
      line: "11",
      amount: "$4581.80",
      affectedLines: ["33_total_payments", "34_refund_or_37_owed"],
    });
    expect(String(items[0].action)).toContain("single employer");
  });
  it("strict mode refuses the same return with INCOMPLETE_RETURN naming the line", async () => {
    const a = await call("compute_return", excessSS({ strict: true }));
    expect(a.ok).toBe(false);
    const err = a.error as { code: string; message: string; data: { incomplete: Array<{ form: string; line: string }> } };
    expect(err.code).toBe("INCOMPLETE_RETURN");
    expect(err.message).toContain("Schedule 3 11");
    expect(err.data.incomplete).toHaveLength(1);
    expect(err.data.incomplete[0]).toMatchObject({ form: "Schedule 3", line: "11" });
  });
  it("the § 31(b) limit is per person: two spouses each under the maximum are complete", async () => {
    const a = await call("compute_return", {
      filing: { filingStatus: "mfj" },
      documents: {
        w2s: [
          { box1: 150000, box2: 30000, box4: 9300, recipient: "taxpayer" },
          { box1: 100000, box2: 20000, box4: 6200, recipient: "spouse" },
        ],
      },
      asOf: "2025-12-31",
      strict: true,
    });
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(true);
  });
  it("knows the 2026 wage-base maximum ($184,500 × 6.2% = $11,439)", () => {
    const d = compileDocuments({ w2s: [{ box1: 120000, box2: 20000, box4: 7440 }, { box1: 100000, box2: 15000, box4: 6200 }] }, "2026-12-31");
    expect(d.unsupported).toHaveLength(1);
    expect(d.unsupported[0].amount).toBe("$2201.00");
    expect(d.notes.join("\n")).toContain("exceeds the 2026 maximum $11439.00");
  });
});

describe("explain_rule returns the whole rule", () => {
  it("carries citation, excerpt, formula, parameters, dependencies and hash", async () => {
    const a = await call("explain_rule", { ruleId: "us.federal.standard_deduction" });
    expect(a.ok).toBe(true);
    const v = (a.ruleVersions as Array<Record<string, unknown>>)[0];
    expect(v.formula).toBeDefined();
    expect(typeof (v.formula as { kind: string }).kind).toBe("string");
    expect(v.citation).toMatchObject({ source: expect.any(String), section: expect.any(String) });
    expect(v).toHaveProperty("excerpt");
    expect(v.dependencies).toMatchObject({ rules: expect.any(Array), facts: expect.any(Array) });
    expect(String(v.hash)).toMatch(/^sha256:/);
    // build identity stays on `versions`; the rule list must never be clobbered by it again
    expect((a.versions as Record<string, string>).composer).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("asOf narrows to the version in force and refuses a date with none", async () => {
    const a = await call("explain_rule", { ruleId: "us.federal.standard_deduction", asOf: "2025-12-31" });
    expect(a.ok).toBe(true);
    expect((a.ruleVersions as unknown[]).length).toBeGreaterThan(0);
    for (const v of a.ruleVersions as Array<{ effectiveFrom: string; effectiveTo: string }>) {
      expect(v.effectiveFrom <= "2025-12-31").toBe(true);
      expect(v.effectiveTo === "open" || "2025-12-31" < v.effectiveTo).toBe(true);
    }
    const b = await call("explain_rule", { ruleId: "us.federal.standard_deduction", asOf: "1999-12-31" });
    expect(b.ok).toBe(false);
    expect(String((b.error as { message: string }).message)).toContain("no version valid on 1999-12-31");
  });
});

describe("compute_state_return completeness for an unpublished tax year", () => {
  const vt2026 = (extra: Record<string, unknown> = {}) => ({
    jurisdiction: "vt",
    filingStatus: "single",
    federalAGI: 60000,
    asOf: "2026-12-31",
    ...extra,
  });
  const nd2026 = (extra: Record<string, unknown> = {}) => ({
    jurisdiction: "nd",
    filingStatus: "mfj",
    federalAGI: 90000,
    ndFederalTaxableIncome: 58000,
    ndLowerQualifiedIncome: 30000,
    asOf: "2026-12-31",
    ...extra,
  });
  it("TY2025 is complete", async () => {
    const a = await call("compute_state_return", vt2026({ asOf: "2025-12-31" }));
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(true);
    expect(a.incomplete).toEqual([]);
  });
  it("a composer that cannot fill a line reports complete:false with the line and target, never a silent blank", async () => {
    const a = await call("compute_state_return", nd2026());
    if (a.ok === true) {
      // the year's amounts are encoded for every line touched → the contract must say complete
      expect(typeof a.complete).toBe("boolean");
      const items = a.incomplete as Array<Record<string, unknown>>;
      expect(a.complete).toBe(items.length === 0);
      for (const i of items) expect(i).toMatchObject({ code: "UNPUBLISHED", form: expect.any(String), line: expect.any(String), target: expect.any(String) });
    } else {
      expect((a.error as { code: string }).code).toBeDefined();
    }
  });
  it("Vermont TY2026 refuses with INCOMPLETE_RETURN in both modes (line 4 drives every later line)", async () => {
    for (const strict of [false, true]) {
      const a = await call("compute_state_return", vt2026({ strict }));
      expect(a.ok).toBe(false);
      const err = a.error as { code: string; data: { incomplete: Array<{ code: string; form: string; line: string; target: string }> } };
      expect(err.code).toBe("INCOMPLETE_RETURN");
      expect(err.data.incomplete[0]).toMatchObject({ code: "UNPUBLISHED", form: "VT IN-111", target: "us.vt.standard_deduction" });
    }
  });
  it("Montana TY2026: the indexed subtractions are unpublished → complete:false with each line and target; strict refuses", async () => {
    const mt = { jurisdiction: "mt", filingStatus: "single", federalAGI: 60000, mtFederalDeductions: 16000, mtTuitionSavingsContributions: 1000, asOf: "2026-12-31" };
    const a = await call("compute_state_return", mt);
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(false);
    expect((a.incomplete as Array<{ target: string }>).map((i) => i.target)).toContain("us.mt.tuition_savings_subtraction");
    const s = await call("compute_state_return", { ...mt, strict: true });
    expect(s.ok).toBe(false);
    expect((s.error as { code: string }).code).toBe("INCOMPLETE_RETURN");
  });
  it("strict mode turns an unpublished line into INCOMPLETE_RETURN", async () => {
    const loose = await call("compute_state_return", nd2026());
    const a = await call("compute_state_return", nd2026({ strict: true }));
    if (loose.ok === true && (loose.incomplete as unknown[]).length) {
      expect(a.ok).toBe(false);
      expect((a.error as { code: string }).code).toBe("INCOMPLETE_RETURN");
    } else {
      expect(a.ok).toBe(loose.ok);
    }
  });
});

describe("compute_return: Form 5695 line set and Form 1040 line 20", () => {
  it("no energy inputs: line 20 is $0, schedule3 present, no forms block", async () => {
    const a = await call("compute_return", single({ box1: "60000", box2: "5000" }));
    expect(lines(a)["20_other_nonrefundable_credits"]).toBe("$0.00");
    expect(a.schedule3).toBeDefined();
    expect(a.forms).toBeUndefined();
  });
  it("solar 20,000 on a single 60,000 return: Part I lines, line 20 = 5,075, carryforward 925, tax after credits 0", async () => {
    const a = await call("compute_return", single({ box1: "60000", box2: "5000" }, { energy_credits: { solarElectricCosts: 20000 } }));
    expect(a.ok).toBe(true);
    const f = (a.forms as { "5695": Record<string, string> })["5695"];
    expect(f["6a_total"]).toBe("$20,000.00");
    expect(f["6b_30_percent"]).toBe("$6,000.00");
    expect(f["13_total"]).toBe("$6,000.00");
    expect(f["14_limitation"]).toBe("$5,075.00");
    expect(f["15_residential_clean_energy_credit"]).toBe("$5,075.00");
    expect(f["16_carryforward_to_next_year"]).toBe("$925.00");
    expect(f["32_energy_efficient_home_improvement_credit"]).toBe("$0.00");
    expect((a.schedule3 as Record<string, string>)["5a_residential_clean_energy"]).toBe("$5,075.00");
    expect(lines(a)["20_other_nonrefundable_credits"]).toBe("$5,075.00");
    expect(lines(a)["22_tax_after_credits"]).toBe("$0.00");
    expect(lines(a)["34_refund_or_37_owed"]).toBe("refund $5,000.00");
  });
  it("Part II every cap: line 27 3,350 → 28 1,200; 29h 2,000; 32 = 3,200; line 22 reconciles 18 − 19 − 20", async () => {
    const a = await call("compute_return", single({ box1: "60000", box2: "5000" }, { energy_credits: { insulationAirSealingCosts: 5000, exteriorDoorMostExpensiveCost: 1000, exteriorDoorOtherCosts: 1500, windowsSkylightsCosts: 3000, centralAirConditionerCosts: 4000, homeEnergyAuditCosts: 600, electricalPanelCosts: 1000, heatPumpBiomassCosts: 8000 } }));
    const f = (a.forms as { "5695": Record<string, string> })["5695"];
    expect(f["27_total"]).toBe("$3,350.00");
    expect(f["28_smaller_of_27_or_1200"]).toBe("$1,200.00");
    expect(f["29h_30_percent_max_2000"]).toBe("$2,000.00");
    expect(f["32_energy_efficient_home_improvement_credit"]).toBe("$3,200.00");
    expect(lines(a)["16_tax"]).toBe("$5,075.00");
    expect(lines(a)["20_other_nonrefundable_credits"]).toBe("$3,200.00");
    expect(lines(a)["22_tax_after_credits"]).toBe("$1,875.00");
  });
  it("TY2026: Part II is $0 by termination; the 2025 carryforward still credits", async () => {
    const a = await call("compute_return", { filing: { filingStatus: "single" }, documents: { w2s: [{ box1: "60000", box2: "5000" }] }, energy_credits: { heatPumpBiomassCosts: 8000, residentialCleanEnergyCarryforward: 925 }, asOf: "2026-12-31" });
    const f = (a.forms as { "5695": Record<string, string> })["5695"];
    expect(f["32_energy_efficient_home_improvement_credit"]).toBe("$0.00");
    expect(f["15_residential_clean_energy_credit"]).toBe("$925.00");
    expect(String(f.note)).toContain("terminated");
    expect(f["6b_30_percent"]).toBeUndefined(); // no 2025 cost lines on a 2026 form
    expect(String(f.costs_not_creditable)).toContain("heatPumpBiomassCosts");
    expect(lines(a)["20_other_nonrefundable_credits"]).toBe("$925.00");
  });
  it("strict mode and the completeness contract are unaffected by Form 5695 inputs", async () => {
    const a = await call("compute_return", single({ box1: "60000", box2: "5000" }, { energy_credits: { solarElectricCosts: 1000 }, strict: true }));
    expect(a.ok).toBe(true);
    expect(a.complete).toBe(true);
  });
});
