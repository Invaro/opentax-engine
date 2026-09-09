import type { Metadata } from "next";
import Link from "next/link";
import { InlineCode as C } from "@/components/docs/code-block";
import { COVERAGE, SITE } from "@/lib/docs";

export const metadata: Metadata = { title: "Coverage matrix" };

type StateRow = (typeof COVERAGE.states)[number];

function Yes({ v }: { v: boolean | null }) {
  if (v === null) return <span className="text-muted-foreground">—</span>;
  return v ? <span className="text-brand-jade">yes</span> : <span className="text-muted-foreground">no</span>;
}

function ty2026Label(s: StateRow): { text: string; tone: "ok" | "warn" | "off" } {
  if (s.tier === "no-income-tax") return { text: "n/a", tone: "off" };
  if (s.tier === "calculation-only") return { text: s.ty2026.anyRule ? "rates encoded" : "not yet", tone: s.ty2026.anyRule ? "ok" : "warn" };
  if (s.ty2026.returnComposable && !s.ty2026.staleTier) return { text: "composes", tone: "ok" };
  if (s.ty2026.staleTier === "lines") return { text: `composes, ${s.ty2026.staleRules.length} line${s.ty2026.staleRules.length === 1 ? "" : "s"} blank`, tone: "warn" };
  return { text: "refuses until booklet", tone: "warn" };
}

export default function CoveragePage() {
  const states = COVERAGE.states;
  const deep = states.filter((s) => s.tier === "deep+composer");
  const thin = states.filter((s) => s.tier === "calculation-only");
  const none = states.filter((s) => s.tier === "no-income-tax");
  const fed = COVERAGE.federal.individual;
  const byForm = new Map<string, typeof fed>();
  for (const r of fed) byForm.set(r.form, [...(byForm.get(r.form) ?? []), r]);

  return (
    <>
      <div className="kicker">
        generated from the rule corpus · {COVERAGE.corpusVersion} · {COVERAGE.generated.slice(0, 10)}
      </div>
      <h1>
        What is covered, <em className="not-italic text-muted-foreground">and what refuses.</em>
      </h1>
      <p className="lede">
        This page is rendered from a machine-readable matrix the build produces from the rules themselves, so it
        cannot drift from the engine. The JSON is public:{" "}
        <a href="https://github.com/Invaro/opentax-engine/blob/main/docs/coverage/coverage-matrix.json">
          coverage-matrix.json
        </a>
        .
      </p>

      <div className="border border-border grid sm:grid-cols-4 text-xs">
        {[
          { k: "federal rules", v: String(fed.length) },
          { k: "states with a full line set", v: String(deep.length) },
          { k: "states, tax only", v: String(thin.length) },
          { k: "no income tax", v: String(none.length) },
        ].map((r, i) => (
          <div key={r.k} className={`p-4 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}>
            <div className="font-serif text-2xl">{r.v}</div>
            <div className="text-muted-foreground">{r.k}</div>
          </div>
        ))}
      </div>

      <h2 id="short">The short version</h2>
      <ul>
        <li>
          <strong>Federal individual:</strong> <C>compute_return</C> composes the Form 1040 bottom-line set; {fed.length} rule ids
          across Schedules 1, 1-A, A, C/SE, D, E, H, R, EIC, 8812 and Forms 2441, 8863, 8880, 8839, 8995, 6251, 8960,
          8959, 2210, 8615, 8606, 8582, 2555, 8962, 461, each a proof-tree target. Tax years 2025 and 2026.
        </li>
        <li>
          <strong>Business:</strong> calculation only. Form 1120 in depth, 1120-S entity-level taxes, 1041 rate schedule, 1065
          classification. No business line sets, no K-1s, no Form 990.
        </li>
        <li>
          <strong>State individual:</strong> {deep.length} states return the printed line set of the <strong>full-year resident</strong>{" "}
          form. {thin.length} compute the tax only. <strong>Part-year and nonresident returns: none, in any state.</strong>{" "}
          No state business returns.
        </li>
        <li>
          <strong>TY2026 states:</strong> where a Department has not published its 2026 booklet the engine refuses rather
          than guesses. The table below names the publication that unblocks each one.
        </li>
        <li>
          <strong>Outputs:</strong> totals, line sets, proofs with citations. No PDFs, no MeF XML. See{" "}
          <Link href="/docs/returns">what it returns</Link>.
        </li>
      </ul>

      <h2 id="states">States</h2>
      <p>
        Residency is full-year resident everywhere. &quot;TY2026&quot; says what happens on <C>asOf: 2026-12-31</C>{" "}
        today.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>state</th>
              <th>form</th>
              <th>rules</th>
              <th>fixtures</th>
              <th>TY2025</th>
              <th>TY2026</th>
              <th>unblocked by</th>
            </tr>
          </thead>
          <tbody>
            {deep.map((s) => {
              const t = ty2026Label(s);
              return (
                <tr key={s.state}>
                  <td className="font-mono">{s.state}</td>
                  <td>{s.form}</td>
                  <td className="tabular-nums">{s.rules.length}</td>
                  <td className="tabular-nums">{s.fixtures}</td>
                  <td><Yes v={s.ty2025} /></td>
                  <td className={t.tone === "ok" ? "text-brand-jade" : t.tone === "warn" ? "text-foreground" : ""}>{t.text}</td>
                  <td className="text-[11px]">{s.ty2026.unblockedBy ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3>Tax computation only (no printed line set)</h3>
      <p>
        {thin.map((s, i) => (
          <span key={s.state}>
            {i > 0 && ", "}
            <span className="font-mono text-foreground">{s.state}</span>
          </span>
        ))}
        . The rate and the parameters are encoded and citable through <C>calculate_tax</C> targets; the form is not
        composed.
      </p>
      <h3>No income tax</h3>
      <p>
        {none.map((s, i) => (
          <span key={s.state}>
            {i > 0 && ", "}
            <span className="font-mono text-foreground">{s.state}</span>
          </span>
        ))}
        . Encoded as a zero rule so a call for these states answers $0 with a citation instead of failing.
      </p>

      <h2 id="business">Business returns</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>form</th>
              <th>coverage</th>
              <th>detail</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.businessReturns.map((b) => (
              <tr key={b.form}>
                <td className="whitespace-nowrap">{b.form}</td>
                <td className="whitespace-nowrap">{b.coverage}</td>
                <td className="text-[11px]">{b.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="federal">Federal rules by form</h2>
      <p>
        {fed.length} rules. A &quot;simplified&quot; flag means the rule&apos;s title discloses an approximation; those are
        listed again at the bottom.
      </p>
      {[...byForm.entries()].sort((a, b) => b[1].length - a[1].length).map(([form, rules]) => (
        <details key={form} className="border border-border mb-2">
          <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center justify-between hover:bg-accent/40">
            <span>{form}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{rules.length} rule{rules.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="border-t border-border overflow-x-auto">
            <table className="data !my-0">
              <thead>
                <tr>
                  <th>rule id</th>
                  <th>title</th>
                  <th>2025</th>
                  <th>2026</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td className="font-mono text-[10.5px] whitespace-nowrap">{r.id}</td>
                    <td>
                      {r.title}
                      {r.simplified && <span className="ml-1.5 font-mono text-[10px] text-brand">simplified</span>}
                    </td>
                    <td><Yes v={r.ty2025} /></td>
                    <td><Yes v={r.ty2026} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}

      <h2 id="refusals">Refusal conditions</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>condition</th>
              <th>meaning</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE.refusals.map((r) => (
              <tr key={r.code}>
                <td className="font-mono text-[11px] whitespace-nowrap">{r.code}</td>
                <td>{r.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="approximations">Disclosed approximations</h2>
      <ul>
        {COVERAGE.approximations.map((a) => (
          <li key={a.id}>
            <span className="font-mono text-[11px] text-foreground">{a.id}</span> — {a.title}
          </li>
        ))}
      </ul>

      <h2 id="outputs">Output types</h2>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            <tr><td>tax totals</td><td><Yes v={COVERAGE.outputs.taxTotals} /></td></tr>
            <tr><td>form line sets</td><td>{COVERAGE.outputs.formLineSets}</td></tr>
            <tr><td>proofs and citations</td><td><Yes v={COVERAGE.outputs.proofsAndCitations} /></td></tr>
            <tr><td>rendered PDF</td><td><Yes v={COVERAGE.outputs.renderedPdf} /></td></tr>
            <tr><td>MeF XML</td><td><Yes v={COVERAGE.outputs.mefXml} /></td></tr>
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[10px]">
        merkle root {COVERAGE.merkleRoot} · horizon {COVERAGE.horizon} · {SITE}/docs/coverage
      </p>
    </>
  );
}
