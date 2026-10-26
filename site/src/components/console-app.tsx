"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";

type Me = {
  account: { email: string; plan: string; org: string | null; createdAt: string };
  key: { hint: string; createdAt: string } | null;
  usage: {
    days: number;
    calls: number;
    computedReturns: number;
    byTool: Array<{ tool: string; calls: number }>;
    byDay: Array<{ day: string; calls: number }>;
    truncated: boolean;
  } | null;
};

const REST = "https://opentax.invaro.ai/v1/tools";

function firstCall(key: string): string {
  return `curl -s ${REST}/calculate_tax \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"filing":{"filingStatus":"mfj"},"income":{"wages":120000},"credits":{"qualifyingChildren":2},"asOf":"2025-12-31"}'`;
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[10px] text-muted-foreground">{title}</span>
        {meta && <span className="font-mono text-[10px] text-muted-foreground">{meta}</span>}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

export function ConsoleApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/console/me", { cache: "no-store" });
      if (r.status === 401) return window.location.replace("/signin?next=/console");
      const j = (await r.json()) as { ok: boolean; error?: string } & Me;
      if (!j.ok) return setErr(j.error ?? "something went wrong");
      setMe(j);
    } catch {
      setErr("network error, refresh to try again");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function newKey() {
    if (me?.key && !window.confirm("Create a new key? The current one stops working within five minutes.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/account/key", { method: "POST" });
      const j = (await r.json()) as { ok: boolean; key?: string; hint?: string; createdAt?: string; error?: string };
      if (!j.ok || !j.key || !j.hint || !j.createdAt) return setErr(j.error ?? "could not create a key");
      setFresh(j.key);
      setMe((m) => (m ? { ...m, key: { hint: j.hint!, createdAt: j.createdAt! } } : m));
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return <div className="container py-24 text-center font-mono text-[10px] text-muted-foreground">{err ?? "loading…"}</div>;
  }

  const usage = me.usage;
  const maxDay = Math.max(1, ...(usage?.byDay.map((d) => d.calls) ?? [1]));
  const days: Array<{ day: string; calls: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day: d, calls: usage?.byDay.find((x) => x.day === d)?.calls ?? 0 });
  }

  return (
    <div className="container max-w-[920px] py-10 md:py-16">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
        <div>
          <div className="font-mono text-[10px] text-muted-foreground mb-3">API console</div>
          <h1 className="font-serif text-[32px] md:text-[40px] leading-tight tracking-tight break-all">{me.account.email}</h1>
        </div>
        <Link href="/account" className="self-start md:self-auto h-8 px-3.5 text-xs border border-border hover:bg-accent transition-colors flex items-center">
          account and plan
        </Link>
      </div>

      {err && <p className="mb-4 text-xs text-destructive">{err}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel title="api key" meta={me.key ? `created ${me.key.createdAt.slice(0, 10)}` : undefined}>
          {fresh ? (
            <>
              <div className="flex items-stretch gap-1.5 min-w-0">
                <code className="ph-no-capture flex-1 min-w-0 block font-mono text-[12px] md:text-sm bg-accent px-3 py-2.5 overflow-x-auto whitespace-nowrap">
                  {fresh}
                </code>
                <CopyButton text={fresh} className="shrink-0" />
              </div>
              <p className="text-xs mt-3 leading-relaxed">
                Copy it now. We only store a fingerprint of it, so this is the one time it is shown.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <code className="font-mono text-sm">{me.key ? me.key.hint : "no key yet"}</code>
              <button
                type="button"
                onClick={newKey}
                disabled={busy}
                className="h-8 px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {me.key ? "replace key" : "create key"}
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed mt-3">
            Send it as <code className="font-mono">Authorization: Bearer …</code> on REST or MCP calls. 6,000 requests an
            hour. Lost it? Replace it; the old one stops working.
          </p>
        </Panel>

        <Panel title="your first call" meta="calculate_tax">
          <div className="relative">
            <pre className="ph-no-capture font-mono text-[11px] leading-relaxed bg-accent p-4 overflow-x-auto whitespace-pre">
              {firstCall(fresh ?? "$OPENTAX_KEY")}
            </pre>
            <CopyButton text={firstCall(fresh ?? "$OPENTAX_KEY")} className="absolute top-2 right-2 bg-background" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-3">
            Married filing jointly, two children, $120,000 of wages, tax year 2025. Expect{" "}
            <span className="text-foreground">$5,746.00</span> with every assumption listed. Then read the{" "}
            <Link href="/docs" className="underline underline-offset-4 hover:text-foreground">
              docs
            </Link>
            .
          </p>
        </Panel>

        <Panel title="endpoints">
          <dl className="text-xs space-y-3">
            {[
              ["REST", `${REST}/{tool}`],
              ["MCP", "https://opentax.invaro.ai/mcp"],
              ["OpenAPI", "https://opentax.invaro.ai/v1/openapi.json"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-start gap-3">
                <dt className="font-mono text-[10px] text-muted-foreground w-14 shrink-0 pt-0.5">{k}</dt>
                <dd className="flex-1 min-w-0 flex items-center gap-1.5">
                  <code className="font-mono text-[11px] break-all">{v}</code>
                  <CopyButton text={v} className="shrink-0 !p-1" />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="usage" meta={usage ? `last ${usage.days} days${usage.truncated ? " · sampled" : ""}` : "unavailable"}>
          {usage ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
                <div>
                  <div className="font-serif text-3xl tabular-nums">{usage.calls.toLocaleString()}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">tool calls</div>
                </div>
                <div>
                  <div className="font-serif text-3xl tabular-nums">{usage.computedReturns.toLocaleString()}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">computed returns (tagged)</div>
                </div>
                <div className="hidden sm:block">
                  <div className="font-serif text-3xl tabular-nums">{usage.byTool.length}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">tools used</div>
                </div>
              </div>
              <div className="flex items-end gap-[3px] h-14 border-b border-border mb-1" aria-hidden>
                {days.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day}: ${d.calls}`}
                    className="flex-1 bg-foreground/80 min-w-0"
                    style={{ height: `${Math.max(d.calls > 0 ? 6 : 2, (d.calls / maxDay) * 100)}%`, opacity: d.calls > 0 ? 1 : 0.15 }}
                  />
                ))}
              </div>
              <div className="flex justify-between font-mono text-[10px] text-muted-foreground mb-5">
                <span>{days[0].day}</span>
                <span>today</span>
              </div>
              {usage.byTool.length > 0 ? (
                <div className="border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {usage.byTool.map((t) => (
                        <tr key={t.tool} className="border-t border-border first:border-t-0">
                          <td className="px-3 py-1.5 font-mono text-[11px]">{t.tool}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{t.calls.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No keyed calls yet. The first one shows up here within a minute.</p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Usage is temporarily unavailable. Your key still works.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
