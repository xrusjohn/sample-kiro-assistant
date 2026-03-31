import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore } from "../electron/libs/session-store.js";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SessionStore agentId handling", () => {
  let store: SessionStore;
  const dbPath = join(tmpdir(), `test-sessions-${Date.now()}.db`);

  beforeEach(() => {
    store = new SessionStore(dbPath);
  });

  afterEach(() => {
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
    try { if (existsSync(dbPath + "-wal")) unlinkSync(dbPath + "-wal"); } catch { /* ignore */ }
    try { if (existsSync(dbPath + "-shm")) unlinkSync(dbPath + "-shm"); } catch { /* ignore */ }
  });

  it("stores agentId 'claude-code' when creating a session", () => {
    const session = store.createSession({
      title: "Claude test",
      cwd: "/workspace",
      agentId: "claude-code",
    });

    expect(session.agentId).toBe("claude-code");
  });

  it("defaults agentId to 'kiro' when not specified", () => {
    const session = store.createSession({
      title: "Default agent test",
      cwd: "/workspace",
    });

    expect(session.agentId).toBe("kiro");
  });

  it("persists agentId to the database and retrieves it", () => {
    const session = store.createSession({
      title: "Persist test",
      cwd: "/workspace",
      agentId: "claude-code",
    });

    const retrieved = store.getSession(session.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.agentId).toBe("claude-code");
  });

  it("returns agentId in listSessions", () => {
    store.createSession({ title: "Kiro session", cwd: "/w1", agentId: "kiro" });
    store.createSession({ title: "Claude session", cwd: "/w2", agentId: "claude-code" });

    const list = store.listSessions();
    const kiroSession = list.find(s => s.title === "Kiro session");
    const claudeSession = list.find(s => s.title === "Claude session");

    expect(kiroSession?.agentId).toBe("kiro");
    expect(claudeSession?.agentId).toBe("claude-code");
  });

  it("returns agentId in getSessionHistory", () => {
    const session = store.createSession({
      title: "History test",
      cwd: "/workspace",
      agentId: "claude-code",
    });

    const history = store.getSessionHistory(session.id);
    expect(history).not.toBeNull();
    expect(history!.session.agentId).toBe("claude-code");
  });
});
