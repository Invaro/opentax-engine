# The opentax proof format — specification v2

This document specifies the proof artifact completely enough that you can
write an **independent checker in any language you trust**, without reading
this repository's code. That independence — not our own verifier — is the
point of the format.

Normative reference implementation: `packages/core/src/`
(`canonical.ts`, `sha256`-based `hash.ts`, `proof.ts`, `verify.ts`,
`evaluate.ts`, `money.ts`). Where prose and code disagree, the code and the
committed test vectors win, and the disagreement is a bug in this document.

There are two tiers of checker, and both are useful:

| tier | what it proves | what you must implement |
|---|---|---|
| **integrity checker** | the file is exactly what some engine produced (untampered), and names the exact rule corpus it used | canonical JSON + SHA-256 (§2–§4) |
| **full verifier** | the recorded derivation actually follows from the recorded facts under the pinned rules | the above + the expression semantics (§6) |

---

## 1 · Values

Every domain value is a **typed value**:

```json
{ "type": "money", "value": "564300" }   // integer CENTS, decimal string (may be negative)
{ "type": "int",   "value": "2" }        // decimal string
{ "type": "bool",  "value": true }       // JSON boolean
{ "type": "enum",  "value": "mfj" }      // string tag
```

Money is exact integer cents. **No IEEE floats appear anywhere** in a proof;
a conforming checker must do exact integer arithmetic (bignums or 64-bit+
integers — US individual amounts fit comfortably in 64 bits, but don't rely
on it).

## 2 · Canonical JSON

All hashing is over **canonical JSON** (an RFC 8785-style subset):

1. Object keys sorted **lexicographically by Unicode code point** at every
   level; keys whose value is `undefined`/absent are omitted.
2. No whitespace of any kind.
3. Strings serialized with standard JSON escaping (the shortest form your
   JSON library's `stringify` emits for `"…"`; non-ASCII characters are
   emitted raw, not `\u`-escaped).
4. Numbers appear **only** as safe integers (array indices, rule versions,
   priorities). Anything non-integer is a hard error — domain numerics are
   already decimal strings.
5. `null`, `true`, `false` as usual; arrays keep their order.

Test vector:

```
input   { b: 1, a: "x", c: [true, null, "§"] }
canon   {"a":"x","b":1,"c":[true,null,"§"]}
sha256  017b70e0870761b93f5a2f500e58237cf13f723c8e4ec70c0e95c9605909cbca
```

## 3 · Hashing

`hashOf(x)` = the string `"sha256:" + lowercase-hex( SHA-256( UTF-8( canonical(x) ) ) )`.

- **Rule hash** — `hashOf(rule)` over the entire rule object: id, version,
  jurisdiction, title, citation (source/section/url/excerpt), validity
  window, output type, parameters, applicability guard, formula, and
  override declaration. Change one character of an excerpt and the hash
  moves.
- **Artifact hash** — `hashOf(body)` where `body` is the artifact with the
  `artifactHash` field removed (all other fields retained; see §5).

## 4 · The corpus Merkle root

The root pins the **entire body of law the answer used** — every rule and
the fact catalog (fact *defaults* affect answers, so they are pinned too).

Construction:

1. Sort all rules by `id` ascending, ties by `version` ascending
   (plain code-point string comparison).
2. Leaves: `sha256hex(canonical(rule))` for each rule **in that order** —
   note: leaf = bare lowercase hex, *no* `"sha256:"` prefix.
3. If the fact catalog is non-empty: append one extra leaf
   `sha256hex(canonical({ "facts": factsSortedById }))`.
4. Reduce level by level: parent = `sha256hex(leftHex + "|" + rightHex)` —
   the **ASCII concatenation of the two lowercase hex strings joined by a
   pipe**, not raw bytes. An odd node at the end of a level pairs with
   itself.
5. Root = `"sha256:" + finalHex`. An empty corpus hashes the empty string:
   `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Worked vector (two tiny rules + one fact, reproducible from the shapes in
`packages/core/test`):

```
ruleHash(demo.a@1) sha256:cd4c673b8583d83ea9e117bf086efdff7f90b514c7c1b3cf4211bcc0b2640829
ruleHash(demo.b@1) sha256:f9575198760a2d64f8b780e9617c0cb983e0148cb474486d5721cfd7b4e4a33c
facts leaf         sha256:f728a6c4653617753676bac1a37aaa7150f39978f6b6dbf379b05c788a0dc1a8
merkle root        sha256:530ef172c65a6d0c9a6cf43e956745c4f739e6137964864e4963a46e6aa4c616
```

(demo.a sorts before demo.b regardless of input order; the facts leaf is
appended after the sorted rule leaves.)

The corpus this repository ships is itself pinned in
`packages/corpus-us-federal/corpus.lock.json` — every `id@version → hash`
plus the root — and CI fails if the source drifts from the lock.

## 5 · The artifact

```jsonc
{
  "schemaVersion": "2",
  "engine":  { "name": "opentax-core", "version": "…" },   // informational
  "corpus":  { "name": "…", "version": "…", "merkleRoot": "sha256:…" },
  "asOf":    "2026-07-07",          // the law-in-force date used
  "target":  "us.federal.net_tax",  // the rule the root node answers
  "facts":   { "<factId>": TypedValue, … },   // ALL inputs, post-coercion
  "assumptions": [                  // every default the engine relied on
    { "factId": "…", "value": TypedValue, "source": "default", "rationale": "…" }, …
  ],
  "root":    DerivationNode,
  "artifactHash": "sha256:…"        // hashOf(artifact minus this field)
}
```

### DerivationNode

```jsonc
{
  "kind": "rule" | "fact" | "assumption",

  // kind == "rule":
  "ruleId": "us.federal.standard_deduction",
  "ruleVersion": 1,
  "ruleHash": "sha256:…",           // content hash of the exact rule text used
  "title": "…",
  "citation": { "source": "…", "section": "…", "url": "…", "excerpt": "…" },
  "resolvedFrom": "us.federal.x",   // present iff this node answers a reference
                                    // to a rule it OVERRIDES (see below)
  "candidatesConsidered": [         // override audit trail, most-specific first
    { "ruleId": "…", "version": 1, "priority": 10, "applicable": true|false|"unknown" }, …
  ],
  "inputs": { "<dependencyId>": TypedValue, … },  // direct deps, resolved

  // kind == "fact" | "assumption":
  "factId": "wages",

  // always:
  "value": TypedValue,
  "children": [ DerivationNode, … ] // absent/empty for leaves
}
```

Node semantics:

- A **rule node**'s `value` is the result of evaluating that rule's formula
  with its `children` as sub-derivations, in evaluation order. A rule
  referenced more than once carries its FULL sub-derivation only at its
  first occurrence (evaluation order); every later reference repeats the
  node's metadata and `value` **without a `children` field** — a
  deterministic first-occurrence dedup that keeps deep proofs linear in
  the number of unique rules rather than exponential in references.
- A **fact node** records a user-supplied input; an **assumption node**
  records a fact filled from its catalog default. Every assumption node's
  fact also appears in the top-level `assumptions` list with its rationale.
- **Overrides**: when rule *B* declares it overrides rule *A* and B's guard
  holds, a reference to *A* resolves to *B*. The answering node carries
  `ruleId: B`, `resolvedFrom: A`, and `candidatesConsidered` listing every
  candidate (including *A* itself) with each guard's outcome — `"unknown"`
  means the guard could not be evaluated. The proof therefore shows not
  just what fired but why the alternatives did or didn't.
- `facts` in the artifact is the complete post-coercion fact set. Re-running
  the engine on `facts` + `asOf` + `target` must reproduce `root` and
  `assumptions` **byte-for-byte under canonical JSON**.

## 6 · Expression semantics (full verifiers)

Rules are data; their formulas are a small total expression language. A full
verifier must implement it exactly:

- Types: money (bigint cents), int (bigint), bool, enum. Arithmetic never
  mixes money and int except where stated.
- `add / sub / min / max / max0`: exact integer ops. `clamp(v, lo, hi)`.
- `mulRate(base, {num, den}, round)`: exactly `round(base × num / den)` with
  **one** division. Rounding modes:
  - `half-up`: ties away from zero (the money default)
  - `half-even`: banker's rounding
  - `floor` / `ceil`: toward −∞ / +∞ (statutory "round down" / "or fraction
    thereof")
- `mulInt(base, count)`: money × int, exact.
- `mulDiv(a, b, c, round)`: `round(a × b / c)` — one division at the end
  (statutory ratio phase-outs).
- `stepUnits(value, unitCents, mode)`: whole `unit`-sized steps in `value`;
  `ceil` makes a fraction count as a full step.
- `roundToDollar(value, mode)`: to a multiple of 100 cents.
- `brackets(base, table)`: `table` rows are `{threshold, rate}` with
  threshold = the row's **lower bound** in cents (first row `"0"`). Tax =
  Σ over rows of `mulRate(span-in-that-row, rate, half-up)` — **each
  bracket term rounds half-up to the cent independently**, then sums.
- `cmp(lt|le|gt|ge|eq|ne)`; `not`.
- `and / or` short-circuit **by decision, not by position**: arguments
  evaluate in order and the first *deciding* value (`false` for `and`,
  `true` for `or`) settles the result; an argument that cannot be evaluated
  for missing facts is skipped and only fails the expression if no argument
  decides. (So `and(isMFS, spouseItemizes)` never demands `spouseItemizes`
  from a single filer.)
- `if(cond, then, else)`: only the taken branch is derived.
- `match(on, cases, else?)` on enum tags: no matching case and no `else` is
  a hard error (`UNHANDLED_ENUM_CASE`), never a default.
- `fact(id)` reads an input (or its default, recording an assumption);
  `rule(id)` references another rule (subject to override resolution and
  the `asOf` validity window: `effectiveFrom ≤ asOf < effectiveTo`, at most
  one version valid at a time); `param(name)` reads the rule's own pinned
  parameter table.
- `unsupported(reason)`: evaluating it **throws** (`NOT_MODELED`). A proof
  can never contain a value that passed through one.

## 7 · Verification algorithm

Given an artifact and your own copy of the corpus:

1. **Shape** — `schemaVersion == "2"` and all required fields present;
   otherwise `invalid-artifact`.
2. **Integrity** — recompute `hashOf(body)` (§5). Mismatch ⇒
   `artifact-hash-mismatch`: the file was altered after creation.
3. **Corpus pinning** — `artifact.corpus.merkleRoot` must equal the root of
   *your* corpus. Mismatch ⇒ `corpus-mismatch`: an honest proof, possibly,
   but under different law than you hold; you cannot vouch for it.
4. **Re-derivation** (full verifiers) — evaluate `target` as of `asOf` with
   `facts`. Compare `canonical(root)` and `canonical(assumptions)` against
   the recorded ones; any difference ⇒ `divergence`, reported with the
   first differing tree path.
5. Success ⇒ report the target, the value, and the corpus root you verified
   against.

An integrity checker performs steps 1–3 and states clearly that it checked
integrity and pinning, not derivation.

## 8 · What verification does and does not prove

Proves: the artifact is untampered; it names the exact rules (down to each
citation character) it used; and — for full verifiers — the recorded answer
actually follows from the recorded facts under those rules, with every
assumption surfaced.

Does **not** prove: that the facts are true (garbage in, provably-derived
garbage out); that the corpus faithfully encodes the statute (that is what
the per-rule citations, the golden fixtures, and the differential harness
are for — audit them independently); or anything about rules outside the
derivation.

## 9 · Stability

`schemaVersion` is `"2"` (v1 embedded every repeated sub-derivation
verbatim; v2 introduced first-occurrence dedup before any public release —
v1 artifacts were never published and are rejected as `invalid-artifact`).
Any change to canonicalization, hashing, the Merkle construction, node
semantics, or expression semantics bumps the schema version; old artifacts
remain verifiable by old-schema checkers against the corpus root they pin.
