/**
 * --project-inflation / --project-wage-growth: compute a tax year after 2027
 * on the published corpus projected at assumed index growth (see the corpus
 * package's projection.ts). Without the flag a 2028+ date refuses as before.
 */

import type { LoadedCorpus } from "@invaro/opentax-core";
import { getCorpus, getProjectedFederalCorpus, LAST_PUBLISHED_YEAR } from "@invaro/opentax-corpus-us-federal";

export type ProjectionFlags = { projectInflation?: string; projectWageGrowth?: string };

export function corpusForFlags(asOf: string, flags: ProjectionFlags): LoadedCorpus {
  const year = Number(asOf.slice(0, 4));
  if (flags.projectInflation === undefined) {
    if (flags.projectWageGrowth !== undefined) throw new Error("--project-wage-growth needs --project-inflation");
    return getCorpus();
  }
  if (year <= LAST_PUBLISHED_YEAR)
    throw new Error(`--project-inflation is for tax years after ${LAST_PUBLISHED_YEAR}; ${year} is published law — drop the flag`);
  return getProjectedFederalCorpus({ year, inflationPercent: String(flags.projectInflation), wageGrowthPercent: flags.projectWageGrowth });
}

export function projectionLabel(asOf: string, flags: ProjectionFlags, corpus: LoadedCorpus) {
  if (flags.projectInflation === undefined) return undefined;
  return {
    taxYear: Number(asOf.slice(0, 4)),
    inflationPercent: String(flags.projectInflation),
    wageGrowthPercent: String(flags.projectWageGrowth ?? flags.projectInflation),
    corpusVersion: corpus.version,
    warning:
      "PROJECTED, NOT PUBLISHED LAW: every inflation-indexed amount is the 2027 amount carried forward by its statutory indexing formula at the assumed rates",
  };
}

export const PROJECTION_HELP = {
  inflation: "project a tax year after 2027: assumed annual C-CPI-U growth in percent (e.g. 2.5); the answer is labeled projected",
  wage: "with --project-inflation: assumed annual average wage index growth in percent (social security wage base); default: the inflation rate",
};
