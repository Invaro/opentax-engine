# Validation package

What stands behind the accuracy claims, exactly, and how to reproduce every piece of it. Read this before relying on the engine for anything filed.

## 1. Exact versions

| component | value |
|---|---|
| rule corpus | `0.39.0` — `packages/corpus-us-federal/src/index.ts`; the lock file `packages/corpus-us-federal/corpus.lock.json` pins every rule's content hash |
| corpus Merkle root | printed by every API response and by `corpus.lock.json`; the hosted endpoint reports the root of whatever corpus it is serving, so an evaluator can confirm the deployed corpus matches the one they tested |
| proof schema | v2 ([PROOF-FORMAT.md](../PROOF-FORMAT.md)); `packages/core` |
| MCP SDK | `@modelcontextprotocol/sdk` 1.29.0 |
| git | the commit whose `corpus.lock.json` carries the root above (`git log -1 -- packages/corpus-us-federal/corpus.lock.json`) |

Engine arithmetic is integer cents throughout — there is no floating point anywhere in a computation.

## 2. Test commands and golden fixtures

```bash
pnpm install && pnpm build
pnpm test                       # 30 files, 2,059 tests
pnpm -F @invaro/opentax-corpus-us-federal report:coverage        # the coverage dashboard
node packages/corpus-us-federal/scripts/coverage-matrix.mjs      # the machine-readable matrix
```

What `pnpm test` runs:

- **1,581 golden fixtures** (`packages/corpus-us-federal/test/fixtures/*.json`): each is a hand-computed expected value for one rule at one date, written from the statute or the printed form BEFORE the rule was trusted, with the arithmetic in its description. Every fixture is evaluated against the live corpus.
- **Printed-table parity suites** — the engine must reproduce every cell of the agency's own printed tax table, at both ends of every row: Delaware (1,162 rows), Hawaii (2,000 rows × 3 columns), Kansas (2,000 rows × 2), Oklahoma (2,000 rows × 2, plus the 2020 EIC table used by Form 511-EIC, 1,129 rows), Rhode Island (2,000 rows), West Virginia (1,702 rows), Nebraska (777 rows × 4, plus the use-tax table), North Dakota (1,195 rows × 4 = 4,780 cells), Vermont (750 rows × 4 = 3,000 cells), Maine (2,000-row table plus the Sales Tax Fairness Credit tables), Arkansas (every whole dollar $1–$100,000 of the Regular table plus five Low Income tables), Connecticut (40-cell transcription of an image-only table), New Mexico (the PIT-RC LICTR and child-credit tables); federal: a 333-row sample of the 2025 IRS Tax Table across all four statuses (`tax-table.test.ts`). Each suite states the rounding convention it proved (row midpoint, half-up, printed anchors) and every exception the printed table carries.
- **Composer tests** (`packages/mcp/test/state-return.test.ts`): hand-computed line sets for every composed state.
- **Contract tests**: every input fact has a CLI flag and an MCP schema entry; the corpus lock matches the source; the proof format's published test vectors re-derive.
- **`staleness.test.ts`**: the checked-in declaration of which rules end before the 2026-12-31 horizon must match the rule windows exactly.

Fixtures and parity assets are plain JSON under `packages/corpus-us-federal/test/` — the whole package is reproducible from a clone.

## 3. Differential test against PolicyEngine US (federal, TY2025)

`harness/` — `scenarios.json` (572 scenarios), `run-opentax.mjs`, `run_policyengine.py`, `compare.mjs`, `results-opentax.json`, `results-policyengine.json`, `known-differences.json`, `REPORT.md`.

- **Comparable total:** opentax `us.federal.net_tax` in formula mode ↔ PolicyEngine `income_tax + additional_medicare_tax + self_employment_tax`.
- **Grid:** wages × filing status × children × senior × interest × capital gains × tips × overtime × self-employment/QBI × student loan × Schedule A (SALT phase-down, floor, MFS halves, mortgage, medical, charity, election boundary).
- **Result:** 533 exact to the cent, 6 within 2¢ (float rounding on PolicyEngine's side), **33 explained differences, 0 unexplained disagreements, 0 errors.** The 33 are triaged in `known-differences.json` with the primary-source authority for OpenTax's reading — the CTC phase-out threshold for a qualifying surviving spouse ($200,000 per the 2025 Schedule 8812 instructions; PolicyEngine uses $400,000), the § 224 tips deduction (PolicyEngine models tips as an uncapped exclusion), and the §§ 224/225 whole-$1,000 phase-out step (PolicyEngine is continuous).
- **Overlapping variables tested:** employment income, tips, FSLA overtime premium, taxable interest, long-term capital gains, qualified dividends, self-employment income, student-loan interest, age (senior deduction), dependents' ages, SALT paid, mortgage interest, medical expenses, charitable cash. **Not overlapping (no PolicyEngine input exists):** the OBBBA car-loan interest deduction and HSA — those rest on statute-text fixtures only.
- **PolicyEngine version:** `results-policyengine.json` as committed does **not** record the package version (the run script now writes it; re-running populates it). The harness was last run in July 2026 against the then-current `policyengine-us` release; the locally installed package at the time of this document is 1.766.4. Re-run: `python3 harness/run_policyengine.py harness/scenarios.json > harness/results-policyengine.json && node harness/run-opentax.mjs && node harness/compare.mjs`.
- **Scope of the claim:** federal individual, TY2025 only. There is no PolicyEngine comparison for TY2026, for state returns, or for business entities.

## 4. What "0% error margin" means — precisely

It is a statement about specific test sets, not a warranty about every return:

1. **0 unexplained disagreements > $1** against PolicyEngine US across 572 TY2025 federal scenarios (533 exact, 6 within 2¢, 33 documented divergences where the primary source supports OpenTax's reading).
2. **100% of 1,581 hand-computed golden fixtures** reproduce.
3. **100% of every printed tax-table cell** in the 13 state parity suites and the federal sample above reproduce, at both ends of every row.

It does **not** mean: agreement with a filed-return population, coverage of part-year or nonresident returns, coverage of business return line sets, or TY2026 state figures the Departments have not published (those refuse — see the staleness declaration).

## 5. Known mismatches and exclusions

- `harness/known-differences.json` — every divergence from PolicyEngine, with authority.
- `packages/corpus-us-federal/src/staleness.ts` — every rule with no TY2026 version yet, per state, with the publication that unblocks it; enforced by test.
- The coverage matrix's `approximations` list — federal rules whose title discloses a simplification (e.g. MAGI approximated as AGI for the OBBBA deductions; the ACTC's three-child Social Security alternative not modeled; car-loan and senior deductions' MAGI).
- Printed-table conventions: where an agency's whole-dollar table and its own formula differ by $1, the rule documents which it encodes (the table, when the table is mandatory) — e.g. Vermont's first row printing $0, Rhode Island's, Kansas's rounded over-$100,000 worksheet constants.
- Source conflicts encoded as the form prints them and disclosed in the rule: Vermont's 3% minimum base, Vermont's surviving-spouse exemption, Rhode Island's "less than" vs "less than or equal", North Dakota's marriage-penalty gates, Delaware's $2,943.50 anchor.
- Refusals (never approximated): CAMT, retained trust capital gains, kiddie preferential income, a fourth simultaneous AOTC student, § 199A × § 68, part-year/nonresident state returns, state business returns, Form 990, Form 1065 computations.
