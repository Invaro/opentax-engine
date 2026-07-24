/**
 * `opentax lookup <query>` — find the dollar amounts (and citations) behind
 * a plain-English question, straight from the corpus.
 */

import pc from "picocolors";
import { factCheck, lookupParameters } from "@invaro/opentax-solve";
import { parseDollars } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { formatMoney } from "../render/format.js";
import { EXIT, print } from "../render/output.js";

export function runLookup(
  queryWords: string[],
  flags: { asOf?: string; json?: boolean; expect?: string; filingStatus?: string },
): number {
  const corpus = getCorpus();
  const query = queryWords.join(" ");
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);

  // --expect: fact-check a claimed amount (the MCP verify_fact behavior)
  if (flags.expect !== undefined) {
    const claimed = parseDollars(flags.expect);
    const result = factCheck(corpus, query, claimed, asOf, flags.filingStatus);
    if (result.verdict === "unknown") {
      if (flags.json) {
        print({ ok: true, query, asOf, claimed: claimed.toString(), verdict: "unknown", message: result.message });
        return EXIT.NOT_COVERED;
      }
      console.log();
      console.log(`${pc.yellow("unknown")} — ${result.message}`);
      console.log();
      return EXIT.NOT_COVERED;
    }
    if (flags.json) {
      print({
        ok: true,
        query,
        asOf,
        claimed: claimed.toString(),
        verdict: result.verdict,
        rule: result.matchedRuleId,
        field: result.matchedField,
        actual: result.actualCents,
        citation: result.citation,
        corpusMerkleRoot: corpus.merkleRoot,
      });
      return result.verdict === "verified" ? EXIT.OK : EXIT.ERROR;
    }
    console.log();
    if (result.verdict === "verified") {
      console.log(
        `${pc.green("✓ VERIFIED")} — ${formatMoney(result.actualCents)} is ${pc.bold(result.matchedField)} of ${result.matchedRuleId}`,
      );
      console.log(pc.dim(`  ${result.citation.source} ${result.citation.section ?? ""}`));
      console.log();
      return EXIT.OK;
    }
    console.log(
      `${pc.red("✗ REFUTED")} — claimed ${formatMoney(claimed.toString())}, but ${result.matchedRuleId}.${result.matchedField} is ${pc.bold(formatMoney(result.actualCents))}`,
    );
    console.log(pc.dim(`  ${result.citation.source} ${result.citation.section ?? ""}`));
    console.log();
    return EXIT.ERROR;
  }

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
