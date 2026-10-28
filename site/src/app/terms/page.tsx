import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "API terms | OpenTax by Invaro",
  description: "Terms for the hosted OpenTax API and MCP endpoint: what the free plan covers and when a paid license is needed.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="container py-14 md:py-20">
        <article className="max-w-[760px] docs-prose">
          <div className="kicker">effective october 26, 2026</div>
          <h1>Hosted API terms</h1>
          <p className="lede">
            These terms cover the hosted API at opentax.invaro.ai: the REST endpoints, the MCP endpoint and API keys
            from the console. Running the code yourself is covered by the{" "}
            <Link href="https://github.com/Invaro/opentax-engine/blob/main/LICENSE">Business Source License</Link>{" "}
            instead.
          </p>

          <h2>1. The free plan</h2>
          <p>Calls without a key, and keys on the free plan, may be used for:</p>
          <ul>
            <li>evaluating OpenTax, and developing and testing software that uses it;</li>
            <li>an individual&apos;s own use;</li>
            <li>a company or firm&apos;s internal use by its own staff, including work for its clients;</li>
            <li>non-commercial teaching and research, and non-profits giving free tax help to the public.</li>
          </ul>

          <h2>2. Products for other people need a license</h2>
          <p>
            Any product, service or AI agent tool that calls the API for people outside your company, paid or free,
            needs an <Link href="/pricing">embedding license</Link>.
          </p>

          <h2>3. Limits and keys</h2>
          <p>
            Free calls are rate limited: 600 requests an hour without a key, 6,000 with one. We may lower limits or
            disable keys that are abused or used outside these terms. We will email the key&apos;s owner first unless the
            abuse is ongoing.
          </p>

          <h2>4. Data</h2>
          <p>
            Tax facts are computed in memory and not stored. What we record about each call is listed on the{" "}
            <Link href="/privacy">privacy page</Link>.
          </p>

          <h2>5. No warranty</h2>
          <p>
            The free API is provided as is, without uptime or support commitments, and its results are not tax advice.
            You are responsible for checking results before relying on them. Invaro&apos;s liability for the free API is
            limited to $100.
          </p>

          <h2>6. Changes</h2>
          <p>
            We may update these terms. Material changes are posted here at least 30 days before they take effect.
            Questions: <a href="mailto:founders@invaro.ai">founders@invaro.ai</a>.
          </p>
        </article>
      </div>
    </main>
  );
}
