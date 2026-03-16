import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentBundlePath = path.join(rootDir, "dist", "agent-bin.js");
const outputName = process.platform === "win32" ? "termpilot-agent.exe" : "termpilot-agent";
const outputPath = path.join(rootDir, "dist", outputName);

if (!existsSync(agentBundlePath)) {
  throw new Error("未找到 dist/agent-bin.js，请先执行 pnpm build。");
}

const bundle = readFileSync(agentBundlePath, "utf8");
const shebang = "#!/usr/bin/env node\n";
const normalizedBundle = bundle.startsWith(shebang) ? bundle : `${shebang}${bundle}`;
writeFileSync(outputPath, normalizedBundle, "utf8");
chmodSync(outputPath, 0o755);

console.log(`已生成 agent 可执行文件: ${outputPath}`);
