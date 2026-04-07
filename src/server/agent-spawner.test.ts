// Feature: a2a-registry — agent-spawner tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { A2ARegistry } from './a2a-registry.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

// Mock child_process — exec is used via promisify, so we mock it to call the
// node-style callback that promisify wraps into a Promise.
const mockExecImpl = vi.fn();
vi.mock('node:child_process', () => ({
  exec: (...args: unknown[]) => mockExecImpl(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRegistry() {
  const db = new Database(':memory:');
  const registry = new A2ARegistry(db);
  return { db, registry };
}

function mockExecSuccess(stdout: string) {
  mockExecImpl.mockImplementation((_cmd: string, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout, stderr: '' });
  });
}

function mockExecError(message: string) {
  mockExecImpl.mockImplementation((_cmd: string, cb: (err: Error, result: { stdout: string; stderr: string }) => void) => {
    cb(new Error(message), { stdout: '', stderr: message });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('agent-spawner', () => {
  let db: Database.Database;
  let registry: A2ARegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        name: 'Test Agent',
        description: 'Test',
        version: '1.0.0',
        skills: [{ id: 'test', name: 'Test', tags: ['test'] }],
      }),
    }));
    ({ db, registry } = makeRegistry());
  });

  afterEach(() => {
    registry.stopHeartbeatSweep();
    db.close();
  });

  it('spawnAgent() builds correct docker command with env vars', async () => {
    mockExecSuccess('container-abc123\n');

    const { spawnAgent } = await import('./agent-spawner.js');

    // Immediately return a registered instance so polling succeeds
    vi.spyOn(registry, 'getAll').mockReturnValue([{
      id: 'spawned-inst-1',
      profileId: 'coding-assistant',
      url: 'http://spawned.local',
      platform: 'any',
      card: { name: 'Test', description: 'Test', version: '1.0.0', skills: [] },
      metadata: {},
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'online',
    }]);

    await spawnAgent(
      { profileId: 'coding-assistant', platform: 'any' },
      registry,
      'http://orchestrator.local:3001'
    );

    expect(mockExecImpl).toHaveBeenCalled();
    const dockerCmd = mockExecImpl.mock.calls[0][0] as string;
    expect(dockerCmd).toContain('docker run');
    expect(dockerCmd).toContain('-e A2A_PROFILE=coding-assistant');
    expect(dockerCmd).toContain('-e A2A_PLATFORM=any');
    expect(dockerCmd).toContain('-e ORCHESTRATOR_URL=http://orchestrator.local:3001');
  });

  it('spawnAgent() includes A2A_SKILLS and A2A_TAGS from profile', async () => {
    mockExecSuccess('container-def456\n');

    const { spawnAgent } = await import('./agent-spawner.js');

    vi.spyOn(registry, 'getAll').mockReturnValue([{
      id: 'spawned-inst-2',
      profileId: 'coding-assistant',
      url: 'http://spawned2.local',
      platform: 'any',
      card: { name: 'Test', description: 'Test', version: '1.0.0', skills: [] },
      metadata: {},
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'online',
    }]);

    await spawnAgent(
      { profileId: 'coding-assistant', platform: 'any' },
      registry,
      'http://orchestrator.local:3001'
    );

    const dockerCmd = mockExecImpl.mock.calls[0][0] as string;
    expect(dockerCmd).toContain('-e A2A_SKILLS=');
    expect(dockerCmd).toContain('-e A2A_TAGS=');
  });

  it('spawnAgent() includes custom env vars', async () => {
    mockExecSuccess('container-ghi789\n');

    const { spawnAgent } = await import('./agent-spawner.js');

    vi.spyOn(registry, 'getAll').mockReturnValue([{
      id: 'spawned-inst-3',
      profileId: 'coding-assistant',
      url: 'http://spawned3.local',
      platform: 'any',
      card: { name: 'Test', description: 'Test', version: '1.0.0', skills: [] },
      metadata: {},
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'online',
    }]);

    await spawnAgent(
      { profileId: 'coding-assistant', platform: 'any', env: { MY_CUSTOM_VAR: 'hello' } },
      registry,
      'http://orchestrator.local:3001'
    );

    const dockerCmd = mockExecImpl.mock.calls[0][0] as string;
    expect(dockerCmd).toContain('-e MY_CUSTOM_VAR=hello');
  });

  it('spawnAgent() throws when docker exec fails', async () => {
    mockExecError('docker: command not found');

    const { spawnAgent } = await import('./agent-spawner.js');

    await expect(
      spawnAgent(
        { profileId: 'coding-assistant', platform: 'any' },
        registry,
        'http://orchestrator.local:3001'
      )
    ).rejects.toThrow('Failed to start Docker container');
  });

  it('spawnAgent() throws SPAWN_TIMEOUT after 60s if no registration', async () => {
    vi.useFakeTimers();

    mockExecSuccess('timeout-container\n');

    const { spawnAgent } = await import('./agent-spawner.js');

    // Registry never returns the new instance
    vi.spyOn(registry, 'getAll').mockReturnValue([]);

    const spawnPromise = spawnAgent(
      { profileId: 'coding-assistant', platform: 'any' },
      registry,
      'http://orchestrator.local:3001'
    ).catch(e => e); // catch to avoid unhandled rejection

    // Advance past the 60s deadline + polling intervals
    await vi.runAllTimersAsync();

    const result = await spawnPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe('SPAWN_TIMEOUT');

    vi.useRealTimers();
  }, 15_000);

  it('killSpawnedAgent() returns false for unknown instanceId', async () => {
    const { killSpawnedAgent } = await import('./agent-spawner.js');
    const result = await killSpawnedAgent('nonexistent-instance-id', registry);
    expect(result).toBe(false);
  });

  it('spawnAgent() throws when profileId is missing', async () => {
    const { spawnAgent } = await import('./agent-spawner.js');
    await expect(
      spawnAgent({}, registry, 'http://orchestrator.local:3001')
    ).rejects.toThrow('profileId or profile is required');
  });

  it('spawnAgent() saves inline profile before spawning', async () => {
    mockExecSuccess('inline-container\n');

    const { spawnAgent } = await import('./agent-spawner.js');
    const { saveProfiles } = await import('./profile-store.js');

    vi.spyOn(registry, 'getAll').mockReturnValue([{
      id: 'inline-inst',
      profileId: 'inline-agent',
      url: 'http://inline.local',
      platform: 'any',
      card: { name: 'Inline', description: 'Inline', version: '1.0.0', skills: [] },
      metadata: {},
      registeredAt: Date.now(),
      lastSeen: Date.now(),
      status: 'online',
    }]);

    const inlineProfile = {
      id: 'inline-agent',
      label: 'Inline Agent',
      description: 'An inline agent',
      platform: 'any' as const,
      skills: ['inline'],
      tools: [],
      tags: ['inline'],
      cardTemplate: { name: 'Inline', description: 'Inline', version: '1.0.0', skills: [] },
    };

    await spawnAgent(
      { profile: inlineProfile, platform: 'any' },
      registry,
      'http://orchestrator.local:3001'
    );

    // saveProfiles should have been called (via saveProfile)
    expect(saveProfiles).toHaveBeenCalled();
  });
});
