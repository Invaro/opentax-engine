# Changelog

New in OpenTax, newest first. Each release's git tag also lists every rule that changed, with old and new amounts.

## Next release · Fact checks answer from the jurisdiction you ask about

`verify_fact`, `lookup_tax_parameter` and `opentax lookup` now answer from federal law unless the query names a state, and from that state when it does. A claimed figure is never checked against another jurisdiction's rule.

- **Federal by default.** "standard deduction" returns the federal amounts, and for 2026 "the MFJ standard deduction is $32,200" is verified against the federal rule (Rev. Proc. 2025-32). When a query names no state and nothing federal matches, `lookup_tax_parameter` lists the state rules that do, with a note saying so; `verify_fact` returns `unknown`.
- **Name a state to get the state.** "Alabama standard deduction" or "CA renter's credit" is answered from that state only, by its name or its capitalized two-letter code. A state the corpus has no figure for comes back `unknown`. `verify_fact` does not guess at a capitalized code that is also a word (such as `OR`, `IN`, `ME`, `OK`, `HI`), a lowercase code (`ca`; the lowercase words "in", "or", "me" and "as" are read as English), or a state together with "federal": it returns `unknown`. The word "state" with no state named is part of the question, so "state standard deduction" is `unknown` while "state and local tax deduction cap" is the federal SALT cap.
- **The year and filing status in the query count.** "standard deduction married filing jointly 2025" is checked against the 2025 joint amount when you don't pass `asOf` or `filingStatus`. A `filingStatus` or an `asOf` year that differs from what the query names, and a query that names two years, come back `unknown` from `verify_fact`. A query that lists statuses ("single vs head of household"), or says "married", is compared only with the amounts the rule states for those statuses.
- **Pass a filing status only for amounts that differ by status.** With a filing status, `verify_fact` compares only an amount the rule states for that status: a filing-status table, or a parameter labelled for that status. "Child tax credit per child" with `filingStatus: mfj` is `unknown`; without a filing status it is checked against $2,200. Whether a single cap applies to a status can be decided elsewhere in the law (married filers must file jointly for the tips deduction), which a lookup doesn't read.
- **A verdict needs a rule named for the query.** `verify_fact` compares the claim with the best-matching rule whose id, title (up to its first dash, bracket or colon) or parameter names carry every subject word you used. Filler such as "what is the" is ignored, and "cap", "limit", "maximum", "floor" and "threshold" select the kind of amount. On that rule it compares the amount you named: "SALT cap" with the cap, "child tax credit per child" with the per-child amount, a joint claim with the joint amount. When a rule's own id is the query ("income tax"), only it and its parts answer, not a credit whose title has the same words. Ask in the law's words.
- **Refuted means the figure is not there under that name.** A claim is refuted when no rule named for the query holds the figure as an amount the query could mean, and the answer reports the nearest amount on the matching rule. An amount of a different kind than the one you named (the floor, when you asked for the cap) and a table's amount for another filing status don't count.
- **`unknown` when it can't be settled**, with the reason. No rule named for all of the query. A figure that is in the law under another name (for 2026, $2,050 is the additional standard deduction, not the standard deduction). A rule that has run out for the date asked, or is titled for another year (Vermont's 2025 standard deduction, asked for 2026). The base a percentage applies to ($10,000 of expenses for the 20% lifetime learning credit). Two amounts that both fit.
- **Rates come back `unknown`.** The lookup holds dollar amounts. A query that asks for a rate or a percentage, a claim written as `3.8%`, and a claim under $100 that matches nothing are `unknown`.
- **Every answer says what it used:** `jurisdictions` (how the query was read) and `asOf` on every answer; `jurisdiction`, the rule and its `effective` window on a verdict; `jurisdiction` on each lookup hit.
- **API changes** (`@invaro/opentax-solve` 1.1.0, provisional functions only):
  - `lookupParameters` returns hits from the queried jurisdiction, where it used to rank every jurisdiction together. With no `asOf`, a year in the query selects that year's rules. A rule with several different filing-status tables has an empty `byFilingStatus`.
  - `factCheck` compares only the rule named for the whole query, in the queried jurisdiction, where it used to accept the claimed value on any of the top five hits. Many claims that were `verified` or `refuted` on a loose match are now `unknown`.
  - `lookupParameters` and `factCheck` throw `RangeError` for an `asOf` that isn't a real `YYYY-MM-DD` date.
  - A money parameter named as a rate (`applicablePercentage`, holding 30 for 30%) is no longer listed as a dollar amount.
  - `LookupHit` has `jurisdiction`. `FactCheckResult` has `jurisdictions` and `asOf`, and a verdict has `jurisdiction`, `effectiveFrom` and `effectiveTo`.
  - New: `queryScope(query)` and its `QueryScope` type return how a query is read.
- Tax answers and proofs are unchanged.

## Nov 10, 2026 · A stable library API

The four library packages now have a documented, versioned API and a written compatibility policy: [docs/LIBRARY-API.md](docs/LIBRARY-API.md). Checking the document against the code found five defects in the engine, fixed here.

- **What is stable:**
  - `@invaro/opentax-core` 1.0.0: `evaluate`, `coerceFacts`, `loadCorpus`, `selectVersion`, `verifyProof`, the eight error classes and their codes, the proof and hashing functions, and every type you write rules with.
  - `@invaro/opentax-solve` 1.0.0: `sweep`, `marginal`, `findCliffs`, `invert`, `compareAcross`. `searchRules`, `lookupParameters` and `factCheck` are provisional (their ranking is tuned over time).
  - `@invaro/opentax-corpus-us-federal`: `getCorpus`, `corpusInput`, `facts`, `DEFAULT_TARGET`, `extendCorpus` with `EXTENSION_POINTS`, and the projection functions.
  - `@invaro/opentax-compose` (state returns, Form 2210, Form 4562) is provisional: its shapes follow each year's forms.
- **Version numbers:** core and solve follow semantic versioning from 1.0.0, so only a major version can break stable code. The corpus version stays the release number.
- **Ids:** fact ids, rule ids, enum values, accepted ranges, defaults and extension points are not removed, narrowed or repurposed, and a published rule version never changes (a change is a new version with a new number). Answers still change when the law does or a mistake is fixed, and the release notes list every rule.
- **Fixed:**
  - **A proof edited in memory could still verify.** The hashing code remembered an object's canonical form for the life of the process, so editing a proof object (or a rule object) after it had been hashed kept the old hash. A stored or re-parsed proof was always checked correctly. The memory now lasts one call.
  - **The corpus fingerprint depended on the machine's language.** Rule and fact ids were sorted with the runtime's locale, so a browser set to Czech, Lithuanian, Turkish and a dozen other languages computed a different Merkle root and rejected valid proofs. Ids now sort in one fixed order (`compareIds`, specified in [docs/PROOF-FORMAT.md](docs/PROOF-FORMAT.md) § 4). It is the order English locales already gave, so every published root is unchanged.
  - **`findCliffs` skipped the end of a range** that wasn't a whole number of steps, and a range shorter than one step. `find_tax_cliffs` and `opentax cliffs` had the same gap.
  - **An override needed only one pin.** With several versions of a rule (one per tax year), pinning one let the override silently replace the others, including a version added later. `extendCorpus` now requires a pin for every version that applies during your rule's dates.
  - **State composer amounts were formatted in the machine's language** (`$1.234.567` on a German system). They are always `$1,234,567` now.
- **API changes** (what a caller may need to do):
  - `extendCorpus`: if you override a rule that has several versions, add a pin for each version in your rule's dates, or set your rule's `effectiveTo`. The error names the pins that are missing.
  - A malformed formula in your own rules (an unknown kind, a money literal with a decimal point, a rate with a zero denominator) is now reported by `loadCorpus` as `CORPUS_INVALID`, with every problem listed, where it used to surface as a `TypeError` or `RangeError` during an evaluation.
  - `evaluate` reports a fact that isn't a typed value as `FACT_INVALID` (was a `TypeError`), and `FACT_INVALID` now carries `data().factId`.
  - New proofs carry engine version 1.0.0. Proofs made earlier still verify, and the reverse.
- **Answers are unchanged.** Every answer, every proof tree and the Merkle root are identical to v0.52.0.
- **Each package's tarball now has a README**, the corpus and the solver accept any core 1.x, and the document has six runnable examples: evaluate, errors, verify, extend, solve and project.
- **Enforced in CI** (Node 20, 22 and 24):
  - Every export is classified as stable, provisional or internal, and an API report of every declaration is committed, so a change to the surface is a visible diff.
  - The last release's baseline is compared with the tree: 1,204 fact ids with types, enum values, ranges and defaults; 971 rule ids with output types; the hash of 1,151 rule versions; extension points; error codes and data fields; a hash of every stable declaration. A break fails the build unless it was announced, and a breaking change to a stable declaration fails until the major version goes up.
  - A frozen corpus using every kind of formula keeps the Merkle root, rule hashes and proofs it had under core 0.1.0; today's core must reproduce them byte for byte.
  - The document's examples are run and their answers checked, and the tarballs are packed, installed into an empty project, bundled for the browser and type-checked from a strict TypeScript consumer.

## Nov 10, 2026 · Installment sales and like-kind exchanges: Form 6252 and Form 8824

Installment sales (Form 6252) and like-kind exchanges of real property (Form 8824) are modeled for 2025, 2026 and 2027, with their results flowing through Form 4797, Schedule D and the 25% rate.

- **Form 6252, up to four sales** (`installmentSales`, then `installmentSaleN…`), in the year of sale and every later year:
  - Kind (`capital`, `section1245`, `section1250`, `other`), held over a year or not, and whether this is the year of sale. Part I amounts as of the year of sale, this year's payments (line 21) and earlier years' (line 23). For a main home, the § 121 exclusion (line 15).
  - Gross profit (line 16), contract price (line 18, with the mortgage over basis as a line 20 payment) and installment income (line 24). Line 19 is exact, or the percentage you used (`GrossProfitPercentageBps`), e.g. Pub. 537's four-digit rates for a sale of a business.
  - § 1245 and § 1250 recapture is taxed in full in the year of sale (§ 453(i), Form 4797 line 13). Held a year or less, all of a § 1250 property's depreciation is recaptured (§ 1250(b)(1)), on an exchange too.
  - A related party's second disposition is a payment (Part III, § 453(e)).
  - A related-party sale asks whether § 453(g) applies: property depreciable in the buyer's hands sold to an entity you control or a trust you benefit from (§ 1239(b)). Family members aren't § 453(g) related persons, so a building sold to your child can use the installment method.
  - The income goes to Schedule D line 4 or 11 (capital assets), Form 4797 line 4 (§ 1231) or line 10 (held a year or less). Its unrecaptured § 1250 gain comes first (Schedule D worksheet line 4); `…unrecaptured_1250_remaining` carries what is left.
- **Form 8824, up to four exchanges** (`likeKindExchanges`, then `likeKindExchangeN…`):
  - Lines 15–25: cash, other property and liabilities netted on both sides with exchange expenses (Reg. § 1.1031(d)-2), realized, recognized and deferred gain, and the basis of the property received (25a and 25b by FMV).
  - Line 21 recapture: § 1245 real property components limited by § 1245(b)(4), additional depreciation by § 1250(d)(4).
  - The recognized gain goes to Schedule D (investment property) or Form 4797 lines 5 and 16. Recognized § 1231 gain on a building is unrecaptured § 1250 gain up to its depreciation less recapture (§ 1(h)(6)(A)).
- **Where the results go:** AGI, § 86 income, the Schedule D Tax Worksheet and Form 6251 Part III, net investment income (business property you materially participate in comes out on Form 8960 line 5b), QBI (ordinary results of QBI property), the EITC investment-income test, and the Washington capital gains guard.
- **Form 4797 for 2026:** the 2026 draft adds a livestock line 7, so `compute_return` labels 2026 returns with lines 8, 10, 13 and 20b where 2025 has 7, 9, 12 and 17. `compute_return` shows `forms['6252']` and `forms['8824']`.
- **Refused, with the reason:**
  - Form 6252: a sale at a loss, or one whose whole gain is recapture; a § 453(g) sale to a controlled entity or trust; § 453A interest on deferred tax (`installmentSaleSection453AInterest`, asked for every sale over $150,000, never assumed); payments over the contract price; prior-year payments in the year of sale, or a later year's line 23 below the year of sale's line 20; a second disposition together with an entered gross profit percentage; a depreciated capital asset (worksheet line 12).
  - Form 8824: a related-party disposition within 2 years (§ 1031(f)); gain recognized on property depreciable to an entity you control (ordinary under § 1239, asked on related-party exchanges with boot); no like-kind property received.
  - Form 4797: a sale of property depreciable in the buyer's hands to an entity you control (`businessPropertyNSoldToControlledEntity`, § 1239; assumed not unless you say so).
  - The corpus's wage-and-SE annualized-installment rules (`us.federal.estimated.annualized_installment_qN`) with any Form 4797, 6252 or 8824 amount; the Form 2210 composer's Schedule AI handles those.
  - Either form: the kiddie tax, FEIE stacking or a § 461(l)/NOL loss year.
  - Not modeled: contingent payment sales, a reduced selling price (Pub. 537 Worksheet B), § 453B dispositions of the obligation, repossessions, a like-kind exchange with an installment note (§ 453(f)(6)), § 121 with § 1031, §§ 1252/1254/1255, and Part IV of Form 8824.
- **Checked:**
  - 69 new fixtures. From Pub. 537: both mortgage examples, related-party Examples 1 and 2 and the final year, and the sale-of-business building at 8.85% and land at 22.95%. From the Instructions for Form 8824: Taylor with § 1245 property, Taylor's alternative, and Finley with § 1250 recapture and the 25a/25b split, line by line.
  - From Pub. 544: the mortgage-netting pair, non-like-kind property received and given up, the § 1245(b)(4) example and both § 1250(d)(4) examples.
  - From the regulations: Temp. Reg. § 15a.453-1(b)(5) Examples (1)–(4), and Reg. § 1.453-12(d) Examples 1, 3 and 4 year by year (25%-rate gain first, with the § 1231(c) lookback and a net § 1231 loss).
  - The other fixtures cover each flow and each refusal.
  - Every statute quote, formula and threshold was checked against the U.S. Code text (§§ 453, 453A, 1031, 1231, 1239, 1245, 1250, 1(h)), and the 2025 and 2026 revisions of both forms were compared line by line.
  - Every existing fixture, the IRS ATS scenarios, the AMT regression cases and every pre-existing rule give the same answers as v0.51.0, and 21,000 random capital gain and AMT evaluations compute identically.
  - Over 300 complete installment lifetimes, the income adds up to the gross profit and the unrecaptured § 1250 gain to its total. On 352 exchanges, basis plus deferred gain equals the FMV received.
  - An independent rebuild of both forms and their flows from the IRS documents alone (Form 6252, the Instructions for Form 8824, Pub. 537, the Schedule D worksheet) agrees on all 400 random returns: every line of every sale and exchange, Form 4797, Schedule D, the unrecaptured § 1250 gain and AGI, and the same 5 refusals. It found one difference first, now fixed: an exchanged building held a year or less didn't treat all its depreciation as additional depreciation (§ 1250(b)(1)).
  - An adversarial review ran the engine against the sources looking for wrong numbers. The core arithmetic held on every IRS example; it found the narrow cases refused above (§ 453A assumed away, § 1239, Part III with an entered percentage, the annualized-installment rules), all fixed before release.

## Nov 10, 2026 · Sales of business property: Form 4797 and the 25% rate

Sales of business property now go through Form 4797, for 2025, 2026 and 2027, and unrecaptured § 1250 gain is taxed at up to 25%.

- **Up to eight properties** (`businessProperties`, then `businessPropertyN…`): kind (`section1245`, `section1250`, `other`), held over a year or not, sales price, cost basis, depreciation and, for § 1250 property, additional depreciation. Also K-1 § 1231 gain or loss, K-1 unrecaptured § 1250 gain, the 5-year lookback (line 8) and the unrecaptured § 1250 gain in capital gain distributions.
- **Form 4797:**
  - Each property's gain or loss (line 24).
  - § 1245 recapture: the smaller of the gain or the depreciation. § 1250 recapture: the smaller of the gain or the additional depreciation.
  - § 1231 netting in Part I: a net loss is ordinary; a net gain is ordinary up to the nonrecaptured losses of the prior 5 years (§ 1231(c)) and long-term capital gain beyond.
  - Sales within a year are Part II.
  - Line 17 goes to Schedule 1 line 4 and line 9 to Schedule D line 11; `us.federal.form4797.lookback_remaining` is next year's line 8.
- **Unrecaptured § 1250 gain** (Schedule D line 19, `us.federal.schedule_d.unrecaptured_1250`) comes from the Instructions for Schedule D worksheet. The regular tax uses the Schedule D Tax Worksheet whenever there is any; the 25% band starts above the top of the 24% bracket, so gain that fits below it keeps the lower ordinary rates. Form 6251 Part III carries it too: line 13 less the unrecaptured gain, line 14, line 15, and lines 35–37 at 25%.
- **Where the results go:**
  - **AGI and § 86 income.**
  - **Net investment income:** Form 8960 line 5a; property held in a nonpassive trade or business comes out on line 5b. The NIIT now isn't figured, and nothing is asked for it, when modified AGI is under the threshold.
  - **QBI:** the ordinary results of property used in a qualified trade or business.
  - **The EITC investment-income test:** Pub. 596 line 6 takes the § 1231 gain out.
- **`compute_return`** shows `forms['4797']`.
- **Refused, with the reason:** §§ 1252, 1254 and 1255; casualties, installment sales and like-kind exchanges (Forms 4684, 6252 and 8824); Part IV; 28% rate gain; a loss year (§ 461(l) or NOL) with Form 4797 amounts; FEIE stacking or the kiddie tax with Form 4797 amounts; and § 1231(c) lookback income alongside QBI property.
- **Checked:**
  - 23 new fixtures, among them Pub. 544's § 1245 truck and § 1231 lookback examples, the Form 4797 line 8 example, and hand-worked Schedule D Tax Worksheet returns for 2025 and 2026. The others cover the AMT Part III return, NIIT in and out, the EITC and QBI.
  - Every existing fixture, the IRS ATS scenarios and the AMT regression cases give the same answers as v0.50.0, and so does every pre-existing rule.
  - 3,000 random returns heavy in gains, dividends and AMT preferences (21,000 evaluations) compute identically.
  - An independent rebuild of Form 4797, the line 19 worksheet, the Schedule D Tax Worksheet and Form 6251 Part III from the IRS documents alone agrees on all 400 random returns: every property, every line, AGI, taxable income, regular tax and tentative minimum tax. 119 of them have unrecaptured § 1250 gain.

## Nov 10, 2026 · Business credits: Form 8582-CR and Form 3800

General business credits now reduce the tax, for 2025, 2026 and 2027. Credits from passive activities are limited by Form 8582-CR first; the Form 3800 limit then applies to all of them.

- **Nonpassive credits and carryforwards:**
  - `generalBusinessCreditNonpassive` (Part III line 2) and `specifiedCreditNonpassive` (§ 38(c)(4)(B) specified credits, allowed against the tentative minimum tax).
  - § 39 carryforwards in `generalBusinessCreditCarryforward` and `specifiedCreditCarryforward`.
  - Each is entered after its own credit form.
- **Passive credits, by activity:** `passiveActivityNCredit`, `…PriorUnallowedCredit`, `…CreditType` (`general`, `rehabilitation`, `lihc_pre1990`, `lihc_post1989`) and `…CreditSpecified`.
- **Form 8582-CR (Rev. December 2024):**
  - Credits are allowed against the tax on net passive income (line 6), then under the special allowances' tax equivalents.
  - The $25,000 phases out from $100,000 of modified AGI, from $200,000 for rehabilitation and pre-1990 low-income housing credits, and doesn't phase out for post-1989 low-income housing credits.
  - None of it is available to a married person filing separately who lived with the spouse.
  - Allowed and unallowed credits are split across activities (Worksheets 5–9), and the unallowed ones carry forward per activity (`us.federal.passive_credit.activityN.unallowed`).
  - "Tax on" each amount uses the return's own Tax Table / capital gain worksheet method.
- **Form 3800 (2025):**
  - The § 38(c)(1) limit is net income tax over the greater of the tentative minimum tax or 25% of net regular tax above $25,000 ($12,500 married filing separately when the spouse has a credit, `spouseHasBusinessCredit`).
  - Specified credits are measured without the TMT.
  - The result is Schedule 3 line 6a (`us.federal.gbc.allowed`), taken after every other nonrefundable credit. The § 39 carryback / carryforward is `us.federal.gbc.unused`.
- **`compute_return`** shows Schedule 3 line 6a, `forms['8582-CR']` and `forms['3800']`.
- **Refused, with the reason:**
  - credits from PTPs;
  - the empowerment zone credit;
  - net passive income that includes a gain on disposing of activity property, when there are passive credits;
  - a return whose regular tax isn't the Tax Table or capital gain worksheet amount, e.g. § 911(f) stacking.
- **Checked:**
  - 18 new fixtures, every one worked by hand from the form arithmetic. They cover line 6 in 2025 and 2026, each worksheet's allowance, the Worksheet 8 split, the TMT and 25% limits, specified credits, carryforwards, the married-filing-separately rules and the refusals.
  - Every existing fixture, the IRS ATS scenarios and the AMT regression cases give the same answers as v0.49.0, and so does every pre-existing rule.
  - An independent rebuild of Form 8582-CR and Form 3800 from the IRS documents alone agrees on 400 random returns with credits. All amounts that feed the credit match; each allocation is within a cent of the exact fraction. That rebuild found one error, fixed before release: line 13 printed $25,000 for a married person filing separately whose spouse has a credit, when the answer didn't change the credit.

## Nov 10, 2026 · Passive activities by activity: Form 8582 through AGI and NIIT

Passive K-1s, rentals and other passive activities now go through § 469 inside the return, one activity at a time, for 2025, 2026 and 2027. Before, the § 469 rule was a standalone check whose result you netted into Schedule E yourself.

- **Up to eight activities** (`passiveActivities`, then `passiveActivityN…`), each with a kind:
  - `rental_active` (rental real estate with active participation, Part IV);
  - `rental` and `business` (Part V);
  - `business_sp` (significant participation);
  - `ptp`.

  Each also takes current income or loss, prior-year unallowed losses, gains or losses on disposition, and whether the entire interest was sold.
- **Form 8582:**
  - Passive income absorbs passive losses.
  - The $25,000 special allowance phases out from $100,000 of modified AGI ($12,500 / $50,000 married filing separately and apart all year; none if they lived together).
  - The disallowed loss is spread over the loss activities in proportion to their losses (Parts VI–VIII; Reg. § 1.469-1T(f)(2)) and carried forward per activity (`us.federal.passive.activityN.unallowed`).
  - Modified AGI is AGI without the Form 8582 activities, less taxable Social Security, plus the IRA, student loan and ½-SE deductions and real estate professional losses.
- **Released losses:**
  - Selling an entire interest in a fully taxable sale frees every loss of the activity when the overall result is a loss (§ 469(g)); with an overall gain the activity stays on the form, and its gain absorbs other passive losses.
  - A PTP's losses offset only its own income (§ 469(k)).
  - Significant participation income over those activities' losses is nonpassive.
- **Where the results go:**
  - **AGI and § 86 income:** each activity's Schedule E/C/F result.
  - **NIIT:** Form 8960 line 4a. Released suspended losses are properly allocable deductions (Reg. § 1.1411-4(g)(9)), and significant participation income recharacterized as nonpassive is out (Reg. § 1.1411-5(b)(2)(i)).
  - **QBI:** activities flagged `Qbi`, with released losses (Reg. § 1.199A-3(b)(1)(iv)). They are not active QBI for the § 199A(i) minimum.
  - **§ 461(l):** passive business results count after § 469.
  - **EITC investment-income test:** § 32(i)(2)(D).
  - **Kiddie tax:** a child with passive income is refused.
- **`compute_return`** shows `forms['8582']`: Part I, line 9, line 11, and each activity's result and carryforward.
- **Refused, with the reason:** former passive activities (§ 469(f)), installment, gift, death and related-party dispositions, a disposition loss on an activity whose losses are partly disallowed (Part IX), a QBI-flagged PTP, and pre-2018 suspended losses in a QBI activity when some are released.
- **Checked:**
  - 36 new fixtures from the published examples (Pub. 925, the Form 8582 instructions, Reg. § 1.469-1T(f)(2)(i)(D) Examples 1 and 2, the PTP examples) and the special allowance, MAGI, NIIT, QBI and EITC rules.
  - Every existing fixture, the IRS ATS scenarios and the AMT regression cases give the same answers as v0.48.0.
  - 550 random multi-activity returns pass the form's invariants, and an independent rebuild of Form 8582 from the IRS documents and regulations alone, without this code, agrees on every one: lines 1d, 2d, 3 and 9, each activity's result and carryforward, and AGI. Each share is within 1.24 cents of the exact fraction, because Part VI is rounded to the cent before Part VII.
  - The rebuild found one error, fixed before release: an entire disposition at an overall loss was counted in the significant participation test. Its losses are nonpassive, so it is not a passive activity deduction (Reg. § 1.469-2T(d)(2)(v)).

## Nov 9, 2026 · California 2026, and five 2025 California fixes

`compute_state_return` now composes a 2026 California Form 540 from FTB's published 2026 amounts.

- **2026 tax:**
  - All nine tiers of the 2026 Schedules X, Y and Z (FTB, 2026 Tax Rate Schedules).
  - Taxable income of $100,000 or less uses the Tax Table. The 2026 table prints in late December, so until then it is generated from the 2026 schedules. Each row is priced at its whole-dollar midpoint, the convention that reproduces every cell of the printed 2024 and 2025 tables.
- **2026 amounts from FTB's September 3, 2026 indexing memo:**
  - standard deduction $5,900 / $11,800;
  - exemption credits $158 per personal, blind or senior box and $491 per dependent, with the AGI limitation over $260,778 / $391,173 / $521,561;
  - renter's credit limits $55,830 / $111,660;
  - Young Child Tax Credit $1,229, phasing out from $28,357 at $21.58 per $100;
  - AMT exemptions $95,902 / $127,872 / $63,932 phasing out over $359,633 / $479,512 / $239,752;
  - SDI 1.3%.
- **The composer reads the year's rules:** the standard deduction, line 32 exemption credits and line 46 renter's credit come from the rules for the `asOf` date. Line 62 (the 1% tax over $1,000,000) is computed when not passed. Pass `caRentedPrincipalResidence` and the composer tests the renter's credit itself.
- **Not yet for 2026: the CalEITC.** Its 2026 table prints in the 2026 FTB 3514 booklet. The memo gives the earned income amounts and limits but not the table's lower phase-out line, so a 2026 CalEITC refuses (line 75 stays an input). The 2026 YCTC is computed, with CalEITC eligibility tested directly.
- **2025 fixes:**
  - **Single and married-filing-separately tax between $371,479 and $505,208 was charged 9.3%;** the printed schedule switches to 10.3% at $371,479. Taxable income above the 9.3% band no longer refuses, for any status.
  - **The 2025 CalEITC now matches FTB's printed table in every cell (2,632 of them).** The old fit missed 775, mostly by $1 or $2. It also gave $0 at exactly $32,900 instead of $1, and never applied the $4,814 investment income limit.
  - **Exemption credits are reduced above the AGI limitation** ($6 per box for each $2,500 over $252,203 / $378,310 / $504,411). The composer used to give the full credits at any income.
  - **The renter's credit tests California AGI** (Form 540 line 17), not federal AGI, so taxable Social Security and unemployment no longer cost a qualifying renter the credit. The joint limit is $107,988, not $107,987.
  - **Tax Table edge rows:** exactly $100,000 uses the table, and two rows near it were a dollar or three off.
- **Checked:**
  - Every row of the printed 2025 Tax Table (1,001 rows, five statuses, both ends of each row) and every cell of the 2025 EITC Table now match the engine.
  - The 2024 table confirms the midpoint convention.
  - All 54 fixed amounts in the 2025 and 2026 schedules chain to the cent.
  - A differential against the released engine on 39,000 random 2025 cases: every difference is one of the fixes above.
  - An independent rebuild of 24 2026 scenarios from FTB's documents alone, without this code: tax table and all schedules, the AGI limitation, renter's credit, YCTC, AMT, the 1% tax and two full Form 540s. All 34 values match.

## Nov 9, 2026 · Business losses through AGI: § 461(l) and the § 172 NOL with the 80% limit

Large business losses, K-1 losses and NOL carryovers now flow through AGI, taxable income and the AMT for 2025, 2026 and 2027.

- **Excess business loss (§ 461(l), Form 461 → Schedule 1 line 8p):**
  - Counts Schedule C/F results (both spouses), nonpassive K-1 ordinary business income and loss (new `k1OrdinaryBusinessLoss`), and Schedule E rentals when they are a trade or business. Wages never count.
  - Thresholds: $313,000 / $626,000 joint for 2025, $256,000 / $512,000 for 2026, $264,000 / $528,000 for 2027. Only a joint return doubles.
  - The disallowed amount is added back as other income and carried forward as an NOL.
- **NOL deduction (§ 172, Schedule 1 line 8a):**
  - Pre-2018 carryovers are deducted in full.
  - Post-2017 carryovers are limited to 80% of taxable income figured without the NOL deduction and § 199A.
  - That base is the return evaluated without the deduction, so Social Security, phase-outs and the medical floor are figured on AGI before it.
- **NOL generated this year (Form 172 Part I, line 24),** with the nonbusiness-deduction limit, the capital loss add-back and the senior deduction left out (§ 172(d)(3)).
- **Carryovers to next year (§ 172(b)(2)),** pre-2018 and post-2017 separately, oldest losses first, with the 20% reduction. Each pool's modified taxable income is the return re-run without the § 1211(b) deduction and without its own and later NOLs, so Social Security and the other AGI-dependent items are refigured as the Form 172 instructions direct. Post-2017 includes this year's NOL and excess business loss.
- **AMT:** Form 6251 line 2e adds the NOL deduction back. Line 2f takes the alternative tax NOL deduction (new `alternativeTaxNolDeduction`), limited to 90% of AMTI. It is asked only with NOL carryovers when AMTI before it is above the exemption; at or below it the AMT is zero either way.
- **`compute_return`** shows a `losses` block in a loss year: lines 8a and 8p, the Form 172 NOL and both carryovers.
- **Asked only when it changes the answer:**
  - whether a Schedule E activity is a trade or business;
  - whether the capital items are investments (only with capital gains);
  - an itemizer's business share of itemized deductions in a possible NOL year.
- **Refuses, with the reason:**
  - business capital gains or losses (Form 4797 is not modeled);
  - an NOL from an excess business loss, when some is deducted alongside QBI (Reg. § 1.199A-3(b)(1)(v));
  - a loss year with Schedule 1-A tips, overtime or car-loan deductions, other adjustments or a § 1202 gain;
  - the California renter's credit when federal AGI carries an NOL or excess business loss (it uses California AGI, which follows California's own NOL rules; CalEITC and the YCTC use federal AGI and are unaffected).
- **Checked:**
  - The derived cases and every applicable IRS example: Form 461 (2026 draft) $94,000; the Form 172 instructions' $1 million example ($687,000 at the 2025 threshold, since the printed $738,000 uses 2021's); the Pub 536 Worksheet 1 structure.
  - An independent rebuild from the sources without reading this code, on 22 scenarios plus probes. It found the carryover not refiguring Social Security, line 2f skipped when the regular deduction was zero, and three questions asked when they couldn't change the answer. All are fixed and now match.
  - A differential against the released engine on 1,600 random returns (17,600 values). Every difference is a return with an excess business loss or one of its new questions.

## Nov 9, 2026 · Form 4562: depreciation, § 179 and bonus, with cost-segregation classes

`opentax form4562` (MCP `compute_form_4562`, library `composeForm4562`) computes Form 4562 for 2025, 2026 and 2027.

- **§ 179:** $2,500,000 / $4,000,000 for 2025 (OBBBA § 70306), $2,560,000 / $4,090,000 for 2026, $2,640,000 / $4,230,000 for 2027.
  - It covers the phase-out, the married-filing-separately split (50% unless elected), the business income limitation with carryover (current elections first, the disallowed part spread equally), § 179 from Schedules K-1, the SUV cap, and qualified real property.
  - Basis drops by the amount elected, even the part carried over (Reg. §§ 1.179-1(f), 1.179-3(f)).
  - Land improvements are not § 179 property. When § 179 is in play, 15- and 20-year property and asset class 57.1 need `section1245Property`.
- **Special allowance (bonus):**
  - 100% for property acquired after January 19, 2025 (the binding-contract date, OBBBA § 70301).
  - 40% in 2025 and 20% in 2026 for earlier acquisitions (60% and 40% for long-production property), and none in 2027.
  - The TY2025 election to take 40% instead, and election out by class (qualified improvement property is class 15).
- **MACRS:**
  - The printed Publication 946 tables, the ones filed returns use.
  - Half-year, or mid-quarter when more than 40% of the year's basis (after § 179, before bonus) went into service in the last three months; mid-month for buildings.
  - 150% DB, straight-line and ADS elections; earlier years' assets; dispositions during the year.
- **Listed property:** ADS at 50% or less business use. Passenger automobile limits for cars placed in service 2020 through 2026, scaled by business use, with § 179 elected counting against the limit. A new car with 100% bonus gets the first-year limit.
- **Cost segregation:** Rev. Proc. 87-56 asset classes (Pub 946 Table B-1/B-2) set the GDS and ADS periods.
- **Missing facts** (acquisition date, an earlier asset's convention or bonus taken, business income) return `NEEDS_FACTS` (exit 2) with every missing item listed.
- **Refuses, with the reason:**
  - short or fiscal years and general asset accounts;
  - a disposition in an asset's last recovery year;
  - 2027 cars, whose limits aren't published;
  - later years of a car that took 100% bonus (Rev. Proc. 2019-13);
  - § 280F recapture;
  - § 179 elected above the dollar limit, since which asset to cut is the taxpayer's call.
- **Checked:**
  - Every worked example in Pub 946 and the Form 4562 instructions that applies (23 cases, 43 values).
  - Every table column sums to 100.00.
  - An independent rebuild written from the sources without reading this code, on 850 random portfolios and 84 targeted probes. It found land improvements counted as § 179 property, an election out of class 15 that missed qualified improvement property, the car limit counting § 179 deducted instead of elected, and four refusals the sources answer. All are fixed. Every portfolio both sides compute now agrees to the cent, except line 2 on returns with no § 179, which this build leaves informational.

## Nov 6, 2026 · Projection: tax years 2028 to 2035 at an inflation rate you choose

`--project-inflation 2.5` on `eval`, `check` and the solver commands, or `projection: { inflationPercent }` on the MCP tax tools, computes a year after 2027. Without it, 2028 and later still refuse.

- **Method:** every inflation-adjusted amount is carried forward by its own statutory formula. That is the base amount × the index ratio, rounded the way its section says: down to $25 or $50, to the nearest $10 or $100, rounding the increase or the whole amount.
  - The 2027 index is the one the IRS used: the C-CPI-U for September 2025 to August 2026 as first published, an 11-month average because October 2025 was never published, over each base year's index under § 1(f)(3).
  - For 2028 on, that index grows by your rate each year.
  - The wage base and the household employee threshold follow the wage index instead, at `--project-wage-growth` (default: the inflation rate). The wage base never falls.
- **Checked:** the formula and data reproduce all 76 indexed amounts in the 2027 rules exactly, along with the published 2025 and 2026 amounts. The one exception is the IRS's 2026 head-of-household standard deduction ($24,150), which departs from § 63(c)(7)(B)(ii)'s rounding; 2027 follows the statute, and projections start from the statutory base.
  - Every amount in the 49 rules that change each year is classified as indexed, derived from an indexed amount (joint = 200%, MFS = 50%, the EITC maximums and phase-out ends, the Schedule AI wage-base fractions), set by law, or a fixed constant. A test fails if one isn't.
- **Law, not projection:**
  - The SALT limit and threshold rise 101% a year through 2029 (to the cent; the statute gives no rounding), and the limit is $10,000 from 2030.
  - The tips, overtime, car-loan and senior deductions end after 2028.
- **Refuses rather than guesses:**
  - The premium tax credit, whose percentages follow premium growth, not prices.
  - Whatever 2027 itself refuses (IRA, SEP and saver's contributions, mileage).
  - States.
- **Labeled:** every projected rule cites "PROJECTION, NOT PUBLISHED LAW" and the assumed rates. Answers carry a `projected` block. The corpus version names the year and rates (for example `0.46.0+projected.2030.cpi-2.5.awi-2.5`), so `opentax verify` rebuilds the same corpus and checks the proof.
- **Library:** `getProjectedFederalCorpus({ year, inflationPercent, wageGrowthPercent })` returns a corpus to evaluate against, and the published corpus is untouched.

## Nov 6, 2026 · Form 2210: the estimated tax penalty, with Schedule AI for every income type

`opentax form2210` (MCP `compute_form_2210`, library `composeForm2210`) computes Form 2210 for 2025, 2026 and 2027.

- **Part I:** the required annual payment, from the engine's own line 22, other taxes and refundable credits.
  - It is the smaller of 90% of this year's tax and 100% of last year's. Last year's counts at 110% when last year's AGI was over $150,000, or $75,000 married filing separately.
  - The $1,000 tests apply.
  - With no prior-year return, line 9 is line 5.
- **Part III:** Section A per installment, then the penalty worksheet.
  - Payments go first to the earliest underpayment. A payment can pay a column's underpayment only if it was made after that column's due date.
  - Withholding counts as paid one-fourth on each due date (§ 6654(g)), and like any payment it pays the earliest underpayment still open. The printed worksheet keeps withholding off line 1b, which charges the same dollars twice when withholding covers an earlier quarter; the penalty here follows the statute.
  - Box D (actual withholding dates) is used only when it lowers the penalty.
  - A payment on the next business day after a weekend due date counts as made on the due date (§ 7503).
  - § 6654(h) applies: no penalty on the January installment when the return is filed and the tax paid in full by January 31. The payment with the return counts in column (d), and the tool checks that the payments really cover the year's tax.
  - The penalty is the sum of the worksheet lines shown, each to the cent. A refused penalty (an unannounced quarter) comes back as `NOT_MODELED`, exit 3, with the final lines in `error.data`.
- **Rates:** each quarter's § 6621 underpayment rate, by days over 365 (366 in a leap year). The rates come from the IRS quarterly-rates page and the Revenue Rulings it cites.
  - 2025 Q2 through 2026 Q1: 7%. 2026 Q2: 6% (Rev. Rul. 2026-5). 2026 Q3 and Q4: 7%.
  - The printed 2025 worksheet uses 7% through April 15, 2026, but April 1–15 is 6%. The instructions allow any method that reaches the correct penalty, and the output says so.
  - A penalty that would run into a quarter whose rate isn't announced yet (2027 Q1 on) is refused. Section A is still shown.
- **Schedule AI (box C):** pass the cumulative amounts through March 31, May 31 and August 31.
  - Each column is the whole return computed on those amounts × 4, 2.4, 1.5 and 1, with the standard deduction in full. So every income type, deduction and credit the engine models is annualized: interest, dividends, capital gains, pensions, Social Security, itemized deductions, QBI, AMT, NIIT, Additional Medicare Tax and the credits.
  - The tool reports both methods and takes the lower penalty.
  - It refuses, with the reason, where the form doesn't settle the period treatment: the foreign earned income exclusion, prior-year carryovers, the premium tax credit, Form 8615, Schedule H, a dependent filer, and a period whose annualized state and local taxes exceed the SALT limit.
  - It matches the corpus's existing wage and self-employment installment rules column by column for 2025, 2026 and 2027.
- **Checked:**
  - The instructions' Examples 3 and 4 ($202.82 with the 6% April) and hand-worked 2025 and 2026 penalties.
  - An independent build of the form, written from the instructions without reading this code: 576 random returns (2025 and 2026, 204 with Schedule AI) and 20 hand-built ones.
  - After the fixes above, every priced penalty matches it to the cent.

## Nov 6, 2026 · Tax year 2027

Federal returns now compute for tax year 2027 (`--as-of 2027-12-31`) on the published 2027 law, so a planning scenario can be carried from 2025 through 2027.

- **Amounts and sources.** Every inflation-adjusted amount is from an official source:
  - Rev. Proc. 2026-35 (released November 5, 2026): brackets, capital gain breakpoints, standard deduction, AMT, EITC, CTC $2,300 and ACTC $1,800, adoption credit, kiddie tax, QBI threshold and the $415 / $1,030 minimum, student loan interest, educator expenses, § 179, § 461(l), § 163(j) gross receipts, the foreign earned income exclusion, the qualifying-relative test, estate and trust brackets.
  - Rev. Proc. 2026-24: HSA limits, $4,500 and $9,000.
  - Rev. Proc. 2026-26: premium tax credit percentages, 2.15% to 10.22%, with the 2026 poverty guidelines (91 FR 1797).
  - SSA (91 FR 67380): wage base $192,300 and household employee threshold $3,100.
  - Statute: SALT is 101% of 2026 under § 164(b)(7), so $40,804 with a $510,050 threshold.
- **Law that changes in 2027:**
  - The saver's credit counts only ABLE-account contributions (§ 25B(d)(1) after SECURE 2.0).
  - The premium tax credit is limited to eligible individuals (OBBBA § 71301). The inputs attest it.
- **Not published yet, so these refuse rather than guess:**
  - The IRS's 2027 retirement-plan limits: a 2027 IRA, SEP/solo-401(k) or saver's contribution, and the retirement maximum targets.
  - The 2027 standard mileage rate.
  - A return with none of these computes normally.
- **States:** they still cover 2025 and 2026 and refuse 2027 until their own 2027 amounts are published.

Fixes found while checking:

- The educator expense amount is $350 for 2026 (Rev. Proc. 2025-32 § 4.12). The engine had kept 2025's $300. It stays $350 for 2027.
- Gambling losses from 2026 follow § 165(d) as amended by OBBBA § 70114: 90 percent of the losses, limited to the winnings. From 2026, `gamblingLossesItemized` is the total losses for the year, and the new input `gamblingWinnings` supplies the limit. Before, the engine deducted 100 percent.
- The premium tax credit's 400% cliff now compares household income to 4 × the poverty line directly. It used to compare a percentage rounded down to the cent, so income up to a few dollars over the line still got the full credit. This applies to 2026 and 2027.
- The 2026 standard mileage rate is 72.5¢ before July 1 and 76¢ from July 1 (Announcement 2026-11). The new input `businessMilesDrivenFromJuly` gives the later miles. Before, every 2026 mile used 72.5¢.
- Additional Medicare Tax no longer counts self-employment net earnings under $400. They are not self-employment income (§ 1402(b)), and Form 8959 line 8 takes Schedule SE line 6, which is blank in that case. This applies to every year.

## Nov 6, 2026 · Form 6251 line by line, and no deductions from a negative AGI

The alternative minimum tax now follows Form 6251 line by line, and the Schedule A floors no longer turn a negative AGI into a deduction.

- Line 13 is line 4 of the Qualified Dividends and Capital Gain Tax Worksheet: net capital gain plus qualified dividends, not limited to taxable income. Only the part of the AMT base above that amount is taxed at 26% or 28%. When net capital gain exceeded taxable income, the AMT was too high: for MFJ 2025 with $10,000 of interest and $2,000,000 of long-term gain it was $8,190, and it is now $6,900.
- Line 40 now caps the tentative minimum tax at the flat 26%/28% tax on the whole base (line 39), and the 0% and 15% bands are measured as lines 19–30 do. When the AMT base is smaller than the capital gain and dividends, the whole base is taxed at the capital gain rates.
- Line 1b starts from AGI less the Form 1040 line 14 deductions and can be negative, as the form says. Before, AMT income started from taxable income, which stops at zero, so a loss year with an ISO exercise overstated it.
- Married filing separately adds the § 55(d)(2) amount to AMT income above $900,350 for 2025 (25% of the excess, at most $68,500) and above $640,200 for 2026 (50%, at most $70,100).
- A child subject to the kiddie tax gets the full AMT exemption. § 55(d)(4)(A)(iii) turns off the § 59(j) cap for years after 2017, and the 2025 Exemption Worksheet has no such step.
- Line 2a follows the deduction actually taken: a filer who elects to itemize adds back the Schedule A taxes, and a filer whose standard deduction includes a net qualified disaster loss adds back only the standard deduction before the increase. For 2026 itemizers, AMT income also allows the deductions before the § 68 limit ("Section 68 shall not apply", § 56(b)(1)(E)).
- Line 10 includes Schedule 2 line 1z, so the excess advance premium tax credit repayment now reduces the AMT.
- New targets for each step: `us.federal.amt.amti` (line 4), `us.federal.amt.exemption` (line 5), `us.federal.amt.taxable_excess` (line 6), `us.federal.amt.capital_gain_amount` (line 13) and `us.federal.amt.tentative_minimum_tax` (line 9).

When AGI is negative, the 7.5% medical floor and the 10% casualty floor treat it as zero. Before, they turned it into a deduction of up to 17.5% of the loss with no expense entered. The 60% cash charitable limit also treats a negative AGI as zero: it allows no deduction, where for 2025 it produced a negative charitable deduction.

The SALT cap for married filing separately now halves the amount after the phase-down, as § 164(b)(6)(B) and line 10 of the Schedule A worksheet do: $20,000 less 15% of modified AGI over $250,000 for 2025, never below $5,000. Before, it took 30% off $20,000 and reached the $5,000 floor at $300,000 instead of $350,000. Modified AGI now includes the § 911 foreign earned income exclusion.

The nonrefundable credits are now limited by Form 1040 line 18, which includes the excess advance premium tax credit repayment, as every credit limit worksheet says (`us.federal.tax_before_nonrefundable_credits`). The repayment moves from `us.federal.other_taxes` (Schedule 2 Part II) to that line; net tax is unchanged except where a credit was cut short by the old limit.

`us.federal.balance_due` now subtracts estimated tax payments (`federalEstimatedPayments`, Form 1040 line 26) and the extension payment (`federalExtensionPayment`, line 31) as well as withholding. Before, it subtracted withholding only. Giving any of the three now switches the CLI and MCP to the balance-due answer.

A check of every rule for the same kind of error found four more, now fixed:

- The child and dependent care credit now reduces earned income by a Schedule C loss (Pub. 503). Before, wages alone set the limit.
- Taxable Social Security now counts a Schedule C loss, pre-2019 alimony received and HSA distributions not spent on medical care in modified income, the same as AGI does.
- The premium tax credit treats household income below zero as zero (Form 8962 line 3). Below 100% of the poverty line it now applies Reg. § 1.36B-2(b)(6): when the Marketplace estimated at enrollment that income would be at least 100% and advance payments were made, the credit is allowed at the lowest tier's percentage. Before, those taxpayers got no credit and repaid the advance. The engine asks `ptcEnrollmentEstimateAtLeast100Fpl` only in that case.
- Oklahoma's special 65+ exemption is no longer allowed to a qualifying surviving spouse whose federal AGI is negative.
- The 2026 charitable deduction for non-itemizers (§ 170(p)) is limited to 60% of AGI. § 170(p) switches off only the carryovers and the 0.5% floor, not the (b)(1)(G)(i) limit, so a negative AGI allows nothing.

## Nov 1, 2026 · QBI per business, with aggregation

The § 199A deduction now follows Form 8995-A with one column per business. Above the threshold, each business gets its own W-2 wage and UBIA limit and its own SSTB status, instead of one limit for everything.

- List up to five businesses separately with `qbiAdditionalBusinesses` and `qbiBusiness2Income` through `qbiBusiness6Income`, each with its own `W2Wages`, `UBIA`, `IsSSTB` and `AggregationGroup`. A listed business stays in the return's income: its profit is part of `selfEmploymentNetProfit` or `k1OrdinaryBusinessIncome`, and its QBI loss part of `qbiLossOffset`. Listing it only separates it for § 199A. What isn't listed is the main business, which keeps `qbiW2Wages`, `qbiUBIA` and `businessIsSSTB`.
- On a joint return, the second spouse's Schedule C is its own business, with `spouseQbiW2Wages`, `spouseQbiUBIA` and `spouseBusinessIsSSTB`. Two self-employed spouses above the threshold now get a deduction instead of a refusal.
- Aggregation (Schedule B): businesses with the same group number add their QBI, W-2 wages and UBIA and are limited as one. An SSTB can't be aggregated, and the engine refuses if one is.
- Loss netting (Schedule C): a business's QBI loss, and last year's carryforward (`qbiLossCarryforward`), is shared among the profitable businesses in proportion to their QBI. Next year's carryforward is `us.federal.qbi.loss_carryforward`.
- Each step has its own target, such as `us.federal.qbi.business2.component` or `us.federal.qbi.main.adjusted_qbi`.

- A business that breaks even still brings its W-2 wages and UBIA to its aggregation group.
- The 2026 $400 minimum now needs $1,000 of QBI from qualified businesses. An SSTB past the phase-in range isn't one, so it no longer gets the $400, and one within the range counts at its applicable percentage.

Apart from that minimum, nothing changes for a return with one business: every other existing amount is the same. Returns with business income now list two more assumptions, no businesses listed separately and no loss carryforward, so a caller that refuses defaults is asked for both.

## Oct 28, 2026 · Retirement contribution maximums

New targets give the most a self-employed person or an S-corporation owner can put into a solo 401(k) or a SEP, for 2025 and 2026:

- Sole proprietors: `us.federal.retirement.solo_401k_max.schedule_c` and `us.federal.retirement.sep_max.schedule_c`. These follow the IRS Publication 560 Deduction Worksheet for Self-Employed step by step, from net profit less half the self-employment tax.
- S-corporation owners: `us.federal.retirement.solo_401k_max.s_corp` and `us.federal.retirement.sep_max.s_corp`. These start from the owner's plan compensation, `ownerEmployeePlanCompensation`.

Each solo 401(k) maximum is split into its employer, deferral and catch-up parts. The limits are applied per year:

- The § 402(g) deferral limit, shared with other employers' plans through `otherElectiveDeferrals`.
- Catch-up from age 50, and the higher limit at ages 60 to 63 (`isAge60Through63`).
- The § 415(c) annual additions limit.
- The § 401(a)(17) compensation cap.

## Oct 28, 2026 · Self-employment tax for both spouses

When both spouses on a joint return are self-employed, each now gets their own Schedule SE, as the instructions require. Enter the second spouse's profit in `spouseSelfEmploymentNetProfit` and their W-2 box 3 in `spouseSocialSecurityWages` (`--spouse-se-profit`, `--spouse-ss-wages`). Both are asked only on a joint return. Each Schedule SE has its own $400 floor and its own social security wage base, so a spouse whose W-2 already reaches the base owes only the Medicare part, while the other still owes both. The two amounts add on Schedule 2 line 4 and Schedule 1 line 15, and both profits count in gross income, earned income, QBI and Form 8959. Above the § 199A threshold, two spouses' businesses refuse until per-business QBI ships.

## Oct 28, 2026 · Net rental income in the net investment income tax

The 3.8% net investment income tax now counts net rental income, as Form 8960 line 4a does. Before, a passive rental's income raised AGI but never reached net investment income. A real estate professional whose rental is a trade or business, or a rental grouped with a business you materially participate in, stays out: set `rentalNotInvestmentIncome` (`--rental-not-investment-income`). The question is only asked when there is rental income.

## Oct 28, 2026 · Form 5695 residential energy credits

`compute_return` now fills in Form 5695 when you give it `energy_credits` inputs: the residential clean energy credit (§ 25D, solar, battery storage, geothermal, fuel cells) and the energy efficient home improvement credit (§ 25C, insulation, doors, windows, heat pumps, energy audits), each line capped as the printed form caps it. Both credits ended after 2025, so 2026 inputs earn $0, but a 2025 clean energy carryforward still applies in 2026. The return now includes Form 1040 line 20 and Schedule 3, and the nonrefundable credits apply in the order the 2025 worksheets give.

## Oct 28, 2026 · Capital loss carryovers, short-term and long-term

Two new inputs take last year's capital loss carryover: `priorYearShortTermCapitalLossCarryover` (Schedule D line 6) and `priorYearLongTermCapitalLossCarryover` (line 14). Each one nets into its own bucket before short-term and long-term are combined, the way Schedule D does it.

The carryover to next year now comes out in two parts, `us.federal.capital_loss_carryover.short_term` and `us.federal.capital_loss_carryover.long_term`, following the Capital Loss Carryover Worksheet. Enter them next year as the two new inputs. `us.federal.capital_loss_carryover` is still the total.

When taxable income is below zero, part of the $3,000 loss allowance doesn't count as used (§ 1212(b)(2)), so more of the loss carries forward. The carryover now reflects that.

## Oct 28, 2026 · The Tax Table on capital gains returns

Line 22 of the Qualified Dividends and Capital Gain Tax Worksheet takes the tax on the ordinary part of your income from the Tax Table when that part is under $100,000, even when taxable income is $100,000 or more. OpenTax now does the same for 2025 and 2026, which can change the tax by a few dollars. `useFormulaMethod` still gives the exact brackets.

## Oct 28, 2026 · New York tax table on the IT-201

`compute_state_return` now takes IT-201 line 39 from the New York State Tax Table when taxable income is under $65,000, as the instructions require, instead of the rate schedule. When New York AGI is over $107,650, the return lists line 39 as incomplete, because the tax computation worksheets for that range aren't encoded yet.

## Oct 27, 2026 · Turn off defaults

When you leave an input out, OpenTax fills it in with a documented default and lists it under `assumptions`. A married couple with two children and a salary rests on 77 of them. You can now turn that off, so every number comes only from facts you gave.

### How it works

Pass `refuseDefaults: true` to `calculate_tax` or `compute_return`, or `--refuse-defaults` on the command line. Any input you didn't give comes back under `NEEDS_FACTS`, along with the default it would have used. Answer them, or accept the ones you agree with in `allowDefaults`.

### One thing to know

An unanswered question can hide the questions that depend on it, so a second call can list a few more. For the couple above, the first call lists 74 and the second lists 3.

Defaults stay on unless you ask, so existing calls work exactly as before.

## Oct 27, 2026 · Add your own rules

You can now add rules of your own to OpenTax with `extendCorpus`, for things like passive losses tracked by activity or an NOL carryforward. They run alongside the federal rules and show up in the proof like any other rule.

### Add to a total

A rule marked `contributesTo` adds its result to one of four totals: gross income, adjustments to income, other taxes, or refundable credits. These four keep their names and meaning from release to release, so your rules keep working as the federal rules are updated.

### "Computed without regard to"

Tax law often limits a deduction based on income figured before that deduction. The 80% limit on NOLs is one. A rule can now read a total with its own contribution left out, so you can write that limit directly.

### Replace a rule

To replace one of the federal rules, pin the version you built against. If a later release changes that rule, OpenTax stops and tells you which one, so you can review the change before your version runs again.

### Proofs

Your rules and the federal rules share one fingerprint, and `verifyProof` checks a proof against it as usual. The [README](README.md) has an example.

## Oct 27, 2026 · See what changed in each release

Every release now comes with notes listing each rule that was added, removed or changed, and what changed in it: the formula, the dates it applies, the legal citation, or an amount. When an amount changes, the notes show the old and new value in dollars. You'll find them in each release's [git tag](https://github.com/Invaro/opentax-engine/tags).

## Oct 27, 2026 · Connect your agent with one sign-in

There's now a second MCP address, `https://opentax.invaro.ai/mcp/account`. Add it to Claude, ChatGPT, Cursor or Claude Code and the app asks you to sign in to OpenTax once, in your browser, with your email. After that, OpenTax knows which account and plan each call comes from. There's no key to copy.

### Check what you're connected as

Ask your agent to call `my_account`. It answers with your email, your plan and, on the Firm plan, your firm.

### Disconnect any time

Your account page lists every app you've connected, when you connected it and when it last called OpenTax. Disconnect one and it stops working right away, until you sign in again.

The open address, `https://opentax.invaro.ai/mcp`, works exactly as before, with no account.

## Oct 27, 2026 · A new license for new releases

Releases from October 26, 2026 are under the Business Source License 1.1. It covers using OpenTax inside your organization, client work included. If you'd like to build it into something people outside your organization use, like a client portal, an API or an app you sell, write to founders@invaro.ai about an embedding license.

Earlier releases keep the license they shipped with, and each version becomes AGPL three years after its release. The full terms are in [LICENSE](LICENSE) and [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## Oct 11, 2026 · Returns now say what they leave out

`compute_return` and `compute_state_return` now tell you when a return isn't complete. Each response has `complete: true` or `false`, and `incomplete` lists every printed line this version doesn't compute, with the form, the line, the amount involved and the reason. With `strict: true`, an incomplete return is refused with `INCOMPLETE_RETURN`.

### Excess social security withholding

When two employers together withhold more social security tax than the yearly maximum, the return now lists the excess credit (Schedule 3, line 11) as not computed, with the amount. Before, it was only mentioned in a note.

### States waiting on 2026 figures

Delaware, Montana, North Dakota, New Mexico, Rhode Island and Vermont now mark each line whose 2026 figure hasn't been published, instead of printing $0 next to a note. In Vermont one missing figure affects every later line, so it refuses until the figure is out.

### explain_rule

`explain_rule` was returning only version information. It now returns every version of the rule with its formula, the quoted law, the rules it depends on, and its hash.

## Sep 9, 2026 · A REST API, full proofs and whole-dollar returns

Every tool is now a plain REST endpoint at `/v1/tools/{tool}`, with an OpenAPI document and docs at [opentax.invaro.ai/docs](https://opentax.invaro.ai/docs). Sign in to the console for an API key and your usage.

### Full proofs

Pass `includeProof: true` and the response includes the complete proof: every rule, input and rounding step, about 200 KB.

### Whole dollars, like the form

`compute_return` now rounds every amount to whole dollars after adding up your documents, the way Form 1040 does, so line 15 matches its row in the Tax Table. $75,249.50 of wages now gives $8,010 of tax, not $7,999.

### Strict mode

A W-2 without box 2 is noted as a $0 assumption. With `strict: true` it's refused instead, naming the missing box. W-2 box 4 is accepted too.

### Six more states

Hawaii, Rhode Island, Montana, Delaware, North Dakota and Vermont now have full rules and print their form's lines.

## Sep 8, 2026 · Nine more states

Connecticut, Oklahoma, Kansas, Arkansas, New Mexico, Nebraska, Idaho, West Virginia and Maine now have full rules and print their form's lines. Arkansas and Maine match their printed tax tables at every row, and Oklahoma includes its new 2026 rate schedule.

## Aug 19, 2026 · Seven more states, and 2026 state rates

Maryland, Missouri, Wisconsin, Minnesota, South Carolina, Alabama and Oregon now have full rules and print their form's lines. Oregon includes its kicker credit, and Alabama its new overtime deduction. Fifteen states now answer for 2026 using their enacted rates.

## Aug 3, 2026 · New Jersey, Ohio, Georgia and North Carolina

Four more states with full rules and their form's lines. A new coverage report shows which states are complete and which are waiting on published figures.

## Jul 24, 2026 · Pennsylvania

Pennsylvania's PA-40, with its eight separate income classes, and the form's lines printed.

## Jul 23, 2026 · OpenTax is public

The engine, the federal rules, a command line tool, and an MCP server for AI assistants. Every answer comes with a proof that cites the law behind each step.

The first release covers capital gains (Schedule D), rental depreciation, pensions under the simplified method and 1099s. It also includes rule search, and a `check` command that tells you whether a claimed amount is right.
