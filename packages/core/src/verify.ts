/**
 * Proof verification: given an artifact and a corpus, independently re-derive
 * the answer and confirm every node. Three distinct failure classes:
 *
 *  - artifact-hash-mismatch: the file itself was altered after creation
 *  - corpus-mismatch: the proof was made against a DIFFERENT corpus version
 *  - divergence: re-execution disagrees with the recorded derivation
 */

import { canonical } from "./canonical.js";
import type { LoadedCorpus } from "./corpus.js";
import { evaluate } from "./evaluate.js";
import { computeArtifactHash } from "./proof.js";
import type { DerivationNode, ProofArtifact } from "./proof.js";

export type VerifyResult =
  | { ok: true; target: string; value: string | boolean; corpusMerkleRoot: string }
  | {
      ok: false;
      reason:
        | "invalid-artifact"
        | "artifact-hash-mismatch"
        | "corpus-mismatch"
        | "evaluation-error"
        | "divergence";
      message: string;
      path?: string;
      expected?: string;
      actual?: string;
    };

export function verifyProof(
  artifact: ProofArtifact,
  corpus: LoadedCorpus,
): VerifyResult {
  // 1. Structural sanity — a malformed file must produce a clean failure,
  //    never an exception (the CLI promises a JSON envelope either way).
  if (
    artifact?.schemaVersion !== "2" ||
    typeof artifact.artifactHash !== "string" ||
    typeof artifact.target !== "string" ||
    typeof artifact.asOf !== "string" ||
    typeof artifact.engine?.name !== "string" ||
    typeof artifact.corpus?.merkleRoot !== "string" ||
    typeof artifact.facts !== "object" ||
    artifact.facts === null ||
    !Array.isArray(artifact.assumptions) ||
    artifact.root == null ||
    typeof artifact.root !== "object"
  ) {
    return {
      ok: false,
      reason: "invalid-artifact",
      message: "artifact is missing required fields or has an unknown schema version",
    };
  }

  // 2. Tamper detection on the artifact itself
  let recomputedHash: string;
  try {
    recomputedHash = computeArtifactHash(artifact);
  } catch (err) {
    return {
      ok: false,
      reason: "invalid-artifact",
      message: `artifact cannot be canonicalized: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (recomputedHash !== artifact.artifactHash) {
    return {
      ok: false,
      reason: "artifact-hash-mismatch",
      message: "artifact content does not match its own hash — the file was altered",
      expected: artifact.artifactHash,
      actual: recomputedHash,
    };
  }

  // 3. Corpus pinning
  if (artifact.corpus.merkleRoot !== corpus.merkleRoot) {
    return {
      ok: false,
      reason: "corpus-mismatch",
      message:
        "proof was computed against a different corpus version (Merkle root mismatch)",
      expected: artifact.corpus.merkleRoot,
      actual: corpus.merkleRoot,
    };
  }

  // 4. Independent re-derivation
  let recomputed;
  try {
    recomputed = evaluate(corpus, artifact.facts, {
      asOf: artifact.asOf,
      target: artifact.target,
    });
  } catch (err) {
    return {
      ok: false,
      reason: "evaluation-error",
      message: `re-execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (canonical(recomputed.proof.root) !== canonical(artifact.root)) {
    const path = findDivergence(artifact.root, recomputed.proof.root, "root");
    return {
      ok: false,
      reason: "divergence",
      message: `re-execution diverges from the recorded derivation at ${path ?? "root"}`,
      path: path ?? "root",
    };
  }

  if (
    canonical(recomputed.proof.assumptions) !== canonical(artifact.assumptions)
  ) {
    return {
      ok: false,
      reason: "divergence",
      message: "re-execution produced different assumptions than recorded",
      path: "assumptions",
    };
  }

  return {
    ok: true,
    target: artifact.target,
    value: artifact.root.value.value,
    corpusMerkleRoot: corpus.merkleRoot,
  };
}

/** First path where the two derivation trees differ (depth-first). */
function findDivergence(
  a: DerivationNode,
  b: DerivationNode,
  path: string,
): string | null {
  if (canonical(a) === canonical(b)) return null;
  const aKids = a.children ?? [];
  const bKids = b.children ?? [];
  const { children: _a, ...aSelf } = a;
  const { children: _b, ...bSelf } = b;
  if (canonical(aSelf) !== canonical(bSelf)) return path;
  if (aKids.length !== bKids.length) return path;
  for (let i = 0; i < aKids.length; i++) {
    const label =
      aKids[i].ruleId ?? aKids[i].factId ?? String(i);
    const divergence = findDivergence(aKids[i], bKids[i], `${path}/${label}`);
    if (divergence) return divergence;
  }
  return path;
}
