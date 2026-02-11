import { app } from "electron";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type AssistantSettings = {
  defaultModel?: string;
};

const getSettingsPath = () => join(app.getPath("userData"), "assistant-settings.json");

export function loadAssistantSettings(): AssistantSettings {
  try {
    const file = getSettingsPath();
    if (!existsSync(file)) return {};
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as AssistantSettings;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function saveAssistantSettings(settings: AssistantSettings): void {
  try {
    const file = getSettingsPath();
    const dir = dirname(file);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(file, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save assistant settings:", error);
  }
}

export function getAssistantSettingsPath(): string {
  return getSettingsPath();
}
