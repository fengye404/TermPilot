import { getRelayRuntimeModuleUrl } from "./runtime-path.js";
import { resolveDefaultWebDir, startRelayServer } from "./server";

void startRelayServer({ webDir: resolveDefaultWebDir(getRelayRuntimeModuleUrl()) }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
