import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAgentCli } from "../agent/src/cli";
import { startRelayServer } from "../relay/src/server";

interface EnvFlag {
  flag: string;
  envName: string;
}

const AGENT_ENV_FLAGS: EnvFlag[] = [
  { flag: "--relay", envName: "TERMPILOT_RELAY_URL" },
  { flag: "--device-id", envName: "TERMPILOT_DEVICE_ID" },
  { flag: "--agent-token", envName: "TERMPILOT_AGENT_TOKEN" },
  { flag: "--poll-interval", envName: "TERMPILOT_POLL_INTERVAL_MS" },
  { flag: "--home", envName: "TERMPILOT_HOME" },
];

const RELAY_ENV_FLAGS: EnvFlag[] = [
  { flag: "--host", envName: "HOST" },
  { flag: "--port", envName: "PORT" },
  { flag: "--agent-token", envName: "TERMPILOT_AGENT_TOKEN" },
  { flag: "--client-token", envName: "TERMPILOT_CLIENT_TOKEN" },
  { flag: "--database-url", envName: "DATABASE_URL" },
  { flag: "--pairing-ttl", envName: "TERMPILOT_PAIRING_TTL_MINUTES" },
];

function printHelp(): void {
  console.log(`TermPilot 用法：

  termpilot relay [--host 0.0.0.0] [--port 8787]
  termpilot agent [--relay ws://127.0.0.1:8787/ws] [--device-id pc-main]
  termpilot agent status
  termpilot agent stop
  termpilot claude code
  termpilot run -- claude code

  termpilot pair [--device-id pc-main]
  termpilot create --name claude-main [--cwd /path/to/project]
  termpilot list
  termpilot attach --sid <sid>
  termpilot kill --sid <sid>
  termpilot grants [--device-id pc-main]
  termpilot audit [--device-id pc-main] [--limit 20]
  termpilot revoke --token <accessToken> [--device-id pc-main]
  termpilot doctor
`);
}

function applyEnvFlags(argv: string[], mappings: EnvFlag[]): string[] {
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const mapping = mappings.find((item) => item.flag === current);
    if (!mapping) {
      rest.push(current);
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${mapping.flag} 需要一个值。`);
    }
    process.env[mapping.envName] = value;
    index += 1;
  }

  return rest;
}

function resolveBundledWebDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app/dist");
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...rest] = normalizedArgv;

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  switch (command) {
    case "relay": {
      const relayArgs = applyEnvFlags(rest, RELAY_ENV_FLAGS);
      if (relayArgs.includes("--help")) {
        printHelp();
        return;
      }
      await startRelayServer({ webDir: resolveBundledWebDir() });
      return;
    }
    case "agent": {
      const agentArgs = applyEnvFlags(rest, AGENT_ENV_FLAGS);
      if (agentArgs[0] === "status" || agentArgs[0] === "stop" || agentArgs[0] === "daemon") {
        await runAgentCli(agentArgs);
      } else {
        await runAgentCli(["start", ...agentArgs]);
      }
      return;
    }
    case "agent-daemon": {
      await runAgentCli(["daemon", ...rest]);
      return;
    }
    case "pair":
    case "create":
    case "list":
    case "kill":
    case "attach":
    case "grants":
    case "audit":
    case "revoke":
    case "doctor": {
      const agentArgs = applyEnvFlags(rest, AGENT_ENV_FLAGS);
      await runAgentCli([command, ...agentArgs]);
      return;
    }
    default:
      await runAgentCli([command, ...rest]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
