/**
 * Extending the corpus with your own rules.
 *
 * An extension adds facts and rules on top of the federal corpus and plugs
 * them in two ways:
 *
 *  - Contribute to a named extension point (EXTENSION_POINTS): set
 *    `contributesTo` on a money rule and its value is added to that total.
 *    The total's own formula is untouched, so a later release that changes
 *    it doesn't break you, and the proof shows your item as its own node.
 *  - Replace a sub-computation: a rule with `overrides: { ruleId, priority }`
 *    and an applicability guard wins over our rule whenever its guard holds.
 *    Every rule you override must be pinned in `pins` to the exact hash of
 *    our version you built against; if a release changes that rule, loading
 *    fails instead of silently computing with a stale replacement.
 *
 * The result is an ordinary LoadedCorpus whose Merkle root covers both the
 * federal corpus and your extension, so evaluate() and verifyProof() work
 * unchanged and every proof names exactly what produced it.
 */
import { CorpusValidationError, loadCorpus } from "@invaro/opentax-core";
import type { FactSpec, LoadedCorpus, Rule } from "@invaro/opentax-core";
import { corpusInput, getCorpus } from "./index.js";

/**
 * The totals an extension may add to. These ids and their meaning are
 * stable across releases; a change to any of them is a breaking change.
 */
export const EXTENSION_POINTS = {
  "us.federal.gross_income":
    "Gross income (Form 1040 line 9 before adjustments). Add income items; a negative value reduces it, e.g. an allowed business or rental loss, or the § 172 NOL deduction (Schedule 1 line 8a).",
  "us.federal.above_the_line_adjustments":
    "Adjustments to income (Schedule 1 Part II, before the student-loan interest deduction). A positive value lowers AGI.",
  "us.federal.other_taxes":
    "Other taxes (Schedule 2 Part II). A positive value raises total tax.",
  "us.federal.refundable_credits":
    "Refundable credits and other payments counted as credits. A positive value lowers net tax.",
} as const;

export type ExtensionPoint = keyof typeof EXTENSION_POINTS;

export interface CorpusExtension {
  /** Your extension's name, e.g. "@yourfirm/opentax-rules". */
  name: string;
  /** Your extension's version; the combined corpus reports `<ours>+<yours>`. */
  version: string;
  /** New facts. Ids must not collide with the federal catalog. */
  facts?: FactSpec[];
  /**
   * New rules. Ids must not collide with federal rule ids; use your own
   * prefix. They may reference any federal rule or fact.
   */
  rules?: Rule[];
  /**
   * `"ruleId@version" -> "sha256:…"` for every federal rule you override
   * (copy the value from corpus.lock.json). A pin that no longer matches
   * refuses to load.
   */
  pins?: Record<string, string>;
}

/** The federal corpus plus your extension, validated and hashed as one. */
export function extendCorpus(extension: CorpusExtension): LoadedCorpus {
  const issues: string[] = [];
  const baseRuleIds = new Set(corpusInput.rules.map((r) => r.id));
  const baseFactIds = new Set(corpusInput.facts.map((f) => f.id));
  const baseHashes = getCorpus().ruleHashes;
  const rules = extension.rules ?? [];
  const facts = extension.facts ?? [];
  const pins = extension.pins ?? {};

  if (!extension.name || !extension.version) issues.push("an extension needs a name and a version");
  for (const f of facts) {
    if (baseFactIds.has(f.id)) issues.push(`fact "${f.id}" already exists in the federal corpus`);
  }
  for (const r of rules) {
    if (baseRuleIds.has(r.id)) {
      issues.push(`rule "${r.id}" already exists in the federal corpus; give yours its own id and use overrides or contributesTo`);
    }
    if (r.contributesTo !== undefined && !(r.contributesTo in EXTENSION_POINTS)) {
      issues.push(
        `rule "${r.id}" contributes to "${r.contributesTo}", which is not an extension point (${Object.keys(EXTENSION_POINTS).join(", ")})`,
      );
    }
    if (r.overrides && baseRuleIds.has(r.overrides.ruleId)) {
      const pinned = Object.keys(pins).some((k) => k.slice(0, k.lastIndexOf("@")) === r.overrides!.ruleId);
      if (!pinned) {
        issues.push(`rule "${r.id}" overrides "${r.overrides.ruleId}"; pin the version you built against in pins`);
      }
    }
  }
  for (const [key, hash] of Object.entries(pins)) {
    const current = baseHashes.get(key);
    if (current === undefined) {
      const id = key.slice(0, key.lastIndexOf("@"));
      const versions = [...baseHashes.keys()].filter((k) => k.startsWith(`${id}@`));
      issues.push(
        `pinned rule ${key} is not in this corpus${versions.length ? ` (it now has ${versions.join(", ")}); review the change notes and re-pin` : ""}`,
      );
    } else if (current !== hash) {
      issues.push(`pinned rule ${key} has changed (now ${current}); review the change notes and re-pin`);
    }
  }
  if (issues.length > 0) throw new CorpusValidationError(issues);

  return loadCorpus({
    name: `${corpusInput.name}+${extension.name}`,
    version: `${corpusInput.version}+${extension.version}`,
    rules: [...corpusInput.rules, ...rules],
    facts: [...corpusInput.facts, ...facts],
  });
}
