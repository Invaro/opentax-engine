import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { ConsoleApp } from "@/components/console-app";

export const metadata: Metadata = {
  title: "Console | OpenTax by Invaro",
  description: "Your API key, your usage, your first call. Sign in with an email code.",
  robots: { index: false },
};

export default function ConsolePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="console" />
      <ConsoleApp />
    </main>
  );
}
