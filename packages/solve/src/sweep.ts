/**
 * Sweep one money fact across a range and evaluate the target at each point.
 * The primitive underneath marginal rates, cliff detection, and inversion.
 */

import { evaluate } from "@invaro/opentax-core";
import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";

export interface SweepOptions {
  /** Money fact id to vary (e.g. "wages"). */
  vary: string;
  fromCents: bigint;
  toCents: bigint;
  stepCents: bigint;
  asOf: string;
  target: string;
}

export interface SweepPoint {
  inputCents: bigint;
  valueCents: bigint;
}

export interface SweepResult {
  points: SweepPoint[];
  corpusMerkleRoot: string;
  target: string;
  asOf: string;
  vary: string;
}

/** Evaluate the target with `vary` set to `atCents` (all else from baseFacts). */
export function evaluateAt(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: Pick<SweepOptions, "vary" | "asOf" | "target">,
  atCents: bigint,
): bigint {
  const facts: Record<string, TypedValueJSON> = {
    ...baseFacts,
    [options.vary]: { type: "money", value: atCents.toString() },
  };
  const { value } = evaluate(corpus, facts, {
    asOf: options.asOf,
    target: options.target,
  });
  if (value.type !== "money") {
    throw new TypeError(
      `solve requires a money-valued target, got ${value.type} from ${options.target}`,
    );
  }
  return value.cents;
}

export function sweep(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: SweepOptions,
): SweepResult {
  if (options.stepCents <= 0n) throw new RangeError("stepCents must be positive");
  if (options.toCents < options.fromCents) {
    throw new RangeError("toCents must be >= fromCents");
  }
  const points: SweepPoint[] = [];
  for (let x = options.fromCents; x <= options.toCents; x += options.stepCents) {
    points.push({
      inputCents: x,
      valueCents: evaluateAt(corpus, baseFacts, options, x),
    });
  }
  return {
    points,
    corpusMerkleRoot: corpus.merkleRoot,
    target: options.target,
    asOf: options.asOf,
    vary: options.vary,
  };
}
