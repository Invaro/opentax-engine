/** Renders a JSON Schema object (the server's own validator) as a field reference. */
import Link from "next/link";

export type Schema = {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  default?: unknown;
  format?: string;
  additionalProperties?: unknown;
};

export function typeLabel(s: Schema | undefined): string {
  if (!s) return "any";
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  const alts = s.anyOf ?? s.oneOf;
  if (alts) return [...new Set(alts.map(typeLabel))].join(" | ");
  if (s.items) return `${typeLabel(s.items)}[]`;
  if (s.properties) return "object";
  if (s.additionalProperties !== undefined) return "object · any keys";
  if (Array.isArray(s.type)) return s.type.join(" | ");
  if (s.type === "number" && s.description?.toLowerCase().includes("dollars")) return "money";
  return s.type ?? "any";
}

function nested(s: Schema): Schema | null {
  if (s.properties) return s;
  if (s.items?.properties) return s.items;
  const alts = s.anyOf ?? s.oneOf;
  const obj = alts?.find((a) => a.properties || a.items?.properties);
  if (obj) return nested(obj);
  return null;
}

function constraints(s: Schema): string {
  const bits: string[] = [];
  if (s.minimum !== undefined) bits.push(`≥ ${s.minimum}`);
  if (s.maximum !== undefined) bits.push(`≤ ${s.maximum}`);
  if (s.pattern) bits.push(`pattern ${s.pattern}`);
  if (s.default !== undefined) bits.push(`default ${JSON.stringify(s.default)}`);
  return bits.join(" · ");
}

export function FieldTable({
  properties,
  required = [],
  depth = 0,
}: {
  properties: Record<string, Schema>;
  required?: string[];
  depth?: number;
}) {
  const entries = Object.entries(properties);
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">No inputs.</p>;
  return (
    <div className="border border-border overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-accent/60">
          <tr className="font-mono text-[10px] text-muted-foreground">
            <th className="px-3 py-2 font-normal w-[28%]">field</th>
            <th className="px-3 py-2 font-normal w-[16%]">type</th>
            <th className="px-3 py-2 font-normal">description</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([name, s]) => {
            const sub = depth < 4 ? nested(s) : null;
            const c = constraints(s);
            return (
              <tr key={name} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-[11px] break-all">
                  {name}
                  {required.includes(name) && (
                    <span className="ml-1.5 font-sans text-[10px] text-brand">required</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[10.5px] text-muted-foreground break-words">{typeLabel(s)}</td>
                <td className="px-3 py-2 leading-relaxed text-muted-foreground">
                  <span className="text-foreground/90">{s.description ?? ""}</span>
                  {c && <div className="font-mono text-[10px] mt-1">{c}</div>}
                  {s.additionalProperties !== undefined && !s.properties && (
                    <div className="mt-1 text-[11px]">
                      Takes every field listed on{" "}
                      <Link href="/docs/tools/calculate_tax#inputs" className="underline underline-offset-4 hover:text-foreground">
                        calculate_tax
                      </Link>
                      , grouped or flat, plus <span className="font-mono">asOf</span> and <span className="font-mono">target</span>.
                    </div>
                  )}
                  {sub && (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground hover:text-foreground">
                        {Object.keys(sub.properties ?? {}).length} nested fields
                      </summary>
                      <div className="mt-2">
                        <FieldTable properties={sub.properties ?? {}} required={sub.required} depth={depth + 1} />
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
