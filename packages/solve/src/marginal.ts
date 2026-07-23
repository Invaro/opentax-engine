/**
 * Marginal rate: how much of the next dollar (default: next $100) is taxed.
 * Computed as an exact difference of two real evaluations — no calculus
 * approximations, because the underlying function is exact.
 */

import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";
import { evaluateAt } from "./sweep.js";

export interface MarginalOptions {
  vary: string;
  atCents: bigint;
  /** Increment for the finite difference. Default $100. */
  deltaCents?: bigint;
  asOf: string;
  target: string;
}

export interface MarginalResult {
  atCents: bigint;
  deltaCents: bigint;
  valueAtCents: bigint;
  valueAfterCents: bigint;
  /** Marginal amount taken from the delta, in cents. */
  marginalCents: bigint;
  /** Rate in basis points (marginal / delta × 10000), rounded half-up. */
  rateBps: bigint;
  corpusMerkleRoot: string;
}

export function marginal(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: MarginalOptions,
): MarginalResult {
  const delta = options.deltaCents ?? 10000n; // $100
  if (delta <= 0n) throw new RangeError("deltaCents must be positive");
  const before = evaluateAt(corpus, baseFacts, options, options.atCents);
  const after = evaluateAt(corpus, baseFacts, options, options.atCents + delta);
  const marginalCents = after - before;
  // round-half-up bps
  const num = marginalCents * 10000n * 2n + delta;
  const rateBps = num / (delta * 2n);
  return {
    atCents: options.atCents,
    deltaCents: delta,
    valueAtCents: before,
    valueAfterCents: after,
    marginalCents,
    rateBps,
    corpusMerkleRoot: corpus.merkleRoot,
  };
}
