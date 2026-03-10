import { runAgentCli } from "./cli";

void runAgentCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
