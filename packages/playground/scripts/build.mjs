/**
 * Build the playground into ONE self-contained HTML file: the engine, the
 * full rule corpus, and the verifier bundled and inlined — no network, no
 * server, no external assets. `dist/index.html` opens from a file:// URL.
 *
 *   pnpm -F @invaro/opentax-playground build
 */

import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const result = await build({
  entryPoints: [path.join(root, "src", "main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022", // bigint literals in the engine
  minify: true,
  write: false,
  legalComments: "none",
});

const js = result.outputFiles[0].text;
const html = readFileSync(path.join(root, "src", "page.html"), "utf8").replace(
  '<script type="module" src="./main.ts"></script>',
  () => `<script>\n${js}</script>`,
);

mkdirSync(path.join(root, "dist"), { recursive: true });
const out = path.join(root, "dist", "index.html");
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} KiB, fully self-contained)`);
