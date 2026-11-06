import { readFileSync, writeFileSync } from "node:fs";
import pc from "picocolors";
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { DEFAULT_TARGET } from "@invaro/opentax-corpus-us-federal";
import { corpusForFlags, projectionLabel, type ProjectionFlags } from "../projection.js";
import { factsFromOptions } from "../flags.js";
import { formatValue } from "../render/format.js";
import { EXIT, emitError, print } from "../render/output.js";
import { renderSummary } from "../render/summary.js";
import { renderProof } from "../render/tree.js";

export interface EvalFlags extends Record<string, unknown>, ProjectionFlags {
  facts?: string;
  asOf?: string;
  target?: string;
  proof?: string;
  json?: boolean;
  brief?: boolean;
  assumptions?: boolean;
  refuseDefaults?: boolean;
  allowDefault?: string[];
  // plus the inline fact flags declared in flags.ts (status, wages, kids, …)
}

export function runEval(flags: EvalFlags): number {
  // default: current law — today's date selects the rule versions in force now
  const asOf = flags.asOf ?? new Date().toISOString().slice(0, 10);
  let corpus;
  try {
    corpus = corpusForFlags(asOf, flags);
  } catch (err) {
    return emitError(err, flags.json);
  }
  const projected = projectionLabel(asOf, flags, corpus);

  let plain: Record<string, unknown> = {};
  if (flags.facts) {
    try {
      plain = JSON.parse(readFileSync(flags.facts, "utf8"));
    } catch (err) {
      return emitError(
        new Error(`cannot read facts file ${flags.facts}: ${(err as Error).message}`),
        flags.json,
      );
    }
  }
  try {
    Object.assign(plain, factsFromOptions(flags));

    // withholding given -> the question becomes "balance due / refund expected"
    const target =
      flags.target ??
      (plain.federalTaxWithheld !== undefined ||
      plain.federalEstimatedPayments !== undefined ||
      plain.federalExtensionPayment !== undefined
        ? "us.federal.balance_due"
        : DEFAULT_TARGET);

    const facts = coerceFacts(corpus, plain);
    const { value, proof } = evaluate(corpus, facts, {
      asOf,
      target,
      refuseDefaults: flags.refuseDefaults === true,
      allowDefaults: flags.allowDefault,
    });

    if (flags.proof) {
      writeFileSync(flags.proof, JSON.stringify(proof, null, 2) + "\n");
    }

    if (flags.json) {
      print({
        ok: true,
        target,
        asOf,
        value: proof.root.value,
        formatted: formatValue(proof.root.value),
        assumptions: proof.assumptions,
        ...(projected ? { projected } : {}),
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
        proof,
      });
    } else {
      const summary = renderSummary(proof);
      console.log();
      if (projected) console.log(pc.yellow(pc.bold(`PROJECTED ${projected.taxYear} — not published law (C-CPI-U +${projected.inflationPercent}%/yr, wages +${projected.wageGrowthPercent}%/yr assumed)`)) + "\n");
      if (summary) {
        console.log(summary);
        console.log();
      }
      if (flags.brief && summary) {
        console.log(
          pc.dim(
            `every number above is a node of a verified derivation — run without --brief for the full proof tree with citations`,
          ),
        );
      } else {
        console.log(renderProof(proof, { allAssumptions: flags.assumptions }));
      }
      if (flags.proof) console.log(pc.dim(`proof written to ${flags.proof}`));
      console.log();
    }
    return EXIT.OK;
  } catch (err) {
    return emitError(err, flags.json);
  }
}
