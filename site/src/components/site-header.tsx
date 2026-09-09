import Link from "next/link";
import { InvaroLogo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GithubStars } from "@/components/github-stars";

const NAV = [
  { label: "Docs", href: "/docs" },
  { label: "Tools", href: "/docs/tools" },
  { label: "Coverage", href: "/docs/coverage" },
  { label: "Console", href: "/console" },
] as const;

/** The header every non-landing page shares. */
export function SiteHeader({ active }: { active?: "docs" | "console" }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background-semi-transparent border-b border-border">
      <div className="container relative flex items-center justify-between h-14">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="OpenTax home" className="flex items-center gap-2.5">
            <InvaroLogo size={15} />
            <span className="text-[15px] tracking-tight leading-none">opentax</span>
          </Link>
          <span className="hidden sm:block w-px h-3.5 bg-border mx-0.5" />
          <Link
            href="https://invaro.ai"
            className="hidden sm:block text-xs text-muted-foreground leading-none hover:text-foreground transition-colors whitespace-nowrap"
          >
            by Invaro
          </Link>
        </div>
        <nav aria-label="Site" className="hidden md:flex items-center gap-6 text-xs absolute left-1/2 -translate-x-1/2">
          {NAV.map((n) => {
            const isActive =
              (active === "docs" && n.href.startsWith("/docs") && n.label === "Docs") ||
              (active === "console" && n.href === "/console");
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`transition-colors whitespace-nowrap ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <GithubStars />
          <Link
            href="/console"
            className="h-8 px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center whitespace-nowrap"
          >
            Get a key
          </Link>
        </div>
      </div>
    </header>
  );
}
