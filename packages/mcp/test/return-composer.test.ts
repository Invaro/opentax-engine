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
