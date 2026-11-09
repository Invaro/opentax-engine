/**
 * `opentax form4562 --facts <file>` — Form 4562 depreciation (§ 179, the
 * special allowance, MACRS, listed property) from a JSON file shaped like the
 * MCP compute_form_4562 tool's input, dollars in.
 */

import { readFileSync } from "node:fs";
import pc from "picocolors";
import { composeForm4562, Form4562MissingInput, Form4562Refusal, form4562InputFromArgs } from "@invaro/opentax-compose";
import { EXIT, emitError, print } from "../render/output.js";

const fmt = (c: bigint) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}$${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(a % 100n).toString().padStart(2, "0")}`;
};

export function runForm4562(flags: { facts: string; json?: boolean }): number {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(readFileSync(flags.facts, "utf8"));
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("expected a JSON object");
  } catch (err) {
    return emitError(new Error(`cannot read ${flags.facts}: ${(err as Error).message}`), flags.json);
  }
  try {
    const form = composeForm4562(form4562InputFromArgs(args));
    if (flags.json) {
      print({
        ok: true,
        form: "4562",
        ...form,
        assets: form.assets.map((a) => ({
          ...a,
          businessBasis: fmt(a.businessBasis),
          section179Elected: fmt(a.section179Elected),
          section179Deducted: fmt(a.section179Deducted),
          specialAllowance: fmt(a.specialAllowance),
          macrsBasis: fmt(a.macrsBasis),
          depreciation: fmt(a.depreciation),
        })),
      });
      return EXIT.OK;
    }
    console.log();
    console.log(pc.bold(`Form 4562 (${form.taxYear})`));
    const width = Math.max(...Object.keys(form.lines).map((k) => k.length)) + 2;
    for (const [k, v] of Object.entries(form.lines)) console.log(`  ${k.padEnd(width)}${v}`);
    console.log();
    console.log(pc.bold("Assets"));
    for (const a of form.assets)
      console.log(
        `  ${a.id}: ${a.recoveryClass}-yr ${a.method} ${a.convention}, ${a.table} year ${a.recoveryYear} @ ${a.rate}% — § 179 ${fmt(a.section179Deducted)}, special ${fmt(a.specialAllowance)} (${a.specialAllowanceRate}%), MACRS ${fmt(a.depreciation)}`,
      );
    console.log();
    console.log(pc.bold("By activity"));
    for (const [k, v] of Object.entries(form.byActivity)) console.log(`  ${k}: ${v}`);
    console.log();
    for (const n of form.notes) console.log(pc.dim(`  ${n}`));
    console.log();
    return EXIT.OK;
  } catch (err) {
    if (err instanceof Form4562MissingInput) {
      if (flags.json) print({ ok: false, error: err.toJSON() });
      else console.error(pc.yellow(`${err.message}\n${err.missing.map((m) => `  ${m.id}: ${m.description}`).join("\n")}`));
      return EXIT.NEEDS_FACTS;
    }
    if (err instanceof Form4562Refusal) {
      if (flags.json) print({ ok: false, error: { code: "NOT_MODELED", message: err.message } });
      else console.error(pc.yellow(err.message));
      return EXIT.NOT_COVERED;
    }
    return emitError(err, flags.json);
  }
}
