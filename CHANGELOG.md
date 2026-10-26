# Changelog

New in OpenTax, newest first. Each release's git tag also lists every rule that changed, with old and new amounts.

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
