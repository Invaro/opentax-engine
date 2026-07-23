"use client";

import { useEffect } from "react";
import Link from "next/link";

const ITEMS = [
  { key: "B", label: "Benchmark", href: "#benchmark" },
  { key: "F", label: "Features", href: "#features" },
  { key: "I", label: "Install", href: "#install" },
  { key: "C", label: "Connect", href: "#connect" },
  { key: "S", label: "Source", href: "https://github.com/Invaro/opentax-engine", external: true },
] as const;

export function KeysNav() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const item = ITEMS.find((i) => i.key.toLowerCase() === e.key.toLowerCase());
      if (!item) return;
      e.preventDefault();
      if ("external" in item && item.external) {
        window.open(item.href, "_blank", "noopener");
      } else {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.querySelector(item.href)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav
      aria-label="Sections"
      className="hidden lg:flex items-center gap-6 font-mono text-xs absolute left-1/2 -translate-x-1/2"
    >
      {ITEMS.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-keyshortcuts={i.key}
          {...("external" in i && i.external ? { target: "_blank", rel: "noopener" } : {})}
          className="group text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          <span className="opacity-60 group-hover:opacity-100 transition-opacity">[{i.key}]</span>{" "}
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
