/**
 * Security headers on every response.
 *
 * The CSP limits where scripts, connections and frames can come from: this
 * site, PostHog (analytics), GitHub's API (the live star count) and
 * Cloudflare Turnstile (the sign-in challenge). Inline scripts stay allowed
 * because Next.js streams its bootstrap inline; everything else an attacker
 * might inject (a script from their own domain, a frame, a form posting
 * elsewhere, a fetch or image request to their server) is refused. Inline
 * script itself is not blocked; that needs per-request nonces.
 */
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://us-assets.i.posthog.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com https://api.github.com https://challenges.cloudflare.com${dev ? " ws: http://localhost:*" : ""}`,
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  ...(dev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Content-Security-Policy", value: csp },
];

const v1Cors = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Accept, Authorization, X-OpenTax-Return-Id" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // the two static /v1 documents: CORS for GET and for Next's own OPTIONS reply
      ...["/v1/openapi.json", "/v1/tools"].map((source) => ({ source, headers: v1Cors })),
    ];
  },
};

export default nextConfig;
