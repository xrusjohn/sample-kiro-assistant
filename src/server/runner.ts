import { spawn, type ChildProcess } from "node:child_process";
import { enhancedEnv, normalizeWorkingDirectory } from "./util.js";
import { resolveKiroCliBinary } from "../electron/libs/kiro-cli.js";
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
  return msg;
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

  const child: ChildProcess = spawn(binary, ["acp", "--trust-all-tools"], {
    cwd: normalizedCwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...enhancedEnv, NO_COLOR: "1", CLICOLOR: "0", KIRO_CLI_DISABLE_PAGER: "1" }
  });

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
    // Inject widgets based on content patterns (disable with KIRO_WIDGETS=0)
    if (process.env.KIRO_WIDGETS !== "0") {
    const timePattern = /\d{1,2}:\d{2}\s*(AM|PM|UTC|EST|CST|CDT|PST|PDT|GMT)/i;

    // Detect meeting lists: multiple lines with time patterns
    const meetingLinePattern = /(\d{1,2}:\d{2}\s*(?:AM|PM|UTC)?)\s*[–—-]\s*(?:\d{1,2}:\d{2}\s*(?:AM|PM|UTC)?\s*[–—-]\s*)?(.+)/gi;
    const meetingMatches = [...accumulatedText.matchAll(meetingLinePattern)];

    if (meetingMatches.length >= 2) {
      const meetings = meetingMatches.map(m => {
        const title = m[2].replace(/\*+/g, "").trim();
        const status = /\(accepted\)/i.test(title) ? "accepted"
          : /\(tentative\)/i.test(title) ? "tentative"
          : /\(declined\)/i.test(title) ? "declined"
          : /\(you organized\)/i.test(title) ? "organized" : "";
        const cleanTitle = title.replace(/\s*\((accepted|tentative|declined|you organized)[^)]*\)/gi, "").trim();
        return { time: m[1].trim(), title: cleanTitle, status };
      });
      const dateMatch = accumulatedText.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+\w+\s+\d{1,2}(?:st|nd|rd|th)?/i);
      const tick = "`";
      const widgetBlock = `\n\n${tick}${tick}${tick}widget:meetings\n${JSON.stringify({ meetings, date: dateMatch?.[0] ?? "" })}\n${tick}${tick}${tick}\n`;
      emitDelta(widgetBlock);
    } else if (timePattern.test(accumulatedText)) {
      const tick = "`";
      emitDelta(`\n\n${tick}${tick}${tick}widget:clock\n{}\n${tick}${tick}${tick}\n`);
    }
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
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "completed", title: session.title, cwd: session.cwd } });
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

    child.stdin.write(rpcRequest("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text: fullText }]
    }));
  };

  // --- Handle ACP messages ---
  const handleMessage = (msg: any) => {
    // Response to initialize
    if (msg.id && msg.result?.agentInfo) {
      const params: Record<string, unknown> = { cwd: normalizedCwd, mcpServers: [] };
      if (model) params.model = model;
      child.stdin?.write(rpcRequest("session/new", params));
      return;
    }

    // Response to session/new or session/load
    if (msg.id && msg.result && !acpSessionId) {
      const sid = msg.result.sessionId ?? resumeSessionId;
      if (sid) {
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
      child.stdin?.write(rpcRequest("session/new", params));
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
        const toolName = title.replace(/^Running:\s*/, "") || update.toolName ?? update.name ?? "unknown";
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
    for (const m of messages) handleMessage(m);
  });

  child.stderr?.on("data", (d) => {
    const t = d.toString().trim();
    if (t) console.warn("[kiro-acp]", t);
  });

  child.on("error", (error) => {
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: error.message } });
  });

  child.on("close", (code) => {
    if (!aborted && code !== 0) {
      onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: `kiro-cli exited with code ${code}` } });
    }
  });

  // --- Start ACP handshake ---
  child.stdin?.write(rpcRequest("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: "kiro-assistant-web", version: "0.1.0" }
  }));

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
      if (acpSessionId) child.stdin?.write(rpcRequest("session/cancel", { sessionId: acpSessionId }));
      setTimeout(() => child.kill("SIGINT"), 500);
    }
  };
}
