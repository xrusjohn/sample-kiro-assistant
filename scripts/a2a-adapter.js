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

const PORT = parseInt(process.env.PORT ?? "9000", 10);
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS ?? "900000", 10); // 15 min
const KIRO_BINARY = process.env.KIRO_BINARY ?? "kiro-cli";

// --- Task 4.1: Registry / self-registration env vars ---
const A2A_PROFILE = process.env.A2A_PROFILE || null;
const A2A_SKILLS = process.env.A2A_SKILLS ? process.env.A2A_SKILLS.split(',').map(s => s.trim()) : null;
const A2A_TAGS = process.env.A2A_TAGS ? process.env.A2A_TAGS.split(',').map(t => t.trim()) : null;
const A2A_PLATFORM = process.env.A2A_PLATFORM || 'any';
const A2A_LABEL = process.env.A2A_LABEL || null;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || null;
const AGENT_PORT = parseInt(process.env.AGENT_PORT || String(PORT), 10);

// Module-scope registry state
let registeredId = null;
let heartbeatInterval = null;

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
    this._stderrBuf = '';
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

    this._child.stderr.on("data", (data) => {
      const text = data.toString();
      this._stderrBuf += text;
      console.error(`[a2a:${this.sessionId.slice(0,8)}:stderr] ${text.trimEnd()}`);
    });

    this._child.on("close", (code) => {
      const reason = this._stderrBuf.trim() || `exit code ${code}`;
      console.error(`[a2a:${this.sessionId.slice(0,8)}] ACP process exited: ${reason}`);
      for (const [, p] of this._pending) p.reject(new Error(`ACP process exited: ${reason}`));
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

// --- Task 4.2: Dynamic AgentCard building ---

// Default card — used when no profile is configured
const DEFAULT_AGENT_CARD = {
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

// Mutable card — served at /.well-known/agent-card.json; updated by rebuildAgentCard()
let agentCard = { ...DEFAULT_AGENT_CARD };

/**
 * Fetch the profile template from the orchestrator catalog and build the card.
 * Falls back to DEFAULT_AGENT_CARD if the profile cannot be resolved.
 */
async function buildAgentCard() {
  let card = { ...DEFAULT_AGENT_CARD };

  // Try to load profile template from orchestrator catalog
  if (A2A_PROFILE && ORCHESTRATOR_URL) {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/a2a/profiles`);
      if (res.ok) {
        const profiles = await res.json();
        const profile = profiles.find(p => p.id === A2A_PROFILE);
        if (profile?.cardTemplate) {
          card = {
            ...DEFAULT_AGENT_CARD,
            ...profile.cardTemplate,
          };
        }
      }
    } catch (err) {
      console.warn('[a2a] Could not fetch profile template:', err.message);
    }
  }

  // Apply A2A_SKILLS override — replace skills array with generated entries
  if (A2A_SKILLS) {
    card.skills = A2A_SKILLS.map(skillId => ({
      id: skillId,
      name: skillId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      tags: A2A_TAGS ?? card.skills?.[0]?.tags ?? [],
    }));
  }

  // Apply A2A_TAGS override to first skill's tags (when skills not fully overridden)
  if (A2A_TAGS && !A2A_SKILLS && card.skills?.length > 0) {
    card.skills = card.skills.map(skill => ({ ...skill, tags: A2A_TAGS }));
  }

  // Apply A2A_LABEL override
  if (A2A_LABEL) {
    card.name = A2A_LABEL;
  }

  // Set platform field
  card.platform = A2A_PLATFORM;

  return card;
}

/**
 * Rebuild the in-memory agentCard from current env vars.
 * Called on startup and on agent.restart signal.
 */
async function rebuildAgentCard() {
  agentCard = await buildAgentCard();
  console.log(`[a2a] AgentCard updated: name="${agentCard.name}", platform="${agentCard.platform}"`);
}

// --- HTTP server ---

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "Healthy", time_of_last_update: Math.floor(Date.now() / 1000) }));
    return;
  }

  if (req.method === "GET" && req.url === "/.well-known/agent-card.json") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(agentCard));
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

// --- Task 4.4: Heartbeat ---

/**
 * Start sending periodic heartbeats to the orchestrator registry.
 * If the registry returns 404, the instance was evicted — re-register.
 */
function startHeartbeat(instanceId) {
  heartbeatInterval = setInterval(async () => {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/a2a/registry/${instanceId}/heartbeat`, { method: 'PUT' });
      if (!res.ok) {
        console.warn('[a2a] Heartbeat failed:', res.status);
        if (res.status === 404) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
          registeredId = null;
          selfRegister();
        }
      }
    } catch (err) {
      console.warn('[a2a] Heartbeat error:', err.message);
    }
  }, 30_000);
  return heartbeatInterval;
}

// --- Task 4.6: Event listener (polling for agent.restart) ---

/**
 * Poll the config endpoint every 30s for restart signals.
 * On receipt, rebuild the AgentCard from env vars without a full process restart.
 */
function startEventListener(instanceId) {
  setInterval(async () => {
    try {
      const res = await fetch(`${ORCHESTRATOR_URL}/api/a2a/registry/${instanceId}/config`);
      if (!res.ok) return;
      const config = await res.json();
      if (config.restart === true) {
        console.log('[a2a] Restart signal received, reloading config...');
        // Clear the restart flag so we don't loop
        await fetch(`${ORCHESTRATOR_URL}/api/a2a/registry/${instanceId}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restart: false }),
        });
        // Rebuild the in-memory AgentCard from env vars
        await rebuildAgentCard();
      }
    } catch {
      // Silently ignore — orchestrator may be temporarily unreachable
    }
  }, 30_000);
}

// --- Task 4.3: Self-registration ---

/**
 * Register this adapter instance with the orchestrator registry.
 * Stores the returned id and starts the heartbeat + event listener loops.
 * Retries automatically after 30s on failure.
 */
async function selfRegister() {
  if (!ORCHESTRATOR_URL) return;
  const url = `http://localhost:${PORT}`;
  try {
    const res = await fetch(`${ORCHESTRATOR_URL}/api/a2a/registry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        profileId: A2A_PROFILE || 'coding-assistant',
        platform: A2A_PLATFORM,
        metadata: { label: A2A_LABEL },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    registeredId = data.id;
    console.log(`[a2a] Registered with orchestrator, id=${registeredId}`);
    startHeartbeat(registeredId);
    startEventListener(registeredId);
  } catch (err) {
    console.warn('[a2a] Self-registration failed:', err.message);
    // Retry after one heartbeat interval
    setTimeout(selfRegister, 30_000);
  }
}

// --- Task 4.5: SIGTERM handler ---

process.on('SIGTERM', async () => {
  if (registeredId && ORCHESTRATOR_URL) {
    try {
      await fetch(`${ORCHESTRATOR_URL}/api/a2a/registry/${registeredId}`, { method: 'DELETE' });
      console.log(`[a2a] Deregistered instance ${registeredId}`);
    } catch {
      // Best-effort — don't block shutdown
    }
  }
  process.exit(0);
});

// --- Startup sequence ---

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`[a2a] Listening on port ${PORT}`);
  // Build the dynamic AgentCard before registering so the registry fetches the right card
  await rebuildAgentCard();
  // Self-register with the orchestrator if configured
  await selfRegister();
});
