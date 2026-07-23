/**
 * ONE output contract for the whole CLI.
 *
 * Every command supports --json. In JSON mode, stdout is always a single
 * object with `ok: true | false` and nothing else is printed there:
 *
 *   success: { "ok": true,  ...command-specific fields }
 *   failure: { "ok": false, "error": { "code", "message", "data", "hint" } }
 *
 * Exit codes are stable — route on them (or on error.code):
 *
 *   0  OK
 *   2  NEEDS_FACTS   — provide the listed facts and retry
 *   3  NOT_COVERED   — the corpus doesn't encode this; don't retry
 *   1  anything else — bad input, failed verification, bug
 */

import pc from "picocolors";
import {
  NeedsFactsError,
  NoApplicableRuleError,
  NotModeledError,
  OpenTaxError,
  UnhandledEnumCaseError,
} from "@invaro/opentax-core";
import { flagFor } from "../flags.js";

export const EXIT = {
  OK: 0,
  ERROR: 1,
  NEEDS_FACTS: 2,
  NOT_COVERED: 3,
} as const;

export function hintFor(err: OpenTaxError): string {
  switch (err.code) {
    case "NEEDS_FACTS": {
      const flags = (err as NeedsFactsError).missing
        .map((m) => flagFor(m.factId))
        .filter(Boolean)
        .join(" ");
      return flags
        ? `Add ${flags} (or put the facts in your --facts file), then re-run. \`opentax facts\` lists every input.`
        : "Provide the listed facts and re-run. `opentax facts` lists every input.";
    }
    case "NO_APPLICABLE_RULE":
      return "The corpus has no rule for this date or case. Check `opentax corpus list`, or see CONTRIBUTING.md to add coverage.";
    case "UNHANDLED_ENUM_CASE":
      return "This situation isn't encoded yet, so the engine refuses instead of guessing. See the coverage table in the README, or CONTRIBUTING.md to add it.";
    case "NOT_MODELED":
      return "The corpus deliberately does not model this region of the law yet (the rule says why). The refusal is the correct answer — do not approximate around it.";
    case "FACT_INVALID":
      return "Fix the input value. `opentax facts` shows the expected type of every fact.";
    default:
      return "This looks like invalid input or a bug — please open an issue with the command you ran.";
  }
}

export function exitCodeFor(err: unknown): number {
  if (err instanceof NeedsFactsError) return EXIT.NEEDS_FACTS;
  if (err instanceof NoApplicableRuleError) return EXIT.NOT_COVERED;
  if (err instanceof UnhandledEnumCaseError) return EXIT.NOT_COVERED;
  if (err instanceof NotModeledError) return EXIT.NOT_COVERED;
  return EXIT.ERROR;
}

/** Print any error in the chosen mode; returns the exit code. */
export function emitError(err: unknown, json: boolean | undefined): number {
  const code = exitCodeFor(err);

  if (!(err instanceof OpenTaxError)) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      print({ ok: false, error: { code: "ERROR", message, data: {}, hint: hintForGeneric() } });
    } else {
      console.error(pc.red(`\nerror: ${message}\n`));
    }
    return code;
  }

  if (json) {
    print({ ok: false, error: { ...err.toJSON(), hint: hintFor(err) } });
    return code;
  }

  // human mode
  if (err instanceof NeedsFactsError) {
    console.error(pc.red("\nCannot answer without these facts:"));
    for (const m of err.missing) {
      const kind =
        m.type === "enum" && m.enumValues
          ? `enum: ${m.enumValues.join("|")}`
          : m.type === "money"
            ? "dollars"
            : m.type;
      const flag = flagFor(m.factId);
      console.error(
        `  ${pc.red("✗")} ${pc.bold(m.factId)} (${kind})${flag ? pc.dim(`  → ${flag}`) : ""}`,
      );
      console.error(`     ${pc.dim(m.description)}`);
    }
    console.error(pc.dim(`\n${hintFor(err)}\n`));
    return code;
  }

  console.error(pc.red(`\n${err.code}: ${err.message}`));
  console.error(pc.dim(`${hintFor(err)}\n`));
  return code;
}

function hintForGeneric(): string {
  return "This looks like invalid input or a bug — please open an issue with the command you ran.";
}

/** JSON-mode stdout: exactly one object, pretty-printed, no ANSI. */
export function print(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}
