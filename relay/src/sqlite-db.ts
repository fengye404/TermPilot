import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type DatabaseSync = import("node:sqlite").DatabaseSync;

const require = createRequire(path.join(process.cwd(), "package.json"));

export function openRelaySqliteDatabase(filePath: string): DatabaseSync {
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  if (filePath !== ":memory:") {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const database = new DatabaseSync(filePath);
  database.exec("pragma journal_mode = wal;");
  database.exec("pragma foreign_keys = on;");
  database.exec("pragma busy_timeout = 5000;");
  return database;
}
