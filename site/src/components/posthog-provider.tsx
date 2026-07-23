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
        session_recording: {
          recordCrossOriginIframes: false,
          maskAllInputs: true,
          maskTextSelector: '[data-ph-capture="false"]',
        },
        autocapture: {
          dom_event_allowlist: ["click", "submit", "change"],
          url_allowlist: [window.location.hostname],
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
      let url = window.origin + pathname;
      if (searchParams && searchParams.toString()) {
        url = `${url}?${searchParams.toString()}`;
      }
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}
