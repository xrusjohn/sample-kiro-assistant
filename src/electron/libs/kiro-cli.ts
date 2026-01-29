import { accessSync, constants, existsSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";

const DARWIN_APP_BUNDLE = "/Applications/Kiro CLI.app/Contents/MacOS/kiro-cli";
const DARWIN_DESKTOP_APP = "/Applications/Kiro.app/Contents/MacOS/kiro-cli";
const DEFAULT_BINARY_NAME = process.platform === "win32" ? "kiro-cli.exe" : "kiro-cli";
const PATH_DELIMITER = process.platform === "win32" ? ";" : ":";

const cachedPaths: Partial<KiroCliInstallation> = {};

export type KiroCliInstallation = {
  binaryPath?: string;
  supportDir?: string;
  dataPath?: string;
  logDir?: string;
  socketsDir?: string;
};

const isExecutable = (candidate?: string | null) => {
  if (!candidate) return false;
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const existingPath = (candidate?: string | null) => (candidate && existsSync(candidate) ? candidate : undefined);

const searchOnPath = (binaryName: string) => {
  const pathValue = process.env.PATH ?? "";
  for (const entry of pathValue.split(PATH_DELIMITER)) {
    if (!entry) continue;
    const candidate = join(entry, binaryName);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
};

export const resolveKiroCliBinary = (): string | undefined => {
  if (cachedPaths.binaryPath) return cachedPaths.binaryPath;
  const envOverride = process.env.KIRO_CLI_PATH;
  if (isExecutable(envOverride)) {
    cachedPaths.binaryPath = envOverride!;
    return cachedPaths.binaryPath;
  }

  const candidates = [
    process.platform === "darwin" ? DARWIN_APP_BUNDLE : undefined,
    process.platform === "darwin" ? DARWIN_DESKTOP_APP : undefined,
    searchOnPath(DEFAULT_BINARY_NAME)
  ].filter(Boolean) as string[];

  const resolved = candidates.find(isExecutable);
  cachedPaths.binaryPath = resolved;
  return resolved;
};

export const resolveKiroSupportDirectory = (): string | undefined => {
  if (cachedPaths.supportDir) return cachedPaths.supportDir;
  const home = homedir();
  if (!home) return undefined;
  const supportDir = (() => {
    if (process.platform === "darwin") {
      return join(home, "Library", "Application Support", "kiro-cli");
    }
    if (process.platform === "win32") {
      return join(home, "AppData", "Roaming", "kiro-cli");
    }
    return join(home, ".kiro-cli");
  })();
  cachedPaths.supportDir = existingPath(supportDir);
  return cachedPaths.supportDir;
};

export const resolveKiroDataPath = (): string | undefined => {
  if (cachedPaths.dataPath) return cachedPaths.dataPath;
  const supportDir = resolveKiroSupportDirectory();
  if (!supportDir) return undefined;
  const dbPath = join(supportDir, "data.sqlite3");
  cachedPaths.dataPath = existingPath(dbPath);
  return cachedPaths.dataPath;
};

const resolveTmpDir = () => process.env.TMPDIR || process.env.TEMP || tmpdir();

export const resolveKiroLogDirectory = (): string | undefined => {
  if (cachedPaths.logDir) return cachedPaths.logDir;
  const custom = process.env.KIRO_LOG_DIR;
  const baseDir = custom && existingPath(custom) ? custom : existingPath(join(resolveTmpDir(), "kiro-log"));
  cachedPaths.logDir = baseDir;
  return cachedPaths.logDir;
};

export const resolveKiroSocketsDirectory = (): string | undefined => {
  if (cachedPaths.socketsDir) return cachedPaths.socketsDir;
  const dir = existingPath(join(resolveTmpDir(), "kirorun"));
  cachedPaths.socketsDir = dir;
  return cachedPaths.socketsDir;
};

export const describeKiroInstallation = (): KiroCliInstallation => ({
  binaryPath: resolveKiroCliBinary(),
  supportDir: resolveKiroSupportDirectory(),
  dataPath: resolveKiroDataPath(),
  logDir: resolveKiroLogDirectory(),
  socketsDir: resolveKiroSocketsDirectory()
});
