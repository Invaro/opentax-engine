// A year the IRS hasn't published: every indexed amount carried forward at an assumed rate.
import { coerceFacts, evaluate, verifyProof } from "@invaro/opentax-core";
import { corpusForVersion, getProjectedFederalCorpus, LAST_PUBLISHED_YEAR, PROJECTION_HORIZON } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const projected = getProjectedFederalCorpus({ year: 2030, inflationPercent: "2.5" });
  const { value, proof } = evaluate(projected, coerceFacts(projected, { filingStatus: "single", wages: 90000 }), {
    asOf: "2030-12-31",
    target: "us.federal.net_tax",
  });
  return {
    lastPublishedYear: LAST_PUBLISHED_YEAR,
    horizon: PROJECTION_HORIZON,
    cents: value.cents,
    corpusVersion: proof.corpus.version, // names the projection, so the proof says it is one
    verified: verifyProof(proof, corpusForVersion(proof.corpus.version)).ok,
  };
}
