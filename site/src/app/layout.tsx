import "./globals.css";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Instrument_Serif } from "next/font/google";
import { ConsoleEgg } from "@/components/console-egg";
import { PostHogProvider } from "@/components/posthog-provider";
import { ThemeProvider } from "next-themes";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opentax.invaro.ai"),
  title: "OpenTax by Invaro | Turn any AI into a precise tax preparer",
  description:
    "The deterministic, open-source tax engine for AI agents. Highest score ever recorded on TaxCalcBench: 96% exact returns, versus 6% for the same model alone. One MCP URL, any agent.",
  authors: [{ name: "Invaro Inc." }],
  keywords: [
    "tax engine",
    "MCP server",
    "AI tax agent",
    "TaxCalcBench",
    "deterministic tax computation",
    "open source tax software",
  ],
  openGraph: {
    title: "OpenTax: turn any AI into a precise tax preparer",
    description:
      "Deterministic, open-source, and the highest-scoring tax engine ever measured: 6% → 96% exact returns on TaxCalcBench with the same model.",
    url: "https://opentax.invaro.ai",
    siteName: "OpenTax by Invaro",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenTax: turn any AI into a precise tax preparer",
    description:
      "6% → 96% exact tax returns with the same model. Deterministic, open-source, highest score ever recorded on TaxCalcBench.",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="font-sans">
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
