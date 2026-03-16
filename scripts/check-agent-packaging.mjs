import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = "/Users/fengye/workspace/TermPilot";

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} 失败 (exit ${code})\n${stdout}\n${stderr}`));
    });
  });
}

async function assertAgentBundleExists() {
  if (!existsSync(path.join(ROOT, "dist", "agent-bin.js"))) {
    throw new Error("未找到 dist/agent-bin.js");
  }
  if (!existsSync(path.join(ROOT, "dist", "termpilot-agent"))) {
    throw new Error("未找到 dist/termpilot-agent");
  }
}

async function assertAgentExecutableRuns() {
  const agentHome = mkdtempSync(path.join(tmpdir(), "termpilot-agent-bin-"));
  try {
    const { stdout } = await run(path.join(ROOT, "dist", "termpilot-agent"), ["status"], {
      TERMPILOT_HOME: agentHome,
    });
    if (!stdout.includes("后台 agent 当前未运行")) {
      throw new Error(`agent 可执行文件输出不符合预期:\n${stdout}`);
    }
  } finally {
    rmSync(agentHome, { recursive: true, force: true });
  }
}

async function main() {
  await assertAgentBundleExists();
  await assertAgentExecutableRuns();
  console.log("agent packaging checks ok");
}

await main();
