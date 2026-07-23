/**
 * @invaro/opentax-solve — the reasoning layer.
 *
 * The engine's rules are pure functions, which makes "solver" questions
 * cheap and exact: sweep an input, differentiate the answer, find the
 * discontinuities, invert the function. Every data point is a real
 * evaluation against the content-addressed corpus — not a model, not a
 * regression, the actual law.
 *
 * Domain-general: this package knows nothing about tax. It depends only on
 * @invaro/opentax-core and works with any corpus.
 */

export type { SweepOptions, SweepPoint, SweepResult } from "./sweep.js";
export { sweep } from "./sweep.js";
export type { MarginalOptions, MarginalResult } from "./marginal.js";
export { marginal } from "./marginal.js";
export type { Cliff, CliffOptions, CliffResult } from "./cliffs.js";
export { findCliffs } from "./cliffs.js";
export type { InvertOptions, InvertResult } from "./invert.js";
export { invert } from "./invert.js";
export type { CompareOptions, CompareResult } from "./compare.js";
export { compareAcross } from "./compare.js";
export type { FactCheckResult, LookupHit, RuleSearchHit } from "./lookup.js";
export { factCheck, lookupParameters, searchRules } from "./lookup.js";
