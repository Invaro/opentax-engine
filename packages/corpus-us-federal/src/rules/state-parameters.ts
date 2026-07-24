/**
 * State parameter pack v1 — the seed of the state corpus, born from the
 * finding that STALE STATE PARAMETERS caused most agent errors in
 * evaluation runs. Scope: the return-critical 2025 parameters and
 * tax schedules for IL / VA / CA (+ NY's statutory standard deduction),
 * each web-verified July 2026 from the state agency. State returns remain
 * agent-assembled; these targets pin the arithmetic and make every number
 * lookup-able instead of recalled.
 *
 * Split into per-state modules (state-il.ts / state-va.ts / state-ca.ts /
 * state-ny.ts, sharing rules/state-helpers.ts) — this file is now a thin
 * re-export so packages/corpus-us-federal/src/index.ts needs no changes.
 */

import type { Rule } from "@invaro/opentax-core";
import { ilRules } from "./state-il.js";
import { vaRules } from "./state-va.js";
import { caRules } from "./state-ca.js";
import { nyRules } from "./state-ny.js";
import { paRules } from "./state-pa.js";
import { otherStateRules } from "./state-other.js";

export const stateParameterRules: Rule[] = [
  ...ilRules,
  ...vaRules,
  ...caRules,
  ...nyRules,
  ...paRules,
  ...otherStateRules,
];
