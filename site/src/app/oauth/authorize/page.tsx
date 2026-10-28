import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthorizeApp } from "@/components/authorize-app";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Connect your agent | OpenTax by Invaro",
  robots: { index: false },
};

export default function AuthorizePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <Suspense>
        <AuthorizeApp />
      </Suspense>
    </main>
  );
}
