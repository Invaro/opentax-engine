/**
 * `opentax form2210 --facts <file>` — the estimated tax underpayment penalty
 * (Form 2210, § 6654) from a JSON file shaped like the MCP compute_form_2210
 * tool's input: { facts, payments, periods?, withholdingByDate?,
 * noPriorYearReturn?, filedAndPaidInFullOn? }, facts as flat fact ids in
 * dollars.
 */

import { readFileSync } from "node:fs";
import pc from "picocolors";
import { coerceFacts, evaluate, NeedsFactsError } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { composeForm2210, form2210InputFromArgs, MissingInput, type TypedFacts } from "@invaro/opentax-compose";
import { EXIT, emitError, print } from "../render/output.js";

export function runForm2210(flags: { facts: string; asOf?: string; json?: boolean }): number {
  const corpus = getCorpus();
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(readFileSync(flags.facts, "utf8"));
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("expected a JSON object");
  } catch (err) {
    return emitError(new Error(`cannot read ${flags.facts}: ${(err as Error).message}`), flags.json);
  }
  // the tax year's rules: a Form 2210 is always for a past or current year, never "today's law" by default
  const asOf = flags.asOf ?? (typeof args.asOf === "string" ? args.asOf : undefined);
  if (!asOf) {
    return emitError(new Error('--as-of is required (the tax year\'s year-end, e.g. 2025-12-31), or put "asOf" in the file'), flags.json);
  }
  try {
    const { facts: plainFacts, asOf: _ignored, ...options } = args;
    const facts = coerceFacts(corpus, (plainFacts ?? {}) as Record<string, unknown>) as TypedFacts;
    const run = (f: TypedFacts, target: string): bigint => {
      const { value } = evaluate(corpus, f as never, { asOf, target });
      return value.type === "money" ? value.cents : 0n;
    };
    const input = form2210InputFromArgs(options, Number(asOf.slice(0, 4)), facts, (plain) => coerceFacts(corpus, plain) as TypedFacts);
    const form = composeForm2210(input, run);
    const refused = form.penalty && "refused" in form.penalty ? form.penalty.refused : undefined;
    if (flags.json && refused) {
      print({ ok: false, error: { code: "NOT_MODELED", message: `Form 2210 penalty refused: ${refused}`, data: { form: { asOf, ...form } } } });
      return EXIT.NOT_COVERED;
    }
    if (flags.json) {
      print({ ok: true, asOf, form: "2210", ...form, corpusMerkleRoot: corpus.merkleRoot });
      return EXIT.OK;
    }
    const section = (title: string, lines: Record<string, string>) => {
      console.log(pc.bold(title));
      const width = Math.max(...Object.keys(lines).map((k) => k.length)) + 2;
      for (const [k, v] of Object.entries(lines)) console.log(`  ${k.padEnd(width)}${v}`);
      console.log();
    };
    console.log();
    section(`Form 2210 (${form.taxYear}) — Part I`, form.partI);
    if (form.noPenalty) console.log(pc.green(`  ${form.noPenalty}\n`));
    if (form.scheduleAI && "columns" in form.scheduleAI) {
      for (const col of form.scheduleAI.columns) section(`Schedule AI ${col.column}`, Object.fromEntries(Object.entries(col).filter(([k]) => k !== "column")));
    } else if (form.scheduleAI) {
      console.log(pc.yellow("Schedule AI refused:"));
      for (const r of form.scheduleAI.refused) console.log(pc.yellow(`  ${r}`));
      console.log();
    }
    for (const m of ["regular", "annualized"] as const) {
      const p = form.partIII?.[m];
      if (!p) continue;
      console.log(pc.bold(`Part III — ${m === "regular" ? "regular installments" : "annualized (Schedule AI) installments"}`));
      console.log(`  due dates  ${p.dueDates.join("  ")}`);
      for (const [line, cols] of Object.entries(p.sectionA)) console.log(`  line ${line.padEnd(4)}${cols.map((c) => c.padStart(12)).join("")}`);
      for (const w of p.worksheet) console.log(pc.dim(`  (${w.column}) ${w.amount} from ${w.from} to ${w.paidOn}: ${w.days} days at ${w.ratePercent}% = ${w.penalty}`));
      console.log(p.penalty ? `  penalty: ${pc.bold(p.penalty)}` : pc.yellow(`  ${p.refused}`));
      console.log();
    }
    if (form.penalty) {
      console.log(
        "method" in form.penalty
          ? pc.bold(`Line 19 penalty: ${form.penalty.amount} (${form.penalty.method} method${form.boxes.length ? `; box ${form.boxes.join(", ")}` : ""})`)
          : pc.yellow(form.penalty.refused),
      );
      console.log();
    }
    for (const n of form.notes) console.log(pc.dim(`  ${n}`));
    if (form.notes.length) console.log();
    return refused ? EXIT.NOT_COVERED : EXIT.OK;
  } catch (err) {
    if (err instanceof MissingInput) {
      return emitError(
        new NeedsFactsError(err.missing.map((id) => ({ factId: id, type: "money" as const, description: "Form 2210 needs this amount" }))),
        flags.json,
      );
    }
    return emitError(err, flags.json);
  }
}
