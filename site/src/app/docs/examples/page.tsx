import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { EXAMPLES } from "@/lib/docs";

export const metadata: Metadata = { title: "Examples" };

export default function ExamplesPage() {
  return (
    <>
      <div className="kicker">reference · {EXAMPLES.length} captured pairs</div>
      <h1>
        Real requests, <em className="not-italic text-muted-foreground">real responses.</em>
      </h1>
      <p className="lede">
        Captured from the engine, not typed by hand. Two of them are refusals, so you can see what &quot;no&quot;
        looks like before you hit it in production.
      </p>
      <ul className="!list-none !pl-0 grid sm:grid-cols-2 gap-x-6 mb-10">
        {EXAMPLES.map((e, i) => (
          <li key={e.file}>
            <a href={`#ex-${i + 1}`} className="text-xs">
              <span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span> {e.title}
              {!e.ok || e.isError ? <span className="ml-1.5 font-mono text-[10px] text-brand">refusal</span> : null}
            </a>
          </li>
        ))}
      </ul>
      {EXAMPLES.map((e, i) => (
        <section key={e.file} id={`ex-${i + 1}`} className="scroll-mt-20 mb-12">
          <h2 className="!mt-0">
            <span className="font-mono text-muted-foreground text-base mr-2">{String(i + 1).padStart(2, "0")}</span>
            {e.title}
          </h2>
          <p>
            <Link href={`/docs/tools/${e.tool}`} className="font-mono text-[0.9em]">{e.tool}</Link>
            {e.proofTrimmed ? " · proof tree omitted for length" : ""}
          </p>
          <CodeBlock label={`POST /v1/tools/${e.tool}`} lang="json" code={JSON.stringify(e.arguments, null, 2)} />
          <CodeBlock label={e.isError ? "response (composer refusal)" : "response"} lang="json" code={JSON.stringify(e.result, null, 2)} />
        </section>
      ))}
    </>
  );
}
