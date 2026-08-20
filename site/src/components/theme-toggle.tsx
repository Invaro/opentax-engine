"use client";

import * as React from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-[66px] border border-border" />;
  }

  return (
    <div className="inline-flex items-center border border-border">
      <button
        type="button"
        aria-label="Light theme"
        onClick={() => setTheme("light")}
        className={`flex h-8 w-8 items-center justify-center transition-colors ${
          theme === "light"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Dark theme"
        onClick={() => setTheme("dark")}
        className={`flex h-8 w-8 items-center justify-center border-l border-border transition-colors ${
          theme === "dark"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      </button>
    </div>
  );
}
