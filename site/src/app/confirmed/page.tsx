import Link from "next/link";
import { InvaroLogo } from "@/components/logo";

export const metadata = { title: "OpenTax | Subscription confirmed" };

export default async function Confirmed({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const ok = (await searchParams).ok !== "0";
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="flex items-center gap-2.5 mb-10">
        <InvaroLogo size={15} />
        <span className="font-mono text-[15px] tracking-tight">opentax</span>
      </div>
      <h1 className="text-[36px] md:text-[64px] font-serif leading-tight mb-4">
        {ok ? (
          <>
            You&apos;re in. <span className="italic">Confirmed.</span>
          </>
        ) : (
          <>
            That link has <span className="italic">expired.</span>
          </>
        )}
      </h1>
      <p className="text-sm md:text-base text-muted-foreground max-w-[460px] mb-8">
        {ok
          ? "New features and other things worth knowing: you'll hear it first. Nothing else, ever."
          : "Confirmation links live for 48 hours. Head back and sign up again, it takes five seconds."}
      </p>
      <Link
        href="/"
        className="border border-border h-11 px-6 text-sm font-medium hover:bg-accent hover:text-accent-foreground flex items-center"
      >
        Back to OpenTax
      </Link>
    </main>
  );
}
