import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "../package.json";

const appVersion = process.env.VITE_APP_VERSION?.trim() || packageJson.version;
// Keep the default build id aligned with relay runtime so npm installs do not
// ship a frontend build marker that the deployed relay can never report back.
const appBuildId = process.env.VITE_APP_BUILD_ID?.trim()
  || process.env.TERMPILOT_APP_BUILD_ID?.trim()
  || appVersion;

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
