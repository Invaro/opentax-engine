import type { Metadata } from "next";
import Link from "next/link";
import { InvaroLogo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Privacy | OpenTax by Invaro",
  description:
    "What OpenTax collects (very little), what it never collects (your tax data), and how to opt out or delete everything.",
};

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="font-mono text-[10px] text-muted-foreground mb-3">{label}</div>
      <h2 className="text-xl md:text-2xl font-serif mb-3">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-50 bg-background/85 backdrop-blur-sm border-b border-border">
        <div className="container flex items-center justify-between h-14">
          <Link href="/" aria-label="OpenTax home" className="flex items-center gap-2.5">
            <InvaroLogo size={15} />
            <span className="font-mono text-[15px] tracking-tight leading-none">opentax</span>
          </Link>
          <Link href="/" className="font-mono text-xs text-muted-foreground hover:text-foreground">
            ← back
          </Link>
        </div>
      </header>

      <div className="container max-w-[680px] py-16 md:py-24">
        <h1 className="text-[32px] md:text-[48px] font-serif leading-tight mb-3">Privacy</h1>
        <p className="font-mono text-[10px] text-muted-foreground mb-12">
          effective july 2026 · the source that implements this page is public:{" "}
          <Link
            href="https://github.com/Invaro/opentax-engine"
            className="underline underline-offset-2 hover:text-foreground"
          >
            audit it
          </Link>
        </p>

        <Section label="00" title="The short version">
          <p>
            We collect very little. No ad pixels, no fingerprinting, no cross-site tracking, no
            selling or sharing data, ever. Your tax facts are computed and returned, never stored.
            The site runs one product-analytics tool (PostHog, disclosed fully below) that honors
            your browser&apos;s Do&nbsp;Not&nbsp;Track setting. The only personal data we ever hold
            is an email address you explicitly gave us, and you can delete it with one message.
          </p>
        </Section>

        <Section label="01" title="This website">
          <p>
            We use PostHog for product analytics: page views, anonymous usage events (clicks and
            form submissions on this site only), and session replays in which{" "}
            <em>every input field is masked</em>, so nothing you type is recorded. Profiles stay
            anonymous unless you identify yourself (e.g., by signing up). If your browser sends
            Do&nbsp;Not&nbsp;Track, analytics is disabled entirely. PostHog stores a device
            identifier in your browser to tell visits apart; your light/dark preference is kept in
            local storage and never leaves it. Our hosting provider (Vercel) keeps standard,
            short-lived request logs, as every host does.
          </p>
        </Section>

        <Section label="02" title="Email updates">
          <p>
            If you sign up for updates (on the site, or via <code className="font-mono text-xs">opentax signup</code>),
            we store exactly three things: your email address, when you signed up, and where the
            signup came from (site or CLI). Signup is double opt-in, and the confirmation link expires
            in 48 hours, and if you never confirm, you are never emailed. Application logs record a
            one-way hash of the address, not the address itself.
          </p>
          <p>
            We never sell, share, or enrich the list. Unsubscribe or request deletion any time:{" "}
            <a href="mailto:founders@invaro.ai" className="underline underline-offset-2 hover:text-foreground">
              founders@invaro.ai
            </a>{" "}
            and everything tied to your address is removed.
          </p>
        </Section>

        <Section label="03" title="CLI and MCP telemetry">
          <p>
            The published CLI and MCP server send one anonymous usage ping: an event name
            (&quot;cli&quot;, &quot;mcp-stdio&quot;, or &quot;mcp-http&quot;), the package version, the operating
            system name, and the Node major version. Nothing else: no arguments, no tax data, no
            identifiers, no IP retention. The first run prints a notice saying exactly this.
          </p>
          <p>
            Opt out with <code className="font-mono text-xs">OPENTAX_TELEMETRY=0</code> or{" "}
            <code className="font-mono text-xs">DO_NOT_TRACK=1</code>.
          </p>
        </Section>

        <Section label="04" title="The hosted connector">
          <p>
            The hosted MCP endpoint (<code className="font-mono text-xs">opentax.invaro.ai/mcp</code>) is
            stateless: the tax facts in your request are computed in memory and the answer is
            returned. It is not stored, logged, or used for anything else. For usage metering we
            record only the JSON-RPC method name, the tool name, the connecting client&apos;s
            self-reported name and version, and a timestamp. IP addresses are used transiently in
            memory for rate limiting and are not written to our storage.
          </p>
          <p>
            Don&apos;t want to trust that? The engine is AGPL, so run{" "}
            <code className="font-mono text-xs">npx -y @invaro/opentax</code> locally or self-host the
            HTTP server, and nothing touches our infrastructure at all.
          </p>
        </Section>

        <Section label="05" title="Questions">
          <p>
            <a href="mailto:founders@invaro.ai" className="underline underline-offset-2 hover:text-foreground">
              founders@invaro.ai
            </a>{" "}
            reaches a human.
          </p>
        </Section>
      </div>

      <footer className="border-t border-border">
        <div className="container flex items-center justify-between py-6 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center space-x-2">
            <InvaroLogo size={14} />
            <span>© {new Date().getFullYear()} Invaro Inc.</span>
          </span>
          <Link href="/" className="hover:text-foreground">
            opentax.invaro.ai
          </Link>
        </div>
      </footer>
    </main>
  );
}
