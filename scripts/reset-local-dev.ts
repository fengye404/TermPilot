import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SessionState = {
  sid?: string;
  tmuxSessionName?: string;
};

type AgentState = {
  sessions?: SessionState[];
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_LOCAL_HOME = "/tmp/termpilot-local";

function getTargetHome(): string {
  return process.env.TERMPILOT_HOME?.trim() || DEFAULT_LOCAL_HOME;
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `command failed: ${command} ${args.join(" ")}`));
    });
  });
}

async function runCommandIgnoringFailure(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await runCommand(command, args, env);
  } catch {
    // best-effort cleanup
  }
}

function readTmuxSessionNames(home: string): string[] {
  const statePath = path.join(home, "state.json");
  if (!existsSync(statePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(statePath, "utf8")) as AgentState;
    return (parsed.sessions ?? [])
      .map((session) => session.tmuxSessionName?.trim() ?? "")
      .filter((name): name is string => name.length > 0);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const home = getTargetHome();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERMPILOT_HOME: home,
  };

  const tmuxSessionNames = readTmuxSessionNames(home);

  await runCommandIgnoringFailure("node", ["dist/cli.js", "agent", "stop"], env);
  await runCommandIgnoringFailure("node", ["dist/cli.js", "relay", "stop"], env);

  for (const tmuxSessionName of tmuxSessionNames) {
    await runCommandIgnoringFailure("tmux", ["kill-session", "-t", tmuxSessionName], process.env);
  }

  rmSync(home, { recursive: true, force: true });
  console.log(`已重置本地开发环境: ${home}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
