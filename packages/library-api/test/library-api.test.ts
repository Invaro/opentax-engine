/**
 * The library API contract (docs/LIBRARY-API.md), held by tests:
 *  - every export of the four packages has a tier, and the API report is current;
 *  - nothing in the last release's ID contract (baseline.json) was removed,
 *    retyped or silently changed, unless deprecations.json names it;
 *  - the documented examples run and give the documented answers.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as core from "@invaro/opentax-core";
import * as federal from "@invaro/opentax-corpus-us-federal";
import { PACKAGES, contractViolations, currentContract, exportsOf, reportFor, stableLeaks, surfaceProblems, tierOf } from "../scripts/api-report.mjs";
import { FROZEN_CASES, FROZEN_CORPUS } from "../scripts/frozen-corpus.mjs";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(here, "../..");
const json = (file: string) => JSON.parse(readFileSync(join(here, file), "utf8"));
const baseline = json("baseline.json");
const allowed = json("deprecations.json");
const surface = json("surface.json");

describe("surface: every export has a tier", () => {
  it("surface.json classifies exactly what the packages export", () => {
    expect(surfaceProblems()).toEqual([]);
  });

  it.each(Object.keys(PACKAGES))("%s: the committed API report matches the build", (pkg) => {
    const file = join(here, "report", `${PACKAGES[pkg as keyof typeof PACKAGES]}.api.md`);
    expect(readFileSync(file, "utf8"), "run: pnpm -F @invaro/opentax-library-api api:report").toBe(reportFor(pkg).text);
  });

  it("the core's runtime exports are exactly its classified values", () => {
    const declared = exportsOf("core");
    const values = Object.keys(declared).filter((n) => !["interface", "type"].includes(declared[n].kind));
    expect(Object.keys(core).sort()).toEqual(values.sort());
    for (const name of surface["@invaro/opentax-core"].stable) expect(tierOf("@invaro/opentax-core", name)).toBe("stable");
  });
});

describe("contract: nothing from the last release was broken", async () => {
  const now = await currentContract({ core, federal });

  it("the tree satisfies baseline.json (facts, ranges, defaults, rule ids and versions, extension points, errors, stable declarations)", () => {
    const violations = contractViolations(baseline, now, allowed);
    expect(violations, "a break must be announced first: see docs/LIBRARY-API.md and deprecations.json").toEqual([]);
  });

  it("the checker catches each kind of break", () => {
    const broken = structuredClone(now);
    delete broken.facts.wages;
    broken.facts.filingStatus.enumValues = ["single"];
    broken.facts.taxableInterest.hasDefault = false;
    broken.facts.qualifyingChildren.type = "money";
    broken.facts.medicalExpenses.min = "100";
    delete broken.ruleOutputs["us.federal.agi"];
    broken.ruleOutputs["us.federal.net_tax"] = "bool";
    const someVersion = Object.keys(broken.ruleHashes)[0];
    broken.ruleHashes[someVersion] = "sha256:edited";
    broken.ruleHashes["us.federal.taxable_income@1"] = "sha256:reused-number";
    broken.extensionPoints = broken.extensionPoints.slice(1);
    broken.defaultTarget = "us.federal.agi";
    broken.errors.NotModeledError = { code: "NOT_COVERED", data: [] };
    delete broken.exports["@invaro/opentax-core"].stable.evaluate;
    broken.exports["@invaro/opentax-core"].stable.verifyProof = "changed";
    const checks = contractViolations(baseline, broken, allowed).map((v) => v.check).join("\n");
    for (const expected of [
      "fact id removed", "enum value removed", "default removed", "fact retyped", "accepted range narrowed",
      "rule id removed", "rule output type changed", "published rule version edited", "does not have a higher number",
      "extension point removed", "default target changed", "error code or data fields changed",
      "stable export removed", "stable declaration changed", "breaking change without a new major version",
    ]) expect(checks).toContain(expected);
    // an announced, acknowledged change passes; a malformed entry does not
    const entry = { announcedIn: "v9.9.9", announcedOn: "2099-01-01", note: "example" };
    const onlyDefault = structuredClone(now);
    onlyDefault.facts.taxableInterest.hasDefault = false;
    expect(contractViolations(baseline, onlyDefault, { ...allowed, removedDefaults: { taxableInterest: entry } })).toEqual([]);
    expect(contractViolations(baseline, onlyDefault, { ...allowed, removedDefaults: { taxableInterest: { note: "no dates" } } })).not.toEqual([]);
  });

  it("no stable declaration leans on a provisional or internal type", () => {
    expect(stableLeaks()).toEqual([]);
  });

  it("our ids leave room for yours: rule ids start with a jurisdiction prefix, fact ids have no dot, underscore or hyphen", () => {
    expect(Object.keys(now.ruleOutputs).filter((id) => !/^us\.[a-z]/.test(id))).toEqual([]);
    expect(Object.keys(now.facts).filter((id) => !/^[a-z][A-Za-z0-9]*$/.test(id))).toEqual([]);
  });
});

describe("frozen corpus: hashes and proofs made by core 0.1.0 (v0.52.0) still hold", () => {
  const frozen = json("frozen/expected.json");
  const corpus = core.loadCorpus(structuredClone(FROZEN_CORPUS));

  it("was frozen with the released engine, not this one", () => {
    expect(frozen.engine).toEqual({ name: "@invaro/opentax-core", version: "0.1.0" });
  });

  it("the Merkle root and every rule hash are unchanged", () => {
    expect(corpus.merkleRoot).toBe(frozen.merkleRoot);
    expect(Object.fromEntries(corpus.ruleHashes)).toEqual(frozen.ruleHashes);
  });

  it.each(FROZEN_CASES.map((c, i) => [c.name, c, frozen.cases[i]] as const))("%s", (_name, c, was) => {
    const run = () => core.evaluate(corpus, core.coerceFacts(corpus, c.facts), { asOf: c.asOf, target: c.target });
    if (was.error) {
      expect(c.error).toBe(was.error);
      try {
        run();
        expect.unreachable("should have refused");
      } catch (e) {
        expect((e as core.OpenTaxError).code).toBe(was.error);
      }
      return;
    }
    // the stored proof verifies as it is, engine label 0.1.0 and all
    expect(core.verifyProof(was.proof, corpus)).toMatchObject({ ok: true, target: c.target });
    // and today's engine derives the same tree, value and assumptions, byte for byte
    const { proof } = run();
    expect(core.canonical(proof.root)).toBe(core.canonical(was.proof.root));
    expect(proof.assumptions).toEqual(was.proof.assumptions);
    expect(proof.facts).toEqual(was.proof.facts);
    expect(proof.corpus).toEqual(was.proof.corpus);
    expect(proof.schemaVersion).toBe(was.proof.schemaVersion);
  });
});

describe("hashing cannot be fooled or moved", () => {
  it("an object edited after it was hashed gets a new hash", () => {
    const o = { a: 1, nested: { b: "x" } };
    const before = core.hashOf(o);
    o.nested.b = "y";
    expect(core.canonical(o)).toBe('{"a":1,"nested":{"b":"y"}}');
    expect(core.hashOf(o)).not.toBe(before);
  });

  it("a proof edited in place fails verification", () => {
    const corpus = core.loadCorpus(structuredClone(FROZEN_CORPUS));
    const { proof } = core.evaluate(corpus, core.coerceFacts(corpus, { income: 85000, status: "single" }), { asOf: "2025-06-30", target: "demo.guarded" });
    expect(core.verifyProof(proof, corpus).ok).toBe(true);
    proof.root.value = { type: "money", value: "1" };
    expect(core.verifyProof(proof, corpus)).toMatchObject({ ok: false, reason: "artifact-hash-mismatch" });
  });

  it("a rule edited between two loads changes the Merkle root", () => {
    const input = structuredClone(FROZEN_CORPUS);
    const first = core.loadCorpus(input).merkleRoot;
    (input.rules[0].formula as { args: unknown[] }).args.push({ kind: "money", cents: "100" });
    expect(core.loadCorpus(input).merkleRoot).not.toBe(first);
  });

  it("ids sort the same in every locale: a fixed order, no Intl", () => {
    const ids = ["demo.ab", "demo.aB", "demo.a_b", "demo.a.b", "demo.a1", "demo.A-b", "demo.a", "Demo.a", "demo.b", "démo"];
    expect([...ids].sort(core.compareIds)).toEqual(["demo.a", "Demo.a", "demo.a_b", "demo.A-b", "demo.a.b", "demo.a1", "demo.ab", "demo.aB", "demo.b", "démo"]);
    // the published corpus's root does not move with the machine's language
    for (const dir of ["core", "corpus-us-federal", "solve", "compose"]) {
      for (const file of readdirSync(join(root, "packages", dir, "src"), { recursive: true }) as string[]) {
        if (!file.endsWith(".ts")) continue;
        const text = readFileSync(join(root, "packages", dir, "src", file), "utf8");
        expect(text, `${dir}/src/${file}: sort with compareIds, format with an explicit locale`).not.toMatch(/\.localeCompare\(|toLocaleString\(\)|new Intl\.Collator\(\)/);
      }
    }
  });
});

describe("inputs: what coerceFacts and evaluate accept", () => {
  const corpus = federal.getCorpus();
  it.each([
    ["a number of dollars", { wages: 50000 }, "5000000"],
    ["a string of dollars and cents", { wages: "1234.56" }, "123456"],
    ["a string of whole dollars", { wages: "50000" }, "5000000"],
  ])("money as %s", (_n, plain, cents) => {
    expect(core.coerceFacts(corpus, plain)).toEqual({ wages: { type: "money", value: cents } });
  });
  it("counts, booleans and enums", () => {
    expect(core.coerceFacts(corpus, { qualifyingChildren: 2, isBlind: true, filingStatus: "mfj" })).toEqual({
      qualifyingChildren: { type: "int", value: "2" },
      isBlind: { type: "bool", value: true },
      filingStatus: { type: "enum", value: "mfj" },
    });
  });
  it.each([
    ["an unknown fact", () => core.coerceFacts(corpus, { wagez: 1 }), "wagez"],
    ["a non-number for money", () => core.coerceFacts(corpus, { wages: true }), "wages"],
    ["a fractional count", () => core.coerceFacts(corpus, { qualifyingChildren: 1.5 }), "qualifyingChildren"],
    ["an enum value that isn't one", () => core.evaluate(corpus, core.coerceFacts(corpus, { filingStatus: "married" }), { asOf: "2025-12-31", target: "us.federal.agi" }), "filingStatus"],
    ["a value below the minimum", () => core.evaluate(corpus, { wages: { type: "money", value: "-100" } }, { asOf: "2025-12-31", target: "us.federal.agi" }), "wages"],
    ["a fact that isn't a typed value", () => core.evaluate(corpus, { wages: { type: "money", value: "500.00" } }, { asOf: "2025-12-31", target: "us.federal.agi" }), "wages"],
    ["plain facts passed without coerceFacts", () => core.evaluate(corpus, { wages: 50000 } as never, { asOf: "2025-12-31", target: "us.federal.agi" }), "wages"],
  ])("%s is FACT_INVALID and names the fact", (_n, run, factId) => {
    try {
      run();
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(core.FactValidationError);
      expect((e as core.FactValidationError).toJSON()).toMatchObject({ code: "FACT_INVALID", data: { factId } });
    }
  });
  it("a malformed formula is CORPUS_INVALID at load, with every problem listed", () => {
    const bad = structuredClone(FROZEN_CORPUS);
    bad.rules[0].formula = { kind: "add", args: [{ kind: "money", cents: "12.5" }, { kind: "nope" }, { kind: "mulRate", base: { kind: "money", cents: "1" }, rate: { num: "1", den: "0" }, round: "half-up" }] } as never;
    try {
      core.loadCorpus(bad);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(core.CorpusValidationError);
      const issues = ((e as core.CorpusValidationError).data().issues as string[]).join("\n");
      expect(issues).toContain("money.cents must be a whole-number string");
      expect(issues).toContain('unknown expression kind "nope"');
      expect(issues).toContain("zero denominator");
    }
  });
});

describe("extension points move their totals the way the document says", () => {
  const facts = { filingStatus: "single", wages: 80000, isAtLeastAge25: true };
  const at = { asOf: "2025-12-31" } as const;
  const base = federal.getCorpus();
  const value = (corpus: core.LoadedCorpus, target: string, extra = {}) =>
    (core.evaluate(corpus, core.coerceFacts(corpus, { ...facts, ...extra }), { ...at, target }).value as { cents: bigint }).cents;
  const withContribution = (point: string) =>
    federal.extendCorpus({
      name: "firm",
      version: "1",
      facts: [{ id: "firm.amount", type: "money", description: "x", default: { value: "0", rationale: "none" } }],
      rules: [{ id: "firm.item", version: 1, jurisdiction: "us.federal", title: "x", citation: { source: "s", section: "s" }, effectiveFrom: "2025-01-01", output: { type: "money" }, formula: { kind: "fact", factId: "firm.amount" }, contributesTo: point }],
    });
  it.each([
    ["us.federal.gross_income", "us.federal.gross_income", 100_000n],
    ["us.federal.above_the_line_adjustments", "us.federal.agi", -100_000n],
    ["us.federal.other_taxes", "us.federal.net_tax", 100_000n],
    ["us.federal.refundable_credits", "us.federal.net_tax", -100_000n],
  ])("$1,000 added to %s moves %s by %s cents", (point, target, delta) => {
    const corpus = withContribution(point);
    expect(value(corpus, target, { "firm.amount": 1000 }) - value(base, target)).toBe(delta);
    expect(value(corpus, target)).toBe(value(base, target)); // and $0 changes nothing
  });
});

describe("versions", () => {
  it("ENGINE.version is the core package's version (it is written into every proof)", () => {
    const pkg = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
    expect(core.ENGINE).toEqual({ name: pkg.name, version: pkg.version });
  });
});

describe("errors: one shape, stable codes", () => {
  it("each class reports its documented code and data fields", async () => {
    expect((await currentContract({ core, federal })).errors).toEqual({
      NeedsFactsError: { code: "NEEDS_FACTS", data: ["missing"] },
      NotModeledError: { code: "NOT_MODELED", data: ["reason", "ruleId"] },
      NoApplicableRuleError: { code: "NO_APPLICABLE_RULE", data: ["asOf", "knownVersions", "ruleId"] },
      UnhandledEnumCaseError: { code: "UNHANDLED_ENUM_CASE", data: ["ruleId", "value"] },
      FactValidationError: { code: "FACT_INVALID", data: ["factId"] },
      CorpusValidationError: { code: "CORPUS_INVALID", data: ["issues"] },
      CycleError: { code: "RULE_CYCLE", data: ["path"] },
      EngineError: { code: "ENGINE_ERROR", data: [] },
    });
  });
  it("toJSON is { code, message, data } and survives JSON", () => {
    const e = new core.NotModeledError("us.federal.x", "because");
    expect(e).toBeInstanceOf(core.OpenTaxError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("NotModeledError");
    expect(JSON.parse(JSON.stringify(e))).toEqual({ code: "NOT_MODELED", message: e.message, data: { ruleId: "us.federal.x", reason: "because" } });
  });
});

describe("examples: the documented code runs and gives the documented answers", () => {
  it("01 evaluate", async () => {
    const r = (await import("../examples/01-evaluate.mjs")).run();
    expect(r.cents).toBe(564_300n); // AGENTS.md's worked example, TY2026
    expect(r.assumptions).toContain("taxableInterest");
    expect(r.corpus.merkleRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r.artifactHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("02 errors", async () => {
    const r = (await import("../examples/02-errors.mjs")).run();
    expect(r.needsFacts).toEqual({ ok: false, code: "NEEDS_FACTS", missing: expect.arrayContaining(["businessProperty1Kind", "businessProperty1HeldOverOneYear"]) });
    expect(r.strict.code).toBe("NEEDS_FACTS");
    expect(r.strict.missing).toContain("taxableInterest");
    expect(r.notModeled).toMatchObject({ ok: false, code: "NOT_MODELED", ruleId: expect.stringMatching(/^us\.federal\.form6252\./) });
    expect(r.unknownFact).toMatchObject({ ok: false, code: "FACT_INVALID" });
  });

  it("03 verify", async () => {
    const r = (await import("../examples/03-verify.mjs")).run();
    expect(r.good).toMatchObject({ ok: true, target: "us.federal.taxable_income", value: "6925000" }); // 85,000 − 15,750
    expect(r.bad).toBe("artifact-hash-mismatch");
  });

  it("04 extend", async () => {
    const m = await import("../examples/04-extend.mjs");
    const r = m.run();
    expect(r.agiWithout).toBe(6_000_000n);
    expect(r.agiWith).toBe(5_960_000n);
    expect(r.corpus.version).toMatch(/\+1\.0\.0$/);
    expect(r.differentRoot).toBe(true);
    for (const point of baseline.extensionPoints) expect(r.extensionPoints).toContain(point);
    const pin = m.overrideWithStalePin();
    expect(pin.code).toBe("CORPUS_INVALID");
    expect(String(pin.issues)).toContain("us.federal.standard_deduction@1");
  });

  it("05 solve", async () => {
    const r = (await import("../examples/05-solve.mjs")).run();
    expect(r.curve.map((p: { valueCents: bigint }) => p.valueCents)).toEqual([0n, 89_300n, 382_300n, 767_600n, 1_317_600n]);
    expect(r.rate.rateBps).toBe(1200n);
    expect(r.cliffs).toEqual([{ atCents: 1_219_999n, jumpCents: 1_600n }, { atCents: 1_220_000n, jumpCents: 345_500n }]);
    expect(r.statuses.scenarios.find((s: { value: string }) => s.value === "mfj")).toMatchObject({ ok: true, valueCents: 178_300n });
    expect(r.income).toMatchObject({ ok: true, inputCents: 5_045_000n });
  });

  it("06 projection", async () => {
    const r = (await import("../examples/06-projection.mjs")).run();
    expect(r.lastPublishedYear).toBe(2027);
    expect(r.horizon).toBe(2035);
    expect(r.corpusVersion).toContain("+projected.2030");
    expect(r.verified).toBe(true);
  });
});

describe("docs/LIBRARY-API.md", () => {
  const doc = readFileSync(join(root, "docs/LIBRARY-API.md"), "utf8");
  it.each(readdirSync(join(here, "examples")).filter((f) => f.endsWith(".mjs")))("shows examples/%s verbatim", (file) => {
    expect(doc).toContain(readFileSync(join(here, "examples", file), "utf8").trim());
  });
  it("names every stable and provisional export", () => {
    const missing: string[] = [];
    for (const pkg of Object.keys(PACKAGES)) for (const name of [...surface[pkg].stable, ...surface[pkg].provisional]) if (!doc.includes("`" + name + "`")) missing.push(`${pkg}: ${name}`);
    expect(missing).toEqual([]);
  });
  it("states the versions it describes", () => {
    for (const [pkg, dir] of Object.entries(PACKAGES)) {
      const version = JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")).version;
      expect(doc, `${pkg} ${version}`).toContain(`| \`${pkg}\` | ${version} |`);
    }
  });
});
