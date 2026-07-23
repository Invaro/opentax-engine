# @invaro/opentax

**The verifiable US tax oracle for AI agents** — a Model Context Protocol (MCP) server where every answer is computed from a content-addressed corpus of cited tax rules, ships its assumptions, and is independently re-verifiable. Never let a model guess at tax law again.

🌐 **[opentax.invaro.ai](https://opentax.invaro.ai)** · [GitHub](https://github.com/Invaro/opentax-engine) · AGPL-3.0 + commercial dual license

## Why

On [TaxCalcBench](https://github.com/column-tax/tax-calc-bench) TY25, a Claude Sonnet agent using this oracle computes **48/50 complete returns exactly (96%, 98.2% of all lines)** — versus 58% for the best web-search-equipped frontier model and 6% for the same model unaided. The two remaining cases contain reference-data inconsistencies the engine's line-level reconciliation surfaced ([reported upstream](https://github.com/column-tax/tax-calc-bench/issues/96)).

## Use the hosted connector (no install)

Paste this URL into Claude.ai (**Settings → Connectors → Add custom connector**), ChatGPT, or Cursor:

```
https://opentax.invaro.ai/mcp
```

## Or run it locally (stdio)

```bash
claude mcp add opentax -- npx -y @invaro/opentax
```

Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "opentax": { "command": "npx", "args": ["-y", "@invaro/opentax"] }
  }
}
```

The same binary is also the full CLI and the self-hostable connector:

```bash
npx -y @invaro/opentax eval --status mfj --wages 120000 --kids 2   # terminal CLI
npx -y @invaro/opentax check --wages 120000 --expect 5746          # verify a claimed number
npx -y @invaro/opentax lookup standard deduction                   # citations behind an amount
npx -y @invaro/opentax mcp-http                                    # self-host /mcp on $PORT
```

One package: run with no arguments from an MCP client and it's the stdio server; give it a command and it's the CLI.

## Tools

| Tool | What it does |
|---|---|
| `calculate_tax` | Any federal target (net tax, AGI, EITC, AMT, SE tax, …) from typed facts |
| `compute_return` | The full Form 1040 line set from raw document transcriptions (W-2s, 1099-Rs, SSA-1099s) |
| `compute_state_return` | IL-1040, VA 760, CA 540, NY IT-201 printed-form line sets |
| `verify_tax_claim` | Gate a claimed number before presenting it: verified / refuted, with the difference |
| `find_tax_cliffs` | Exact-cent benefit cliffs over an income range |
| `compare_filing_statuses` | The same facts across all five filing statuses |
| `list_input_facts`, `explain_rule`, `lookup_tax_parameter` | Discover inputs; read any rule's citation, formula, and validity window |
| `calculate_business_tax`, `calculate_fiduciary_tax`, `determine_dependent`, `verify_fact`, `is_tipped_occupation` | Form 1120, Form 1041, § 152 dependency, proofs, § 224 tips |

## What "verifiable" means

Every computation returns its **assumptions** (documented defaults it relied on), **citations** (statute source, section, URL on every rule), and a **content hash** of the exact rule corpus used (tax years 2025 and 2026, kept current — e.g. OBBBA amounts, state 2025 legislation). Answers are derivation trees you can re-execute, not model output.

The engine refuses rather than guesses: missing facts are named, uncovered situations return "not covered," and dates outside a rule's validity window are errors — never silent fallbacks to a stale year.

