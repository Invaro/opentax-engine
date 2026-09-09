"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";

type Me = {
  account: { email: string; plan: string; org: string | null; createdAt: string };
  key: { value: string; createdAt: string };
  usage: {
    days: number;
    calls: number;
    computedReturns: number;
    byTool: Array<{ tool: string; calls: number }>;
    byDay: Array<{ day: string; calls: number }>;
    truncated: boolean;
  } | null;
};

type Stage = { s: "loading" } | { s: "email" } | { s: "code"; email: string; challenge: string } | { s: "in"; me: Me };

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
  const [stage, setStage] = useState<Stage>({ s: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [reveal, setReveal] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/console/me", { cache: "no-store" });
      if (r.status === 401) return setStage({ s: "email" });
      const j = (await r.json()) as { ok: boolean; error?: string } & Me;
      if (!j.ok) {
        setErr(j.error ?? "something went wrong");
        return setStage({ s: "email" });
      }
      setStage({ s: "in", me: j });
    } catch {
      setStage({ s: "email" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/console/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = (await r.json()) as { ok: boolean; challenge?: string; error?: string };
      if (!j.ok || !j.challenge) return setErr(j.error ?? "could not send the code");
      setStage({ s: "code", email: email.trim().toLowerCase(), challenge: j.challenge });
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.s !== "code") return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/console/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: stage.email, code, challenge: stage.challenge }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) return setErr(j.error ?? "wrong code");
      setCode("");
      setStage({ s: "loading" });
      await load();
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (stage.s !== "in") return;
    if (!window.confirm("Rotate the key? The current one stops working within five minutes.")) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/console/rotate", { method: "POST" });
      const j = (await r.json()) as { ok: boolean; key?: Me["key"]; error?: string };
      if (!j.ok || !j.key) return setErr(j.error ?? "could not rotate");
      setStage({ s: "in", me: { ...stage.me, key: j.key } });
      setReveal(true);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/console/signout", { method: "POST" });
    setStage({ s: "email" });
    setReveal(false);
  }

  if (stage.s === "loading") {
    return (
      <div className="container py-24 text-center font-mono text-[10px] text-muted-foreground">loading…</div>
    );
  }

  if (stage.s === "email" || stage.s === "code") {
    return (
      <div className="container max-w-[460px] py-16 md:py-28">
        <div className="font-mono text-[10px] text-muted-foreground mb-3">console</div>
        <h1 className="font-serif text-[32px] md:text-[40px] leading-tight tracking-tight mb-3">
          {stage.s === "email" ? (
            <>
              Your key, <em className="not-italic text-muted-foreground">in one minute.</em>
            </>
          ) : (
            <>
              Check <em className="not-italic text-muted-foreground">your inbox.</em>
            </>
          )}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          {stage.s === "email"
            ? "Enter your email and we send a six-digit code. No password, no account form. The evaluation plan is free."
            : `A code went to ${stage.email}. It works for ten minutes.`}
        </p>

        {stage.s === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-2">
            <label className="font-mono text-[10px] text-muted-foreground" htmlFor="email">
              work email
            </label>
            <div className="flex items-stretch gap-1.5">
              <input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="flex-1 min-w-0 h-11 px-3 text-sm bg-background border border-border focus:outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={busy}
                className="h-11 px-5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {busy ? "sending…" : "Send code"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-2">
            <label className="font-mono text-[10px] text-muted-foreground" htmlFor="code">
              six-digit code
            </label>
            <div className="flex items-stretch gap-1.5">
              <input
                id="code"
                ref={codeRef}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="flex-1 min-w-0 h-11 px-3 font-mono text-lg tracking-[0.3em] bg-background border border-border focus:outline-none focus:border-foreground"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="h-11 px-5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {busy ? "checking…" : "Sign in"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setStage({ s: "email" });
                setErr(null);
              }}
              className="self-start mt-2 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              use a different email
            </button>
          </form>
        )}
        {err && <p className="mt-4 text-xs text-destructive">{err}</p>}
        <p className="mt-10 text-[10px] text-muted-foreground leading-relaxed">
          We keep your address, your key, and a count of your calls. Never the facts you send.{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            privacy
          </Link>
        </p>
      </div>
    );
  }

  const { me } = stage;
  const key = me.key.value;
  const masked = `${key.slice(0, 8)}${"•".repeat(28)}${key.slice(-4)}`;
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
          <div className="font-mono text-[10px] text-muted-foreground mb-3">console</div>
          <h1 className="font-serif text-[32px] md:text-[40px] leading-tight tracking-tight">
            {me.account.email}
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            {me.account.plan} plan · free · since {me.account.createdAt.slice(0, 10)}
          </p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="self-start md:self-auto h-8 px-3.5 text-xs border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
        >
          sign out
        </button>
      </div>

      {err && <p className="mb-4 text-xs text-destructive">{err}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <Panel title="api key" meta={`issued ${me.key.createdAt.slice(0, 10)}`}>
          <div className="flex items-stretch gap-1.5 min-w-0">
            <code className="flex-1 min-w-0 block font-mono text-[12px] md:text-sm bg-accent px-3 py-2.5 overflow-x-auto whitespace-nowrap">
              {reveal ? key : masked}
            </code>
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="shrink-0 border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {reveal ? "hide" : "reveal"}
            </button>
            <CopyButton text={key} className="shrink-0" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Send it as <code className="font-mono">Authorization: Bearer …</code> on REST or MCP calls. 6,000
              requests an hour. Keys are never logged.
            </p>
            <button
              type="button"
              onClick={rotate}
              disabled={busy}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-60"
            >
              rotate key
            </button>
          </div>
        </Panel>

        <Panel title="your first call" meta="calculate_tax">
          <div className="relative">
            <pre className="font-mono text-[11px] leading-relaxed bg-accent p-4 overflow-x-auto whitespace-pre">
              {firstCall(reveal ? key : "$OPENTAX_KEY")}
            </pre>
            <CopyButton text={firstCall(key)} className="absolute top-2 right-2 bg-background" />
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

        <div className="grid md:grid-cols-2 gap-4">
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
          <Panel title="billing">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Nothing, while you evaluate. The unit that will matter later is a <span className="text-foreground">computed return</span>:
              one taxpayer, one tax year, tagged with your own <code className="font-mono">X-OpenTax-Return-Id</code>{" "}
              header. Federal plus any number of states, every recalculation, counts once. Lookups and verification
              tools are never counted. We will talk before anything is charged.
            </p>
          </Panel>
        </div>

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

      <p className="mt-10 text-[10px] text-muted-foreground leading-relaxed">
        Questions, a higher budget, part-year returns, a self-hosted licence:{" "}
        <a href="mailto:founders@invaro.ai" className="underline underline-offset-4 hover:text-foreground">
          founders@invaro.ai
        </a>{" "}
        or{" "}
        <a href="https://cal.com/invaro/15min" className="underline underline-offset-4 hover:text-foreground">
          book fifteen minutes
        </a>
        .
      </p>
    </div>
  );
}
