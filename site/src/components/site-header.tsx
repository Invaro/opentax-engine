import Link from "next/link";
import { InvaroLogo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GithubStars } from "@/components/github-stars";
import { AccountLink } from "@/components/account-link";

const NAV = [
  { label: "Docs", href: "/docs" },
  { label: "Pricing", href: "/pricing" },
  { label: "Changelog", href: "/changelog" },
] as const;

/** The header every non-landing page shares. */
export function SiteHeader({ active }: { active?: "docs" | "console" | "pricing" | "changelog" | "account" }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background-semi-transparent border-b border-border">
      <div className="container relative flex items-center justify-between h-14">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="OpenTax home" className="flex items-center gap-2.5">
            <InvaroLogo size={15} />
            <span className="text-[15px] tracking-tight leading-none">opentax</span>
          </Link>
          <span className="hidden lg:block w-px h-3.5 bg-border mx-0.5" />
          <Link
            href="https://invaro.ai"
            className="hidden lg:block text-xs text-muted-foreground leading-none hover:text-foreground transition-colors whitespace-nowrap"
          >
            by Invaro
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <nav aria-label="Site" className="hidden sm:flex items-center gap-5 text-xs mr-2">
            {NAV.map((n) => {
              const isActive =
                (active === "docs" && n.href === "/docs") ||
                (active === "pricing" && n.href === "/pricing") ||
                (active === "changelog" && n.href === "/changelog");
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
          <Link href="/pricing" className="sm:hidden text-xs text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </Link>
          <ThemeToggle />
          <GithubStars />
          <AccountLink />
        </div>
      </div>
    </header>
  );
}
