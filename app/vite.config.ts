import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "TermPilot",
        short_name: "TermPilot",
        description: "手机查看和控制电脑上的 tmux 终端会话。",
        theme_color: "#0f172a",
        background_color: "#020617",
        display: "standalone",
        start_url: "/",
        icons: [],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
