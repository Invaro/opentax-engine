"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { appIcon, ConnectYourAI, FirstQuestions } from "@/components/setup-guide";

type Release = {
  tag: string;
  publishedAt: string;
  gitCommit: string;
  corpusMerkleRoot: string;
  notes?: string;
  files: Array<{ name: string; package: string; version: string; sha256: string; size: number }>;
};
type Plan = {
  id: string;
  status: string;
  inForce: boolean;
  seats: number;
  interval: "month" | "year";
  firm: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt?: string | null;
  endedAt?: string | null;
  role: "owner" | "member";
  owner: string;
  seatsUsed?: number;
  team: Array<{ email: string; addedAt: string }>;
  invites: Array<{ email: string; invitedAt: string; expiresAt: string }>;
  overSeat: { since: string; excess: number; graceEndsAt: string } | null;
};
type Connection = { clientId: string; name: string; connectedAt: string; lastUsedAt: string | null };
type Account = {
  email: string;
  createdAt: string;
  plan: Plan | null;
  releases: Release[];
  hasKey?: boolean;
  connections?: Connection[];
};
type Invoice = { number: string | null; date: string; total: number; currency: string; status: string | null; url: string | null; pdf: string | null };

const SUPPORT = "support@invaro.ai";

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

function ago(iso: string | null): string {
  if (!iso) return "not used yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return "used just now";
  if (mins < 60) return `used ${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `used ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `used ${day(iso)}`;
}

function installSnippet(r: Release): string {
  const tgz = (pkg: string) => r.files.find((f) => f.package === pkg)?.name ?? `${pkg}.tgz`;
  return `npm i ./${tgz("@invaro/opentax-core")} ./${tgz("@invaro/opentax-corpus-us-federal")}

import { evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const corpus = getCorpus();
if (corpus.merkleRoot !== "${r.corpusMerkleRoot}") throw new Error("unexpected corpus");`;
}

const btn = "h-9 px-4 text-sm border border-border bg-background hover:bg-accent disabled:opacity-60 transition-colors whitespace-nowrap";
const primaryBtn = "h-9 px-4 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors whitespace-nowrap";
const linkBtn = "text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 disabled:opacity-60";

async function post(url: string, body?: unknown): Promise<{ ok: boolean; error?: string; url?: string }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return r.json();
}

/** Subscription states that mean the plan is over, not merely waiting on a payment. */
const ENDED = new Set(["canceled", "incomplete_expired"]);

/** After Stripe Checkout, how long to keep checking before saying it's taking a while. */
const CONFIRM_TRIES = 15;
const CONFIRM_EVERY_MS = 4000;

function Chip({ tone, children }: { tone: "green" | "amber" | "muted"; children: ReactNode }) {
  const tones = {
    green: "bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    muted: "text-muted-foreground border-border",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

function SectionHead({ id, title, children }: { id?: string; title: string; children?: ReactNode }) {
  return (
    <div id={id} className="mb-5 scroll-mt-24">
      <h2 className="font-serif text-2xl md:text-[28px] leading-tight tracking-tight">{title}</h2>
      {children && <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-[640px]">{children}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-border bg-card p-5 md:p-6 min-w-0 ${className}`}>{children}</div>;
}

function Banner({ tone, children }: { tone: "info" | "warn" | "error"; children: ReactNode }) {
  const tones = {
    info: "border-border bg-card",
    warn: "border-amber-500/40 bg-amber-500/5",
    error: "border-destructive/50 bg-destructive/5",
  };
  return <div className={`border px-4 py-3 text-sm leading-relaxed ${tones[tone]}`}>{children}</div>;
}

function Avatar({ email, owner }: { email: string; owner?: boolean }) {
  return (
    <span
      title={email}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm uppercase ${
        owner ? "border-foreground bg-foreground text-background" : "border-border bg-background"
      }`}
    >
      {email.slice(0, 1)}
    </span>
  );
}

export function AccountApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | "error" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState("");

  const load = useCallback(async (): Promise<Account | null> => {
    const r = await fetch("/api/account", { cache: "no-store" });
    if (r.status === 401) {
      window.location.replace(`/signin?next=${encodeURIComponent(window.location.pathname)}`);
      return null;
    }
    const j = (await r.json()) as { ok: boolean; error?: string } & Account;
    if (!j.ok) {
      setErr(j.error ?? "Couldn't load your account. Refresh to try again.");
      return null;
    }
    setAccount(j);
    if (j.plan?.role === "owner") {
      fetch("/api/account/invoices", { cache: "no-store" })
        .then((x) => x.json())
        .then((x: { ok: boolean; invoices?: Invoice[] }) => setInvoices(x.ok ? (x.invoices ?? []) : "error"))
        .catch(() => setInvoices("error"));
    }
    return j;
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const sessionId = q.get("session_id");
    const joined = q.get("joined") === "1";
    if (!sessionId) {
      if (joined) window.history.replaceState(null, "", "/account");
      void load().then((a) => {
        if (joined && a?.plan?.inForce) setNotice(`You've joined ${a.plan.firm ?? "your firm"}'s Firm plan. Connect your agent below to start.`);
      });
      return;
    }
    window.history.replaceState(null, "", "/account");
    // Stripe can take a moment to confirm: say so from the first frame, and
    // keep checking rather than show the free account to someone who just paid
    setConfirming(true);
    void load();
    void (async () => {
      const j = await post("/api/billing/sync", { sessionId }).catch(() => ({ ok: false }));
      if (j.ok && (await load())?.plan?.inForce) {
        setConfirming(false);
        setNotice("Payment received. Your Firm plan is active. Here's how to get set up.");
        return;
      }
      for (let i = 0; i < CONFIRM_TRIES; i++) {
        await new Promise((r) => setTimeout(r, CONFIRM_EVERY_MS));
        if ((await load())?.plan?.inForce) {
          setConfirming(false);
          setNotice("Payment received. Your Firm plan is active. Here's how to get set up.");
          return;
        }
      }
      setConfirming(false);
      setNotice(`Your payment went through, and Stripe is still confirming it. Refresh in a few minutes, or forward your Stripe receipt to ${SUPPORT} and we'll sort it out.`);
    })();
  }, [load]);

  /** Runs an action; errors show at the top of the page, scrolled into view. Resolves true on success. */
  async function act(fn: () => Promise<{ ok: boolean; error?: string; url?: string }>, done?: string): Promise<boolean> {
    setBusy(true);
    setErr(null);
    setNotice(null);
    const fail = (msg: string) => {
      setErr(msg);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    };
    try {
      const j = await fn();
      if (!j.ok) return fail(j.error ?? "Something went wrong. Try again.");
      if (j.url) {
        window.location.href = j.url;
        return true;
      }
      if (done) setNotice(done);
      await load();
      return true;
    } catch {
      return fail("Couldn't reach OpenTax. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const team = (action: string, email: string, done: string) => act(() => post("/api/account/team", { action, email }), done);

  if (!account) {
    return (
      <div className="container py-28 text-center text-sm text-muted-foreground">
        {err ?? (confirming ? "Payment received. Confirming it with Stripe…" : "Loading your account…")}
      </div>
    );
  }

  const plan = account.plan;
  const live = !!plan?.inForce;
  const owner = plan?.role === "owner";
  const used = plan ? (plan.seatsUsed ?? 1 + plan.team.length) : 0;
  const held = plan ? plan.invites.length : 0;
  const connections = account.connections ?? [];
  const connected = connections.length > 0 || !!account.hasKey;
  const asked = connections.some((c) => c.lastUsedAt);
  const invited = !!plan && (plan.team.length > 0 || plan.invites.length > 0);
  const firm = live ? plan?.firm ?? null : null;

  const steps: Array<{ href: string; title: string; done: boolean; doneText: string; todoText: string }> = [
    {
      href: "#connect",
      title: "Connect your agent",
      done: connected,
      doneText: connections[0] ? `${connections[0].name} is connected` : "Connected with an API key",
      todoText: "About a minute in Claude, ChatGPT or Cursor",
    },
    {
      href: "#try",
      title: "Ask your first question",
      done: asked,
      doneText: "OpenTax has answered",
      todoText: "Copy one of the questions below",
    },
    owner && live
      ? { href: "#team", title: "Invite your team", done: invited, doneText: `${used + held} of ${plan!.seats} seats in use`, todoText: `${plan!.seats - used} seats ready to fill` }
      : { href: "#help", title: "Save the support address", done: false, doneText: "", todoText: SUPPORT },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="container max-w-[1040px] py-10 md:py-14">
      {/* header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between mb-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {live ? (
              <Chip tone="green">● Firm plan</Chip>
            ) : confirming ? (
              <Chip tone="amber">Confirming your payment…</Chip>
            ) : (
              <Chip tone="muted">Free account</Chip>
            )}
            {live && !owner && <Chip tone="muted">Member</Chip>}
          </div>
          <h1 className="font-serif text-[34px] md:text-[44px] leading-[1.05] tracking-tight">
            {live ? "Welcome to OpenTax" : "Your OpenTax account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground break-all">
            {firm && <span className="text-foreground">{firm} · </span>}
            {account.email}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/console" className={`${btn} flex items-center`}>
            API console
          </Link>
          <button type="button" className={btn} disabled={busy} onClick={() => act(() => post("/api/auth/signout")).then(() => window.location.replace("/"))}>
            Sign out
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-8 empty:hidden">
        {err && <Banner tone="error">{err}</Banner>}
        {notice && <Banner tone="info">{notice}</Banner>}
        {confirming && <Banner tone="info">Payment received. We&apos;re confirming it with Stripe, which usually takes a few seconds. This page updates on its own.</Banner>}
        {plan?.overSeat && owner && (
          <Banner tone="warn">
            Your team has {used} people on {plan.seats} seats. Remove {plan.overSeat.excess} {plan.overSeat.excess === 1 ? "person" : "people"} or add
            seats in billing by {day(plan.overSeat.graceEndsAt)}. After that, the most recently added people lose access.
          </Banner>
        )}
        {plan?.status === "past_due" && (
          <Banner tone="warn">
            Your last payment didn&apos;t go through. Stripe will try again;
            {owner ? " update your card in Manage billing to keep the plan." : ` ${plan.owner} can update the card.`}
          </Banner>
        )}
        {live && plan?.cancelAtPeriodEnd && (
          <Banner tone="info">
            This plan ends on {day(plan.cancelAt ?? plan.currentPeriodEnd)}. Everything keeps working until then.
            {owner ? " To keep it, open Manage billing and renew." : ""}
          </Banner>
        )}
        {plan && !live && ENDED.has(plan.status) && (
          <Banner tone="info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                This Firm plan ended{plan.endedAt ? ` on ${day(plan.endedAt)}` : ""}. Your account, API key and invoices are still here.
              </span>
              {owner && (
                <Link href={`/pricing?seats=${plan.seats}&interval=${plan.interval}`} className={primaryBtn + " flex items-center"}>
                  Start the Firm plan again
                </Link>
              )}
            </div>
          </Banner>
        )}
        {plan && !live && !ENDED.has(plan.status) && (
          <Banner tone="error">
            This plan isn&apos;t active ({plan.status.replace("_", " ")}).{" "}
            {owner ? `Manage billing shows what Stripe needs, or email ${SUPPORT}.` : `${plan.owner} manages billing.`}
          </Banner>
        )}
      </div>

      {/* setup checklist */}
      <section className="mb-14">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="font-serif text-2xl md:text-[28px] leading-tight tracking-tight">Get set up</h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {doneCount} of {steps.length} done
          </span>
        </div>
        <div className="h-1 bg-border mb-4">
          <div className="h-full bg-foreground transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <a key={s.title} href={s.href} className="group flex gap-3 border border-border bg-card p-4 hover:border-foreground/40 transition-colors">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${
                  s.done ? "bg-green-600 text-white" : "border border-border text-muted-foreground"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${s.done ? "text-muted-foreground line-through decoration-1" : ""}`}>{s.title}</span>
                <span className="block text-xs text-muted-foreground mt-0.5 truncate">{s.done ? s.doneText : s.todoText}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* connect your agent */}
      <section className="mb-14">
        <SectionHead id="connect" title="Connect your agent">
          Add OpenTax to the agent you already use and sign in once. From then on every answer is tied to{" "}
          <span className="text-foreground">{account.email}</span>
          {firm ? (
            <>
              {" "}on <span className="text-foreground">{firm}&apos;s Firm plan</span>
            </>
          ) : live ? (
            <> on your Firm plan</>
          ) : (
            <> (a free account)</>
          )}
          .
        </SectionHead>
        <ConnectYourAI email={account.email} firm={firm} />

        <div className="mt-4 border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h3 className="text-sm font-medium">Connected apps</h3>
            <span className="text-xs text-muted-foreground">{connections.length ? `${connections.length} connected` : "none yet"}</span>
          </div>
          {connections.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground text-center">
              Nothing connected yet. When you approve OpenTax in your agent, it shows up here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {connections.map((c) => (
                <li key={c.clientId} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background">{appIcon(c.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Connected {day(c.connectedAt)} · {ago(c.lastUsedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className={linkBtn}
                    onClick={() =>
                      window.confirm(`Disconnect ${c.name}? It stops working with OpenTax until you connect it again.`) &&
                      act(() => post("/api/account/connections", { clientId: c.clientId }), `${c.name} disconnected.`)
                    }
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* first question */}
      <section className="mb-14">
        <SectionHead id="try" title="Ask your first question">
          Once OpenTax is connected, ask your agent anything that needs a tax number. It calls OpenTax, shows the assumptions and
          cites the law.
        </SectionHead>
        <FirstQuestions />
      </section>

      {/* team */}
      {live && (
        <section className="mb-14">
          <SectionHead id="team" title={owner ? "Your team" : "Your firm"}>
            {owner
              ? `Everyone you invite gets the same support and early access. Each person signs in with their own email and connects their own agent.`
              : `You're on ${firm ?? "your firm"}'s Firm plan. ${plan!.owner} manages seats and billing.`}
          </SectionHead>
          {owner ? (
            <Card>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex -space-x-2">
                  <Avatar email={account.email} owner />
                  {plan!.team.map((m) => (
                    <Avatar key={m.email} email={m.email} />
                  ))}
                  {plan!.invites.map((i) => (
                    <span key={i.email} className="opacity-50">
                      <Avatar email={i.email} />
                    </span>
                  ))}
                  {Array.from({ length: Math.max(0, Math.min(plan!.seats - used - held, 6)) }, (_, k) => (
                    <span key={k} title="Open seat" className="h-9 w-9 shrink-0 rounded-full border border-dashed border-border bg-background" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {used} of {plan!.seats} seats{held ? ` · ${held} invited` : ""}
                </span>
              </div>
              <ul className="divide-y divide-border border border-border mb-4">
                <li className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm" title={account.email}>
                    {account.email}
                  </span>
                  <span className="text-xs text-muted-foreground">Owner</span>
                </li>
                {plan!.team.map((m) => (
                  <li key={m.email} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm" title={m.email}>
                      {m.email}
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">Joined {day(m.addedAt)}</span>
                    <button
                      type="button"
                      disabled={busy}
                      className={linkBtn}
                      onClick={() => window.confirm(`Remove ${m.email}? They lose access right away.`) && team("remove", m.email, `${m.email} removed.`)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
                {plan!.invites.map((i) => (
                  <li key={i.email} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={i.email}>
                      {i.email}
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">Invited · expires {day(i.expiresAt)}</span>
                    <button type="button" disabled={busy} className={linkBtn} onClick={() => team("resend", i.email, `Invite sent again to ${i.email}.`)}>
                      Resend
                    </button>
                    <button type="button" disabled={busy} className={linkBtn} onClick={() => team("cancel", i.email, `Invite to ${i.email} cancelled.`)}>
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  // keep what was typed if the invite fails, so it can be fixed and resent
                  void team("invite", invite, `Invite sent to ${invite}.`).then((ok) => ok && setInvite(""));
                }}
                className="flex items-stretch gap-2"
              >
                <input
                  type="email"
                  required
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="colleague@yourfirm.com"
                  className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm focus:border-foreground focus:outline-none"
                />
                <button type="submit" disabled={busy || used + held >= plan!.seats} className={primaryBtn + " h-10"}>
                  Send invite
                </button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                {used + held >= plan!.seats
                  ? "Every seat is taken. Add seats in Manage billing to invite more people."
                  : "They get an email with a link that works once and expires in 7 days."}
              </p>
            </Card>
          ) : (
            <Card>
              <div className="flex items-center gap-3">
                <Avatar email={plan!.owner} owner />
                <div className="min-w-0">
                  <div className="text-sm truncate">{plan!.owner}</div>
                  <div className="text-xs text-muted-foreground">Owner · {used} of {plan!.seats} seats in use</div>
                </div>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* help + plan */}
      <section className="grid gap-4 md:grid-cols-2 mb-14">
        <Card>
          <h2 id="help" className="font-serif text-2xl leading-tight tracking-tight mb-2 scroll-mt-24">
            Get help
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Email us from {live ? "this address" : "your account email"} and we&apos;ll know who you are{live ? " and which plan you're on" : ""}. Just
            tell us what you need.
          </p>
          <a href={`mailto:${SUPPORT}`} className="flex items-center justify-between gap-3 border border-border bg-background px-4 py-3 hover:border-foreground/40 transition-colors">
            <span className="text-sm">{SUPPORT}</span>
            <span className="text-xs text-muted-foreground">{live ? "Reply within 24 hours" : "Write to us"}</span>
          </a>
          {live && <p className="mt-3 text-xs text-muted-foreground">January through April, replies within 4 business hours.</p>}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/docs" className={linkBtn}>
              API docs
            </Link>
            <Link href="/changelog" className={linkBtn}>
              What&apos;s new
            </Link>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-serif text-2xl leading-tight tracking-tight">Plan and billing</h2>
            {live ? <Chip tone="green">Active</Chip> : plan ? <Chip tone="muted">Not active</Chip> : <Chip tone="muted">Free</Chip>}
          </div>
          {plan ? (
            <>
              <dl className="divide-y divide-border border-y border-border text-sm mb-4">
                {[
                  ["Firm", plan.firm ?? "Not given"],
                  ["Seats", `${used} of ${plan.seats} in use`],
                  ["Billing", plan.interval === "year" ? "Yearly" : "Monthly"],
                  !live && ENDED.has(plan.status)
                    ? ["Ended", day(plan.endedAt) || "—"]
                    : [plan.cancelAtPeriodEnd ? "Ends" : "Renews", day(plan.cancelAt ?? plan.currentPeriodEnd) || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {owner ? (
                <button type="button" className={btn} disabled={busy} onClick={() => act(() => post("/api/billing/portal"))}>
                  Manage billing
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">Managed by {plan.owner}.</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Change seats, switch to yearly, update your card or cancel, in Stripe.{" "}
                <Link href="/license" className="underline underline-offset-4 hover:text-foreground">
                  Terms
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                With the Firm plan, the engineers who build OpenTax answer your questions within 24 hours and build the features
                your firm needs.
              </p>
              <Link href="/pricing" className={primaryBtn + " inline-flex items-center"}>
                See the Firm plan
              </Link>
            </>
          )}
        </Card>
      </section>

      {/* invoices */}
      {owner && (
        <section className="mb-14">
          <SectionHead title="Invoices" />
          {invoices === null ? (
            <p className="text-sm text-muted-foreground">Loading invoices…</p>
          ) : invoices === "error" ? (
            <p className="text-sm text-muted-foreground">Invoices couldn&apos;t load just now. Manage billing shows every invoice, or refresh in a minute.</p>
          ) : invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <div className="border border-border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={`${inv.number}-${inv.date}`} className="border-t border-border first:border-t-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">{day(inv.date)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{money(inv.total, inv.currency)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground capitalize">{inv.status}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {inv.url && (
                          <a href={inv.url} target="_blank" rel="noreferrer" className={linkBtn}>
                            View
                          </a>
                        )}
                        {inv.pdf && (
                          <a href={inv.pdf} className={linkBtn + " ml-4"}>
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* releases */}
      {live && (
        <section className="mb-14">
          <SectionHead title="Release packages">
            Each OpenTax release as installable packages, with checksums and the corpus fingerprint, for running OpenTax inside
            your own app.
          </SectionHead>
          {account.releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">The first release package appears here as soon as it is published.</p>
          ) : (
            <div className="space-y-6">
              {account.releases.slice(0, 5).map((r, i) => (
                <Card key={r.tag}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <span className="text-sm font-medium">
                      {r.tag}
                      {i === 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">latest</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {day(r.publishedAt)} · commit {r.gitCommit.slice(0, 7)}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-muted-foreground mb-3 break-all">corpus {r.corpusMerkleRoot}</p>
                  <ul className="divide-y divide-border border border-border">
                    {r.files.map((f) => (
                      <li key={f.name} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <a
                          href={`/api/console/download?tag=${encodeURIComponent(r.tag)}&file=${encodeURIComponent(f.name)}`}
                          className="font-mono underline underline-offset-4 hover:text-foreground truncate"
                        >
                          {f.name}
                        </a>
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap" title={f.sha256}>
                          {Math.round(f.size / 1024)} KB
                        </span>
                      </li>
                    ))}
                  </ul>
                  {i === 0 && (
                    <div className="relative mt-3">
                      <pre className="font-mono text-[11px] leading-relaxed bg-accent p-4 overflow-x-auto whitespace-pre">{installSnippet(r)}</pre>
                      <CopyButton text={installSnippet(r)} className="absolute top-2 right-2 bg-background" />
                    </div>
                  )}
                  {i === 0 && r.notes && <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{r.notes}</pre>}
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* security */}
      <section className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Signed in with an emailed code. Lost a device or shared a computer?</p>
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() =>
            window.confirm("Sign out on every device, including this one?") &&
            act(() => post("/api/auth/signout-all")).then(() => window.location.replace("/"))
          }
        >
          Sign out everywhere
        </button>
      </section>
    </div>
  );
}
