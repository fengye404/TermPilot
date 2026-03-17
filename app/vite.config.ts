import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "../package.json";

function resolveGitSha(): string {
  if (process.env.GITHUB_SHA?.trim()) {
    return process.env.GITHUB_SHA.trim().slice(0, 7);
  }

  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: new URL(".", import.meta.url),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const appVersion = process.env.VITE_APP_VERSION?.trim() || packageJson.version;
const gitSha = resolveGitSha();
const appBuildId = process.env.VITE_APP_BUILD_ID?.trim() || (gitSha ? `${appVersion}+${gitSha}` : appVersion);

process.env.VITE_APP_VERSION = appVersion;
process.env.VITE_APP_BUILD_ID = appBuildId;

export default defineConfig({
  define: {
    __TERMPILOT_APP_VERSION__: JSON.stringify(appVersion),
    __TERMPILOT_APP_BUILD_ID__: JSON.stringify(appBuildId),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
