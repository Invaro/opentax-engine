"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const cls =
  "h-8 px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center whitespace-nowrap";

/** The header's account button: "Account" when signed in, "Sign in" otherwise. */
export function AccountLink() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { signedIn: boolean }) => setSignedIn(j.signedIn))
      .catch(() => setSignedIn(null));
  }, []);
  return (
    <Link href="/account" className={cls}>
      {signedIn === false ? "Sign in" : "Account"}
    </Link>
  );
}
