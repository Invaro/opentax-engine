#!/usr/bin/env node
/**
 * Use the packages the way a licensee does: pack the four tarballs, install
 * them with npm into an empty project (no workspace, no source), then
 *   - run every example against the installed packages,
 *   - bundle one for the browser (fails on any Node built-in),
 *   - type-check a strict TypeScript consumer of the stable types.
 * Run before publishing a release: node packages/library-api/scripts/consumer-check.mjs
 * (needs `pnpm build`; npm fetches compose's one dependency).
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(here, "../..");
const PACKAGES = ["core", "corpus-us-federal", "solve", "compose"];
const work = mkdtempSync(join(tmpdir(), "opentax-consumer-"));
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

for (const p of PACKAGES) sh("pnpm", ["pack", "--pack-destination", work], join(root, "packages", p));
const tarballs = readdirSync(work).filter((f) => f.endsWith(".tgz"));
console.log("packed:", tarballs.join(", "));
// the corpus and the solver take any core 1.x, so a core patch installs on its own
for (const t of tarballs.filter((f) => /corpus-us-federal|solve/.test(f))) {
  const dep = JSON.parse(sh("tar", ["-xOzf", join(work, t), "package/package.json"])).dependencies["@invaro/opentax-core"];
  if (!/^\^\d/.test(dep)) throw new Error(`${t} depends on core "${dep}", not a caret range`);
}
for (const t of tarballs) {
  const listing = sh("tar", ["-tzf", join(work, t)]);
  if (!listing.includes("package/README.md")) throw new Error(`${t} has no README`);
  if (/package\/(src|test)\//.test(listing)) throw new Error(`${t} ships sources or tests`);
}

const app = join(work, "app");
cpSync(join(here, "examples"), join(app, "examples"), { recursive: true });
writeFileSync(join(app, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
sh("npm", ["install", "--no-audit", "--no-fund", ...tarballs.map((t) => join(work, t)), "typescript@5", "esbuild@0.28"], app);

// 1. the examples, against the installed packages
const show = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? `${x}n` : x));
// (the same files, imported from this checkout, give the workspace's answers to compare with)
for (const file of readdirSync(join(app, "examples")).filter((f) => f.endsWith(".mjs")).sort()) {
  const installed = show((await import(pathToFileURL(join(app, "examples", file)).href)).run());
  const workspace = show((await import(pathToFileURL(join(here, "examples", file)).href)).run());
  if (installed !== workspace) throw new Error(`${file}: installed packages gave\n${installed}\nthe workspace gives\n${workspace}`);
  console.log("ok   ", file);
}

// 2. the browser: no Node built-ins anywhere in core, corpus or solve
writeFileSync(join(app, "browser.mjs"), `import { run as a } from "./examples/01-evaluate.mjs"; import { run as b } from "./examples/05-solve.mjs"; import { run as c } from "./examples/04-extend.mjs"; import { composeForm4562, composeStateReturn } from "@invaro/opentax-compose"; globalThis.out = [a(), b(), c()]; globalThis.composers = [typeof composeForm4562, typeof composeStateReturn];`);
sh(join(app, "node_modules/.bin/esbuild"), ["browser.mjs", "--bundle", "--platform=browser", "--format=esm", "--outfile=browser.bundle.js", "--log-level=error"], app);
await import(pathToFileURL(join(app, "browser.bundle.js")).href); // the bundle is self-contained: it runs with no node_modules lookups
if (globalThis.out?.length !== 3 || globalThis.out[0].cents === undefined || globalThis.composers.join() !== "function,function") throw new Error("the browser bundle did not run");
console.log("ok    browser bundle runs,", (readFileSync(join(app, "browser.bundle.js")).length / 1024 / 1024).toFixed(1), "MB");

// 3. TypeScript: a strict consumer of the stable surface compiles
writeFileSync(
  join(app, "consumer.ts"),
  `import { coerceFacts, evaluate, loadCorpus, verifyProof, NeedsFactsError, NotModeledError, OpenTaxError } from "@invaro/opentax-core";
import type { CorpusInput, EvaluateOptions, EvaluateResult, Expr, FactSpec, LoadedCorpus, MissingFact, ProofArtifact, Rule, TypedValueJSON, Value, VerifyResult } from "@invaro/opentax-core";
import { DEFAULT_TARGET, EXTENSION_POINTS, extendCorpus, getCorpus, getProjectedFederalCorpus } from "@invaro/opentax-corpus-us-federal";
import type { CorpusExtension, ExtensionPoint, ProjectionOptions } from "@invaro/opentax-corpus-us-federal";
import { compareAcross, findCliffs, invert, marginal, sweep } from "@invaro/opentax-solve";
import type { CliffResult, InvertResult, SweepResult } from "@invaro/opentax-solve";
import { composeForm2210, composeForm4562, composeStateReturn } from "@invaro/opentax-compose";

const corpus: LoadedCorpus = getCorpus();
const facts: Record<string, TypedValueJSON> = coerceFacts(corpus, { filingStatus: "single", wages: 50000 });
const options: EvaluateOptions = { asOf: "2025-12-31", target: DEFAULT_TARGET, refuseDefaults: false, allowDefaults: [] };
const result: EvaluateResult = evaluate(corpus, facts, options);
const value: Value = result.value;
const cents: bigint | null = value.type === "money" ? value.cents : null;
const proof: ProofArtifact = result.proof;
const verdict: VerifyResult = verifyProof(proof, corpus);
const point: ExtensionPoint = "us.federal.gross_income";
const formula: Expr = { kind: "fact", factId: "x" };
const fact: FactSpec = { id: "x", type: "money", description: "x", default: { value: "0", rationale: "none" } };
const rule: Rule = { id: "firm.x", version: 1, jurisdiction: "us.federal", title: "x", citation: { source: "s", section: "s", url: "https://example.com", excerpt: "e" }, effectiveFrom: "2025-01-01", output: { type: "money" }, formula, contributesTo: point };
const extension: CorpusExtension = { name: "@firm/rules", version: "1.0.0", facts: [fact], rules: [rule] };
const mine: LoadedCorpus = extendCorpus(extension);
const input: CorpusInput = { name: "own", version: "1", rules: [], facts: [] };
const own: LoadedCorpus = loadCorpus(input);
const projection: ProjectionOptions = { year: 2030, inflationPercent: "2.5" };
const future: LoadedCorpus = getProjectedFederalCorpus(projection);
const curve: SweepResult = sweep(corpus, facts, { asOf: "2025-12-31", target: DEFAULT_TARGET, vary: "wages", fromCents: 0n, toCents: 100n, stepCents: 100n });
const cliffs: CliffResult = findCliffs(corpus, facts, { asOf: "2025-12-31", target: DEFAULT_TARGET, vary: "wages", fromCents: 0n, toCents: 100n });
const inv: InvertResult = invert(corpus, facts, { asOf: "2025-12-31", target: DEFAULT_TARGET, vary: "wages", goalCents: 1n, loCents: 0n, hiCents: 100n });
try { evaluate(corpus, {}, options); } catch (e) {
  if (e instanceof NeedsFactsError) { const m: MissingFact[] = e.missing; void m; }
  else if (e instanceof NotModeledError) { const r: string = e.reason; void r; }
  else if (e instanceof OpenTaxError) { const j: { code: string; message: string; data: Record<string, unknown> } = e.toJSON(); void j; }
}
void [cents, verdict, mine, own, future, curve, cliffs, inv, marginal, compareAcross, composeForm2210, composeForm4562, composeStateReturn, Object.keys(EXTENSION_POINTS)];
`,
);
for (const resolution of ["NodeNext", "Bundler"]) {
  sh(join(app, "node_modules/.bin/tsc"), ["--noEmit", "--strict", "--target", "ES2022", "--module", resolution === "NodeNext" ? "NodeNext" : "ESNext", "--moduleResolution", resolution, "--skipLibCheck", "false", "consumer.ts"], app);
  console.log("ok    TypeScript strict consumer, moduleResolution", resolution);
}
console.log("consumer check passed in", work);
