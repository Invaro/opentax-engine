import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { DocsNav, DocsNavRow, type NavGroup } from "@/components/docs/docs-nav";
import { CORPUS_VERSION, TOOL_GROUPS } from "@/lib/docs";

export const metadata: Metadata = {
  title: { default: "Docs | OpenTax by Invaro", template: "%s | OpenTax docs" },
  description: "The OpenTax hosted API: one REST endpoint per tool, the same tools over MCP, keys from the console, coverage and validation spelled out.",
};

const GROUPS: NavGroup[] = [
  {
    title: "start",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "MCP transport", href: "/docs/mcp" },
      { label: "Examples", href: "/docs/examples" },
    ],
  },
  ...TOOL_GROUPS.map((g) => ({
    title: g.title.toLowerCase(),
    items: g.tools.map((t) => ({ label: t, href: `/docs/tools/${t}` })),
  })),
  {
    title: "what you get",
    items: [
      { label: "Coverage matrix", href: "/docs/coverage" },
      { label: "What it returns", href: "/docs/returns" },
      { label: "Validation", href: "/docs/validation" },
    ],
  },
];

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen">
      <SiteHeader active="docs" />
      <div className="container">
        <DocsNavRow groups={GROUPS} />
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12 py-10 md:py-14">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
              <DocsNav groups={GROUPS} />
              <div className="font-mono text-[10px] text-muted-foreground mt-2 leading-relaxed">
                corpus {CORPUS_VERSION}
                <br />
                generated from the live server
              </div>
            </div>
          </aside>
          <article className="min-w-0 max-w-[820px] docs-prose">{children}</article>
        </div>
      </div>
    </main>
  );
}
