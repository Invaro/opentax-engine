import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import changelog from "@/lib/docs/changelog.json";

export const metadata: Metadata = {
  title: "Changelog | OpenTax by Invaro",
  description: "New in OpenTax, newest first.",
};

type Block = { kind: "p" | "h3"; text: string } | { kind: "ul"; items: string[] };
type Post = { date: string; title: string; blocks: Block[] };

/** The changelog's inline markdown: `code` and [text](url), nothing else. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<code key={m.index}>{m[1]}</code>);
    else {
      const href = m[3];
      out.push(
        href.startsWith("https://opentax.invaro.ai/") ? (
          <Link key={m.index} href={href.slice("https://opentax.invaro.ai".length)}>
            {m[2]}
          </Link>
        ) : (
          <a key={m.index} href={href}>
            {m[2]}
          </a>
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export default function ChangelogPage() {
  const posts = changelog.posts as Post[];
  return (
    <main className="min-h-screen">
      <SiteHeader active="changelog" />
      <div className="container py-14 md:py-20">
        <article className="max-w-[720px] docs-prose">
          <h1>Changelog</h1>
          {changelog.intro.map((p) => (
            <p key={p} className="lede">
              {inline(p)}
            </p>
          ))}
          {posts.map((post) => (
            <section key={`${post.date}-${post.title}`} className="mt-16 pt-10 border-t border-border first-of-type:border-t-0">
              <div className="kicker">{post.date}</div>
              <h2 id={slug(post.title)} className="!mt-2">
                {post.title}
              </h2>
              {post.blocks.map((b, i) =>
                b.kind === "h3" ? (
                  <h3 key={i} className="!text-[15px] !font-medium !text-foreground">
                    {b.text}
                  </h3>
                ) : b.kind === "ul" ? (
                  <ul key={i}>
                    {b.items.map((item) => (
                      <li key={item}>{inline(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{inline(b.text)}</p>
                ),
              )}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
