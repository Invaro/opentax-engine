import { readFileSync } from "node:fs";
import pc from "picocolors";
import { verifyProof } from "@invaro/opentax-core";
import type { ProofArtifact } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { formatValue } from "../render/format.js";
import { EXIT, emitError, print } from "../render/output.js";

export function runVerify(proofPath: string, flags: { json?: boolean }): number {
  let artifact: ProofArtifact;
  try {
    artifact = JSON.parse(readFileSync(proofPath, "utf8"));
  } catch (err) {
    return emitError(
      new Error(`cannot read proof ${proofPath}: ${(err as Error).message}`),
      flags.json,
    );
  }

  // verifyProof returns structured failures; the catch is a last-resort
  // guarantee that the --json contract survives even an unexpected throw.
  let result: ReturnType<typeof verifyProof>;
  try {
    result = verifyProof(artifact, getCorpus());
  } catch (err) {
    return emitError(err, flags.json);
  }

  if (flags.json) {
    if (result.ok) {
      print({
        ok: true,
        verified: true,
        target: result.target,
        value: artifact.root.value,
        formatted: formatValue(artifact.root.value),
        asOf: artifact.asOf,
        corpusMerkleRoot: result.corpusMerkleRoot,
        artifactHash: artifact.artifactHash,
      });
      return EXIT.OK;
    }
    print({
      ok: false,
      verified: false,
      error: {
        code: `VERIFY_${result.reason.toUpperCase().replaceAll("-", "_")}`,
        message: result.message,
        data: {
          reason: result.reason,
          ...(result.path ? { path: result.path } : {}),
          ...(result.expected ? { expected: result.expected } : {}),
          ...(result.actual ? { actual: result.actual } : {}),
        },
        hint:
          result.reason === "corpus-mismatch"
            ? "The proof was made against a different corpus version. Re-evaluate with the installed corpus, or install the corpus version it names."
            : "This proof does not check out. Do not trust its answer; re-run `opentax eval` to derive a fresh one.",
      },
    });
    return EXIT.ERROR;
  }

  if (result.ok) {
    console.log();
    console.log(`${pc.green("✓ VERIFIED")}  ${pc.bold(artifact.target)}`);
    console.log(
      `  value      ${pc.green(formatValue(artifact.root.value))} (as of ${artifact.asOf})`,
    );
    console.log(`  corpus     ${result.corpusMerkleRoot}`);
    console.log(`  artifact   ${artifact.artifactHash}`);
    console.log(
      pc.dim(
        "  independently re-derived from the corpus; every node matches the recorded derivation",
      ),
    );
    console.log();
    return EXIT.OK;
  }

  console.error();
  console.error(`${pc.red("✗ VERIFICATION FAILED")}  (${result.reason})`);
  console.error(`  ${result.message}`);
  if (result.path) console.error(`  divergence at: ${pc.bold(result.path)}`);
  if (result.expected) console.error(`  expected: ${result.expected}`);
  if (result.actual) console.error(`  actual:   ${result.actual}`);
  console.error();
  return EXIT.ERROR;
}
