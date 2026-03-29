import { resolve } from "path";
import { homedir } from "os";

export function getEnhancedEnv(): Record<string, string | undefined> {
  const home = homedir();
  const extra = [
    "/usr/local/bin", "/opt/homebrew/bin",
    `${home}/.local/bin`,
    `${home}/.nvm/versions/node/v20.0.0/bin`,
    `${home}/.nvm/versions/node/v22.0.0/bin`,
    `${home}/.volta/bin`, "/usr/bin", "/bin",
  ];
  return { ...process.env, PATH: [...extra, process.env.PATH || ""].join(":") };
}

export const enhancedEnv = getEnhancedEnv();

export function generateSessionTitle(userIntent: string | null): string {
  if (!userIntent) return "New Session";
  return userIntent.split(/[.!?\n]/)[0]?.slice(0, 64).trim() || "New Session";
}

export function normalizeWorkingDirectory(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try { return resolve(trimmed); } catch { return trimmed; }
}
