import type { ServerEvent, ClientEvent } from "../electron/types.js";
import { createAcpRunner, type RunnerHandle } from "./runner.js";
import { SessionStore } from "../electron/libs/session-store.js";
import { DB_PATH } from "./paths.js";
import { normalizeWorkingDirectory } from "./util.js";
import { createWorkspaceDirectory } from "../electron/libs/workspace.js";
import { loadAssistantSettings } from "./app-settings.js";
import { DEFAULT_MODEL_ID } from "../shared/models.js";

export const sessions = new SessionStore(DB_PATH);
const runnerHandles = new Map<string, RunnerHandle>();

type BroadcastFn = (event: ServerEvent) => void;
let broadcastFn: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn) { broadcastFn = fn; }

const resolveModelId = () => loadAssistantSettings().defaultModel?.trim() || DEFAULT_MODEL_ID;

function emit(event: ServerEvent) {
  if (event.type === "session.status") sessions.updateSession(event.payload.sessionId, { status: event.payload.status });
  if (event.type === "stream.message") sessions.recordMessage(event.payload.sessionId, event.payload.message);
  if (event.type === "stream.user_prompt") sessions.recordMessage(event.payload.sessionId, { type: "user_prompt", prompt: event.payload.prompt });
  broadcastFn(event);
}

export function handleClientEvent(event: ClientEvent) {
  if (event.type === "session.list") {
    emit({ type: "session.list", payload: { sessions: sessions.listSessions() } });
    return;
  }

  if (event.type === "session.history") {
    const history = sessions.getSessionHistory(event.payload.sessionId);
    if (!history) { emit({ type: "runner.error", payload: { message: "Unknown session" } }); return; }
    emit({ type: "session.history", payload: { sessionId: history.session.id, status: history.session.status, messages: history.messages } });
    return;
  }

  if (event.type === "session.start") {
    let cwd = normalizeWorkingDirectory(event.payload.cwd);
    if (!cwd) cwd = createWorkspaceDirectory();
    const session = sessions.createSession({
      cwd, title: event.payload.title, allowedTools: event.payload.allowedTools,
      prompt: event.payload.prompt, interactive: Boolean(event.payload.interactive)
    });

    const modelId = resolveModelId();
    session.selectedModel = modelId;

    // Create a long-lived ACP runner for this session
    const handle = createAcpRunner({
      session: session as any,
      model: modelId,
      onEvent: emit,
      onSessionUpdate: (u) => sessions.updateSession(session.id, u)
    });
    runnerHandles.set(session.id, handle);

    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

    // Delay user prompt so UI switches to session first
    const initialPrompt = event.payload.prompt;
    setTimeout(() => {
      emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: initialPrompt } });
    }, 200);

    // Send the prompt (runner queues it until ACP is ready)
    handle.sendPrompt(event.payload.prompt);
    return;
  }

  if (event.type === "session.continue") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) { emit({ type: "runner.error", payload: { message: "Unknown session" } }); return; }

    let handle = runnerHandles.get(session.id);
    if (!handle) {
      // No runner — server was restarted. Spin up a new ACP process.
      const modelId = resolveModelId();
      session.selectedModel = modelId;
      const history = sessions.getSessionHistory(session.id);
      handle = createAcpRunner({
        session: session as any,
        model: modelId,
        resumeSessionId: session.kiroConversationId || undefined,
        history: history?.messages ?? [],
        onEvent: emit,
        onSessionUpdate: (u) => sessions.updateSession(session.id, u)
      });
      runnerHandles.set(session.id, handle);
    }

    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: event.payload.prompt } });

    // Reuse the existing ACP process
    handle.sendPrompt(event.payload.prompt);
    return;
  }

  if (event.type === "session.stop") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;
    // Don't kill the runner — just mark idle. The ACP process stays alive.
    sessions.updateSession(session.id, { status: "idle" });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd } });
    return;
  }

  if (event.type === "session.delete") {
    const id = event.payload.sessionId;
    const handle = runnerHandles.get(id);
    if (handle) { handle.abort(); runnerHandles.delete(id); }
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
