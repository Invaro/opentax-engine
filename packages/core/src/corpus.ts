/**
 * Corpus loading: validation, indexing, temporal selection, content hashing.
 * Everything that can be rejected at load time is rejected here, so the
 * evaluator never has to decide anything ambiguous at question-answering time.
 */

import { walkExpr } from "./ast.js";
import type { Expr } from "./ast.js";
import { CorpusValidationError, NoApplicableRuleError } from "./errors.js";
import { merkleRoot, ruleHash } from "./hash.js";
import type { CorpusInput, FactSpec, Rule } from "./rule.js";

export interface LoadedCorpus {
  name: string;
  version: string;
  rules: Rule[];
  facts: FactSpec[];
  merkleRoot: string;
  /** `${id}@${version}` -> `sha256:<hex>` */
  ruleHashes: Map<string, string>;
  byId: Map<string, Rule[]>;
  factById: Map<string, FactSpec>;
  /** target rule id -> rules that override it */
  overriders: Map<string, Rule[]>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function loadCorpus(input: CorpusInput): LoadedCorpus {
  const issues: string[] = [];

  const byId = new Map<string, Rule[]>();
  const factById = new Map<string, FactSpec>();
  const overriders = new Map<string, Rule[]>();

  for (const fact of input.facts) {
    if (factById.has(fact.id)) issues.push(`duplicate fact id "${fact.id}"`);
    factById.set(fact.id, fact);
    if (fact.type === "enum" && !fact.enumValues?.length) {
      issues.push(`enum fact "${fact.id}" must declare enumValues`);
    }
  }

  const seenVersions = new Set<string>();
  for (const rule of input.rules) {
    const key = `${rule.id}@${rule.version}`;
    if (seenVersions.has(key)) issues.push(`duplicate rule version "${key}"`);
    seenVersions.add(key);

    if (!ISO_DATE.test(rule.effectiveFrom)) {
      issues.push(`rule "${key}": invalid effectiveFrom "${rule.effectiveFrom}"`);
    }
    if (rule.effectiveTo !== undefined) {
      if (!ISO_DATE.test(rule.effectiveTo)) {
        issues.push(`rule "${key}": invalid effectiveTo "${rule.effectiveTo}"`);
      } else if (rule.effectiveTo <= rule.effectiveFrom) {
        issues.push(`rule "${key}": empty validity window`);
      }
    }

    const list = byId.get(rule.id) ?? [];
    list.push(rule);
    byId.set(rule.id, list);

    if (rule.overrides) {
      const list = overriders.get(rule.overrides.ruleId) ?? [];
      list.push(rule);
      overriders.set(rule.overrides.ruleId, list);
      if (rule.overrides.priority <= 0) {
        issues.push(
          `rule "${key}": override priority must be > 0 (base rule has implicit priority 0)`,
        );
      }
      if (!rule.applicability) {
        issues.push(
          `rule "${key}": an override must declare an applicability guard`,
        );
      }
    }

    validateExpressions(rule, byIdRefChecker(input), factById, issues);
  }

  // Overlapping validity windows for the same rule id are rejected —
  // "which version applies today" must never be ambiguous.
  for (const [id, versions] of byId) {
    const sorted = [...versions].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    for (let i = 0; i + 1 < sorted.length; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.effectiveTo === undefined || next.effectiveFrom < cur.effectiveTo) {
        issues.push(
          `rule "${id}": overlapping validity windows (v${cur.version} and v${next.version})`,
        );
      }
    }
  }

  // Override targets must exist and be type-compatible; priority ties among
  // overriders of the same target are rejected outright.
  for (const [targetId, list] of overriders) {
    const targets = byId.get(targetId);
    if (!targets) {
      issues.push(`override target "${targetId}" does not exist`);
      continue;
    }
    const targetType = targets[0].output.type;
    const prios = new Map<number, string>();
    for (const rule of list) {
      if (rule.output.type !== targetType) {
        issues.push(
          `rule "${rule.id}" overrides "${targetId}" but output type ${rule.output.type} != ${targetType}`,
        );
      }
      const p = rule.overrides!.priority;
      const existing = prios.get(p);
      if (existing !== undefined && existing !== rule.id) {
        issues.push(
          `rules "${existing}" and "${rule.id}" both override "${targetId}" at priority ${p}`,
        );
      }
      prios.set(p, rule.id);
    }
  }

  if (issues.length > 0) throw new CorpusValidationError(issues);

  const ruleHashes = new Map<string, string>();
  for (const rule of input.rules) {
    ruleHashes.set(`${rule.id}@${rule.version}`, ruleHash(rule));
  }

  return {
    name: input.name,
    version: input.version,
    rules: input.rules,
    facts: input.facts,
    merkleRoot: merkleRoot(input.rules, input.facts),
    ruleHashes,
    byId,
    factById,
    overriders,
  };
}

function byIdRefChecker(input: CorpusInput): Set<string> {
  return new Set(input.rules.map((r) => r.id));
}

function validateExpressions(
  rule: Rule,
  knownRuleIds: Set<string>,
  factById: Map<string, FactSpec>,
  issues: string[],
): void {
  const key = `${rule.id}@${rule.version}`;
  const exprs: Expr[] = [rule.formula];
  if (rule.applicability) exprs.push(rule.applicability);
  for (const root of exprs) {
    walkExpr(root, (e) => {
      switch (e.kind) {
        case "add":
        case "min":
        case "max":
        case "and":
        case "or":
          if (e.args.length === 0) {
            issues.push(`rule "${key}": empty ${e.kind} expression`);
          }
          break;
        case "rule":
          if (!knownRuleIds.has(e.ruleId)) {
            issues.push(`rule "${key}" references unknown rule "${e.ruleId}"`);
          }
          break;
        case "fact":
          if (!factById.has(e.factId)) {
            issues.push(`rule "${key}" references unknown fact "${e.factId}"`);
          }
          break;
        case "param":
          if (!rule.parameters || !(e.name in rule.parameters)) {
            issues.push(`rule "${key}" references unknown parameter "${e.name}"`);
          }
          break;
        case "brackets": {
          if (e.table.length === 0) {
            issues.push(`rule "${key}": empty bracket table`);
            break;
          }
          if (e.table[0].threshold !== "0") {
            issues.push(
              `rule "${key}": first bracket threshold must be "0" (lower bounds)`,
            );
          }
          for (let i = 0; i + 1 < e.table.length; i++) {
            if (BigInt(e.table[i].threshold) >= BigInt(e.table[i + 1].threshold)) {
              issues.push(
                `rule "${key}": bracket thresholds must be strictly ascending`,
              );
              break;
            }
          }
          for (const row of e.table) {
            if (BigInt(row.rate.den) === 0n) {
              issues.push(`rule "${key}": bracket rate with zero denominator`);
            }
          }
          break;
        }
        default:
          break;
      }
    });
  }
}

/**
 * The temporally valid version of a rule id: effectiveFrom <= asOf < effectiveTo.
 * Overlaps were rejected at load, so at most one version matches.
 */
export function selectVersion(
  corpus: LoadedCorpus,
  ruleId: string,
  asOf: string,
): Rule {
  const versions = corpus.byId.get(ruleId) ?? [];
  const match = versions.find(
    (r) =>
      r.effectiveFrom <= asOf &&
      (r.effectiveTo === undefined || asOf < r.effectiveTo),
  );
  if (!match) {
    throw new NoApplicableRuleError(
      ruleId,
      asOf,
      versions.map((v) => ({
        version: v.version,
        effectiveFrom: v.effectiveFrom,
        effectiveTo: v.effectiveTo,
      })),
    );
  }
  return match;
}

/** Overriders of `ruleId` valid as of the date, highest priority first. */
export function selectOverriders(
  corpus: LoadedCorpus,
  ruleId: string,
  asOf: string,
): Rule[] {
  const list = corpus.overriders.get(ruleId) ?? [];
  return list
    .filter(
      (r) =>
        r.effectiveFrom <= asOf &&
        (r.effectiveTo === undefined || asOf < r.effectiveTo),
    )
    .sort((a, b) => b.overrides!.priority - a.overrides!.priority);
}
