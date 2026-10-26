"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * PostHog analytics (same setup as the invaro.ai site): no-ops entirely when
 * NEXT_PUBLIC_POSTHOG_KEY is unset, so local dev and forks stay silent.
 * Everything captured is disclosed on /privacy; inputs are always masked and
 * Do Not Track is honored.
 */
/**
 * Query strings can carry credentials (invite tokens, Checkout session ids,
 * sign-in hints), so analytics only ever sees these harmless parameters.
 */
const SAFE_PARAMS = new Set(["seats", "interval", "utm_source", "utm_medium", "utm_campaign"]);

/** Pages that show keys, plan ids, invite tokens or sign-in codes are never session-recorded. */
const UNRECORDED = /^\/(console|account|signin|invite)(\/|$)/;
const isUnrecorded = (path: string) => UNRECORDED.test(path);

function scrubUrl(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.includes("?")) return raw;
  try {
    const u = new URL(raw, window.location.origin);
    for (const k of [...u.searchParams.keys()]) if (!SAFE_PARAMS.has(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return raw.split("?")[0];
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        defaults: "2026-05-30",
        person_profiles: "identified_only",
        capture_pageview: false, // manual capture below (app-router URLs)
        capture_pageleave: true,
        respect_dnt: true,
        disable_session_recording: isUnrecorded(window.location.pathname),
        session_recording: {
          recordCrossOriginIframes: false,
          maskAllInputs: true,
          maskTextSelector: '[data-ph-capture="false"], .ph-no-capture',
        },
        autocapture: {
          dom_event_allowlist: ["click", "submit", "change"],
          url_allowlist: [window.location.hostname],
        },
        before_send: (event) => {
          if (!event) return event;
          for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$prev_pageview_pathname"]) {
            if (event.properties?.[key] !== undefined) event.properties[key] = scrubUrl(event.properties[key]);
          }
          if (event.$set_once) for (const k of Object.keys(event.$set_once)) event.$set_once[k] = scrubUrl(event.$set_once[k]);
          return event;
        },
        loaded: (ph) => {
          if (process.env.NODE_ENV === "development") ph.debug();
        },
      });
    }
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}

function PostHogPageView(): null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (typeof window !== "undefined" && pathname && ph) {
      // client-side navigation into or out of a sensitive page toggles recording
      if (isUnrecorded(pathname)) ph.stopSessionRecording();
      else if (ph.sessionRecordingStarted && !ph.sessionRecordingStarted()) ph.startSessionRecording();
      let url = window.origin + pathname;
      if (searchParams && searchParams.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      ph.capture("$pageview", { $current_url: scrubUrl(url) });
    }
  }, [pathname, searchParams, ph]);

  return null;
}
