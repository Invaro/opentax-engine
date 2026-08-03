# The state pipeline

How a state goes from uncovered to a deep pack, and how the corpus stays
current after that. This is the process that produced the PA, NJ/OH, and
GA/NC packs; it is written down so any session (human or agent) can run it
without rediscovering the method, and so the automatable parts can be
scheduled instead of remembered.

## The dashboard

```bash
pnpm -F @invaro/opentax-corpus-us-federal report:coverage            # human table
pnpm -F @invaro/opentax-corpus-us-federal report:coverage -- --json  # for CI / agents
```

The report answers three operational questions per jurisdiction:

1. **Depth tier** — `deep+composer` / `computable` / `single-rule` /
   `parameters-only` / `UNCOVERED`. The work queue is: uncovered and
   single-rule states, ordered by resident filer count.
2. **Coverage horizon** — the furthest `effectiveTo` any current rule
   reaches. `⚠ stale at horizon` means the state has no rule valid for the
   next filing season and needs a re-verification pass, not a rebuild.
3. **Expiring rules** — every rule id whose *latest version* ends by the
   horizon. Superseded old versions never false-flag.

## One state, end to end

Each stage names what runs it (agent / encoder / reviewer) and what gates it.

### 1. Research (two independent legs, parallel)

Launch a research agent with the standing prompt shape (see the PA/NJ/OH/GA/NC
rounds in the git history): official DOR instruction booklet + printed form +
statute text only, verbatim quotes with URLs, per-item confidence notes,
UNVERIFIED marked rather than filled from memory. **In parallel, the encoding
session independently reads the primary PDFs itself** (WebFetch saves them
locally; the Read tool renders pages). The two legs plus an outside
cross-check (Tax Foundation, the statute's own fixed-dollar forms) are the
triple-check; a number goes into a rule only when the legs agree.

Non-negotiables learned the hard way:

- **Encode printed anchors, never recomputed continuations.** Ohio's
  $2,394.32 is not $342 + 2.75% × the gap; New Jersey's Table B subtraction
  constants are discontinuous at two boundaries. Chaining brackets from the
  prior row reproduces neither.
- **Printed tables are the law of the return.** Where a state mandates a tax
  table below a threshold, verify the table equals the schedule at the
  band midpoint (NY, NJ) and encode that method with a `useFormulaMethod`
  escape hatch. Sample real printed rows into fixtures.
- **Retroactive legislation beats surveys.** GA HB 111, OH HB 96, and UT
  HB 106 all cut rates retroactively after the year began; surveys published
  in January still print the old rate. The statute and the printed booklet
  win.

### 2. Encode

One `rules/state-XX.ts` module: versioned rules with verbatim-excerpt
citations, validity windows, conservative defaults (a missing attestation
produces $0 credit or a refusal, never an overstated benefit). New facts go
in `facts.ts` with defaults + rationale. Register in `state-parameters.ts`.
Out-of-scope surfaces (local levies, part-year returns) are *named* in the
parameters rule so refusals carry context.

### 3. Compose

`packages/compose/src/xx.ts`: the printed form's line numbers and captions,
whole-dollar rounding, worksheets the form itself prescribes (deduction-vs-
credit selections that need the tax evaluated twice live here). Add the
jurisdiction to `types.ts`, `shape.ts`, and the dispatcher; decide whether
the state needs `federalAGI` (AGI states) or is class/category-based (PA/NJ).

### 4. Fixture

Hand-computed golden fixtures before trusting the engine: the booklet's own
worked examples first (they are the agency's test vectors), then boundary
rows, cliffs, denial paths, and both years where a TY2026 rule exists.
Real-corpus composer tests in `packages/mcp/test/state-return.test.ts` cover
the line-flow the rule fixtures can't.

### 5. Wire and gate

Contract tests enforce the rest mechanically: every fact needs a CLI flag
(`cli/src/flags.ts`) and an MCP fact-group assignment (`mcp/src/schema.ts`);
CI regenerates all four committed artifacts (corpus lock, CLI bundle, MCP
bundle, **and the site's hosted bundle** — `pnpm -F @invaro/opentax
build:hosted`, the one that's easy to forget) and fails on drift.

### 6. Adversarial verify

Before the PR: an independent review agent over the diff with the verified
ground truth in its prompt, plus edge-case evals the fixtures don't cover
(unattested gates → $0, out-of-window asOf → refusal, status routing, printed
cliffs). The NJ/OH round's reviewer caught a real printed-form divergence the
515-test suite could not see; treat this stage as load-bearing, not optional.

### 7. Ship

Branch, PR (title matches the `type(scope):` CI check; body is summary +
test plan), merge auto-deploys the hosted MCP endpoint.

## Keeping it current (the treadmill)

Currency work is different from coverage work: smaller, calendar-driven, and
almost fully automatable.

- **Annual parameter cycle.** Federal: the October Revenue Procedure seeds
  every indexed TY(n+1) parameter as new rule *versions* with new windows —
  never in-place edits, so old proofs stay verifiable. States: each DOR
  publishes new booklets Nov–Jan; the report's `--horizon` flag lists exactly
  which states still lack next-season rules. Run
  `report:coverage -- --horizon <Dec 31 of the coming tax year>` monthly from
  October; the `staleAtHorizon` list *is* the work queue.
- **Scheduled currency watch.** A recurring agent per quarter sweeps each
  covered state's "what's new"/legislative-update page for mid-year changes
  (the retroactive-rate-cut pattern above). Findings become issues, not
  edits — a human-reviewed encode pass follows the same stages 1–7.
- **Pre-season gate.** Before filing season, CI (or a scheduled session)
  consumes the `--json` report and fails if any `deep+composer` state is
  `staleAtHorizon` for the season being filed.
- **Differential testing.** The PolicyEngine harness (federal, 572 scenarios)
  extends state-by-state as packs land; disagreements are triaged to a
  primary source, and whichever side is wrong files the fix upstream.

## Scaling constraints, stated honestly

- **Two deep states per working session** is the sustainable rate with full
  triple-verification. The bottleneck is verification, and that is by
  design — the corpus's value is that every number was checked, not that it
  was typed quickly.
- **Research agents hallucinate less than they omit.** The failure mode seen
  in practice is a missed provision, not an invented number — which is why
  the encoding session independently reads the booklet rather than trusting
  the report alone.
- **Composer complexity varies 10×.** A flat AGI state (NC) is a day's
  stage 2–4; a category state with worksheets (NJ) is several times that.
  Queue order should weigh filers *and* structure.
