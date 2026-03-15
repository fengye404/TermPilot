import { pathToFileURL } from "node:url";

import { resolveDefaultWebDir, startRelayServer } from "./server";

void startRelayServer({ webDir: resolveDefaultWebDir(pathToFileURL(process.argv[1] ?? process.cwd()).href) }).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
