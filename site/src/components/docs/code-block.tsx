import { CopyButton } from "@/components/copy-button";

/** A labelled code panel in the house style: square, bordered, mono, copyable. */
export function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  return (
    <div className="border border-border bg-card min-w-0 my-4">
      {(label || lang) && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="font-mono text-[10px] text-muted-foreground">{label ?? ""}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{lang ?? ""}</span>
        </div>
      )}
      <div className="relative">
        <pre className="font-mono text-[11.5px] leading-relaxed p-4 overflow-x-auto whitespace-pre">
          <code>{code}</code>
        </pre>
        <CopyButton text={code} className="absolute top-2 right-2 bg-background" />
      </div>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[0.85em] bg-accent px-1 py-0.5 text-foreground">{children}</code>;
}
