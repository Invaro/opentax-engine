/**
 * `opentax state --facts <file>` — compose a state return (IL-1040, VA 760,
 * CA 540, NY IT-201, PA-40, NJ-1040, OH IT 1040, NC D-400, GA 500) from a composer-facts JSON file, printing every line
 * exactly as the MCP compute_state_return tool would.
 */

import { readFileSync } from "node:fs";
import pc from "picocolors";
import { z } from "zod";
import { evaluate, OpenTaxError } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import {
  composeStateReturn,
  makeStateTaxEvaluator,
  stateReturnShape,
  type StateReturnInput,
} from "@invaro/opentax-compose";
import { EXIT, print } from "../render/output.js";

const inputSchema = z
  .object({
    ...stateReturnShape,
    filingJoint: z.boolean().optional(),
    filingHoh: z.boolean().optional(),
    filingHohOrQss: z.boolean().optional(),
  })
  .strict();

export function runState(flags: { facts: string; asOf?: string; json?: boolean }): number {
  const corpus = getCorpus();
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);
  let args: Record<string, unknown>;
  try {
    args = inputSchema.parse(JSON.parse(readFileSync(flags.facts, "utf8")));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (flags.json) {
      print({ ok: false, error: { code: "BAD_INPUT", message } });
    } else {
      console.error(pc.red(`bad facts file: ${message}`));
    }
    return EXIT.ERROR;
  }
  try {
    const evalStateTax = makeStateTaxEvaluator((facts, target) => {
      const { value } = evaluate(corpus, facts as never, { asOf, target });
      return value.type === "money" ? value.cents : 0n;
    }, args);
    const { lines, notes } = composeStateReturn(args as StateReturnInput, evalStateTax);
    if (flags.json) {
      print({
        ok: true,
        asOf,
        jurisdiction: args.jurisdiction,
        corpusMerkleRoot: corpus.merkleRoot,
        lines,
        ...(notes.length ? { notes } : {}),
      });
      return EXIT.OK;
    }
    console.log();
    console.log(pc.bold(`${String(args.jurisdiction).toUpperCase()} return — as of ${asOf}:`));
    const width = Math.max(...Object.keys(lines).map((k) => k.length)) + 2;
    for (const [line, amount] of Object.entries(lines)) {
      console.log(`  ${line.padEnd(width)}${amount}`);
    }
    if (notes.length) {
      console.log();
      for (const n of notes) console.log(pc.dim(`  ${n}`));
    }
    console.log();
    return EXIT.OK;
  } catch (err) {
    if (flags.json) {
      print(
        err instanceof OpenTaxError
          ? { ok: false, error: err.toJSON() }
          : { ok: false, error: { code: "ERROR", message: String((err as Error)?.message ?? err) } },
      );
    } else {
      console.error(pc.red(String((err as Error)?.message ?? err)));
    }
    return EXIT.ERROR;
  }
}
