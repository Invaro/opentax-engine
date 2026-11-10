# Library API

How to run OpenTax inside your own application, and what we promise not to break.

The engine is four packages. You install them, import functions, and call them in your own process: no server, no network, no account check.

| Package | Version | Tier | What it is |
|---|---|---|---|
| `@invaro/opentax-core` | 1.0.0 | stable | The evaluator, the proof verifier, the error classes and the types. No tax knowledge. |
| `@invaro/opentax-corpus-us-federal` | 0.53.0 | stable API, law updated every release | Every rule and input, federal and state. `getCorpus`, `extendCorpus`, projection. |
| `@invaro/opentax-solve` | 1.1.0 | stable; search and lookup provisional | Sweeps, marginal rates, cliffs, inversion, comparisons, rule search. |
| `@invaro/opentax-compose` | 0.9.0 | provisional | State return lines, Form 2210 and Form 4562. Shapes follow each year's forms. |

The command line and the MCP server (`@invaro/opentax` on npm) are built on these four and are documented in [AGENTS.md](../AGENTS.md) and [docs/api](api/README.md). This page is about the library.

**Contents:** [Install](#install) · [First answer](#first-answer) · [Inputs and targets](#inputs-and-targets) · [Errors](#errors) · [Proofs](#proofs) · [Your own rules](#your-own-rules) · [Solver](#solver) · [Future years](#future-years) · [Composers](#composers-provisional) · [Reference](#reference) · [Compatibility policy](#compatibility-policy)

## Install

Each release has one tarball per package, with a SHA-256 checksum, the git commit and the corpus fingerprint. Download them from your account at opentax.invaro.ai/account. (To build from source instead, see [CONTRIBUTING.md](../CONTRIBUTING.md); a tarball you pack yourself won't have the published checksum.)

```bash
npm i ./invaro-opentax-core-1.0.0.tgz ./invaro-opentax-corpus-us-federal-0.53.0.tgz ./invaro-opentax-solve-1.1.0.tgz
```

- **ES modules only.** `import`, not `require`.
- **Runs anywhere JavaScript does.** The four packages use no Node built-ins, so they run in Node 20 and later (every change is tested on 20, 22 and 24), in browsers, and in edge and serverless runtimes. They need `BigInt`.
- **The same answer everywhere.** No result, hash or fingerprint depends on the machine's language or time zone.
- **No I/O.** Nothing reads a file, the clock or the network, and there is no telemetry. The date is always the `asOf` you pass.
- **Types included.** Every package ships its `.d.ts`.
- **Core patches install on their own.** The corpus and the solver depend on `@invaro/opentax-core` `^1.0.0`.
- **Import from the package name only.** `@invaro/opentax-core/dist/…` is not part of the API.

## First answer

```js
// Evaluate one answer and read its proof.
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = getCorpus(); // validated and hashed once, then cached

  // plain values in (money in dollars), typed facts out. An unknown id or a wrong type throws FACT_INVALID here;
  // evaluate checks enum values and ranges, with the same code.
  const facts = coerceFacts(corpus, { filingStatus: "mfj", wages: 120000, qualifyingChildren: 2 });

  const { value, proof } = evaluate(corpus, facts, { asOf: "2026-12-31", target: DEFAULT_TARGET });

  return {
    cents: value.type === "money" ? value.cents : null, // bigint cents; negative = refund
    assumptions: proof.assumptions.map((a) => a.factId), // every default the answer rests on
    corpus: proof.corpus, // { name, version, merkleRoot }
    artifactHash: proof.artifactHash,
  };
}
```

- **Money is integer cents.** Values are `bigint` in memory and decimal strings in JSON (`"564300"` is $5,643.00). Floats never touch the math.
- **`coerceFacts`** turns plain values into typed facts: money in dollars as a number or a string (`50000`, `"1234.56"`), counts as integers, booleans, and enum strings. `evaluate` takes the typed facts, not the plain ones.
- **`asOf`** picks the law. A date in 2026 uses tax year 2026 rules.
- **`proof.assumptions`** lists every default the answer used. Show them to your user. If one is wrong for them, pass the real value and run again.

## Inputs and targets

Everything you can ask is a rule id, and everything you can supply is a fact id. Both are data you can read:

```js
const corpus = getCorpus();
corpus.facts;                        // FactSpec[]: id, type, enumValues, min/max, description, default
corpus.factById.get("wages");        // one fact
[...corpus.byId.keys()];             // every rule id: each is a valid `target`
corpus.byId.get("us.federal.agi");   // that rule's versions, with title, citation and validity dates
selectVersion(corpus, "us.federal.agi", "2026-12-31"); // the version that applies on a date (from core)
```

`getCorpus()` returns one shared object, as do `corpusInput` and `facts`. Treat them as read-only: the Merkle root is computed when the corpus is loaded, so an edit afterwards would run rules the root no longer describes. To change a rule, use `extendCorpus`.

`DEFAULT_TARGET` is `us.federal.net_tax`: federal income tax after refundable credits, where a negative number is a refund. [AGENTS.md](../AGENTS.md) describes the common targets and the facts for each form.

## Errors

The engine never returns a guess. When `evaluate`, `coerceFacts`, `loadCorpus` or `extendCorpus` can't do what you asked, it throws one of eight error classes. All extend `OpenTaxError`, and each has a fixed `code`.

```js
// Route on error codes, never on message text.
import { coerceFacts, evaluate, NeedsFactsError, NotModeledError, OpenTaxError } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

export function ask(plainFacts, target, options = {}) {
  const corpus = getCorpus();
  try {
    const { value } = evaluate(corpus, coerceFacts(corpus, plainFacts), { asOf: "2025-12-31", target, ...options });
    return { ok: true, value };
  } catch (e) {
    if (e instanceof NeedsFactsError) {
      // ask the user for these, then retry
      return { ok: false, code: e.code, missing: e.missing.map((m) => m.factId) };
    }
    if (e instanceof NotModeledError) {
      // the corpus refuses this situation: don't retry, don't guess
      return { ok: false, code: e.code, ruleId: e.ruleId, reason: e.reason };
    }
    if (e instanceof OpenTaxError) return { ok: false, ...e.toJSON() }; // { code, message, data }
    throw e;
  }
}

export function run() {
  return {
    // a sale's character is never guessed
    needsFacts: ask({ filingStatus: "single", wages: 50000, businessProperties: 1 }, "us.federal.agi"),
    // refuseDefaults: no answer rests on an assumption you didn't make
    strict: ask({ filingStatus: "single", wages: 50000 }, "us.federal.agi", { refuseDefaults: true }),
    // a loss can't use the installment method
    notModeled: ask(
      {
        filingStatus: "single", wages: 50000, installmentSales: 1,
        installmentSale1Kind: "capital", installmentSale1HeldOverOneYear: true, installmentSale1YearOfSale: true,
        installmentSale1SellingPrice: 30000, installmentSale1CostBasis: 40000,
      },
      "us.federal.agi",
    ),
    unknownFact: ask({ filingStatus: "single", wagez: 1 }, "us.federal.agi"),
  };
}
```

| Class | `code` | What it means | What to do |
|---|---|---|---|
| `NeedsFactsError` | `NEEDS_FACTS` | An input is needed and has no default (or you refused defaults). `missing` lists each one the evaluation reached, with type and description. | Get them and retry. An answer can open a further question (a filing status that needs another fact), so a retry may list more. |
| `NotModeledError` | `NOT_MODELED` | The rules deliberately don't cover this situation. `reason` says why. | Don't retry. Tell the user it is out of scope. |
| `NoApplicableRuleError` | `NO_APPLICABLE_RULE` | No rule with that id applies on that date: an unknown id, a year outside the corpus, or a rule whose own guard is false. | Check the id and the date. |
| `UnhandledEnumCaseError` | `UNHANDLED_ENUM_CASE` | A rule has no case for an enum value. | Out of scope, as above. |
| `FactValidationError` | `FACT_INVALID` | An unknown fact id, a wrong type, a value out of range, or a fact that isn't a typed value. `data().factId` names the fact. | Fix the input. |
| `CorpusValidationError` | `CORPUS_INVALID` | A corpus or extension failed validation: a stale or missing pin, an id collision, a reference to something that doesn't exist, or a malformed formula. `data().issues` lists the problems (`extendCorpus` reports its own checks first, then the corpus's). | Fix the extension. |
| `CycleError` | `RULE_CYCLE` | Rules depend on each other in a loop. | Fix the extension. |
| `EngineError` | `ENGINE_ERROR` | A formula failed while running: operand types that don't fit, or a `mulDiv` whose divisor came out zero. | Fix the rule; if it is ours, report it. |

Every error serializes with `toJSON()` to `{ code, message, data }`. Route on `code` or on the class. Message text can change in any release.

A mistake in how a function is called is an ordinary JavaScript error, not one of these: the solver functions throw `RangeError` or `TypeError` for an impossible option (a step of zero, a fact that isn't money), `parseDollars` and `parseCents` throw `TypeError` for text that isn't an amount, and `getProjectedFederalCorpus` throws an `Error` for a year outside its range.

## Proofs

Every answer comes with a proof: the full derivation, each node citing its law, hashed so that any edit is detectable, whether to a stored copy or to the object in memory. The format is specified in [PROOF-FORMAT.md](PROOF-FORMAT.md).

```js
// A proof is a plain JSON object: store it, send it, verify it later.
import { coerceFacts, evaluate, verifyProof } from "@invaro/opentax-core";
import { corpusForVersion, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = getCorpus();
  const { proof } = evaluate(corpus, coerceFacts(corpus, { filingStatus: "single", wages: 85000 }), {
    asOf: "2025-12-31",
    target: "us.federal.taxable_income",
  });

  const stored = JSON.parse(JSON.stringify(proof)); // survives a round trip unchanged

  // verify against the corpus the proof names (the published one, or a projection)
  const good = verifyProof(stored, corpusForVersion(stored.corpus.version));

  // any edit is caught
  const tampered = structuredClone(stored);
  tampered.root.value = { type: "money", value: "1" };
  const bad = verifyProof(tampered, corpus);

  return { good, bad: bad.ok ? "verified" : bad.reason };
}
```

`verifyProof` returns `{ ok: true, target, value, corpusMerkleRoot }` or `{ ok: false, reason, message }`, where `reason` is one of `invalid-artifact`, `artifact-hash-mismatch`, `corpus-mismatch`, `evaluation-error` or `divergence`. A proof verifies against a corpus with the same Merkle root, which is the one in its `corpus.merkleRoot`: the release that made it, or any other release whose rules and facts are identical. The engine version in a proof is a label; a proof made by core 0.1.0 verifies with 1.0.0 and the reverse.

For your own tooling, `canonical`, `sha256Hex`, `hashOf`, `ruleHash`, `merkleRoot`, `compareIds`, `artifactBody` and `computeArtifactHash` are the functions the format is defined with. `compareIds` is the fixed order ids are sorted in for the Merkle root; it does not depend on locale.

## Your own rules

`extendCorpus` adds your facts and rules to ours and returns an ordinary corpus, so `evaluate` and `verifyProof` work unchanged.

```js
// Add your own rules without restating ours.
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { EXTENSION_POINTS, extendCorpus, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = extendCorpus({
    name: "@yourfirm/opentax-rules",
    version: "1.0.0",
    facts: [
      {
        id: "firmJuryDutyPayRemitted",
        type: "money",
        min: "0",
        description: "Jury duty pay you gave to your employer (Schedule 1 line 24a). In dollars.",
        default: { value: "0", rationale: "Assumed no jury duty pay remitted" },
      },
    ],
    rules: [
      {
        id: "firm.jury_duty_pay_remitted",
        version: 1,
        jurisdiction: "us.federal",
        title: "Jury duty pay given to the employer",
        citation: { source: "26 U.S.C. § 62(a)(13)", section: "§ 62(a)(13)", url: "https://www.law.cornell.edu/uscode/text/26/62", excerpt: "jury pay remitted to the taxpayer's employer" },
        effectiveFrom: "2025-01-01",
        output: { type: "money" },
        formula: { kind: "fact", factId: "firmJuryDutyPayRemitted" },
        contributesTo: "us.federal.above_the_line_adjustments", // one of EXTENSION_POINTS
      },
    ],
  });

  const agi = (c, extra) =>
    evaluate(c, coerceFacts(c, { filingStatus: "single", wages: 60000, ...extra }), { asOf: "2025-12-31", target: "us.federal.agi" });

  const ours = agi(getCorpus(), {});
  const yours = agi(corpus, { firmJuryDutyPayRemitted: 400 });

  return {
    extensionPoints: Object.keys(EXTENSION_POINTS),
    agiWithout: ours.value.cents,
    agiWith: yours.value.cents, // $400 lower
    corpus: yours.proof.corpus, // "<ours>+<yours>", with its own Merkle root
    differentRoot: yours.proof.corpus.merkleRoot !== ours.proof.corpus.merkleRoot,
  };
}

// Replacing one of our rules needs a pin to the exact version you built against.
export function overrideWithStalePin() {
  try {
    extendCorpus({
      name: "@yourfirm/opentax-rules",
      version: "1.0.0",
      rules: [
        {
          id: "firm.standard_deduction",
          version: 1,
          jurisdiction: "us.federal",
          title: "Firm's standard deduction",
          citation: { source: "example", section: "example", url: "https://example.com", excerpt: "example" },
          effectiveFrom: "2025-01-01",
          output: { type: "money" },
          formula: { kind: "money", cents: "0" },
          overrides: { ruleId: "us.federal.standard_deduction", priority: 50 },
          applicability: { kind: "bool", value: true },
        },
      ],
      pins: { "us.federal.standard_deduction@1": "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
    });
    return "loaded";
  } catch (e) {
    return { code: e.code, issues: e.data().issues ?? e.message };
  }
}
```

- **Add to a total.** A rule with `contributesTo` is added to one of the four `EXTENSION_POINTS`: gross income, above-the-line adjustments, other taxes and refundable credits. Our formula for the total is untouched, so a release that changes it doesn't break you.
- **Read a total without your own item.** `{ kind: "rule", ruleId: "us.federal.taxable_income", excluding: ["firm.nol_deduction"] }` is the statute's "computed without regard to".
- **Replace a rule.** A rule with `overrides: { ruleId, priority }` and an `applicability` guard wins whenever the guard holds. You must pin, in `pins` (`"ruleId@version": "sha256:…"`, from `getCorpus().ruleHashes`), every version of our rule that applies during your rule's dates. If a release changes one, retires one, or adds a version for a new year, loading fails and names it, instead of computing with a replacement you haven't reviewed. End your rule's dates (`effectiveTo`) where your review ends.
- **Use your own prefix** for fact and rule ids, with a dot in it: `acme.nol_deduction`, `acme.priorYearLoss`. Our rule ids always start with `us.`, and our fact ids never contain a dot, an underscore or a hyphen, so a prefixed id can't collide with one we add later. An id that does collide fails to load.
- **Lower level.** `loadCorpus` validates and hashes any `CorpusInput` (`corpusInput` and `facts` are ours), for a corpus that isn't built on the federal one.

Rules are data: a `Rule` has an id, a version, a `Citation`, validity dates, an output type and a formula written as an `Expr` tree. [CONTRIBUTING.md](../CONTRIBUTING.md) walks through writing one.

## Solver

```js
// The solver layer: every point is a real evaluation.
import { coerceFacts } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { compareAcross, findCliffs, invert, marginal, sweep } from "@invaro/opentax-solve";

export function run() {
  const corpus = getCorpus();
  const base = coerceFacts(corpus, { filingStatus: "single", wages: 50000, isAtLeastAge25: true });
  const at = { asOf: "2026-12-31", target: "us.federal.net_tax" };

  return {
    curve: sweep(corpus, base, { ...at, vary: "wages", fromCents: 0n, toCents: 10_000_000n, stepCents: 2_500_000n }).points,
    rate: marginal(corpus, base, { ...at, vary: "wages", atCents: 5_000_000n }),
    cliffs: findCliffs(
      corpus,
      coerceFacts(corpus, { filingStatus: "hoh", wages: 30000, qualifyingChildren: 2, isAtLeastAge25: true }),
      { ...at, vary: "taxableInterest", fromCents: 1_000_000n, toCents: 1_400_000n },
    ).cliffs,
    statuses: compareAcross(corpus, base, { ...at, vary: "filingStatus" }),
    income: invert(corpus, base, { ...at, vary: "wages", goalCents: 387_500n, loCents: 3_000_000n, hiCents: 10_000_000n }),
  };
}
```

| Function | Answers |
|---|---|
| `sweep` | The target at each step of one money input. |
| `marginal` | The change in the target for one more increment, as cents and basis points. |
| `findCliffs` | The points in a range where one more cent moves the target by a jump, each located to the cent. |
| `invert` | The smallest input that reaches a goal, or `{ ok: false, reason }` when it can't say: `not-monotone` (the sampled target goes down somewhere in the range) or `goal-out-of-range`. |
| `compareAcross` | The target under each value of an enum input, such as filing status. |
| `searchRules` (provisional) | Full-text search over the rules. No hits means the topic isn't covered. |
| `lookupParameters`, `factCheck` (provisional) | A dollar amount in the law, and whether a claimed figure matches it. |
| `queryScope` (provisional) | How a lookup query is read: the jurisdiction it asks about, and the tax year and filing status it names. |

In `sweep`, `marginal`, `findCliffs`, `invert` and `compareAcross`, amounts are `bigint` cents.

`findCliffs` scans the range in steps (`stepCents`, $1,000 unless you set it), and wherever the target moved by more than the input did across a step, it bisects down to the cent. So it finds every jump bigger than a step is wide; a smaller one, such as a $50 phase-out step, needs a smaller `stepCents`. Optional `limits` (`CliffLimits`) bound the work when the range comes from an untrusted caller.

`searchRules`, `lookupParameters`, `factCheck` and `queryScope` are provisional: their ranking and scores are tuned over time. They search rule ids, titles, parameter names and law excerpts, and look up dollar amounts (not rates); their amounts are decimal strings of cents.

`lookupParameters` and `factCheck` answer from the jurisdiction the query asks about. A query that names a state, by its name or its capitalized two-letter code, is answered from that state's rules; any other query is answered from federal rules. A two-letter word that could be a state or a word (a capitalized `OR`, `IN`, `ME` and the like, or a lowercase `ca`) is not read as a state: `queryScope` reports it in `unclearStateCodes`, `lookupParameters` answers from federal rules, and `factCheck` returns `unknown`. Each `LookupHit` has its `jurisdiction`, and `queryScope(query)` returns how a query was read (`QueryScope`).

- `lookupParameters` returns hits from another jurisdiction only when the query names no state and no federal rule matches.
- `factCheck` never does. Its evidence is the best-matching rule named for every subject word of the query, and on it the amounts the query is certainly about: a parameter whose own words the query uses (`perChild` for "child tax credit per child"), of the kind it names (`cap` for "limit" or "maximum"; a floor, a threshold or a step only when the query names it), fitting the claim's filing status.
- A rule is named by its id, the head of its title (up to the first dash, bracket or colon) and its parameter names. Filler words ("what", "the", "amount", "federal") are not required, and neither are the kind words (cap, limit, maximum, floor, minimum, threshold, phase-out), which select the kind of amount. Every other word counts, however short. A number ("tier 1", "line 28") must be the rule's or the parameter's own, and a numbered parameter (`max2`) is compared only when the query gives its number.
- `verified`: one of those amounts equals the claim. `refuted`: none does, and no rule named for the query holds the claimed figure as an amount the query could mean; the nearest amount is reported. An amount of another kind than the one the query names, and a table's amount for another filing status, don't count as holding it.
- `unknown` whenever it can't settle the claim: no rule is named for all of the query; the rule has no single amount the query is certainly about; the figure is in the law under another name or only inside a formula (the message says where); the amount is the base a rate applies to; the query asks for a rate or a percentage; the claim is under $100 and matches nothing, or is a rate in the rule times one of its amounts; the query names two jurisdictions, a state and "federal", two years, a year that isn't `asOf`'s or a status that isn't `filingStatus`; the query is longer than is read (500 characters, 80 words, 12 terms); or a two-letter word such as `OR` or `ca` could be a state or a word. The word "state" with no state named is a subject word like any other ("state standard deduction" names no federal rule; "state and local tax deduction" names the SALT rule).
- With a filing status, only an amount the rule states for that status is compared: a table at that status, or a parameter labelled for it (`capJoint`, `exemptSingle`). An unlabelled parameter (`cap`, `perChild`), or one labelled for everyone else (`other`), is not compared: whether it applies to a status can be decided in the formula or in another rule. A `filingStatus` that is not among the statuses the query names is `unknown`. With no filing status, every status's amount is compared. A query that lists statuses, or says "married", is held to the same rule: only the amounts the rule states for those statuses.
- A rule whose own id is the query ("income tax" and `us.nm.income_tax`) is the one asked about: only it and its parts (`….income_tax.…`) are evidence. A rule named for the query that has no version in force on the date means the corpus has no figure for that date, and no other rule answers in its place. A rule whose title says it is for one year ("North Dakota 2025 Form ND-1 parameters") is not evidence for a later year, even while it stays in force.
- A parameter that is the base of a percentage is compared only when the query names it (`wageBase` for "wage base"), and one the formula does not use, in a rule that applies a rate, is not compared at all.
- Without `asOf`, a year in the query ("standard deduction 2025") selects that tax year, and with no date at all every version is compared: the verdict's `effectiveFrom` says which one matched. Without `filingStatus`, a status in the query is used; one you pass that differs from the query's is `unknown`. `asOf` must be a real `YYYY-MM-DD` date (`RangeError` otherwise). `queryScope` does not report a bare "joint" or "separate" in the middle of a query as the filing status; `factCheck` reads it as one when no rule is named with it.

## Future years

The corpus holds published law. For a year the IRS hasn't published, `getProjectedFederalCorpus` carries every indexed amount forward from `LAST_PUBLISHED_YEAR` by its statutory indexing formula at a rate you assume, up to `PROJECTION_HORIZON`.

```js
// A year the IRS hasn't published: every indexed amount carried forward at an assumed rate.
import { coerceFacts, evaluate, verifyProof } from "@invaro/opentax-core";
import { corpusForVersion, getProjectedFederalCorpus, LAST_PUBLISHED_YEAR, PROJECTION_HORIZON } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const projected = getProjectedFederalCorpus({ year: 2030, inflationPercent: "2.5" });
  const { value, proof } = evaluate(projected, coerceFacts(projected, { filingStatus: "single", wages: 90000 }), {
    asOf: "2030-12-31",
    target: "us.federal.net_tax",
  });
  return {
    lastPublishedYear: LAST_PUBLISHED_YEAR,
    horizon: PROJECTION_HORIZON,
    cents: value.cents,
    corpusVersion: proof.corpus.version, // names the projection, so the proof says it is one
    verified: verifyProof(proof, corpusForVersion(proof.corpus.version)).ok,
  };
}
```

A projected corpus has its own version string and Merkle root, so a proof made with it says it is a projection. `projectionFromVersion` reads the year and rates back from that string (and returns `null` for published law). `corpusForVersion` takes a proof's `corpus.version` and returns the installed corpus, or the projection of it that the string names; `verifyProof` then tells you whether it is the one the proof was made with. For a proof made on an extended corpus, rebuild it with `extendCorpus`.

## Composers (provisional)

`@invaro/opentax-compose` turns engine answers into form line sets. It is supported and tested, but its input and output shapes follow each year's forms, so they can change in a minor release (always with a note in the release's "API changes").

- **State returns:** `composeStateReturn` with `makeStateTaxEvaluator`; `stateReturnShape` is the input schema, and `incompleteItems`, `IncompleteReturnRefusal` and `isIncompleteReturnRefusal` report lines a state hasn't published yet. Types: `StateReturnInput`, `StateTaxEvaluator`, `IncompleteCode`, `IncompleteItem`.
- **Form 2210:** `composeForm2210` and `form2210InputFromArgs`, with `MissingInput`, `SCHEDULE_AI_FACTS` and `UNDERPAYMENT_RATES`. Types: `Form2210Input`, `Form2210Result`, `PartIIIResult`, `Payment`, `TargetRunner`, `TypedFact`, `TypedFacts`.
- **Form 4562:** `composeForm4562` and `form4562InputFromArgs`, with `ASSET_CLASSES`, `Form4562MissingInput` and `Form4562Refusal`. Types: `DepreciationAsset`, `DepreciationMethod`, `Form4562AssetResult`, `Form4562Input`, `Form4562Result`, `RecoveryClass`.

## Reference

The exact declaration of every export is in the API reports, generated from the built type definitions: [core](../packages/library-api/report/core.api.md), [corpus-us-federal](../packages/library-api/report/corpus-us-federal.api.md), [solve](../packages/library-api/report/solve.api.md), [compose](../packages/library-api/report/compose.api.md).

**`@invaro/opentax-core` (stable)**

| | |
|---|---|
| Evaluate | `evaluate`, `coerceFacts`, `EvaluateOptions`, `EvaluateResult`, `ENGINE` |
| Corpus | `loadCorpus`, `selectVersion`, `LoadedCorpus`, `CorpusInput`, `Rule`, `RuleParameter`, `Citation`, `FactSpec` |
| Formulas | `Expr`, `BracketRow`, `CmpOp`, `RateLit`, `Rounding` |
| Values | `Value`, `ValueType`, `TypedValueJSON`, `Cents`, `valueToJSON`, `valueFromJSON`, `parseDollars`, `parseCents` |
| Proofs | `verifyProof`, `VerifyResult`, `ProofArtifact`, `DerivationNode`, `Assumption`, `CandidateConsidered`, `canonical`, `sha256Hex`, `hashOf`, `ruleHash`, `merkleRoot`, `compareIds`, `artifactBody`, `computeArtifactHash` |
| Errors | `OpenTaxError`, `NeedsFactsError`, `NotModeledError`, `NoApplicableRuleError`, `UnhandledEnumCaseError`, `FactValidationError`, `CorpusValidationError`, `CycleError`, `EngineError`, `MissingFact` |

**`@invaro/opentax-corpus-us-federal` (stable)**

| | |
|---|---|
| The corpus | `getCorpus`, `corpusInput`, `facts`, `DEFAULT_TARGET` |
| Extending | `extendCorpus`, `EXTENSION_POINTS`, `CorpusExtension`, `ExtensionPoint` |
| Projection | `getProjectedFederalCorpus`, `corpusForVersion`, `projectionFromVersion`, `ProjectionOptions`, `LAST_PUBLISHED_YEAR`, `PROJECTION_HORIZON` |

**`@invaro/opentax-solve`**

| | |
|---|---|
| Stable functions | `sweep`, `marginal`, `findCliffs`, `invert`, `compareAcross` |
| Stable types | `SweepOptions`, `SweepPoint`, `SweepResult`, `MarginalOptions`, `MarginalResult`, `Cliff`, `CliffLimits`, `CliffOptions`, `CliffResult`, `InvertOptions`, `InvertResult`, `CompareOptions`, `CompareResult` |
| Provisional | `searchRules`, `lookupParameters`, `factCheck`, `queryScope`, `RuleSearchHit`, `LookupHit`, `FactCheckResult`, `QueryScope` |

Anything else a package exports is internal: it is there for our own packages and can change in any release. The API reports list those names under "internal".

## Compatibility policy

### Three tiers

- **Stable.** Changes incompatibly only in a new major version of its package.
- **Provisional.** Supported and documented. Can change in a minor release, and every change is listed under "API changes" in that release's notes with what to do about it.
- **Internal.** No promise.

### Version numbers

- **`core` and `solve` follow [semantic versioning](https://semver.org).** A patch release fixes bugs. A minor release adds things. A major release is the only one that can break stable code, and we announce it at least 60 days ahead.
- **`compose` is 0.x while it is provisional.** A change to a shape bumps the minor version.
- **The corpus version is the release number**, and the git tag is the same number (`v0.53.0`). It moves every time the law or the coverage does, so it does not follow semantic versioning for answers: a new release can change a number because the law changed or because we fixed a mistake. It has no major version to signal a break with, so a breaking change to its stable code API (`getCorpus`, `extendCorpus` and the rest of the stable list) is announced in the release notes at least 60 days ahead, and its ids follow the rules below.

### What counts as a breaking change to code

Breaking, so major version only:

- Removing or renaming a stable export, or moving it to another package.
- Changing a stable function so that a call that worked stops working or means something else: a removed or reordered parameter, a newly required option, a narrower accepted input, a changed return shape.
- Changing an error class's `code`, or the documented fields of its `data()`.
- Changing the proof format. A proof made by any core 1.x verifies with any other 1.x against the same corpus; a new `schemaVersion` comes only with a new major version.
- Dropping a runtime the page above lists.

Not breaking, so allowed in a minor release:

- New exports, new optional parameters and options, new fields on results and on error data.
- New `Expr` kinds, new error classes and codes, new `reason` values. Write your `switch` statements with a default branch.
- Message text of errors and refusals, and the wording of titles, descriptions and rationales.
- Anything internal, and performance.

### What we promise about facts, rules and answers

Your code holds our ids: fact ids in your inputs, rule ids as targets and in your own rules.

- **Fact ids** are not removed, renamed or given another type, an enum value is not removed, and the range a fact accepts is not narrowed.
- **Defaults stay.** A fact that has a default keeps one, so an input that got an answer does not start getting a question. The one exception is a default that turns out to hide a wrong answer (see below).
- **Rule ids** are not removed or given another meaning or output type. `us.federal.agi` will always be adjusted gross income.
- **A published rule version never changes.** A rule is identified by `id@version` and a hash of its content. Changing a rule means adding a new version with a number never used before, and the release notes list every version added and retired. This is what makes a pin trustworthy.
- **Extension points** keep their ids and their meaning.
- **Every release stays available**, unchanged, with its checksums. A proof names its corpus by Merkle root, so you can always reproduce an old answer by installing the release that made it.

Two things can change in any release, and both are always listed in the release notes:

- **Answers.** When the law changes, or we find a rule that was wrong, the number changes. The notes say which rules.
- **New questions and new refusals.** If a correct answer needs a fact the engine didn't ask for, or a default was hiding a wrong answer, a release adds the question (or a refusal where a number used to come back). We do this without a waiting period, because the alternative is a wrong number.

If we ever need to break one of the id promises, we announce it in the release notes at least 60 days and one release before it takes effect, and say what replaces it.

### How this is enforced

These are tests in the repository (`packages/library-api`), run on every change on Node 20, 22 and 24:

- **Every export is classified** as stable, provisional or internal. An unclassified export fails the build, and so does a stable declaration that mentions a provisional or internal type.
- **An API report** with the declaration of every export is generated from the type definitions and committed, so a change to the surface is a visible diff.
- **A baseline of the last release** is compared with the current tree: every fact id with its type, enum values, range and whether it has a default; every rule id with its output type; the hash of every rule version and the highest version number each rule has had; the extension points; each error's code and data fields; and a hash of every stable declaration. A removed or retyped id, a narrowed range, a lost default, an edited rule version or a reused version number fails. So does any change to a stable declaration until it is recorded as additive or breaking, and a breaking one fails until the package's major version goes up. Rolling the baseline forward is refused while the tree breaks it.
- **A frozen corpus** that uses every kind of formula, an override, a contribution and an exclusion has its Merkle root, rule hashes and proofs stored as they were made by core 0.1.0. Today's core must produce the same hashes, verify those proofs, and derive them again byte for byte.
- **Hashing:** an object edited after it was hashed gets a new hash, a proof edited in memory fails verification, and no source file sorts or formats with the machine's locale.
- **The examples on this page** are files in `packages/library-api/examples`. The tests run them and check their answers, and check that this page shows them verbatim.
- **A licensee-style check** packs the four tarballs, installs them into an empty project, runs the examples against them, bundles them for the browser and type-checks a strict TypeScript consumer.

Three promises are kept by process, not by a test: the notice periods, the "API changes" list in release notes, and never replacing a published release.

### Support

Fixes ship in the latest release. We don't patch older releases, but they stay installable. Questions and reports: founders@invaro.ai, or an issue on the repository.
