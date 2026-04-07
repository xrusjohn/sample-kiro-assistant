// Feature: a2a-registry — Property-Based Tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fc } from '@fast-check/vitest';
import Database from 'better-sqlite3';
import { A2ARegistry } from './a2a-registry.js';
import type { Platform } from './a2a-types.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./profile-store.js', () => ({
  loadProfiles: vi.fn().mockReturnValue([]),
  saveProfiles: vi.fn(),
}));

const makeCard = (name = 'Test Agent', tags: string[] = ['test']) => ({
  name,
  description: 'Test agent',
  version: '1.0.0',
  skills: [{ id: 'skill-1', name: 'Skill 1', tags }],
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function freshRegistry() {
  const db = new Database(':memory:');
  const registry = new A2ARegistry(db);
  return { db, registry };
}

const platformArb = fc.constantFrom<Platform>('any', 'linux', 'cdm', 'windows', 'agentcore');

const registrationArb = fc.record({
  url: fc.webUrl({ withQueryParameters: false, withFragments: false }),
  profileId: fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0),
  platform: platformArb,
  metadata: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
});

// ── Property 1: Registration round-trip ──────────────────────────────────────
// Feature: a2a-registry, Property 1: Registration round-trip
describe('Property 1: Registration round-trip', () => {
  it('registration round-trip preserves payload fields', async () => {
    await fc.assert(
      fc.asyncProperty(registrationArb, async (payload) => {
        const { db, registry } = freshRegistry();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeCard()),
        }));
        try {
          const { id } = await registry.register(payload);
          const instance = registry.getById(id);
          expect(instance?.url).toBe(payload.url);
          expect(instance?.profileId).toBe(payload.profileId);
          expect(instance?.platform).toBe(payload.platform);
        } finally {
          registry.stopHeartbeatSweep();
          db.close();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 2: Heartbeat promotes offline to online ─────────────────────────
// Feature: a2a-registry, Property 2: Heartbeat promotes offline to online
describe('Property 2: Heartbeat promotes offline to online', () => {
  it('heartbeat on offline instance sets status to online and updates lastSeen', async () => {
    await fc.assert(
      fc.asyncProperty(registrationArb, async (payload) => {
        const { db, registry } = freshRegistry();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeCard()),
        }));
        try {
          const { id } = await registry.register(payload);
          const instance = registry.getById(id)!;
          const prevLastSeen = instance.lastSeen;
          instance.status = 'offline';

          registry.heartbeat(id);

          const updated = registry.getById(id)!;
          expect(updated.status).toBe('online');
          expect(updated.lastSeen).toBeGreaterThanOrEqual(prevLastSeen);
        } finally {
          registry.stopHeartbeatSweep();
          db.close();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: Stale instances go offline ───────────────────────────────────
// Feature: a2a-registry, Property 3: Stale instances go offline
describe('Property 3: Stale instances go offline', () => {
  it('instances with lastSeen > 90s ago are marked offline by sweep', async () => {
    await fc.assert(
      fc.asyncProperty(registrationArb, async (payload) => {
        vi.useFakeTimers();
        const { db, registry } = freshRegistry();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeCard()),
        }));
        try {
          const { id } = await registry.register(payload);
          const instance = registry.getById(id)!;
          // Set lastSeen to 100s ago
          instance.lastSeen = Date.now() - 100_000;
          instance.status = 'online';

          registry.startHeartbeatSweep();
          vi.advanceTimersByTime(31_000);

          expect(registry.getById(id)!.status).toBe('offline');
        } finally {
          registry.stopHeartbeatSweep();
          db.close();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 4: Tag filter excludes non-matching instances ───────────────────
// Feature: a2a-registry, Property 4: Tag filter excludes non-matching instances
describe('Property 4: Tag filter excludes non-matching instances', () => {
  it('getAll({ tag }) returns only instances whose card skills include that tag', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            url: fc.webUrl({ withQueryParameters: false, withFragments: false }),
            profileId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            tags: fc.array(fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/.test(s)), { minLength: 1, maxLength: 3 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-z]+$/.test(s)),
        async (agents, filterTag) => {
          const { db, registry } = freshRegistry();
          // Register each agent with its own tags
          for (const agent of agents) {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
              ok: true,
              json: () => Promise.resolve(makeCard('Agent', agent.tags)),
            }));
            await registry.register({ url: agent.url, profileId: agent.profileId, platform: 'any', metadata: {} });
          }

          const filtered = registry.getAll({ tag: filterTag });
          for (const inst of filtered) {
            const hasTag = inst.card.skills?.some(s => s.tags?.includes(filterTag));
            expect(hasTag).toBe(true);
          }

          registry.stopHeartbeatSweep();
          db.close();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 5: Platform filter excludes non-matching instances ──────────────
// Feature: a2a-registry, Property 5: Platform filter excludes non-matching instances
describe('Property 5: Platform filter excludes non-matching instances', () => {
  it('getAll({ platform }) returns only instances with that platform', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            url: fc.webUrl({ withQueryParameters: false, withFragments: false }),
            profileId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            platform: platformArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        platformArb,
        async (agents, filterPlatform) => {
          const { db, registry } = freshRegistry();
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(makeCard()),
          }));
          for (const agent of agents) {
            await registry.register({ url: agent.url, profileId: agent.profileId, platform: agent.platform, metadata: {} });
          }

          const filtered = registry.getAll({ platform: filterPlatform });
          for (const inst of filtered) {
            expect(inst.platform).toBe(filterPlatform);
          }

          registry.stopHeartbeatSweep();
          db.close();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 6: Coverage counts consistent with instance list ────────────────
// Feature: a2a-registry, Property 6: Coverage counts consistent with instance list
describe('Property 6: Coverage counts consistent with instance list', () => {
  it('sum of coverage online counts equals count of online instances', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            url: fc.webUrl({ withQueryParameters: false, withFragments: false }),
            profileId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
            platform: platformArb,
          }),
          { minLength: 0, maxLength: 6 }
        ),
        async (agents) => {
          const { db, registry } = freshRegistry();
          vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(makeCard()),
          }));
          for (const agent of agents) {
            await registry.register({ url: agent.url, profileId: agent.profileId, platform: agent.platform, metadata: {} });
          }

          const coverage = registry.getCoverage();
          const onlineFromCoverage = Object.values(coverage).reduce((sum, e) => sum + e.online, 0);
          const onlineFromGetAll = registry.getAll({ status: 'online' }).length;
          expect(onlineFromCoverage).toBe(onlineFromGetAll);

          registry.stopHeartbeatSweep();
          db.close();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 7: Deregistration removes instance ──────────────────────────────
// Feature: a2a-registry, Property 7: Deregistration removes instance
describe('Property 7: Deregistration removes instance', () => {
  it('deregister(id) causes getById(id) to return undefined', async () => {
    await fc.assert(
      fc.asyncProperty(registrationArb, async (payload) => {
        const { db, registry } = freshRegistry();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeCard()),
        }));
        try {
          const { id } = await registry.register(payload);
          registry.deregister(id);
          expect(registry.getById(id)).toBeUndefined();
          expect(registry.getAll().find(i => i.id === id)).toBeUndefined();
        } finally {
          registry.stopHeartbeatSweep();
          db.close();
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 8: Upsert on duplicate url+profileId ────────────────────────────
// Feature: a2a-registry, Property 8: Upsert on duplicate url+profileId
describe('Property 8: Upsert on duplicate url+profileId', () => {
  it('registering same url+profileId twice returns same id and does not duplicate', async () => {
    await fc.assert(
      fc.asyncProperty(registrationArb, async (payload) => {
        const { db, registry } = freshRegistry();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(makeCard()),
        }));
        try {
          const first = await registry.register(payload);
          const second = await registry.register(payload);
          expect(first.id).toBe(second.id);
          expect(registry.getAll().filter(i => i.url === payload.url && i.profileId === payload.profileId)).toHaveLength(1);
        } finally {
          registry.stopHeartbeatSweep();
          db.close();
        }
      }),
      { numRuns: 100 }
    );
  });
});
