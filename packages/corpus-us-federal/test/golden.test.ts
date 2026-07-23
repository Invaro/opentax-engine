/**
 * The CI gate. Every fixture is a complete scenario with exact-cents
 * expectations, and every successful evaluation must round-trip through
 * verify (untampered passes; a mutated byte fails).
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonical,
  coerceFacts,
  computeArtifactHash,
  evaluate,
  FactValidationError,
  NeedsFactsError,
  NoApplicableRuleError,
  NotModeledError,
  UnhandledEnumCaseError,
  verifyProof,
} from "@invaro/opentax-core";
import type { DerivationNode, ProofArtifact } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";

interface Fixture {
  description: string;
  facts: Record<string, unknown>;
  asOf: string;
  /** Rule to derive; defaults to the corpus DEFAULT_TARGET. */
  target?: string;
  expect: {
    valueCents?: string;
    valueBool?: boolean;
    valueEnum?: string;
    intermediates?: Record<string, string>;
    assumedFacts?: string[];
    notAssumedFacts?: string[];
    overrideApplied?: string;
    error?:
      | "NEEDS_FACTS"
      | "NO_APPLICABLE_RULE"
      | "UNHANDLED_ENUM_CASE"
      | "FACT_INVALID"
      | "NOT_MODELED";
    missingFacts?: string[];
  };
}

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

function findNode(root: DerivationNode, ruleId: string): DerivationNode | null {
  if (root.ruleId === ruleId || root.resolvedFrom === ruleId) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, ruleId);
    if (hit) return hit;
  }
  return null;
}

describe("golden fixtures (TY2025, Rev. Proc. 2024-40)", () => {
  expect(fixtureFiles.length).toBeGreaterThanOrEqual(11);

  for (const file of fixtureFiles) {
    const fixture: Fixture = JSON.parse(
      readFileSync(path.join(fixturesDir, file), "utf8"),
    );

    // deep chains (annualized installments referencing net_tax + AMT)
    // serialize large tree-form proofs — allow real time for hashing
    it(`${file}: ${fixture.description.slice(0, 80)}`, { timeout: 30_000 }, () => {
      const corpus = getCorpus();
      const facts = coerceFacts(corpus, fixture.facts);
      const target = fixture.target ?? DEFAULT_TARGET;
      const run = () =>
        evaluate(corpus, facts, { asOf: fixture.asOf, target });

      if (fixture.expect.error) {
        const errClass = {
          NEEDS_FACTS: NeedsFactsError,
          NO_APPLICABLE_RULE: NoApplicableRuleError,
          UNHANDLED_ENUM_CASE: UnhandledEnumCaseError,
          FACT_INVALID: FactValidationError,
          NOT_MODELED: NotModeledError,
        }[fixture.expect.error];
        try {
          run();
          expect.unreachable(`expected ${fixture.expect.error}`);
        } catch (err) {
          expect(err).toBeInstanceOf(errClass);
          if (fixture.expect.missingFacts) {
            expect(
              (err as NeedsFactsError).missing.map((m) => m.factId).sort(),
            ).toEqual([...fixture.expect.missingFacts].sort());
          }
        }
        return;
      }

      const { value, proof } = run();

      // exact final answer (money in cents, or a boolean/enum determination)
      if (fixture.expect.valueBool !== undefined) {
        expect(value).toEqual({ type: "bool", value: fixture.expect.valueBool });
      } else if (fixture.expect.valueEnum !== undefined) {
        expect(value).toEqual({ type: "enum", value: fixture.expect.valueEnum });
      } else {
        expect(value.type).toBe("money");
        expect(value).toEqual({
          type: "money",
          cents: BigInt(fixture.expect.valueCents!),
        });
      }

      // exact-cents intermediates, located in the derivation tree
      for (const [ruleId, cents] of Object.entries(
        fixture.expect.intermediates ?? {},
      )) {
        const node = findNode(proof.root, ruleId);
        expect(node, `derivation node for ${ruleId}`).not.toBeNull();
        expect(node!.value, ruleId).toEqual({ type: "money", value: cents });
      }

      // assumption bookkeeping
      const assumed = proof.assumptions.map((a) => a.factId);
      for (const factId of fixture.expect.assumedFacts ?? []) {
        expect(assumed, `assumed ${factId}`).toContain(factId);
      }
      for (const factId of fixture.expect.notAssumedFacts ?? []) {
        expect(assumed, `must not assume ${factId}`).not.toContain(factId);
      }

      // override audit trail
      if (fixture.expect.overrideApplied) {
        const node = findNode(proof.root, fixture.expect.overrideApplied);
        expect(node, "override node present in proof").not.toBeNull();
        expect(
          node!.candidatesConsidered?.some(
            (c) =>
              c.ruleId === fixture.expect.overrideApplied &&
              c.applicable === true,
          ),
        ).toBe(true);
      }

      // determinism: a second evaluation is byte-identical
      const second = evaluate(corpus, facts, {
        asOf: fixture.asOf,
        target,
      });
      expect(canonical(second.proof)).toBe(canonical(proof));

      // verify round-trip: honest proof passes…
      const onDisk = JSON.parse(JSON.stringify(proof)) as ProofArtifact;
      const ok = verifyProof(onDisk, corpus);
      expect(ok.ok, `verify should pass: ${JSON.stringify(ok)}`).toBe(true);

      // …a tampered value fails even if the attacker re-hashes the artifact
      const tampered = JSON.parse(JSON.stringify(proof)) as ProofArtifact;
      tampered.root.value = { type: "money", value: "1" };
      tampered.artifactHash = computeArtifactHash(tampered);
      const bad = verifyProof(tampered, corpus);
      expect(bad.ok).toBe(false);
    });
  }
});
