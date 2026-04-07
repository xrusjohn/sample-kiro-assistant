// Feature: a2a-registry
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { A2ARegistry } from './a2a-registry.js';

// ── Mock fetch for card fetching ─────────────────────────────────────────────

const mockCard = {
  name: 'Test Agent',
  description: 'Test agent description',
  version: '1.0.0',
  skills: [{ id: 'test-skill', name: 'Test Skill', tags: ['test', 'demo'] }],
};

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve(mockCard),
}));

// ── Mock profile-store to avoid filesystem writes ────────────────────────────

vi.mock('./profile-store.js', () => ({
  loadProfiles: vi.fn().mockReturnValue([
    {
      id: 'coding-assistant',
      label: 'Coding Assistant',
      description: 'General-purpose coding agent',
      platform: 'any',
      skills: ['coding', 'files'],
      tools: ['filesystem'],
      tags: ['coding', 'files'],
      cardTemplate: {
        name: 'Kiro Coding Assistant',
        description: 'Write, edit, and explain code',
        version: '1.0.0',
        skills: [{ id: 'coding-assistant', name: 'Coding Assistant', tags: ['coding', 'files'] }],
      },
    },
  ]),
  saveProfiles: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRegistry(db: Database.Database) {
  return new A2ARegistry(db);
}

async function registerOne(registry: A2ARegistry, overrides: Partial<{
  url: string; profileId: string; platform: string; metadata: Record<string, unknown>;
}> = {}) {
  return registry.register({
    url: overrides.url ?? 'http://agent.local:8080',
    profileId: overrides.profileId ?? 'coding-assistant',
    platform: (overrides.platform as 'any') ?? 'any',
    metadata: overrides.metadata ?? {},
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('A2ARegistry', () => {
  let db: Database.Database;
  let registry: A2ARegistry;

  beforeEach(() => {
    db = new Database(':memory:');
    registry = makeRegistry(db);
    vi.clearAllMocks();
    // Re-stub fetch after clearAllMocks
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCard),
    }));
  });

  afterEach(() => {
    registry.stopHeartbeatSweep();
    db.close();
  });

  // ── Registration ────────────────────────────────────────────────────────────

  it('register() returns { id, registeredAt }', async () => {
    const result = await registerOne(registry);
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('registeredAt');
    expect(typeof result.id).toBe('string');
    expect(typeof result.registeredAt).toBe('number');
  });

  it('register() stores instance retrievable by id', async () => {
    const { id } = await registerOne(registry);
    const instance = registry.getById(id);
    expect(instance).toBeDefined();
    expect(instance!.url).toBe('http://agent.local:8080');
    expect(instance!.profileId).toBe('coding-assistant');
    expect(instance!.platform).toBe('any');
    expect(instance!.status).toBe('online');
  });

  it('register() upserts on duplicate url+profileId', async () => {
    const first = await registerOne(registry);
    const second = await registerOne(registry);
    expect(first.id).toBe(second.id);
    expect(registry.getAll()).toHaveLength(1);
  });

  it('register() persists to SQLite', async () => {
    const { id } = await registerOne(registry);
    const row = db.prepare('SELECT * FROM agent_instances WHERE id = ?').get(id) as { id: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.id).toBe(id);
  });

  it('register() throws on card fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    await expect(registerOne(registry)).rejects.toThrow('Failed to fetch agent card');
  });

  it('register() throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(registerOne(registry)).rejects.toThrow('Failed to fetch agent card');
  });

  it('register() auto-creates profile for unknown profileId', async () => {
    const { loadProfiles, saveProfiles } = await import('./profile-store.js');
    (loadProfiles as ReturnType<typeof vi.fn>).mockReturnValueOnce([]);
    await registerOne(registry, { profileId: 'brand-new-agent' });
    expect(saveProfiles).toHaveBeenCalled();
  });

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  it('heartbeat() returns true for known id', async () => {
    const { id } = await registerOne(registry);
    expect(registry.heartbeat(id)).toBe(true);
  });

  it('heartbeat() returns false for unknown id', () => {
    expect(registry.heartbeat('nonexistent-id')).toBe(false);
  });

  it('heartbeat() updates lastSeen', async () => {
    const { id } = await registerOne(registry);
    const before = registry.getById(id)!.lastSeen;
    await new Promise(r => setTimeout(r, 5));
    registry.heartbeat(id);
    const after = registry.getById(id)!.lastSeen;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('heartbeat() sets status to online for offline instance', async () => {
    const { id } = await registerOne(registry);
    const instance = registry.getById(id)!;
    // Manually set offline
    instance.status = 'offline';
    registry.heartbeat(id);
    expect(registry.getById(id)!.status).toBe('online');
  });

  // ── Deregister ──────────────────────────────────────────────────────────────

  it('deregister() removes instance from memory', async () => {
    const { id } = await registerOne(registry);
    expect(registry.deregister(id)).toBe(true);
    expect(registry.getById(id)).toBeUndefined();
  });

  it('deregister() removes instance from SQLite', async () => {
    const { id } = await registerOne(registry);
    registry.deregister(id);
    const row = db.prepare('SELECT * FROM agent_instances WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('deregister() returns false for unknown id', () => {
    expect(registry.deregister('nonexistent-id')).toBe(false);
  });

  it('deregister() removes instance from getAll()', async () => {
    const { id } = await registerOne(registry);
    registry.deregister(id);
    expect(registry.getAll().find(i => i.id === id)).toBeUndefined();
  });

  // ── Filters ─────────────────────────────────────────────────────────────────

  it('getAll() returns all instances when no filter', async () => {
    await registerOne(registry, { url: 'http://agent1.local', profileId: 'p1' });
    await registerOne(registry, { url: 'http://agent2.local', profileId: 'p2' });
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getAll() with tag filter returns only matching instances', async () => {
    await registerOne(registry, { url: 'http://agent1.local', profileId: 'p1' });
    // Second agent with different card
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        name: 'Diagram Agent',
        description: 'Diagrams',
        version: '1.0.0',
        skills: [{ id: 'diagram', name: 'Diagram', tags: ['diagrams'] }],
      }),
    }));
    await registerOne(registry, { url: 'http://agent2.local', profileId: 'p2' });

    const testTagged = registry.getAll({ tag: 'test' });
    expect(testTagged).toHaveLength(1);
    expect(testTagged[0].url).toBe('http://agent1.local');

    const diagramTagged = registry.getAll({ tag: 'diagrams' });
    expect(diagramTagged).toHaveLength(1);
    expect(diagramTagged[0].url).toBe('http://agent2.local');
  });

  it('getAll() with platform filter returns only matching instances', async () => {
    await registerOne(registry, { url: 'http://linux.local', profileId: 'p1', platform: 'linux' });
    await registerOne(registry, { url: 'http://windows.local', profileId: 'p2', platform: 'windows' });

    const linuxOnly = registry.getAll({ platform: 'linux' });
    expect(linuxOnly).toHaveLength(1);
    expect(linuxOnly[0].platform).toBe('linux');
  });

  it('getAll() with status filter returns only matching instances', async () => {
    const { id } = await registerOne(registry, { url: 'http://agent1.local', profileId: 'p1' });
    await registerOne(registry, { url: 'http://agent2.local', profileId: 'p2' });
    // Manually set one offline
    registry.getById(id)!.status = 'offline';

    const online = registry.getAll({ status: 'online' });
    expect(online).toHaveLength(1);
    expect(online[0].url).toBe('http://agent2.local');

    const offline = registry.getAll({ status: 'offline' });
    expect(offline).toHaveLength(1);
    expect(offline[0].url).toBe('http://agent1.local');
  });

  // ── Coverage ─────────────────────────────────────────────────────────────────

  it('getCoverage() returns all platforms', () => {
    const cov = registry.getCoverage();
    expect(cov).toHaveProperty('any');
    expect(cov).toHaveProperty('linux');
    expect(cov).toHaveProperty('cdm');
    expect(cov).toHaveProperty('windows');
    expect(cov).toHaveProperty('agentcore');
  });

  it('getCoverage() counts match getAll() results', async () => {
    await registerOne(registry, { url: 'http://a1.local', profileId: 'p1', platform: 'linux' });
    await registerOne(registry, { url: 'http://a2.local', profileId: 'p2', platform: 'linux' });
    await registerOne(registry, { url: 'http://a3.local', profileId: 'p3', platform: 'windows' });

    const cov = registry.getCoverage();
    const onlineCount = registry.getAll({ status: 'online' }).length;
    const totalOnline = Object.values(cov).reduce((sum, e) => sum + e.online, 0);
    expect(totalOnline).toBe(onlineCount);
  });

  it('getCoverage() increments offline count for offline instances', async () => {
    const { id } = await registerOne(registry, { url: 'http://a1.local', profileId: 'p1', platform: 'linux' });
    registry.getById(id)!.status = 'offline';

    const cov = registry.getCoverage();
    expect(cov.linux.offline).toBe(1);
    expect(cov.linux.online).toBe(0);
  });

  // ── Startup load ─────────────────────────────────────────────────────────────

  it('startup load sets persisted instances to unknown status', async () => {
    // Pre-populate SQLite
    const { id } = await registerOne(registry);
    registry.stopHeartbeatSweep();
    db.prepare("UPDATE agent_instances SET status = 'online' WHERE id = ?").run(id);

    // Create new registry from same db — should load as unknown
    const registry2 = new A2ARegistry(db);
    const instance = registry2.getById(id);
    expect(instance).toBeDefined();
    expect(instance!.status).toBe('unknown');
    registry2.stopHeartbeatSweep();
  });

  // ── Heartbeat sweep ──────────────────────────────────────────────────────────

  it('startHeartbeatSweep() marks stale instances offline', async () => {
    vi.useFakeTimers();
    const { id } = await registerOne(registry);
    // Set lastSeen to 100s ago
    const instance = registry.getById(id)!;
    instance.lastSeen = Date.now() - 100_000;
    instance.status = 'online';

    registry.startHeartbeatSweep();
    vi.advanceTimersByTime(31_000);

    expect(registry.getById(id)!.status).toBe('offline');
    vi.useRealTimers();
  });

  it('startHeartbeatSweep() does not mark fresh instances offline', async () => {
    vi.useFakeTimers();
    const { id } = await registerOne(registry);

    registry.startHeartbeatSweep();
    vi.advanceTimersByTime(31_000);

    expect(registry.getById(id)!.status).toBe('online');
    vi.useRealTimers();
  });

  // ── Profile CRUD ─────────────────────────────────────────────────────────────

  it('getProfiles() returns profiles from store', () => {
    const profiles = registry.getProfiles();
    expect(Array.isArray(profiles)).toBe(true);
    expect(profiles.length).toBeGreaterThan(0);
  });

  it('saveProfile() calls saveProfiles with updated list', async () => {
    const { saveProfiles } = await import('./profile-store.js');
    const newProfile = {
      id: 'new-agent',
      label: 'New Agent',
      description: 'A new agent',
      platform: 'any' as const,
      skills: ['test'],
      tools: [],
      tags: ['test'],
      cardTemplate: { name: 'New Agent', description: 'New', version: '1.0.0', skills: [] },
    };
    registry.saveProfile(newProfile);
    expect(saveProfiles).toHaveBeenCalled();
  });

  it('deleteProfile() returns false for unknown id', () => {
    expect(registry.deleteProfile('nonexistent')).toBe(false);
  });

  it('deleteProfile() returns true and calls saveProfiles for known id', async () => {
    const { saveProfiles } = await import('./profile-store.js');
    const result = registry.deleteProfile('coding-assistant');
    expect(result).toBe(true);
    expect(saveProfiles).toHaveBeenCalled();
  });

  // ── Config get/update ────────────────────────────────────────────────────────

  it('getInstanceConfig() returns undefined for unknown id', () => {
    expect(registry.getInstanceConfig('nonexistent')).toBeUndefined();
  });

  it('getInstanceConfig() merges profile defaults with metadata', async () => {
    const { id } = await registerOne(registry, { metadata: { customKey: 'customValue' } });
    const config = registry.getInstanceConfig(id);
    expect(config).toBeDefined();
    expect(config!.customKey).toBe('customValue');
    // Profile defaults should be present
    expect(config).toHaveProperty('skills');
  });

  it('updateInstanceConfig() returns false for unknown id', () => {
    expect(registry.updateInstanceConfig('nonexistent', {})).toBe(false);
  });

  it('updateInstanceConfig() persists to SQLite', async () => {
    const { id } = await registerOne(registry);
    registry.updateInstanceConfig(id, { newSetting: 'value' });
    const row = db.prepare('SELECT metadata FROM agent_instances WHERE id = ?').get(id) as { metadata: string };
    const meta = JSON.parse(row.metadata);
    expect(meta.newSetting).toBe('value');
  });

  it('updateInstanceConfig() emits agent.restart when restart: true', async () => {
    const { id } = await registerOne(registry);
    const restartEvents: unknown[] = [];
    registry.on('agent.restart', (e) => restartEvents.push(e));
    registry.updateInstanceConfig(id, { restart: true });
    expect(restartEvents).toHaveLength(1);
    expect((restartEvents[0] as { id: string }).id).toBe(id);
  });

  it('updateInstanceConfig() does not emit agent.restart when restart is not true', async () => {
    const { id } = await registerOne(registry);
    const restartEvents: unknown[] = [];
    registry.on('agent.restart', (e) => restartEvents.push(e));
    registry.updateInstanceConfig(id, { someOtherKey: 'value' });
    expect(restartEvents).toHaveLength(0);
  });

  // ── findBestInstance ─────────────────────────────────────────────────────────

  it('findBestInstance() returns undefined when no online instances', () => {
    expect(registry.findBestInstance('coding-assistant')).toBeUndefined();
  });

  it('findBestInstance() matches by profileId', async () => {
    const { id } = await registerOne(registry, { profileId: 'coding-assistant' });
    const found = registry.findBestInstance('coding-assistant');
    expect(found?.id).toBe(id);
  });

  it('findBestInstance() matches by tag', async () => {
    const { id } = await registerOne(registry);
    const found = registry.findBestInstance(undefined, ['test']);
    expect(found?.id).toBe(id);
  });

  it('findBestInstance() returns undefined for offline instances', async () => {
    const { id } = await registerOne(registry);
    registry.getById(id)!.status = 'offline';
    expect(registry.findBestInstance('coding-assistant')).toBeUndefined();
  });
});
