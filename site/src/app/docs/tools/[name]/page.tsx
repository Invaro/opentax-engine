import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock, InlineCode as C } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { FieldTable, type Schema } from "@/components/docs/schema-table";
import { COVERAGE, TOOLS, TOOL_ONE_LINERS, curlFor, exampleFor, jsFor, mcpFor, pyFor, sampleArgs, toolByName } from "@/lib/docs";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ name: t.name }));
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  return { title: name, description: TOOL_ONE_LINERS[name] };
}

const STATE_CODES = new Set(COVERAGE.states.map((s) => s.state.toLowerCase()));

/** compute_state_return has ~700 inputs: the shared ones, then a section per state. */
function splitStateInputs(props: Record<string, Schema>): { shared: Record<string, Schema>; byState: Map<string, Record<string, Schema>> } {
  const shared: Record<string, Schema> = {};
  const byState = new Map<string, Record<string, Schema>>();
  for (const [k, v] of Object.entries(props)) {
    let st: string | null = null;
    const m = /^([a-z]{2})(?=[A-Z0-9])/.exec(k);
    if (m && STATE_CODES.has(m[1])) st = m[1];
    if (/^(nyc|yonkers)/.test(k)) st = "ny";
    if (/^ilEitc|^ilChild/.test(k)) st = "il";
    if (st) {
      const bucket = byState.get(st) ?? {};
      bucket[k] = v;
      byState.set(st, bucket);
    } else {
      shared[k] = v;
    }
  }
  return { shared, byState: new Map([...byState.entries()].sort()) };
}

/** calculate_tax / compute_return: top-level groups are objects; render each as its own section. */
function isGrouped(schema: Schema): boolean {
  const props = schema.properties ?? {};
  const objectGroups = Object.values(props).filter((p) => p.properties).length;
  return objectGroups >= 5;
}

export default async function ToolPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const tool = toolByName(name);
  if (!tool) notFound();
  const schema = tool.inputSchema;
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const example = exampleFor(name);
  const args = sampleArgs(name);
  const grouped = isGrouped(schema);
  const stateSplit = name === "compute_state_return" ? splitStateInputs(props) : null;
  const stateInfo = (code: string) => COVERAGE.states.find((s) => s.state.toLowerCase() === code);

  return (
    <>
      <div className="kicker">
        <Link href="/docs/tools" className="hover:text-foreground">tools</Link> · POST /v1/tools/{name}
      </div>
      <h1 className="font-mono !text-[26px] md:!text-[34px] !tracking-normal break-all">{name}</h1>
      <p className="lede">{TOOL_ONE_LINERS[name]}</p>

      <h2 id="call">Call it</h2>
      <CodeTabs
        tabs={[
          { label: "curl", code: curlFor(name, args), lang: "bash" },
          { label: "javascript", code: jsFor(name, args), lang: "node 18+" },
          { label: "python", code: pyFor(name, args), lang: "requests" },
          { label: "mcp", code: mcpFor(name, args), lang: "json-rpc" },
        ]}
      />

      <h2 id="about">What it does</h2>
      <div className="border border-border bg-card p-4 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {tool.description}
      </div>
      <p className="mt-3">
        This is the description the MCP server hands to a model. The imperative sentences are addressed to the
        model; the facts about scope apply to every caller.
      </p>

      <h2 id="inputs">Inputs</h2>
      {required.length > 0 ? (
        <p>
          Required: {required.map((r, i) => (
            <span key={r}>
              {i > 0 && ", "}
              <C>{r}</C>
            </span>
          ))}
          . Everything else is optional and defaults are disclosed in <C>assumptions</C>.
        </p>
      ) : (
        <p>
          Nothing is syntactically required, but computation needs <C>asOf</C>, and the engine names any fact the
          target depends on with <C>NEEDS_FACTS</C>.
        </p>
      )}

      {stateSplit ? (
        <>
          <h3>Shared inputs</h3>
          <FieldTable properties={stateSplit.shared} required={required} />
          <h3>Per-state inputs</h3>
          <p>
            Each state&apos;s form has its own lines; those inputs are prefixed with the state code. Expand a state to
            see them. The <Link href="/docs/coverage">coverage matrix</Link> lists which states compose a return.
          </p>
          {[...stateSplit.byState.entries()].map(([code, fields]) => {
            const info = stateInfo(code);
            return (
              <details key={code} className="border border-border mb-2 group">
                <summary className="cursor-pointer px-4 py-2.5 text-xs flex items-center justify-between hover:bg-accent/40">
                  <span>
                    <span className="font-mono text-foreground">{code.toUpperCase()}</span>
                    <span className="text-muted-foreground ml-2">{info?.form ?? ""}</span>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{Object.keys(fields).length} inputs</span>
                </summary>
                <div className="p-3 border-t border-border">
                  <FieldTable properties={fields} required={required} />
                </div>
              </details>
            );
          })}
        </>
      ) : grouped ? (
        <>
          {Object.entries(props).map(([group, s]) =>
            s.properties ? (
              <section key={group}>
                <h3 id={`in-${group}`} className="font-mono">{group}</h3>
                {s.description && <p>{s.description}</p>}
                <FieldTable properties={s.properties} required={s.required} depth={1} />
              </section>
            ) : null,
          )}
          <h3 id="in-top">Top-level</h3>
          <FieldTable
            properties={Object.fromEntries(Object.entries(props).filter(([, s]) => !s.properties))}
            required={required}
          />
        </>
      ) : (
        <FieldTable properties={props} required={required} />
      )}

      <h2 id="example">Example</h2>
      {example ? (
        <>
          <p>
            {example.title}. Captured from the engine at corpus build time
            {example.proofTrimmed ? "; the proof tree is omitted here for length" : ""}.
          </p>
          <CodeBlock label="arguments" lang="json" code={JSON.stringify(example.arguments, null, 2)} />
          <CodeBlock label="response" lang="json" code={JSON.stringify(example.result, null, 2)} />
        </>
      ) : (
        <p>
          No captured example for this tool yet; the call above is a valid request. The{" "}
          <Link href="/docs/examples">examples page</Link> has ten end-to-end pairs including two refusals.
        </p>
      )}
    </>
  );
}
