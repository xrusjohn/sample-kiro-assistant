import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

const DATA_DIR = process.env.KIRO_ASSISTANT_DATA ?? join(homedir(), ".kiro-assistant");

export function ensureDataDir(): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export const DB_PATH = join(ensureDataDir(), "sessions.db");
export const SETTINGS_PATH = join(ensureDataDir(), "assistant-settings.json");
