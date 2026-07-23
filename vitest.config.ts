import { defineConfig } from "vitest/config";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@invaro/opentax-core": path.resolve(root, "packages/core/src/index.ts"),
      "@invaro/opentax-corpus-us-federal": path.resolve(
        root,
        "packages/corpus-us-federal/src/index.ts",
      ),
      "@invaro/opentax-solve": path.resolve(root, "packages/solve/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
