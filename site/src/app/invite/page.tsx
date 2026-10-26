import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { InviteAccept } from "@/components/invite-accept";

export const metadata: Metadata = {
  title: "Join a Firm plan | OpenTax by Invaro",
  robots: { index: false },
};

export default function InvitePage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <InviteAccept />
    </main>
  );
}
