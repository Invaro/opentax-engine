/**
 * Inverse queries: "what input makes the answer equal (or first reach) X?"
 * Bisection over a monotone target. Monotonicity is sample-checked first —
 * if the function isn't monotone in the range, we refuse with a structured
 * error instead of returning a plausible-but-wrong root.
 */

import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";
import { evaluateAt } from "./sweep.js";

export interface InvertOptions {
  vary: string;
  /** Find the smallest input in [lo, hi] where target >= goalCents. */
  goalCents: bigint;
  loCents: bigint;
  hiCents: bigint;
  asOf: string;
  target: string;
  /** Monotonicity sample count (default 8). */
  samples?: number;
}

export type InvertResult =
  | {
      ok: true;
      inputCents: bigint;
      valueCents: bigint;
      corpusMerkleRoot: string;
    }
  | { ok: false; reason: "not-monotone" | "goal-out-of-range"; message: string };

export function invert(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: InvertOptions,
): InvertResult {
  const at = (x: bigint) => evaluateAt(corpus, baseFacts, options, x);
  const { loCents, hiCents, goalCents } = options;
  if (hiCents <= loCents) {
    return { ok: false, reason: "goal-out-of-range", message: "empty range" };
  }

  // sample-check non-decreasing monotonicity
  const n = BigInt(Math.max(2, options.samples ?? 8));
  let prev = at(loCents);
  for (let i = 1n; i <= n; i++) {
    const x = loCents + ((hiCents - loCents) * i) / n;
    const v = at(x);
    if (v < prev) {
      return {
        ok: false,
        reason: "not-monotone",
        message: `target decreases between samples near input ${x} — bisection would be unsound here (try a narrower range)`,
      };
    }
    prev = v;
  }

  const loV = at(loCents);
  const hiV = at(hiCents);
  if (loV >= goalCents) {
    return { ok: true, inputCents: loCents, valueCents: loV, corpusMerkleRoot: corpus.merkleRoot };
  }
  if (hiV < goalCents) {
    return {
      ok: false,
      reason: "goal-out-of-range",
      message: `target only reaches ${hiV} at the top of the range (goal ${goalCents})`,
    };
  }

  let lo = loCents; // value < goal
  let hi = hiCents; // value >= goal
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    if (at(mid) >= goalCents) hi = mid;
    else lo = mid;
  }
  return {
    ok: true,
    inputCents: hi,
    valueCents: at(hi),
    corpusMerkleRoot: corpus.merkleRoot,
  };
}
