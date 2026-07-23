/**
 * The evaluator.
 *
 * Deterministic, total, and honest: every value it produces is recorded in a
 * derivation tree; every default it relies on is recorded as an assumption;
 * anything it cannot derive makes it refuse with a structured error rather
 * than guess. Missing facts propagate as a "poison" value so a single pass
 * collects EVERY missing fact reachable from the target, not just the first.
 */

import type { Expr, TypedValueJSON, Value } from "./ast.js";
import { valueFromJSON, valueToJSON } from "./ast.js";
import { selectOverriders, selectVersion } from "./corpus.js";
import type { LoadedCorpus } from "./corpus.js";
import {
  CycleError,
  EngineError,
  FactValidationError,
  NeedsFactsError,
  NoApplicableRuleError,
  NotModeledError,
  UnhandledEnumCaseError,
} from "./errors.js";
import type { MissingFact } from "./errors.js";
import {
  divRound,
  max0,
  mulRate,
  parseCents,
  parseDollars,
  parseInt_,
  roundToDollar,
  stepUnits,
} from "./money.js";
import { computeArtifactHash } from "./proof.js";
import type {
  Assumption,
  CandidateConsidered,
  DerivationNode,
  ProofArtifact,
} from "./proof.js";
import type { FactSpec, Rule } from "./rule.js";

export const ENGINE = { name: "@invaro/opentax-core", version: "0.1.0" } as const;

export interface EvaluateOptions {
  /** ISO date the rules are evaluated as of (temporal rule selection). */
  asOf: string;
  /** Rule id to derive. */
  target: string;
}

export interface EvaluateResult {
  value: Value;
  proof: ProofArtifact;
}

const POISON = Symbol("missing-facts");
type EvalValue = Value | typeof POISON;

interface Ctx {
  /** childless repeat-reference nodes, one per rule id (schema v2) */
  stubs: Map<string, DerivationNode>;
  corpus: LoadedCorpus;
  facts: Map<string, Value>;
  factsJSON: Record<string, TypedValueJSON>;
  asOf: string;
  memo: Map<string, { value: EvalValue; node: DerivationNode | null }>;
  visiting: string[];
  assumptions: Assumption[];
  assumedFactIds: Set<string>;
  missing: Map<string, MissingFact>;
  factNodes: Map<string, DerivationNode>;
}

export function evaluate(
  corpus: LoadedCorpus,
  facts: Record<string, TypedValueJSON>,
  options: EvaluateOptions,
): EvaluateResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.asOf)) {
    throw new FactValidationError(`invalid asOf date "${options.asOf}"`);
  }

  const resolved = new Map<string, Value>();
  for (const [factId, tv] of Object.entries(facts)) {
    const spec = corpus.factById.get(factId);
    if (!spec) throw new FactValidationError(`unknown fact "${factId}"`);
    const value = valueFromJSON(tv);
    if (value.type !== spec.type) {
      throw new FactValidationError(
        `fact "${factId}" must be ${spec.type}, got ${value.type}`,
      );
    }
    if (
      value.type === "enum" &&
      spec.enumValues &&
      !spec.enumValues.includes(value.value)
    ) {
      throw new FactValidationError(
        `fact "${factId}": "${value.value}" is not one of ${spec.enumValues.join("|")}`,
      );
    }
    if (value.type === "money" || value.type === "int") {
      const n = value.type === "money" ? value.cents : value.value;
      if (spec.min !== undefined && n < BigInt(spec.min)) {
        throw new FactValidationError(
          `fact "${factId}": ${n} is below the minimum ${spec.min}`,
        );
      }
      if (spec.max !== undefined && n > BigInt(spec.max)) {
        throw new FactValidationError(
          `fact "${factId}": ${n} is above the maximum ${spec.max}`,
        );
      }
    }
    resolved.set(factId, value);
  }

  const ctx: Ctx = {
    corpus,
    facts: resolved,
    factsJSON: facts,
    asOf: options.asOf,
    memo: new Map(),
    visiting: [],
    assumptions: [],
    stubs: new Map(),
    assumedFactIds: new Set(),
    missing: new Map(),
    factNodes: new Map(),
  };

  const { value, node } = evalRule(options.target, ctx);
  if (value === POISON || node === null) {
    throw new NeedsFactsError([...ctx.missing.values()]);
  }

  const body = {
    schemaVersion: "2" as const,
    engine: { ...ENGINE },
    corpus: {
      name: corpus.name,
      version: corpus.version,
      merkleRoot: corpus.merkleRoot,
    },
    asOf: options.asOf,
    target: options.target,
    facts,
    assumptions: ctx.assumptions,
    root: node,
  };
  const proof: ProofArtifact = { ...body, artifactHash: computeArtifactHash(body) };
  return { value, proof };
}

// ---------------------------------------------------------------------------
// Rule evaluation (memoized DAG with override resolution)
// ---------------------------------------------------------------------------

function evalRule(
  ruleId: string,
  ctx: Ctx,
): { value: EvalValue; node: DerivationNode | null } {
  const hit = ctx.memo.get(ruleId);
  if (hit) {
    // Schema v2: the full sub-derivation appears at the rule's FIRST
    // occurrence (evaluation order); later references repeat the node's
    // metadata and value WITHOUT children — collapsing what used to be an
    // exponential tree expansion into one node per extra reference.
    if (hit.node && hit.node.children?.length) {
      let stub = ctx.stubs.get(ruleId);
      if (!stub) {
        const { children: _omit, ...rest } = hit.node;
        stub = rest;
        ctx.stubs.set(ruleId, stub);
      }
      return { value: hit.value, node: stub };
    }
    return hit;
  }

  if (ctx.visiting.includes(ruleId)) {
    throw new CycleError([...ctx.visiting, ruleId]);
  }
  ctx.visiting.push(ruleId);
  try {
    const base = selectVersion(ctx.corpus, ruleId, ctx.asOf);
    const overs = selectOverriders(ctx.corpus, ruleId, ctx.asOf);

    const children: DerivationNode[] = [];
    const candidates: CandidateConsidered[] = [];
    let winner: Rule | null = null;
    let poisoned = false;

    for (const cand of overs) {
      const guard = evalExpr(cand.applicability!, cand, ctx, children);
      if (guard === POISON) {
        candidates.push(candidateEntry(cand, "unknown"));
        poisoned = true;
        break;
      }
      expectType(guard, "bool", cand, "applicability");
      if ((guard as { value: boolean }).value) {
        candidates.push(candidateEntry(cand, true));
        winner = cand;
        break;
      }
      candidates.push(candidateEntry(cand, false));
    }

    if (!winner && !poisoned) {
      if (base.applicability) {
        const guard = evalExpr(base.applicability, base, ctx, children);
        if (guard === POISON) {
          candidates.push({ ...candidateEntry(base, "unknown"), priority: 0 });
          poisoned = true;
        } else {
          expectType(guard, "bool", base, "applicability");
          if (!(guard as { value: boolean }).value) {
            throw new NoApplicableRuleError(ruleId, ctx.asOf, [
              {
                version: base.version,
                effectiveFrom: base.effectiveFrom,
                effectiveTo: base.effectiveTo,
              },
            ]);
          }
          candidates.push({ ...candidateEntry(base, true), priority: 0 });
          winner = base;
        }
      } else {
        if (overs.length > 0) {
          candidates.push({ ...candidateEntry(base, true), priority: 0 });
        }
        winner = base;
      }
    }

    let value: EvalValue = POISON;
    if (winner) {
      value = evalExpr(winner.formula, winner, ctx, children);
    }

    if (value === POISON || winner === null) {
      const entry = { value: POISON as EvalValue, node: null };
      ctx.memo.set(ruleId, entry);
      return entry;
    }

    if (value.type !== winner.output.type) {
      throw new EngineError(
        `rule "${winner.id}" declares output ${winner.output.type} but produced ${value.type}`,
      );
    }

    const inputs: Record<string, TypedValueJSON> = {};
    for (const child of children) {
      const key = child.kind === "rule" ? child.ruleId! : child.factId!;
      inputs[key] = child.value;
    }

    const node: DerivationNode = {
      kind: "rule",
      ruleId: winner.id,
      ruleVersion: winner.version,
      ruleHash: ctx.corpus.ruleHashes.get(`${winner.id}@${winner.version}`),
      title: winner.title,
      citation: winner.citation,
      ...(winner.id !== ruleId ? { resolvedFrom: ruleId } : {}),
      ...(overs.length > 0 ? { candidatesConsidered: candidates } : {}),
      inputs,
      value: valueToJSON(value),
      children,
    };
    const entry = { value, node };
    ctx.memo.set(ruleId, entry);
    return entry;
  } finally {
    ctx.visiting.pop();
  }
}

function candidateEntry(
  rule: Rule,
  applicable: boolean | "unknown",
): CandidateConsidered {
  return {
    ruleId: rule.id,
    version: rule.version,
    priority: rule.overrides?.priority ?? 0,
    applicable,
  };
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

function evalExpr(
  expr: Expr,
  rule: Rule,
  ctx: Ctx,
  children: DerivationNode[],
): EvalValue {
  switch (expr.kind) {
    case "money":
      return { type: "money", cents: parseCents(expr.cents) };
    case "int":
      return { type: "int", value: parseInt_(expr.value) };
    case "bool":
      return { type: "bool", value: expr.value };
    case "enum":
      return { type: "enum", value: expr.value };

    case "fact":
      return resolveFact(expr.factId, ctx, children);

    case "rule": {
      const { value, node } = evalRule(expr.ruleId, ctx);
      if (node && !children.includes(node)) children.push(node);
      return value;
    }

    case "param": {
      const param = rule.parameters?.[expr.name];
      if (!param) {
        throw new EngineError(
          `rule "${rule.id}" has no parameter "${expr.name}"`,
        );
      }
      return valueFromJSON({ type: param.type, value: param.value });
    }

    case "add": {
      const vals = evalAll(expr.args, rule, ctx, children);
      if (vals === POISON) return POISON;
      return numericFold(vals, rule, "add", (acc, v) => acc + v);
    }

    case "sub": {
      const vals = evalAll([expr.left, expr.right], rule, ctx, children);
      if (vals === POISON) return POISON;
      return numericFold(vals, rule, "sub", (acc, v) => acc - v);
    }

    case "mulRate": {
      const base = evalExpr(expr.base, rule, ctx, children);
      if (base === POISON) return POISON;
      expectType(base, "money", rule, "mulRate.base");
      const rate = {
        num: parseInt_(expr.rate.num),
        den: parseInt_(expr.rate.den),
      };
      return {
        type: "money",
        cents: mulRate((base as { cents: bigint }).cents, rate, expr.round),
      };
    }

    case "mulInt": {
      const vals = evalAll([expr.base, expr.count], rule, ctx, children);
      if (vals === POISON) return POISON;
      const [base, count] = vals;
      expectType(base, "money", rule, "mulInt.base");
      expectType(count, "int", rule, "mulInt.count");
      return {
        type: "money",
        cents:
          (base as { cents: bigint }).cents * (count as { value: bigint }).value,
      };
    }

    case "min":
    case "max": {
      const vals = evalAll(expr.args, rule, ctx, children);
      if (vals === POISON) return POISON;
      const pick =
        expr.kind === "min"
          ? (a: bigint, b: bigint) => (b < a ? b : a)
          : (a: bigint, b: bigint) => (b > a ? b : a);
      return numericFold(vals, rule, expr.kind, pick);
    }

    case "max0": {
      const v = evalExpr(expr.arg, rule, ctx, children);
      if (v === POISON) return POISON;
      expectType(v, "money", rule, "max0");
      return { type: "money", cents: max0((v as { cents: bigint }).cents) };
    }

    case "clamp": {
      const vals = evalAll([expr.value, expr.lo, expr.hi], rule, ctx, children);
      if (vals === POISON) return POISON;
      const [v, lo, hi] = vals.map((x) => {
        expectType(x, "money", rule, "clamp");
        return (x as { cents: bigint }).cents;
      });
      const clamped = v < lo ? lo : v > hi ? hi : v;
      return { type: "money", cents: clamped };
    }

    case "roundToDollar": {
      const v = evalExpr(expr.value, rule, ctx, children);
      if (v === POISON) return POISON;
      expectType(v, "money", rule, "roundToDollar");
      return {
        type: "money",
        cents: roundToDollar((v as { cents: bigint }).cents, expr.mode),
      };
    }

    case "mulDiv": {
      const vals = evalAll([expr.a, expr.b, expr.c], rule, ctx, children);
      if (vals === POISON) return POISON;
      const [a, b, c] = vals.map((x) => {
        expectType(x, "money", rule, "mulDiv");
        return (x as { cents: bigint }).cents;
      });
      if (c === 0n) {
        throw new EngineError(`rule "${rule.id}": mulDiv division by zero`);
      }
      return { type: "money", cents: divRound(a * b, c, expr.round) };
    }

    case "unsupported":
      throw new NotModeledError(rule.id, expr.reason);

    case "stepUnits": {
      const v = evalExpr(expr.value, rule, ctx, children);
      if (v === POISON) return POISON;
      expectType(v, "money", rule, "stepUnits");
      return {
        type: "int",
        value: stepUnits(
          (v as { cents: bigint }).cents,
          parseCents(expr.unitCents),
          expr.mode,
        ),
      };
    }

    case "cmp": {
      const vals = evalAll([expr.left, expr.right], rule, ctx, children);
      if (vals === POISON) return POISON;
      const [l, r] = vals;
      if (l.type !== r.type) {
        throw new EngineError(
          `rule "${rule.id}": cmp between ${l.type} and ${r.type}`,
        );
      }
      if (expr.op === "eq" || expr.op === "ne") {
        const eq = canonicalScalar(l) === canonicalScalar(r);
        return { type: "bool", value: expr.op === "eq" ? eq : !eq };
      }
      const ln = numericOf(l, rule, "cmp");
      const rn = numericOf(r, rule, "cmp");
      const result =
        expr.op === "lt"
          ? ln < rn
          : expr.op === "le"
            ? ln <= rn
            : expr.op === "gt"
              ? ln > rn
              : ln >= rn;
      return { type: "bool", value: result };
    }

    case "and":
    case "or": {
      // Short-circuit: a decided arg wins without demanding facts for the
      // rest. A poisoned arg only poisons the result if nothing decides.
      const decider = expr.kind === "and" ? false : true;
      let sawPoison = false;
      for (const arg of expr.args) {
        const v = evalExpr(arg, rule, ctx, children);
        if (v === POISON) {
          sawPoison = true;
          continue;
        }
        expectType(v, "bool", rule, expr.kind);
        if ((v as { value: boolean }).value === decider) {
          return { type: "bool", value: decider };
        }
      }
      if (sawPoison) return POISON;
      return { type: "bool", value: !decider };
    }

    case "not": {
      const v = evalExpr(expr.arg, rule, ctx, children);
      if (v === POISON) return POISON;
      expectType(v, "bool", rule, "not");
      return { type: "bool", value: !(v as { value: boolean }).value };
    }

    case "if": {
      const cond = evalExpr(expr.cond, rule, ctx, children);
      if (cond === POISON) return POISON;
      expectType(cond, "bool", rule, "if.cond");
      return evalExpr(
        (cond as { value: boolean }).value ? expr.then : expr.else,
        rule,
        ctx,
        children,
      );
    }

    case "brackets": {
      const base = evalExpr(expr.base, rule, ctx, children);
      if (base === POISON) return POISON;
      expectType(base, "money", rule, "brackets.base");
      const amount = (base as { cents: bigint }).cents;
      let tax = 0n;
      for (let i = 0; i < expr.table.length; i++) {
        const lower = parseCents(expr.table[i].threshold);
        if (amount <= lower) break;
        const upper =
          i + 1 < expr.table.length
            ? parseCents(expr.table[i + 1].threshold)
            : amount;
        const span = (amount < upper ? amount : upper) - lower;
        const rate = {
          num: parseInt_(expr.table[i].rate.num),
          den: parseInt_(expr.table[i].rate.den),
        };
        // each bracket term rounds half-up to the cent, then sums exactly
        tax += mulRate(span, rate, "half-up");
      }
      return { type: "money", cents: tax };
    }

    case "match": {
      const on = evalExpr(expr.on, rule, ctx, children);
      if (on === POISON) return POISON;
      expectType(on, "enum", rule, "match.on");
      const tag = (on as { value: string }).value;
      const found = expr.cases.find((c) => c.when === tag);
      if (found) return evalExpr(found.value, rule, ctx, children);
      if (expr.else) return evalExpr(expr.else, rule, ctx, children);
      throw new UnhandledEnumCaseError(rule.id, tag);
    }
  }
}

function resolveFact(
  factId: string,
  ctx: Ctx,
  children: DerivationNode[],
): EvalValue {
  const spec = ctx.corpus.factById.get(factId);
  if (!spec) throw new EngineError(`unknown fact "${factId}"`);

  let node = ctx.factNodes.get(factId);
  if (!node) {
    const given = ctx.facts.get(factId);
    if (given !== undefined) {
      node = { kind: "fact", factId, value: valueToJSON(given) };
    } else if (spec.default !== undefined) {
      const value = valueFromJSON({ type: spec.type, value: spec.default.value });
      if (!ctx.assumedFactIds.has(factId)) {
        ctx.assumedFactIds.add(factId);
        ctx.assumptions.push({
          factId,
          value: valueToJSON(value),
          source: "default",
          rationale: spec.default.rationale,
        });
      }
      ctx.facts.set(factId, value);
      node = { kind: "assumption", factId, value: valueToJSON(value) };
    } else {
      ctx.missing.set(factId, {
        factId,
        type: spec.type,
        enumValues: spec.enumValues,
        description: spec.description,
      });
      return POISON;
    }
    ctx.factNodes.set(factId, node);
  }

  if (!children.includes(node)) children.push(node);
  return ctx.facts.get(factId)!;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Evaluate all args (collecting facts from each); POISON if any is poisoned. */
function evalAll(
  exprs: Expr[],
  rule: Rule,
  ctx: Ctx,
  children: DerivationNode[],
): Value[] | typeof POISON {
  const out: Value[] = [];
  let poisoned = false;
  for (const e of exprs) {
    const v = evalExpr(e, rule, ctx, children);
    if (v === POISON) poisoned = true;
    else out.push(v);
  }
  return poisoned ? POISON : out;
}

function numericFold(
  vals: Value[],
  rule: Rule,
  op: string,
  fold: (acc: bigint, v: bigint) => bigint,
): Value {
  if (vals.length === 0) throw new EngineError(`rule "${rule.id}": empty ${op}`);
  const type = vals[0].type;
  if (type !== "money" && type !== "int") {
    throw new EngineError(`rule "${rule.id}": ${op} over ${type}`);
  }
  let acc = numericOf(vals[0], rule, op);
  for (const v of vals.slice(1)) {
    if (v.type !== type) {
      throw new EngineError(
        `rule "${rule.id}": ${op} mixes ${type} and ${v.type}`,
      );
    }
    acc = fold(acc, numericOf(v, rule, op));
  }
  return type === "money"
    ? { type: "money", cents: acc }
    : { type: "int", value: acc };
}

function numericOf(v: Value, rule: Rule, op: string): bigint {
  if (v.type === "money") return v.cents;
  if (v.type === "int") return v.value;
  throw new EngineError(`rule "${rule.id}": ${op} expects money|int, got ${v.type}`);
}

function canonicalScalar(v: Value): string {
  switch (v.type) {
    case "money":
      return `m:${v.cents}`;
    case "int":
      return `i:${v.value}`;
    case "bool":
      return `b:${v.value}`;
    case "enum":
      return `e:${v.value}`;
  }
}

function expectType(
  v: Value,
  type: Value["type"],
  rule: Rule,
  where: string,
): void {
  if (v.type !== type) {
    throw new EngineError(
      `rule "${rule.id}": ${where} expects ${type}, got ${v.type}`,
    );
  }
}

/**
 * Coerce a plain JSON facts file ({"filingStatus": "single", "wages": 50000})
 * into typed fact values using the corpus fact catalog. Money facts are
 * written in DOLLARS (50000, "$50,000", "1234.56") and converted to exact
 * cents — floats never touch the math.
 */
export function coerceFacts(
  corpus: LoadedCorpus,
  plain: Record<string, unknown>,
): Record<string, TypedValueJSON> {
  const out: Record<string, TypedValueJSON> = {};
  for (const [factId, raw] of Object.entries(plain)) {
    const spec = corpus.factById.get(factId);
    if (!spec) {
      const known = [...corpus.factById.keys()].join(", ");
      throw new FactValidationError(
        `unknown fact "${factId}" (known facts: ${known})`,
      );
    }
    switch (spec.type) {
      case "money": {
        if (typeof raw !== "string" && typeof raw !== "number") {
          throw new FactValidationError(
            `fact "${factId}" must be a dollar amount like 50000 or "1234.56"`,
          );
        }
        try {
          out[factId] = { type: "money", value: parseDollars(raw).toString() };
        } catch (err) {
          throw new FactValidationError(
            `fact "${factId}": ${(err as Error).message}`,
          );
        }
        break;
      }
      case "int": {
        let s: string;
        if (typeof raw === "string" && /^-?\d+$/.test(raw)) s = raw;
        else if (typeof raw === "number" && Number.isSafeInteger(raw)) {
          s = String(raw);
        } else {
          throw new FactValidationError(
            `fact "${factId}" must be a whole number`,
          );
        }
        out[factId] = { type: "int", value: s };
        break;
      }
      case "bool":
        if (typeof raw !== "boolean") {
          throw new FactValidationError(`fact "${factId}" must be true or false`);
        }
        out[factId] = { type: "bool", value: raw };
        break;
      case "enum":
        if (typeof raw !== "string") {
          throw new FactValidationError(
            `fact "${factId}" must be one of ${spec.enumValues?.join("|")}`,
          );
        }
        out[factId] = { type: "enum", value: raw };
        break;
    }
  }
  return out;
}
