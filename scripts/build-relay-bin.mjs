import { chmodSync, copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relayBundlePath = path.join(rootDir, "dist", "relay-bin.cjs");
const outputName = process.platform === "win32" ? "termpilot-relay.exe" : "termpilot-relay";
const outputPath = path.join(rootDir, "dist", outputName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    cwd: rootDir,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 失败`);
  }
}

if (!existsSync(relayBundlePath)) {
  throw new Error("未找到 dist/relay-bin.js，请先执行 pnpm build。");
}

const tempDir = mkdtempSync(path.join(tmpdir(), "termpilot-relay-sea-"));

try {
  const seaConfigPath = path.join(tempDir, "relay-sea-config.json");
  const blobPath = path.join(tempDir, "relay-prep.blob");
  writeFileSync(seaConfigPath, JSON.stringify({
    main: relayBundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
  }, null, 2), "utf8");

  run(process.execPath, ["--experimental-sea-config", seaConfigPath]);
  rmSync(outputPath, { force: true });
  copyFileSync(process.execPath, outputPath);
  chmodSync(outputPath, 0o755);

  if (process.platform === "darwin") {
    spawnSync("codesign", ["--remove-signature", outputPath], { stdio: "ignore" });
  }

  run("pnpm", [
    "exec",
    "postject",
    outputPath,
    "NODE_SEA_BLOB",
    blobPath,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ]);

  if (process.platform === "darwin") {
    run("codesign", ["--sign", "-", outputPath]);
  }

  chmodSync(outputPath, 0o755);
  console.log(`已生成 relay 可执行文件: ${outputPath}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
