// Evaluate one answer and read its proof.
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = getCorpus(); // validated and hashed once, then cached

  // plain values in (money in dollars), typed facts out. An unknown id or a wrong type throws FACT_INVALID here;
  // evaluate checks enum values and ranges, with the same code.
  const facts = coerceFacts(corpus, { filingStatus: "mfj", wages: 120000, qualifyingChildren: 2 });

  const { value, proof } = evaluate(corpus, facts, { asOf: "2026-12-31", target: DEFAULT_TARGET });

  return {
    cents: value.type === "money" ? value.cents : null, // bigint cents; negative = refund
    assumptions: proof.assumptions.map((a) => a.factId), // every default the answer rests on
    corpus: proof.corpus, // { name, version, merkleRoot }
    artifactHash: proof.artifactHash,
  };
}
