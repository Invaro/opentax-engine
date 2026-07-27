import Link from "next/link";
import { InvaroLogo } from "@/components/logo";
import { KeysNav } from "@/components/keys-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyButton } from "@/components/copy-button";
import { EmailCapture } from "@/components/email-capture";
import { ConnectTabs } from "@/components/connect-tabs";
import { DitherField } from "@/components/dither-field";
import { DitherCanvas } from "@/components/dither-canvas";
import { GithubStars, SourceButton, OpenSourceProof } from "@/components/github-stars";
import { GitHubMark, McpMark, NpmMark } from "@/components/brand-icons";

const MCP_URL = "https://opentax.invaro.ai/mcp";

const benchmark = [
  { label: "Claude Sonnet + OpenTax MCP", pct: 96, ours: true },
  { label: "GPT-5.6 Sol + web search", pct: 58 },
  { label: "GPT-5.5 + web search", pct: 54 },
  { label: "Claude Fable 5 + web search", pct: 34 },
  { label: "Claude Sonnet, unaided", pct: 6 },
];

const useCases = [
  {
    tag: "tax & accounting firms",
    title: "Review every return with a second engine",
    body: "Connect OpenTax to Claude and drop in the client file: W-2 and 1099 boxes compile deterministically into facts, the full 1040 line set recomputes to the cent, and every line your software disagrees with gets flagged, with the statute attached.",
    prompt:
      "Here's the Hendersons' W-2 and the draft 1040 from our software. Recompute every line and flag anything that doesn't match. Citation for each flag.",
  },
  {
    tag: "freelancer & S-corp clients",
    title: "Quarterly estimates that survive lumpy income",
    body: "Safe-harbor prongs (100% / 110% of prior year) and the § 6654 annualized-installment worksheets are encoded rules, not vibes. Windfall in Q3? The engine computes the installment that actually avoids the penalty.",
    prompt:
      "Client draws a $60k salary and just booked a $180k Q3 licensing windfall. Compute the annualized Q3 estimate and show the safe-harbor comparison.",
  },
  {
    tag: "advisory engagements",
    title: "Entity elections, modeled to the cent",
    body: "S-corp election letters stop being hand-waves. Run sole-prop vs S-corp at a reasonable salary: SE tax versus payroll taxes, the QBI wage limit doing its thing, entity and personal pass in one call.",
    prompt:
      "Sole prop, $220k net. Model an S-corp election at a $110k salary: SE vs payroll tax, QBI under the wage limit, total federal delta, cited.",
  },
  {
    tag: "financial planners",
    title: "Find the cliffs before your client does",
    body: "The solver sweeps any input across a range and reports every cliff and kink on the way: Social Security taxability ramps, the senior-deduction phase-out, the 2026 premium-credit cliff, EITC's investment-income kill switch.",
    prompt:
      "Sweep an IRA withdrawal from $0 to $80k for this 67-year-old couple. Chart the true marginal rate, flag every cliff, then find the sweet spot.",
  },
  {
    tag: "every client meeting in 2026",
    title: "The OBBBA answer, ready before they ask",
    body: "The corpus is dated law, so the same facts derive under 2025 or 2026 rules: tips and overtime deductions, the senior deduction, car-loan interest, charity for non-itemizers, the SALT phase-down. The “what changes for me” letter writes itself.",
    prompt:
      "Run the Alvarez file under 2025 law, then 2026 law. Draft the client letter: what changes, by how much, and which OBBBA section did it.",
  },
  {
    tag: "review & audit trail",
    title: "Numbers you can staple to the workpapers",
    body: "Every computation ships a Merkle-rooted proof of the facts, rules, arithmetic, and citations, verifiable offline months later, byte for byte. And outside the corpus the engine refuses loudly instead of guessing: the failure mode that matters in this profession.",
    prompt:
      "Recompute Schedule 8812 for the review file and attach the proof artifact. I want every step re-derivable at audit time.",
  },
];

function Arrow() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={10} height={10} viewBox="0 0 12 12" fill="none">
      <path
        fill="currentColor"
        d="M8.783 6.667H.667V5.333h8.116L5.05 1.6 6 .667 11.333 6 6 11.333l-.95-.933 3.733-3.733Z"
      />
    </svg>
  );
}

const features = [
  {
    k: "01",
    title: "Cited, verbatim",
    body: "Every rule in the corpus carries its statute: 26 U.S.C. section, effective window, and a verbatim source excerpt. No number enters the engine on model recall.",
  },
  {
    k: "02",
    title: "Provable",
    body: "Every computation returns a Merkle-rooted proof: the facts, the rules, the arithmetic. Re-verify any answer offline, byte for byte.",
  },
  {
    k: "03",
    title: "Documents in, facts out",
    body: "A deterministic compiler turns W-2 and 1099 boxes plus birth dates into engine facts. Ages, dependent classifications, penalties, excess withholding, all with zero judgment calls.",
  },
  {
    k: "04",
    title: "Refuses loudly",
    body: "Anything outside the corpus refuses with a named reason instead of guessing. A wrong answer that looks right is the one failure mode we do not ship.",
  },
  {
    k: "05",
    title: "Federal + state",
    body: "Individual, corporate, and fiduciary: Forms 1040, 1120, and 1041, complete line sets in one call. State coverage across 29 states and growing, every line under the same citation discipline.",
  },
];

export default function Page() {
  return (
    <main className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-sm border-b border-border">
        <div className="container relative flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label="OpenTax home" className="flex items-center gap-2.5">
              <InvaroLogo size={15} />
              <span className="font-mono text-[15px] tracking-tight leading-none">opentax</span>
            </Link>
            <span className="hidden sm:block w-px h-3.5 bg-border mx-0.5" />
            <Link
              href="https://invaro.ai"
              className="hidden sm:block font-mono text-[10px] text-muted-foreground leading-none hover:text-foreground transition-colors whitespace-nowrap"
            >
              by Invaro
            </Link>
          </div>
          <KeysNav />
          <div className="flex items-center gap-3">
            <div className="border border-border rounded-full scale-90">
              <ThemeToggle />
            </div>
            <GithubStars />
            <Link
              href="#install"
              className="h-8 px-3.5 font-mono text-xs font-medium bg-foreground text-background hover:opacity-90 flex items-center whitespace-nowrap"
            >
              Install
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden pt-[60px] lg:pt-[120px]">
        <DitherField art="birds" tone="violet" placement="hero" />
        <div className="container relative flex flex-col items-center text-center">
          <Link
            href="#benchmark"
            className="rounded-full border border-border bg-background flex space-x-2 items-center px-4 py-2 text-sm font-medium mb-8 hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span className="font-mono text-[10px] md:text-xs whitespace-nowrap">
              The deterministic tax engine for AI agents
            </span>
            <Arrow />
          </Link>

          <h1 className="text-[44px] md:text-[96px] font-serif font-normal leading-[1.05] mb-6">
            Turn any AI into a
            <br />
            <span className="italic">precise tax preparer</span>
          </h1>

          <p className="text-sm md:text-lg text-muted-foreground max-w-[640px] mb-10">
            Language models are probabilistic. Tax law is not. OpenTax is a deterministic
            computation engine: the same facts produce the same return, every time, with every
            line traced to the statute that produced it. It is{" "}
            <span className="text-foreground font-semibold">
              the only open-source tax engine on the market
            </span>
            , and{" "}
            <span className="text-foreground font-semibold">
              the highest-scoring engine ever measured
            </span>{" "}
            against one.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto px-6 sm:px-0">
            <SourceButton />
            <Link
              href="#install"
              className="h-11 px-6 text-sm font-medium bg-foreground text-background hover:opacity-90 flex items-center justify-center whitespace-nowrap"
            >
              Install in 30 seconds
            </Link>
          </div>
        </div>
      </section>

      {/* the three claims */}
      <section className="container mt-16 md:mt-24">
        <div className="max-w-[780px] mx-auto grid md:grid-cols-3 border-t border-l border-border">
          {[
            {
              t: "Deterministic",
              d: "Same facts, same return, every single time. Rules and exact arithmetic, not sampling. Nothing an LLM can drift on.",
            },
            {
              t: "The only open-source one",
              d: "There is no other open-source tax engine on the market. AGPL-3.0, every rule and every test in public.",
            },
            {
              t: "The HIGHEST-scoring one",
              d: "96% exact returns on TaxCalcBench. No model, no engine, open or closed, has ever scored higher.",
            },
          ].map((c) => (
            <div key={c.t} className="border-b border-r border-border p-6 md:p-7 text-center md:text-left">
              <div className="font-serif text-xl md:text-2xl mb-2">{c.t}</div>
              <p className="font-mono text-[10px] md:text-[11px] text-muted-foreground leading-relaxed">
                {c.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* benchmark */}
      <section
        id="benchmark"
        className="relative overflow-hidden mt-24 md:mt-32 pt-12 md:pt-16 scroll-mt-20"
      >
        <DitherField art="smoke" tone="violet" placement="crown" />
        <div className="container relative flex flex-col items-center text-center mb-12">
          <h2 className="text-[32px] md:text-[56px] font-serif leading-tight mb-4">
            The model isn&apos;t the ceiling.
            <br />
            <span className="italic">The engine is.</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-[620px]">
            <Link
              href="https://github.com/column-tax/tax-calc-bench"
              className="underline underline-offset-2 hover:text-foreground"
            >
              TaxCalcBench
            </Link>
            , the industry benchmark for AI tax work, asks a model to prepare 50 complete US
            tax returns. A return only counts if every line is exact. Claude Sonnet on its own
            gets 6% of returns right.{" "}
            <span className="text-foreground font-semibold">
              The same Sonnet, using OpenTax, gets 96%. The highest score ever recorded
            </span>
            , above every top model, with or without web search. The engine amplifies whatever
            model you point at it.
          </p>
        </div>

        <div className="container relative">
        <div className="max-w-[780px] mx-auto">
          {/* the transformation: before → connect → after */}
          <div className="border border-border p-6 md:p-10">
            <div>
              <div className="flex items-end justify-between gap-4 mb-2.5">
                <div>
                  <div className="font-mono text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    before
                  </div>
                  <div className="text-sm md:text-base text-muted-foreground">
                    Claude Sonnet, on its own
                  </div>
                </div>
                <div className="font-serif text-[40px] md:text-[64px] leading-none text-muted-foreground/60">
                  6%
                </div>
              </div>
              <div className="h-[6px] bg-muted">
                <div className="h-full bg-muted-foreground/70" style={{ width: "6%" }} />
              </div>
            </div>

            <div className="flex flex-col items-center my-7 md:my-9">
              <div className="w-full flex items-center gap-3 md:gap-4">
                <span className="flex-1 border-t border-dashed border-border" />
                <span className="border border-foreground px-4 md:px-5 py-2 font-mono text-[10px] md:text-xs whitespace-nowrap">
                  + connect the OpenTax MCP
                </span>
                <span className="flex-1 border-t border-dashed border-border" />
              </div>
              <div className="font-mono text-[9px] md:text-[10px] text-muted-foreground mt-2">
                one URL, two minutes, nothing else changes
              </div>
            </div>

            <div>
              <div className="flex items-end justify-between gap-4 mb-2.5">
                <div>
                  <div className="font-mono text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    after
                  </div>
                  <div className="text-sm md:text-base">
                    the <span className="font-semibold">same</span> Sonnet, same prompts, with the
                    engine
                  </div>
                </div>
                <div className="font-serif text-[40px] md:text-[64px] leading-none text-brand">
                  96%
                </div>
              </div>
              <div className="h-[6px] bg-muted">
                <div className="h-full bg-brand" style={{ width: "96%" }} />
              </div>
            </div>
          </div>

          {/* bars */}
          <div className="border-l border-r border-b border-border p-6 md:p-8">
            <div className="flex items-baseline justify-between mb-5">
              <span className="font-mono text-[10px] text-muted-foreground">
                correct returns · TaxCalcBench TY25
              </span>
              <span className="font-mono text-[10px] font-bold text-brand">
                HIGHEST SCORE EVER RECORDED
              </span>
            </div>
            <div className="space-y-4">
              {benchmark.map((b) => (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span
                      className={`font-mono text-[10px] md:text-xs ${
                        b.ours ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {b.label}
                    </span>
                    <span
                      className={`font-mono text-[10px] md:text-xs tabular-nums ${
                        b.ours ? "text-brand font-medium" : "text-muted-foreground"
                      }`}
                    >
                      {b.pct}%
                    </span>
                  </div>
                  <div className="h-[6px] bg-muted">
                    <div
                      className={b.ours ? "h-full bg-brand" : "h-full bg-muted-foreground/70"}
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* stat tiles */}
          <div className="grid grid-cols-3 border-l border-r border-b border-border">
            {[
              { n: "48/50", d: "returns exact to the dollar" },
              { n: "98.2%", d: "of all 820 scored lines exact" },
              { n: "16×", d: "better than the same model alone" },
            ].map((s) => (
              <div key={s.n} className="border-r last:border-r-0 border-border p-4 md:p-6 text-center">
                <div className="font-serif text-2xl md:text-4xl mb-1">{s.n}</div>
                <div className="font-mono text-[9px] md:text-[10px] text-muted-foreground leading-relaxed">
                  {s.d}
                </div>
              </div>
            ))}
          </div>

          {/* the other two */}
          <div className="border-l border-r border-b border-t border-border p-6 md:p-8">
            <div className="font-mono text-[10px] text-muted-foreground mb-3">
              and the two misses?
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We traced both to reference returns whose worksheets are inconsistent with
              their own inputs. No published model run has matched those two cases
              either.{" "}
              <Link
                href="https://github.com/column-tax/tax-calc-bench/issues/96"
                className="underline underline-offset-2 hover:text-foreground"
              >
                We filed the bug upstream
              </Link>
              . An engine precise enough to audit the exam it&apos;s taking.
            </p>
          </div>

          <p className="font-mono text-[9px] md:text-[10px] text-muted-foreground mt-4 leading-relaxed">
            methodology: TaxCalcBench TY25 by column-tax, 50 returns, strict scoring (every line
            exact) · scored with the benchmark&apos;s own evaluator against its reference
            returns · leaderboard rows from its published July 2026 results · agent runs cold,
            pass@1
          </p>
        </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="container mt-24 md:mt-32 scroll-mt-20">
        <div className="grid md:grid-cols-3 border-t border-l border-border">
          {features.map((f) => (
            <div
              key={f.k}
              className={`border-b border-r border-border p-6 md:p-8 ${f.k === "05" ? "md:col-span-2" : ""}`}
            >
              <div className="font-mono text-[10px] text-muted-foreground mb-4">{f.k}</div>
              <h3 className="text-lg font-medium mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* use cases */}
      <section id="usecases" className="container mt-24 md:mt-32 scroll-mt-20">
        <div className="flex flex-col items-center text-center mb-10">
          <h2 className="text-[32px] md:text-[56px] font-serif leading-tight mb-4">
            What your agent <span className="italic">does with it</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-[620px]">
            OpenTax is the computation layer under whatever AI you already use: Claude, ChatGPT,
            Cursor, or your own agent. The model does the reading and the writing; the engine does
            the math. In practice:
          </p>
        </div>

        <div className="grid md:grid-cols-2 border-t border-l border-border">
          {useCases.map((u) => (
            <div key={u.title} className="border-b border-r border-border p-6 md:p-8 flex flex-col">
              <div className="font-mono text-[10px] text-muted-foreground mb-4">{u.tag}</div>
              <h3 className="text-lg font-medium mb-2">{u.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">{u.body}</p>
              <div className="mt-auto">
                <div className="font-mono text-[9px] text-muted-foreground mb-1.5">
                  → to your agent, verbatim
                </div>
                <blockquote className="bg-accent px-4 py-3 font-mono text-[11px] leading-relaxed">
                  &ldquo;{u.prompt}&rdquo;
                </blockquote>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-muted-foreground max-w-[720px] mx-auto">
          research is built in too: <code>search_tax_rules</code> finds the encoded law by keyword,{" "}
          <code>lookup_tax_parameter</code> returns the dollar amounts with citations, and{" "}
          <code>verify_fact</code> answers verified / refuted, and zero hits means &ldquo;outside the
          corpus&rdquo;, never a guess · same engine as a CLI (<code>opentax check --expect</code>{" "}
          for CI) and a TypeScript library that runs entirely in a browser tab
        </p>
      </section>

      {/* install */}
      <section
        id="install"
        className="relative overflow-hidden mt-24 md:mt-32 py-12 md:py-16 scroll-mt-12"
      >
        <DitherField art="smoke" tone="jade" placement="margins" />
        <div className="container relative">
        <div className="flex flex-col items-center text-center mb-10">
          <h2 className="text-[32px] md:text-[56px] font-serif leading-tight mb-4">
            One URL. <span className="italic">Any agent.</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-[560px]">
            Hosted, stateless, free to try. Paste the connector into anything that speaks MCP.
          </p>
        </div>

        <div className="max-w-[780px] mx-auto">
          {/* the URL */}
          <div className="border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <McpMark size={12} />
                hosted connector · streamable http
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">stateless</span>
            </div>
            <div className="p-5 md:p-6 flex items-center justify-center gap-3">
              <code className="font-mono text-sm md:text-lg break-all">{MCP_URL}</code>
              <CopyButton text={MCP_URL} />
            </div>
          </div>

          {/* per-client connect steps */}
          <ConnectTabs />

          {/* npm + registry row */}
          <div className="grid md:grid-cols-2 border-l border-border">
            <div className="border-b border-r border-border p-5 md:p-6 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-muted-foreground">
                  <NpmMark size={16} />
                </span>
                <span className="text-sm font-medium">Run it locally</span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground mb-3">
                one self-contained package: MCP server, CLI, and HTTP host in a single binary
              </div>
              <div className="flex items-stretch gap-1.5 mb-1.5 min-w-0">
                <code className="flex-1 min-w-0 block font-mono text-[10px] md:text-[11px] bg-accent px-3 py-2 overflow-x-auto whitespace-nowrap">
                  claude mcp add opentax -- npx -y @invaro/opentax
                </code>
                <CopyButton text="claude mcp add opentax -- npx -y @invaro/opentax" className="shrink-0" />
              </div>
              <div className="flex items-stretch gap-1.5 min-w-0">
                <code className="flex-1 min-w-0 block font-mono text-[10px] md:text-[11px] bg-accent px-3 py-2 overflow-x-auto whitespace-nowrap">
                  npx -y @invaro/opentax eval --status mfj --wages 120000 --kids 2
                </code>
                <CopyButton text="npx -y @invaro/opentax eval --status mfj --wages 120000 --kids 2" className="shrink-0" />
              </div>
            </div>
            <div className="border-b border-r border-border p-5 md:p-6">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="text-muted-foreground">
                  <GitHubMark size={16} />
                </span>
                <span className="text-sm font-medium">Open source, listed</span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground mb-3">
                AGPL-3.0 + commercial · on the official MCP registry as io.github.Invaro/opentax
              </div>
              <div className="flex flex-col gap-1.5">
                <Link
                  href="https://github.com/Invaro/opentax-engine"
                  className="font-mono text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                >
                  github.com/Invaro/opentax-engine
                </Link>
                <Link
                  href="https://www.npmjs.com/package/@invaro/opentax"
                  className="font-mono text-[11px] underline underline-offset-2 text-muted-foreground hover:text-foreground"
                >
                  npmjs.com/package/@invaro/opentax
                </Link>
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* open source */}
      <section id="source" className="container mt-24 md:mt-32 scroll-mt-20">
        <div className="max-w-[780px] mx-auto">
          <OpenSourceProof />
        </div>
      </section>

      {/* closing */}
      <section
        id="connect"
        className="relative overflow-hidden mt-24 md:mt-32 py-20 md:py-28 scroll-mt-20"
      >
        {/* the dither, computed live rather than baked */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.4]"
          style={{
            maskImage:
              "radial-gradient(62% 58% at 50% 50%, transparent 22%, #000 88%), linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(62% 58% at 50% 50%, transparent 22%, #000 88%), linear-gradient(to bottom, transparent 0%, #000 18%, #000 82%, transparent 100%)",
            maskComposite: "intersect",
            WebkitMaskComposite: "source-in",
          }}
        >
          <DitherCanvas color="#12866C" darkColor="#2FBF9E" speed={0.3} />
        </div>

        <div className="container relative flex flex-col items-center text-center">
          <h2 className="text-[32px] md:text-[64px] font-serif leading-tight mb-6">
            Give your model <span className="italic">the engine</span>
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-[560px] mb-8">
            One MCP server. Grouped facts in, the full scored line set out: cited, rounded the way
            the forms round, and provable.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto px-6 sm:px-0">
            <Link
              href="#install"
              className="h-11 px-6 text-sm font-medium bg-foreground text-background hover:opacity-90 flex items-center justify-center whitespace-nowrap"
            >
              Add the connector
            </Link>
            <Link
              href="https://cal.com/invaro/15min"
              className="border border-border h-11 px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground flex items-center justify-center whitespace-nowrap"
            >
              Talk to us
            </Link>
          </div>
          <div className="mt-10 flex flex-col items-center gap-2">
            <p className="font-mono text-[10px] text-muted-foreground">
              or get new features and other things worth knowing in your inbox · double opt-in ·{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                privacy
              </Link>
            </p>
            <EmailCapture />
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="container flex flex-col md:flex-row md:items-center justify-between gap-3 py-6 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center space-x-2">
            <InvaroLogo size={14} />
            <span>© {new Date().getFullYear()} Invaro Inc.</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="https://github.com/Invaro/opentax-engine" className="hover:text-foreground">github</Link>
            <Link href="https://www.npmjs.com/package/@invaro/opentax" className="hover:text-foreground">npm</Link>
            <Link href="https://registry.modelcontextprotocol.io/v0.1/servers?search=opentax" className="hover:text-foreground">mcp registry</Link>
            <Link href="https://github.com/column-tax/tax-calc-bench" className="hover:text-foreground">the benchmark</Link>
            <Link href="https://cal.com/invaro/15min" className="hover:text-foreground">talk to us</Link>
            <Link href="/privacy" className="hover:text-foreground">privacy</Link>
            <Link href="https://invaro.ai" className="hover:text-foreground">invaro.ai</Link>
          </span>
        </div>
      </footer>
    </main>
  );
}
