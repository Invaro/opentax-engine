# Contributing to opentax-engine

The engine (`@invaro/opentax-core`) is domain-general and rarely needs changes. Almost all contributions are **corpus work**: encoding more tax law as cited, tested rule data. You don't need to be a TypeScript expert — a rule is a JSON-shaped object — but you do need to read the statute you're encoding.

## Ground rules

1. **Every rule cites its source.** `citation.source` + `section`, ideally a `url` and a short verbatim `excerpt` of the operative text.
2. **Never wrong-but-plausible.** If you can't encode a case correctly, leave it uncovered — an unhandled `match` case or a missing rule fails loudly, and that's the contract. A wrong answer that looks right is the one unforgivable bug.
3. **No unverified numbers.** Dollar amounts come from the primary source (the Code, a Rev. Proc., a public law), not from memory or a blog post.
4. **Money is integer cents.** In rule literals: `{ kind: "money", cents: "1500000" }` is $15,000. In fixture facts and CLI input: plain dollars.

## Adding a rule: the 4-step loop

Worked example — suppose you're adding the **saver's credit** (§ 25B).

### 1. Write the rule(s) in `packages/corpus-us-federal/src/rules/`

```ts
// saver-credit.ts
import type { Expr, Rule } from "@invaro/opentax-core";

const TY = { effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" };
const fact = (factId: string): Expr => ({ kind: "fact", factId });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });

export const saverCreditRules: Rule[] = [
  {
    id: "us.federal.saver_credit",
    version: 1,
    jurisdiction: "us.federal",
    title: "Retirement savings contributions credit",
    citation: {
      source: "26 U.S.C. § 25B; Rev. Proc. 2024-40",
      section: "§ 25B(a)-(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/25B",
      excerpt: "…allowed as a credit… the applicable percentage of so much of the qualified retirement savings contributions…",
    },
    ...TY,
    output: { type: "money" },
    formula: { /* build from the AST: match / brackets / mulRate / min / … */ },
  },
];
```

Register it in `src/index.ts` (`rules: [...existing, ...saverCreditRules]`) and add any new input facts to `src/facts.ts` — with a documented `default` only if the statute genuinely implies one (defaults become recorded assumptions in every proof).

The expression AST is deliberately small: literals, fact/rule/param refs, `add/sub/min/max/max0/clamp`, `mulRate` (with explicit rounding), `mulInt`, `stepUnits` (for "per $X or fraction thereof"), `brackets` (lower-bound tables), `if/and/or/not/cmp`, and `match` over enums. If you think you need a new node kind, open an issue first — most statutes fit.

### 2. Encode exceptions as override rules, not nested ifs

Statutes are written as general-rule-plus-exceptions, and the corpus mirrors that. An exception is its own rule with a guard, and it `overrides` the base:

```ts
{
  id: "us.federal.saver_credit.student_exclusion",
  // …citation for § 25B(c)(2)(B)…
  applicability: fact("isFullTimeStudent"),
  formula: { kind: "money", cents: "0" },
  overrides: { ruleId: "us.federal.saver_credit", priority: 10 },
}
```

Why this matters: the proof records **every candidate considered and why it did or didn't fire**, so the exception logic is auditable. Priority ties are rejected at load time; higher priority wins.

For a **retroactive amendment** (Congress changes a 2025 amount mid-2025): bump the rule's `version`, encode the corrected amounts, and cite the amending act (see `standard-deduction.ts` v2 and `ctc.ts` v2, which encode the OBBBA's retroactive TY2025 changes with P.L. 119-21 citations). Old proofs stay verifiable against the old corpus Merkle root; that's the point of content addressing.

### 3. Add a golden fixture in `test/fixtures/`

Compute the expected result **by hand from the statute** (show your arithmetic in `description`), in exact cents:

```json
{
  "description": "Single, $20,000 wages, $1,000 retirement contribution: 50% bracket -> $500 credit. Tax before credits $500.00 - ...",
  "facts": { "filingStatus": "single", "wages": 20000, "retirementContributions": 1000 },
  "asOf": "2025-12-31",
  "expect": {
    "valueCents": "…",
    "intermediates": { "us.federal.saver_credit": "50000" }
  }
}
```

Good fixtures pin **boundaries**: the dollar where a phase-out starts, the exact-multiple vs fraction-thereof step, the income where a bracket flips. Every fixture automatically also gets a determinism check and a verify/tamper round-trip — you don't write those.

### 4. Run the loop

```bash
pnpm test                                       # your fixture fails until the rule is right
pnpm -F @invaro/opentax-corpus-us-federal gen:lock     # corpus hashes changed — regenerate the lock
pnpm test                                       # everything green
```

The lock-file diff in your PR shows reviewers exactly which rules changed by content hash. A PR that touches rule semantics without a lock diff is impossible; a lock diff without a fixture is a review red flag.

## PR checklist

- [ ] Every new/changed rule has a primary-source citation (+ excerpt)
- [ ] New facts have descriptions; defaults only where statutorily sensible, with a rationale
- [ ] Golden fixture(s) with hand-computed exact cents, boundaries pinned
- [ ] Uncovered branches fail loud (no `else` that guesses)
- [ ] `corpus.lock.json` regenerated; `pnpm build && pnpm test` green
- [ ] Simplifications visible in the rule `title` (e.g. "simplified: MAGI approximated as AGI") — the proof must never claim more than the corpus covers

## PR titles

CI enforces this format (a check re-runs whenever you edit the title):

```
type(scope): brief description
```

Examples: `feat(corpus): encode § 25B saver's credit` · `fix(compose): VA line 19b odd-dollar split` · `docs(readme): fix CLI install command`. The scope is optional but encouraged — use the package or area you touched (`corpus`, `core`, `compose`, `mcp`, `cli`, `site`, `harness`, `deps`).

| Type | Usage |
|---|---|
| `feat` | New features or significant additions (new rules count) |
| `fix` | Bug fixes |
| `chore` | Routine tasks, maintenance, dependencies |
| `docs` | Documentation updates |
| `style` | Code style/formatting changes |
| `refactor` | Code changes that neither fix bugs nor add features |
| `test` | Adding or modifying tests/fixtures |
| `perf` | Performance improvements |

## What CI checks on every PR

- **build & test** on Node 22 and 24 — `pnpm build && pnpm test`: the full suite, golden fixtures, and the corpus-lock drift test
- **generated artifacts in sync** — CI regenerates `corpus.lock.json` and the distributed bundles and fails if the committed copies differ (run `pnpm -F @invaro/opentax-corpus-us-federal gen:lock` and `pnpm -F @invaro/opentax build:hosted` after source changes)
- **site build** — the Next.js site compiles
- **pr title** — matches the `type(scope): description` format above

All checks must pass before merge.

## Engine contributions

Core changes need: a failing test first, no new runtime dependencies, and no floats within a mile of money. The canonical-JSON/hashing layer is consensus-critical — changes there invalidate every existing proof and need a `schemaVersion` bump and a very good reason.
