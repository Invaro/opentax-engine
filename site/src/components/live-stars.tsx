"use client";

import { useEffect, useState } from "react";
import { REPO_API, compact, exact } from "@/lib/github";

/**
 * The star count, topped up in the browser.
 *
 * The server already bakes a number into the page and revalidates it every ten
 * minutes, so this is only here for the gap: a visitor served a cached copy
 * during a launch spike would otherwise stare at a number that's minutes stale.
 *
 * Starts at the server's value, so first paint matches the HTML and nothing
 * shifts, then refreshes on mount, when the tab comes back to the foreground,
 * and every five minutes while it's visible. One fetch is shared by every
 * instance on the page, and any failure (rate limit, offline, blocked) just
 * leaves the server's number in place.
 */

const POLL_MS = 5 * 60 * 1000;

let cached: number | null = null;
let lastAttempt = 0;
let inflight: Promise<number | null> | null = null;
const listeners = new Set<(n: number) => void>();

function load(): Promise<number | null> {
  if (inflight) return inflight;
  inflight = fetch(REPO_API, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (typeof d?.stargazers_count === "number" ? d.stargazers_count : null))
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function refresh() {
  if (document.visibilityState !== "visible") return;
  // Stamped before the request, and on every outcome, so a steady count or a
  // rate-limited failure both back off instead of re-firing on each tab focus.
  if (Date.now() - lastAttempt < POLL_MS) return;
  lastAttempt = Date.now();
  void load().then((n) => {
    if (n === null || n === cached) return;
    cached = n;
    for (const fn of listeners) fn(n);
  });
}

export function LiveStars({
  initial,
  format = "compact",
}: {
  /** The count rendered on the server; also the fallback if GitHub is unreachable. */
  initial: number;
  format?: "compact" | "exact";
}) {
  const [n, setN] = useState(initial);

  useEffect(() => {
    if (cached !== null) setN(cached);
    listeners.add(setN);
    refresh();

    const id = setInterval(() => refresh(), POLL_MS);
    const onVisible = () => refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      listeners.delete(setN);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <>{format === "exact" ? exact(n) : compact(n)}</>;
}
