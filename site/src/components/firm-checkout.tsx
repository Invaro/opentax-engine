"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Interval = "month" | "year";
type Session = { signedIn: boolean; email?: string; plan?: { role: "owner" | "member"; firm: string | null } | null };

// mirrors lib/billing.ts: volume pricing, every seat $5 from six seats, annual = eleven months
const VOLUME_AT = 6;
function seatCents(seats: number, interval: Interval): number {
  const monthly = seats >= VOLUME_AT ? 500 : 900;
  return interval === "year" ? monthly * 11 : monthly;
}

const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

export function FirmCheckout() {
  const [seats, setSeats] = useState(1);
  // what's in the box while typing; it may be empty until the field loses focus
  const [seatsText, setSeatsText] = useState("1");
  const [interval, setPeriod] = useState<Interval>("month");
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resumed = useRef(false);

  const setSeatCount = (n: number) => {
    const clamped = Math.min(500, Math.max(1, n));
    setSeats(clamped);
    setSeatsText(String(clamped));
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = Number(q.get("seats"));
    if (Number.isInteger(s) && s >= 1 && s <= 500) setSeatCount(s);
    if (q.get("interval") === "year") setPeriod("year");
    fetch("/api/auth/session?plan=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Session) => setSession(j.signedIn ? j : null))
      .catch(() => setSession(null));
  }, []);

  const who = session?.email ?? null;
  const onPlan = session?.plan ?? null;

  // back from signing in to buy: pick up where they left off and go on to checkout
  useEffect(() => {
    if (resumed.current || session === undefined) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("checkout") !== "1") return;
    resumed.current = true;
    window.history.replaceState(null, "", `/pricing?seats=${q.get("seats") ?? 1}&interval=${q.get("interval") ?? "month"}`);
    formRef.current?.scrollIntoView({ block: "center" });
    if (who && !onPlan) void startCheckout();
  }, [session]);

  const per = seatCents(seats, interval);
  const total = per * seats;
  const unit = interval === "year" ? "year" : "month";
  const yearlySaving = seatCents(seats, "month") * seats;

  async function startCheckout() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seats, interval }),
      });
      const j = (await r.json()) as { ok: boolean; url?: string; error?: string };
      if (!j.ok || !j.url) return setErr(j.error ?? "could not start checkout");
      window.location.href = j.url;
    } catch {
      setErr("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  function checkout(e: React.FormEvent) {
    e.preventDefault();
    if (!who) {
      const back = `/pricing?seats=${seats}&interval=${interval}&checkout=1`;
      window.location.href = `/signin?next=${encodeURIComponent(back)}`;
      return;
    }
    void startCheckout();
  }

  if (onPlan) {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <p className="text-sm leading-relaxed">
          {onPlan.role === "owner"
            ? `You're on the Firm plan${onPlan.firm ? ` for ${onPlan.firm}` : ""}. Add seats, switch to yearly or invite your team from your account.`
            : `You're on ${onPlan.firm ?? "your firm"}'s Firm plan. Your firm's owner manages seats and billing.`}
        </p>
        <Link
          href="/account"
          className="h-11 flex items-center justify-center text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to your account
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={checkout} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 border border-border text-xs" role="radiogroup" aria-label="Billing period">
        {(["month", "year"] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setPeriod(i)}
            className={`h-9 transition-colors ${interval === i ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
          >
            {i === "month" ? "Monthly" : "Yearly · 1 month free"}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="seats" className="text-xs text-muted-foreground">
          Staff seats
        </label>
        <div className="flex items-stretch border border-border">
          <button type="button" onClick={() => setSeatCount(seats - 1)} aria-label="One fewer seat" className="w-9 text-muted-foreground hover:text-foreground hover:bg-accent">
            −
          </button>
          <input
            id="seats"
            inputMode="numeric"
            value={seatsText}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
              setSeatsText(digits);
              if (digits) setSeats(Math.min(500, Math.max(1, Number(digits))));
            }}
            onBlur={() => setSeatCount(Number(seatsText) || 1)}
            onFocus={(e) => e.target.select()}
            className="w-14 h-9 text-center tabular-nums text-sm bg-background border-x border-border focus:outline-none"
          />
          <button type="button" onClick={() => setSeatCount(seats + 1)} aria-label="One more seat" className="w-9 text-muted-foreground hover:text-foreground hover:bg-accent">
            +
          </button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-serif text-4xl tabular-nums">{usd(total)}</span>
          <span className="text-xs text-muted-foreground">per {unit}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
          {seats} × {usd(per)} per seat
          {interval === "year" && ` · ${usd(yearlySaving)} less than paying monthly`}
        </p>
        {seats >= 3 && seats < VOLUME_AT && (
          <p className="text-xs mt-2 leading-relaxed">
            At {VOLUME_AT} seats every seat drops to {usd(seatCents(VOLUME_AT, interval))}:{" "}
            <button type="button" onClick={() => setSeatCount(VOLUME_AT)} className="underline underline-offset-4">
              {VOLUME_AT} seats for {usd(seatCents(VOLUME_AT, interval) * VOLUME_AT)} a {unit}
            </button>
            .
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || session === undefined}
        className="h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {busy ? "opening checkout…" : who ? "Continue to checkout" : "Sign in to continue"}
      </button>
      {who && <p className="text-[10px] text-muted-foreground -mt-2">The plan will belong to {who}.</p>}
      {err && <p className="text-xs text-destructive">{err}</p>}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Paid through Stripe, charged today and then every {unit}. Add seats, switch to yearly or cancel from your
        account. Prices in USD, before any sales tax.
      </p>
    </form>
  );
}
