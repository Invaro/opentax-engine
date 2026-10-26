import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AccountApp } from "@/components/account-app";

export const metadata: Metadata = {
  title: "Account | OpenTax by Invaro",
  robots: { index: false },
};

export default function AccountPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader active="account" />
      <AccountApp />
    </main>
  );
}
