import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/docs";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = "https://opentax.invaro.ai";
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/docs/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...TOOLS.map((t) => ({ url: `${base}/docs/tools/${t.name}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${base}/docs/examples`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/docs/mcp`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/docs/coverage`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/docs/returns`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/docs/validation`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
