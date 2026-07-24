/**
 * Solver commands: sweep, marginal, cliffs, compare.
 * Facts come from the same --facts file + inline flags as `eval`;
 * the varied fact is overridden per data point.
 */

import { readFileSync } from "node:fs";
import pc from "picocolors";
import { coerceFacts, parseDollars } from "@invaro/opentax-core";
import type { LoadedCorpus, TypedValueJSON } from "@invaro/opentax-core";
import { compareAcross, findCliffs, invert, marginal, sweep } from "@invaro/opentax-solve";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { factsFromOptions } from "../flags.js";
import { formatMoney } from "../render/format.js";
import { EXIT, emitError, print } from "../render/output.js";

interface CommonFlags extends Record<string, unknown> {
  facts?: string;
  vary?: string;
  asOf?: string;
  target?: string;
  json?: boolean;
}

function setup(flags: CommonFlags): {
  corpus: LoadedCorpus;
  base: Record<string, TypedValueJSON>;
  vary: string;
  asOf: string;
  target: string;
} {
  const corpus = getCorpus();
  let plain: Record<string, unknown> = {};
  if (flags.facts) plain = JSON.parse(readFileSync(flags.facts, "utf8"));
  Object.assign(plain, factsFromOptions(flags));
  const base = coerceFacts(corpus, plain);
  return {
    corpus,
    base,
    vary: flags.vary ?? "wages",
    asOf: (flags.asOf as string) ?? new Date().toISOString().slice(0, 10),
    target: (flags.target as string) ?? DEFAULT_TARGET,
  };
}

const cents = (dollars: string): bigint => parseDollars(dollars);

export function runSweep(
  flags: CommonFlags & { from: string; to: string; step?: string; csv?: boolean },
): number {
  try {
    const { corpus, base, vary, asOf, target } = setup(flags);
    const result = sweep(corpus, base, {
      vary,
      fromCents: cents(flags.from),
      toCents: cents(flags.to),
      stepCents: cents(flags.step ?? "1000"),
      asOf,
      target,
    });
    if (flags.json) {
      print({
        ok: true,
        vary,
        target,
        asOf,
        corpusMerkleRoot: result.corpusMerkleRoot,
        points: result.points.map((p) => ({
          input: p.inputCents.toString(),
          value: p.valueCents.toString(),
        })),
      });
      return EXIT.OK;
    }
    if (flags.csv) {
      console.log(`${vary}_cents,${target.replaceAll(".", "_")}_cents`);
      for (const p of result.points) {
        console.log(`${p.inputCents},${p.valueCents}`);
      }
      return EXIT.OK;
    }
    console.log();
    console.log(pc.bold(`${target} as ${vary} varies (as of ${asOf})`));
    for (const p of result.points) {
      console.log(
        `  ${formatMoney(p.inputCents).padStart(14)}  →  ${formatMoney(p.valueCents)}`,
      );
    }
    console.log(pc.dim(`\n${result.points.length} exact evaluations · corpus ${result.corpusMerkleRoot.slice(0, 23)}…\n`));
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}

export function runMarginal(
  flags: CommonFlags & { at: string; delta?: string },
): number {
  try {
    const { corpus, base, vary, asOf, target } = setup(flags);
    const m = marginal(corpus, base, {
      vary,
      atCents: cents(flags.at),
      deltaCents: flags.delta ? cents(flags.delta) : undefined,
      asOf,
      target,
    });
    if (flags.json) {
      print({
        ok: true,
        vary,
        target,
        asOf,
        at: m.atCents.toString(),
        delta: m.deltaCents.toString(),
        valueAt: m.valueAtCents.toString(),
        valueAfter: m.valueAfterCents.toString(),
        marginal: m.marginalCents.toString(),
        rateBps: m.rateBps.toString(),
        corpusMerkleRoot: m.corpusMerkleRoot,
      });
      return EXIT.OK;
    }
    const pct = (Number(m.rateBps) / 100).toFixed(2);
    console.log();
    console.log(
      `${pc.bold("marginal rate")} at ${vary} = ${formatMoney(m.atCents)}: ${pc.bold(pc.green(`${pct}%`))}`,
    );
    console.log(
      pc.dim(
        `  next ${formatMoney(m.deltaCents)} of ${vary} → ${formatMoney(m.marginalCents)} more ${m.marginalCents < 0n ? "refund" : "tax"} (${formatMoney(m.valueAtCents)} → ${formatMoney(m.valueAfterCents)})`,
      ),
    );
    console.log();
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}

export function runCliffs(
  flags: CommonFlags & { from: string; to: string; step?: string },
): number {
  try {
    const { corpus, base, vary, asOf, target } = setup(flags);
    const result = findCliffs(corpus, base, {
      vary,
      fromCents: cents(flags.from),
      toCents: cents(flags.to),
      stepCents: flags.step ? cents(flags.step) : undefined,
      asOf,
      target,
    });
    if (flags.json) {
      print({
        ok: true,
        vary,
        target,
        asOf,
        corpusMerkleRoot: result.corpusMerkleRoot,
        cliffs: result.cliffs.map((c) => ({
          at: c.atCents.toString(),
          jump: c.jumpCents.toString(),
        })),
      });
      return EXIT.OK;
    }
    console.log();
    if (result.cliffs.length === 0) {
      console.log(
        `${pc.green("no cliffs")} in ${vary} ∈ [${formatMoney(result.scanned.fromCents)}, ${formatMoney(result.scanned.toCents)}] — every marginal rate ≤ 100%`,
      );
    } else {
      console.log(pc.bold(`${result.cliffs.length} cliff(s) found:`));
      for (const c of result.cliffs) {
        console.log(
          `  ${pc.red("▮")} at ${pc.bold(formatMoney(c.atCents))}: one more cent of ${vary} costs ${pc.red(formatMoney(c.jumpCents))}`,
        );
      }
    }
    console.log(pc.dim(`\nevery probe is a real corpus evaluation · ${result.corpusMerkleRoot.slice(0, 23)}…\n`));
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}

export function runInvert(
  flags: CommonFlags & { goal: string; lo: string; hi: string },
): number {
  try {
    const { corpus, base, vary, asOf, target } = setup(flags);
    const result = invert(corpus, base, {
      vary,
      goalCents: cents(flags.goal),
      loCents: cents(flags.lo),
      hiCents: cents(flags.hi),
      asOf,
      target,
    });
    if (flags.json) {
      print(
        result.ok
          ? {
              ok: true,
              vary,
              target,
              asOf,
              input: result.inputCents.toString(),
              value: result.valueCents.toString(),
              corpusMerkleRoot: result.corpusMerkleRoot,
            }
          : { ok: false, reason: result.reason, message: result.message },
      );
      return result.ok ? EXIT.OK : EXIT.NOT_COVERED;
    }
    console.log();
    if (!result.ok) {
      console.log(`${pc.yellow(result.reason)} — ${result.message}`);
      console.log();
      return EXIT.NOT_COVERED;
    }
    console.log(
      `${pc.bold(formatMoney(result.inputCents))} is the smallest ${pc.bold(flags.vary as string)} where ${target} first reaches ${formatMoney(cents(flags.goal))}`,
    );
    console.log(pc.dim(`  exact value there: ${formatMoney(result.valueCents)} · corpus ${result.corpusMerkleRoot.slice(0, 23)}…`));
    console.log();
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}

export function runCompare(flags: CommonFlags): number {
  try {
    const { corpus, base, asOf, target } = setup(flags);
    const vary = flags.vary ?? "filingStatus";
    // comparing across filing statuses: the MFS column needs the
    // spouse-itemizes fact — assume "no" for the comparison and say so,
    // instead of showing NEEDS_FACTS mid-table
    let mfsAssumed = false;
    if (vary === "filingStatus" && base.spouseItemizes === undefined) {
      base.spouseItemizes = { type: "bool", value: false }; // typed, post-coercion
      mfsAssumed = true;
    }
    const result = compareAcross(corpus, base, { vary, asOf, target });
    if (flags.json) {
      print({
        ok: true,
        vary,
        target,
        asOf,
        corpusMerkleRoot: result.corpusMerkleRoot,
        scenarios: result.scenarios.map((s) => ({
          value: s.value,
          ok: s.ok,
          ...(s.ok
            ? { result: s.valueCents!.toString() }
            : { errorCode: s.errorCode, errorMessage: s.errorMessage }),
        })),
      });
      return EXIT.OK;
    }
    console.log();
    console.log(pc.bold(`${target} by ${vary} (as of ${asOf})`));
    const best = result.scenarios
      .filter((s) => s.ok)
      .reduce<bigint | null>(
        (min, s) => (min === null || s.valueCents! < min ? s.valueCents! : min),
        null,
      );
    for (const s of result.scenarios) {
      if (s.ok) {
        const mark = s.valueCents === best ? pc.green(" ← lowest") : "";
        console.log(`  ${s.value.padEnd(8)} ${formatMoney(s.valueCents!)}${mark}`);
      } else {
        console.log(
          `  ${s.value.padEnd(8)} ${pc.dim(`${s.errorCode}: ${s.errorMessage?.slice(0, 60)}`)}`,
        );
      }
    }
    console.log();
    if (mfsAssumed) {
      console.log(pc.dim("  (mfs column assumes the spouse does not itemize — pass --spouse-itemizes if they do)"));
    }
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}
