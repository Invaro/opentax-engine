/**
 * `opentax check` — the AI-agent guardrail.
 *
 * An agent (or a human, or another tax tool) claims a number; this command
 * independently derives the truth from the corpus and returns a verdict:
 *
 *   exit 0  VERIFIED  — the claim matches (within tolerance)
 *   exit 1  REFUTED   — the claim is wrong; the correct value is shown
 *   exit 2  NEEDS_FACTS / exit 3 NOT_COVERED — same contract as eval
 *
 * Wire it into any agent harness as a post-answer gate: if the model's
 * stated tax doesn't check out, don't ship the response.
 */

import { readFileSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import { coerceFacts, evaluate, parseDollars } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { factsFromOptions } from "../flags.js";
import { formatMoney } from "../render/format.js";
import { EXIT, emitError, print } from "../render/output.js";

export interface CheckFlags extends Record<string, unknown> {
  facts?: string;
  expect: string;
  tolerance?: string;
  asOf?: string;
  target?: string;
  proof?: string;
  json?: boolean;
}

export function runCheck(flags: CheckFlags): number {
  const corpus = getCorpus();
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);

  let plain: Record<string, unknown> = {};
  if (flags.facts) {
    try {
      plain = JSON.parse(readFileSync(flags.facts, "utf8"));
    } catch (err) {
      return emitError(
        new Error(`cannot read facts file ${flags.facts}: ${(err as Error).message}`),
        flags.json,
      );
    }
  }
  try {
    Object.assign(plain, factsFromOptions(flags));
    const target =
      flags.target ??
      (plain.federalTaxWithheld !== undefined
        ? "us.federal.balance_due"
        : DEFAULT_TARGET);

    const expected = parseDollars(flags.expect);
    const tolerance = parseDollars(flags.tolerance ?? "1"); // agents round to dollars
    const facts = coerceFacts(corpus, plain);
    const { value, proof } = evaluate(corpus, facts, { asOf, target });
    if (value.type !== "money") {
      return emitError(
        new Error(`check requires a money-valued target, got ${value.type}`),
        flags.json,
      );
    }
    const actual = value.cents;
    const diff = actual - expected;
    const abs = diff < 0n ? -diff : diff;
    const verified = abs <= tolerance;

    if (flags.proof) {
      writeFileSync(flags.proof, JSON.stringify(proof, null, 2) + "\n");
    }

    if (flags.json) {
      print({
        ok: true,
        verdict: verified ? "verified" : "refuted",
        target,
        asOf,
        claimed: expected.toString(),
        actual: actual.toString(),
        formattedClaimed: formatMoney(expected),
        formattedActual: formatMoney(actual),
        differenceCents: diff.toString(),
        toleranceCents: tolerance.toString(),
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
      });
      return verified ? EXIT.OK : EXIT.ERROR;
    }

    console.log();
    if (verified) {
      console.log(
        `${pc.green("✓ VERIFIED")}  claimed ${pc.bold(formatMoney(expected))} — the corpus derives ${pc.bold(formatMoney(actual))}${abs > 0n ? pc.dim(` (within $${(Number(tolerance) / 100).toFixed(2)} tolerance)`) : ""}`,
      );
    } else {
      console.log(
        `${pc.red("✗ REFUTED")}   claimed ${pc.bold(formatMoney(expected))}, but the law derives ${pc.bold(pc.red(formatMoney(actual)))} ${pc.dim(`(off by ${formatMoney(abs)})`)}`,
      );
      console.log(
        pc.dim(
          `  run \`opentax eval\` with the same inputs for the full cited derivation`,
        ),
      );
    }
    if (proof.assumptions.length > 0) {
      console.log(
        pc.dim(
          `  ${proof.assumptions.length} assumption(s) — if the taxpayer's situation differs, pass the real facts`,
        ),
      );
    }
    console.log(pc.dim(`  corpus ${proof.corpus.merkleRoot.slice(0, 23)}…`));
    console.log();
    return verified ? EXIT.OK : EXIT.ERROR;
  } catch (err) {
    return emitError(err, flags.json);
  }
}
