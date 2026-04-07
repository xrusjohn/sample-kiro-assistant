// Feature: a2a-registry — Express route tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { A2ARegistry } from './a2a-registry.js';
import { createA2ARouter } from './a2a-router.js';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./profile-store.js', () => ({
  loadProfiles: vi.fn().mockReturnValue([
    {
      id: 'coding-assistant',
      label: 'Coding Assistant',
      description: 'General-purpose coding agent',
      platform: 'any',
      skills: ['coding'],
      tools: [],
      tags: ['coding'],
      cardTemplate: {
        name: 'Kiro Coding Assistant',
        description: 'Write, edit, and explain code',
        version: '1.0.0',
        skills: [{ id: 'coding-assistant', name: 'Coding Assistant', tags: ['coding'] }],
      },
    },
  ]),
  saveProfiles: vi.fn(),
}));

// Mock agent-spawner to avoid Docker calls
vi.mock('./agent-spawner.js', () => ({
  spawnAgent: vi.fn().mockResolvedValue({ instanceId: 'spawned-id', registeredAt: Date.now() }),
  killSpawnedAgent: vi.fn().mockResolvedValue(true),
}));

const mockCard = {
  name: 'Test Agent',
  description: 'Test agent description',
  version: '1.0.0',
  skills: [{ id: 'test-skill', name: 'Test Skill', tags: ['test'] }],
};

// ── Setup ────────────────────────────────────────────────────────────────────

function buildApp() {
  const db = new Database(':memory:');
  const registry = new A2ARegistry(db);
  const app = express();
  app.use(express.json());
  app.use('/api/a2a', createA2ARouter(registry));
  return { app, registry, db };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('A2A Routes', () => {
  let app: express.Express;
  let registry: A2ARegistry;
  let db: Database.Database;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCard),
    }));
    ({ app, registry, db } = buildApp());
  });

  afterEach(() => {
    registry.stopHeartbeatSweep();
    db.close();
  });

  // ── POST /registry ──────────────────────────────────────────────────────────

  it('POST /api/a2a/registry returns 400 on missing url', async () => {
    const res = await request(app)
      .post('/api/a2a/registry')
      .send({ profileId: 'test', platform: 'any' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('url');
  });

  it('POST /api/a2a/registry returns 400 on missing profileId', async () => {
    const res = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', platform: 'any' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('profileId');
  });

  it('POST /api/a2a/registry returns 400 on missing platform', async () => {
    const res = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('platform');
  });

  it('POST /api/a2a/registry returns 400 on card fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' }));
    const res = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Failed to fetch agent card');
  });

  it('POST /api/a2a/registry returns { id, registeredAt } on success', async () => {
    const res = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('registeredAt');
  });

  // ── GET /registry ───────────────────────────────────────────────────────────

  it('GET /api/a2a/registry returns empty array initially', async () => {
    const res = await request(app).get('/api/a2a/registry');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('GET /api/a2a/registry returns registered instances', async () => {
    await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const res = await request(app).get('/api/a2a/registry');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET /api/a2a/registry?tag= filters by tag', async () => {
    await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const res = await request(app).get('/api/a2a/registry?tag=test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const noMatch = await request(app).get('/api/a2a/registry?tag=nonexistent');
    expect(noMatch.body).toHaveLength(0);
  });

  it('GET /api/a2a/registry?platform= filters by platform', async () => {
    await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'linux' });
    const res = await request(app).get('/api/a2a/registry?platform=linux');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const noMatch = await request(app).get('/api/a2a/registry?platform=windows');
    expect(noMatch.body).toHaveLength(0);
  });

  // ── GET /registry/online ────────────────────────────────────────────────────

  it('GET /api/a2a/registry/online returns only online instances', async () => {
    await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const res = await request(app).get('/api/a2a/registry/online');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('online');
  });

  // ── GET /registry/:id ───────────────────────────────────────────────────────

  it('GET /api/a2a/registry/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/a2a/registry/nonexistent-id');
    expect(res.status).toBe(404);
    expect(res.body.message).toBeDefined();
  });

  it('GET /api/a2a/registry/:id returns instance for known id', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const { id } = reg.body;
    const res = await request(app).get(`/api/a2a/registry/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  // ── DELETE /registry/:id ────────────────────────────────────────────────────

  it('DELETE /api/a2a/registry/:id returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/a2a/registry/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/a2a/registry/:id removes instance', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const { id } = reg.body;
    const del = await request(app).delete(`/api/a2a/registry/${id}`);
    expect(del.status).toBe(200);
    const get = await request(app).get(`/api/a2a/registry/${id}`);
    expect(get.status).toBe(404);
  });

  // ── PUT /registry/:id/heartbeat ─────────────────────────────────────────────

  it('PUT /api/a2a/registry/:id/heartbeat returns 404 for unknown id', async () => {
    const res = await request(app).put('/api/a2a/registry/nonexistent-id/heartbeat');
    expect(res.status).toBe(404);
  });

  it('PUT /api/a2a/registry/:id/heartbeat returns ok for known id', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const { id } = reg.body;
    const res = await request(app).put(`/api/a2a/registry/${id}/heartbeat`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── GET /registry/:id/introspect ────────────────────────────────────────────

  it('GET /api/a2a/registry/:id/introspect returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/a2a/registry/nonexistent-id/introspect');
    expect(res.status).toBe(404);
  });

  it('GET /api/a2a/registry/:id/introspect returns full details', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const { id } = reg.body;
    const res = await request(app).get(`/api/a2a/registry/${id}/introspect`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('instance');
    expect(res.body).toHaveProperty('activeSessionCount');
    expect(res.body).toHaveProperty('uptimeMs');
  });

  // ── GET /registry/:id/config ────────────────────────────────────────────────

  it('GET /api/a2a/registry/:id/config returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/a2a/registry/nonexistent-id/config');
    expect(res.status).toBe(404);
  });

  it('GET /api/a2a/registry/:id/config returns config for known id', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'coding-assistant', platform: 'any' });
    const { id } = reg.body;
    const res = await request(app).get(`/api/a2a/registry/${id}/config`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('skills');
  });

  // ── PUT /registry/:id/config ────────────────────────────────────────────────

  it('PUT /api/a2a/registry/:id/config returns 404 for unknown id', async () => {
    const res = await request(app)
      .put('/api/a2a/registry/nonexistent-id/config')
      .send({ newSetting: 'value' });
    expect(res.status).toBe(404);
  });

  it('PUT /api/a2a/registry/:id/config updates config', async () => {
    const reg = await request(app)
      .post('/api/a2a/registry')
      .send({ url: 'http://agent.local', profileId: 'test', platform: 'any' });
    const { id } = reg.body;
    const res = await request(app)
      .put(`/api/a2a/registry/${id}/config`)
      .send({ newSetting: 'value' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── GET /profiles ───────────────────────────────────────────────────────────

  it('GET /api/a2a/profiles returns profile list', async () => {
    const res = await request(app).get('/api/a2a/profiles');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // ── POST /profiles ──────────────────────────────────────────────────────────

  it('POST /api/a2a/profiles returns 400 on invalid profile', async () => {
    const res = await request(app)
      .post('/api/a2a/profiles')
      .send({ id: '', label: '' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  it('POST /api/a2a/profiles creates profile and returns 201', async () => {
    const profile = {
      id: 'new-agent',
      label: 'New Agent',
      description: 'A new agent',
      platform: 'any',
      skills: ['test'],
      tools: [],
      tags: ['test'],
      cardTemplate: { name: 'New Agent', description: 'New', version: '1.0.0', skills: [] },
    };
    const res = await request(app).post('/api/a2a/profiles').send(profile);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-agent');
  });

  // ── PUT /profiles/:id ───────────────────────────────────────────────────────

  it('PUT /api/a2a/profiles/:id returns 404 for unknown id', async () => {
    const profile = {
      id: 'nonexistent',
      label: 'X',
      description: 'X',
      platform: 'any',
      skills: [],
      tools: [],
      tags: [],
      cardTemplate: { name: 'X', description: 'X', version: '1.0.0', skills: [] },
    };
    const res = await request(app).put('/api/a2a/profiles/nonexistent').send(profile);
    expect(res.status).toBe(404);
  });

  it('PUT /api/a2a/profiles/:id updates existing profile', async () => {
    const profile = {
      id: 'coding-assistant',
      label: 'Updated Coding Assistant',
      description: 'Updated description',
      platform: 'any',
      skills: ['coding', 'updated'],
      tools: [],
      tags: ['coding'],
      cardTemplate: { name: 'Updated', description: 'Updated', version: '2.0.0', skills: [] },
    };
    const res = await request(app).put('/api/a2a/profiles/coding-assistant').send(profile);
    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Coding Assistant');
  });

  // ── DELETE /profiles/:id ────────────────────────────────────────────────────

  it('DELETE /api/a2a/profiles/:id returns 404 for unknown id', async () => {
    const res = await request(app).delete('/api/a2a/profiles/nonexistent');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/a2a/profiles/:id removes profile', async () => {
    const res = await request(app).delete('/api/a2a/profiles/coding-assistant');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // ── GET /coverage ───────────────────────────────────────────────────────────

  it('GET /api/a2a/coverage returns coverage object', async () => {
    const res = await request(app).get('/api/a2a/coverage');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('any');
    expect(res.body).toHaveProperty('linux');
    expect(res.body).toHaveProperty('windows');
  });

  // ── POST /spawn ─────────────────────────────────────────────────────────────

  it('POST /api/a2a/spawn returns 400 when no profileId or profile', async () => {
    const res = await request(app).post('/api/a2a/spawn').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('profileId');
  });

  it('POST /api/a2a/spawn calls spawnAgent and returns result', async () => {
    const res = await request(app)
      .post('/api/a2a/spawn')
      .send({ profileId: 'coding-assistant', platform: 'any' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('instanceId');
  });

  // ── DELETE /spawn/:instanceId ───────────────────────────────────────────────

  it('DELETE /api/a2a/spawn/:instanceId returns 404 for unknown instance', async () => {
    const { killSpawnedAgent } = await import('./agent-spawner.js');
    (killSpawnedAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const res = await request(app).delete('/api/a2a/spawn/nonexistent-id');
    expect(res.status).toBe(404);
  });

  it('DELETE /api/a2a/spawn/:instanceId kills and returns ok', async () => {
    const res = await request(app).delete('/api/a2a/spawn/some-instance-id');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
