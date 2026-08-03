# opentax-engine

**A US tax calculator that shows its work — and can prove it.**

Three ideas, that's the whole project:

1. **Ask** it a tax question with plain facts (`--wages 50000`).
2. It answers with a **proof**: every rule it applied, with the law it came from (`26 U.S.C. § 63(c)` …), every assumption it made.
3. Anyone can **verify** that proof offline. If it can't derive an answer from its encoded rules, it refuses — it never guesses.

Open source (AGPL-3.0, with commercial licenses available), exact to the cent (no floating point), built to be extended.

## Try it

```bash
pnpm install && pnpm build
pnpm opentax eval --status mfj --wages 120000 --kids 2
```

```
Married filing jointly · tax year 2026

  Income                  $120,000.00
  − Deductions             $32,200.00   (standard deduction)
  = Taxable income         $87,800.00
  Tax before credits       $10,043.00
  − Credits                 $4,400.00   (child tax credit)
  ─────────────────────────────────────
  You owe                   $5,643.00   (4.7% of income)

us.federal.net_tax  $5,643.00
├─ us.federal.income_tax_after_credits  $5,643.00     [26 U.S.C. § 26(a)]
│  ├─ us.federal.income_tax_before_credits.tax_table  $10,043.00   [26 U.S.C. § 3(a); 2026 Tax Table]
│  │  └─ us.federal.taxable_income  $87,800.00        [26 U.S.C. § 63(b)]
│  │     ├─ us.federal.agi  $120,000.00               [26 U.S.C. § 62(a)]
│  │     │  ├─ fact wages = $120,000.00
│  │     │  └─ assumed taxableInterest = $0.00 (default)
│  │     └─ us.federal.standard_deduction  $32,200.00 [26 U.S.C. § 63(c); Rev. Proc. 2025-32]
│  └─ us.federal.ctc  $4,400.00                       [26 U.S.C. § 24; Schedule 8812]
⋮  (abridged: the full tree cites every node and logs every default)

Assumptions (77): every default was $0/none — pass the real facts if your situation differs
corpus @invaro/opentax-corpus-us-federal@0.37.0  sha256:6c422520ead11760…
```

It answers under **the law in force on the date you ask about** — `--as-of` defaults to today; pass `--as-of 2025-12-31` and the same facts derive under TY2025 rules instead: the same household owes $5,746.00 under TY2025's $31,500 standard deduction, cited to the other Rev. Proc.

Money is written in **dollars** (`50000`, `"$50,000"`, `"1234.56"`). Not sure what inputs exist? `pnpm opentax facts` lists them all. More facts than fit in flags? Use a JSON file: `--facts examples/mfj_120k_2kids.json`.

**Or skip the terminal entirely** — the engine is pure TypeScript with zero platform
dependencies (even SHA-256 is hand-written pure JS, so hashing is bit-identical in Node
and the browser), so the whole thing runs in a browser:

```bash
pnpm -F @invaro/opentax-playground build && open packages/playground/dist/index.html
```

One ~500 KiB self-contained HTML file: engine + full rule corpus + verifier, no server,
no network, works from `file://`. Compute, read the proof tree, download the proof —
then paste it into the **Verify** tab and watch your own browser re-derive every step
(alter one byte and it says exactly what broke). Same corpus Merkle root the CLI prints.

Save a proof, verify a proof:

```bash
pnpm opentax eval --status single --wages 50000 --proof proof.json
pnpm opentax verify proof.json     # ✓ VERIFIED — re-derived independently, every step matches
```

Change one byte of the proof — or one rule — and `verify` fails and says exactly what broke: the file was altered, the corpus is a different version, or a step doesn't re-derive.

Don't want to trust our verifier? The format is fully specified — canonical JSON, hashing, Merkle construction, node semantics, test vectors — in **[docs/PROOF-FORMAT.md](docs/PROOF-FORMAT.md)**, so you can write an independent checker in whatever language you trust.

## When it can't answer

It tells you, in one consistent shape, and never makes something up:

| exit code | error code | meaning | what to do |
|---|---|---|---|
| 2 | `NEEDS_FACTS` | you didn't give it enough | it lists every missing fact and the exact flag to add |
| 3 | `UNHANDLED_ENUM_CASE`, `NO_APPLICABLE_RULE`, `NOT_MODELED` | the rules for this case/date aren't encoded yet, or the law is deliberately out of scope | see coverage below; add them (it's just data) |
| 1 | anything else | bad input, failed verification | read the message |

Every error is `{ code, message, data, hint }` — same shape for humans, scripts, and AI agents.

## The AI-agent use case: never let a model invent a tax number again

LLMs *will* confidently produce wrong tax figures — most training data predates the OBBBA entirely. Two integration patterns fix that:

**1. Oracle pattern (MCP)** — the model never computes; it calls the engine:

```bash
claude mcp add opentax -- npx -y @invaro/opentax
```

No install at all if you prefer hosted: the same server runs at `https://opentax.invaro.ai/mcp`, and it's on the official MCP registry as `io.github.Invaro/opentax`.

Fifteen tools. Full returns: `compute_return` (the Form 1040 line set), `calculate_tax`, `calculate_business_tax` (1120), `calculate_fiduciary_tax` (1041), `compute_state_return` (CA 540, IL-1040, NY IT-201, VA 760, PA-40, NJ-1040, OH IT 1040). Determinations: `determine_dependent`, `is_tipped_occupation` (the full Treasury occupation list as data). The oracle surface: `verify_tax_claim`, `verify_fact` (fact-check any claimed dollar amount — "CTC is $2,000/child" → *refuted, it's $2,200, § 24(h)(2) as amended by OBBBA*), `lookup_tax_parameter`, `search_tax_rules`, `list_input_facts`, `explain_rule`, `find_tax_cliffs`, `compare_filing_statuses`. Every response carries its assumptions and the corpus hash, so the agent can quote the law and the user can re-verify.

On **TaxCalcBench** (50 full TY2025 returns, federal + state), a cold Claude Sonnet agent with this MCP server scores **48/50 exact under strict scoring (96%)** and 98.2% of all scored lines, one attempt per case, graded by the benchmark's own evaluator. The benchmark's paper puts the best frontier model on its own at ~33%. Details in [docs/METHODOLOGY.md](docs/METHODOLOGY.md).

**2. Guardrail pattern (`opentax check`)** — the model answers, your harness gates it:

```bash
$ opentax check --status mfj --wages 120000 --kids 2 --expect 6600
✗ REFUTED   claimed $6,600.00, but the law derives $5,643.00 (off by $957.00)
$ echo $?
1        # wire this into your eval suite / response pipeline
```

Exit 0 = verified, 1 = refuted (with the correct value), 2 = the claim can't be checked without more facts. A one-line post-processing step turns any tax-adjacent agent from "plausible" to "provable."

Plus the general contract: add `--json` to **any** command — single JSON object, `ok: true|false`, stable error codes and exit codes, no ANSI. Full agent docs in **[AGENTS.md](AGENTS.md)**.

## What's covered today (tax years 2025 & 2026, current law)

**Every W-2 household, all five filing statuses, refunds included.** 264 rules, 278 documented input facts, 311 golden fixtures. The default answer is **net tax** — negative means the government owes you.

- **Individual (Form 1040)** — brackets, standard & itemized deductions (Schedule A with the OBBBA SALT cap), capital gains & qualified dividends with full § 1222 Schedule D netting, AMT, Social Security taxation, retirement income incl. the § 72(d) pension Simplified Method, residential rental income with § 168 depreciation, SE tax, NIIT & Additional Medicare, kiddie tax, capital losses, HSA, student-loan interest, IRA deduction, foreign earned income exclusion.
- **Credits** — CTC/ACTC + ODC, EITC (all child counts), education (AOTC/LLC), child & dependent care, saver's, adoption, premium tax credit (2025 no-cliff / 2026 cliff) — plus proof-backed dependent determination.
- **OBBBA, both years** — tips & overtime deductions (with the 71-occupation eligibility list), senior deduction, car-loan interest, non-itemizer charitable, § 68 haircut, and the 2026 parameter shifts throughout.
- **Business & corporate (Form 1120)** — QBI § 199A full mechanics, SEP/solo-401(k), § 179 + bonus + R&D expensing + § 163(j), K-1 pass-through, entity classification, flat 21% with charitable/DRD/NOL mechanics, BEAT, corporate FTC, § 250, penalty taxes, QSBS, buyback excise, corporate estimates.
- **Estates & trusts (Form 1041)**, household employment (Schedule H), farmers & fishermen, estimated-tax safe harbors + annualized installments, withholding checkup.
- **State (28 states, in the same corpus)** — deep rule packs for IL, VA, CA, NY, PA, NJ, and OH with printed-form composers (via the MCP server's `compute_state_return` and `opentax state`): CalEITC/YCTC/renter's credit and CA AMT, NYC resident tax + Yonkers surcharge + IT-214, VA age deduction and Spouse Tax Adjustment worksheets, IL EITC and use tax, PA's eight-class netting, Schedule SP Tax Forgiveness, and the Working Pennsylvanians Tax Credit, NJ's category netting with the printed Tax Table, pension-exclusion cliff, property-tax deduction-vs-credit worksheet, NJEITC (incl. the flat $260 age-decoupled credit), CTC and CDCC, and OH's HB 96 brackets, MAGI-tiered exemptions, Business Income Deduction, and the joint filing / retirement / senior / EIC / child-care credits. Flat-rate rules for 12 more states; the nine no-income-tax states answer $0 with a citation.
- **Out of scope refuses loudly** — consolidated returns, REIT/RIC, fiscal-year returns, CAMT: a named refusal, never a silent wrong answer.

The line-by-line inventory (every rule, its statute, its validity window) is queryable, not prose: `pnpm opentax corpus list`.

**Is it correct?** Exact bigint-cents math — floats never enter · 279 golden fixtures asserting every intermediate to the cent · below $100,000 the engine reproduces the printed IRS Tax Table method exactly (verified against 41 sampled rows of the 2025 Publication 1040 table, all four statuses) · every rule and the fact catalog Merkle-pinned in `corpus.lock.json` · every fixture round-trips through `verify` · every dollar read from the primary source text.

**Honest caveats.** Where the engine approximates, the rule's own citation says so; where a condition can't be verified, the default is conservative — $0 or a refusal, never a guess. The big ones: earned income ≈ wages and MAGI ≈ AGI in several phase-outs; EITC qualifying children approximated by the CTC child count; a handful of niche interactions refuse outright.

## The solver layer — ask questions a calculator can't answer

Because the rules are pure functions, `opentax` can *reason* about the tax code, not just evaluate it — and every data point is a real, proof-backed evaluation:

```
$ opentax cliffs --status hoh --wages 30000 --kids 2 --vary taxableInterest --from 10000 --to 14000

2 cliff(s) found:
  ▮ at $12,199.99: one more cent of taxableInterest costs $16.00
  ▮ at $12,200.00: one more cent of taxableInterest costs $3,455.00
```

That second one is the § 32(i) EITC kill switch, located **to the exact cent** by bisection over real evaluations — one cent of interest income past the TY2026 investment-income limit destroys the family's entire earned income credit.

```
opentax compare --wages 50000            # net tax under every filing status
opentax marginal --status single --at 50000    # your true marginal rate
opentax sweep --vary wages --from 0 --to 200000 --step 5000 --csv   # the whole curve
```

`cliffs` also finds every $50 CTC phase-out step (§ 24(b)'s "or fraction thereof" makes one cent past $412,000 cost $50); `invert` answers "what income first reaches tax X" by bisection — and *refuses* with `not-monotone` when the EITC region makes the answer ambiguous, rather than returning a plausible root. This is "policy simulation" as an open-source CLI command.

The same layer powers `opentax search` and `opentax lookup`: full-text rule search with document-frequency scoring tuned so that **zero hits reliably means the topic is outside the corpus**: a refusal guarantee for search, matching the engine's refusal guarantee for evaluation. `lookup … --expect` is the fact-checker behind the MCP `verify_fact` tool.

**This is a computation-and-citation tool, not tax advice.**

## Extending it

All tax knowledge is **data** — you add coverage by writing a rule object with a citation and a hand-computed test, never by touching engine code:

1. Write the rule (id, citation with statute + excerpt, validity dates, formula).
2. Statutory exceptions are their own rules that `override` the base with a guard — the proof shows why they did or didn't fire.
3. Add a golden fixture with expected cents you computed from the statute by hand.
4. `pnpm test && pnpm -F @invaro/opentax-corpus-us-federal gen:lock`

Full walkthrough: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

**Currency policy:** the corpus tracks current law — when the IRS or Congress changes the numbers, the change lands as a new rule *version* with its own validity window and citation, never an in-place edit. Old proofs stay verifiable against the corpus root they were computed under.

## Commands

| | |
|---|---|
| `opentax eval --status mfj --wages 120000 --kids 2` | answer + proof tree (negative = refund) |
| `opentax eval … --withheld 7000` | **mid-year checkup**: balance due / refund expected next April |
| `opentax eval … --brief` | plain-English 8-line summary only |
| `opentax eval --facts f.json --proof out.json` | facts from a file, save the proof |
| `opentax check … --expect 6600` | gate a claimed number: exit 0 verified, 1 refuted |
| `opentax verify proof.json` | re-derive a proof, confirm or refute |
| `opentax state --facts return.json` | printed-form state return lines (IL/VA/CA/NY/PA/NJ/OH) |
| `opentax facts` / `opentax flags` | every input, its type, its default / every CLI flag, grouped |
| `opentax lookup standard deduction` | the dollar amounts behind a question, with citations |
| `opentax search kiddie tax` | full-text rule search; zero hits means it isn't encoded |
| `opentax occupation DJ` | is this job on the Treasury tipped-occupation list? |
| `opentax eval --target us.federal.eligible.tips_deduction --occupation DJ` | yes/no determinations with proof |
| `opentax explain <rule-id>` | one rule: citation, excerpt, hash, dependencies |
| `opentax corpus list` / `hash` / `export` | rule inventory / corpus fingerprint / the whole corpus as JSON |
| `opentax sweep --from 0 --to 200000` | the tax curve, point by exact point |
| `opentax marginal --at 50000` | true marginal rate at a point |
| `opentax cliffs --from 400000 --to 450000` | exact cents where marginal > 100% |
| `opentax invert --goal 10000 --lo 0 --hi 500000` | what income first reaches tax X (refuses if not monotone) |
| `opentax compare --wages 50000` | net tax under every filing status |
| `opentax eval --se-profit 80000 --wages 0` | freelancer: SE tax + QBI + income tax in one number |
| `opentax eval --wages 190000 --gains 50000` | investor: capital-gains stacking + NIIT |
| `opentax eval --wages 300000 --salt 50000 --mortgage-interest 30000 --mortgage-balance 900000 --medical 30000 --charity 10000` | homeowner: Schedule A vs standard, elected automatically |
| `opentax eval --target us.federal.corp.entity_level_income_tax --entity llc --members 1` | "how is my LLC taxed?" — classification + entity-level tax, with the check-the-box citations |

All take `--json` (except `flags` and `corpus export`, whose output is already raw). In this repo, prefix with `pnpm`: `pnpm opentax …` — or run the published package directly: `npx -y @invaro/opentax eval …`

## Repo layout

```
packages/
  core/               the engine: domain-general, zero deps, browser-safe
  corpus-us-federal/  the tax rules as cited data + golden tests (federal + 28 states)
  solve/              the reasoning layer: sweep, marginal, cliffs, invert, compare,
                      rule search, and the fact-checker (also domain-general)
  compose/            printed-form state-return composers (IL/VA/CA/NY/PA/NJ/OH)
  cli/                the `opentax` command
  mcp/                @invaro/opentax, the published package:
                      MCP server (stdio + HTTP) and the npx CLI
  playground/         the browser playground (one self-contained HTML file)
site/                 opentax.invaro.ai, which also serves the hosted MCP endpoint
```

## License: AGPL-3.0 + commercial (dual-licensed)

OpenTax is **free software under the [GNU AGPL-3.0](LICENSE)**: use it, study
it, fork it, run it as a service. The one condition is the AGPL's share-alike
rule: a product or service built on this engine must publish its own complete
source under the AGPL too.

**Building something closed-source or proprietary?** You need a
[commercial license from Invaro](COMMERCIAL-LICENSE.md). That is the deal:
open products use it free, closed products pay for it. It keeps the engine
funded and the corpus current.

Versions through `0.2.1` were released under Apache-2.0 and remain so; all
later versions are AGPL-3.0-only. "OpenTax" is a trademark of Invaro Inc.
