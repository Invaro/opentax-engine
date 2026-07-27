import Link from "next/link";
import { GitHubMark } from "./brand-icons";
import { DitherField } from "./dither-field";
import { LiveStars } from "./live-stars";
import { REPO_URL, exact, fetchRepoStats } from "@/lib/github";

function Star({ size = 12 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={(size * 15) / 18}
      viewBox="0 0 18 15"
      fill="none"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M6.375 11.683 9 10.186l2.625 1.517-.688-2.837 2.313-1.891-3.042-.257L9 4.038l-1.208 2.66-3.042.257 2.313 1.91-.688 2.818Zm-2.52 3.29 1.353-5.536L.667 5.714l6-.493L9 0l2.333 5.221 6 .493-4.541 3.723 1.354 5.537L9 12.037l-5.146 2.935Z"
      />
    </svg>
  );
}

/** Header star button: GitHub mark + live count, split like a shields badge. */
export async function GithubStars() {
  const stats = await fetchRepoStats();

  return (
    <Link
      href={REPO_URL}
      title="Star opentax-engine on GitHub"
      className="group hidden sm:flex border border-border h-8 font-mono text-xs items-center text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
    >
      <span className="flex h-full items-center gap-1.5 px-2.5 border-r border-border group-hover:bg-accent transition-colors">
        <GitHubMark size={12} />
        star
      </span>
      <span className="px-2.5 tabular-nums text-foreground">
        {stats ? (
          <>
            <LiveStars initial={stats.stars} />
            <span className="sr-only"> stars</span>
          </>
        ) : (
          "github"
        )}
      </span>
    </Link>
  );
}

/** Hero secondary CTA: the source link, wearing its star count. */
export async function SourceButton() {
  const stats = await fetchRepoStats();

  return (
    <Link
      href={REPO_URL}
      className="group border border-border h-11 px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground flex items-center justify-center gap-2.5 whitespace-nowrap"
    >
      Read the source
      {stats && (
        <span className="flex items-center gap-1 font-mono text-xs text-brand tabular-nums">
          <Star size={11} />
          <LiveStars initial={stats.stars} />
        </span>
      )}
    </Link>
  );
}

/** Closing proof block: the repo counters, large and unembarrassed. */
export async function OpenSourceProof() {
  const stats = await fetchRepoStats();

  const tiles = [
    {
      n: stats ? <LiveStars initial={stats.stars} format="exact" /> : "n/a",
      d: "stars on GitHub",
      tone: "text-brand",
    },
    { n: stats ? exact(stats.forks) : "n/a", d: "forks" },
    { n: "AGPL-3.0", d: "plus a commercial license" },
    { n: "29", d: "states, every line cited", tone: "text-brand-jade" },
  ];

  return (
    <div className="relative border border-border overflow-hidden">
      <DitherField art="birds" tone="jade" placement="band" />

      <div className="relative p-8 md:p-12">
        <div className="flex flex-col items-center text-center">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-5">
            built in the open
          </span>
          <h2 className="text-[28px] md:text-[44px] font-serif leading-tight mb-4">
            {stats ? (
              <>
                <span className="tabular-nums">
                  <LiveStars initial={stats.stars} format="exact" /> people
                </span>{" "}
                have starred{" "}
                <span className="italic">the engine</span>
              </>
            ) : (
              <>
                The whole engine, <span className="italic">in public</span>
              </>
            )}
          </h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-[560px]">
            Every rule, every citation, every test case is in the repository, including the
            benchmark harness that produced the 96%. Read it, fork it, run it against your own
            returns, and tell us where we&apos;re wrong.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-border mt-9">
          {tiles.map((t) => (
            <div key={t.d} className="border-b border-r border-border p-4 md:p-6 text-center">
              <div
                className={`font-serif text-2xl md:text-[32px] leading-none mb-2 tabular-nums ${t.tone ?? ""}`}
              >
                {t.n}
              </div>
              <div className="font-mono text-[9px] md:text-[10px] text-muted-foreground leading-relaxed">
                {t.d}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-8">
          <Link
            href={REPO_URL}
            className="h-11 px-6 text-sm font-medium bg-foreground text-background hover:opacity-90 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Star size={13} />
            Star on GitHub
          </Link>
          <Link
            href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
            className="border border-border bg-background h-11 px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground flex items-center justify-center whitespace-nowrap"
          >
            Contribute a rule
          </Link>
        </div>
      </div>
    </div>
  );
}
