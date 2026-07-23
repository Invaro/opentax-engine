/**
 * The expression IR. Small, closed, total, JSON-serializable.
 *
 * Design invariants:
 * - All numerics are decimal STRINGS in the serialized form ("cents": "1500000").
 *   This keeps canonical JSON (and therefore hashing) trivially deterministic
 *   and sidesteps bigint/float JSON issues.
 * - No division (except `stepUnits`), no loops, no string operations.
 *   Everything needed for brackets, phase-outs, and credits is expressible.
 */

import type { Rounding } from "./money.js";

/** Exact rational rate in serialized form, e.g. 12% = { num: "12", den: "100" }. */
export interface RateLit {
  num: string;
  den: string;
}

/**
 * One bracket row. `threshold` is the LOWER bound in cents (first row must be
 * "0") — encoding lower bounds eliminates inclusive/exclusive ambiguity.
 */
export interface BracketRow {
  threshold: string;
  rate: RateLit;
}

export type CmpOp = "lt" | "le" | "gt" | "ge" | "eq" | "ne";

export type Expr =
  // literals
  | { kind: "money"; cents: string }
  | { kind: "int"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "enum"; value: string }
  // references
  | { kind: "fact"; factId: string }
  | { kind: "rule"; ruleId: string }
  | { kind: "param"; name: string }
  // arithmetic (exact; money or int, never mixed)
  | { kind: "add"; args: Expr[] }
  | { kind: "sub"; left: Expr; right: Expr }
  | { kind: "mulRate"; base: Expr; rate: RateLit; round: Rounding }
  | { kind: "mulInt"; base: Expr; count: Expr }
  | { kind: "min"; args: Expr[] }
  | { kind: "max"; args: Expr[] }
  | { kind: "max0"; arg: Expr }
  | { kind: "clamp"; value: Expr; lo: Expr; hi: Expr }
  | { kind: "roundToDollar"; value: Expr; mode: Rounding }
  // exact a×b/c on money (for statutory ratio phase-outs, e.g. § 221(b)(2))
  | { kind: "mulDiv"; a: Expr; b: Expr; c: Expr; round: Rounding }
  // int units of "$X or fraction thereof" (ceil) — e.g. CTC phase-out steps
  | { kind: "stepUnits"; value: Expr; unitCents: string; mode: "ceil" | "floor" }
  // a region of law the corpus deliberately does NOT model: evaluating this
  // throws NOT_MODELED (fail loud, never wrong-but-plausible)
  | { kind: "unsupported"; reason: string }
  // logic
  | { kind: "cmp"; op: CmpOp; left: Expr; right: Expr }
  | { kind: "and"; args: Expr[] }
  | { kind: "or"; args: Expr[] }
  | { kind: "not"; arg: Expr }
  | { kind: "if"; cond: Expr; then: Expr; else: Expr }
  // tables
  | { kind: "brackets"; base: Expr; table: BracketRow[] }
  | {
      kind: "match";
      on: Expr;
      cases: { when: string; value: Expr }[];
      else?: Expr;
    };

/** Direct child expressions of a node (for generic AST walks). */
export function childrenOf(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "money":
    case "int":
    case "bool":
    case "enum":
    case "fact":
    case "rule":
    case "param":
    case "unsupported":
      return [];
    case "mulDiv":
      return [expr.a, expr.b, expr.c];
    case "add":
    case "min":
    case "max":
    case "and":
    case "or":
      return expr.args;
    case "sub":
      return [expr.left, expr.right];
    case "mulRate":
      return [expr.base];
    case "mulInt":
      return [expr.base, expr.count];
    case "max0":
    case "not":
      return [expr.arg];
    case "clamp":
      return [expr.value, expr.lo, expr.hi];
    case "roundToDollar":
    case "stepUnits":
      return [expr.value];
    case "cmp":
      return [expr.left, expr.right];
    case "if":
      return [expr.cond, expr.then, expr.else];
    case "brackets":
      return [expr.base];
    case "match": {
      const kids = [expr.on, ...expr.cases.map((c) => c.value)];
      if (expr.else) kids.push(expr.else);
      return kids;
    }
  }
}

/** Depth-first walk over an expression tree. */
export function walkExpr(expr: Expr, visit: (e: Expr) => void): void {
  visit(expr);
  for (const child of childrenOf(expr)) walkExpr(child, visit);
}

// ---------------------------------------------------------------------------
// Runtime values
// ---------------------------------------------------------------------------

export type ValueType = "money" | "int" | "bool" | "enum";

/** In-memory runtime value (bigints for exactness). */
export type Value =
  | { type: "money"; cents: bigint }
  | { type: "int"; value: bigint }
  | { type: "bool"; value: boolean }
  | { type: "enum"; value: string };

/** Serialized form used in facts, proofs, and anything hashed. */
export interface TypedValueJSON {
  type: ValueType;
  value: string | boolean;
}

export function valueToJSON(v: Value): TypedValueJSON {
  switch (v.type) {
    case "money":
      return { type: "money", value: v.cents.toString() };
    case "int":
      return { type: "int", value: v.value.toString() };
    case "bool":
      return { type: "bool", value: v.value };
    case "enum":
      return { type: "enum", value: v.value };
  }
}

export function valueFromJSON(tv: TypedValueJSON): Value {
  switch (tv.type) {
    case "money": {
      if (typeof tv.value !== "string") {
        throw new TypeError("money value must be a string of cents");
      }
      if (!/^-?\d+$/.test(tv.value)) {
        throw new TypeError(`invalid money value: ${JSON.stringify(tv.value)}`);
      }
      return { type: "money", cents: BigInt(tv.value) };
    }
    case "int": {
      if (typeof tv.value !== "string") {
        throw new TypeError("int value must be a decimal string");
      }
      if (!/^-?\d+$/.test(tv.value)) {
        throw new TypeError(`invalid int value: ${JSON.stringify(tv.value)}`);
      }
      return { type: "int", value: BigInt(tv.value) };
    }
    case "bool": {
      if (typeof tv.value !== "boolean") {
        throw new TypeError("bool value must be a boolean");
      }
      return { type: "bool", value: tv.value };
    }
    case "enum": {
      if (typeof tv.value !== "string") {
        throw new TypeError("enum value must be a string");
      }
      return { type: "enum", value: tv.value };
    }
    default:
      throw new TypeError(`unknown value type: ${(tv as { type: string }).type}`);
  }
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "money":
      return a.cents === (b as { type: "money"; cents: bigint }).cents;
    case "int":
      return a.value === (b as { type: "int"; value: bigint }).value;
    case "bool":
      return a.value === (b as { type: "bool"; value: boolean }).value;
    case "enum":
      return a.value === (b as { type: "enum"; value: string }).value;
  }
}
