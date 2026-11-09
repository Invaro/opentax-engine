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
`verify_tax_claim`, `search_tax_rules`, `lookup_tax_parameter`, `verify_fact`,
`list_input_facts`, `explain_rule`, `find_tax_cliffs`, `compare_filing_statuses`,
and the domain tools (`compute_return`, `compute_state_return`, `compute_form_2210`, `compute_form_4562`,
`calculate_business_tax`, `calculate_fiduciary_tax`, `determine_dependent`,
`is_tipped_occupation`). Filing statuses: single | mfj | mfs | hoh | qss.
Research flow: `search_tax_rules` for coverage ("does the corpus encode
this?"), `lookup_tax_parameter` for the dollar amounts, `verify_fact` to check
a claimed number, `explain_rule` for the formula and verbatim law text.
Rule for the model: never compute or estimate tax in your head — call the tool,
report its assumptions to the user, cite its citations.

Hosted: `https://opentax.invaro.ai/mcp` (open, no account) or
`https://opentax.invaro.ai/mcp/account` (OAuth sign-in; adds `my_account`, which
reports the signed-in email and plan).

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
opentax invert --status single --goal 3875 --lo 30000 --hi 100000 --json
#    -> { ok, input: "5045000", value: "387700" }  # smallest input reaching the goal
opentax search kiddie tax --json
#    -> { ok, covered, hits: [{ruleId, citation, excerpt, ...}] }  # full-text law search
opentax lookup standard deduction --expect 32200 --filing-status mfj --json
#    -> { ok, verdict: "verified" | "refuted" | "unknown", citation }  # exits 0 / 1 / 3
```

## Things worth knowing

- **`value.value` is integer cents as a string** (`"564000"` = $5,640.00). Use `formatted` for display. Never do float math on it.
- **Negative money = a refund.** The default target (`us.federal.net_tax`) subtracts refundable credits (EITC, ACTC) and is NOT clamped at zero — `"-977700"` means the taxpayer is owed $9,777.00.
- **`--withheld <dollars>` (or estimated or extension payments) switches the target to `us.federal.balance_due`**: liability minus the payments on Form 1040 lines 25d (withholding), 26 (`federalEstimatedPayments`) and 31 (`federalExtensionPayment`). The mid-year checkup. Negative = refund expected at filing; positive = they will owe.
- **Estimated tax penalty: `opentax form2210 --facts f.json --as-of 2025-12-31` (MCP `compute_form_2210`).** The file is `{ facts, payments: [{date, amount}], periods?, withholdingByDate?, noPriorYearReturn?, filedAndPaidInFullOn? }`. It returns Part I, Part III and the penalty worksheet at each quarter's § 6621 rate, by days; withholding counts one-fourth per due date and pays the earliest underpayment like any payment, and `withholdingByDate` (box D) is used when it lowers the penalty. Add `periods` (`mar31`/`may31`/`aug31`: cumulative amounts from January 1, same fact ids) for Schedule AI: each column is the whole return on the period × 4 / 2.4 / 1.5 / 1, so every modeled income, deduction and credit is annualized, and the lower penalty wins (box C). A penalty that would need an unannounced quarter's rate is refused, with Section A still shown.
- All four OBBBA Schedule 1-A deductions are inputs: `--tips`, `--overtime`, `--car-loan`, plus `--charity` (§ 170(p), 2026+; correctly $0 if asked about 2025).
- Schedule A is modeled and the standard-vs-itemized election is automatic (a `max` — no flag needed): `--salt`, `--mortgage-interest` + `--mortgage-balance`, `--medical`, and `--charity` doubles as the itemizer's cash charitable input. The SALT cap is year-aware ($40,000 TY2025 / $40,400 TY2026, 30% phase-down over $500k/$505k MAGI, $10,000 floor, MFS halves).
- **`assumptions` matter.** They are documented defaults the engine used (e.g. `taxableInterest = 0`). If your user's situation differs, pass the real fact and re-run.
- **`--refuse-defaults`** (MCP: `refuseDefaults: true`) turns every default off: any fact not given exits 2 with `error.data.missing`, and each entry carries the `default` it would have used. Accept the ones you agree with via `--allow-default <id...>` (MCP: `allowDefaults`). A missing enum can hide the facts behind it, so a second call may list a few more.
- **The engine never guesses.** A refusal (exit 2/3) is a correct answer, not an error to work around. Do not fabricate a number when you get one.
- **Citations are in the proof.** Every node of `proof.root` has `citation.source/section/url` and a content `ruleHash` — quote them when explaining an answer.
- `opentax corpus list --json` → every rule (id, title, citation, validity window, hash). `opentax explain <ruleId> --json` → one rule in full, including its formula and dependencies.
- **Depreciation: `opentax form4562 --facts f.json` (MCP `compute_form_4562`).** `{ taxYear, filingStatus, assets: [{ id, cost, placedInService, acquiredOn, recoveryClass | assetClass, section179?, businessUsePercent?, method?, listed?, passengerAutomobile?, … }], section179BusinessIncome?, section179Carryover?, electOutOfSpecialAllowance?, elect40PercentFor2025? }`. § 179 (limits, phase-out, MFS, business income limit and carryover, K-1 § 179), the special allowance by acquisition date (100% after January 19, 2025), MACRS from the printed Pub 946 tables with the mid-quarter test, ADS/150DB/SL elections, dispositions, § 280F auto caps (2025/2026), and Rev. Proc. 87-56 asset classes for cost segregation. Earlier-year assets need `convention`, `section179Taken`, `specialAllowanceTaken`. `byActivity` is each business's deduction (Schedule C line 13 / Schedule E line 18): subtract it from that business's income before depreciation.
- **Business losses and NOLs flow through AGI.** Pass `scheduleCNetLoss` / `k1OrdinaryBusinessLoss` (positive numbers) and the engine applies § 461(l): the excess over $313,000 / $256,000 / $264,000 (2025/2026/2027; double for joint) is Schedule 1 line 8p. Pass `nolCarryforwardPre2018` / `nolCarryforwardPost2017` for line 8a (post-2017 limited to 80% of taxable income without the NOL; pass `nolCarryforwardFromExcessBusinessLoss` for the part that came from a § 461(l) loss). Targets `us.federal.nol.generated` (Form 172 line 24) and `us.federal.nol.carryover_pre2018` / `carryover_post2017` give next year's carryovers; `compute_return` shows them in `losses`. With an NOL deduction the AMT asks `alternativeTaxNolDeduction` (Form 6251 line 2f).
- **Projection (2028–2035): `--project-inflation <percent>` (MCP: `projection: { inflationPercent, wageGrowthPercent? }`).** Every indexed amount is carried forward from 2027 by its statutory indexing formula at the ASSUMED rate; known law after 2027 is applied as law (SALT 101% steps then $10,000 in 2030; tips/overtime/car-loan/senior deductions end after 2028). The answer has a `projected` block — tell the user it is a projection. The premium tax credit refuses in a projected year. Without the flag, 2028+ still exits 3.
- `--as-of YYYY-MM-DD` selects rule versions by date. Federal rules cover tax years 2025, 2026 and 2027 (2027 from Rev. Proc. 2026-35 and the other published 2027 amounts; a 2027 IRA, SEP/solo-401(k) or saver's contribution, the 2027 retirement-plan maximums and the 2027 mileage rate refuse until the IRS publishes them). State rules cover 2025 and 2026 (a few 2026 lines wait for the state's booklet — e.g. the 2026 California EITC Table — and say so). Other dates refuse with exit 3.
- Facts files are plain JSON: `{ "filingStatus": "mfj", "wages": 120000, "qualifyingChildren": 2 }`.
