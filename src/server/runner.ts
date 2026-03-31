import { spawn, type ChildProcess } from "node:child_process";
import { enhancedEnv, normalizeWorkingDirectory } from "./util.js";
import { addPid, removePid } from "./pid-tracker.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";
import type { AgentDefinition } from "./agent-registry.js";

export type { Session };

export type RunnerHandle = {
  abort: () => void;
  sendPrompt: (text: string) => void;
  ready: Promise<void>;
  onClose?: (callback: (code: number | null) => void) => void;
};

type EmitFn = (event: ServerEvent) => void;

const DEFAULT_CWD = process.cwd();

// JSON-RPC helpers
let rpcId = 0;
function rpcRequest(tag: string, method: string, params: Record<string, unknown> = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) + "\n";
  console.log(`[${tag} send]`, msg.trim().slice(0, 200));
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
  agent: AgentDefinition;
  resumeSessionId?: string;
  history?: any[];
  onEvent: EmitFn;
  onSessionUpdate?: (updates: Partial<Session>) => void;
}): RunnerHandle {
  const { session, model, agent, resumeSessionId, onEvent, onSessionUpdate } = opts;
  const binary = agent.resolvedBinary;
  const normalizedCwd = normalizeWorkingDirectory(session.cwd) ?? DEFAULT_CWD;
  const tag = `acp:${agent.id}`;
  const spawnedAt = Date.now();

  if (!binary) {
    console.error(`[${tag}] binary not found for ${agent.label} (env: ${agent.binaryEnvVar}, default: ${agent.defaultBinary})`);
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: `${agent.label} binary not found — install ${agent.label} CLI and try again.` } });
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: `${agent.label} binary not found` } });
    return { abort() {}, sendPrompt() {}, ready: Promise.reject(new Error("no binary")) };
  }

  console.log(`[${tag}] spawning: ${binary} ${agent.defaultArgs.join(" ")} (session=${session.id}, cwd=${normalizedCwd})`);

  const child: ChildProcess = spawn(binary, agent.defaultArgs, {
    cwd: normalizedCwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...enhancedEnv, NO_COLOR: "1", CLICOLOR: "0", KIRO_CLI_DISABLE_PAGER: "1" }
  });

  if (child.pid) {
    addPid(child.pid, session.id);
    console.log(`[${tag}] pid=${child.pid} spawned in ${Date.now() - spawnedAt}ms`);
  } else {
    console.error(`[${tag}] spawn returned no pid — binary may have failed to start`);
  }

  // Helper to write an RPC message and emit a debug event
  const writeRpc = (method: string, params: Record<string, unknown> = {}) => {
    const { msg } = rpcRequest(tag, method, params);
    onEvent({ type: "debug.acp", payload: { sessionId: session.id, direction: "send", message: msg.trim(), timestamp: Date.now() } });
    child.stdin?.write(msg);
  };

  let aborted = false;
  let acpSessionId: string | null = null;
  let buffer = "";
  let streamingStarted = false;
  let accumulatedText = "";
  let pendingPrompt: string | null = null;
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
    // Response to initialize → always create new session
    // (session/load is advertised but hangs in current kiro-cli versions)
    if (msg.id && msg.result?.agentInfo) {
      const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
      if (model) params.model = model;
      writeRpc("session/new", params);
      return;
    }

    // Response to session/new
    if (msg.id && msg.result && !acpSessionId) {
      const sid = msg.result.sessionId;
      if (sid) {
        acpSessionId = sid;
        onSessionUpdate?.({ kiroConversationId: acpSessionId! });
        // Finish the "Connecting..." turn
        emitDelta(" Connected ✓\n");
        finishTurn();
        readyResolve();
        if (pendingPrompt) { doSendPrompt(pendingPrompt); pendingPrompt = null; }
        return;
      }
    }

    // session/new failed
    if (msg.error && !acpSessionId) {
      console.warn(`[${tag}] session/new failed:`, msg.error.message ?? msg.error);
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
        console.log(`[${tag} tool_call]`, JSON.stringify(update).slice(0, 300));
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
      console.log(`[${tag} update]`, kind, JSON.stringify(update).slice(0, 300));
    }

    // Response to session/prompt (stopReason)
    if (msg.id && msg.result?.stopReason) { finishTurn(); return; }

    // Kiro metadata (context usage, credits, turn duration)
    if (msg.method === "_kiro.dev/metadata" && msg.params) {
      const p = msg.params;
      const meta: Record<string, unknown> = { sessionId: session.id };
      if (typeof p.contextUsagePercentage === "number") meta.contextUsagePercent = Math.round(p.contextUsagePercentage);
      if (Array.isArray(p.meteringUsage)) {
        const credit = p.meteringUsage.find((m: any) => m.unit === "credit");
        if (credit) meta.creditsUsed = Math.round(credit.value * 1000) / 1000;
      }
      if (typeof p.turnDurationMs === "number") meta.turnDurationMs = p.turnDurationMs;
      onEvent({ type: "session.metadata", payload: meta } as any);
      return;
    }

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
      console.warn(`[${tag} stderr]`, t);
      onEvent({ type: "debug.acp", payload: { sessionId: session.id, direction: "recv", message: `[stderr] ${t}`, timestamp: Date.now() } });
    }
  });

  child.on("error", (error) => {
    console.error(`[${tag}] spawn error: ${error.message} (session=${session.id}, binary=${binary})`);
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: error.message } });
  });

  const closeCallbacks: Array<(code: number | null) => void> = [];

  child.on("close", (code, signal) => {
    const uptime = Date.now() - spawnedAt;
    if (child.pid) removePid(child.pid);
    if (aborted) {
      console.log(`[${tag}] pid=${child.pid} aborted after ${uptime}ms`);
    } else if (code !== 0) {
      console.error(`[${tag}] pid=${child.pid} exited code=${code} signal=${signal ?? "none"} after ${uptime}ms`);
      onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: `${agent.label} exited with code ${code}` } });
    } else {
      console.log(`[${tag}] pid=${child.pid} exited cleanly after ${uptime}ms`);
    }
    for (const cb of closeCallbacks) cb(code);
  });

  // --- Start ACP handshake ---
  emitDelta("⏳ Connecting to agent...\n");
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
    },
    onClose(callback: (code: number | null) => void) {
      closeCallbacks.push(callback);
    }
  };
}
