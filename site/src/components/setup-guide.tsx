"use client";

import { useState, type ReactNode } from "react";
import { ClaudeMark, CursorMark, McpMark, OpenAIMark } from "@/components/brand-icons";
import { CopyButton } from "@/components/copy-button";

/** The signed-in connector: the AI app asks the person to sign in once, then knows their account and plan. */
export const ACCOUNT_MCP_URL = "https://opentax.invaro.ai/mcp/account";

export const FIRST_QUESTIONS = [
  "Married filing jointly, $120,000 of wages, two kids. What's the 2025 federal tax?",
  "Run my client's W-2s and 1099s through OpenTax and compare every line with this draft return.",
  "Sole proprietor with $220,000 net profit: what does an S-corp election at a $110,000 salary save?",
];

type Step = { title: string; body: ReactNode; code?: string; link?: { label: string; href: string } };
type Client = { id: string; name: string; icon: ReactNode; steps: Step[] };

/** Cursor's one-click install link; config is base64 of {"url": ACCOUNT_MCP_URL}. */
const CURSOR_INSTALL = "https://cursor.com/en/install-mcp?name=opentax&config=eyJ1cmwiOiJodHRwczovL29wZW50YXguaW52YXJvLmFpL21jcC9hY2NvdW50In0=";

function clients(): Client[] {
  return [
    {
      id: "claude",
      name: "Claude",
      icon: <ClaudeMark size={14} />,
      steps: [
        {
          title: "Add the connector",
          body: "In Claude, open Settings → Connectors → Add custom connector. Name it OpenTax and paste this URL.",
          code: ACCOUNT_MCP_URL,
          link: { label: "Open Claude connectors", href: "https://claude.ai/new?modal=add-custom-connector#settings/customize-connectors" },
        },
        { title: "Sign in", body: "Click Connect. Claude opens OpenTax; sign in with your email and approve it." },
        { title: "Turn it on in a chat", body: "In a new chat, open the tools menu and switch on OpenTax." },
      ],
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      icon: <OpenAIMark size={14} />,
      steps: [
        {
          title: "Create the connector",
          body: "In ChatGPT, open Settings → Apps & Connectors → Advanced settings, turn on Developer mode, then Create. Name it OpenTax, paste this URL and choose OAuth.",
          code: ACCOUNT_MCP_URL,
          link: { label: "Open ChatGPT settings", href: "https://chatgpt.com/#settings/Connectors" },
        },
        { title: "Sign in", body: "ChatGPT opens OpenTax; sign in with your email and approve it." },
        { title: "Use it in a chat", body: "Pick OpenTax from the tools in the message box." },
      ],
    },
    {
      id: "cursor",
      name: "Cursor",
      icon: <CursorMark size={14} />,
      steps: [
        {
          title: "Add it in one click",
          body: "Or open Settings → MCP → Add new MCP server and paste the URL.",
          code: ACCOUNT_MCP_URL,
          link: { label: "Add to Cursor", href: CURSOR_INSTALL },
        },
        { title: "Sign in", body: "Cursor shows Needs login next to OpenTax. Click it, sign in with your email and approve." },
        { title: "Ask in Agent mode", body: "The agent uses calculate_tax and the other tools on its own." },
      ],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      icon: <ClaudeMark size={14} />,
      steps: [
        {
          title: "Add it",
          body: "Run this in your terminal. It adds OpenTax for every project.",
          code: `claude mcp add --transport http --scope user opentax ${ACCOUNT_MCP_URL}`,
        },
        {
          title: "Sign in",
          body: "Run this too. Your browser opens OpenTax; approve it. Or, inside Claude Code, type /mcp, choose opentax and Authenticate.",
          code: "claude mcp login opentax",
        },
        { title: "Restart and check", body: "Start a new Claude Code session and ask it to call my_account. It names your account and plan." },
      ],
    },
    {
      id: "other",
      name: "Other agents",
      icon: <McpMark size={14} />,
      steps: [
        {
          title: "Point it at the URL",
          body: "Any MCP client with sign-in support works: streamable HTTP, OAuth.",
          code: ACCOUNT_MCP_URL,
        },
        {
          title: "No sign-in support?",
          body: "Create an API key in the API console and send it as Authorization: Bearer on the same URL.",
          link: { label: "Open the API console", href: "/console" },
        },
        { title: "Check the connection", body: "Ask the agent to call my_account. It names your account and plan." },
      ],
    },
  ];
}

/** What to paste into an agent so it sets OpenTax up by itself. */
export function agentPrompt(email: string, firm: string | null): string {
  const plan = firm ? `${firm}'s Firm plan` : "a free account";
  return `Set up OpenTax for me.

OpenTax is a tax engine I use through MCP. It calculates US federal and state taxes exactly and cites the law for every line. My OpenTax account is ${email}, on ${plan}.

1. Add an MCP server named "opentax" (streamable HTTP, signs in with OAuth) at:
   ${ACCOUNT_MCP_URL}
   - In Claude Code, run: claude mcp add --transport http --scope user opentax ${ACCOUNT_MCP_URL}
   - In Cursor, add it in Settings → MCP, or in ~/.cursor/mcp.json as {"mcpServers": {"opentax": {"url": "${ACCOUNT_MCP_URL}"}}}
   - In the Claude or ChatGPT app, where you can't change settings yourself, tell me exactly where to add it as a custom connector.
2. The first connection asks me to sign in, and I approve it in my browser as ${email}. You can't do this step for me. In Claude Code, tell me to run "claude mcp login opentax" in my terminal (or type /mcp, choose opentax, then Authenticate), then to start a new session so the tools load.
3. Once the OpenTax tools are available, call my_account and tell me which account and plan you're connected to. It should say ${email} on ${plan}. If it names anything else, tell me.
4. From now on, whenever I ask about taxes, use the OpenTax tools instead of calculating yourself, tell me the assumptions they report, and cite their sources.`;
}

function StepCard({ step, n }: { step: Step; n: number }) {
  return (
    <div className="flex flex-col p-5 md:p-6 min-w-0">
      <span className="w-6 h-6 mb-4 border border-border rounded-full flex items-center justify-center text-[10px] text-muted-foreground">
        {n}
      </span>
      <h4 className="text-sm mb-1.5">{step.title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.body}</p>
      <div className="mt-auto flex flex-col gap-1.5">
        {step.link && (
          <a
            href={step.link.href}
            target={step.link.href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start border border-border h-8 px-3.5 text-[11px] text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors"
          >
            {step.link.label} ↗
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

/**
 * Step 1 of setup, in the same shape as the homepage's connect section: the
 * signed-in URL, a tab per AI app with three steps, and a prompt that hands
 * the whole thing to an agent.
 */
export function ConnectYourAI({ email, firm }: { email: string; firm: string | null }) {
  const all = clients();
  const [id, setId] = useState("claude");
  const active = all.find((c) => c.id === id) ?? all[0];
  const prompt = agentPrompt(email, firm);

  return (
    <div className="border border-border bg-card">
      {/* the URL */}
      <div className="border-b border-border px-4 py-5 md:py-6 text-center">
        <p className="text-[11px] text-muted-foreground mb-2.5">Your connector URL. It asks you to sign in once, as {email}.</p>
        <div className="mx-auto flex max-w-[520px] items-stretch gap-1.5">
          <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap bg-background border border-border px-3 py-2.5 font-mono text-xs md:text-sm">
            {ACCOUNT_MCP_URL}
          </code>
          <CopyButton text={ACCOUNT_MCP_URL} className="shrink-0 bg-background" />
        </div>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2.5" role="tablist" aria-label="Your agent">
        {all.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === id}
            onClick={() => setId(c.id)}
            className={`flex items-center gap-2 h-8 px-3.5 rounded-full text-xs whitespace-nowrap transition-colors ${
              c.id === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.icon}
            {c.name}
          </button>
        ))}
      </div>

      {/* steps */}
      <div className="grid md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-border">
        {active.steps.map((s, i) => (
          <StepCard key={`${active.id}-${i}`} step={s} n={i + 1} />
        ))}
      </div>

      {/* or let an agent do it */}
      <div className="grid gap-4 border-t border-border p-5 md:p-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-start">
        <div>
          <h4 className="text-sm mb-1.5">Or let your agent do it</h4>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Paste this into Claude Code, Cursor or any agent. It adds OpenTax, asks you to sign in, and checks which account
            and plan it&apos;s connected to.
          </p>
          <CopyPromptButton text={prompt} />
        </div>
        <pre className="ph-no-capture max-h-40 overflow-auto whitespace-pre-wrap bg-accent p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {prompt}
        </pre>
      </div>
    </div>
  );
}

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="h-10 w-full px-4 bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
    >
      {copied ? "Copied. Paste it into your agent" : "Copy setup prompt"}
    </button>
  );
}

/** The questions to try once connected, each one click to copy. */
export function FirstQuestions() {
  return (
    <ul className="divide-y divide-border border border-border bg-card">
      {FIRST_QUESTIONS.map((q) => (
        <li key={q} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm leading-relaxed">{q}</span>
          <CopyButton text={q} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}

export function appIcon(name: string): ReactNode {
  const n = name.toLowerCase();
  if (n.includes("claude")) return <ClaudeMark size={16} />;
  if (n.includes("chatgpt") || n.includes("openai")) return <OpenAIMark size={16} />;
  if (n.includes("cursor")) return <CursorMark size={16} />;
  return <McpMark size={16} />;
}
