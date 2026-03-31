import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all heavy dependencies before importing runner
vi.mock("node:child_process", () => {
  const mockStdin = { write: vi.fn() };
  const mockStdout = { on: vi.fn() };
  const mockStderr = { on: vi.fn() };
  const mockChild = {
    pid: 12345,
    stdin: mockStdin,
    stdout: mockStdout,
    stderr: mockStderr,
    on: vi.fn(),
    kill: vi.fn(),
  };
  return {
    spawn: vi.fn(() => mockChild),
    __mockChild: mockChild,
  };
});

vi.mock("./pid-tracker.js", () => ({
  addPid: vi.fn(),
  removePid: vi.fn(),
}));

vi.mock("./util.js", () => ({
  enhancedEnv: { PATH: "/usr/bin" },
  normalizeWorkingDirectory: (cwd: string | undefined) => cwd ?? "/tmp",
}));

import { spawn } from "node:child_process";
import { createAcpRunner } from "./runner.js";
import type { AgentDefinition } from "./agent-registry.js";
import type { Session } from "../electron/libs/session-store.js";

const mockSession: Session = {
  id: "test-session-1",
  title: "Test",
  status: "idle",
  cwd: "/workspace",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  agentId: "kiro",
};

const noopEmit = vi.fn();

describe("createAcpRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spawns kiro-cli with correct args for Kiro agent", () => {
    const kiroAgent: AgentDefinition = {
      id: "kiro",
      label: "Kiro",
      binaryEnvVar: "KIRO_BINARY",
      defaultBinary: "kiro-cli",
      defaultArgs: ["acp", "--agent", "kiro-assistant", "--trust-all-tools"],
      available: true,
      resolvedBinary: "/usr/bin/kiro-cli",
    };

    createAcpRunner({
      session: mockSession,
      model: "claude-sonnet",
      agent: kiroAgent,
      onEvent: noopEmit,
    });

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/kiro-cli",
      ["acp", "--agent", "kiro-assistant", "--trust-all-tools"],
      expect.objectContaining({ cwd: "/workspace", stdio: ["pipe", "pipe", "pipe"] })
    );
  });

  it("spawns claude with correct args for Claude Code agent", () => {
    const claudeAgent: AgentDefinition = {
      id: "claude-code",
      label: "Claude Code",
      binaryEnvVar: "CLAUDE_BINARY",
      defaultBinary: "claude",
      defaultArgs: ["acp"],
      available: true,
      resolvedBinary: "/usr/local/bin/claude",
    };

    createAcpRunner({
      session: { ...mockSession, agentId: "claude-code" },
      model: "claude-sonnet",
      agent: claudeAgent,
      onEvent: noopEmit,
    });

    expect(spawn).toHaveBeenCalledWith(
      "/usr/local/bin/claude",
      ["acp"],
      expect.objectContaining({ cwd: "/workspace", stdio: ["pipe", "pipe", "pipe"] })
    );
  });

  it("emits runner.error when binary is not resolved", () => {
    const unavailableAgent: AgentDefinition = {
      id: "claude-code",
      label: "Claude Code",
      binaryEnvVar: "CLAUDE_BINARY",
      defaultBinary: "claude",
      defaultArgs: ["acp"],
      available: false,
      resolvedBinary: undefined,
    };

    const handle = createAcpRunner({
      session: mockSession,
      model: "claude-sonnet",
      agent: unavailableAgent,
      onEvent: noopEmit,
    });

    // Catch the rejected ready promise to avoid unhandled rejection
    handle.ready.catch(() => {});

    expect(spawn).not.toHaveBeenCalled();
    expect(noopEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "runner.error",
        payload: expect.objectContaining({
          message: expect.stringContaining("Claude Code binary not found"),
        }),
      })
    );
  });
});
