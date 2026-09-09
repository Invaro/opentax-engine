/**
 * compute_state_return — deterministic printed-form line composers for the
 * state jurisdictions in the corpus (IL-1040, VA 760, CA 540, NY IT-201, PA-40, NJ-1040, OH IT 1040, NC D-400, GA 500, MD 502, MO-1040, WI Form 1, MN M1, SC1040, AL Form 40, OR-40, OK Form 511, CT-1040, KS K-40).
 *
 * Evaluation finding: agents' state tax ARITHMETIC is oracle-exact, but they
 * transpose printed-form line numbers and drift on whole-dollar rounding when
 * composing by hand. This module fixes the composition layer the same way
 * compute_return fixed it federally: line numbers come from the printed 2025
 * forms, every line is whole-dollar rounded, and every computed component is
 * an oracle target. State-specific FACTS (additions, subtractions, credits
 * without targets, withholding splits) are agent-transcribed inputs — the
 * composer never invents them; worksheets the printed forms prescribe
 * (VA Schedule A / STA / age deduction, CA Schedule P) are computed here.
 */
import { composeCA } from "./ca.js";
import { composeGA } from "./ga.js";
import { composeIL } from "./il.js";
import { composeMD } from "./md.js";
import { composeMO } from "./mo.js";
import { composeMN } from "./mn.js";
import { composeWI } from "./wi.js";
import { composeNC } from "./nc.js";
import { composeNJ } from "./nj.js";
import { composeNY } from "./ny.js";
import { composeOH } from "./oh.js";
import { composePA } from "./pa.js";
import { composeAL } from "./al.js";
import { composeOR } from "./or.js";
import { composeOK } from "./ok.js";
import { composeCT } from "./ct.js";
import { composeKS } from "./ks.js";
import { composeAR } from "./ar.js";
import { composeNM } from "./nm.js";
import { composeNE } from "./ne.js";
import { composeID } from "./id.js";
import { composeWV } from "./wv.js";
import { composeME } from "./me.js";
import { composeRI } from "./ri.js";
import { composeMT } from "./mt.js";
import { composeDE } from "./de.js";
import { composeND } from "./nd.js";
import { composeVT } from "./vt.js";
import { composeHI } from "./hi.js";
import { composeSC } from "./sc.js";
import { composeVA } from "./va.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

export { stateReturnShape } from "./shape.js";
export type { StateReturnInput, StateTaxEvaluator } from "./types.js";

/**
 * Build the composer's StateTaxEvaluator from a generic corpus runner.
 * The fact-construction glue lives HERE (once) so every consumer — MCP tool,
 * CLI command — evaluates state targets with identical semantics. The runner
 * receives corpus-shaped typed facts and a target id and returns cents.
 */
export function makeStateTaxEvaluator(
  runTarget: (facts: Record<string, unknown>, target: string) => bigint,
  input: Record<string, unknown>,
): StateTaxEvaluator {
  return (target, stateTaxableIncomeCents, extraFacts) => {
    const facts: Record<string, unknown> = {
      stateTaxableIncome: { type: "money", value: String(stateTaxableIncomeCents) },
      filingStatus: {
        type: "enum",
        value:
          (input.filingStatus as string) ??
          (input.filingJoint ? "mfj" : input.filingHoh || input.filingHohOrQss ? "hoh" : "single"),
      },
      useFormulaMethod: { type: "bool", value: false },
      spouseItemizes: { type: "bool", value: false },
    };
    for (const [k, v] of Object.entries(extraFacts ?? {})) {
      facts[k] =
        typeof v === "boolean"
          ? { type: "bool", value: v }
          : typeof v === "number"
            ? { type: "int", value: String(v) } // plain JS number = int fact (counts)
            : typeof v === "string"
              ? { type: "enum", value: v } // string = enum fact (e.g. GA exclusion tiers)
              : { type: "money", value: String(v) };
    }
    return runTarget(facts, target);
  };
}

export function composeStateReturn(
  input: StateReturnInput,
  evalStateTax: StateTaxEvaluator,
): { lines: Record<string, string>; notes: string[] } {
  const notes: string[] = [];
  // filingStatus (when provided) is authoritative — derive the legacy flags
  const fs = (input as { filingStatus?: string }).filingStatus;
  if (fs) {
    (input as Record<string, unknown>).filingJoint = fs === "mfj";
    (input as Record<string, unknown>).filingHoh = fs === "hoh";
    (input as Record<string, unknown>).filingHohOrQss = fs === "hoh" || fs === "qss" || fs === "mfj";
  }
  const j = input.jurisdiction;
  // The AGI-based states start from federal line 11; refuse loudly rather
  // than compose on a silent $0 AGI. PA and NJ are class/category-based, and
  // SC starts from federal TAXABLE income (scFederalTaxableIncome), and AL
  // builds Alabama AGI from its own transcribed income lines, and AR builds
  // Arkansas AGI from its own lines 8-24 (federalAGI only feeds AR2441) — none
  // of the five requires federalAGI.
  if (j !== "pa" && j !== "nj" && j !== "sc" && j !== "al" && j !== "ar" && typeof input.federalAGI !== "number") {
    throw new Error("federalAGI is required for il/va/ca/ny/oh/nc/ga/md/mo/wi/mn/or/ok/ct/ks/nm/ne/id/wv/me/hi/vt state returns — run compute_return first and pass Form 1040 line 11 verbatim");
  }
  if (j === "il") return { lines: composeIL(input, evalStateTax, notes), notes };
  if (j === "va") return { lines: composeVA(input, evalStateTax, notes), notes };
  if (j === "ca") return { lines: composeCA(input, evalStateTax, notes), notes };
  if (j === "pa") return { lines: composePA(input, evalStateTax, notes), notes };
  if (j === "nj") return { lines: composeNJ(input, evalStateTax, notes), notes };
  if (j === "oh") return { lines: composeOH(input, evalStateTax, notes), notes };
  if (j === "nc") return { lines: composeNC(input, evalStateTax, notes), notes };
  if (j === "ga") return { lines: composeGA(input, evalStateTax, notes), notes };
  if (j === "md") return { lines: composeMD(input, evalStateTax, notes), notes };
  if (j === "mo") return { lines: composeMO(input, evalStateTax, notes), notes };
  if (j === "wi") return { lines: composeWI(input, evalStateTax, notes), notes };
  if (j === "mn") return { lines: composeMN(input, evalStateTax, notes), notes };
  if (j === "sc") return { lines: composeSC(input, evalStateTax, notes), notes };
  if (j === "al") return { lines: composeAL(input, evalStateTax, notes), notes };
  if (j === "or") return { lines: composeOR(input, evalStateTax, notes), notes };
  if (j === "ok") return { lines: composeOK(input, evalStateTax, notes), notes };
  if (j === "ct") return { lines: composeCT(input, evalStateTax, notes), notes };
  if (j === "ks") return { lines: composeKS(input, evalStateTax, notes), notes };
  if (j === "ar") return { lines: composeAR(input, evalStateTax, notes), notes };
  if (j === "nm") return { lines: composeNM(input, evalStateTax, notes), notes };
  if (j === "ne") return { lines: composeNE(input, evalStateTax, notes), notes };
  if (j === "id") return { lines: composeID(input, evalStateTax, notes), notes };
  if (j === "wv") return { lines: composeWV(input, evalStateTax, notes), notes };
  if (j === "me") return { lines: composeME(input, evalStateTax, notes), notes };
  if (j === "hi") return { lines: composeHI(input, evalStateTax, notes), notes };
  if (j === "ri") return { lines: composeRI(input, evalStateTax, notes), notes };
  if (j === "mt") return { lines: composeMT(input, evalStateTax, notes), notes };
  if (j === "de") return { lines: composeDE(input, evalStateTax, notes), notes };
  if (j === "nd") return { lines: composeND(input, evalStateTax, notes), notes };
  if (j === "vt") return { lines: composeVT(input, evalStateTax, notes), notes };
  return { lines: composeNY(input, evalStateTax, notes), notes };
}
