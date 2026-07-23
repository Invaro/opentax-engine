/**
 * Structured errors. The one failure mode this engine can never have is
 * wrong-but-plausible: anything it cannot derive, it refuses loudly and
 * says exactly what is missing.
 */

import type { ValueType } from "./ast.js";

/**
 * Every failure follows ONE shape: { code, message, data }.
 *
 *   code    — stable machine string (route on this, never on message text)
 *   message — one human sentence
 *   data    — structured details specific to the code
 *
 * Three families, by what the caller should do next:
 *   NEEDS_FACTS                              -> provide more input, retry
 *   NOT COVERED (NO_APPLICABLE_RULE,
 *                UNHANDLED_ENUM_CASE)        -> the corpus doesn't encode this;
 *                                              don't retry, extend the corpus
 *   everything else                          -> a mistake (bad input, bad
 *                                              corpus, engine bug); fix it
 */
export class OpenTaxError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }

  /** Structured, code-specific details. Subclasses override. */
  data(): Record<string, unknown> {
    return {};
  }

  /** The whole error as one JSON-safe object. */
  toJSON(): { code: string; message: string; data: Record<string, unknown> } {
    return { code: this.code, message: this.message, data: this.data() };
  }
}

export interface MissingFact {
  factId: string;
  type: ValueType;
  enumValues?: string[];
  description: string;
}

/** Evaluation reached facts that were neither provided nor defaulted. */
export class NeedsFactsError extends OpenTaxError {
  readonly missing: MissingFact[];
  constructor(missing: MissingFact[]) {
    super(
      "NEEDS_FACTS",
      `cannot evaluate: missing fact(s): ${missing.map((m) => m.factId).join(", ")}`,
    );
    this.missing = missing;
  }
  override data(): Record<string, unknown> {
    return { missing: this.missing };
  }
}

export class CycleError extends OpenTaxError {
  readonly path: string[];
  constructor(path: string[]) {
    super("RULE_CYCLE", `rule dependency cycle: ${path.join(" -> ")}`);
    this.path = path;
  }
  override data(): Record<string, unknown> {
    return { path: this.path };
  }
}

/** No temporally valid / applicable rule for this id as of the given date. */
export class NoApplicableRuleError extends OpenTaxError {
  readonly ruleId: string;
  readonly asOf: string;
  readonly knownVersions: {
    version: number;
    effectiveFrom: string;
    effectiveTo?: string;
  }[];
  constructor(
    ruleId: string,
    asOf: string,
    knownVersions: { version: number; effectiveFrom: string; effectiveTo?: string }[],
  ) {
    super(
      "NO_APPLICABLE_RULE",
      `no applicable rule "${ruleId}" as of ${asOf}` +
        (knownVersions.length
          ? ` (known versions: ${knownVersions
              .map((v) => `v${v.version} [${v.effectiveFrom}, ${v.effectiveTo ?? "open"})`)
              .join("; ")})`
          : " (rule id unknown)"),
    );
    this.ruleId = ruleId;
    this.asOf = asOf;
    this.knownVersions = knownVersions;
  }
  override data(): Record<string, unknown> {
    return {
      ruleId: this.ruleId,
      asOf: this.asOf,
      knownVersions: this.knownVersions,
    };
  }
}

/** Evaluation entered a region of law the corpus deliberately does not model. */
export class NotModeledError extends OpenTaxError {
  readonly ruleId: string;
  readonly reason: string;
  constructor(ruleId: string, reason: string) {
    super(
      "NOT_MODELED",
      `rule "${ruleId}" does not model this situation: ${reason} (refusing to guess)`,
    );
    this.ruleId = ruleId;
    this.reason = reason;
  }
  override data(): Record<string, unknown> {
    return { ruleId: this.ruleId, reason: this.reason };
  }
}

/** A `match` hit an enum value the corpus does not cover. Fail loud, never guess. */
export class UnhandledEnumCaseError extends OpenTaxError {
  readonly ruleId: string;
  readonly value: string;
  constructor(ruleId: string, value: string) {
    super(
      "UNHANDLED_ENUM_CASE",
      `rule "${ruleId}" has no case for value "${value}" — this input is not covered by the corpus (refusing to guess)`,
    );
    this.ruleId = ruleId;
    this.value = value;
  }
  override data(): Record<string, unknown> {
    return { ruleId: this.ruleId, value: this.value };
  }
}

export class CorpusValidationError extends OpenTaxError {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      "CORPUS_INVALID",
      `corpus failed validation:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
    );
    this.issues = issues;
  }
  override data(): Record<string, unknown> {
    return { issues: this.issues };
  }
}

export class FactValidationError extends OpenTaxError {
  constructor(message: string) {
    super("FACT_INVALID", message);
  }
}

/** Internal invariant violation (a bug in engine or corpus typing). */
export class EngineError extends OpenTaxError {
  constructor(message: string) {
    super("ENGINE_ERROR", message);
  }
}
