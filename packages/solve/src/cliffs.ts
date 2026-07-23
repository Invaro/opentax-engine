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
}

export function findCliffs(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: CliffOptions,
): CliffResult {
  const step = options.stepCents ?? 100000n; // $1,000
  if (step <= 0n) throw new RangeError("stepCents must be positive");

  const at = (x: bigint) => evaluateAt(corpus, baseFacts, options, x);

  const cliffs: Cliff[] = [];
  let prevX = options.fromCents;
  let prevV = at(prevX);

  for (let x = options.fromCents + step; x <= options.toCents; x += step) {
    const v = at(x);
    // an interval hides a cliff iff the value moved MORE than the input did
    let dv = v - prevV;
    if ((dv < 0n ? -dv : dv) > x - prevX) {
      // binary search every cliff inside (prevX, x]; there may be several
      collectCliffs(at, prevX, prevV, x, v, cliffs);
    }
    prevX = x;
    prevV = v;
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
): void {
  if (hi - lo <= 1n) {
    out.push({ atCents: lo, jumpCents: hiV - loV });
    return;
  }
  const mid = (lo + hi) / 2n;
  const midV = at(mid);
  const leftJump = midV - loV;
  const rightJump = hiV - midV;
  if ((leftJump < 0n ? -leftJump : leftJump) > mid - lo) {
    collectCliffs(at, lo, loV, mid, midV, out);
  }
  if ((rightJump < 0n ? -rightJump : rightJump) > hi - mid) {
    collectCliffs(at, mid, midV, hi, hiV, out);
  }
}
