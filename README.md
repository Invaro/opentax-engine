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
us.federal.income_tax_after_credits  $5,640.00
├─ us.federal.income_tax_before_credits  $10,040.00   [26 U.S.C. § 1(j); Rev. Proc. 2025-32]
│  └─ us.federal.taxable_income  $87,800.00           [26 U.S.C. § 63(b)]
│     ├─ us.federal.agi  $120,000.00
│     │     ├─ fact wages = $120,000.00
│     │     └─ assumed taxableInterest = $0.00 (default)
│     └─ us.federal.standard_deduction  $32,200.00    [Rev. Proc. 2025-32 § 4.14]
└─ us.federal.ctc  $4,400.00                          [§ 24, as amended by OBBBA § 70104]

Assumptions (6): taxableInterest = $0.00, isAge65OrOlder = false, …
corpus sha256:6ff44719…
```

It answers under **the law in force on the date you ask about** — `--as-of` defaults to today; pass `--as-of 2025-12-31` and the same facts derive under TY2025 rules instead (different standard deduction, different brackets, cited to the other Rev. Proc.).

Money is written in **dollars** (`50000`, `"$50,000"`, `"1234.56"`). Not sure what inputs exist? `pnpm opentax facts` lists them all. More facts than fit in flags? Use a JSON file: `--facts examples/mfj_120k_2kids.json`.

**Or skip the terminal entirely** — the engine is pure TypeScript with zero platform
dependencies, so the whole thing runs in a browser:

```bash
pnpm -F @invaro/opentax-playground build && open packages/playground/dist/index.html
```

One 130 KiB self-contained HTML file: engine + full rule corpus + verifier, no server,
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
| 3 | `UNHANDLED_ENUM_CASE`, `NO_APPLICABLE_RULE` | the rules for this case/date aren't encoded yet | see coverage below; add them (it's just data) |
| 1 | anything else | bad input, failed verification | read the message |

Every error is `{ code, message, data, hint }` — same shape for humans, scripts, and AI agents.

## The AI-agent use case: never let a model invent a tax number again

LLMs *will* confidently produce wrong tax figures — most training data predates the OBBBA entirely. Two integration patterns fix that:

**1. Oracle pattern (MCP)** — the model never computes; it calls the engine:

```bash
claude mcp add opentax -- node packages/mcp/dist/index.js
```

Nine tools: `calculate_tax`, `verify_tax_claim`, `verify_fact` (fact-check any claimed dollar amount — "CTC is $2,000/child" → *refuted, it's $2,200, § 24(h)(2) as amended by OBBBA*), `lookup_tax_parameter`, `is_tipped_occupation` (the full Treasury occupation list as data), `list_input_facts`, `explain_rule`, `find_tax_cliffs`, `compare_filing_statuses`. Every response carries its assumptions and the corpus hash, so the agent can quote the law and the user can re-verify.

**2. Guardrail pattern (`opentax check`)** — the model answers, your harness gates it:

```bash
$ opentax check --status mfj --wages 120000 --kids 2 --expect 6600
✗ REFUTED   claimed $6,600.00, but the law derives $5,640.00 (off by $960.00)
$ echo $?
1        # wire this into your eval suite / response pipeline
```

Exit 0 = verified, 1 = refuted (with the correct value), 2 = the claim can't be checked without more facts. A one-line post-processing step turns any tax-adjacent agent from "plausible" to "provable."

Plus the general contract: add `--json` to **any** command — single JSON object, `ok: true|false`, stable error codes and exit codes, no ANSI. Full agent docs in **[AGENTS.md](AGENTS.md)**.

## What's covered today (tax years 2025 & 2026, current law)

**Every W-2 household, all five filing statuses, refunds included.** The default answer is **net tax** — negative means the government owes you.

- **Individual (Form 1040)** — brackets, standard & itemized deductions (Schedule A with the OBBBA SALT cap), capital gains & qualified dividends with full § 1222 Schedule D netting, AMT, Social Security taxation, retirement income incl. the § 72(d) pension Simplified Method, residential rental income with § 168 depreciation, SE tax, NIIT & Additional Medicare, kiddie tax, capital losses, HSA, student-loan interest, IRA deduction, foreign earned income exclusion.
- **Credits** — CTC/ACTC + ODC, EITC (all child counts), education (AOTC/LLC), child & dependent care, saver's, adoption, premium tax credit (2025 no-cliff / 2026 cliff) — plus proof-backed dependent determination.
- **OBBBA, both years** — tips & overtime deductions (with the 71-occupation eligibility list), senior deduction, car-loan interest, non-itemizer charitable, § 68 haircut, and the 2026 parameter shifts throughout.
- **Business & corporate (Form 1120)** — QBI § 199A full mechanics, SEP/solo-401(k), § 179 + bonus + R&D expensing + § 163(j), K-1 pass-through, entity classification, flat 21% with charitable/DRD/NOL mechanics, BEAT, corporate FTC, § 250, penalty taxes, QSBS, buyback excise, corporate estimates.
- **Estates & trusts (Form 1041)**, household employment (Schedule H), farmers & fishermen, estimated-tax safe harbors + annualized installments, withholding checkup.
- **Out of scope refuses loudly** — consolidated returns, REIT/RIC, fiscal-year returns, CAMT: a named refusal, never a silent wrong answer. (State returns for IL/VA/CA/NY live in the composer, via the MCP server and `opentax state`.)

<details>
<summary><b>Full line-by-line coverage table</b> — every item with its statute, both tax years</summary>

| | TY2025 | TY2026 |
|---|---|---|
| All five filing statuses (single, MFJ, MFS, HoH, surviving spouse) | ✅ | ✅ |
| Standard deduction (OBBBA amounts) + age-65/blind additions + dependent limit + MFS spouse-itemizes zero rule | ✅ | ✅ |
| Income tax brackets 10–37%, per-status tables (Rev. Proc. 2024-40 § 2.01 / 2025-32 § 4.01) | ✅ | ✅ |
| Child Tax Credit $2,200/child with phase-out (§ 24, OBBBA-permanent) | ✅ | ✅ |
| **Refundable ACTC** ($1,700/child, 15% earned-income rule) | ✅ | ✅ |
| **EITC** — all four child counts, phase-in/out, investment-income limit (§ 32) | ✅ | ✅ |
| OBBBA senior deduction ($6,000, 6% MAGI phase-out, § 151(d)(5)) | ✅ | ✅ |
| **Social Security benefits (§ 86)** — the full 0/50/85% worksheet ($25k/$32k and $34k/$44k statutory tiers), matched to PolicyEngine to the cent; **retirement income** (taxable IRA distributions, pensions/annuities, unemployment) and the § 72(t) 10% early-distribution tax | ✅ | ✅ |
| **OBBBA tips & overtime deductions** (§§ 224–225, incl. joint-only and floor-rounding rules) | ✅ | ✅ |
| **Estimated-tax safe harbor** (§ 6654: 90%/100%/110% prongs, quarterly installment, "am I safe?" determination) — the Sept-15 answer | ✅ | ✅ |
| **Annualized-income installments** (§ 6654(d)(2), Schedule AI: lumpy-income freelancers pay less early — factors 4/2.4/1.5/1, annualized SE tax with prorated wage-base, 22.5/45/67.5/90% + recapture; wage+SE core, refuses beyond) | ✅ | ✅ |
| **Kiddie tax** (§ 1(g), Form 8615: net unearned income over $2,700 taxed at the parents' rate — the greater-of, with parent-rate recomputation; preferential income refuses) | ✅ | ✅ |
| **Schedule D netting** (§ 1222(5)-(11): per-bucket ST/LT results cross-net — a net ST loss reduces § 1(h) net capital gain, a net LT loss reduces ordinary ST gain; character preserved; contradictory inputs refuse) | ✅ | ✅ |
| **Capital losses** (§ 1211(b) $3,000/$1,500 ordinary offset + § 1212(b) carryover as its own target) | ✅ | ✅ |
| **Residential rental depreciation** (§ 168 GDS 27.5-yr straight line, mid-month convention — the printed Pub 946 Table A-6 percentages; net rental income feeds AGI, loss years route to the § 469 passive machinery) | ✅ | ✅ |
| **Pension Simplified Method** (§ 72(d): both statutory anticipated-payments tables, cents-exact monthly exclusion per the Pub 575 example, lifetime cost cap; refuses without the starting-date age) | ✅ | ✅ |
| **§ 152(d)(3) multiple-support agreements + § 152(e) divorced-parents release** (both directions: noncustodial gains the claim, releasing custodial loses it) | ✅ | ✅ |
| **Dependent determination** (§ 152 qualifying child / qualifying relative, income limits per year) — "can I claim this person?" with proof | ✅ | ✅ |
| **Tips ELIGIBILITY determination in depth**: the full 71-occupation Treasury list (Treas. Reg. § 1.224-1, final Apr 2026) as data, voluntary/SSTB conditions, boolean determination rules with proof trees ("does a DJ qualify?" → *yes, TTC 207, cited*) | ✅ | ✅ |
| **OBBBA car loan interest deduction** (§ 163(h)(4), $10k cap, ceiling phase-out) — completes all four Schedule 1-A deductions | ✅ | ✅ |
| **Non-itemizer charitable deduction** (§ 170(p), $1,000/$2,000 — new for 2026; correctly $0 for 2025) | ✅ $0 | ✅ |
| **Withholding checkup** (§ 31 credit): `--withheld` → balance due / refund expected next April | ✅ | ✅ |
| **Self-employment tax** (§§ 1401–1402: 92.35%, OASDI wage-base coordination, ½ deduction) | ✅ | ✅ |
| **QBI deduction (§ 199A, FULL mechanics)** — below-threshold 20%, the W-2/UBIA wage limit and SSTB phase-in/out above it (the OBBBA-widened $75k/$150k band in 2026 vs $50k/$100k in 2025), QBI properly reduced by ½-SE/SEP/SEHI, OBBBA $400 minimum — above-threshold results match PolicyEngine | ✅ | ✅ |
| **SE-owner essentials**: § 162(l) self-employed health insurance, SEP/solo-401(k) employer contributions (§ 415(c): $70k → **$72k in 2026**), employer payroll-tax target (§ 3111 FICA + 0.6% FUTA), § 41 ASC research credit (14%/6%) | ✅ | ✅ |
| **Capital gains & qualified dividends** (§ 1(h) 0/15/20% stacking, per-status breakpoints) | ✅ | ✅ |
| **NIIT** (§ 1411, 3.8%) and **Additional Medicare Tax** (0.9%, § 3101(b)(2)) | ✅ | ✅ |
| **HSA deduction** (§ 223: $4,300/$8,550 · $4,400/$8,750 + 55+ catch-up) | ✅ | ✅ |
| **Student loan interest** (§ 221 ratio phase-out; 2026 joint range moved to $175k–$205k) | ✅ | ✅ |
| **Itemized deductions (Schedule A)** — SALT with the OBBBA cap ($40,000 → **$40,400 in 2026**, 30% phase-down over $500k/$505k MAGI, $10,000 floor, MFS halves), mortgage interest ($750k acquisition-debt limit, proration), charitable (60% AGI limit + the new 0.5% floor in 2026), medical over 7.5% AGI | ✅ | ✅ |
| **Standard-vs-itemized election** (§ 63(b)/(e) as a `max`; § 170(p) switches OFF when itemizing; MFS spouse-itemizes zero rule flows through) | ✅ | ✅ |
| **§ 68 overall limitation** (OBBBA 2/37 haircut above the 37% bracket — new for 2026; correctly absent in 2025) | ✅ n/a | ✅ |
| **Education credits (§ 25A)** — AOTC per student (up to 3): 100%/25% of first $4k, 40% refundable (denied to kiddie-tax children), LLC 20% of $10k/return, unindexed $80–90k/$160–180k MAGI phase-out, MFS denied — with the Form 8812 ordering (education credits displace CTC into the refundable ACTC) | ✅ | ✅ |
| **IRA deduction (§ 219)** — $7,000 + $1,000 catch-up · **$7,500 + $1,100 in 2026** (Notice 2025-67), active-participant phase-outs with the statutory $10 rounding + $200 floor, spousal rule, MFS $0 threshold | ✅ | ✅ |
| **Business-entity classification** (check-the-box, Reg. § 301.7701-3): "how is my LLC taxed?" as a proof-backed determination — disregarded / partnership / S-corp (§ 1361(b) eligibility; ineffective elections refuse) / C-corp | ✅ | ✅ |
| **Entity-level income tax**: C corporation flat 21% (§ 11, confirmed OBBBA-unchanged) — line 30 given, or **computed**: corporate charitable 10% ceiling + the **OBBBA 1% floor (2026)**, DRD 50/65/100% with the § 246(b) cap and its NOL-creation escape hatch, § 172 80% NOL limit; § 6655 corporate estimates (large-corp rule); § 1375 excess-net-passive + § 1374 built-in-gains S-corp taxes; **CAMT ($1B+ AFSI) refuses** | ✅ | ✅ |
| **K-1 pass-through income** (S-corp/partnership box 1): QBI-eligible, no SE/payroll tax — the wages + K-1 S-corp-owner split, matched to PolicyEngine to the cent across an 18-scenario grid | ✅ | ✅ |
| **OBBBA business deductions**: § 168(k) 100% bonus (permanent), § 174A domestic R&D expensing + foreign 15-yr amortization, § 163(j) 30%-of-EBITDA interest limit with the § 448(c) $31M/$32M small-business exemption | ✅ | ✅ |
| **Corporate penalty taxes**: § 531 accumulated-earnings tax (20%, $250k/$150k credit) and § 541 PHC tax (20%, with the § 542 60%-AOGI + 5-individuals determination) | ✅ | ✅ |
| **§ 250 international deduction** — 37.5% FDII + 50% GILTI in 2025 → the OBBBA's **33.34% FDDEI + 40% NCTI** from 2026 (QBAI abolished), with § 250(a)(2) pro-rata scaling; FTCs and BEAT disclosed-unmodeled | ✅ | ✅ |
| **§ 38 GBC limitation** (25%-over-$25k rule, corporate TMT zero per § 38(c)(6)(E)) + § 39 carryforward target | ✅ | ✅ |
| **§ 461(l) excess business loss** — OBBBA-permanent, with the re-based thresholds that go **DOWN** in 2026: $313k/$626k → **$256k/$512k** (Rev. Proc. 2025-32 § 3.31, verbatim) | ✅ | ✅ |
| **Carryover targets**: § 170(d)(2) corporate charitable (incl. the OBBBA floored-amount rule), § 163(j)(2) disallowed interest, § 39 credits — what carries to next year, as answerable questions | ✅ | ✅ |
| **BEAT (§ 59A)** — 10% in 2025 → the OBBBA-fixed **10.5% permanent** from 2026 ($500M receipts + 3% erosion tests; GBCs protected) | ✅ | ✅ |
| **Corporate FTC (§§ 901/904/960(d))** — general + CFC baskets, the 80% → **90% (OBBBA)** deemed-paid allowance, basket income net of § 250 | ✅ | ✅ |
| **§ 246A debt-financed DRD reduction**, corporate capital gains/losses (§ 1211(a) gains-only offset + § 1212(a) carryover target), **§ 6655(e) corporate annualized installments** (3/6/9-month periods, telescoped recapture) | ✅ | ✅ |
| **Consolidated returns (§§ 1501–1504) refuse explicitly** — never a silent single-entity answer | ❌ refuses | ❌ refuses |
| **§ 1202 QSBS exclusion** — the OBBBA tiers (50/75/100% at 3/4/5 years, $15M cap, post-7/4/2025 stock) and prior-law 100%/$10M; legacy vintages refuse | ✅ | ✅ |
| **Individual AMT (Form 6251)** — 26%/28% with the capital-gains stack, SALT/standard/senior addbacks, ISO spread, § 59(j) kiddie exemption cap; the **OBBBA 2026 reset** ($500k/$1M phase-out at a doubled 50% rate) encoded from the Rev. Proc.'s own arithmetic | ✅ | ✅ |
| **Premium Tax Credit (§ 36B)** — TY2025 under ARPA/IRA (0–8.5%, **no** 400% cliff) and TY2026 post-sunset (Rev. Proc. 2025-25 indexed table, **the 400% FPL cliff returns**: fixtures pin $100 of wages destroying $2,765.04 of credit); HHS poverty guidelines from the Federal Register; excess-APTC repayment **capped in 2025** (Rev. Proc. 2024-40 table) and **uncapped in 2026** (OBBBA § 71305 repealed § 36B(f)(2)(B) — verify-first caught this; the old cap table would have been wrong) | ✅ no cliff | ✅ cliff |
| **Child & dependent care credit (§ 21)** — 2025: 35%→20%; 2026: the OBBBA **50%→35%→20% double phase-down** (§ 70405, exact statutory steps incl. the $4,000 joint step), $3,000/$6,000 caps, lower-earner limit — PE-probe matched to the cent both years | ✅ | ✅ |
| **Saver's credit (§ 25B)** — 50/20/10% tiers from **Notices 2024-80/2025-67** (not the Rev. Procs.), per-spouse $2,000, student/dependent ineligibility — PE-probe exact; replaced by the § 6433 Saver's Match after 2026 | ✅ | ✅ |
| **Adoption credit (§ 23)** — $17,280 → $17,670 max, special-needs deemed max, $40,000 phase-out band; the OBBBA **$5,000 refundable portion from TY2025** ($5,120 in 2026), nonrefundable-only carryforward as its own target | ✅ | ✅ |
| **Credit for other dependents (§ 24(h)(4))** — $500 per non-CTC dependent, inside the § 24(b) phase-out, never refundable | ✅ | ✅ |
| **Foreign earned income exclusion (§ 911)** — $130,000 → $132,900, with the real **§ 911(f) stacking rule** (remaining income taxed at the rates it would face WITH the excluded amount — a fixture pins $1,000 of TI taxed at 24%, not 10%); § 32(c)(1)(C) EITC denial; housing exclusion, gains, and AMT-preference combos refuse | ✅ | ✅ |
| **Estates & trusts (Form 1041, § 1(e))** — the compressed 10/24/35/37 brackets (both Rev. Proc. tables), § 642(b) exemptions ($600/$300/$100); retained capital gains refuse | ✅ | ✅ |
| **Household employment (Schedule H)** — FICA above the SSA threshold (**$2,800 → $3,000**, Federal Register), 15.3% from dollar one, FUTA 0.6% on $7,000 | ✅ | ✅ |
| **Farmers & fishermen (§ 6654(i))** — the 66⅔% safe harbor, single January-15 installment, 110% prong disregarded (statutory override) | ✅ | ✅ |
| **Home office (simplified, Rev. Proc. 2013-13)** — $5/sq ft × 300 cap, income-limited, standalone target | ✅ | ✅ |
| **§ 179 expensing** — OBBBA $2,500,000/$4,000,000 (2025) → **$2,560,000/$4,090,000** (2026, Rev. Proc. 2025-32 § 3.24), income limit + § 179(b)(3)(B) carryforward target — the qualified-real-property path § 168(k) cannot reach | ✅ | ✅ |
| **Stock buyback excise (§ 4501)** — 1% of net repurchases, issuance netting, $1M de minimis (its own target; chapter-37 excise) | ✅ | ✅ |
| **§ 245A participation exemption** — 100% DRD on foreign-sub dividends (attested 365-day/non-hybrid conditions), never § 246(b)-limited | ✅ | ✅ |
| **Corporate estimated tax fixed to § 6655(g)(1)** — the required annual payment now includes BEAT and subtracts FTC/GBC (v1 understated a BEAT payer's installments) | ✅ | ✅ |
| **Fiscal-year / short-period returns (§§ 15/443) refuse explicitly** — OBBBA parameters key to the taxable year's *beginning*; a straddling filer would silently get the wrong year's rates | ❌ refuses | ❌ refuses |
| **REIT/RIC (§§ 857/852) refuse explicitly** — the dividends-paid deduction regime is not 1120 logic | ❌ refuses | ❌ refuses |
| State | ❌ refuses | ❌ refuses |

</details>

**Independently validated** (full methodology in [docs/METHODOLOGY.md](docs/METHODOLOGY.md)): a [differential harness](harness/REPORT.md) runs **572 TY2025 scenarios** through both opentax and **PolicyEngine US**, a separately-built open-source model. Result: **533 agree to the exact cent, zero unexplained disagreements**, and every explained difference is triaged with a primary-source citation in [known-differences.json](harness/known-differences.json). The harness once caught a real bug in **us** — fixed, fixture-pinned, both engines now agree to the cent.

**Is it correct?** Exact bigint-cents math — floats never enter · golden fixtures asserting every intermediate to the cent · below $100,000 the engine reproduces the printed IRS Tax Table method exactly (verified against 41 sampled rows of the 2025 Publication 1040 table, all four statuses) · every rule and the fact catalog Merkle-pinned in `corpus.lock.json` · every fixture round-trips through `verify` · every dollar read from the primary source text.

**Honest caveats.** Where the engine approximates, the rule's own citation says so; where a condition can't be verified, the default is conservative — $0 or a refusal, never a guess. The big ones: earned income ≈ wages and MAGI ≈ AGI in several phase-outs; EITC qualifying children approximated by the CTC child count; a handful of niche interactions refuse outright.

<details>
<summary><b>Complete list of approximations and limits</b></summary>

Earned income ≈ wages (EITC, ACTC, dependent limit); MAGI ≈ AGI (senior/tips/overtime/car-loan phase-outs); EITC qualifying children approximated by the CTC child count (§ 32(c)(3) age limits differ); § 32(d) separated-spouse exception not modeled (MFS gets $0 — conservative); 3+-child ACTC social-security-tax alternative not modeled; tips occupation-list, car-loan vehicle conditions (new, US-assembled, personal use), charity DAF exclusion, and SSN conditions assumed satisfied; car-loan MFS treatment encoded conservatively as $0; capital-loss carryover tracks the amount but not the ST/LT character split; rental depreciation is GDS residential building basis only (ADS elections, separately-dated improvements, final-year stub, and mid-year dispositions refuse or are out of scope) and rental-loss years route to the § 469 facts; the pension Simplified Method covers post-Nov-1996 qualified-plan starting dates (the General Rule for nonqualified annuities is not modeled); QBI ≈ SE profit − ½ SE tax − SEP − SE health insurance (+ K-1); the § 199A W-2 wages and UBIA default to $0 (conservative) and aggregation/REIT/PTP components are not modeled; investment income for NIIT/EITC is the netted Schedule D result plus interest and dividends; Schedule SE line-rounding may differ by cents from the exact formula. Credit block: § 36B household income counts the taxpayer/spouse only (dependents' MAGI not modeled), 48-contiguous-states poverty guidelines (AK/HI's higher lines not modeled — conservative), annualized (not monthly) computation, and Form 8962's whole-percent/4-decimal-table rounding may differ sub-dollar from the encoded statutory linear interpolation; § 21 deemed student-spouse income ($250/$500-month) and the § 21(e)(4) living-apart exception are not modeled (MFS and no-spouse-income joint returns get $0 — conservative); § 25B assumes age 18 attained; § 23/§ 25B/§ 21 MAGI ≈ AGI. § 911: housing exclusion, preferential-gains coordination (§ 911(f)(2)), and AMT stacking (§ 911(f)(1)(B)) refuse; Form 1041 models the rate schedule + exemption only (retained gains refuse; trust AMT and qualified disability trusts not modeled); Schedule H models one household employee. Schedule A: MAGI ≈ AGI for the SALT phase-down (§ 911/931/933 add-backs); charitable is CASH to 60%-limit charities only, and § 170(d) carryovers are not tracked (conservative for the current year); mortgage assumes post-Dec-15-2017 acquisition debt (the grandfathered $1M limit is not modeled — conservative) and mortgage-insurance-premiums-as-interest (2026+) is not modeled; casualty/gambling/misc itemized deductions absent; the § 68 × § 199A interaction REFUSES rather than guess; AMT is modeled (SALT/standard/senior addbacks + entered ISO/preference items); the § 55(d)(3) MFS add-back, § 53 minimum tax credit carryforward, and depreciation-schedule AMT adjustments are not — enter the latter via --amt-preferences.

</details>

## The solver layer — ask questions a calculator can't answer

Because the rules are pure functions, `opentax` can *reason* about the tax code, not just evaluate it — and every data point is a real, proof-backed evaluation:

```
$ opentax cliffs --status hoh --wages 30000 --kids 2 --vary taxableInterest --from 10000 --to 14000

1 cliff(s) found:
  ▮ at $11,950.00: one more cent of taxableInterest costs $3,234.84
```

That's the § 32(i) EITC kill switch, located **to the exact cent** by bisection over real evaluations — one cent of interest income destroys the family's entire earned income credit.

```
opentax compare --wages 50000            # net tax under every filing status
opentax marginal --status single --at 50000    # your true marginal rate
opentax sweep --vary wages --from 0 --to 200000 --step 5000 --csv   # the whole curve
```

`cliffs` also finds every $50 CTC phase-out step (§ 24(b)'s "or fraction thereof" makes one cent past $412,000 cost $50); `invert` answers "what income first reaches tax X" by bisection — and *refuses* with `not-monotone` when the EITC region makes the answer ambiguous, rather than returning a plausible root. This is "policy simulation" as an open-source CLI command.

**This is a computation-and-citation tool, not tax advice.**

## Extending it

All tax knowledge is **data** — you add coverage by writing a rule object with a citation and a hand-computed test, never by touching engine code:

1. Write the rule (id, citation with statute + excerpt, validity dates, formula).
2. Statutory exceptions are their own rules that `override` the base with a guard — the proof shows why they did or didn't fire.
3. Add a golden fixture with expected cents you computed from the statute by hand.
4. `pnpm test && pnpm -F @invaro/opentax-corpus-us-federal gen:lock`

Full walkthrough: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Commands

| | |
|---|---|
| `opentax eval --status mfj --wages 120000 --kids 2` | answer + proof tree (negative = refund) |
| `opentax eval … --withheld 7000` | **mid-year checkup**: balance due / refund expected next April |
| `opentax eval … --brief` | plain-English 8-line summary only |
| `opentax eval --facts f.json --proof out.json` | facts from a file, save the proof |
| `opentax verify proof.json` | re-derive a proof, confirm or refute |
| `opentax facts` | every input, its type, its default |
| `opentax lookup standard deduction` | the dollar amounts behind a question, with citations |
| `opentax eval --target us.federal.eligible.tips_deduction --occupation DJ` | yes/no determinations with proof |
| `opentax explain <rule-id>` | one rule: citation, excerpt, hash, dependencies |
| `opentax corpus list` / `hash` | rule inventory / corpus fingerprint |
| `opentax sweep --from 0 --to 200000` | the tax curve, point by exact point |
| `opentax marginal --at 50000` | true marginal rate at a point |
| `opentax cliffs --from 400000 --to 450000` | exact cents where marginal > 100% |
| `opentax compare --wages 50000` | net tax under every filing status |
| `opentax eval --se-profit 80000 --wages 0` | freelancer: SE tax + QBI + income tax in one number |
| `opentax eval --wages 190000 --gains 50000` | investor: capital-gains stacking + NIIT |
| `opentax eval --wages 300000 --salt 50000 --mortgage-interest 30000 --mortgage-balance 900000 --medical 30000 --charity 10000` | homeowner: Schedule A vs standard, elected automatically |
| `opentax eval --target us.federal.corp.entity_level_income_tax --entity llc --members 1` | "how is my LLC taxed?" — classification + entity-level tax, with the check-the-box citations |

All take `--json`. In this repo, prefix with `pnpm`: `pnpm opentax …`

## Repo layout

`packages/core` — the engine (domain-general, zero deps, browser-safe) · `packages/corpus-us-federal` — the tax rules as cited data + golden tests · `packages/solve` — the reasoning layer (also domain-general) · `packages/cli` — the `opentax` command · `packages/playground` — the browser playground (one self-contained HTML file).

## Roadmap

Natural-language fact extraction (LLM in front, never inside the math) → statute→rules autoformalization pipeline → education credits → proof-format spec → state corpora. (Done: OBBBA amendments · TY2026 · all five filing statuses · EITC/ACTC/refunds · tips & overtime · the solver layer · differential testing vs. PolicyEngine · itemized deductions & the OBBBA SALT cap · the browser playground.)

**Currency policy:** the corpus tracks current law — when the IRS or Congress changes the numbers, the change lands as a new rule *version* with its own validity window and citation, never an in-place edit. Old proofs stay verifiable against the corpus root they were computed under.

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
