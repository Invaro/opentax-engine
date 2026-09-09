"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { title: string; items: Array<{ label: string; href: string }> };

export function DocsNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Documentation" className="text-xs">
      {groups.map((g) => (
        <div key={g.title} className="mb-6">
          <div className="font-mono text-[10px] text-muted-foreground mb-2">{g.title}</div>
          <ul className="space-y-1">
            {g.items.map((it) => {
              const active = path === it.href;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    className={`block border-l pl-3 py-0.5 transition-colors ${
                      active
                        ? "border-foreground text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Compact horizontal variant for small screens. */
export function DocsNavRow({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const items = groups.flatMap((g) => g.items);
  return (
    <div className="lg:hidden -mx-6 px-6 overflow-x-auto border-b border-border">
      <div className="flex gap-4 py-2.5 w-max text-xs">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`whitespace-nowrap ${path === it.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
