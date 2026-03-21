import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");

const requiredFiles = [
  "AGENTS.md",
  "ARCHITECTURE.md",
  "PLANS.md",
  ".agent/index.md",
  ".agent/core-beliefs.md",
  ".agent/runtime-boundaries.md",
  ".agent/known-invariants.md",
  ".agent/verification.md",
  ".agent/tech-debt-tracker.md",
  ".agent/exec-plans/TEMPLATE.md",
  ".agent/exec-plans/active/README.md",
  ".agent/exec-plans/completed/README.md",
];

const contentExpectations = [
  {
    file: "AGENTS.md",
    includes: ["ARCHITECTURE.md", "PLANS.md", ".agent/index.md", ".agent/verification.md"],
  },
  {
    file: "ARCHITECTURE.md",
    includes: [".agent/runtime-boundaries.md", ".agent/known-invariants.md"],
  },
  {
    file: "PLANS.md",
    includes: [".agent/exec-plans/TEMPLATE.md", ".agent/exec-plans/active", ".agent/exec-plans/completed"],
  },
];

const errors = [];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`missing required internal doc: ${relativePath}`);
  }
}

for (const expectation of contentExpectations) {
  const absolutePath = path.join(ROOT, expectation.file);
  if (!existsSync(absolutePath)) {
    continue;
  }
  const content = readFileSync(absolutePath, "utf8");
  for (const snippet of expectation.includes) {
    if (!content.includes(snippet)) {
      errors.push(`${expectation.file} must reference "${snippet}"`);
    }
  }
}

if (errors.length > 0) {
  console.error("repo docs check failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("repo docs check ok");
