import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { homedir } from "os";
import type { McpServersMap } from "../../shared/mcp.js";

type KiroAgentConfig = {
  name?: string;
  mcpServers?: McpServersMap;
  tools?: unknown;
  allowedTools?: unknown;
  resources?: unknown;
  prompt?: string;
  model?: string;
  [key: string]: unknown;
};

const KIRO_AGENT_CONFIG_PATH = join(homedir(), ".kiro", "agents", "agent_config.json");

export function getKiroMcpSettingsPath(): string {
  return KIRO_AGENT_CONFIG_PATH;
}

export async function ensureAgentConfigDefaults(templatePath: string): Promise<void> {
  if (process.env.KIRO_SKIP_AGENT_TEMPLATE === "1") {
    return;
  }
  try {
    await readFile(KIRO_AGENT_CONFIG_PATH, "utf8");
    return;
  } catch (error: unknown) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      console.warn("Failed to read existing agent_config.json:", error);
      return;
    }
  }

  try {
    if (!templatePath) return;
    await mkdir(dirname(KIRO_AGENT_CONFIG_PATH), { recursive: true });
    await copyFile(templatePath, KIRO_AGENT_CONFIG_PATH);
    console.info("Created default agent_config.json at", KIRO_AGENT_CONFIG_PATH);
  } catch (error) {
    console.warn("Failed to create default agent_config.json:", error);
  }
}

async function readAgentConfig(): Promise<KiroAgentConfig> {
  try {
    const raw = await readFile(KIRO_AGENT_CONFIG_PATH, "utf8");
    return JSON.parse(raw) as KiroAgentConfig;
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw new Error(
      `Failed to read Kiro agent config (${KIRO_AGENT_CONFIG_PATH}): ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function writeAgentConfig(data: KiroAgentConfig): Promise<void> {
  await mkdir(dirname(KIRO_AGENT_CONFIG_PATH), { recursive: true });
  const payload = JSON.stringify(data, null, 2) + "\n";
  await writeFile(KIRO_AGENT_CONFIG_PATH, payload, "utf8");
}

function normalizeServers(map?: McpServersMap): McpServersMap {
  if (!map || typeof map !== "object") return {};
  return Object.entries(map).reduce<McpServersMap>((acc, [key, value]) => {
    acc[key] = value ? { ...value } : value;
    return acc;
  }, {});
}

export async function loadKiroMcpServers(): Promise<{ path: string; servers: McpServersMap }> {
  const file = await readAgentConfig();
  return { path: KIRO_AGENT_CONFIG_PATH, servers: normalizeServers(file.mcpServers as McpServersMap | undefined) };
}

export async function setKiroMcpServerDisabled(name: string, disabled: boolean): Promise<McpServersMap> {
  const file = await readAgentConfig();
  if (!file.mcpServers || typeof file.mcpServers !== "object") {
    throw new Error("No MCP servers are configured in ~/.kiro/agents/agent_config.json");
  }
  if (!(name in file.mcpServers)) {
    throw new Error(`Unknown MCP server "${name}"`);
  }
  const nextServers = { ...file.mcpServers };
  const current = nextServers[name] || {};
  nextServers[name] = { ...current, disabled };
  file.mcpServers = nextServers;
  await writeAgentConfig(file);
  return normalizeServers(nextServers);
}
