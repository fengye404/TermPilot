import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      cli: "src/cli.ts",
    },
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
  },
  {
    entry: {
      "relay-bin": "relay/src/relay-bin.ts",
      "agent-bin": "agent/src/agent-bin.ts",
    },
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
  },
]);
