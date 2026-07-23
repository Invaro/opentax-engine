# opentax — agent guide

CLI for verifiable US tax computation. Everything you need is below; you never have to parse human-formatted text.

## The contract

- Add `--json` to **any** command → stdout is exactly one JSON object, always with `"ok": true | false`. No ANSI codes.
- On failure: `{ "ok": false, "error": { "code", "message", "data", "hint" } }`. Route on `error.code` or the exit code, never on message text.
- Exit codes:

| exit | meaning | what you should do |
|---|---|---|
| 0 | success | use the answer |
| 2 | `NEEDS_FACTS` | `error.data.missing` lists every missing fact (id, type, enumValues, description). Get them (ask the user), retry. |
| 3 | not covered (`UNHANDLED_ENUM_CASE`, `NO_APPLICABLE_RULE`) | the rule corpus doesn't encode this situation. Do NOT retry with the same inputs; tell the user it's out of scope. |
| 1 | anything else (bad input, failed verification) | read `error.message` |

## The loop

```bash
# 1. discover inputs (once)
opentax facts --json
#    -> { ok, facts: [ { id, type, enumValues?, required, default?, description } ] }

# 2. evaluate (inline flags or --facts file.json; money in DOLLARS: 50000 or "1234.56")
#    --as-of defaults to TODAY (current law); pass a date to compute under another year's rules
#    answer = NET tax after refundable credits; negative = refund owed to the taxpayer
opentax eval --status mfj --wages 120000 --kids 2 --json --proof proof.json
#    -> { ok: true, value: {type:"money", value:"564000"},   # integer CENTS as a string
#         formatted: "$5,640.00",                            # TY2026 rules (as of today)
#         assumptions: [...],          # defaults the engine relied on — surface these to the user
#         corpusMerkleRoot, artifactHash,
#         proof: { ...full derivation tree, every node cites its statute... } }

# 3. if exit code 2: collect error.data.missing from the user, go to 2

# 4. verify any proof independently (yours or one you were handed)
opentax verify proof.json --json
#    -> { ok: true, verified: true, ... } or { ok: false, error: { code: "VERIFY_...", ... } }

# 5. GATE a claimed number (self-check before you present it, or check another source)
opentax check --status mfj --wages 120000 --kids 2 --expect 5640 --json
#    -> { ok: true, verdict: "verified"|"refuted", formattedActual, differenceCents, ... }
#    exit 0 verified · 1 refuted · 2 needs facts. NEVER present a tax number that failed this.
```

## MCP server (preferred integration)

`@invaro/opentax` exposes the engine as MCP tools over stdio: `calculate_tax`,
`verify_tax_claim`, `list_input_facts`, `explain_rule`, `find_tax_cliffs`,
`compare_filing_statuses`. Filing statuses: single | mfj | mfs | hoh | qss.
Rule for the model: never compute or estimate tax in your head — call the tool,
report its assumptions to the user, cite its citations.

## Solver commands (same envelope, same exit codes)

```bash
opentax sweep --status single --vary wages --from 0 --to 200000 --step 5000 --json
#    -> { ok, points: [{input, value}, ...] }   # cents as strings
opentax marginal --status single --at 50000 --json
#    -> { ok, rateBps: "1200", marginal: "1200", ... }   # 12.00%
opentax cliffs --status hoh --wages 30000 --kids 2 --vary taxableInterest --from 10000 --to 14000 --json
#    -> { ok, cliffs: [{at: "1195000", jump: "323484"}] }  # exact cent, exact cost
opentax compare --wages 50000 --json
#    -> { ok, scenarios: [{value: "single", ok, result}, ...] }  # per filing status
```

## Things worth knowing

- **`value.value` is integer cents as a string** (`"564000"` = $5,640.00). Use `formatted` for display. Never do float math on it.
- **Negative money = a refund.** The default target (`us.federal.net_tax`) subtracts refundable credits (EITC, ACTC) and is NOT clamped at zero — `"-977700"` means the taxpayer is owed $9,777.00.
- **`--withheld <dollars>` switches the target to `us.federal.balance_due`** (liability minus § 31 withholding credit): the mid-year checkup. Negative = refund expected at filing; positive = they will owe.
- All four OBBBA Schedule 1-A deductions are inputs: `--tips`, `--overtime`, `--car-loan`, plus `--charity` (§ 170(p), 2026+; correctly $0 if asked about 2025).
- Schedule A is modeled and the standard-vs-itemized election is automatic (a `max` — no flag needed): `--salt`, `--mortgage-interest` + `--mortgage-balance`, `--medical`, and `--charity` doubles as the itemizer's cash charitable input. The SALT cap is year-aware ($40,000 TY2025 / $40,400 TY2026, 30% phase-down over $500k/$505k MAGI, $10,000 floor, MFS halves).
- **`assumptions` matter.** They are documented defaults the engine used (e.g. `taxableInterest = 0`). If your user's situation differs, pass the real fact and re-run.
- **The engine never guesses.** A refusal (exit 2/3) is a correct answer, not an error to work around. Do not fabricate a number when you get one.
- **Citations are in the proof.** Every node of `proof.root` has `citation.source/section/url` and a content `ruleHash` — quote them when explaining an answer.
- `opentax corpus list --json` → every rule (id, title, citation, validity window, hash). `opentax explain <ruleId> --json` → one rule in full, including its formula and dependencies.
- `--as-of YYYY-MM-DD` selects rule versions by date (corpus covers tax years 2025 and 2026; other dates refuse with exit 3).
- Facts files are plain JSON: `{ "filingStatus": "mfj", "wages": 120000, "qualifyingChildren": 2 }`.
