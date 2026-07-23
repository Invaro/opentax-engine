/**
 * `opentax lookup <query>` — find the dollar amounts (and citations) behind
 * a plain-English question, straight from the corpus.
 */

import pc from "picocolors";
import { lookupParameters } from "@invaro/opentax-solve";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { formatMoney } from "../render/format.js";
import { EXIT, print } from "../render/output.js";

export function runLookup(
  queryWords: string[],
  flags: { asOf?: string; json?: boolean },
): number {
  const corpus = getCorpus();
  const query = queryWords.join(" ");
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);
  const hits = lookupParameters(corpus, query, asOf);

  if (flags.json) {
    print({
      ok: true,
      query,
      asOf,
      corpusMerkleRoot: corpus.merkleRoot,
      hits: hits.map((h) => ({
        ruleId: h.ruleId,
        title: h.title,
        citation: h.citation,
        effective: `[${h.effectiveFrom}, ${h.effectiveTo ?? "open"})`,
        parameters: h.parameters,
        byFilingStatus: h.byFilingStatus,
      })),
    });
    return EXIT.OK;
  }

  console.log();
  if (hits.length === 0) {
    console.log(
      `${pc.yellow("no matches")} for "${query}" — try \`opentax corpus list\` for rule titles`,
    );
    console.log();
    return EXIT.ERROR;
  }
  console.log(pc.bold(`"${query}" — as of ${asOf}:`));
  for (const h of hits) {
    console.log();
    console.log(`  ${pc.bold(h.title)}`);
    console.log(
      pc.dim(`  ${h.citation.source} · [${h.effectiveFrom}, ${h.effectiveTo ?? "open"}) · ${h.ruleId}`),
    );
    for (const [status, cents] of Object.entries(h.byFilingStatus)) {
      console.log(`    ${status.padEnd(8)} ${formatMoney(cents)}`);
    }
    for (const [name, cents] of Object.entries(h.parameters)) {
      console.log(`    ${name.padEnd(24)} ${formatMoney(cents)}`);
    }
  }
  console.log();
  return EXIT.OK;
}
