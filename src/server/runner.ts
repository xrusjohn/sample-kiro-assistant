import { spawn, type ChildProcess } from "node:child_process";
import { enhancedEnv, normalizeWorkingDirectory } from "./util.js";
import { resolveKiroCliBinary } from "../electron/libs/kiro-cli.js";
import { addPid, removePid } from "./pid-tracker.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";

export type { Session };

export type RunnerHandle = {
  abort: () => void;
  sendPrompt: (text: string) => void;
  ready: Promise<void>;
};

type EmitFn = (event: ServerEvent) => void;

const DEFAULT_CWD = process.cwd();

// JSON-RPC helpers
let rpcId = 0;
function rpcRequest(method: string, params: Record<string, unknown> = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) + "\n";
  console.log("[kiro-acp send]", msg.trim().slice(0, 200));
  return { msg, id: rpcId };
}

function parseMessages(buffer: string): { messages: any[]; remainder: string } {
  const messages: any[] = [];
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { messages.push(JSON.parse(trimmed)); } catch { /* skip */ }
  }
  return { messages, remainder };
}

export function createAcpRunner(opts: {
  session: Session;
  model: string;
  resumeSessionId?: string;
  history?: any[];
  onEvent: EmitFn;
  onSessionUpdate?: (updates: Partial<Session>) => void;
}): RunnerHandle {
  const { session, model, resumeSessionId, onEvent, onSessionUpdate } = opts;
  const binary = resolveKiroCliBinary();
  const normalizedCwd = normalizeWorkingDirectory(session.cwd) ?? DEFAULT_CWD;

  if (!binary) {
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: "Could not find kiro-cli on PATH." } });
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: "kiro-cli not found" } });
    return { abort() {}, sendPrompt() {}, ready: Promise.reject(new Error("no binary")) };
  }

  const agent = (process.env.KIRO_AGENT ?? "kiro-assistant").trim();
  const child: ChildProcess = spawn(binary, ["acp", "--agent", agent, "--trust-all-tools"], {
    cwd: normalizedCwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...enhancedEnv, NO_COLOR: "1", CLICOLOR: "0", KIRO_CLI_DISABLE_PAGER: "1" }
  });

  if (child.pid) addPid(child.pid, session.id);

  // Helper to write an RPC message and emit a debug event
  const writeRpc = (method: string, params: Record<string, unknown> = {}) => {
    const { msg } = rpcRequest(method, params);
    onEvent({ type: "debug.acp", payload: { sessionId: session.id, direction: "send", message: msg.trim(), timestamp: Date.now() } });
    child.stdin?.write(msg);
  };

  let aborted = false;
  let acpSessionId: string | null = null;
  let buffer = "";
  let streamingStarted = false;
  let accumulatedText = "";
  let pendingPrompt: string | null = null;
  let loadTimeout: ReturnType<typeof setTimeout> | null = null;
  let firstPrompt = true;
  let readyResolve: () => void;
  const toolsUsedThisTurn = new Set<string>();
  const ready = new Promise<void>((resolve) => { readyResolve = resolve; });

  // --- Streaming helpers ---
  const emitDelta = (text: string) => {
    if (!text) return;
    accumulatedText += text;
    if (!streamingStarted) {
      streamingStarted = true;
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_start" } } as any } });
    }
    onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } } as any } });
  };

  const finishTurn = () => {
    // If a calendar HTML file was mentioned this turn, inject as widget via file path
    const calendarMatch = accumulatedText.match(/(\/[\w\/-]+calendar[\w-]*\.html)/i);
    if (calendarMatch) {
      // Remove any agent-emitted widget:html block that has the file path
      accumulatedText = accumulatedText.replace(/```widget:html\s*\n[^\n]*calendar[^\n]*\.html\s*\n```/gi, "");
      const tick = "`";
      emitDelta(`\n\n${tick}${tick}${tick}widget:html\n${calendarMatch[1]}\n${tick}${tick}${tick}\n`);
    }
    toolsUsedThisTurn.clear();

    if (streamingStarted) {
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_stop" } } as any } });
      streamingStarted = false;
    }
    if (accumulatedText) {
      onEvent({
        type: "stream.message",
        payload: {
          sessionId: session.id,
          message: {
            type: "assistant",
            message: { id: crypto.randomUUID(), role: "assistant", content: [{ type: "text", text: accumulatedText }] },
            model, session_id: session.id, uuid: crypto.randomUUID()
          } as any
        }
      });
      accumulatedText = "";
    }
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd } });
  };

  // --- Send a prompt on the existing ACP session ---
  const doSendPrompt = (text: string) => {
    if (!acpSessionId || !child.stdin?.writable) return;
    accumulatedText = "";
    streamingStarted = false;
    toolsUsedThisTurn.clear();
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

    // On first prompt of a resumed session, inject conversation history
    let fullText = text;
    if (firstPrompt && opts.history?.length) {
      const summary = opts.history.map(m => {
        if (m.type === "user_prompt") return `User: ${m.prompt}`;
        if (m.type === "assistant") {
          const content = m.message?.content;
          if (Array.isArray(content)) {
            const text = content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
            if (text) return `Assistant: ${text.slice(0, 500)}`;
          }
        }
        return null;
      }).filter(Boolean).join("\n\n");
      if (summary) {
        fullText = `[Previous conversation for context:\n${summary}\n]\n\n${text}`;
      }
    }
    firstPrompt = false;

    writeRpc("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text: fullText }]
    });
  };

  // --- Handle ACP messages ---
  const handleMessage = (msg: any) => {
    // Response to initialize
    if (msg.id && msg.result?.agentInfo) {
      if (resumeSessionId) {
        writeRpc("session/load", { sessionId: resumeSessionId, mcpServers: [] });
        // session/load can hang in some kiro-cli versions — fall back after 10s
        loadTimeout = setTimeout(() => {
          if (!acpSessionId) {
            console.warn("[kiro-acp] session/load timed out after 10s, falling back to session/new");
            const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
            if (model) params.model = model;
            writeRpc("session/new", params);
          }
        }, 10_000);
      } else {
        const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
        if (model) params.model = model;
        writeRpc("session/new", params);
      }
      return;
    }

    // Response to session/new or session/load
    if (msg.id && msg.result && !acpSessionId) {
      const sid = msg.result.sessionId ?? resumeSessionId;
      if (sid) {
        if (loadTimeout) { clearTimeout(loadTimeout); loadTimeout = null; }
        acpSessionId = sid;
        onSessionUpdate?.({ kiroConversationId: acpSessionId! });
        readyResolve();
        if (pendingPrompt) { doSendPrompt(pendingPrompt); pendingPrompt = null; }
        return;
      }
    }

    // session/load failed — fall back to session/new
    if (msg.error && resumeSessionId && !acpSessionId) {
      console.warn("[kiro-acp] session/load failed, falling back:", msg.error.message ?? msg.error);
      const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
      if (model) params.model = model;
      writeRpc("session/new", params);
      return;
    }

    // Streaming updates
    if (msg.method === "session/update" && msg.params) {
      const update = msg.params.update ?? msg.params;
      const kind = update.sessionUpdate ?? update.kind ?? update.type;

      if (kind === "agent_message_chunk") {
        const contentType = update.content?.type ?? "text";
        const text = update.content?.text ?? "";
        if (!text) return;
        emitDelta(contentType === "thinking" ? `*${text}*` : text);
        return;
      }

      if (kind === "tool_call") {
        console.log("[kiro-acp tool_call]", JSON.stringify(update).slice(0, 300));
        const title = update.title ?? "";
        const toolName = title.replace(/^Running:\s*/, "") || (update.toolName ?? update.name ?? "unknown");
        toolsUsedThisTurn.add(toolName.toLowerCase());
        emitDelta(`\n\n🛠️ ${title || ("Using tool: **" + toolName + "**")}\n`);
        return;
      }

      if (kind === "tool_call_update") {
        // Progress updates — skip for now
        return;
      }

      if (kind === "turn_end") { finishTurn(); return; }

      // Log any unhandled update types
      console.log("[kiro-acp update]", kind, JSON.stringify(update).slice(0, 300));
    }

    // Response to session/prompt (stopReason)
    if (msg.id && msg.result?.stopReason) { finishTurn(); return; }

    // Error
    if (msg.error) {
      emitDelta(`\n\nError: ${msg.error.message ?? JSON.stringify(msg.error)}`);
      onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: msg.error.message } });
    }
  };

  // --- Wire up stdio ---
  child.stdout?.on("data", (data) => {
    buffer += data.toString();
    const { messages, remainder } = parseMessages(buffer);
    buffer = remainder;
    for (const m of messages) {
      onEvent({ type: "debug.acp", payload: { sessionId: session.id, direction: "recv", message: JSON.stringify(m).slice(0, 2000), timestamp: Date.now() } });
      handleMessage(m);
    }
  });

  child.stderr?.on("data", (d) => {
    const t = d.toString().trim();
    if (t) {
      console.warn("[kiro-acp]", t);
      onEvent({ type: "debug.acp", payload: { sessionId: session.id, direction: "recv", message: `[stderr] ${t}`, timestamp: Date.now() } });
    }
  });

  child.on("error", (error) => {
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: error.message } });
  });

  child.on("close", (code) => {
    if (child.pid) removePid(child.pid);
    if (!aborted && code !== 0) {
      onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: `kiro-cli exited with code ${code}` } });
    }
  });

  // --- Start ACP handshake ---
  writeRpc("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: "kiro-assistant-web", version: "0.1.0" }
  });

  return {
    ready,
    sendPrompt(text: string) {
      if (acpSessionId) {
        doSendPrompt(text);
      } else {
        // ACP not ready yet — queue it
        pendingPrompt = text;
      }
    },
    abort() {
      if (aborted) return;
      aborted = true;
      if (acpSessionId) writeRpc("session/cancel", { sessionId: acpSessionId });
      setTimeout(() => child.kill("SIGINT"), 500);
    }
  };
}
