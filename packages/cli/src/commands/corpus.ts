import pc from "picocolors";
import { corpusInput, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { EXIT, print } from "../render/output.js";

/**
 * Full corpus as JSON — the input an INDEPENDENT verifier (e.g. the Python
 * kernel in kernel/) needs to re-derive proofs without this codebase.
 */
export function runCorpusExport(): number {
  const corpus = getCorpus();
  print({
    name: corpusInput.name,
    version: corpusInput.version,
    merkleRoot: corpus.merkleRoot,
    rules: corpusInput.rules,
    facts: corpusInput.facts,
  });
  return EXIT.OK;
}

export function runCorpusHash(flags: { json?: boolean } = {}): number {
  const corpus = getCorpus();
  if (flags.json) {
    print({
      ok: true,
      name: corpus.name,
      version: corpus.version,
      ruleCount: corpus.rules.length,
      factCount: corpus.facts.length,
      merkleRoot: corpus.merkleRoot,
    });
    return EXIT.OK;
  }
  console.log(`${corpus.name}@${corpus.version}`);
  console.log(`${corpus.rules.length} rules, ${corpus.facts.length} facts`);
  console.log(corpus.merkleRoot);
  return EXIT.OK;
}

export function runCorpusList(flags: { asOf?: string; json?: boolean }): number {
  const corpus = getCorpus();
  const rules = flags.asOf
    ? corpus.rules.filter(
        (r) =>
          r.effectiveFrom <= flags.asOf! &&
          (r.effectiveTo === undefined || flags.asOf! < r.effectiveTo),
      )
    : corpus.rules;

  const sorted = [...rules].sort(
    (a, b) => a.id.localeCompare(b.id) || a.version - b.version,
  );

  if (flags.json) {
    print({
      ok: true,
      merkleRoot: corpus.merkleRoot,
      rules: sorted.map((r) => ({
        id: r.id,
        version: r.version,
        title: r.title,
        citation: r.citation,
        effectiveFrom: r.effectiveFrom,
        ...(r.effectiveTo ? { effectiveTo: r.effectiveTo } : {}),
        ...(r.overrides ? { overrides: r.overrides } : {}),
        hash: corpus.ruleHashes.get(`${r.id}@${r.version}`),
      })),
    });
    return EXIT.OK;
  }

  console.log();
  for (const r of sorted) {
    console.log(
      `${pc.bold(r.id)} ${pc.dim(`v${r.version}`)}  ${pc.dim(`[${r.effectiveFrom}, ${r.effectiveTo ?? "open"})`)}`,
    );
    console.log(`  ${r.title} ${pc.dim(`— ${r.citation.source}`)}`);
  }
  console.log();
  console.log(pc.dim(`${sorted.length} rules · ${corpus.merkleRoot}`));
  return EXIT.OK;
}
