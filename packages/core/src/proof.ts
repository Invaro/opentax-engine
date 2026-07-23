/**
 * The proof artifact: a complete, self-describing derivation of an answer.
 *
 * Every node records which rule produced its value (by id, version, AND
 * content hash), the statutory citation, the resolved inputs, and its
 * sub-derivations. The artifact pins the exact corpus (Merkle root) and is
 * itself content-hashed, so any byte of tampering is detectable and any
 * honest copy is independently re-executable.
 */

import type { TypedValueJSON } from "./ast.js";
import { hashOf } from "./hash.js";
import type { Citation } from "./rule.js";

export interface Assumption {
  factId: string;
  value: TypedValueJSON;
  source: "default";
  rationale: string;
}

export interface CandidateConsidered {
  ruleId: string;
  version: number;
  priority: number;
  /** 'unknown' = the guard itself could not be evaluated (missing facts). */
  applicable: boolean | "unknown";
}

export interface DerivationNode {
  kind: "rule" | "fact" | "assumption";
  // rule nodes
  ruleId?: string;
  ruleVersion?: number;
  ruleHash?: string;
  title?: string;
  citation?: Citation;
  /** Present when this node answers a reference to a rule it overrides. */
  resolvedFrom?: string;
  /** Override resolution audit trail: every candidate and its guard result. */
  candidatesConsidered?: CandidateConsidered[];
  /** Direct dependencies by id -> resolved value. */
  inputs?: Record<string, TypedValueJSON>;
  // fact / assumption nodes
  factId?: string;
  value: TypedValueJSON;
  children?: DerivationNode[];
}

export interface ProofArtifact {
  schemaVersion: "2";
  engine: { name: string; version: string };
  corpus: { name: string; version: string; merkleRoot: string };
  asOf: string;
  target: string;
  facts: Record<string, TypedValueJSON>;
  assumptions: Assumption[];
  root: DerivationNode;
  /** sha256 of the canonical artifact minus this field. */
  artifactHash: string;
}

/** The hashable body: the artifact minus its own hash field. */
export function artifactBody(
  artifact: Omit<ProofArtifact, "artifactHash"> | ProofArtifact,
): Omit<ProofArtifact, "artifactHash"> {
  const { schemaVersion, engine, corpus, asOf, target, facts, assumptions, root } =
    artifact as ProofArtifact;
  return { schemaVersion, engine, corpus, asOf, target, facts, assumptions, root };
}

export function computeArtifactHash(
  artifact: Omit<ProofArtifact, "artifactHash"> | ProofArtifact,
): string {
  return hashOf(artifactBody(artifact));
}
