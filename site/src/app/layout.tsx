import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { Hedvig_Letters_Sans, Hedvig_Letters_Serif } from "next/font/google";
import { ConsoleEgg } from "@/components/console-egg";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "next-themes";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const hedvigSans = Hedvig_Letters_Sans({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-hedvig-sans",
  fallback: ["system-ui", "arial"],
});

const hedvigSerif = Hedvig_Letters_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-hedvig-serif",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opentax.invaro.ai"),
  title: "OpenTax by Invaro | Exact US tax calculations for any agent",
  description:
    "OpenTax does the tax math for AI models, with every line cited to the law. With it, Claude Sonnet gets 96% of TaxCalcBench returns exactly right, against 6% on its own.",
  authors: [{ name: "Invaro Inc." }],
  keywords: [
    "tax engine",
    "MCP server",
    "AI tax agent",
    "TaxCalcBench",
    "deterministic tax computation",
  ],
  openGraph: {
    title: "OpenTax: exact US tax calculations for any agent",
    description:
      "With OpenTax, the same model goes from 6% to 96% of TaxCalcBench returns exactly right, every line cited to the law.",
    url: "https://opentax.invaro.ai",
    siteName: "OpenTax by Invaro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenTax: exact US tax calculations for any agent",
    description:
      "With OpenTax, the same model goes from 6% to 96% of TaxCalcBench returns exactly right, every line cited to the law.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${hedvigSans.variable} ${hedvigSerif.variable} ${GeistMono.variable}`}
    >
      <body className="bg-background overflow-x-hidden font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <PostHogProvider>
            <ConsoleEgg />
            {children}
          </PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
