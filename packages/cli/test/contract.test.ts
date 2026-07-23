/**
 * The agent contract, locked: --json always yields one object with `ok`,
 * errors carry { code, message, data, hint }, and exit codes are stable.
 * (Runs against dist — `pnpm build` first, as CI does.)
 */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { FACT_FLAGS, FLAG_EXEMPT_FACTS, flagFor } from "../src/flags.js";

const cli = path.join(import.meta.dirname, "..", "dist", "bin.js");

function run(args: string[]): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("node", [cli, ...args], {
      encoding: "utf8",
      // full proofs with the Schedule A election exceed the 1 MiB default
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    return { code: e.status, stdout: e.stdout ?? "" };
  }
}

describe.skipIf(!existsSync(cli))("CLI agent contract (--json)", () => {
  it("success: ok=true with value, formatted, assumptions, proof; exit 0", () => {
    const { code, stdout } = run([
      "eval", "--status", "mfj", "--wages", "120000", "--kids", "2",
      "--as-of", "2025-12-31", "--json",
    ]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    // OBBBA TY2025: std deduction $31,500 -> tax $10,143.00; CTC 2 x $2,200
    expect(out.value).toEqual({ type: "money", value: "574600" });
    expect(out.formatted).toBe("$5,746.00"); // Tax Table method (matches the printed IRS table)
    expect(Array.isArray(out.assumptions)).toBe(true);
    expect(out.proof.root.citation.source).toContain("26 U.S.C.");
  });

  it("temporal versioning: the same facts answer differently as of TY2026", () => {
    const { code, stdout } = run([
      "eval", "--status", "mfj", "--wages", "120000", "--kids", "2",
      "--as-of", "2026-07-06", "--json",
    ]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    // Rev. Proc. 2025-32: std $32,200 -> table tax $10,043.00; CTC 2 x $2,200
    expect(out.formatted).toBe("$5,643.00");
  });

  it("missing facts: NEEDS_FACTS with data.missing and a hint; exit 2", () => {
    const { code, stdout } = run(["eval", "--wages", "50000", "--json"]);
    expect(code).toBe(2);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("NEEDS_FACTS");
    expect(out.error.data.missing.map((m: { factId: string }) => m.factId)).toEqual([
      "filingStatus",
    ]);
    expect(out.error.hint).toContain("--status");
  });

  it("uncovered case: exit 3, structured code", () => {
    // all five filing statuses are covered now — an out-of-window date is
    // the remaining (permanent) way to hit NOT_COVERED
    const { code, stdout } = run([
      "eval", "--status", "single", "--wages", "50000",
      "--as-of", "2024-06-30", "--json",
    ]);
    expect(code).toBe(3);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("NO_APPLICABLE_RULE");
    expect(out.error.hint.length).toBeGreaterThan(0);
  });

  it("MFS is covered and demands the spouse-itemizes fact honestly", () => {
    const missing = run(["eval", "--status", "mfs", "--wages", "50000", "--json"]);
    expect(missing.code).toBe(2);
    expect(JSON.parse(missing.stdout).error.data.missing[0].factId).toBe(
      "spouseItemizes",
    );
    const ok = run([
      "eval", "--status", "mfs", "--wages", "50000",
      "--as-of", "2025-12-31", "--json",
    ].concat([]));
    // still exit 2 without the fact; now provide it
    const done = run([
      "eval", "--status", "mfs", "--wages", "50000", "--spouse-itemizes",
      "--as-of", "2025-12-31", "--json",
    ]);
    expect(done.code).toBe(0);
    expect(JSON.parse(done.stdout).formatted).toBe("$5,920.00");
    expect(ok.code).toBe(2);
  });

  it("refunds: negative net tax flows through the JSON envelope; exit 0", () => {
    const { code, stdout } = run([
      "eval", "--status", "hoh", "--wages", "20000", "--kids", "2",
      "--as-of", "2025-12-31", "--json",
    ]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    // EITC $7,152 + ACTC $2,625 on zero tax -> net -$9,777 (a refund)
    expect(out.value).toEqual({ type: "money", value: "-977700" });
    expect(out.formatted).toBe("-$9,777.00");
  });

  it("facts --json: discoverable input catalog", () => {
    const { code, stdout } = run(["facts", "--json"]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.ok).toBe(true);
    const wages = out.facts.find((f: { id: string }) => f.id === "wages");
    expect(wages.required).toBe(true);
    expect(wages.type).toBe("money");
  });

  it("check: refutes a wrong claim (exit 1) and verifies a right one (exit 0)", () => {
    const wrong = run([
      "check", "--status", "mfj", "--wages", "120000", "--kids", "2",
      "--expect", "6600", "--as-of", "2026-07-07", "--json",
    ]);
    expect(wrong.code).toBe(1);
    const w = JSON.parse(wrong.stdout);
    expect(w.verdict).toBe("refuted");
    expect(w.formattedActual).toBe("$5,643.00");

    const right = run([
      "check", "--status", "mfj", "--wages", "120000", "--kids", "2",
      "--expect", "5643", "--as-of", "2026-07-07", "--json",
    ]);
    expect(right.code).toBe(0);
    expect(JSON.parse(right.stdout).verdict).toBe("verified");
  });

  it("plain-English filing-status aliases normalize", () => {
    const { code, stdout } = run([
      "eval", "--status", "Married Filing Jointly", "--wages", "120000",
      "--kids", "2", "--as-of", "2026-07-07", "--json",
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).formatted).toBe("$5,643.00");
  });

  it("a malformed proof file yields a clean JSON error, never a stack trace", () => {
    const bad = path.join(tmpdir(), `opentax-bad-proof-${process.pid}.json`);
    // valid JSON, but missing corpus/facts/assumptions — must not crash
    writeFileSync(
      bad,
      JSON.stringify({
        schemaVersion: "1",
        artifactHash: "sha256:junk",
        target: "x",
        asOf: "2025-12-31",
        root: {},
      }),
    );
    const { code, stdout } = run(["verify", bad, "--json"]);
    expect(code).toBe(1);
    const out = JSON.parse(stdout); // throws if a stack trace polluted stdout
    expect(out.ok).toBe(false);
    expect(out.error.code).toContain("VERIFY");
  });
});

describe("flag table completeness", () => {
  it("every corpus fact has an inline flag (or a conscious FLAG_EXEMPT_FACTS entry)", () => {
    const factIds = getCorpus().facts.map((f) => f.id);
    for (const id of factIds) {
      if (FLAG_EXEMPT_FACTS.has(id)) continue;
      expect(flagFor(id), `fact "${id}" needs an entry in cli/src/flags.ts`).toBeDefined();
    }
  });

  it("every flag maps to a real corpus fact", () => {
    const factIds = new Set(getCorpus().facts.map((f) => f.id));
    for (const f of FACT_FLAGS) {
      expect(factIds.has(f.factId), `flag ${f.option} maps to unknown fact "${f.factId}"`).toBe(true);
    }
  });
});
