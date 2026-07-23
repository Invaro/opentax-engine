"use client";

import { useState } from "react";

/** Minimal clipboard button: copy icon → check, reverts after 1.6s. */
export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable: no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      title={copied ? "Copied" : "Copy"}
      className={`inline-flex items-center justify-center border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent focus-visible:outline focus-visible:outline-1 focus-visible:outline-foreground ${
        copied ? "text-foreground" : ""
      } ${className}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="square">
          <path d="M4 12.5 9.5 18 20 6.5" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="square">
          <rect x="9" y="9" width="12" height="12" />
          <path d="M5 15H3V3h12v2" />
        </svg>
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}
