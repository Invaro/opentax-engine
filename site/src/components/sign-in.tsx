"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Stage = { s: "email" } | { s: "code"; email: string; challenge: string };

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};

/** Cloudflare's challenge widget, loaded only when a site key is configured. */
function useTurnstile(container: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState<string | null>(null);
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !container.current) return;
    const mount = () => {
      const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (!ts || !container.current || widget.current) return;
      widget.current = ts.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "signin",
        appearance: "interaction-only",
        callback: (t: string) => setToken(t),
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    };
    if ((window as unknown as { turnstile?: TurnstileApi }).turnstile) return mount();
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, [container]);
  const reset = () => {
    setToken(null);
    const ts = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    if (ts && widget.current) ts.reset(widget.current);
  };
  return { required: !!TURNSTILE_SITE_KEY, token, reset };
}

/**
 * Only same-origin destinations. Parsing with URL (rather than checking the
 * string) also catches tricks like "/\t/evil.com", which browsers normalize
 * to "//evil.com".
 */
function safeNext(raw: string | null): string {
  try {
    const u = new URL(String(raw ?? ""), window.location.origin);
    if (u.origin !== window.location.origin) return "/account";
    // a same-origin URL can still have a path like "//evil.com", which the
    // browser would read as protocol-relative: return the absolute URL instead
    return u.href;
  } catch {
    return "/account";
  }
}

/** What the visitor is signing in for, from where they're headed next. */
function purpose(next: string): { title: string; lede: string } {
  const path = (() => {
    try {
      return new URL(next).pathname;
    } catch {
      return next;
    }
  })();
  if (path === "/pricing") {
    return {
      title: "Sign in to start your Firm plan",
      lede: "We email you an eight-digit code, then take you straight to checkout. New here? This creates your account.",
    };
  }
  if (path === "/oauth/authorize") {
    return {
      title: "Sign in to connect your agent",
      lede: "We email you an eight-digit code, then you approve the connection. Use the email your firm's plan is under. New here? This creates your account.",
    };
  }
  if (path === "/invite") {
    return {
      title: "Sign in to join your team",
      lede: "We email you an eight-digit code, then take you back to your invite. New here? This creates your account.",
    };
  }
  return {
    title: "Sign in to OpenTax",
    lede: "We email you an eight-digit code. No password to remember. New here? This creates your account.",
  };
}

const RESEND_AFTER_S = 30;

export function SignIn() {
  const [stage, setStage] = useState<Stage>({ s: "email" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [next, setNext] = useState("/account");
  const [lockedEmail, setLockedEmail] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [resent, setResent] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const captcha = useTurnstile(captchaRef);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const target = safeNext(q.get("next"));
    setNext(target);
    const hint = q.get("email");
    if (hint) {
      setEmail(hint);
      setLockedEmail(true);
    }
    // already signed in: go straight on
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { signedIn: boolean; email?: string }) => {
        if (j.signedIn && (!hint || j.email === hint.toLowerCase())) window.location.replace(target);
      })
      .catch(() => {});
  }, []);

  // countdown before a new code can be requested
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, captcha: captcha.token ?? undefined }),
      });
      captcha.reset(); // tokens are single-use
      const j = (await r.json()) as { ok: boolean; challenge?: string; error?: string };
      if (!j.ok || !j.challenge) return setErr(j.error ?? "could not send the code");
      setResent(stage.s === "code");
      setStage({ s: "code", email: email.trim().toLowerCase(), challenge: j.challenge });
      setCode("");
      setResendIn(RESEND_AFTER_S);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent, typed = code) {
    e?.preventDefault();
    if (stage.s !== "code" || busy) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: stage.email, code: typed, challenge: stage.challenge }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) {
        setCode("");
        return setErr(j.error ?? "wrong code");
      }
      window.location.replace(next);
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container max-w-[440px] py-16 md:py-28">
      <h1 className="font-serif text-[32px] md:text-[40px] leading-tight tracking-tight mb-3">
        {stage.s === "email" ? purpose(next).title : "Check your inbox"}
      </h1>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8">
        {stage.s === "email"
          ? purpose(next).lede
          : `${resent ? "We sent a new code" : "We sent a code"} to ${stage.email}. It works for ten minutes.`}
      </p>

      {stage.s === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-2">
          <label className="font-mono text-[10px] text-muted-foreground" htmlFor="email">
            work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoFocus={!lockedEmail}
            readOnly={lockedEmail}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourfirm.com"
            className="h-11 px-3 text-sm bg-background border border-border focus:outline-none focus:border-foreground read-only:text-muted-foreground"
          />
          <div ref={captchaRef} className="mt-2 empty:hidden" />
          <button
            type="submit"
            disabled={busy || (captcha.required && !captcha.token)}
            className="h-11 mt-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {busy ? "sending…" : captcha.required && !captcha.token ? "checking your browser…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-2">
          <label className="font-mono text-[10px] text-muted-foreground" htmlFor="code">
            eight-digit code
          </label>
          <input
            id="code"
            ref={codeRef}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={8}
            required
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
              setCode(digits);
              // the eighth digit (typed or pasted) signs you in, no extra click
              if (digits.length === 8) void verify(undefined, digits);
            }}
            placeholder="00000000"
            className="h-11 px-3 font-mono text-lg tracking-[0.3em] bg-background border border-border focus:outline-none focus:border-foreground"
          />
          <button
            type="submit"
            disabled={busy || code.length !== 8}
            className="h-11 mt-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {busy ? "checking…" : "Sign in"}
          </button>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            Not there? Check your spam folder, or{" "}
            {resendIn > 0 ? (
              <span>send a new code in {resendIn}s</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendCode()}
                className="underline underline-offset-4 hover:text-foreground disabled:opacity-60"
              >
                send a new code
              </button>
            )}
            .
          </p>
          {!lockedEmail && (
            <button
              type="button"
              onClick={() => {
                setStage({ s: "email" });
                setCode("");
                setErr(null);
                setResent(false);
              }}
              className="self-start text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              use a different email
            </button>
          )}
        </form>
      )}
      {err && <p className="mt-4 text-xs text-destructive">{err}</p>}
      <p className="mt-10 text-[10px] text-muted-foreground leading-relaxed">
        We keep your address and what you set up here. Never the tax facts you compute.{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy
        </Link>
      </p>
    </div>
  );
}
