import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relayBundlePath = path.join(rootDir, "dist", "relay-bin.js");
const outputName = process.platform === "win32" ? "termpilot-relay.exe" : "termpilot-relay";
const outputPath = path.join(rootDir, "dist", outputName);

if (!existsSync(relayBundlePath)) {
  throw new Error("未找到 dist/relay-bin.cjs，请先执行 pnpm build。");
}

const bundle = readFileSync(relayBundlePath, "utf8");
const shebang = "#!/usr/bin/env node\n";
const normalizedBundle = bundle.startsWith(shebang) ? bundle : `${shebang}${bundle}`;
writeFileSync(outputPath, normalizedBundle, "utf8");
chmodSync(outputPath, 0o755);

console.log(`已生成 relay 可执行文件: ${outputPath}`);
