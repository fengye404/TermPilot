import { runRelayCli } from "./cli.js";

function getRelayArgv(): string[] {
  const args = process.argv.slice(1);
  const first = args[0] ?? "";
  const knownCommands = new Set(["start", "run", "daemon", "relay-daemon", "stop"]);
  if (!knownCommands.has(first)) {
    return args.slice(1);
  }
  return args;
}

void runRelayCli(getRelayArgv()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
