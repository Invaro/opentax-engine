import { describe, expect, it } from "vitest";
import {
  canonical,
  computeArtifactHash,
  evaluate,
  loadCorpus,
  verifyProof,
} from "@invaro/opentax-core";
import type { CorpusInput, ProofArtifact } from "@invaro/opentax-core";

const cite = { source: "Test Act", section: "§ 1" };

const input: CorpusInput = {
  name: "test-corpus",
  version: "0.0.1",
  rules: [
    {
      id: "test.fee",
      version: 1,
      jurisdiction: "test",
      title: "Fee",
      citation: cite,
      effectiveFrom: "2025-01-01",
      output: { type: "money" },
      formula: {
        kind: "add",
        args: [
          { kind: "money", cents: "10000" },
          { kind: "fact", factId: "surchargeCents" },
        ],
      },
    },
  ],
  facts: [
    {
      id: "surchargeCents",
      type: "money",
      description: "Surcharge",
      default: { value: "0", rationale: "none unless stated" },
    },
  ],
};

const OPTS = { asOf: "2025-06-30", target: "test.fee" } as const;

function freshProof(): ProofArtifact {
  const corpus = loadCorpus(input);
  const { proof } = evaluate(
    corpus,
    { surchargeCents: { type: "money", value: "2500" } },
    OPTS,
  );
  // round-trip through JSON like a real file on disk
  return JSON.parse(JSON.stringify(proof)) as ProofArtifact;
}

describe("verifyProof", () => {
  it("accepts an untampered proof", () => {
    const result = verifyProof(freshProof(), loadCorpus(input));
    expect(result.ok).toBe(true);
  });

  it("is deterministic: two evaluations yield byte-identical canonical proofs", () => {
    const corpus = loadCorpus(input);
    const a = evaluate(corpus, {}, OPTS).proof;
    const b = evaluate(corpus, {}, OPTS).proof;
    expect(canonical(a)).toBe(canonical(b));
  });

  it("rejects a proof whose recorded value was altered", () => {
    const proof = freshProof();
    proof.root.value = { type: "money", value: "999999" };
    const result = verifyProof(proof, loadCorpus(input));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("artifact-hash-mismatch");
  });

  it("rejects a proof whose hash field was forged to match tampering", () => {
    const proof = freshProof();
    proof.root.value = { type: "money", value: "999999" };
    // attacker re-hashes the tampered artifact so the self-hash passes...
    proof.artifactHash = computeArtifactHash(proof);
    const result = verifyProof(proof, loadCorpus(input));
    // ...but re-execution catches the divergence
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("divergence");
  });

  it("distinguishes a different corpus from tampering", () => {
    const proof = freshProof();
    const editedInput: CorpusInput = JSON.parse(JSON.stringify(input));
    editedInput.rules[0].formula = { kind: "money", cents: "10001" };
    const result = verifyProof(proof, loadCorpus(editedInput));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("corpus-mismatch");
  });

  it("reports the divergent node path", () => {
    const proof = freshProof();
    // tamper a leaf: the recorded fact value
    const leaf = proof.root.children?.find((c) => c.factId === "surchargeCents");
    expect(leaf).toBeDefined();
    leaf!.value = { type: "money", value: "1" };
    proof.root.inputs = { ...proof.root.inputs, surchargeCents: leaf!.value };
    proof.artifactHash = computeArtifactHash(proof);
    const result = verifyProof(proof, loadCorpus(input));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("divergence");
      expect(result.path).toContain("root");
    }
  });
});
