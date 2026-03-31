import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentRegistry } from "./agent-registry.js";

// Mock child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

function mockExecFile(results: Record<string, string | null>) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, args: string[], _opts: unknown, cb?: (err: Error | null, result: { stdout: string }) => void) => {
      // promisify wraps execFile so the callback is the last arg
      const callback = cb ?? _opts;
      const binary = args?.[0];
      const resolved = binary ? results[binary] : null;
      if (typeof callback === "function") {
        if (resolved) {
          callback(null, { stdout: resolved + "\n" });
        } else {
          callback(new Error("not found"), { stdout: "" });
        }
      }
    }
  );
}

describe("AgentRegistry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean agent-related env vars
    delete process.env.KIRO_BINARY;
    delete process.env.CLAUDE_BINARY;
    delete process.env.KIRO_CLI_BINARY;
    delete process.env.KIRO_AGENT;
    delete process.env.DEFAULT_AGENT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("marks agents as available when binaries are found", async () => {
    mockExecFile({ "kiro-cli": "/usr/bin/kiro-cli", "claude-agent-acp": "/usr/bin/claude-agent-acp" });
    const registry = new AgentRegistry();
    await registry.checkAvailability();

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe("kiro");
    expect(all[0].available).toBe(true);
    expect(all[0].resolvedBinary).toBe("/usr/bin/kiro-cli");
    expect(all[1].id).toBe("claude-code");
    expect(all[1].available).toBe(true);
    expect(all[1].resolvedBinary).toBe("/usr/bin/claude-agent-acp");
  });

  it("marks agents as unavailable when binaries are not found", async () => {
    mockExecFile({});
    const registry = new AgentRegistry();
    await registry.checkAvailability();

    const all = registry.getAll();
    expect(all[0].available).toBe(false);
    expect(all[0].resolvedBinary).toBeUndefined();
    expect(all[1].available).toBe(false);
  });

  it("handles mixed availability", async () => {
    mockExecFile({ "kiro-cli": "/usr/bin/kiro-cli" });
    const registry = new AgentRegistry();
    await registry.checkAvailability();

    expect(registry.get("kiro").available).toBe(true);
    expect(registry.get("claude-code").available).toBe(false);
  });

  it("throws for unknown agent ID", () => {
    const registry = new AgentRegistry();
    expect(() => registry.get("unknown")).toThrow('Unknown agent: "unknown"');
  });

  it("returns 'kiro' as default when no env var set", () => {
    const registry = new AgentRegistry();
    expect(registry.getDefault()).toBe("kiro");
  });

  it("respects DEFAULT_AGENT env var", () => {
    process.env.DEFAULT_AGENT = "claude-code";
    const registry = new AgentRegistry();
    expect(registry.getDefault()).toBe("claude-code");
  });

  it("ignores invalid DEFAULT_AGENT", () => {
    process.env.DEFAULT_AGENT = "nonexistent";
    const registry = new AgentRegistry();
    expect(registry.getDefault()).toBe("kiro");
  });

  it("uses KIRO_BINARY env var override", async () => {
    process.env.KIRO_BINARY = "/custom/kiro";
    mockExecFile({ "/custom/kiro": "/custom/kiro" });
    const registry = new AgentRegistry();
    await registry.checkAvailability();

    expect(registry.get("kiro").available).toBe(true);
    expect(registry.get("kiro").resolvedBinary).toBe("/custom/kiro");
  });

  it("falls back to legacy KIRO_CLI_BINARY", async () => {
    process.env.KIRO_CLI_BINARY = "/legacy/kiro-cli";
    mockExecFile({ "/legacy/kiro-cli": "/legacy/kiro-cli" });
    const registry = new AgentRegistry();
    await registry.checkAvailability();

    expect(registry.get("kiro").available).toBe(true);
    expect(registry.get("kiro").resolvedBinary).toBe("/legacy/kiro-cli");
  });
});
