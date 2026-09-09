# OpenTax hosted API

Rendered documentation: <https://opentax.invaro.ai/docs>. API keys: <https://opentax.invaro.ai/console> (sign in with an email code; the evaluation plan is free).

## REST

`POST https://opentax.invaro.ai/v1/tools/{tool}` with the tool's arguments as the JSON body; the decoded engine result is the response body. `GET /v1/tools` lists the tools, `GET /v1/openapi.json` is the REST-shaped OpenAPI 3.1 document generated from the running server. Same authentication and rate budgets as the MCP endpoint below; `400` for a schema rejection or unknown tool, `200` with `ok: false` when the engine refuses. An optional `X-OpenTax-Return-Id` header tags the call with your taxpayer-year identifier (stored hashed).

```bash
curl -s https://opentax.invaro.ai/v1/tools/calculate_tax \
  -H "Authorization: Bearer $OPENTAX_KEY" \
  -H "Content-Type: application/json" \
  -d '{"filing":{"filingStatus":"mfj"},"income":{"wages":120000},"credits":{"qualifyingChildren":2},"asOf":"2025-12-31"}'
```

## MCP

**Endpoint:** `POST https://opentax.invaro.ai/mcp`
**Protocol:** [Model Context Protocol](https://modelcontextprotocol.io) over Streamable HTTP — JSON-RPC 2.0, stateless (no sessions, every request self-contained). Any MCP client library works; so does plain `curl`.
**Spec:** [openapi.json](openapi.json) (OpenAPI 3.1, generated from the live server — the tool input schemas are the server's own validation schemas) and [tools.json](tools.json) (the raw `tools/list` result).
**Examples:** [examples/](examples/) — real request/response pairs captured from the engine, including refusals.

## Authentication

```
Authorization: Bearer <your key>
```

Keys are issued per account (an email address) at <https://opentax.invaro.ai/console> and attribute usage to that account. Calls without a key are accepted at the anonymous rate budget (the endpoint also serves public MCP connectors); calls with an unknown key are refused with HTTP 401 and JSON-RPC error `-32001`. Keys never appear in logs; usage records hold the account email, the tool name and a timestamp — **never the tool arguments**, so no taxpayer data is retained (see [data handling](#data-handling)).

Rate budgets (per hour, per serving instance): 600 anonymous, 6,000 keyed. HTTP 429 with `Retry-After` when exceeded.

## Calling a tool

```bash
curl -s https://opentax.invaro.ai/mcp \
  -H 'Authorization: Bearer $OPENTAX_KEY' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"calculate_tax","arguments":{"filing":{"filingStatus":"mfj"},"income":{"wages":120000},"credits":{"qualifyingChildren":2},"asOf":"2025-12-31"}}}'
```

The result is `result.content[0].text`, a JSON string:

```json
{ "ok": true, "value": { "type": "money", "value": "..." }, "formatted": "$...", "assumptions": [...], "corpusMerkleRoot": "sha256:...", "artifactHash": "sha256:...", "versions": { "engine": "0.1.0", "composer": "0.5.0", "corpus": "0.39.0", "corpusMerkleRoot": "sha256:..." }, "proof": { ... } }   // proof only when includeProof: true
```

or, on refusal:

```json
{ "ok": false, "error": { "code": "NEEDS_FACTS", "message": "...", "data": { "missing": [...] }, "hint": "..." } }
```

`asOf` is the law-in-force date and is **required** for computation: `2025-12-31` for tax year 2025, `2026-12-31` for tax year 2026. Money is in dollars (`50000`, `"1234.56"`). Unknown keys are rejected (strict schemas). Discover everything with `tools/list` and `list_input_facts`.

## The fifteen tools

| tool | what it does |
|---|---|
| `calculate_tax` | Individual federal computation of any target (default net tax); `includeProof: true` adds the full proof artifact. Grouped inputs: `filing`, `income`, `tips_overtime`, `retirement`, `self_employment`, `adjustments`, `itemized`, `credits`, `healthcare_ptc`, `kiddie_tax`, `investor_amt`, `rentals_passive`, `state`, `household_employer`. |
| `compute_return` | The Form 1040 bottom-line line set from transcribed documents (W-2, 1099-R, SSA-1099, 1099-NEC/K/INT/DIV, dependents' birth dates), with Part IV withholding and § 6654 penalty. |
| `compute_state_return` | The printed line set of a state's full-year-resident return (31 states — see the [coverage matrix](../coverage/coverage-matrix.md)). `jurisdiction` + `asOf` required; `federalAGI` required for AGI states. |
| `calculate_business_tax` | Federal business-entity computation: check-the-box classification, Form 1120 taxable income and tax (§§ 179, 168(k), 174A, 163(j), DRD, NOL, 250, GBC, FTC, BEAT), S-corp entity-level taxes, corporate estimates, AET/PHC, § 4501. Calculation only — no 1120 line set. |
| `calculate_fiduciary_tax` | Form 1041 § 1(e) rate schedule and § 642(b) exemption on post-distribution taxable income. Retained capital gains refuse. |
| `determine_dependent` | § 152 qualifying child / qualifying relative determination, proof on request (multiple-support agreements, divorced-parent release). |
| `verify_tax_claim` | Gate a claimed amount against the engine: `verified` / `refuted` with the correct value. |
| `verify_fact` | Fact-check a claimed parameter ("CTC is $2,000/child") against the corpus. |
| `lookup_tax_parameter` | Search the corpus's dollar amounts, rates and thresholds with citations. |
| `search_tax_rules` | "Does the corpus encode this?" — rule discovery by keyword, with windows and citations. |
| `explain_rule` | A rule's formula, parameters, validity window and verbatim law text. |
| `list_input_facts` | Every input fact: id, type, default, description. |
| `find_tax_cliffs` | Sweep one input across a range and report every discontinuity in the target. |
| `compare_filing_statuses` | The same facts under every eligible filing status. |
| `is_tipped_occupation` | Whether a job is on the Treasury § 224 tipped-occupation list. |

## Versioning

Every response carries `corpusMerkleRoot`, the content hash of the exact rule corpus that produced it. The corpus is versioned (`corpusVersion` in `tools.json`, currently reported by the endpoint on every call); rule changes never edit a rule in place — they add a new **version** with its own validity window, so an old proof stays verifiable against the old corpus. Breaking changes to tool inputs are announced by a new tool name, never by silently changing a schema.

## Data handling

The endpoint is stateless: the facts in a request are computed in memory and the answer returned. They are **not stored, logged, or used for anything else**. For usage metering the endpoint records the JSON-RPC method, the tool name, the client name and version from `initialize`, the account (for keyed calls), and a timestamp — read from the request envelope, never from the tool arguments — to short-lived application logs and a private blob store. Public statement: [opentax.invaro.ai/privacy](https://opentax.invaro.ai/privacy).

## Errors

| HTTP | JSON-RPC | meaning |
|---|---|---|
| 200 with `ok: false` | — | the engine refused: `NEEDS_FACTS` (missing inputs listed), `NO_APPLICABLE_RULE` (no rule valid on `asOf`), `UNHANDLED_ENUM_CASE`, or an input validation message |
| 401 | -32001 | unknown API key |
| 429 | -32002 | rate budget exceeded |
| 200 with `result.isError` | — | a composer refused (message says which input or which year) |
