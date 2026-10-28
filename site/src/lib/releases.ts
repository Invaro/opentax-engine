import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get } from "@vercel/blob";
import { readJson } from "@/lib/accounts";

/**
 * Licensed library releases: packed tarballs of core, corpus-us-federal,
 * compose and solve, uploaded by scripts/publish-release.mjs.
 *
 *   releases/index.json                 Release[] newest first
 *   releases/<tag>/<file>.tgz           the tarballs
 */

export type ReleaseFile = { name: string; package: string; version: string; sha256: string; size: number };
export type Release = {
  tag: string;
  publishedAt: string;
  gitCommit: string;
  corpusVersion: string;
  corpusMerkleRoot: string;
  notes?: string;
  files: ReleaseFile[];
};

export async function listReleases(): Promise<Release[]> {
  return (await readJson<Release[]>("releases/index.json")) ?? [];
}

const LOCAL_STORE = !process.env.BLOB_READ_WRITE_TOKEN && process.env.NODE_ENV !== "production";

/** The tarball's bytes as a stream, or null if the release or file doesn't exist. */
export async function openReleaseFile(tag: string, name: string): Promise<ReadableStream<Uint8Array> | null> {
  const release = (await listReleases()).find((r) => r.tag === tag);
  if (!release?.files.some((f) => f.name === name)) return null;
  const pathname = `releases/${tag}/${name}`;
  if (LOCAL_STORE) {
    try {
      const bytes = await readFile(join(process.cwd(), ".data", pathname));
      return new Response(bytes).body;
    } catch {
      return null;
    }
  }
  const res = await get(pathname, { access: "private", useCache: false });
  return res?.stream ?? null;
}
