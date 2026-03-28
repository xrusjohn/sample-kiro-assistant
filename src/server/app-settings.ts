import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SETTINGS_PATH } from "./paths.js";

export type AssistantSettings = { defaultModel?: string };

export function loadAssistantSettings(): AssistantSettings {
  try {
    if (!existsSync(SETTINGS_PATH)) return {};
    return JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) ?? {};
  } catch { return {}; }
}

export function saveAssistantSettings(settings: AssistantSettings): void {
  const dir = dirname(SETTINGS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
}
