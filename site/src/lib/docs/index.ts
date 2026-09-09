import toolsData from "./tools.json";
import examplesData from "./examples.json";
import coverageData from "./coverage.json";
import type { Schema } from "@/components/docs/schema-table";

export type ToolDoc = { name: string; description: string; inputSchema: Schema };
export type ExampleDoc = {
  file: string;
  tool: string;
  ok: boolean;
  summary: string;
  title: string;
  arguments: Record<string, unknown>;
  result: unknown;
  proofTrimmed: boolean;
  isError: boolean;
};

export const TOOLS = toolsData.tools as unknown as ToolDoc[];
export const CORPUS_VERSION = toolsData.corpusVersion as string;
export const MERKLE_ROOT = toolsData.merkleRoot as string;
export const DOCS_GENERATED = toolsData.generated as string | null;
export const EXAMPLES = examplesData as unknown as ExampleDoc[];
export const COVERAGE = coverageData as typeof coverageData;

export const SITE = "https://opentax.invaro.ai";
export const REST_BASE = `${SITE}/v1/tools`;
export const MCP_URL = `${SITE}/mcp`;

export const TOOL_GROUPS: Array<{ title: string; blurb: string; tools: string[] }> = [
  {
    title: "Compute",
    blurb: "Facts in, a cited answer or a printed line set out. Every result is hashed; includeProof returns the tree.",
    tools: [
      "calculate_tax",
      "compute_return",
      "compute_state_return",
      "calculate_business_tax",
      "calculate_fiduciary_tax",
      "determine_dependent",
      "compare_filing_statuses",
      "find_tax_cliffs",
    ],
  },
  {
    title: "Verify",
    blurb: "Gate a number somebody else produced — your software, a model, a preparer — against the law.",
    tools: ["verify_tax_claim", "verify_fact"],
  },
  {
    title: "Discover",
    blurb: "What the corpus knows: parameters, rules, verbatim statute, every input fact.",
    tools: ["lookup_tax_parameter", "search_tax_rules", "explain_rule", "list_input_facts", "is_tipped_occupation"],
  },
];

export const TOOL_ONE_LINERS: Record<string, string> = {
  calculate_tax: "Any federal individual target (default net tax) from grouped facts; includeProof adds the full proof tree.",
  compute_return: "The Form 1040 bottom-line line set from transcribed W-2, 1099 and SSA-1099 boxes.",
  compute_state_return: "The printed line set of a state's full-year-resident return, 31 states.",
  calculate_business_tax: "Form 1120 taxable income and tax, S-corp entity taxes, classification, estimates. Calculation only.",
  calculate_fiduciary_tax: "Form 1041 § 1(e) rate schedule and § 642(b) exemption.",
  determine_dependent: "§ 152 qualifying child or qualifying relative, with proof.",
  compare_filing_statuses: "The same facts under every eligible filing status.",
  find_tax_cliffs: "Sweep one input across a range; every discontinuity in the target.",
  verify_tax_claim: "Verified or refuted, with the correct value.",
  verify_fact: "Fact-check a claimed parameter against the corpus.",
  lookup_tax_parameter: "Dollar amounts, rates and thresholds, with citations.",
  search_tax_rules: "Does the corpus encode this? Rule discovery by keyword.",
  explain_rule: "A rule's formula, parameters, validity window and verbatim law text.",
  list_input_facts: "Every input fact: id, type, default, description.",
  is_tipped_occupation: "Whether a job is on the Treasury § 224 tipped-occupation list.",
};

export function toolByName(name: string): ToolDoc | undefined {
  return TOOLS.find((t) => t.name === name);
}

export function exampleFor(tool: string): ExampleDoc | undefined {
  return EXAMPLES.find((e) => e.tool === tool && e.ok && !e.isError);
}

/** A minimal, valid argument object for the "call it" snippet on each tool page. */
export function sampleArgs(tool: string): Record<string, unknown> {
  const ex = exampleFor(tool);
  if (ex) return ex.arguments;
  switch (tool) {
    case "calculate_fiduciary_tax":
      return { fiduciaryType: "trust", fiduciaryIncomeBeforeExemption: 45000, asOf: "2025-12-31" };
    case "determine_dependent":
      return { depRelationshipChild: true, depAge: 12, depLivedWithTaxpayerOverHalfYear: true, depProvidedOwnSupportOverHalf: false, depFilesJointReturn: false, asOf: "2025-12-31" };
    case "compare_filing_statuses":
      return { facts: { filing: { filingStatus: "mfj" }, income: { wages: 120000 }, credits: { qualifyingChildren: 2 }, asOf: "2025-12-31" } };
    case "find_tax_cliffs":
      return { facts: { filing: { filingStatus: "mfj" }, credits: { qualifyingChildren: 2 }, asOf: "2025-12-31" }, vary: "wages", fromDollars: 0, toDollars: 80000, stepDollars: 500 };
    case "verify_tax_claim":
      return { facts: { filing: { filingStatus: "mfj" }, income: { wages: 120000 }, credits: { qualifyingChildren: 2 }, asOf: "2025-12-31" }, claimedAmount: 5746 };
    case "search_tax_rules":
      return { query: "kiddie tax", asOf: "2025-12-31" };
    case "list_input_facts":
      return {};
    case "is_tipped_occupation":
      return { job: "bartender" };
    default:
      return { asOf: "2025-12-31" };
  }
}

export function curlFor(tool: string, args: unknown, key = "$OPENTAX_KEY"): string {
  const body = JSON.stringify(args, null, 2).replace(/'/g, "'\\''");
  return `curl -s ${REST_BASE}/${tool} \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;
}

export function jsFor(tool: string, args: unknown): string {
  return `const res = await fetch("${REST_BASE}/${tool}", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.OPENTAX_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(args, null, 2).split("\n").join("\n  ")}),
});
const result = await res.json();
if (!result.ok) throw new Error(\`\${result.error.code}: \${result.error.message}\`);
console.log(result);`;
}

export function pyFor(tool: string, args: unknown): string {
  return `import os, requests

res = requests.post(
    "${REST_BASE}/${tool}",
    headers={"Authorization": f"Bearer {os.environ['OPENTAX_KEY']}"},
    json=${JSON.stringify(args, null, 4).split("\n").join("\n    ")},
)
result = res.json()
assert result["ok"], result["error"]
print(result)`;
}

export function mcpFor(tool: string, args: unknown): string {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }, null, 2).replace(/'/g, "'\\''");
  return `curl -s ${MCP_URL} \\
  -H "Authorization: Bearer $OPENTAX_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '${body}'
# the answer is JSON.parse(result.content[0].text)`;
}
