import pc from "picocolors";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { EXIT, print } from "../render/output.js";

/** `opentax facts` — list every input the corpus understands. */
export function runFacts(flags: { json?: boolean } = {}): number {
  const corpus = getCorpus();

  if (flags.json) {
    print({
      ok: true,
      moneyFormat:
        'dollars: 50000, "$50,000", or "1234.56" (strings for cent precision)',
      facts: corpus.facts.map((f) => ({
        id: f.id,
        type: f.type,
        ...(f.enumValues ? { enumValues: f.enumValues } : {}),
        required: f.default === undefined,
        ...(f.default !== undefined
          ? { default: f.default.value, defaultRationale: f.default.rationale }
          : {}),
        description: f.description,
      })),
    });
    return EXIT.OK;
  }

  console.log();
  console.log(pc.bold("Facts the corpus understands"));
  console.log(
    pc.dim('Money is written in dollars: 50000, "$50,000", or "1234.56".\n'),
  );
  for (const f of corpus.facts) {
    const kind =
      f.type === "enum" && f.enumValues
        ? `enum: ${f.enumValues.join("|")}`
        : f.type === "money"
          ? "dollars"
          : f.type;
    const dflt =
      f.default !== undefined
        ? pc.dim(` (default: ${String(f.default.value)})`)
        : pc.yellow(" (required)");
    console.log(`  ${pc.bold(f.id)} ${pc.dim(`[${kind}]`)}${dflt}`);
    console.log(`    ${pc.dim(f.description)}`);
  }
  console.log();
  console.log(pc.dim("Example: opentax eval --status mfj --wages 120000 --kids 2"));
  console.log();
  return EXIT.OK;
}
