// The solver layer: every point is a real evaluation.
import { coerceFacts } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { compareAcross, findCliffs, invert, marginal, sweep } from "@invaro/opentax-solve";

export function run() {
  const corpus = getCorpus();
  const base = coerceFacts(corpus, { filingStatus: "single", wages: 50000, isAtLeastAge25: true });
  const at = { asOf: "2026-12-31", target: "us.federal.net_tax" };

  return {
    curve: sweep(corpus, base, { ...at, vary: "wages", fromCents: 0n, toCents: 10_000_000n, stepCents: 2_500_000n }).points,
    rate: marginal(corpus, base, { ...at, vary: "wages", atCents: 5_000_000n }),
    cliffs: findCliffs(
      corpus,
      coerceFacts(corpus, { filingStatus: "hoh", wages: 30000, qualifyingChildren: 2, isAtLeastAge25: true }),
      { ...at, vary: "taxableInterest", fromCents: 1_000_000n, toCents: 1_400_000n },
    ).cliffs,
    statuses: compareAcross(corpus, base, { ...at, vary: "filingStatus" }),
    income: invert(corpus, base, { ...at, vary: "wages", goalCents: 387_500n, loCents: 3_000_000n, hiCents: 10_000_000n }),
  };
}
