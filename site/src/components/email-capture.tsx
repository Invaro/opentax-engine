"use client";

import { useState } from "react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="font-mono text-[11px] text-foreground">
        Almost in: we sent you a confirmation link. One click and you&apos;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row items-stretch gap-2 w-full max-w-[420px]">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        aria-label="Email address"
        className="flex-1 border border-border bg-transparent px-4 h-11 font-mono text-xs placeholder:text-muted-foreground focus:outline-none focus:border-foreground"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="h-11 px-5 text-sm font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-60 whitespace-nowrap"
      >
        {state === "sending" ? "…" : "Get updates"}
      </button>
      {state === "error" && (
        <span className="font-mono text-[10px] text-muted-foreground self-center">
          didn&apos;t go through, try again
        </span>
      )}
    </form>
  );
}
