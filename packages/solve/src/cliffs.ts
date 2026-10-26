/**
 * Cliff detection: find the exact dollars where one more unit of input
 * changes the answer by MORE than the input itself — an effective marginal
 * rate above 100%. These are the places where tax law punishes earning
 * (CTC phase-out steps, the EITC investment-income kill switch).
 *
 * Method: coarse sweep to flag intervals, then binary search inside each
 * flagged interval down to the exact cent boundary. Every probe is a real
 * evaluation — the reported cliff is provable, not estimated.
 */

import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";
import { evaluateAt } from "./sweep.js";

export interface CliffOptions {
  vary: string;
  fromCents: bigint;
  toCents: bigint;
  /** Coarse scan step. Default $1,000. */
  stepCents?: bigint;
  asOf: string;
  target: string;
  /**
   * Work limits for servers answering untrusted callers (HOSTED_CLIFF_LIMITS).
   * Unset: no limits, the scan runs to the end.
   */
  limits?: CliffLimits;
}

export interface CliffLimits {
  /** Refuse a scan with more coarse points than this. */
  maxScanPoints: bigint;
  /** Stop (truncated) after this many evaluations, coarse scan plus bisection. */
  maxEvaluations: number;
  /** Stop (truncated) after this many cliffs. */
  maxCliffs: number;
}

export interface Cliff {
  /** Last input (in cents) BEFORE the jump. */
  atCents: bigint;
  /** Value change when crossing from atCents to atCents + 1¢. */
  jumpCents: bigint;
}

export interface CliffResult {
  cliffs: Cliff[];
  corpusMerkleRoot: string;
  scanned: { fromCents: bigint; toCents: bigint; stepCents: bigint };
  /** True when the evaluation or cliff budget ran out before the whole range was examined. */
  truncated?: boolean;
}

/**
 * The limits the hosted API applies. A $0-$1M range at the default $1,000
 * step is 1,000 points. The evaluation cap matters for a formula whose slope
 * exceeds 1 everywhere, which would otherwise bisect down to every cent.
 */
export const HOSTED_CLIFF_LIMITS: CliffLimits = { maxScanPoints: 2000n, maxEvaluations: 4000, maxCliffs: 200 };

class BudgetExhausted extends Error {}

export function findCliffs(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: CliffOptions,
): CliffResult {
  const step = options.stepCents ?? 100000n; // $1,000
  if (step <= 0n) throw new RangeError("stepCents must be positive");
  if (options.toCents < options.fromCents) throw new RangeError("toCents must not be below fromCents");
  const limits = options.limits;
  // each coarse point is a full evaluation; an unbounded scan pins the CPU
  if (limits && (options.toCents - options.fromCents) / step > limits.maxScanPoints) {
    throw new RangeError(`scan would take more than ${limits.maxScanPoints} steps; use a larger step or a narrower range`);
  }

  let evaluations = 0;
  const cliffs: Cliff[] = [];
  const at = (x: bigint) => {
    if (limits && (++evaluations > limits.maxEvaluations || cliffs.length >= limits.maxCliffs)) throw new BudgetExhausted();
    return evaluateAt(corpus, baseFacts, options, x);
  };

  let truncated = false;
  try {
    let prevX = options.fromCents;
    let prevV = at(prevX);
    for (let x = options.fromCents + step; x <= options.toCents; x += step) {
      const v = at(x);
      // an interval hides a cliff iff the value moved MORE than the input did
      const dv = v - prevV;
      if ((dv < 0n ? -dv : dv) > x - prevX) {
        // binary search every cliff inside (prevX, x]; there may be several
        collectCliffs(at, prevX, prevV, x, v, cliffs, limits?.maxCliffs ?? Infinity);
      }
      prevX = x;
      prevV = v;
    }
  } catch (err) {
    if (!(err instanceof BudgetExhausted)) throw err;
    truncated = true;
  }

  cliffs.sort((a, b) => (a.atCents < b.atCents ? -1 : a.atCents > b.atCents ? 1 : 0));
  return {
    cliffs,
    corpusMerkleRoot: corpus.merkleRoot,
    scanned: {
      fromCents: options.fromCents,
      toCents: options.toCents,
      stepCents: step,
    },
    ...(truncated ? { truncated } : {}),
  };
}

/** Recursively bisect an interval whose value-change exceeds its width. */
function collectCliffs(
  at: (x: bigint) => bigint,
  lo: bigint,
  loV: bigint,
  hi: bigint,
  hiV: bigint,
  out: Cliff[],
  maxCliffs: number,
): void {
  if (hi - lo <= 1n) {
    if (out.length >= maxCliffs) throw new BudgetExhausted();
    out.push({ atCents: lo, jumpCents: hiV - loV });
    return;
  }
  const mid = (lo + hi) / 2n;
  const midV = at(mid);
  const leftJump = midV - loV;
  const rightJump = hiV - midV;
  if ((leftJump < 0n ? -leftJump : leftJump) > mid - lo) {
    collectCliffs(at, lo, loV, mid, midV, out, maxCliffs);
  }
  if ((rightJump < 0n ? -rightJump : rightJump) > hi - mid) {
    collectCliffs(at, mid, midV, hi, hiV, out, maxCliffs);
  }
}
