"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

export type CodeTab = { label: string; code: string; lang?: string };

/** Tabbed code panel — the same call in several languages. */
export function CodeTabs({ tabs, label }: { tabs: CodeTab[]; label?: string }) {
  const [i, setI] = useState(0);
  const tab = tabs[i] ?? tabs[0];
  return (
    <div className="border border-border bg-card min-w-0 my-4">
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex">
          {tabs.map((t, k) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setI(k)}
              className={`px-3 py-1.5 font-mono text-[10px] border-r border-border transition-colors ${
                k === i ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground px-3">{label ?? tab.lang ?? ""}</span>
      </div>
      <div className="relative">
        <pre className="font-mono text-[11.5px] leading-relaxed p-4 overflow-x-auto whitespace-pre">
          <code>{tab.code}</code>
        </pre>
        <CopyButton text={tab.code} className="absolute top-2 right-2 bg-background" />
      </div>
    </div>
  );
}
