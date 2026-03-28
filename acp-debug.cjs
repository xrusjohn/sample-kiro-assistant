#!/usr/bin/env node
// ACP Debug Client — interactive CLI for testing kiro-cli ACP protocol
// Usage: node acp-debug.cjs [sessionId-to-load]
//
// Commands:
//   init                    — send initialize
//   new [cwd]               — send session/new
//   load <sessionId>        — send session/load
//   prompt <text>           — send session/prompt (uses current sessionId)
//   cancel                  — send session/cancel
//   raw <json>              — send raw JSON-RPC
//   sessions                — list kiro session files
//   quit                    — exit

const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");
const os = require("os");

const SESSIONS_DIR = path.join(os.homedir(), ".kiro", "sessions", "cli");
let rpcId = 0;
let sessionId = null;
let child = null;
let buffer = "";

function send(method, params = {}) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  console.log("\x1b[36m→ SEND [id=" + rpcId + "]\x1b[0m", msg.length > 200 ? msg.slice(0, 200) + "..." : msg);
  child.stdin.write(msg + "\n");
  return rpcId;
}

function handleMessage(msg) {
  const json = JSON.stringify(msg);
  const preview = json.length > 500 ? json.slice(0, 500) + "..." : json;

  if (msg.error) {
    console.log("\x1b[31m← ERROR [id=" + msg.id + "]\x1b[0m", preview);
  } else if (msg.result) {
    console.log("\x1b[32m← RESULT [id=" + msg.id + "]\x1b[0m", preview);
    // Auto-capture sessionId
    if (msg.result.sessionId && !sessionId) {
      sessionId = msg.result.sessionId;
      console.log("\x1b[33m   ⮑ sessionId captured:\x1b[0m", sessionId);
    }
  } else if (msg.method) {
    // Notification
    const update = msg.params?.update;
    if (update?.sessionUpdate === "agent_message_chunk") {
      const text = update.content?.text ?? "";
      const type = update.content?.type ?? "text";
      process.stdout.write(type === "thinking" ? "\x1b[90m" + text + "\x1b[0m" : text);
    } else if (update?.sessionUpdate === "tool_call") {
      console.log("\n\x1b[35m🛠️  tool_call:\x1b[0m", JSON.stringify(update).slice(0, 300));
    } else if (update?.sessionUpdate === "turn_end") {
      console.log("\n\x1b[33m⏹  turn_end\x1b[0m");
    } else if (msg.method.startsWith("_kiro.dev/")) {
      // Kiro extensions — show compact
      console.log("\x1b[90m← " + msg.method + "\x1b[0m");
    } else {
      console.log("\x1b[34m← NOTIFY\x1b[0m", msg.method, preview.slice(0, 200));
    }
  } else {
    console.log("\x1b[90m← ???\x1b[0m", preview);
  }
}

function parseMessages(data) {
  buffer += data;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { handleMessage(JSON.parse(trimmed)); } catch { console.log("\x1b[90m← RAW:\x1b[0m", trimmed.slice(0, 200)); }
  }
}

// --- Start kiro-cli acp ---
console.log("Starting kiro-cli acp...");
child = spawn("kiro-cli", ["acp", "--trust-all-tools"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NO_COLOR: "1" }
});

child.stdout.on("data", (d) => parseMessages(d.toString()));
child.stderr.on("data", (d) => console.error("\x1b[31m[stderr]\x1b[0m", d.toString().trim()));
child.on("close", (code) => { console.log("kiro-cli exited with code", code); process.exit(0); });

// Auto-initialize
setTimeout(() => {
  send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: "acp-debug", version: "0.1.0" }
  });
}, 500);

// If sessionId passed as arg, auto-load after init
const argSessionId = process.argv[2];
if (argSessionId) {
  setTimeout(() => {
    console.log("\x1b[33mAuto-loading session:\x1b[0m", argSessionId);
    send("session/load", { sessionId: argSessionId });
  }, 3000);
}

// --- Interactive REPL ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\x1b[36macp>\x1b[0m " });

setTimeout(() => rl.prompt(), 1000);

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) { rl.prompt(); return; }

  const [cmd, ...rest] = trimmed.split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd) {
    case "init":
      send("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
        clientInfo: { name: "acp-debug", version: "0.1.0" }
      });
      break;
    case "new":
      send("session/new", { cwd: arg || "/tmp", mcpServers: [] });
      break;
    case "load":
      if (!arg) { console.log("Usage: load <sessionId>"); break; }
      send("session/load", { sessionId: arg });
      break;
    case "prompt":
      if (!sessionId) { console.log("No sessionId — run 'new' or 'load' first"); break; }
      if (!arg) { console.log("Usage: prompt <text>"); break; }
      send("session/prompt", { sessionId, prompt: [{ type: "text", text: arg }] });
      break;
    case "cancel":
      if (sessionId) send("session/cancel", { sessionId });
      break;
    case "raw":
      try { const obj = JSON.parse(arg); child.stdin.write(JSON.stringify(obj) + "\n"); }
      catch { console.log("Invalid JSON"); }
      break;
    case "sessions":
      try {
        const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
        for (const f of files.slice(0, 10)) {
          const meta = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf8"));
          console.log(meta.session_id?.slice(0, 8), "|", meta.title?.slice(0, 50) ?? "untitled");
        }
        console.log(`(${files.length} total)`);
      } catch (e) { console.log("Error:", e.message); }
      break;
    case "sid":
      console.log("Current sessionId:", sessionId ?? "(none)");
      break;
    case "quit":
    case "exit":
      child.kill("SIGINT");
      process.exit(0);
    default:
      // Treat as prompt if we have a session
      if (sessionId) {
        send("session/prompt", { sessionId, prompt: [{ type: "text", text: trimmed }] });
      } else {
        console.log("Unknown command. Try: init, new, load, prompt, cancel, sessions, raw, quit");
      }
  }
  setTimeout(() => rl.prompt(), 100);
});

rl.on("close", () => { child.kill("SIGINT"); process.exit(0); });
