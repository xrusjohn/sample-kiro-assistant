import type { ServerEvent, ClientEvent } from "../electron/types.js";
import { SessionStore } from "../electron/libs/session-store.js";
import { RunnerManager } from "./runner-manager.js";
import { AgentRegistry } from "./agent-registry.js";
import { DB_PATH, pullDbFromS3, pushDbToS3 } from "./paths.js";
import { normalizeWorkingDirectory } from "./util.js";
import { createWorkspaceDirectory } from "../electron/libs/workspace.js";
import { loadAssistantSettings } from "./app-settings.js";
import { DEFAULT_MODEL_ID } from "../shared/models.js";
import type { A2ARegistry } from "./a2a-registry.js";
import { extractTagsFromPrompt } from "./routing-helper.js";
import { createA2ARunner } from "./a2a-runner.js";
import { createWsAgentRunner } from "./ws-agent-runner.js";

pullDbFromS3();
export const sessions = new SessionStore(DB_PATH);
export const registry = new AgentRegistry();
export const manager = new RunnerManager(registry);

// A2ARegistry reference — set via setA2ARegistry() from index.ts after boot
// to avoid circular imports (index.ts imports session-handler.ts).
let a2aRegistry: A2ARegistry | undefined;

export function setA2ARegistry(reg: A2ARegistry): void {
  a2aRegistry = reg;

  // 5.4 — When a routed instance goes offline, notify active sessions
  a2aRegistry.on('agent.offline', ({ id: instanceId }: { id: string }) => {
    for (const session of sessions.listSessions()) {
      if ((session as any).routedInstanceId === instanceId) {
        emit({
          type: 'session.status',
          payload: { sessionId: session.id, status: 'agent-offline', instanceId },
        });
      }
    }
  });
}

type BroadcastFn = (event: ServerEvent) => void;
let broadcastFn: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn) { broadcastFn = fn; }

// Per-session event listeners (used by AG-UI SSE endpoint)
type SessionListener = (event: ServerEvent) => void;
const sessionListeners = new Map<string, Set<SessionListener>>();
const globalListeners = new Set<SessionListener>();

export function addSessionListener(sessionId: string, fn: SessionListener): () => void {
  if (!sessionListeners.has(sessionId)) sessionListeners.set(sessionId, new Set());
  sessionListeners.get(sessionId)!.add(fn);
  return () => { sessionListeners.get(sessionId)?.delete(fn); };
}

export function addGlobalListener(fn: SessionListener): () => void {
  globalListeners.add(fn);
  return () => { globalListeners.delete(fn); };
}

export function abortAll() { manager.abortAll(); }

const resolveModelId = () => loadAssistantSettings().defaultModel?.trim() || DEFAULT_MODEL_ID;

/** Hot-restart: kill old ACP process, immediately respawn with history. Returns true on success. */
export function restartSession(sessionId: string): boolean {
  const session = sessions.getSession(sessionId);
  if (!session) return false;

  console.log(`[restart] Hot-reloading ACP for session ${sessionId}...`);
  manager.destroy(sessionId);

  const modelId = resolveModelId();
  const history = sessions.getSessionHistory(sessionId);

  const handle = manager.spawn({
    session: session as any,
    model: modelId,
    agentId: session.agentId ?? "kiro",
    history: history?.messages ?? [],
    onEvent: emit,
    onSessionUpdate: (u) => sessions.updateSession(sessionId, u),
  });

  if (!handle) {
    emit({ type: "session.status", payload: { sessionId, status: "error", title: session.title, cwd: session.cwd, error: "Failed to respawn ACP process" } });
    return false;
  }

  return true;
}

function emit(event: ServerEvent) {
  if (event.type === "session.status") {
    sessions.updateSession(event.payload.sessionId, { status: event.payload.status });
    if (event.payload.status === "idle") pushDbToS3();
  }
  if (event.type === "stream.message") sessions.recordMessage(event.payload.sessionId, event.payload.message);
  if (event.type === "stream.user_prompt") sessions.recordMessage(event.payload.sessionId, { type: "user_prompt", prompt: event.payload.prompt, source: event.payload.source });
  broadcastFn(event);

  // Notify per-session listeners (AG-UI SSE)
  const sid = (event.payload as any)?.sessionId;
  if (sid) sessionListeners.get(sid)?.forEach(fn => fn(event));
  globalListeners.forEach(fn => fn(event));
}

export function handleClientEvent(event: ClientEvent) {
  if (event.type === "session.list") {
    const list = sessions.listSessions().map(s => {
      const entry = manager.get(s.id);
      return { ...s, hasRunner: !!entry && entry.state !== "suspended" };
    });
    emit({ type: "session.list", payload: { sessions: list } });
    return;
  }

  if (event.type === "session.history") {
    const history = sessions.getSessionHistory(event.payload.sessionId);
    if (!history) { emit({ type: "runner.error", payload: { message: "Unknown session" } }); return; }
    emit({ type: "session.history", payload: { sessionId: history.session.id, status: history.session.status, messages: history.messages } });
    return;
  }

  if (event.type === "session.start") {
    if (!manager.canSpawn()) {
      const health = manager.getHealth();
      emit({ type: "runner.error", payload: { message: `Session limit reached (${health.activeProcesses}/${health.maxConcurrent}). Close or wait for an idle session to be suspended.` } });
      return;
    }

    // Resolve and validate the requested agent
    const agentId = event.payload.agentId ?? registry.getDefault();
    console.log(`[session] starting session with agent=${agentId}`);
    let agent;
    try {
      agent = registry.get(agentId);
    } catch {
      emit({ type: "runner.error", payload: { message: `Unknown agent: "${agentId}". Available agents: ${registry.getAll().map(a => a.id).join(", ")}` } });
      return;
    }
    if (!agent.available && process.env.ECS_RUNNER_ENABLED !== "true") {
      emit({ type: "runner.error", payload: { message: `Agent "${agent.label}" is not available — binary "${agent.defaultBinary}" not found. Install it and try again.` } });
      return;
    }

    let cwd = normalizeWorkingDirectory(event.payload.cwd);
    if (!cwd) cwd = createWorkspaceDirectory();
    const session = sessions.createSession({
      cwd, title: event.payload.title, allowedTools: event.payload.allowedTools,
      prompt: event.payload.prompt, interactive: Boolean(event.payload.interactive),
      agentId
    });

    const modelId = resolveModelId();
    session.selectedModel = modelId;

    // 5.2 — Capability-based routing: try to find a remote instance before falling back to local
    const profileId: string | undefined = (event.payload as any).profileId;
    const tags = extractTagsFromPrompt(event.payload.prompt ?? '');
    const remoteInstance = a2aRegistry?.findBestInstance(profileId, tags);

    // 5.3 — Log routing decision
    const matchReason = profileId ? 'explicit-profile' : (tags.length > 0 ? 'tag-match' : 'fallback');
    console.log(`[routing] session=${session.id} reason=${matchReason} instance=${remoteInstance?.id ?? 'local'}`);

    // Store routed instance ID on session for offline detection (5.4)
    if (remoteInstance) {
      (session as any).routedInstanceId = remoteInstance.id;

      // Route to WS agent
      if (remoteInstance.transport === 'ws') {
        console.log(`[routing] proxying session=${session.id} to WS agent ${remoteInstance.id}`);
        const wsHandle = createWsAgentRunner({
          instanceId: remoteInstance.id,
          sessionId: session.id,
          onEvent: emit,
        });

        sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
        emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

        const initialPrompt = event.payload.prompt;
        setTimeout(() => {
          emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: initialPrompt, source: (event.payload as any).source } });
        }, 200);

        wsHandle.sendPrompt(event.payload.prompt);
        return;
      }

      // Route to remote A2A HTTP agent
      console.log(`[routing] proxying session=${session.id} to remote instance ${remoteInstance.id} at ${remoteInstance.url}`);
      const a2aHandle = createA2ARunner({
        session: session as any,
        instance: remoteInstance,
        onEvent: emit,
        onSessionUpdate: (u) => sessions.updateSession(session.id, u),
        onFatalError: (reason: string) => {
          // Mark instance degraded and fall back to local
          console.log(`[routing] A2A failed for session=${session.id}, reason=${reason} — falling back to local`);
          a2aRegistry?.markDegraded(remoteInstance.id, reason);

          const localHandle = manager.spawn({
            session: session as any,
            model: modelId,
            agentId,
            onEvent: emit,
            onSessionUpdate: (u) => sessions.updateSession(session.id, u)
          });

          if (!localHandle) {
            emit({ type: "runner.error", payload: { sessionId: session.id, message: "A2A agent failed and local fallback also failed." } });
            return;
          }

          emit({
            type: 'stream.message',
            payload: {
              sessionId: session.id,
              message: {
                type: 'assistant',
                message: { role: 'assistant', content: [{ type: 'text', text: `⚠ Remote agent (${remoteInstance.profileId}) is degraded: ${reason}. Falling back to local.` }] },
              } as any,
            },
          });

          localHandle.sendPrompt(event.payload.prompt);
        },
      });

      sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
      emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

      const initialPrompt = event.payload.prompt;
      setTimeout(() => {
        emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: initialPrompt, source: (event.payload as any).source } });
      }, 200);

      a2aHandle.sendPrompt(event.payload.prompt);
      return;
    }

    // Fallback to local ACP runner
    const handle = manager.spawn({
      session: session as any,
      model: modelId,
      agentId,
      onEvent: emit,
      onSessionUpdate: (u) => sessions.updateSession(session.id, u)
    });

    if (!handle) {
      emit({ type: "runner.error", payload: { sessionId: session.id, message: "Failed to spawn ACP process." } });
      return;
    }

    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

    const initialPrompt = event.payload.prompt;
    setTimeout(() => {
      emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: initialPrompt } });
    }, 200);

    handle.sendPrompt(event.payload.prompt);
    return;
  }

  if (event.type === "session.continue") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) { emit({ type: "runner.error", payload: { message: "Unknown session" } }); return; }

    const modelId = resolveModelId();
    session.selectedModel = modelId;
    const history = sessions.getSessionHistory(session.id);

    const handle = manager.getOrSpawn({
      session: session as any,
      model: modelId,
      agentId: session.agentId ?? "kiro",
      resumeSessionId: session.kiroConversationId || undefined,
      history: history?.messages ?? [],
      onEvent: emit,
      onSessionUpdate: (u) => sessions.updateSession(session.id, u)
    });

    if (!handle) {
      const health = manager.getHealth();
      emit({ type: "runner.error", payload: { sessionId: session.id, message: `Session limit reached (${health.activeProcesses}/${health.maxConcurrent}).` } });
      return;
    }

    manager.markActive(session.id);
    sessions.updateSession(session.id, { lastPrompt: event.payload.prompt });
    emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: event.payload.prompt, source: (event.payload as any).source } });

    handle.sendPrompt(event.payload.prompt);
    return;
  }

  if (event.type === "session.stop") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;
    manager.destroy(session.id);
    sessions.updateSession(session.id, { status: "idle" });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd } });
    return;
  }

  if (event.type === "session.delete") {
    const id = event.payload.sessionId;
    manager.destroy(id);
    sessions.deleteSession(id);
    emit({ type: "session.deleted", payload: { sessionId: id } });
    return;
  }

  if (event.type === "permission.response") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;
    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) pending.resolve(event.payload.result);
    return;
  }
}
