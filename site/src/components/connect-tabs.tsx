"use client";

import { useState, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { ClaudeMark, CursorMark, OpenAIMark } from "@/components/brand-icons";

const MCP_URL = "https://opentax.invaro.ai/mcp";
const TRY_PROMPT = "MFJ, $120,000 wages, two kids. What's the federal refund?";
const CURSOR_INSTALL =
  "https://cursor.com/en/install-mcp?name=opentax&config=eyJ1cmwiOiJodHRwczovL29wZW50YXguaW52YXJvLmFpL21jcCJ9";

type Step = {
  title: string;
  desc: string;
  code?: string;
  link?: { label: string; href: string };
};

type Tab = {
  id: string;
  name: string;
  icon: ReactNode;
  steps: Step[];
};

const TABS: Tab[] = [
  {
    id: "claude",
    name: "Claude",
    icon: <ClaudeMark size={14} />,
    steps: [
      {
        title: "Copy the connector URL",
        desc: "One hosted URL. Nothing to install, no auth, free to try.",
        code: MCP_URL,
      },
      {
        title: "Add it in Claude",
        desc: "Settings → Connectors → Add custom connector. Name it opentax and paste the URL.",
        link: {
          label: "Open Claude connectors",
          href: "https://claude.ai/new?modal=add-custom-connector#settings/customize-connectors",
        },
      },
      {
        title: "Ask a tax question",
        desc: "Enable opentax in the chat's tools menu, then try:",
        code: TRY_PROMPT,
      },
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: <OpenAIMark size={14} />,
    steps: [
      {
        title: "Turn on Developer Mode",
        desc: "Settings → Apps & Connectors → Advanced settings → Developer mode, then Create.",
        link: { label: "Open ChatGPT connectors", href: "https://chatgpt.com/#settings/Connectors" },
      },
      {
        title: "Create the opentax connector",
        desc: "Name it opentax and paste the URL as the MCP server. No authentication.",
        code: MCP_URL,
      },
      {
        title: "Ask a tax question",
        desc: "Pick opentax from the composer's tools, then try:",
        code: TRY_PROMPT,
      },
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: <CursorMark size={14} />,
    steps: [
      {
        title: "Add the MCP server",
        desc: "One click, or Settings → MCP → Add new MCP server with the URL below.",
        link: { label: "Add to Cursor", href: CURSOR_INSTALL },
      },
      {
        title: "Or paste the URL yourself",
        desc: "Transport: streamable HTTP. Name it opentax.",
        code: MCP_URL,
      },
      {
        title: "Use it in Agent mode",
        desc: "The agent picks up calculate_tax, search_tax_rules, and the rest automatically. Try:",
        code: TRY_PROMPT,
      },
    ],
  },
];

const CLI_STEPS: Step[] = [
  {
    title: "Run it from the terminal",
    desc: "One self-contained npm package: CLI, MCP server, and HTTP host.",
    code: "npx -y @invaro/opentax eval --status mfj --wages 120000 --kids 2",
  },
  {
    title: "Wire it into Claude Code",
    desc: "Hosted HTTP shown here; swap in `npx -y @invaro/opentax` for local stdio.",
    code: `claude mcp add --transport http opentax ${MCP_URL}`,
  },
  {
    title: "Save a proof, verify it offline",
    desc: "Every answer re-derives byte for byte, or fails loudly.",
    code: "npx -y @invaro/opentax eval --wages 50000 --proof proof.json && npx -y @invaro/opentax verify proof.json",
  },
];

function ExternalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={10} height={10} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="square">
      <path d="M4.5 1.5H1.5v9h9V7.5M7 1h4v4M11 1 5.5 6.5" />
    </svg>
  );
}

function StepCard({ step, n }: { step: Step; n: number }) {
  return (
    <div className="flex flex-col p-5 md:p-6 min-w-0">
      <span className="w-6 h-6 mb-4 border border-border rounded-full flex items-center justify-center font-mono text-[10px] text-muted-foreground">
        {n}
      </span>
      <h3 className="text-sm font-medium mb-1.5">{step.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.desc}</p>
      <div className="mt-auto flex flex-col gap-1.5">
        {step.link && (
          <a
            href={step.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start border border-border h-8 px-3.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {step.link.label}
            <ExternalIcon />
          </a>
        )}
        {step.code && (
          <div className="flex items-stretch gap-1.5 min-w-0">
            <code className="flex-1 min-w-0 block font-mono text-[10px] md:text-[11px] bg-accent px-3 py-2 overflow-x-auto whitespace-nowrap">
              {step.code}
            </code>
            <CopyButton text={step.code} className="shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Higgsfield-style connect widget: client tabs on the left, MCP/CLI toggle on the right. */
export function ConnectTabs() {
  const [tab, setTab] = useState("claude");
  const [mode, setMode] = useState<"mcp" | "cli">("mcp");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const steps = mode === "mcp" ? active.steps : CLI_STEPS;

  return (
    <div className="border border-border border-t-0">
      {/* tab bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-1" role="tablist" aria-label="Choose your client">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === "mcp" && tab === t.id}
              onClick={() => {
                setTab(t.id);
                setMode("mcp");
              }}
              className={`flex items-center gap-2 h-8 px-3.5 rounded-full font-mono text-xs whitespace-nowrap transition-colors ${
                mode === "mcp" && tab === t.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.name}
            </button>
          ))}
        </div>
        <div className="flex items-center border border-border rounded-full p-0.5" role="tablist" aria-label="MCP or CLI">
          {(["mcp", "cli"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`h-7 px-3 rounded-full font-mono text-[11px] uppercase transition-colors ${
                mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* steps */}
      <div className="grid md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-border">
        {steps.map((s, i) => (
          <StepCard key={`${mode}-${active.id}-${i}`} step={s} n={i + 1} />
        ))}
      </div>
    </div>
  );
}
