import Image from "next/image";
import Link from "next/link";
import { InvaroLogo } from "@/components/logo";
import { KeysNav } from "@/components/keys-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { CopyButton } from "@/components/copy-button";
import { EmailCapture } from "@/components/email-capture";
import { ConnectTabs } from "@/components/connect-tabs";
import { GithubStars, SourceButton, OpenSourceProof } from "@/components/github-stars";
import {
  ClaudeMark,
  CopilotMark,
  CursorMark,
  GeminiMark,
  GitHubMark,
  LangChainMark,
  McpMark,
  N8nMark,
  NpmMark,
  OllamaMark,
  OpenAIMark,
  PerplexityMark,
  RaycastMark,
  WindsurfMark,
  ZapierMark,
  ZedMark,
} from "@/components/brand-icons";

const MCP_URL = "https://opentax.invaro.ai/mcp";

const benchmark = [
  { label: "Claude Sonnet + OpenTax MCP", pct: 96, ours: true, brand: "claude" as const },
  { label: "GPT-5.6 Sol + web search", pct: 58, brand: "openai" as const },
  { label: "GPT-5.5 + web search", pct: 54, brand: "openai" as const },
  { label: "Claude Fable 5 + web search", pct: 34, brand: "claude" as const },
  { label: "Claude Sonnet, unaided", pct: 6, brand: "claude" as const },
];

function ModelMark({ brand, active }: { brand: "claude" | "openai"; active?: boolean }) {
  return (
    <span
      className={
        active ? "shrink-0" : "shrink-0 opacity-50 [filter:grayscale(1)]"
      }
    >
      {brand === "claude" ? <ClaudeMark size={14} /> : <OpenAIMark size={14} />}
    </span>
  );
}

const useCases = [
  {
    tag: "tax & accounting firms",
    title: "Check every return against a second calculation",
    body: "Connect OpenTax to Claude and give it the client's W-2s, 1099s and the draft from your software. It recomputes every line of the 1040 and flags each one that doesn't match, with the law it's based on.",
    prompt:
      "Here's the Hendersons' W-2 and the draft 1040 from our software. Recompute every line and flag anything that doesn't match. Citation for each flag.",
  },
  {
    tag: "freelancer & S-corp clients",
    title: "Quarterly estimates when income comes in unevenly",
    body: "The safe harbors (100% or 110% of last year's tax) and the annualized installment worksheet are both built in. If a client has a big third quarter, OpenTax works out the payment that avoids the penalty.",
    prompt:
      "Client draws a $60k salary and just booked a $180k Q3 licensing windfall. Compute the annualized Q3 estimate and show the safe-harbor comparison.",
  },
  {
    tag: "advisory engagements",
    title: "S-corp elections, worked out to the cent",
    body: "Compare a sole proprietorship with an S-corp paying a reasonable salary: self-employment tax against payroll taxes, the QBI deduction under its wage limit, and the total federal difference, in one call.",
    prompt:
      "Sole prop, $220k net. Model an S-corp election at a $110k salary: SE vs payroll tax, QBI under the wage limit, total federal delta, cited.",
  },
  {
    tag: "financial planners",
    title: "Find the cliffs before your client hits one",
    body: "Vary any input across a range, like an IRA withdrawal, and OpenTax reports every point where one more dollar costs more than a dollar of tax: Social Security becoming taxable, the senior deduction phasing out, the 2026 premium credit cliff, the EITC investment income limit.",
    prompt:
      "Sweep an IRA withdrawal from $0 to $80k for this 67-year-old couple. Chart the true marginal rate, flag every cliff, then find the sweet spot.",
  },
  {
    tag: "every client meeting in 2026",
    title: "What the new law changes for each client",
    body: "Every rule knows the dates it applies, so the same facts can run under 2025 law and 2026 law: the tips and overtime deductions, the senior deduction, car loan interest, charity for people who don't itemize, and the SALT phase-down.",
    prompt:
      "Run the Alvarez file under 2025 law, then 2026 law. Draft the client letter: what changes, by how much, and which OBBBA section did it.",
  },
  {
    tag: "review & audit trail",
    title: "Numbers you can put in the workpapers",
    body: "Every answer comes with a proof: the facts, each rule and its citation, and every step of arithmetic. Anyone can check it offline, months later. When a situation isn't covered, OpenTax says so instead of guessing.",
    prompt:
      "Recompute Schedule 8812 for the review file and attach the proof artifact. I want every step re-derivable at audit time.",
  },
];

const featureIcons: Record<string, React.ReactNode> = {
  "01": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  "02": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  "03": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" />
      <path d="M3 9h18M8 4v5" />
      <path d="M7 14h4M7 17h7" />
    </svg>
  ),
  "04": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2Z" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
  "05": (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 3-6 2v16l6-2 6 2 6-2V3l-6 2-6-2Z" />
      <path d="M9 3v16M15 5v16" />
    </svg>
  ),
};

const features = [
  {
    k: "01",
    title: "Every rule cites the law",
    body: "Each rule carries its code section, the dates it applies, and the exact text it comes from. No number comes from a model's memory.",
  },
  {
    k: "02",
    title: "Every answer has a proof",
    body: "The proof records the facts, the rules and the arithmetic behind an answer. You can check it offline, without trusting us.",
  },
  {
    k: "03",
    title: "Works from the forms",
    body: "Give it the boxes from W-2s and 1099s and the family's birth dates. It works out ages, who counts as a dependent, penalties and excess withholding from those.",
  },
  {
    k: "04",
    title: "Says when it can't answer",
    body: "When a situation isn't covered, OpenTax refuses and says why, instead of returning a number that looks right and isn't.",
  },
  {
    k: "05",
    title: "Federal and state",
    body: "Forms 1040, 1120 and 1041, each line by line in one call. Full returns for 31 states, flat calculations for 10 more, and the nine states with no income tax.",
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

function Divider() {
  return (
    <div className="container">
      <div className="h-px w-full border-t border-border" />
    </div>
  );
}

const heroClients = [
  { name: "Claude", icon: <ClaudeMark size={18} /> },
  { name: "ChatGPT", icon: <OpenAIMark size={18} /> },
  { name: "Cursor", icon: <CursorMark size={18} /> },
  { name: "GitHub Copilot", icon: <CopilotMark size={18} /> },
  { name: "Gemini", icon: <GeminiMark size={18} /> },
  { name: "Perplexity", icon: <PerplexityMark size={18} /> },
  { name: "Windsurf", icon: <WindsurfMark size={18} /> },
  { name: "Zed", icon: <ZedMark size={18} /> },
  { name: "Raycast", icon: <RaycastMark size={18} /> },
];

const marqueeRowA = [
  { name: "Claude", icon: <ClaudeMark size={13} /> },
  { name: "ChatGPT", icon: <OpenAIMark size={13} /> },
  { name: "Gemini", icon: <GeminiMark size={13} /> },
  { name: "Perplexity", icon: <PerplexityMark size={13} /> },
  { name: "Claude Code", icon: <ClaudeMark size={13} /> },
  { name: "GitHub Copilot", icon: <CopilotMark size={13} /> },
  { name: "Gemini CLI", icon: <GeminiMark size={13} /> },
  { name: "LibreChat" },
  { name: "Goose" },
  { name: "OpenCode" },
  { name: "Msty" },
  { name: "Ollama", icon: <OllamaMark size={13} /> },
];

const marqueeRowB = [
  { name: "Cursor", icon: <CursorMark size={13} /> },
  { name: "Windsurf", icon: <WindsurfMark size={13} /> },
  { name: "Zed", icon: <ZedMark size={13} /> },
  { name: "VS Code" },
  { name: "Cline" },
  { name: "Continue" },
  { name: "Raycast", icon: <RaycastMark size={13} /> },
  { name: "LangChain", icon: <LangChainMark size={13} /> },
  { name: "n8n", icon: <N8nMark size={13} /> },
  { name: "Zapier", icon: <ZapierMark size={13} /> },
  { name: "Make" },
  { name: "Vercel AI SDK" },
];

function MarqueeRow({
  items,
  direction,
}: {
  items: Array<{ name: string; icon?: React.ReactNode }>;
  direction: "left" | "right";
}) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
      <div
        className={`flex w-max items-center gap-3 py-1.5 hover:[animation-play-state:paused] ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
      >
        {doubled.map((c, i) => (
          <span
            key={`${c.name}-${i}`}
            className="flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
          >
            {c.icon ? (
              <span className="[filter:grayscale(1)] opacity-70">{c.icon}</span>
            ) : null}
            {c.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen">
      {/* header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background-semi-transparent">
        <div className="container relative flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label="OpenTax home" className="flex items-center gap-2.5">
              <InvaroLogo size={15} />
              <span className="text-[15px] tracking-tight leading-none">opentax</span>
            </Link>
            <span className="hidden sm:block w-px h-3.5 bg-border mx-0.5" />
            <Link
              href="https://invaro.ai"
              className="hidden sm:block text-xs text-muted-foreground leading-none hover:text-foreground transition-colors whitespace-nowrap"
            >
              by Invaro
            </Link>
          </div>
          <KeysNav />
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="sm:hidden text-xs text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <nav aria-label="Site" className="hidden sm:flex lg:hidden items-center gap-4 text-xs">
              {[
                ["Docs", "/docs"],
                ["Pricing", "/pricing"],
                ["Changelog", "/changelog"],
              ].map(([label, href]) => (
                <Link key={href} href={href} className="text-muted-foreground hover:text-foreground transition-colors">
                  {label}
                </Link>
              ))}
            </nav>
            <ThemeToggle />
            <GithubStars />
            <Link
              href="#install"
              className="h-8 px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center whitespace-nowrap"
            >
              Install
            </Link>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden pt-[60px] lg:pt-[120px]">
        <div className="container relative flex flex-col items-center text-center">
          <Link
            href="#benchmark"
            className="animate-fade-blur-in rounded-full border border-border flex space-x-2 items-center px-3.5 py-1.5 mb-8 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <span className="whitespace-nowrap">96% on TaxCalcBench, the highest score recorded</span>
            <Arrow />
          </Link>

          <h1
            className="animate-fade-blur-in font-serif font-normal text-[40px] md:text-6xl xl:text-7xl leading-[1.1] tracking-tight mb-6"
            style={{ animationDelay: "80ms" }}
          >
            Exact US tax calculations
            <br />
            <em className="not-italic text-muted-foreground">for any agent</em>
          </h1>

          <p
            className="animate-fade-blur-in text-sm md:text-base lg:text-lg leading-relaxed text-muted-foreground max-w-[640px] mb-10"
            style={{ animationDelay: "160ms" }}
          >
            AI models read tax documents well and do tax math badly. OpenTax does the math for
            them: the same facts always give the same return, and every line points to the law
            behind it. With OpenTax, Claude Sonnet gets{" "}
            <span className="text-foreground">96% of TaxCalcBench returns exactly right</span>, the
            highest score recorded.
          </p>

          <div
            className="animate-fade-blur-in flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto px-6 sm:px-0"
            style={{ animationDelay: "240ms" }}
          >
            <SourceButton />
            <Link
              href="#install"
              className="h-11 px-6 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center whitespace-nowrap"
            >
              Install
            </Link>
          </div>

          <div
            className="animate-fade-blur-in mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-4"
            style={{ animationDelay: "320ms" }}
          >
            {heroClients.map((c) => (
              <span
                key={c.name}
                title={c.name}
                className="opacity-40 [filter:grayscale(1)] transition-all duration-200 hover:opacity-100 hover:[filter:none]"
              >
                {c.icon}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* the three claims */}
      <section className="container mt-16 md:mt-24">
        <div className="max-w-[780px] mx-auto grid md:grid-cols-3 border-t border-l border-border">
          {[
            {
              t: "Same answer every time",
              d: "The same facts always produce the same return. It's rules and exact arithmetic, not a model's best guess.",
            },
            {
              t: "Source on GitHub",
              d: "Every rule and every test is public, so you can read exactly how any number was reached.",
            },
            {
              t: "Highest benchmark score",
              d: "96% of TaxCalcBench returns exactly right. No model or engine has scored higher.",
            },
          ].map((c) => (
            <div
              key={c.t}
              className="border-b border-r border-border p-6 md:p-7 text-center md:text-left transition-colors hover:bg-accent/40"
            >
              <div className="font-serif text-xl md:text-2xl mb-2">{c.t}</div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* benchmark */}
      <section
        id="benchmark"
        className="relative overflow-hidden mt-28 md:mt-44 py-12 md:py-16 scroll-mt-20"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Image
            src="/dither-coast.jpg"
            alt=""
            fill
            quality={90}
            sizes="100vw"
            className="object-cover opacity-50 dark:opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/25 to-background" />
        </div>
        <div className="container relative flex flex-col items-center text-center mb-12">
          <h2 className="font-serif text-3xl md:text-5xl leading-tight tracking-tight mb-4">
            The same model goes
            <br />
            <em className="not-italic text-muted-foreground">from 6% to 96%</em>
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground max-w-[620px]">
            <Link
              href="https://github.com/column-tax/tax-calc-bench"
              className="underline underline-offset-4 hover:text-foreground"
            >
              TaxCalcBench
            </Link>
            {" "}asks a model to prepare 50 complete US tax returns, and a return only counts if
            every line is exact. Claude Sonnet on its own gets 6% right.{" "}
            <span className="text-foreground">The same Sonnet using OpenTax gets 96%</span>, more
            than any model tested, with or without web search.
          </p>
        </div>

        <div className="container relative">
          <div className="max-w-[780px] mx-auto">
            {/* the transformation: before → connect → after */}
            <div className="border border-border bg-card p-6 md:p-10">
              <div>
                <div className="flex items-end justify-between gap-4 mb-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      before
                    </div>
                    <div className="flex items-center gap-2 text-sm md:text-base text-muted-foreground">
                      <ModelMark brand="claude" />
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
                <div className="text-[10px] text-muted-foreground mt-2">
                  one URL, nothing else changes
                </div>
              </div>

              <div>
                <div className="flex items-end justify-between gap-4 mb-2.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      after
                    </div>
                    <div className="flex items-center gap-2 text-sm md:text-base">
                      <ModelMark brand="claude" active />
                      the <span className="underline underline-offset-4">same</span> Sonnet, same
                      prompts, with the engine
                    </div>
                  </div>
                  <div className="font-serif text-[40px] md:text-[64px] leading-none">96%</div>
                </div>
                <div className="h-[6px] bg-muted">
                  <div className="h-full bg-foreground" style={{ width: "96%" }} />
                </div>
              </div>
            </div>

            {/* bars */}
            <div className="border-l border-r border-b border-border bg-background p-6 md:p-8">
              <div className="flex items-baseline justify-between gap-3 mb-5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  correct returns · TaxCalcBench TY25
                </span>
                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-green-600/20 bg-green-600/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-400">
                  highest score ever recorded
                </span>
              </div>
              <div className="space-y-4">
                {benchmark.map((b) => (
                  <div key={b.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`flex items-center gap-2 text-xs md:text-sm ${
                          b.ours ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <ModelMark brand={b.brand} active={b.ours} />
                        {b.label}
                      </span>
                      <span
                        className={`text-xs md:text-sm tabular-nums ${
                          b.ours ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {b.pct}%
                      </span>
                    </div>
                    <div className="h-[6px] bg-muted">
                      <div
                        className={b.ours ? "h-full bg-foreground" : "h-full bg-muted-foreground/70"}
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* stat tiles */}
            <div className="grid grid-cols-3 border-l border-r border-b border-border bg-background">
              {[
                { n: "48/50", d: "returns exact to the dollar" },
                { n: "98.2%", d: "of all 820 scored lines exact" },
                { n: "16×", d: "better than the same model alone" },
              ].map((s) => (
                <div
                  key={s.n}
                  className="border-r last:border-r-0 border-border p-4 md:p-6 text-center"
                >
                  <div className="font-serif text-2xl md:text-4xl mb-1">{s.n}</div>
                  <div className="text-[10px] md:text-xs text-muted-foreground leading-relaxed">
                    {s.d}
                  </div>
                </div>
              ))}
            </div>

            {/* the other two */}
            <div className="border-l border-r border-b border-t border-border bg-background p-6 md:p-8">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                the two it missed
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Both reference returns have worksheets that don&apos;t match their own inputs, and
                no published model run gets them right either.{" "}
                <Link
                  href="https://github.com/column-tax/tax-calc-bench/issues/96"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  We reported it to the benchmark&apos;s maintainers
                </Link>
                .
              </p>
            </div>

            <p className="mx-auto mt-6 max-w-[620px] text-center text-[10px] md:text-xs text-muted-foreground/80 leading-relaxed">
              methodology: TaxCalcBench TY25 by column-tax, 50 returns, strict scoring (every line
              exact) · scored with the benchmark&apos;s own evaluator against its reference
              returns · leaderboard rows from its published July 2026 results · agent runs cold,
              pass@1
            </p>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="container mt-28 md:mt-44 scroll-mt-20">
        <div className="grid md:grid-cols-3 border-t border-l border-border">
          {features.map((f) => (
            <div
              key={f.k}
              className={`border-b border-r border-border p-6 md:p-8 transition-colors hover:bg-accent/40 ${
                f.k === "05" ? "md:col-span-2" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex h-10 w-10 items-center justify-center border border-border bg-accent text-muted-foreground">
                  {featureIcons[f.k]}
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.k}
                </span>
              </div>
              <h3 className="text-base md:text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* use cases */}
      <section id="usecases" className="container mt-28 md:mt-44 scroll-mt-20">
        <div className="flex flex-col items-center text-center mb-10">
          <h2 className="font-serif text-3xl md:text-5xl leading-tight tracking-tight mb-4">
            What firms <em className="not-italic text-muted-foreground">use it for</em>
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground max-w-[620px]">
            OpenTax works under the agent you already use, like Claude, ChatGPT, Cursor or your own
            agent. The model reads the documents and writes the reply, and OpenTax does the math.
          </p>
        </div>

        <div className="grid md:grid-cols-2 border-t border-l border-border">
          {useCases.map((u) => (
            <div
              key={u.title}
              className="border-b border-r border-border p-6 md:p-8 flex flex-col transition-colors hover:bg-accent/40"
            >
              <span className="inline-flex self-start rounded-full border border-border bg-accent px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-4">
                {u.tag}
              </span>
              <h3 className="text-base md:text-lg mb-2">{u.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">{u.body}</p>
              <div className="mt-auto">
                <div className="text-[10px] text-muted-foreground mb-1.5">
                  what you&apos;d ask
                </div>
                <blockquote className="bg-accent border border-border px-4 py-3 font-mono text-[11px] leading-relaxed">
                  &ldquo;{u.prompt}&rdquo;
                </blockquote>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground max-w-[720px] mx-auto leading-relaxed">
          It can look things up too. <code className="font-mono">search_tax_rules</code> finds a rule
          by keyword, <code className="font-mono">lookup_tax_parameter</code> gives the dollar
          amounts with citations, and <code className="font-mono">verify_fact</code> tells you whether
          a figure is right. If nothing matches, the law isn&apos;t covered yet. The same engine runs
          as a command line tool and as a TypeScript library in the browser.
        </p>
      </section>

      {/* clients marquee */}
      <section className="mt-28 md:mt-44">
        <div className="container flex flex-col items-center text-center mb-10">
          <h2 className="font-serif text-3xl md:text-5xl leading-tight tracking-tight mb-4">
            Works with <em className="not-italic text-muted-foreground">what you already use</em>
          </h2>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground max-w-[560px]">
            Anything that supports MCP can use OpenTax: chat assistants, code editors, agents and
            automation tools.
          </p>
        </div>
        <div className="mx-auto max-w-[1100px] space-y-3 px-4">
          <MarqueeRow items={marqueeRowA} direction="left" />
          <MarqueeRow items={marqueeRowB} direction="right" />
        </div>
      </section>

      {/* install */}
      <section id="install" className="relative overflow-hidden mt-28 md:mt-44 py-12 md:py-16 scroll-mt-12">
        <div className="container relative">
          <div className="flex flex-col items-center text-center mb-10">
            <h2 className="font-serif text-3xl md:text-5xl leading-tight tracking-tight mb-4">
              Add OpenTax <em className="not-italic text-muted-foreground">to your agent</em>
            </h2>
            <p className="text-sm md:text-base leading-relaxed text-muted-foreground max-w-[560px]">
              Paste this URL into any app that supports MCP. We host it, and you can try it
              without an account.
            </p>
          </div>

          <div className="max-w-[780px] mx-auto">
            {/* the URL */}
            <div className="border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <McpMark size={12} />
                  hosted connector · streamable http
                </span>
                <span className="text-[10px] text-muted-foreground">stateless</span>
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
                  <span className="text-sm">Run it locally</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  One package with the MCP server, the command line tool and an HTTP server.
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
                  <span className="text-sm">Source and listings</span>
                </div>
                <div className="text-xs text-muted-foreground mb-3">
                  Business Source License. Listed in the official MCP registry as io.github.Invaro/opentax.
                </div>
                <div className="flex flex-col gap-1.5">
                  <Link
                    href="https://github.com/Invaro/opentax-engine"
                    className="font-mono text-[11px] underline underline-offset-4 text-muted-foreground hover:text-foreground"
                  >
                    github.com/Invaro/opentax-engine
                  </Link>
                  <Link
                    href="https://www.npmjs.com/package/@invaro/opentax"
                    className="font-mono text-[11px] underline underline-offset-4 text-muted-foreground hover:text-foreground"
                  >
                    npmjs.com/package/@invaro/opentax
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* public source */}
      <section id="source" className="container mt-28 md:mt-44 scroll-mt-20">
        <div className="max-w-[780px] mx-auto">
          <OpenSourceProof />
        </div>
      </section>

      {/* closing */}
      <section id="connect" className="container mt-28 md:mt-44 scroll-mt-20">
        <div className="relative mx-auto max-w-[1100px] overflow-hidden border border-border">
          <Image
            src="/dither-shore.png"
            alt=""
            fill
            quality={90}
            sizes="(max-width: 1148px) 100vw, 1100px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/30 to-black/15" />
          <div className="relative flex flex-col items-center px-6 py-24 text-center md:py-36">
            <h2 className="mb-6 font-serif text-3xl leading-tight tracking-tight text-white md:text-6xl">
              Try it on <em className="not-italic text-white/70">a real return</em>
            </h2>
            <p className="mb-8 max-w-[560px] text-sm leading-relaxed text-white/80 md:text-base">
              Add the connector, give your agent a return you&apos;ve already filed, and compare every
              line. Each one comes back cited and rounded the way the form rounds.
            </p>
            <div className="flex w-full flex-col items-stretch gap-3 px-6 sm:w-auto sm:flex-row sm:items-center sm:gap-4 sm:px-0">
              <Link
                href="#install"
                className="flex h-11 items-center justify-center whitespace-nowrap bg-white px-6 text-sm font-medium text-neutral-900 transition-colors hover:bg-white/90"
              >
                Add the connector
              </Link>
              <Link
                href="https://cal.com/invaro/15min"
                className="flex h-11 items-center justify-center whitespace-nowrap border border-white/40 px-6 text-sm font-medium text-white transition-colors hover:border-white"
              >
                Talk to us
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <p className="text-[10px] text-muted-foreground">
            Or get an email when we ship something new. We confirm your address first.{" "}
            <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
              privacy
            </Link>
          </p>
          <EmailCapture />
        </div>
      </section>

      {/* footer */}
      <footer className="relative overflow-hidden border-t border-border">
        <div className="container py-14 sm:pb-56">
          <div className="flex flex-col lg:flex-row justify-between gap-10">
            <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:gap-16">
              <div>
                <h3 className="text-sm mb-4">Engine</h3>
                <ul className="space-y-2.5">
                  <li>
                    <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      api docs
                    </Link>
                  </li>
                  <li>
                    <Link href="/console" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      api console
                    </Link>
                  </li>
                  <li>
                    <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      pricing
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://github.com/Invaro/opentax-engine"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      github
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://www.npmjs.com/package/@invaro/opentax"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      npm
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://registry.modelcontextprotocol.io/v0.1/servers?search=opentax"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      mcp registry
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://github.com/column-tax/tax-calc-bench"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      the benchmark
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm mb-4">Company</h3>
                <ul className="space-y-2.5">
                  <li>
                    <Link
                      href="https://invaro.ai"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      invaro.ai
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="https://cal.com/invaro/15min"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      talk to us
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/changelog"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      changelog
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/privacy"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      privacy
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col items-start lg:items-end gap-6">
              <p className="text-xl">Exact US tax calculations for any agent.</p>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2 items-center justify-center">
                  <span className="absolute h-2 w-2 rounded-full bg-green-500 animate-[pulse-glow_2s_ease-in-out_infinite]" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-green-500" />
                </span>
                every line cited
              </span>
            </div>
          </div>

          <div className="mt-14 flex items-center gap-2 text-xs text-muted-foreground">
            <InvaroLogo size={13} />
            <span>© {new Date().getFullYear()} Invaro Inc.</span>
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-[42%] select-none text-center font-serif leading-none sm:block"
          style={{
            fontSize: "min(24vw, 340px)",
            color: "hsl(var(--secondary))",
            WebkitTextStroke: "1px hsl(var(--muted-foreground))",
          }}
        >
          opentax
        </div>
      </footer>
    </main>
  );
}
