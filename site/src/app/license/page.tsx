import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Firm plan terms | OpenTax by Invaro",
  description:
    "Terms for the OpenTax Firm plan: support, feature delivery and early access for firms using OpenTax in their practice.",
};

const targets = [
  ["Support, first human reply", "within 24 hours; within 4 business hours from January through April"],
  ["New features", "early access before general release"],
  ["Feature request", "written ship date within 2 business days; delivered within 2 weeks"],
] as const;

export default function LicensePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="pricing" />
      <div className="container py-14 md:py-20">
        <article className="max-w-[760px] docs-prose">
          <div className="kicker">version 1.0 · effective october 26, 2026</div>
          <h1>OpenTax Firm plan terms</h1>
          <p className="lede">
            The Firm plan is a subscription from Invaro Inc. for firms that use OpenTax in their practice. It adds
            support, feature delivery and early access (section 7) to the{" "}
            <Link href="https://github.com/Invaro/opentax-engine/blob/main/LICENSE">Business Source License</Link>. Sign up on the{" "}
            <Link href="/pricing">pricing page</Link>; a signed order form, where there is one, takes precedence over
            this page.
          </p>

          <h2>1. Definitions</h2>
          <p>
            <strong>Software</strong> means the OpenTax engine published at github.com/Invaro/opentax-engine and every
            release we make available to you: the core, the federal and state corpora, the composers, the solver, the
            CLI and the MCP server. <strong>You</strong> means the firm named at checkout and anyone it controls.{" "}
            <strong>Authorized User</strong> means one of your employees or individual contractors working for you.{" "}
            <strong>Internal Use</strong> is defined in section 3.
          </p>

          <h2>2. What you may do</h2>
          <p>
            While your subscription is in force, Invaro grants you a non-exclusive, non-transferable, worldwide license
            to use, copy, modify and run the Software, and to combine it with your own software, for Internal Use. That
            includes:
          </p>
          <ul>
            <li>shipping the Software inside your closed-source applications to your Authorized Users&apos; browsers and devices;</li>
            <li>running it on servers you control or rent, including cloud and serverless hosts such as Vercel;</li>
            <li>running it in development, test and staging environments, including password-protected ones;</li>
            <li>keeping your modifications and applications private. You have no obligation to share any source code.</li>
          </ul>

          <h2>3. Internal Use, and what needs a different license</h2>
          <p>
            Internal Use is use by your Authorized Users for work your firm performs, including work for your clients.
            The results (projections, plans, reports, letters, advice, figures entered into other software) are your
            work product and you may give them to anyone.
          </p>
          <p>Internal Use does not include:</p>
          <ul>
            <li>selling, licensing or distributing the Software, or a product that contains it, to anyone outside your firm;</li>
            <li>giving people outside your firm, clients included, their own access to run calculations;</li>
            <li>offering the Software&apos;s functionality to third parties as a hosted service.</li>
          </ul>
          <p>
            Those need an embedding license. <Link href="https://cal.com/invaro/15min">Talk to us</Link>.
          </p>

          <h2>4. Seats</h2>
          <p>
            You need one seat for each Authorized User who uses something built on the Software. Servers, environments,
            calculation volume and the number of clients you serve are not counted. Seats are on the honor system: add
            seats from the console within 30 days of someone new starting to use it. There is no license server and no
            usage reporting.
          </p>

          <h2>5. Your code</h2>
          <p>
            You own the modules, rules, extensions and applications you write. Invaro claims no rights in them, and you
            have no obligation to share them with us or anyone else. If you choose to send us suggestions or code, we
            may use them without obligation to you.
          </p>

          <h2>6. Releases</h2>
          <p>
            Releases are the same for everyone, with or without a Firm plan. Each release is versioned and
            carries the corpus fingerprint (a Merkle root over every rule and fact), SHA-256 checksums for each package,
            and change notes listing every rule whose formula, parameters or validity window changed. You decide when
            to upgrade, and a pinned release never changes.
          </p>

          <h2>7. Support and feature requests</h2>
          <p>
            Support is by email at support@invaro.ai, answered by the engineers who maintain the engine. We work to
            these targets:
          </p>
          <div className="table-wrap">
          <table className="data">
            <tbody>
              {targets.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <p>
            A feature request we accept gets a written ship date. We may decline a request outside the engine&apos;s
            scope and will say why. Targets are commitments of effort and priority, not warranties; if we miss one we
            tell you before the date, with a new one.
          </p>

          <h2>8. Fees, renewal and cancellation</h2>
          <p>
            Fees are charged per seat, monthly or yearly, in advance, through Stripe. Subscriptions renew automatically.
            You can change seats or cancel from the console at any time; a cancellation takes effect at the end of the
            period you have paid for. We give at least 60 days&apos; notice of a price change, and it applies from your
            next renewal.
          </p>

          <h2>9. When the subscription ends</h2>
          <p>
            Your rights under section 2, and the commitments in sections 6 and 7, end with the paid period. You can
            keep using OpenTax internally under the Business Source License.
          </p>

          <h2>10. Data</h2>
          <p>
            The core, corpora, composers and solver make no network calls: no telemetry, no license check, no usage
            reporting. Running them sends Invaro nothing. The hosted API at opentax.invaro.ai is optional and is
            covered by the <Link href="/privacy">privacy page</Link>, not by this license.
          </p>

          <h2>11. Warranty and liability</h2>
          <p>
            The Software is provided as is. It is a computation tool, not tax advice; your firm remains responsible for
            reviewing its results and for the returns, plans and advice you deliver. Invaro is not liable for indirect, incidental or
            consequential damages, or for tax, penalties or interest assessed against anyone, and its total liability
            under this license is limited to the fees you paid in the 12 months before the claim.
          </p>

          <h2>12. General</h2>
          <p>
            Delaware law governs this license. You may not assign it except with your business. We may publish new
            versions of this page; your version applies until your next renewal, and we will tell you about changes at
            least 30 days ahead. Questions: <a href="mailto:founders@invaro.ai">founders@invaro.ai</a>.
          </p>
        </article>
      </div>
    </main>
  );
}
