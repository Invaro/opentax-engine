import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SignIn } from "@/components/sign-in";

export const metadata: Metadata = {
  title: "Sign in | OpenTax by Invaro",
  description: "Sign in to OpenTax with a code sent to your email.",
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <SignIn />
    </main>
  );
}
