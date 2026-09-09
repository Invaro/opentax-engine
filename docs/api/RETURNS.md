# What the API returns

Answering, item by item, "confirmation of what the API returns".

| asked | answer | where |
|---|---|---|
| **Tax totals only?** | No — totals are one output among several. `calculate_tax` returns the requested target (default `us.federal.net_tax`, negative = refund) in integer cents plus every assumption it relied on. | any `calculate_tax` response: `value`, `formatted`, `assumptions` |
| **Complete form and worksheet line sets** | **Federal:** `compute_return` emits the Form 1040 bottom-line set — lines 1a, 9, 10, 11, 12e, 15, 16, 17 (AMT), 19, 22, 23, 24, 25d, 27a, 28, 32, 33, 34/37 — whole-dollar rounded, derived from transcribed W-2 / 1099-R / SSA-1099 / 1099-NEC / 1099-INT / 1099-DIV boxes. Every other federal item (Schedule A, Schedule SE, Form 8812, 8863, 8995, 6251, 8960, 8959, 2210, 8615, 8606, 8582, 2555, 8962, 8880, 8839, Schedule R, Schedule H, Form 1120 items) is a named `calculate_tax` target whose proof tree carries the worksheet arithmetic, not a printed line set. **State:** `compute_state_return` emits the printed line set of the full-year-resident return for 31 states (every line the form's totals consume, plus the schedule/worksheet lines those totals depend on — e.g. Vermont IN-112/IN-119, Delaware's two-column status 4, Montana's capital-gains worksheet). Ten further states compute the tax only (no line set); nine have no income tax. **Part-year and nonresident returns are not composed in any state.** | `compute_return.lines`, `compute_state_return.lines` + `notes` |
| **Calculation proofs and citations** | Yes. Every rule carries a statutory / form citation with a verbatim excerpt; `calculate_tax` returns a full proof tree (every applied rule, every input, every assumption, every rounding) that verifies offline against the corpus Merkle root, and the format is specified so a third party can write an independent checker. `explain_rule` returns any rule's formula and law text. | `proof`, `corpusMerkleRoot`, [PROOF-FORMAT.md](../PROOF-FORMAT.md), `explain_rule` |
| **Rendered forms / PDF** | **No.** The engine produces line values, not filled PDFs. | — |
| **Federal or state MeF XML** | **No.** No MeF schema binding, no XML, no transmission. The integrator's own MeF packaging would consume the line sets. | — |

Two consequences worth stating plainly for an IRS ATS plan:

1. The engine is a **computation and composition oracle**, not filing software. It does not produce the return document, the MeF payload, or e-file acknowledgments. Everything downstream of "here are the correct line values, with proof" is the integrator's.
2. **Coverage is explicit and refusals are loud.** When the corpus has no rule for a situation or a year, the call fails with `NEEDS_FACTS`, `NO_APPLICABLE_RULE`, or `UNHANDLED_ENUM_CASE` and says what is missing. It never estimates. The full list of what is and is not covered is the generated [coverage matrix](../coverage/coverage-matrix.md).
