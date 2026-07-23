# Validation

Every rule in the corpus cites the statute, regulation, or official form
instruction it encodes, and every answer ships with a machine-checkable proof
tree ([PROOF-FORMAT.md](PROOF-FORMAT.md)). This document describes how the
engine's correctness is tested.

## 1. Primary sources

Parameters (brackets, caps, phase-outs, tables) are verified against the
issuing agency's current publications; every rule carries its citation, a
verbatim source excerpt, and the validity window it asserts. Where an official
printed table and its generating formula can differ by $1 (whole-dollar tables
built on $50 brackets), the rule documents which convention it encodes and
why — see the VA tax-table and NY schedule notes in the state rules. Below
$100,000 the federal engine reproduces the printed IRS Tax Table method
exactly (band-midpoint formula, half-up rounding), pinned by a test suite
sampled from the printed 2025 table across all four statuses.

## 2. Benchmark results

On [TaxCalcBench](https://github.com/column-tax/tax-calc-bench) TY25 (50 full
returns, federal + IL/VA/CA/NY), a cold Claude Sonnet agent using the opentax
MCP server as its computation oracle scores **48/50 returns exact under strict
scoring (96%), 805/820 scored lines (98.2%)** — one attempt per case, scored
with the benchmark's own evaluator. The two remaining cases contain
reference-data inconsistencies that the engine's line-level reconciliation
surfaced, reported upstream
([tax-calc-bench#96](https://github.com/column-tax/tax-calc-bench/issues/96)).
