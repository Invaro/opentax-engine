"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClaudeMark, CursorMark, OpenAIMark } from "@/components/brand-icons";
import { InvaroLogo } from "@/components/logo";

type Info = {
  ok: boolean;
  error?: string;
  clientName?: string;
  redirectHost?: string;
  email?: string | null;
  plan?: { firm: string | null; role: "owner" | "member" } | null;
};

/** The app's mark when we recognize its name; otherwise its initial. */
function AppMark({ name }: { name: string }) {
  const n = name.toLowerCase();
  const icon = n.includes("claude") ? (
    <ClaudeMark size={26} />
  ) : n.includes("chatgpt") || n.includes("openai") ? (
    <OpenAIMark size={26} />
  ) : n.includes("cursor") ? (
    <CursorMark size={26} />
  ) : (
    <span className="font-serif text-2xl">{name.slice(0, 1).toUpperCase()}</span>
  );
  return <div className="h-14 w-14 border border-border bg-card flex items-center justify-center">{icon}</div>;
}

/**
 * The page an AI app sends you to when you add the OpenTax connector: sign
 * in, see which account and plan it will use, and allow it.
 */
export function AuthorizeApp() {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQ(params);
    if (params.get("response_type") !== "code") {
      setInfo({ ok: false, error: "This sign-in link isn't valid. Start again from your agent." });
      return;
    }
    fetch(`/api/oauth/client?client_id=${encodeURIComponent(params.get("client_id") ?? "")}&redirect_uri=${encodeURIComponent(params.get("redirect_uri") ?? "")}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Info) => {
        if (j.ok && !j.email) {
          window.location.replace(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        setInfo(j);
      })
      .catch(() => setInfo({ ok: false, error: "Couldn't reach OpenTax. Check your connection and try again." }));
  }, []);

  async function allow() {
    if (!q) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: q.get("client_id"),
          redirect_uri: q.get("redirect_uri"),
          code_challenge: q.get("code_challenge"),
          code_challenge_method: q.get("code_challenge_method") ?? "S256",
          state: q.get("state") ?? undefined,
          resource: q.get("resource") ?? undefined,
        }),
      });
      const j = (await r.json()) as { ok: boolean; url?: string; error?: string };
      if (!j.ok || !j.url) return setErr(j.error ?? "Couldn't connect. Try again from your agent.");
      window.location.href = j.url;
    } catch {
      setErr("Couldn't reach OpenTax. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function deny() {
    if (!q) return;
    const url = new URL(q.get("redirect_uri") ?? "/");
    url.searchParams.set("error", "access_denied");
    if (q.get("state")) url.searchParams.set("state", q.get("state")!);
    window.location.href = url.toString();
  }

  async function switchAccount() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    window.location.replace(`/signin?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }

  if (!info) {
    return <div className="container py-28 text-center text-xs text-muted-foreground">Checking the sign-in link…</div>;
  }
  if (!info.ok) {
    return (
      <div className="container max-w-[440px] py-20 md:py-28">
        <h1 className="font-serif text-3xl tracking-tight mb-3">This link has expired</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{info.error}</p>
      </div>
    );
  }

  const name = info.clientName ?? "Your agent";
  return (
    <div className="container max-w-[460px] py-14 md:py-24">
      <div className="flex items-center justify-center gap-3 mb-8">
        <AppMark name={name} />
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-1 rounded-full bg-muted-foreground/50" />
          ))}
        </span>
        <div className="h-14 w-14 bg-primary text-primary-foreground flex items-center justify-center">
          <InvaroLogo size={24} />
        </div>
      </div>

      <h1 className="font-serif text-[30px] md:text-[36px] leading-tight tracking-tight text-center mb-3">
        Connect {name} to OpenTax
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed text-center mb-8">
        {name} will be able to run OpenTax calculations for you. It can&apos;t see your billing, your team or your API key.
      </p>

      <div className="border border-border bg-card p-4 mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground mb-0.5">Signed in as</div>
            <div className="text-sm truncate">{info.email}</div>
          </div>
          {info.plan ? (
            <span className="shrink-0 rounded-full bg-green-600/10 text-green-700 dark:text-green-400 border border-green-600/20 px-2.5 py-1 text-[11px]">
              Firm plan{info.plan.firm ? ` · ${info.plan.firm}` : ""}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">Free account</span>
          )}
        </div>
        {!info.plan && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-3 pt-3 border-t border-border">
            This account isn&apos;t on a Firm plan. If your firm has one, switch to the email you were invited with.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={allow}
          disabled={busy}
          className="h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {busy ? "Connecting…" : `Connect ${name}`}
        </button>
        <button type="button" onClick={deny} className="h-11 text-sm border border-border hover:bg-accent transition-colors">
          Cancel
        </button>
      </div>
      {err && <p className="mt-4 text-xs text-destructive text-center">{err}</p>}
      <p className="mt-6 text-xs text-muted-foreground text-center leading-relaxed">
        Not you?{" "}
        <button type="button" onClick={switchAccount} className="underline underline-offset-4 hover:text-foreground">
          Use a different email
        </button>
        . You can disconnect {name} any time from{" "}
        <Link href="/account" className="underline underline-offset-4 hover:text-foreground">
          your account
        </Link>
        .
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground/80 text-center">Returns you to {info.redirectHost}</p>
    </div>
  );
}
