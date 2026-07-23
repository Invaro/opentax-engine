# @invaro/opentax-cli

**Verifiable US tax computation in your terminal** — every answer derived from cited, content-hashed tax rules, with a machine-checkable proof tree.

🌐 **[opentax.invaro.ai](https://opentax.invaro.ai)** · [GitHub](https://github.com/Invaro/opentax-engine) · AGPL-3.0 + commercial dual license

```bash
npx -y @invaro/opentax eval --status mfj --wages 120000 --kids 2
```

The `opentax` bin ships in [`@invaro/opentax`](https://www.npmjs.com/package/@invaro/opentax)
(CLI + MCP server + HTTP host in one package); `@invaro/opentax-cli` is the same CLI as a
standalone package.

## Commands

```bash
opentax eval --status mfj --wages 120000 --kids 2 --json --proof proof.json
opentax check --status mfj --wages 120000 --kids 2 --expect 5640   # verified / refuted
opentax verify proof.json          # re-execute any proof artifact
opentax lookup standard deduction  # dollar amounts + citations behind a question
opentax explain us.federal.eitc    # a rule's citation, formula, validity window
opentax marginal --status single --at 50000
opentax cliffs --status hoh --wages 30000 --kids 2 --vary taxableInterest --from 10000 --to 14000
opentax compare --wages 50000      # all five filing statuses
opentax state --facts va.json --as-of 2025-12-31   # IL/VA/CA/NY printed-form line sets
opentax facts                      # every input the engine understands
```

Add `--json` to any command for a machine-readable envelope (`{ ok, value, assumptions, proof, … }`; exit code 2 = missing facts are named, 3 = situation not covered — the engine refuses rather than guesses).

Covers tax years 2025 and 2026 (OBBBA-current), federal Form 1040 + 1120 + 1041, and state returns for IL, VA, CA, NY plus rates for 21 more states.

## The AI-agent version

This same engine powers [`@invaro/opentax`](https://www.npmjs.com/package/@invaro/opentax), an MCP server for Claude, ChatGPT, and Cursor — hosted connector at `https://opentax.invaro.ai/mcp`. On TaxCalcBench TY25 it lifts a Sonnet agent from 6% to **96% exact returns**.
