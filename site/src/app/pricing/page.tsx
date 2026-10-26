import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { FirmCheckout } from "@/components/firm-checkout";

export const metadata: Metadata = {
  title: "Pricing | OpenTax by Invaro",
  description:
    "The OpenTax Firm plan: answers from the engineers who build OpenTax, features built for your firm within two weeks, and early access. $9 per seat per month.",
};

const firmBenefits: Array<[string, string]> = [
  ["Support from the engineers who build OpenTax", "Email us about a calculation, a rule, your integration or running OpenTax on your own servers. You get a reply within 24 hours."],
  ["Filing-season priority", "From January through April, replies within 4 business hours instead of 24."],
  ["Features built for your firm", "Tell us what your practice needs: a form, a state, an API change. You get a delivery date in writing within two business days, and we ship it within two weeks."],
  ["Early access to new features", "Try new forms, states and tools before they are released to everyone, and shape how they work."],
  ["Team management", "Add and remove staff from your account. Everyone on your plan gets the same support."],
];

const faqs = [
  {
    q: "What counts as a seat?",
    a: "A person at your firm, employee or contractor, who uses something built on OpenTax. Servers, staging sites and the number of clients you serve don't count.",
  },
  {
    q: "Can we use it for client work?",
    a: "Yes. Projections, plans, reports and advice your staff produce with OpenTax are your work product. Giving clients their own login to run calculations needs an embedding license.",
  },
  {
    q: "Does any client data leave our machines?",
    a: "No. The library makes no network calls. You can run it with the network off.",
  },
  {
    q: "Can we pay yearly or by invoice?",
    a: "Yearly billing costs 11 months of the monthly price. For a purchase order or a signed order form, email founders@invaro.ai.",
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="pricing" />

      <div className="container py-14 md:py-20">
        <div className="max-w-[760px] mb-12 md:mb-16">
          <h1 className="font-serif text-[36px] md:text-[56px] leading-[1.05] tracking-tight mb-4">Pricing</h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-[640px]">
            The Firm plan is for firms that use OpenTax in their practice. You get answers from the engineers who build
            it, and the features you need, built on a date you can plan around.
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.4fr_1fr] gap-4 items-start">
          <section className="border border-border bg-card p-5 md:p-6">
            <div className="font-mono text-[10px] text-muted-foreground mb-4">community</div>
            <div className="font-serif text-4xl mb-6">$0</div>
            <ul className="text-sm text-muted-foreground space-y-2 mb-6">
              <li>Full source code</li>
              <li>Community support on GitHub</li>
              <li>No commercial products or resale</li>
            </ul>
            <Link
              href="https://github.com/Invaro/opentax-engine"
              className="h-10 flex items-center justify-center text-sm border border-border hover:bg-accent transition-colors"
            >
              View on GitHub
            </Link>
          </section>

          <section className="order-first lg:order-none border border-foreground bg-card p-5 md:p-6 lg:-mt-3">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] text-muted-foreground">firm plan</span>
              <span className="font-mono text-[10px] text-foreground">recommended for firms</span>
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-serif text-2xl text-muted-foreground line-through decoration-1">$19</span>
              <span className="font-serif text-4xl">$9</span>
              <span className="text-xs text-muted-foreground">per seat per month</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              <span className="line-through">$12</span> $5 per seat from 6 seats
            </p>
            <p className="text-xs leading-relaxed mb-6">
              Launch price for firms that join by January 31, 2027, kept for as long as you stay subscribed.
            </p>
            <ul className="space-y-4 mb-6">
              {firmBenefits.map(([title, body]) => (
                <li key={title} className="flex gap-2.5">
                  <span className="text-foreground mt-px" aria-hidden>
                    ✓
                  </span>
                  <div>
                    <div className="text-sm">{title}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-1">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <FirmCheckout />
            <p className="text-xs text-muted-foreground leading-relaxed mt-5 pt-5 border-t border-border">
              Your subscription also pays for the work on OpenTax: accurate tax and finance software that anyone can
              read and check.
            </p>
          </section>

          <section className="border border-border bg-card p-5 md:p-6">
            <div className="font-mono text-[10px] text-muted-foreground mb-4">embedding license</div>
            <div className="font-serif text-4xl mb-6">Custom</div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              For software that people outside your company use: tax products, client portals, APIs and AI agent
              tools. Hosted API with an SLA available.
            </p>
            <Link
              href="https://cal.com/invaro/15min"
              className="h-10 flex items-center justify-center text-sm border border-border hover:bg-accent transition-colors"
            >
              Book a call
            </Link>
          </section>
        </div>

        <section className="mt-16 md:mt-24 max-w-[760px]">
          <h2 className="font-serif text-2xl md:text-3xl mb-6">Questions</h2>
          <div className="border-t border-border">
            {faqs.map((f) => (
              <details key={f.q} className="group border-b border-border">
                <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none text-sm">
                  {f.q}
                  <span className="font-mono text-muted-foreground group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            Full terms:{" "}
            <Link href="/license" className="underline underline-offset-4 hover:text-foreground">
              Firm plan
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
