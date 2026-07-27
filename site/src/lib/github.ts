export const REPO = "Invaro/opentax-engine";
export const REPO_URL = `https://github.com/${REPO}`;

export type RepoStats = {
  stars: number;
  forks: number;
  watchers: number;
  issues: number;
};

export const REPO_API = `https://api.github.com/repos/${REPO}`;

/** How often the prerendered page re-fetches the counters. */
export const REVALIDATE_SECONDS = 600;

/**
 * Public repo counters, rendered into the page. Unauthenticated GitHub API, so
 * it's rate-limited per egress IP, hence the ten-minute revalidate rather than
 * a per-request fetch. Allowed to fail: every caller degrades to a plain link
 * when this returns null.
 *
 * This is the floor, not the ceiling. `<LiveStars>` tops the number up in the
 * browser so a visitor sitting on a cached copy still sees the real count.
 */
export async function fetchRepoStats(): Promise<RepoStats | null> {
  try {
    const res = await fetch(REPO_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.stargazers_count !== "number") return null;
    return {
      stars: data.stargazers_count,
      forks: data.forks_count ?? 0,
      watchers: data.subscribers_count ?? 0,
      issues: data.open_issues_count ?? 0,
    };
  } catch {
    return null;
  }
}

export const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const exact = (n: number) => Intl.NumberFormat("en").format(n);
