/**
 * @invaro/opentax-core — a domain-general, verifiable rules engine.
 *
 * The engine knows nothing about tax. Domains are corpora of typed, cited,
 * temporally-versioned rules; the engine evaluates them exactly (bigint
 * cents), emits complete derivation proofs, and can re-verify any proof
 * against a content-addressed corpus.
 */

export type {
  BracketRow,
  CmpOp,
  Expr,
  RateLit,
  TypedValueJSON,
  Value,
  ValueType,
} from "./ast.js";
export {
  childrenOf,
  valueFromJSON,
  valuesEqual,
  valueToJSON,
  walkExpr,
} from "./ast.js";

export type { Cents, Rate, Rounding } from "./money.js";
export {
  divRound,
  max0,
  mulRate,
  parseCents,
  parseDollars,
  roundToDollar,
  stepUnits,
} from "./money.js";

export type {
  Citation,
  CorpusInput,
  FactSpec,
  Rule,
  RuleParameter,
} from "./rule.js";

export { canonical } from "./canonical.js";
export { hashOf, merkleRoot, ruleHash, sha256Hex } from "./hash.js";

export type { LoadedCorpus } from "./corpus.js";
export { loadCorpus, selectOverriders, selectVersion } from "./corpus.js";

export type {
  Assumption,
  CandidateConsidered,
  DerivationNode,
  ProofArtifact,
} from "./proof.js";
export { artifactBody, computeArtifactHash } from "./proof.js";

export type { EvaluateOptions, EvaluateResult } from "./evaluate.js";
export { coerceFacts, ENGINE, evaluate } from "./evaluate.js";

export type { VerifyResult } from "./verify.js";
export { verifyProof } from "./verify.js";

export type { MissingFact } from "./errors.js";
export {
  CorpusValidationError,
  CycleError,
  EngineError,
  FactValidationError,
  NeedsFactsError,
  NoApplicableRuleError,
  NotModeledError,
  OpenTaxError,
  UnhandledEnumCaseError,
} from "./errors.js";
