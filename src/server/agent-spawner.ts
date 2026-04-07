import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { A2ARegistry } from './a2a-registry.js';
import type { AgentProfile, Platform } from './a2a-types.js';

const execAsync = promisify(exec);

// Track spawned containers: instanceId → containerId
const spawnedContainers = new Map<string, string>();

export interface SpawnParams {
  profileId?: string;
  profile?: AgentProfile;
  platform?: Platform;
  env?: Record<string, string>;
}

export interface SpawnResult {
  instanceId: string;
  registeredAt: number;
}

export async function spawnAgent(
  params: SpawnParams,
  registry: A2ARegistry,
  orchestratorUrl: string
): Promise<SpawnResult> {
  // 7.2 — If inline profile provided, save it first
  let resolvedProfileId = params.profileId;
  let resolvedProfile: AgentProfile | undefined;

  if (params.profile) {
    registry.saveProfile(params.profile);
    resolvedProfileId = params.profile.id;
    resolvedProfile = params.profile;
  } else if (resolvedProfileId) {
    resolvedProfile = registry.getProfiles().find(p => p.id === resolvedProfileId);
  }

  if (!resolvedProfileId) {
    throw new Error('profileId or profile is required');
  }

  const platform = params.platform ?? resolvedProfile?.platform ?? 'any';
  const skills = resolvedProfile?.skills.join(',') ?? '';
  const tags = resolvedProfile?.tags.join(',') ?? '';

  // Assign a unique port for this container (9100–9199 range)
  const agentPort = 9100 + (spawnedContainers.size % 100);

  // 7.1 — Launch Docker container
  const containerName = `kiro-agent-${resolvedProfileId}-${Date.now()}`;
  const envArgs = [
    `-e A2A_PROFILE=${resolvedProfileId}`,
    `-e A2A_PLATFORM=${platform}`,
    `-e A2A_SKILLS=${skills}`,
    `-e A2A_TAGS=${tags}`,
    `-e PORT=${agentPort}`,
    `-e ORCHESTRATOR_URL=${orchestratorUrl}`,
    ...Object.entries(params.env ?? {}).map(([k, v]) => `-e ${k}=${v}`),
  ].join(' ');

  const dockerImage = process.env.A2A_AGENT_IMAGE ?? 'kiro-subagent-local:latest';
  // Mount the local a2a-adapter.js so the container runs our updated version with
  // self-registration. Use host networking so it can reach localhost:3001.
  // Mount ~/.kiro and ~/.aws read-only so kiro-cli and AWS SDK inside the container
  // pick up host credentials. Bind mounts are read-through so credential refreshes
  // on the host are visible immediately.
  const adapterPath = new URL('../../scripts/a2a-adapter.js', import.meta.url).pathname;
  const homeDir = process.env.HOME ?? '/root';
  const dockerCmd = `docker run -d --name ${containerName} --network host -v ${adapterPath}:/home/kiro/a2a-adapter.js:ro -v ${homeDir}/.kiro:/home/kiro/.kiro:ro -v ${homeDir}/.aws:/home/kiro/.aws:ro --entrypoint node ${envArgs} ${dockerImage} /home/kiro/a2a-adapter.js`;

  let containerId: string;
  try {
    const { stdout } = await execAsync(dockerCmd);
    containerId = stdout.trim();
  } catch (err) {
    throw new Error(`Failed to start Docker container: ${(err as Error).message}`);
  }

  // 7.3 — Poll registry for self-registration (up to 60s)
  const deadline = Date.now() + 60_000;
  const pollInterval = 2_000;

  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    const instances = registry.getAll();
    const newInstance = instances.find(i =>
      i.profileId === resolvedProfileId &&
      i.status === 'online' &&
      !spawnedContainers.has(i.id)
    );
    if (newInstance) {
      spawnedContainers.set(newInstance.id, containerId);
      return { instanceId: newInstance.id, registeredAt: newInstance.registeredAt };
    }
  }

  // Timeout — clean up container
  try {
    await execAsync(`docker rm -f ${containerId}`);
  } catch { /* best effort */ }

  throw new Error('SPAWN_TIMEOUT');
}

export async function killSpawnedAgent(instanceId: string, registry: A2ARegistry): Promise<boolean> {
  const containerId = spawnedContainers.get(instanceId);
  if (!containerId) return false;

  try {
    await execAsync(`docker kill --signal SIGTERM ${containerId}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    await execAsync(`docker rm -f ${containerId}`).catch(() => {});
  } catch { /* best effort */ }

  spawnedContainers.delete(instanceId);
  registry.deregister(instanceId);
  return true;
}
