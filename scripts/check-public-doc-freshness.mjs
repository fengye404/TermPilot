import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const MAP_PATH = path.join(ROOT, ".agent/public-doc-map.json");

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function getLines(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getWorkingTreeChangedFiles() {
  return new Set([
    ...getLines(runGit(["diff", "--name-only", "--relative"])),
    ...getLines(runGit(["diff", "--name-only", "--relative", "--cached"])),
    ...getLines(runGit(["ls-files", "--others", "--exclude-standard"])),
  ]);
}

function getCiChangedFiles() {
  if (process.env.GITHUB_BASE_REF) {
    const mergeBase = runGit(["merge-base", "HEAD", `origin/${process.env.GITHUB_BASE_REF}`]);
    return new Set(getLines(runGit(["diff", "--name-only", "--relative", `${mergeBase}...HEAD`])));
  }

  try {
    const parent = runGit(["rev-parse", "HEAD^"]);
    return new Set(getLines(runGit(["diff", "--name-only", "--relative", `${parent}..HEAD`])));
  } catch {
    return new Set();
  }
}

function getChangedFiles() {
  const workingTree = getWorkingTreeChangedFiles();
  if (workingTree.size > 0) {
    return workingTree;
  }
  if (process.env.CI === "true") {
    return getCiChangedFiles();
  }
  return new Set();
}

function matchesPattern(filePath, pattern) {
  if (pattern.endsWith("/")) {
    return filePath.startsWith(pattern);
  }
  return filePath === pattern;
}

if (!existsSync(MAP_PATH)) {
  throw new Error(`missing public doc map: ${path.relative(ROOT, MAP_PATH)}`);
}

const changedFiles = getChangedFiles();
if (changedFiles.size === 0) {
  console.log("public doc freshness check skipped (no changed files detected)");
  process.exit(0);
}

const rules = JSON.parse(readFileSync(MAP_PATH, "utf8"));
const errors = [];

for (const rule of rules) {
  const touchedImplementation = Array.from(changedFiles).filter((filePath) =>
    rule.implementation.some((pattern) => matchesPattern(filePath, pattern)),
  );
  if (touchedImplementation.length === 0) {
    continue;
  }

  const touchedDocs = Array.from(changedFiles).filter((filePath) =>
    rule.docs.some((pattern) => matchesPattern(filePath, pattern)),
  );
  if (touchedDocs.length > 0) {
    continue;
  }

  errors.push([
    `rule "${rule.id}" triggered by: ${touchedImplementation.join(", ")}`,
    `expected one of: ${rule.docs.join(", ")}`,
  ].join("\n  "));
}

if (errors.length > 0) {
  console.error("public doc freshness check failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("public doc freshness check ok");
