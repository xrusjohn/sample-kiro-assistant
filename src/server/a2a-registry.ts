import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import type { Platform, InstanceStatus, AgentCard, AgentInstance, AgentProfile, Coverage } from './a2a-types.js';
import { loadProfiles, saveProfiles } from './profile-store.js';
import { validateProfile } from './profile-validator.js';

const ALL_PLATFORMS: Platform[] = ['any', 'linux', 'cdm', 'windows', 'agentcore'];
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_THRESHOLD_MS = 90_000;

export class A2ARegistry extends EventEmitter {
  private db: Database;
  private instances: Map<string, AgentInstance> = new Map();
  private sweepInterval: ReturnType<typeof setInterval> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(db: Database) {
    super();
    this.db = db;
    this._migrate();
    this._loadFromDb();
    this._scheduleStartupDemotion();
  }

  // ---------------------------------------------------------------------------
  // Migration
  // ---------------------------------------------------------------------------

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_instances (
        id           TEXT PRIMARY KEY,
        profileId    TEXT NOT NULL,
        url          TEXT NOT NULL,
        platform     TEXT NOT NULL DEFAULT 'any',
        card         TEXT NOT NULL,
        metadata     TEXT NOT NULL DEFAULT '{}',
        registeredAt INTEGER NOT NULL,
        lastSeen     INTEGER NOT NULL,
        status       TEXT NOT NULL DEFAULT 'unknown'
      );
    `);
  }

  // ---------------------------------------------------------------------------
  // Startup load (2.14)
  // ---------------------------------------------------------------------------

  private _loadFromDb(): void {
    try {
      const rows = this.db.prepare('SELECT * FROM agent_instances').all() as Array<{
        id: string;
        profileId: string;
        url: string;
        platform: string;
        card: string;
        metadata: string;
        registeredAt: number;
        lastSeen: number;
        status: string;
      }>;

      for (const row of rows) {
        const instance: AgentInstance = {
          id: row.id,
          profileId: row.profileId,
          url: row.url,
          platform: row.platform as Platform,
          card: JSON.parse(row.card) as AgentCard,
          metadata: JSON.parse(row.metadata) as Record<string, unknown>,
          registeredAt: row.registeredAt,
          lastSeen: row.lastSeen,
          status: 'unknown',
          degradedReason: undefined,
        };
        this.instances.set(instance.id, instance);
      }
    } catch (err) {
      console.error('[A2ARegistry] Failed to load instances from DB:', err);
    }
  }

  private _scheduleStartupDemotion(): void {
    this.startupTimer = setTimeout(() => {
      const now = Date.now();
      for (const instance of this.instances.values()) {
        if (instance.status === 'unknown') {
          instance.status = 'offline';
          this._persistStatus(instance.id, 'offline', now);
        }
      }
    }, STALE_THRESHOLD_MS);
  }

  // ---------------------------------------------------------------------------
  // Registration (2.3)
  // ---------------------------------------------------------------------------

  async register(params: {
    url: string;
    profileId: string;
    platform: Platform;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; registeredAt: number }> {
    const { url, profileId, platform, metadata } = params;

    // Fetch agent card
    let card: AgentCard;
    try {
      const res = await fetch(`${url}/.well-known/agent-card.json`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      card = (await res.json()) as AgentCard;
    } catch (err) {
      throw new Error(`Failed to fetch agent card: ${(err as Error).message}`);
    }

    // Auto-create profile if unknown (Requirement 2.8)
    const profiles = loadProfiles();
    const profileExists = profiles.some((p) => p.id === profileId);
    if (!profileExists) {
      const autoProfile: AgentProfile = {
        id: profileId,
        label: card.name ?? profileId,
        description: (card.description as string) ?? '',
        platform,
        skills: card.skills?.map((s) => s.id) ?? [],
        tools: [],
        tags: card.skills?.flatMap((s) => s.tags ?? []) ?? [],
        cardTemplate: card,
      };
      const validation = validateProfile(autoProfile);
      if (validation.valid) {
        profiles.push(autoProfile);
        try {
          saveProfiles(profiles);
        } catch (err) {
          console.warn('[A2ARegistry] Failed to persist auto-created profile:', err);
        }
      } else {
        console.warn('[A2ARegistry] Auto-created profile is invalid, skipping persist:', validation.errors);
      }
    }

    const now = Date.now();

    // Check for existing instance with same url + profileId (upsert)
    let existingId: string | undefined;
    for (const inst of this.instances.values()) {
      if (inst.url === url && inst.profileId === profileId) {
        existingId = inst.id;
        break;
      }
    }

    const id = existingId ?? randomUUID();
    const registeredAt = existingId
      ? (this.instances.get(existingId)?.registeredAt ?? now)
      : now;

    const instance: AgentInstance = {
      id,
      profileId,
      url,
      platform,
      card,
      metadata,
      registeredAt,
      lastSeen: now,
      status: 'online',
    };

    this.instances.set(id, instance);
    this._upsertDb(instance);

    return { id, registeredAt };
  }

  // ---------------------------------------------------------------------------
  // Register WS agent (card provided directly, no HTTP fetch)
  // ---------------------------------------------------------------------------
  registerWs(params: {
    profileId: string;
    platform: Platform;
    card: AgentCard;
    metadata?: Record<string, unknown>;
  }): { id: string; registeredAt: number } {
    const { profileId, platform, card, metadata = {} } = params;
    const now = Date.now();
    const id = randomUUID();
    const instance: AgentInstance = {
      id,
      profileId,
      url: `ws-agent://${id}`,
      platform,
      card,
      metadata,
      registeredAt: now,
      lastSeen: now,
      status: 'online',
      transport: 'ws',
    };
    this.instances.set(id, instance);
    this._upsertDb(instance);
    return { id, registeredAt: now };
  }

  // ---------------------------------------------------------------------------
  // Deregister (2.4)
  // ---------------------------------------------------------------------------

  deregister(id: string): boolean {
    if (!this.instances.has(id)) return false;
    this.instances.delete(id);
    try {
      this.db.prepare('DELETE FROM agent_instances WHERE id = ?').run(id);
    } catch (err) {
      console.error('[A2ARegistry] Failed to delete instance from DB:', err);
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Heartbeat (2.5)
  // ---------------------------------------------------------------------------

  heartbeat(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;
    const now = Date.now();
    instance.lastSeen = now;
    instance.status = 'online';
    this._persistStatus(id, 'online', now);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries (2.6, 2.7)
  // ---------------------------------------------------------------------------

  getAll(filter?: { status?: InstanceStatus; tag?: string; platform?: Platform }): AgentInstance[] {
    let results = Array.from(this.instances.values());

    if (filter?.status) {
      results = results.filter((i) => i.status === filter.status);
    }

    if (filter?.platform) {
      results = results.filter((i) => i.platform === filter.platform);
    }

    if (filter?.tag) {
      const tag = filter.tag;
      results = results.filter((i) =>
        i.card.skills?.some((s) => s.tags?.includes(tag))
      );
    }

    return results;
  }

  getById(id: string): AgentInstance | undefined {
    return this.instances.get(id);
  }

  // ---------------------------------------------------------------------------
  // Coverage (2.8)
  // ---------------------------------------------------------------------------

  getCoverage(): Coverage {
    const coverage = Object.fromEntries(
      ALL_PLATFORMS.map((p) => [p, { online: 0, offline: 0, degraded: 0 }])
    ) as Coverage;

    for (const instance of this.instances.values()) {
      const entry = coverage[instance.platform];
      if (!entry) continue;
      if (instance.status === 'online') {
        entry.online++;
      } else if (instance.status === 'degraded') {
        entry.degraded++;
      } else {
        entry.offline++;
      }
    }

    return coverage;
  }

  // ---------------------------------------------------------------------------
  // Profiles (2.9, 2.10, 2.11)
  // ---------------------------------------------------------------------------

  getProfiles(): AgentProfile[] {
    return loadProfiles();
  }

  saveProfile(profile: AgentProfile): void {
    const profiles = loadProfiles();
    const idx = profiles.findIndex((p) => p.id === profile.id);
    if (idx >= 0) {
      profiles[idx] = profile;
    } else {
      profiles.push(profile);
    }
    saveProfiles(profiles);
  }

  deleteProfile(id: string): boolean {
    const profiles = loadProfiles();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    profiles.splice(idx, 1);
    saveProfiles(profiles);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Routing (2.12)
  // ---------------------------------------------------------------------------

  findBestInstance(profileId?: string, tags?: string[]): AgentInstance | undefined {
    const online = Array.from(this.instances.values()).filter((i) => i.status === 'online');

    // Explicit profileId match first
    if (profileId) {
      const match = online.find((i) => i.profileId === profileId);
      if (match) return match;
    }

    // Tag overlap match
    if (tags && tags.length > 0) {
      const match = online.find((i) =>
        i.card.skills?.some((s) => s.tags?.some((t) => tags.includes(t)))
      );
      if (match) return match;
    }

    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Instance config (2.15, 2.16)
  // ---------------------------------------------------------------------------

  getInstanceConfig(id: string): Record<string, unknown> | undefined {
    const instance = this.instances.get(id);
    if (!instance) return undefined;

    // Merge profile defaults with instance metadata overrides
    const profiles = loadProfiles();
    const profile = profiles.find((p) => p.id === instance.profileId);

    const defaults: Record<string, unknown> = profile
      ? { skills: profile.skills, tools: profile.tools, tags: profile.tags }
      : {};

    return { ...defaults, ...instance.metadata };
  }

  updateInstanceConfig(id: string, config: Record<string, unknown>): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    instance.metadata = { ...instance.metadata, ...config };

    try {
      this.db
        .prepare('UPDATE agent_instances SET metadata = ? WHERE id = ?')
        .run(JSON.stringify(instance.metadata), id);
    } catch (err) {
      console.error('[A2ARegistry] Failed to persist instance config:', err);
    }

    if (config.restart === true) {
      this.emit('agent.restart', { id });
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Heartbeat sweep (2.13)
  // ---------------------------------------------------------------------------

  startHeartbeatSweep(): void {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const instance of this.instances.values()) {
        // Stale check — no heartbeat received
        if (now - instance.lastSeen > STALE_THRESHOLD_MS) {
          if (instance.status !== 'offline') {
            instance.status = 'offline';
            instance.degradedReason = undefined;
            this._persistStatus(instance.id, 'offline', instance.lastSeen);
            this.emit('agent.offline', { id: instance.id });
          }
          continue;
        }

        // Active probe — send a lightweight message/send to check the ACP process
        if (instance.status === 'online') {
          this._probeInstance(instance).catch(() => {});
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Probe an instance with a real message/send to verify the ACP process is alive. */
  private async _probeInstance(instance: AgentInstance): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      const res = await fetch(instance.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: '2.0', id: 0, method: 'message/send',
          params: { message: { parts: [{ kind: 'text', text: '__health_check__' }] } },
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this._markDegraded(instance, `HTTP ${res.status}`);
        return;
      }

      const data = await res.json() as { error?: { code?: number; message?: string } };
      if (data.error) {
        const reason = data.error.message?.toLowerCase().includes('expired')
          ? 'credentials-expired'
          : data.error.message ?? 'acp-error';
        this._markDegraded(instance, reason);
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('abort')) {
        this._markDegraded(instance, 'timeout');
      } else {
        this._markDegraded(instance, msg);
      }
    }
  }

  /** Transition an instance to degraded and emit event. */
  markDegraded(id: string, reason: string): void {
    const instance = this.instances.get(id);
    if (instance) this._markDegraded(instance, reason);
  }

  private _markDegraded(instance: AgentInstance, reason: string): void {
    if (instance.status === 'degraded' && instance.degradedReason === reason) return;
    console.log(`[A2ARegistry] instance ${instance.id} (${instance.profileId}) → degraded: ${reason}`);
    instance.status = 'degraded';
    instance.degradedReason = reason;
    this._persistStatus(instance.id, 'degraded', instance.lastSeen);
    this.emit('agent.degraded', { id: instance.id, reason });
  }

  stopHeartbeatSweep(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = undefined;
    }
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _upsertDb(instance: AgentInstance): void {
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO agent_instances
            (id, profileId, url, platform, card, metadata, registeredAt, lastSeen, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          instance.id,
          instance.profileId,
          instance.url,
          instance.platform,
          JSON.stringify(instance.card),
          JSON.stringify(instance.metadata),
          instance.registeredAt,
          instance.lastSeen,
          instance.status
        );
    } catch (err) {
      console.error('[A2ARegistry] Failed to upsert instance to DB:', err);
    }
  }

  private _persistStatus(id: string, status: InstanceStatus, lastSeen: number): void {
    try {
      this.db
        .prepare('UPDATE agent_instances SET status = ?, lastSeen = ? WHERE id = ?')
        .run(status, lastSeen, id);
    } catch (err) {
      console.error('[A2ARegistry] Failed to persist status to DB:', err);
    }
  }
}
