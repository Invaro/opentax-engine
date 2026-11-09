// A proof is a plain JSON object: store it, send it, verify it later.
import { coerceFacts, evaluate, verifyProof } from "@invaro/opentax-core";
import { corpusForVersion, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = getCorpus();
  const { proof } = evaluate(corpus, coerceFacts(corpus, { filingStatus: "single", wages: 85000 }), {
    asOf: "2025-12-31",
    target: "us.federal.taxable_income",
  });

  const stored = JSON.parse(JSON.stringify(proof)); // survives a round trip unchanged

  // verify against the corpus the proof names (the published one, or a projection)
  const good = verifyProof(stored, corpusForVersion(stored.corpus.version));

  // any edit is caught
  const tampered = structuredClone(stored);
  tampered.root.value = { type: "money", value: "1" };
  const bad = verifyProof(tampered, corpus);

  return { good, bad: bad.ok ? "verified" : bad.reason };
}
