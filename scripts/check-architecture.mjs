import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const TARGET_DIRS = [
  "src",
  "agent/src",
  "relay/src",
  "app/src",
  "packages/protocol/src",
];
const ALLOWED_UNKNOWN_REPO_IMPORTS = new Set([
  "relay/src/server.ts::package.json",
]);

function walk(dirPath) {
  const entries = readdirSync(dirPath).sort();
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

function getArea(filePath) {
  const relativePath = path.relative(ROOT, filePath).replaceAll(path.sep, "/");
  if (relativePath === "src/cli.ts") {
    return "root-cli";
  }
  if (relativePath.startsWith("app/src/")) {
    return "app";
  }
  if (relativePath.startsWith("agent/src/")) {
    return "agent";
  }
  if (relativePath.startsWith("relay/src/")) {
    return "relay";
  }
  if (relativePath.startsWith("packages/protocol/src/")) {
    return "protocol";
  }
  return "unknown";
}

function extractSpecifiers(source) {
  const specifiers = [];
  const regex = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const specifier = match[1] ?? match[2];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function resolveRelativeImport(importerPath, specifier) {
  const base = path.resolve(path.dirname(importerPath), specifier);
  const normalizedBase = specifier.endsWith(".js")
    ? base.slice(0, -3)
    : specifier.endsWith(".mjs")
      ? base.slice(0, -4)
      : base;
  const candidates = [
    base,
    normalizedBase,
    `${normalizedBase}.ts`,
    `${normalizedBase}.tsx`,
    path.join(normalizedBase, "index.ts"),
    path.join(normalizedBase, "index.tsx"),
  ];

  return candidates.find((candidate) => {
    try {
      return statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

function assertImportAllowed(importerPath, specifier) {
  const importerArea = getArea(importerPath);
  const importerRelative = path.relative(ROOT, importerPath).replaceAll(path.sep, "/");

  if (specifier.startsWith(".")) {
    const resolved = resolveRelativeImport(importerPath, specifier);
    if (!resolved) {
      return [`${importerRelative}: unable to resolve relative import "${specifier}"`];
    }

    const targetArea = getArea(resolved);
    if (importerArea === "root-cli") {
      if (!["root-cli", "agent", "relay"].includes(targetArea)) {
        return [`${importerRelative}: root CLI may only import local files plus agent/relay entrypoints, found "${specifier}" -> ${path.relative(ROOT, resolved).replaceAll(path.sep, "/")}`];
      }
      return [];
    }

    if (importerArea === "unknown") {
      return [`${importerRelative}: importer area is unknown`];
    }

    if (targetArea === "unknown") {
      const resolvedRelative = path.relative(ROOT, resolved).replaceAll(path.sep, "/");
      const allowKey = `${importerRelative}::${resolvedRelative}`;
      if (ALLOWED_UNKNOWN_REPO_IMPORTS.has(allowKey)) {
        return [];
      }
      return [`${importerRelative}: ${importerArea} code may not import unclassified repo file "${resolvedRelative}" via "${specifier}"`];
    }

    if (targetArea !== importerArea) {
      return [`${importerRelative}: ${importerArea} code may not import ${targetArea} source via "${specifier}"`];
    }
    return [];
  }

  if (specifier.startsWith("@termpilot/")) {
    if (specifier === "@termpilot/protocol") {
      if (importerArea === "protocol") {
        return [`${importerRelative}: protocol source must not self-import through the published package name`];
      }
      return [];
    }

    return [`${importerRelative}: unexpected workspace import "${specifier}"`];
  }

  return [];
}

const errors = [];

for (const targetDir of TARGET_DIRS) {
  const dirPath = path.join(ROOT, targetDir);
  for (const filePath of walk(dirPath)) {
    if (getArea(filePath) === "unknown") {
      errors.push(`unmapped source file in architecture check: ${path.relative(ROOT, filePath).replaceAll(path.sep, "/")}`);
      continue;
    }
    const source = readFileSync(filePath, "utf8");
    for (const specifier of extractSpecifiers(source)) {
      errors.push(...assertImportAllowed(filePath, specifier));
    }
  }
}

if (errors.length > 0) {
  console.error("architecture check failed");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("architecture check ok");
