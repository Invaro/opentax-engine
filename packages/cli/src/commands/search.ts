/**
 * `opentax search <query>` — full-text search over the encoded law: rule ids,
 * titles, parameter names, and the statutory citations/excerpts themselves.
 * Coverage answers, not values: a hit means the engine computes this; zero
 * hits means it is outside the corpus. Same machinery as the MCP
 * search_tax_rules tool.
 */

import pc from "picocolors";
import { searchRules } from "@invaro/opentax-solve";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { EXIT, print } from "../render/output.js";

export function runSearch(
  queryWords: string[],
  flags: { asOf?: string; limit?: string; json?: boolean },
): number {
  const corpus = getCorpus();
  const query = queryWords.join(" ");
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);
  const limit = flags.limit ? Number(flags.limit) : 8;
  const hits = searchRules(corpus, query, asOf, limit);

  if (flags.json) {
    print({
      ok: true,
      query,
      asOf,
      covered: hits.length > 0,
      corpusMerkleRoot: corpus.merkleRoot,
      hits: hits.map((h) => ({
        ruleId: h.ruleId,
        title: h.title,
        jurisdiction: h.jurisdiction,
        citation: `${h.citation.source} ${h.citation.section ?? ""}`.trim(),
        effective: `[${h.effectiveFrom}, ${h.effectiveTo ?? "open"})`,
        excerpt: h.snippet,
        hasDollarParameters: h.hasParameters,
      })),
    });
    return EXIT.OK;
  }

  console.log();
  if (hits.length === 0) {
    console.log(
      `${pc.yellow("not covered")} — no corpus rule matches "${query}" (the engine would refuse rather than guess here)`,
    );
    console.log();
    return EXIT.NOT_COVERED;
  }
  console.log(pc.bold(`"${query}" — ${hits.length} rule${hits.length === 1 ? "" : "s"}, as of ${asOf}:`));
  for (const h of hits) {
    console.log();
    console.log(`  ${pc.bold(h.title)}`);
    console.log(
      pc.dim(`  ${h.citation.source} · [${h.effectiveFrom}, ${h.effectiveTo ?? "open"}) · ${h.ruleId}`),
    );
    console.log(`  ${pc.dim("“")}${h.snippet}${pc.dim("”")}`);
  }
  console.log(pc.dim(`\nnext: \`opentax explain <ruleId>\` for a formula · \`opentax lookup ${query}\` for dollar amounts\n`));
  return EXIT.OK;
}
