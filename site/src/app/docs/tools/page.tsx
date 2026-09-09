import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS, TOOL_GROUPS, TOOL_ONE_LINERS, toolByName } from "@/lib/docs";

export const metadata: Metadata = { title: "Tools" };

export default function ToolsIndex() {
  return (
    <>
      <div className="kicker">reference · {TOOLS.length} tools</div>
      <h1>
        Tools, <em className="not-italic text-muted-foreground">one endpoint each.</em>
      </h1>
      <p className="lede">
        POST the arguments to <span className="font-mono text-[0.9em]">/v1/tools/&lt;name&gt;</span>. Each page shows
        the input schema exactly as the server validates it, a working call in four languages, and a real
        response.
      </p>
      {TOOL_GROUPS.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <p>{g.blurb}</p>
          <div className="border-t border-l border-border grid md:grid-cols-2">
            {g.tools.map((name) => {
              const t = toolByName(name);
              const req = t?.inputSchema.required ?? [];
              return (
                <Link
                  key={name}
                  href={`/docs/tools/${name}`}
                  className="no-underline border-b border-r border-border p-4 hover:bg-accent/40 transition-colors"
                >
                  <div className="font-mono text-[12px] mb-1">{name}</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{TOOL_ONE_LINERS[name]}</div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-2">
                    {Object.keys(t?.inputSchema.properties ?? {}).length} inputs
                    {req.length ? ` · required: ${req.join(", ")}` : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
