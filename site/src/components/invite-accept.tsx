"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State =
  | { s: "loading" }
  | { s: "invalid"; error: string }
  | { s: "ready"; token: string; firm: string; email: string; signedInAs: string | null };

export function InviteAccept() {
  const [state, setState] = useState<State>({ s: "loading" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    void (async () => {
      try {
        const [inv, ses] = await Promise.all([
          fetch(`/api/invite?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!inv.ok) return setState({ s: "invalid", error: inv.error ?? "this invite is not valid" });
        setState({ s: "ready", token, firm: inv.firm, email: inv.email, signedInAs: ses.signedIn ? ses.email : null });
      } catch {
        setState({ s: "invalid", error: "could not load the invite, refresh to try again" });
      }
    })();
  }, []);

  async function accept() {
    if (state.s !== "ready") return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) return setErr(j.error ?? "could not accept the invite");
      window.location.replace("/account?joined=1");
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount() {
    if (state.s !== "ready") return;
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    const next = `/invite?token=${encodeURIComponent(state.token)}`;
    window.location.replace(`/signin?next=${encodeURIComponent(next)}&email=${encodeURIComponent(state.email)}`);
  }

  if (state.s === "loading") {
    return <div className="container py-24 text-center font-mono text-[10px] text-muted-foreground">loading…</div>;
  }
  if (state.s === "invalid") {
    return (
      <div className="container max-w-[460px] py-16 md:py-28">
        <h1 className="font-serif text-[32px] leading-tight tracking-tight mb-3">This invite can&apos;t be used</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {state.error}. Ask whoever invited you to send a new one from their account page.
        </p>
      </div>
    );
  }

  const next = `/invite?token=${encodeURIComponent(state.token)}`;
  const rightUser = state.signedInAs === state.email;
  return (
    <div className="container max-w-[460px] py-16 md:py-28">
      <h1 className="font-serif text-[32px] md:text-[40px] leading-tight tracking-tight mb-3">Join {state.firm}</h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        You&apos;re invited to {state.firm}&apos;s OpenTax Firm plan as {state.email}. You&apos;ll get answers from the
        engineers who build OpenTax and early access to new features.
      </p>
      {rightUser ? (
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          className="h-11 w-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {busy ? "joining…" : `Join ${state.firm}`}
        </button>
      ) : state.signedInAs ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed">
            You&apos;re signed in as {state.signedInAs}. This invite is for {state.email}.
          </p>
          <button type="button" onClick={switchAccount} className="h-11 w-full text-sm border border-border hover:bg-accent transition-colors">
            Sign in as {state.email}
          </button>
        </div>
      ) : (
        <Link
          href={`/signin?next=${encodeURIComponent(next)}&email=${encodeURIComponent(state.email)}`}
          className="h-11 w-full flex items-center justify-center text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in as {state.email} to join
        </Link>
      )}
      {err && <p className="mt-4 text-xs text-destructive">{err}</p>}
    </div>
  );
}
