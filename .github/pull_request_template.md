<!-- PR title format (CI-enforced): type(scope): brief description
     types: feat fix chore docs style refactor test perf — e.g. "feat(corpus): encode § 25B saver's credit" -->

## What does this PR do?

<!-- One paragraph. For rule changes, name the provision (e.g. "§ 25B saver's credit, TY2026 amounts"). -->

## Checklist

- [ ] `pnpm build && pnpm test` green locally
- [ ] Every new/changed rule cites its primary source — statute / Rev. Proc. / form instruction, with a verbatim excerpt and URL
- [ ] Dollar amounts come from the primary source text and are hand-derived in the fixture description — never from memory, a blog post, or any test suite's expected output
- [ ] Golden fixture(s) with hand-computed exact cents; boundaries pinned (phase-out edges, bracket flips, step fractions)
- [ ] Uncovered branches fail loud — no `else` that guesses
- [ ] `corpus.lock.json` regenerated if rule content changed: `pnpm -F @invaro/opentax-corpus-us-federal gen:lock`
- [ ] Bundles rebuilt if package source changed: `pnpm build && pnpm -F @invaro/opentax build:hosted`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full rule-writing loop.
