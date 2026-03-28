import type { ServerEvent, ClientEvent } from "../electron/types.js";
import { runKiro, type RunnerHandle, type Session } from "./runner.js";
import { SessionStore } from "../electron/libs/session-store.js";
import { DB_PATH } from "./paths.js";
import { normalizeWorkingDirectory } from "./util.js";
import { createWorkspaceDirectory } from "../electron/libs/workspace.js";
import { loadKiroConversation, updateConversationDefaultModel } from "../electron/libs/kiro-conversation.js";
import { convertKiroHistoryEntries } from "../electron/libs/kiro-message-adapter.js";
import { loadAssistantSettings } from "./app-settings.js";
import { DEFAULT_MODEL_ID } from "../shared/models.js";

export const sessions = new SessionStore(DB_PATH);
const runnerHandles = new Map<string, RunnerHandle>();

type BroadcastFn = (event: ServerEvent) => void;
let broadcastFn: BroadcastFn = () => {};

export function setBroadcast(fn: BroadcastFn) { broadcastFn = fn; }

const resolveModelId = () => loadAssistantSettings().defaultModel?.trim() || DEFAULT_MODEL_ID;

const hydrateSessionMessages = (_session: ReturnType<typeof sessions.getSession>) => {
  // With ACP, messages are recorded directly via emit() — no SQLite hydration needed
};

function emit(event: ServerEvent) {
  if (event.type === "session.status") sessions.updateSession(event.payload.sessionId, { status: event.payload.status });
  if (event.type === "stream.message") sessions.recordMessage(event.payload.sessionId, event.payload.message);
  if (event.type === "stream.user_prompt") sessions.recordMessage(event.payload.sessionId, { type: "user_prompt", prompt: event.payload.prompt });
  broadcastFn(event);
}

export function handleClientEvent(event: ClientEvent) {
  if (event.type === "session.list") {
    const stored = sessions.listSessions();
    for (const s of stored) hydrateSessionMessages(sessions.getSession(s.id));
    emit({ type: "session.list", payload: { sessions: sessions.listSessions() } });
    return;
  }

  if (event.type === "session.history") {
    const live = sessions.getSession(event.payload.sessionId);
    hydrateSessionMessages(live);
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
    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

    // Delay so UI switches to session before seeing the prompt
    const initialPrompt = event.payload.prompt;
    setTimeout(() => {
      emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: initialPrompt } });
    }, 200);

    const modelId = resolveModelId();
    if (session.selectedModel && session.selectedModel !== modelId && session.cwd) updateConversationDefaultModel(session.cwd, modelId);
    session.selectedModel = modelId;

    runKiro({
      prompt: event.payload.prompt, session: session as unknown as Session,
      resumeSessionId: session.kiroConversationId, getModel: () => modelId,
      onEvent: emit, onSessionUpdate: (u) => sessions.updateSession(session.id, u)
    }).then((h) => runnerHandles.set(session.id, h))
      .catch((e) => {
        sessions.updateSession(session.id, { status: "error" });
        emit({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: String(e) } });
      });
    return;
  }

  if (event.type === "session.continue") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) { emit({ type: "runner.error", payload: { message: "Unknown session" } }); return; }
    if (!session.kiroConversationId) { emit({ type: "runner.error", payload: { sessionId: session.id, message: "No resume id." } }); return; }

    session.interactive = Boolean(event.payload.interactive ?? session.interactive);
    sessions.updateSession(session.id, { status: "running", lastPrompt: event.payload.prompt });
    emit({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });
    emit({ type: "stream.user_prompt", payload: { sessionId: session.id, prompt: event.payload.prompt } });

    const modelId = resolveModelId();
    if (session.selectedModel && session.selectedModel !== modelId && session.cwd) updateConversationDefaultModel(session.cwd, modelId);
    session.selectedModel = modelId;

    runKiro({
      prompt: event.payload.prompt, session: session as unknown as Session,
      resumeSessionId: session.kiroConversationId, getModel: () => modelId,
      onEvent: emit, onSessionUpdate: (u) => sessions.updateSession(session.id, u)
    }).then((h) => runnerHandles.set(session.id, h))
      .catch((e) => {
        sessions.updateSession(session.id, { status: "error" });
        emit({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: String(e) } });
      });
    return;
  }

  if (event.type === "session.stop") {
    const session = sessions.getSession(event.payload.sessionId);
    if (!session) return;
    const handle = runnerHandles.get(session.id);
    if (handle) { handle.abort(); runnerHandles.delete(session.id); }
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
