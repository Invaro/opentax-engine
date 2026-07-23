/**
 * Compare the answer across values of one enum fact (e.g. filing status).
 * Each scenario is a full, independent evaluation; scenarios that fail
 * (missing facts, not covered) are reported as such rather than dropped.
 */

import { evaluate, OpenTaxError } from "@invaro/opentax-core";
import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";

export interface CompareOptions {
  /** Enum fact to vary (e.g. "filingStatus"). */
  vary: string;
  /** Values to try; defaults to the fact's declared enumValues. */
  values?: string[];
  asOf: string;
  target: string;
}

export interface CompareResult {
  corpusMerkleRoot: string;
  scenarios: {
    value: string;
    ok: boolean;
    valueCents?: bigint;
    errorCode?: string;
    errorMessage?: string;
  }[];
}

export function compareAcross(
  corpus: LoadedCorpus,
  baseFacts: Record<string, TypedValueJSON>,
  options: CompareOptions,
): CompareResult {
  const spec = corpus.factById.get(options.vary);
  if (!spec || spec.type !== "enum") {
    throw new TypeError(`compare requires an enum fact, got "${options.vary}"`);
  }
  const values = options.values ?? spec.enumValues ?? [];

  const scenarios = values.map((value) => {
    const facts: Record<string, TypedValueJSON> = {
      ...baseFacts,
      [options.vary]: { type: "enum", value },
    };
    try {
      const { value: result } = evaluate(corpus, facts, {
        asOf: options.asOf,
        target: options.target,
      });
      if (result.type !== "money") {
        throw new TypeError(`compare requires a money target, got ${result.type}`);
      }
      return { value, ok: true, valueCents: result.cents };
    } catch (err) {
      if (err instanceof OpenTaxError) {
        return { value, ok: false, errorCode: err.code, errorMessage: err.message };
      }
      throw err;
    }
  });

  return { corpusMerkleRoot: corpus.merkleRoot, scenarios };
}
