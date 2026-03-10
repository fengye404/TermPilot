import { resolveDefaultWebDir, startRelayServer } from "./server";

void startRelayServer({ webDir: resolveDefaultWebDir(import.meta.url) }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
