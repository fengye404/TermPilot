import path from "node:path";
import { pathToFileURL } from "node:url";

export function getRelayRuntimeModuleUrl(): string {
  const argvEntry = process.argv[1];
  const entryPath = argvEntry && /\.(?:[cm]?js)$/.test(argvEntry)
    ? argvEntry
    : process.execPath;
  return pathToFileURL(path.resolve(entryPath)).href;
}
