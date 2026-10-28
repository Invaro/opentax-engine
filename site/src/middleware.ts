import { NextResponse } from "next/server";

/**
 * CORS preflight for the two static /v1 documents. They are built once per
 * deploy and served from the CDN, and Next answers OPTIONS on a static route
 * with 405, which fails a browser preflight. This runs only when a request
 * carries Access-Control-Request-Method, so ordinary GETs never reach it.
 */
export function middleware(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-OpenTax-Return-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export const config = {
  matcher: [
    { source: "/v1/openapi.json", has: [{ type: "header", key: "access-control-request-method" }] },
    { source: "/v1/tools", has: [{ type: "header", key: "access-control-request-method" }] },
  ],
};
