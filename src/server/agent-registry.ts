import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface AgentDefinition {
  id: string;
  label: string;
  binaryEnvVar: string;
  defaultBinary: string;
  defaultArgs: string[];
  available: boolean;
  resolvedBinary: string | undefined;
}

interface CacheEntry {
  available: boolean;
  resolvedBinary: string | undefined;
  checkedAt: number;
}

const CACHE_TTL_MS = 30_000;

const AGENT_DEFINITIONS: Omit<AgentDefinition, "available" | "resolvedBinary">[] = [
  {
    id: "kiro",
    label: "Kiro",
    binaryEnvVar: "KIRO_BINARY",
    defaultBinary: "kiro-cli",
    defaultArgs: ["acp", "--agent", "kiro-assistant", "--trust-all-tools"],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    binaryEnvVar: "CLAUDE_BINARY",
    defaultBinary: "claude-agent-acp",
    defaultArgs: [],
  },
];

/**
 * Resolve the binary path for a given agent definition.
 * For the Kiro agent, supports legacy KIRO_CLI_BINARY and KIRO_AGENT env vars as fallbacks.
 */
function resolveBinaryName(def: Omit<AgentDefinition, "available" | "resolvedBinary">): string {
  // Primary env var override
  const primary = process.env[def.binaryEnvVar]?.trim();
  if (primary) return primary;

  // Legacy fallbacks for the Kiro agent only
  if (def.id === "kiro") {
    const legacyBinary = process.env.KIRO_CLI_BINARY?.trim();
    if (legacyBinary) {
      console.warn("[agent-registry] KIRO_CLI_BINARY is deprecated — use KIRO_BINARY instead.");
      return legacyBinary;
    }
  }

  return def.defaultBinary;
}

/**
 * Check if a binary is available on the system using `which` (Unix) or `where` (Windows).
 * Returns the resolved absolute path if found, undefined otherwise.
 */
async function probeBinary(binary: string): Promise<string | undefined> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, [binary], { timeout: 5_000 });
    const resolved = stdout.trim().split("\n")[0]?.trim();
    return resolved || undefined;
  } catch {
    return undefined;
  }
}

export class AgentRegistry {
  private cache = new Map<string, CacheEntry>();

  /** Check availability of all registered agents. Results are cached with a short TTL. */
  async checkAvailability(): Promise<void> {
    const results = await Promise.all(AGENT_DEFINITIONS.map((def) => this.probeOne(def)));
    for (const def of AGENT_DEFINITIONS) {
      const cached = this.cache.get(def.id);
      const binary = resolveBinaryName(def);
      console.log(`[agent-registry] ${def.id}: binary=${binary} available=${cached?.available ?? false}${cached?.resolvedBinary ? ` path=${cached.resolvedBinary}` : ""}`);
    }
  }

  /** Return all agents with their current availability status. */
  getAll(): AgentDefinition[] {
    return AGENT_DEFINITIONS.map((def) => this.toDefinition(def));
  }

  /** Get a single agent by ID. Throws if the ID is unknown. */
  get(id: string): AgentDefinition {
    const def = AGENT_DEFINITIONS.find((d) => d.id === id);
    if (!def) throw new Error(`Unknown agent: "${id}"`);
    return this.toDefinition(def);
  }

  /** Return the default agent ID (from DEFAULT_AGENT env var, or "kiro"). */
  getDefault(): string {
    const envDefault = process.env.DEFAULT_AGENT?.trim();
    if (envDefault && AGENT_DEFINITIONS.some((d) => d.id === envDefault)) return envDefault;
    return "kiro";
  }

  // --- internals ---

  private async probeOne(def: Omit<AgentDefinition, "available" | "resolvedBinary">): Promise<void> {
    const cached = this.cache.get(def.id);
    if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return;

    const binary = resolveBinaryName(def);
    const resolvedBinary = await probeBinary(binary);
    this.cache.set(def.id, { available: !!resolvedBinary, resolvedBinary, checkedAt: Date.now() });
  }

  private toDefinition(def: Omit<AgentDefinition, "available" | "resolvedBinary">): AgentDefinition {
    const cached = this.cache.get(def.id);

    // Apply legacy KIRO_AGENT env var to defaultArgs for the Kiro agent
    let defaultArgs = def.defaultArgs;
    if (def.id === "kiro") {
      const legacyAgent = process.env.KIRO_AGENT?.trim();
      if (legacyAgent) {
        console.warn("[agent-registry] KIRO_AGENT is deprecated — agent name is now part of the agent definition.");
        defaultArgs = defaultArgs.map((arg, i) =>
          i > 0 && defaultArgs[i - 1] === "--agent" ? legacyAgent : arg
        );
      }
    }

    return {
      ...def,
      defaultArgs,
      available: cached?.available ?? false,
      resolvedBinary: cached?.resolvedBinary,
    };
  }
}
