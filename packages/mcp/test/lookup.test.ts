import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const server = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(ct);
  const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> };
  await client.close();
  await server.close();
  return JSON.parse(res.content[0].text) as Record<string, any>;
}

describe("verify_fact", () => {
  it("verifies the federal standard deduction against the federal rule, not a state's", async () => {
    const r = await call("verify_fact", { query: "standard deduction", claimedAmount: 32200, filingStatus: "mfj", asOf: "2026-06-30" });
    expect(r).toMatchObject({ ok: true, verdict: "verified", rule: "us.federal.standard_deduction.base_amount", field: "byFilingStatus.mfj", jurisdiction: "us.federal", jurisdictions: ["us.federal"], effective: "[2026-01-01, 2027-01-01)" });
    expect(r.citation.section).toContain("Rev. Proc. 2025-32");
  });

  it("refutes with federal values only, the asked status first", async () => {
    const r = await call("verify_fact", { query: "standard deduction married filing jointly 2025", claimedAmount: 30000 });
    expect(r).toMatchObject({ ok: true, verdict: "refuted", asOf: "2025-12-31", jurisdiction: "us.federal", jurisdictions: ["us.federal"] });
    expect(r.nearbyValues[0]).toEqual({ rule: "us.federal.standard_deduction.base_amount", field: "byFilingStatus.mfj", value: "$31,500.00" });
    for (const v of r.nearbyValues) expect(v.rule.startsWith("us.federal.")).toBe(true);
  });

  it("checks a state claim against that state", async () => {
    const r = await call("verify_fact", { query: "Alabama standard deduction", claimedAmount: 32200, asOf: "2025-12-31" });
    expect(r).toMatchObject({ verdict: "refuted", jurisdiction: "us.al" });
    for (const v of r.nearbyValues) expect(v.rule.startsWith("us.al.")).toBe(true);
    const ok = await call("verify_fact", { query: "Alabama standard deduction", claimedAmount: 8500, filingStatus: "mfj", asOf: "2025-12-31" });
    expect(ok).toMatchObject({ verdict: "verified", rule: "us.al.standard_deduction", field: "maxMfj", jurisdiction: "us.al" });
  });

  it("answers unknown, with the reason, when the query is not specific enough", async () => {
    const r = await call("verify_fact", { query: "unicorn cap", claimedAmount: 10000, asOf: "2025-12-31" });
    expect(r).toMatchObject({ ok: true, verdict: "unknown", jurisdictions: ["us.federal"], asOf: "2025-12-31" });
    expect(r.message).toMatch(/unicorn/);
    const two = await call("verify_fact", { query: "Missouri federal tax deduction", claimedAmount: 25000, asOf: "2025-12-31" });
    expect(two).toMatchObject({ verdict: "unknown" });
  });

  it("answers unknown for a rate or a percentage", async () => {
    const a = await call("verify_fact", { query: "net investment income tax rate", claimedAmount: "3.8", asOf: "2026-06-30" });
    expect(a).toMatchObject({ ok: true, verdict: "unknown" });
    const n = await call("verify_fact", { query: "net investment income tax rate", claimedAmount: 3.8, asOf: "2026-06-30" });
    expect(n).toMatchObject({ ok: true, verdict: "unknown", jurisdictions: ["us.federal"] });
    const b = await call("verify_fact", { query: "net investment income tax", claimedAmount: "3.8%", asOf: "2026-06-30" });
    expect(b).toMatchObject({ ok: true, verdict: "unknown" });
    expect(b.message).toMatch(/dollar amounts/);
  });
});

describe("lookup_tax_parameter", () => {
  it("returns federal rules for a query that names no state", async () => {
    const r = await call("lookup_tax_parameter", { query: "standard deduction", asOf: "2026-06-30" });
    expect(r.jurisdictions).toEqual(["us.federal"]);
    expect(r.hits[0]).toMatchObject({ ruleId: "us.federal.standard_deduction.base_amount", jurisdiction: "us.federal" });
    expect(r.hits[0].byFilingStatus.mfj).toBe("$32,200.00");
    for (const h of r.hits) expect(h.jurisdiction).toBe("us.federal");
  });

  it("uses the year in the query when asOf is not given", async () => {
    const r = await call("lookup_tax_parameter", { query: "child tax credit per child 2025" });
    expect(r.asOf).toBe("2025-12-31");
    expect(r.hits[0]).toMatchObject({ ruleId: "us.federal.ctc.tentative", jurisdiction: "us.federal" });
    expect(r.hits[0].parameters.perChild).toBe("$2,200.00");
  });

  it("says so when the hits come from other jurisdictions", async () => {
    const r = await call("lookup_tax_parameter", { query: "renters", asOf: "2025-12-31" });
    expect(r.jurisdictions).toEqual(["us.federal"]);
    expect(r.hits.length).toBeGreaterThan(0);
    for (const h of r.hits) expect(h.jurisdiction).not.toBe("us.federal");
    expect(r.note).toMatch(/other jurisdictions/);
    // the note is there even when another one applies
    const two = await call("lookup_tax_parameter", { query: "ca homestead", asOf: "2025-12-31" });
    if (two.hits.some((h: any) => h.jurisdiction !== "us.federal")) expect(two.note).toMatch(/"CA".*other jurisdictions/);
  });

  it("returns the named state's rules", async () => {
    const r = await call("lookup_tax_parameter", { query: "alabama standard deduction", asOf: "2025-12-31" });
    expect(r.jurisdictions).toEqual(["us.al"]);
    expect(r.hits[0].ruleId).toBe("us.al.standard_deduction");
  });
});
