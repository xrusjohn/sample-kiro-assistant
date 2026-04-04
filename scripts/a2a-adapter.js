#!/usr/bin/env node
/**
 * a2a-adapter.js — A2A → ACP adapter for AgentCore Runtime
 *
 * Implements the AgentCore A2A protocol contract:
 *   POST /          message/send → kiro-cli ACP session/prompt
 *   GET  /.well-known/agent-card.json
 *   GET  /ping
 *
 * Session state: keyed on X-Amzn-Bedrock-AgentCore-Runtime-Session-Id header.
 * Each session gets its own kiro-cli ACP process (via acp-bridge.js).
 * Sessions are cleaned up after IDLE_TIMEOUT_MS of inactivity.
 *
 * Port: 9000 (AgentCore A2A requirement)
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const PORT = 9000;
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS ?? "900000", 10); // 15 min
const KIRO_BINARY = process.env.KIRO_BINARY ?? "kiro-cli";

// --- ACP session state ---
const sessions = new Map(); // sessionId → AcpSession

class AcpSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.acpSessionId = null;
    this.ready = false;
    this.queue = []; // pending { text, resolve, reject }
    this.lastUsed = Date.now();
    this._buf = "";
    this._rpcId = 0;
    this._pending = new Map(); // rpcId → { resolve, reject }
    this._notifHandlers = [];
    this._startBridge();
  }

  _startBridge() {
    this._child = spawn(
      KIRO_BINARY,
      ["acp", "--agent", "kiro-assistant", "--trust-all-tools"],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    this._child.stdout.on("data", (data) => {
      this._buf += data.toString();
      const lines = this._buf.split("\n");
      this._buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim().startsWith("{")) continue;
        try { this._handleMessage(JSON.parse(line)); } catch {}
      }
    });

    this._child.on("close", () => {
      for (const [, p] of this._pending) p.reject(new Error("ACP process exited"));
      this._pending.clear();
      sessions.delete(this.sessionId);
    });

    // Handshake
    this._request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
      clientInfo: { name: "a2a-adapter", version: "0.1.0" },
    }).then(() => this._request("session/new", { cwd: "/tmp", mcpServers: [] }))
      .then((res) => {
        this.acpSessionId = res.sessionId;
        this.ready = true;
        // Drain queue
        for (const item of this.queue) this._sendPrompt(item);
        this.queue = [];
      })
      .catch((err) => {
        for (const item of this.queue) item.reject(err);
        this.queue = [];
      });
  }

  _handleMessage(msg) {
    // Response to our request: has id + result/error, no method
    if (typeof msg.id === "number" && !msg.method && (msg.result !== undefined || msg.error)) {
      const p = this._pending.get(msg.id);
      if (p) {
        this._pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
      return;
    }
    // Incoming request from agent (has method + id) — respond with {}
    if (msg.method && typeof msg.id === "number") {
      this._child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }) + "\n");
      for (const h of this._notifHandlers) h(msg.method, msg.params);
      return;
    }
    // Notification (has method, no id)
    if (msg.method) {
      for (const h of this._notifHandlers) h(msg.method, msg.params);
    }
  }

  _request(method, params) {
    const id = ++this._rpcId;
    const json = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._child.stdin.write(json + "\n");
      setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`ACP request "${method}" timed out`));
        }
      }, 90_000);
    });
  }

  _sendPrompt({ text, resolve, reject, onChunk }) {
    const chunks = [];

    const handler = (method, params) => {
      if (method !== "session/update") return;
      const update = params?.update ?? params;
      const kind = update?.sessionUpdate ?? update?.kind;
      if (kind === "agent_message_chunk" && update.content?.text) {
        const t = update.content.text;
        if (onChunk) onChunk(t);
        else chunks.push(t);
      }
    };
    this._notifHandlers.push(handler);

    this._request("session/prompt", {
      sessionId: this.acpSessionId,
      prompt: [{ type: "text", text }],
    }).then(() => {
      setTimeout(() => {
        this._notifHandlers = this._notifHandlers.filter(h => h !== handler);
        resolve(chunks.join(""));
      }, 100);
    }).catch((err) => {
      this._notifHandlers = this._notifHandlers.filter(h => h !== handler);
      reject(err);
    });
  }

  send(text) {
    this.lastUsed = Date.now();
    return new Promise((resolve, reject) => {
      if (this.ready) {
        this._sendPrompt({ text, resolve, reject, onChunk: null });
      } else {
        this.queue.push({ text, resolve, reject, onChunk: null });
      }
    });
  }

  sendStreaming(text, onChunk) {
    this.lastUsed = Date.now();
    return new Promise((resolve, reject) => {
      if (this.ready) {
        this._sendPrompt({ text, resolve, reject, onChunk });
      } else {
        this.queue.push({ text, resolve, reject, onChunk });
      }
    });
  }

  destroy() {
    this._child?.kill("SIGTERM");
    sessions.delete(this.sessionId);
  }
}

// Idle session cleanup
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > IDLE_TIMEOUT_MS) {
      console.log(`[a2a] Cleaning up idle session ${id}`);
      session.destroy();
    }
  }
}, 60_000);

// --- HTTP server ---
const AGENT_CARD = {
  name: "Kiro Assistant",
  description: "Kiro CLI agent — coding assistant with file system and terminal access",
  version: "1.0.0",
  protocolVersion: "0.3.0",
  preferredTransport: "JSONRPC",
  capabilities: { streaming: true },
  defaultInputModes: ["text"],
  defaultOutputModes: ["text"],
  skills: [{
    id: "coding-assistant",
    name: "Coding Assistant",
    description: "Write, edit, and explain code. Read and modify files. Run terminal commands.",
    tags: ["coding", "files", "terminal"],
  }],
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "Healthy", time_of_last_update: Math.floor(Date.now() / 1000) }));
    return;
  }

  if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(AGENT_CARD));
    return;
  }

  if (req.method === "POST" && req.url === "/") {
    const chunks = [];
    req.on("data", d => chunks.push(d));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf8");
      let rpcReq;
      try { rpcReq = JSON.parse(body); } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
        return;
      }

      const isStream = rpcReq.method === "message/stream";
      if (rpcReq.method !== "message/send" && !isStream) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, error: { code: -32601, message: "Method not found" } }));
        return;
      }

      const sessionId = req.headers["x-amzn-bedrock-agentcore-runtime-session-id"] ?? randomUUID();
      const text = rpcReq.params?.message?.parts?.find(p => p.kind === "text")?.text ?? "";

      if (!text) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, error: { code: -32052, message: "No text content in message" } }));
        return;
      }

      if (!sessions.has(sessionId)) {
        console.log(`[a2a] New session: ${sessionId}`);
        sessions.set(sessionId, new AcpSession(sessionId));
      }

      const session = sessions.get(sessionId);

      if (isStream) {
        // SSE streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        const sendEvent = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

        try {
          await session.sendStreaming(text, (chunk) => {
            sendEvent("update", { type: "agent_message_chunk", content: { type: "text", text: chunk } });
          });
          sendEvent("update", { type: "turn_end" });
          sendEvent("done", { stopReason: "end_turn" });
        } catch (err) {
          sendEvent("error", { message: err.message });
        }
        res.end();
      } else {
        // Buffered response
        try {
          const responseText = await session.send(text);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0", id: rpcReq.id,
            result: { artifacts: [{ artifactId: randomUUID(), name: "agent_response", parts: [{ kind: "text", text: responseText }] }] },
          }));
        } catch (err) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpcReq.id, error: { code: -32055, message: err.message } }));
        }
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[a2a] Listening on port ${PORT}`);
});
