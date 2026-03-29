#!/usr/bin/env node
// ACP Assistant CLI — interactive client using kiro-cli ACP protocol
// Usage: node acp-debug.cjs [sessionId-to-resume] [--cwd /path]
//
// Auto-initializes, resumes session if provided, otherwise creates new.
// Just type to chat. Commands: /cancel, /sessions, /sid, /new, /load <id>, /raw <json>, /quit

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const os = require("os");

const SESSIONS_DIR = path.join(os.homedir(), ".kiro", "sessions", "cli");

// Parse args
let resumeSessionId = null;
let cwd = process.cwd();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--cwd" && args[i + 1]) { cwd = args[++i]; }
  else if (!args[i].startsWith("-")) { resumeSessionId = args[i]; }
}

let rpcId = 0;
let sessionId = null;
let buffer = "";
let initialized = false;
let ready = false;
let pendingPrompt = null;

// --- Spawn kiro-cli acp ---
const child = spawn("kiro-cli", ["acp", "--trust-all-tools"], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NO_COLOR: "1" }
});

function send(method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  console.log("\x1b[36m→ " + method + "\x1b[0m");
  child.stdin.write(msg + "\n");
  return rpcId;
}

function handleMessage(msg) {
  // Response to initialize → try load or create new
  if (msg.id && msg.result?.agentInfo && !initialized) {
    initialized = true;
    if (resumeSessionId) {
      console.log("\x1b[33mResuming session:\x1b[0m", resumeSessionId);
      send("session/load", { sessionId: resumeSessionId });
    } else {
      send("session/new", { cwd, mcpServers: [] });
    }
    return;
  }

  // Response to session/new or session/load — capture sessionId
  if (msg.id && msg.result && !sessionId) {
    const sid = msg.result.sessionId ?? resumeSessionId;
    if (sid) {
      sessionId = sid;
      ready = true;
      console.log("\x1b[33m✓ Session:\x1b[0m", sessionId);
      if (pendingPrompt) { doPrompt(pendingPrompt); pendingPrompt = null; }
      else { rl.prompt(); }
      return;
    }
  }

  // session/load failed → fall back to session/new
  if (msg.error && resumeSessionId && !sessionId) {
    console.warn("\x1b[31mSession load failed, creating new session\x1b[0m");
    resumeSessionId = null;
    send("session/new", { cwd, mcpServers: [] });
    return;
  }

  // Streaming updates
  if (msg.method === "session/update" && msg.params) {
    const update = msg.params.update ?? msg.params;
    const kind = update.sessionUpdate ?? update.kind ?? update.type;

    if (kind === "agent_message_chunk") {
      const text = update.content?.text ?? "";
      const type = update.content?.type ?? "text";
      process.stdout.write(type === "thinking" ? "\x1b[90m" + text + "\x1b[0m" : text);
      return;
    }
    if (kind === "tool_call") {
      const title = update.title ?? update.toolName ?? update.name ?? "unknown";
      console.log("\n\x1b[35m🛠️  " + title + "\x1b[0m");
      return;
    }
    if (kind === "tool_call_update") return;
    if (kind === "turn_end") {
      console.log("\n");
      rl.prompt();
      return;
    }
  }

  // Response to session/prompt (stopReason)
  if (msg.id && msg.result?.stopReason) {
    console.log("\n");
    rl.prompt();
    return;
  }

  // Errors
  if (msg.error) {
    console.log("\x1b[31mError:\x1b[0m", msg.error.message ?? JSON.stringify(msg.error));
    rl.prompt();
  }
}

function doPrompt(text) {
  if (!sessionId) { pendingPrompt = text; return; }
  send("session/prompt", { sessionId, prompt: [{ type: "text", text }] });
}

// --- Wire stdio ---
child.stdout.on("data", (d) => {
  buffer += d.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { handleMessage(JSON.parse(trimmed)); } catch { /* skip */ }
  }
});
child.stderr.on("data", (d) => {
  const t = d.toString().trim();
  if (t) console.error("\x1b[31m[stderr]\x1b[0m", t);
});
child.on("close", (code) => { console.log("kiro-cli exited with code", code); process.exit(0); });

// --- Kick off handshake ---
send("initialize", {
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  clientInfo: { name: "acp-cli", version: "0.1.0" }
});

// --- Interactive REPL ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\x1b[36m>\x1b[0m " });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }

  if (trimmed.startsWith("/")) {
    const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
    const arg = rest.join(" ");
    switch (cmd) {
      case "cancel": if (sessionId) send("session/cancel", { sessionId }); break;
      case "new": sessionId = null; ready = false; send("session/new", { cwd: arg || cwd, mcpServers: [] }); break;
      case "load":
        if (!arg) { console.log("Usage: /load <sessionId>"); break; }
        sessionId = null; ready = false; resumeSessionId = arg;
        send("session/load", { sessionId: arg });
        break;
      case "sessions":
        try {
          const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
          for (const f of files.slice(-10)) {
            const meta = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf8"));
            console.log(meta.session_id?.slice(0, 8), "|", meta.title?.slice(0, 50) ?? "untitled");
          }
          console.log(`(${files.length} total)`);
        } catch (e) { console.log("Error:", e.message); }
        break;
      case "sid": console.log("Session:", sessionId ?? "(none)"); break;
      case "raw":
        try { child.stdin.write(JSON.parse(arg) + "\n"); } catch { console.log("Invalid JSON"); }
        break;
      case "quit": case "exit": child.kill("SIGINT"); process.exit(0);
      default: console.log("Commands: /cancel /new /load /sessions /sid /raw /quit");
    }
    rl.prompt();
    return;
  }

  // Anything else is a prompt
  doPrompt(trimmed);
});

rl.on("close", () => { child.kill("SIGINT"); process.exit(0); });
