import { runAgentCli } from "./cli";

function getAgentArgv(): string[] {
  const args = process.argv.slice(1);
  const [first = ""] = args;
  const knownCommands = new Set([
    "start",
    "status",
    "stop",
    "daemon",
    "create",
    "list",
    "kill",
    "attach",
    "doctor",
    "pair",
    "grants",
    "audit",
    "revoke",
    "run",
    "help",
    "--help",
  ]);

  const normalizedArgs = knownCommands.has(first) ? args : args.slice(1);
  const [command = ""] = normalizedArgs;
  if (!command || command.startsWith("--")) {
    return ["start", ...normalizedArgs];
  }

  return normalizedArgs;
}

void runAgentCli(getAgentArgv()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
