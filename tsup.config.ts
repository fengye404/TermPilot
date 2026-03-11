import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: false,
  outDir: "dist",
  sourcemap: false,
  splitting: false,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
