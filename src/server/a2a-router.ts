import { Router } from 'express';
import type { A2ARegistry } from './a2a-registry.js';
import { validateProfile } from './profile-validator.js';
import type { Platform } from './a2a-types.js';
import { spawnAgent, killSpawnedAgent } from './agent-spawner.js';

export function createA2ARouter(registry: A2ARegistry): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // POST /registry — register a new agent instance
  // -------------------------------------------------------------------------
  router.post('/registry', async (req, res) => {
    const { url, profileId, platform, metadata } = req.body ?? {};

    if (!url || typeof url !== 'string') {
      res.status(400).json({ message: 'Missing required field: url' });
      return;
    }
    if (!profileId || typeof profileId !== 'string') {
      res.status(400).json({ message: 'Missing required field: profileId' });
      return;
    }
    if (!platform || typeof platform !== 'string') {
      res.status(400).json({ message: 'Missing required field: platform' });
      return;
    }

    try {
      const result = await registry.register({
        url,
        profileId,
        platform: platform as Platform,
        metadata: metadata ?? {},
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  // -------------------------------------------------------------------------
  // GET /registry/online — must be before /:id to avoid "online" as an id
  // -------------------------------------------------------------------------
  router.get('/registry/online', (_req, res) => {
    res.json(registry.getAll({ status: 'online' }));
  });

  // -------------------------------------------------------------------------
  // GET /registry — list all instances with optional filters
  // -------------------------------------------------------------------------
  router.get('/registry', (req, res) => {
    const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const platform = typeof req.query.platform === 'string' ? req.query.platform as Platform : undefined;
    res.json(registry.getAll({ tag, platform }));
  });

  // -------------------------------------------------------------------------
  // GET /registry/:id/introspect — full instance details
  // -------------------------------------------------------------------------
  router.get('/registry/:id/introspect', (req, res) => {
    const instance = registry.getById(req.params.id);
    if (!instance) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }

    const profiles = registry.getProfiles();
    const profile = profiles.find((p) => p.id === instance.profileId) ?? null;
    const uptimeMs = Date.now() - instance.registeredAt;

    res.json({
      instance,
      profile,
      activeSessionCount: 0,
      uptimeMs,
    });
  });

  // -------------------------------------------------------------------------
  // GET /registry/:id/config — get effective instance config
  // -------------------------------------------------------------------------
  router.get('/registry/:id/config', (req, res) => {
    const config = registry.getInstanceConfig(req.params.id);
    if (config === undefined) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }
    res.json(config);
  });

  // -------------------------------------------------------------------------
  // PUT /registry/:id/config — update instance config
  // -------------------------------------------------------------------------
  router.put('/registry/:id/config', (req, res) => {
    const updated = registry.updateInstanceConfig(req.params.id, req.body ?? {});
    if (!updated) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // GET /registry/:id — get single instance
  // -------------------------------------------------------------------------
  router.get('/registry/:id', (req, res) => {
    const instance = registry.getById(req.params.id);
    if (!instance) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }
    res.json(instance);
  });

  // -------------------------------------------------------------------------
  // DELETE /registry/:id — deregister instance
  // -------------------------------------------------------------------------
  router.delete('/registry/:id', (req, res) => {
    const removed = registry.deregister(req.params.id);
    if (!removed) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // PUT /registry/:id/heartbeat — update lastSeen
  // -------------------------------------------------------------------------
  router.put('/registry/:id/heartbeat', (req, res) => {
    const updated = registry.heartbeat(req.params.id);
    if (!updated) {
      res.status(404).json({ message: 'Instance not found' });
      return;
    }
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // GET /profiles — list all profiles from catalog
  // -------------------------------------------------------------------------
  router.get('/profiles', (_req, res) => {
    res.json(registry.getProfiles());
  });

  // -------------------------------------------------------------------------
  // POST /profiles — create a new profile
  // -------------------------------------------------------------------------
  router.post('/profiles', (req, res) => {
    const validation = validateProfile(req.body);
    if (!validation.valid) {
      res.status(400).json({ message: validation.errors.join('; ') });
      return;
    }
    registry.saveProfile(req.body);
    res.status(201).json(req.body);
  });

  // -------------------------------------------------------------------------
  // PUT /profiles/:id — update an existing profile
  // -------------------------------------------------------------------------
  router.put('/profiles/:id', (req, res) => {
    const profiles = registry.getProfiles();
    const exists = profiles.some((p) => p.id === req.params.id);
    if (!exists) {
      res.status(404).json({ message: 'Profile not found' });
      return;
    }
    const validation = validateProfile(req.body);
    if (!validation.valid) {
      res.status(400).json({ message: validation.errors.join('; ') });
      return;
    }
    registry.saveProfile({ ...req.body, id: req.params.id });
    res.json({ ...req.body, id: req.params.id });
  });

  // -------------------------------------------------------------------------
  // DELETE /profiles/:id — remove a profile
  // -------------------------------------------------------------------------
  router.delete('/profiles/:id', (req, res) => {
    const removed = registry.deleteProfile(req.params.id);
    if (!removed) {
      res.status(404).json({ message: 'Profile not found' });
      return;
    }
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // GET /coverage — platform coverage summary
  // -------------------------------------------------------------------------
  router.get('/coverage', (_req, res) => {
    res.json(registry.getCoverage());
  });

  // -------------------------------------------------------------------------
  // POST /spawn — launch a new agent container
  // -------------------------------------------------------------------------
  router.post('/spawn', async (req, res) => {
    const { profileId, profile, platform, env } = req.body ?? {};

    if (!profileId && !profile) {
      res.status(400).json({ message: 'profileId or profile is required' });
      return;
    }

    const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

    try {
      const result = await spawnAgent({ profileId, profile, platform, env }, registry, orchestratorUrl);
      res.json(result);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'SPAWN_TIMEOUT') {
        res.status(504).json({ message: 'Agent failed to self-register within 60 seconds' });
      } else {
        res.status(500).json({ message: msg });
      }
    }
  });

  // -------------------------------------------------------------------------
  // DELETE /spawn/:instanceId — SIGTERM container and deregister
  // -------------------------------------------------------------------------
  router.delete('/spawn/:instanceId', async (req, res) => {
    const removed = await killSpawnedAgent(req.params.instanceId, registry);
    if (!removed) {
      res.status(404).json({ message: 'Spawned instance not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
