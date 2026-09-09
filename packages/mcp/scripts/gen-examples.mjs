/**
 * Generate docs/api/examples/*.json — REAL request/response pairs captured by calling the
 * tools in-process, exactly as the hosted endpoint answers them. Run after build.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = path.join(root, "docs/api/examples");
mkdirSync(dir, { recursive: true });
const server = createServer();
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st);
const client = new Client({ name: "opentax-docs-generator", version: "1.0.0" });
await client.connect(ct);

const CASES = [
  ["01-calculate-tax-mfj-two-kids", "calculate_tax", { filing: { filingStatus: "mfj" }, income: { wages: 120000 }, credits: { qualifyingChildren: 2 }, asOf: "2025-12-31" }],
  ["02-compute-return-from-w2", "compute_return", { filing: { filingStatus: "single" }, documents: { taxpayerDateOfBirth: "1990-05-14", w2s: [{ box1: 68000, box2: 7200, box3: 68000, box5: 68000, box6: 986, box17: 2400 }] }, asOf: "2025-12-31" }],
  ["03-compute-state-return-vt", "compute_state_return", { jurisdiction: "vt", asOf: "2025-12-31", filingStatus: "single", federalAGI: 60000, stateWithholding: 1800 }],
  ["04-compute-state-return-ca-mfj", "compute_state_return", { jurisdiction: "ca", asOf: "2025-12-31", filingStatus: "mfj", federalAGI: 150000, dependents: 1, stateWithholding: 6000 }],
  ["05-calculate-business-tax-1120", "calculate_business_tax", { entityLegalForm: "corporation", corpTaxableIncome: 1000000, asOf: "2025-12-31" }],
  ["06-lookup-tax-parameter", "lookup_tax_parameter", { query: "child tax credit per child 2025" }],
  ["07-verify-fact", "verify_fact", { query: "standard deduction married filing jointly 2025", claimedAmount: 30000 }],
  ["08-refusal-needs-facts", "calculate_tax", { income: { wages: 50000 }, asOf: "2025-12-31" }],
  ["09-refusal-no-applicable-rule-vt-2026", "compute_state_return", { jurisdiction: "vt", asOf: "2026-12-31", filingStatus: "single", federalAGI: 60000 }],
  ["10-explain-rule", "explain_rule", { ruleId: "us.vt.income_tax" }],
];
const index = [];
let id = 1;
for (const [name, tool, args] of CASES) {
  const request = { jsonrpc: "2.0", id: id++, method: "tools/call", params: { name: tool, arguments: args } };
  let result;
  try {
    result = await client.callTool({ name: tool, arguments: args });
  } catch (err) {
    result = { isError: true, content: [{ type: "text", text: String(err?.message ?? err) }] };
  }
  const response = { jsonrpc: "2.0", id: request.id, result };
  const text = result.content?.[0]?.text ?? "";
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  // keep the files readable: proof trees can be huge — truncate the proof but keep everything else
  if (parsed && parsed.proof) parsed.proof = { _note: "proof tree elided in this example; the live response carries the full derivation (see docs/PROOF-FORMAT.md)", schemaVersion: parsed.proof.schemaVersion, corpus: parsed.proof.corpus };
  const decoded = parsed ?? text;
  writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ request, response: { ...response, result: { ...result, content: [{ type: "text", text: "(see decodedResult)" }] } }, decodedResult: decoded }, null, 2) + "\n");
  const ok = parsed?.ok ?? !result.isError;
  index.push({ file: `${name}.json`, tool, ok, summary: parsed?.error?.code ?? (parsed?.formatted ?? parsed?.lines?.["8_vt_income_tax"] ?? parsed?.value?.value ?? (typeof decoded === "string" ? decoded.slice(0, 80) : Object.keys(parsed ?? {}).slice(0, 6).join(", "))) });
  console.log(`${name}: ${ok ? "ok" : "REFUSED"} ${String(index.at(-1).summary).slice(0, 120)}`);
}
writeFileSync(path.join(dir, "INDEX.json"), JSON.stringify(index, null, 2) + "\n");
await client.close();
