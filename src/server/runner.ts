import { spawn, type ChildProcess } from "node:child_process";
import { enhancedEnv, normalizeWorkingDirectory } from "./util.js";
import { resolveKiroCliBinary } from "../electron/libs/kiro-cli.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";

export type { Session };

export type RunnerOptions = {
  prompt: string;
  session: Session;
  resumeSessionId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  getModel: () => string;
};

export type RunnerHandle = { abort: () => void };

const DEFAULT_CWD = process.cwd();

const emitRunnerError = (message: string, options: RunnerOptions) => {
  options.onEvent({ type: "runner.error", payload: { sessionId: options.session.id, message } });
  options.onEvent({
    type: "session.status",
    payload: { sessionId: options.session.id, status: "error", title: options.session.title, cwd: options.session.cwd, error: message }
  });
};

// JSON-RPC helpers
let rpcId = 0;
function rpcRequest(method: string, params: Record<string, unknown> = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) + "\n";
  console.log("[kiro-acp send]", msg.trim());
  return msg;
}

// Parse newline-delimited JSON-RPC messages from a buffer
function parseMessages(buffer: string): { messages: any[]; remainder: string } {
  const messages: any[] = [];
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? ""; // last incomplete line
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { messages.push(JSON.parse(trimmed)); } catch { /* skip non-JSON */ }
  }
  return { messages, remainder };
}

export async function runKiro(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, onEvent, onSessionUpdate } = options;
  const binary = resolveKiroCliBinary();
  if (!binary) {
    emitRunnerError("Could not find kiro-cli on PATH.", options);
    return { abort: () => undefined };
  }

  const normalizedCwd = normalizeWorkingDirectory(session.cwd) ?? DEFAULT_CWD;
  const model = options.getModel().trim();
  const args = ["acp", "--trust-all-tools"];

  const child: ChildProcess = spawn(binary, args, {
    cwd: normalizedCwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...enhancedEnv, NO_COLOR: "1", CLICOLOR: "0", KIRO_CLI_DISABLE_PAGER: "1" }
  });

  let aborted = false;
  let acpSessionId: string | null = null;
  let buffer = "";
  let streamingStarted = false;
  let initialized = false;
  let accumulatedText = "";

  // Emit model meta message
  onEvent({
    type: "stream.message",
    payload: {
      sessionId: session.id,
      message: {
        type: "system",
        message: { id: crypto.randomUUID(), role: "system", content: [{ type: "text", text: `**Model:** ${model || "unknown"}` }] },
        subtype: "meta", model, session_id: session.id, uuid: crypto.randomUUID(),
        session_id_display: session.id, permissionMode: session.interactive ? "interactive" : "non-interactive", cwd: normalizedCwd
      } as any
    }
  });

  const emitDelta = (text: string) => {
    if (!text) return;
    accumulatedText += text;
    if (!streamingStarted) {
      streamingStarted = true;
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_start" } } as any } });
    }
    onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } } as any } });
  };

  const endStream = (status: "completed" | "error", error?: string) => {
    if (streamingStarted) {
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_stop" } } as any } });
      streamingStarted = false;
    }
    // Emit the accumulated text as a permanent assistant message
    if (accumulatedText) {
      onEvent({
        type: "stream.message",
        payload: {
          sessionId: session.id,
          message: {
            type: "assistant",
            message: {
              id: crypto.randomUUID(),
              role: "assistant",
              content: [{ type: "text", text: accumulatedText }]
            },
            model, session_id: session.id, uuid: crypto.randomUUID()
          } as any
        }
      });
      accumulatedText = "";
    }
    onEvent({
      type: "session.status",
      payload: { sessionId: session.id, status, title: session.title, cwd: session.cwd, error }
    });
  };

  const handleMessage = (msg: any) => {
    // Response to initialize
    if (msg.id && msg.result?.agentInfo && !initialized) {
      initialized = true;
      // Create session
      const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
      if (model) params.model = model;
      child.stdin?.write(rpcRequest("session/new", params));
      return;
    }

    // Response to session/new — contains sessionId
    if (msg.id && msg.result?.sessionId && !acpSessionId) {
      acpSessionId = msg.result.sessionId;
      onSessionUpdate?.({ kiroConversationId: acpSessionId! });
      // Now send the prompt
      child.stdin?.write(rpcRequest("session/prompt", {
        sessionId: acpSessionId,
        prompt: [{ type: "text", text: prompt }]
      }));
      return;
    }

    // Notifications (streaming)
    if (msg.method === "session/update" && msg.params) {
      const update = msg.params.update ?? msg.params;
      const kind = update.sessionUpdate ?? update.kind ?? update.type;

      if (kind === "agent_message_chunk") {
        const contentType = update.content?.type ?? "text";
        const text = update.content?.text ?? "";
        if (!text) return;
        if (contentType === "thinking") {
          emitDelta(`*${text}*`);
        } else {
          emitDelta(text);
        }
        return;
      }

      if (kind === "tool_call") {
        const name = update.toolName ?? update.name ?? "unknown";
        emitDelta(`\n\n🛠️ Using tool: **${name}**\n`);
        return;
      }

      if (kind === "turn_end") {
        endStream("completed");
        return;
      }
    }

    // Response to session/prompt (stopReason: "end_turn")
    if (msg.id && msg.result?.stopReason) {
      endStream("completed");
      return;
    }

    // Error response
    if (msg.error) {
      emitDelta(`\n\nError: ${msg.error.message ?? JSON.stringify(msg.error)}`);
      endStream("error", msg.error.message);
    }
  };

  child.stdout?.on("data", (data) => {
    const raw = data.toString();
    console.log("[kiro-acp stdout]", JSON.stringify(raw).slice(0, 200));
    buffer += raw;
    const { messages, remainder } = parseMessages(buffer);
    buffer = remainder;
    for (const msg of messages) handleMessage(msg);
  });

  child.stderr?.on("data", (d) => {
    const t = d.toString().trim();
    if (t) console.warn("[kiro-acp]", t);
  });

  child.on("error", (error) => {
    emitRunnerError(error.message || "Failed to launch kiro-cli.", options);
  });

  child.on("close", (code) => {
    if (!aborted) {
      if (streamingStarted) endStream(code === 0 ? "completed" : "error", code !== 0 ? `kiro-cli exited with code ${code}` : undefined);
      else if (code !== 0) endStream("error", `kiro-cli exited with code ${code}`);
    }
  });

  // Start the ACP handshake
  child.stdin?.write(rpcRequest("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: "kiro-assistant-web", version: "0.1.0" }
  }));

  return {
    abort: () => {
      if (aborted) return;
      aborted = true;
      if (acpSessionId) {
        child.stdin?.write(rpcRequest("session/cancel", { sessionId: acpSessionId }));
      }
      setTimeout(() => child.kill("SIGINT"), 500);
    }
  };
}
