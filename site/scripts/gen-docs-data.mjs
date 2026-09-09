#!/usr/bin/env node
/**
 * Copies the generated API documentation artifacts (docs/api, docs/coverage)
 * into site/src/lib/docs so the docs pages can import them at build time.
 * The site is deployed with `site/` as its root, so repo-level files are not
 * reachable from the build — the copies are committed, like the MCP bundle.
 *
 *   node site/scripts/gen-docs-data.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const out = resolve(here, "../src/lib/docs");
mkdirSync(out, { recursive: true });

const tools = JSON.parse(readFileSync(join(repo, "docs/api/tools.json"), "utf8"));
const coverage = JSON.parse(readFileSync(join(repo, "docs/coverage/coverage-matrix.json"), "utf8"));
const openapi = JSON.parse(readFileSync(join(repo, "docs/api/openapi.json"), "utf8"));

// tools: name, description, inputSchema — exactly what tools/list returns
writeFileSync(
  join(out, "tools.json"),
  JSON.stringify(
    {
      corpusVersion: tools.corpusVersion,
      merkleRoot: tools.merkleRoot,
      generated: openapi.info?.["x-generated"] ?? null,
      tools: tools.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    },
    null,
    0,
  ),
);

// examples: request arguments + decoded result, proof trees trimmed to keep pages light
const exDir = join(repo, "docs/api/examples");
const index = JSON.parse(readFileSync(join(exDir, "INDEX.json"), "utf8"));
const examples = index.map((e) => {
  const j = JSON.parse(readFileSync(join(exDir, e.file), "utf8"));
  const result = j.decodedResult ?? j.response?.result ?? null;
  let trimmed = result;
  let proofTrimmed = false;
  if (result && typeof result === "object" && "proof" in result) {
    const { proof, ...rest } = result;
    trimmed = { ...rest, proof: "(proof tree omitted here — every response carries the full tree; see /docs/returns)" };
    proofTrimmed = Boolean(proof);
  }
  return {
    file: e.file,
    tool: e.tool,
    ok: e.ok,
    summary: e.summary,
    title: e.file.replace(/^\d+-/, "").replace(/\.json$/, "").replace(/-/g, " "),
    arguments: j.request?.params?.arguments ?? {},
    result: trimmed,
    proofTrimmed,
    isError: Boolean(j.response?.result?.isError),
  };
});
writeFileSync(join(out, "examples.json"), JSON.stringify(examples, null, 0));

writeFileSync(join(out, "coverage.json"), JSON.stringify(coverage, null, 0));

console.log(
  `wrote ${out}: ${tools.tools.length} tools, ${examples.length} examples, ${coverage.states.length} states (corpus ${tools.corpusVersion})`,
);
