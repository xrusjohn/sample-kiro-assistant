import { createAcpRunner, type RunnerHandle } from "./runner.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";
import { AgentRegistry } from "./agent-registry.js";

export interface RunnerEntry {
  handle: RunnerHandle;
  sessionId: string;
  agentId: string;
  state: "starting" | "active" | "idle" | "suspended";
  lastActivity: number;
  spawnedAt: number;
}

export interface RunnerManagerConfig {
  maxConcurrent: number;
  idleTimeoutMs: number;
  sweepIntervalMs: number;
}

const defaults: RunnerManagerConfig = {
  maxConcurrent: parseInt(process.env.KIRO_MAX_SESSIONS ?? "5", 10),
  idleTimeoutMs: parseInt(process.env.KIRO_IDLE_TIMEOUT_MINUTES ?? "30", 10) * 60_000,
  sweepIntervalMs: 60_000,
};

export class RunnerManager {
  private entries = new Map<string, RunnerEntry>();
  private config: RunnerManagerConfig;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private registry: AgentRegistry;

  constructor(registry: AgentRegistry, config: Partial<RunnerManagerConfig> = {}) {
    this.registry = registry;
    this.config = { ...defaults, ...config };
    this.sweepTimer = setInterval(() => this.sweep(), this.config.sweepIntervalMs);
  }

  get activeCount(): number {
    let n = 0;
    for (const e of this.entries.values()) if (e.state !== "suspended") n++;
    return n;
  }

  canSpawn(): boolean {
    return this.activeCount < this.config.maxConcurrent;
  }

  spawn(opts: {
    session: Session;
    model: string;
    agentId?: string;
    resumeSessionId?: string;
    history?: any[];
    onEvent: (event: ServerEvent) => void;
    onSessionUpdate?: (updates: Partial<Session>) => void;
  }): RunnerHandle | null {
    // If already have a live runner, return it
    const existing = this.entries.get(opts.session.id);
    if (existing && existing.state !== "suspended") {
      existing.lastActivity = Date.now();
      existing.state = "active";
      return existing.handle;
    }

    if (!this.canSpawn()) return null;

    const resolvedAgentId = opts.agentId ?? this.registry.getDefault();
    const agent = this.registry.get(resolvedAgentId);

    const handle = createAcpRunner({ ...opts, agent });
    this.entries.set(opts.session.id, {
      handle,
      sessionId: opts.session.id,
      agentId: resolvedAgentId,
      state: "starting",
      lastActivity: Date.now(),
      spawnedAt: Date.now(),
    });
    return handle;
  }

  get(sessionId: string): RunnerEntry | undefined {
    return this.entries.get(sessionId);
  }

  /** Get existing runner or spawn a new one (lazy resume) */
  getOrSpawn(opts: {
    session: Session;
    model: string;
    agentId?: string;
    resumeSessionId?: string;
    history?: any[];
    onEvent: (event: ServerEvent) => void;
    onSessionUpdate?: (updates: Partial<Session>) => void;
  }): RunnerHandle | null {
    const existing = this.entries.get(opts.session.id);
    if (existing && existing.state !== "suspended") {
      existing.lastActivity = Date.now();
      existing.state = "active";
      return existing.handle;
    }
    return this.spawn(opts);
  }

  markActive(sessionId: string) {
    const entry = this.entries.get(sessionId);
    if (entry) { entry.state = "active"; entry.lastActivity = Date.now(); }
  }

  markIdle(sessionId: string) {
    const entry = this.entries.get(sessionId);
    if (entry) entry.state = "idle";
  }

  destroy(sessionId: string) {
    const entry = this.entries.get(sessionId);
    if (entry && entry.state !== "suspended") entry.handle.abort();
    this.entries.delete(sessionId);
  }

  abortAll() {
    for (const [id, entry] of this.entries) {
      if (entry.state !== "suspended") entry.handle.abort();
      this.entries.delete(id);
    }
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private sweep() {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.state === "idle" && (now - entry.lastActivity) > this.config.idleTimeoutMs) {
        console.log(`[runner-manager] suspending idle session ${id} (idle ${Math.round((now - entry.lastActivity) / 60000)}m)`);
        entry.handle.abort();
        entry.state = "suspended";
      }
    }
  }

  getHealth() {
    const sessions: { id: string; state: string; idleSeconds: number | null }[] = [];
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      sessions.push({
        id,
        state: entry.state,
        idleSeconds: entry.state === "suspended" ? null : Math.round((now - entry.lastActivity) / 1000),
      });
    }
    return { maxConcurrent: this.config.maxConcurrent, activeProcesses: this.activeCount, sessions };
  }
}
