#!/usr/bin/env node
/**
 * kiro-remote — thin CLI client for a remote Kiro orchestrator on ECS.
 *
 * Usage:
 *   npx tsx src/cli-client/kiro-remote.ts --server https://your-orchestrator.example.com
 *   node dist/kiro-remote.js --server https://your-orchestrator.example.com
 */

import WebSocket from "ws";
import readline from "readline";
import http from "node:http";
import https from "node:https";

// --- Config ---
interface CliConfig {
  serverUrl: string;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

function parseArgs(): CliConfig {
  const args = process.argv.slice(2);
  let serverUrl = "http://localhost:3001";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--server" && args[i + 1]) {
      serverUrl = args[i + 1];
      i++;
    } else if (args[i]?.startsWith("--server=")) {
      serverUrl = args[i].split("=")[1];
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log(`
kiro-remote — thin CLI client for a remote Kiro orchestrator

Usage:
  kiro-remote --server <url>

Options:
  --server <url>   Orchestrator URL (default: http://localhost:3001)
  --help, -h       Show this help

Commands (in REPL):
  /quit, /exit     Disconnect and exit
  /status          Show connection status
  /new             Start a new session
`);
      process.exit(0);
    }
  }

  return { serverUrl, reconnectBaseMs: 1000, reconnectMaxMs: 30000 };
}

// --- ANSI helpers ---
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// --- State ---
const config = parseArgs();
let sessionId: string | null = null;
let ws: WebSocket | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;
let isWaiting = false; // true while agent is processing

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdout.isTTY ?? true,
});

// --- REST helper ---
function restPost(path: string, body: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.serverUrl);
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// --- Prompt ---
function promptUser() {
  if (isWaiting) return;
  rl.question(cyan("\nyou → "), (input) => {
    const trimmed = input.trim();
    if (!trimmed) return promptUser();

    // Commands
    if (trimmed === "/quit" || trimmed === "/exit") {
      intentionalClose = true;
      ws?.close();
      rl.close();
      process.exit(0);
    }
    if (trimmed === "/status") {
      console.log(dim(`Server: ${config.serverUrl}`));
      console.log(dim(`Session: ${sessionId ?? "none"}`));
      console.log(dim(`WebSocket: ${ws?.readyState === WebSocket.OPEN ? "connected" : "disconnected"}`));
      return promptUser();
    }
    if (trimmed === "/new") {
      sessionId = null;
      console.log(dim("Starting new session on next prompt."));
      return promptUser();
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log(red("Not connected. Waiting for reconnect..."));
      return promptUser();
    }

    isWaiting = true;

    if (!sessionId) {
      ws.send(JSON.stringify({
        type: "session.start",
        payload: { title: `remote-${Date.now()}`, prompt: trimmed },
      }));
    } else {
      ws.send(JSON.stringify({
        type: "session.continue",
        payload: { sessionId, prompt: trimmed },
      }));
    }
  });
}

// --- Event handler ---
function handleEvent(event: any) {
  switch (event.type) {
    case "agents.list":
      console.log(dim(`Agents: ${event.payload.agents.map((a: any) => `${a.id}${a.available ? "" : " (unavailable)"}`).join(", ")}`));
      break;

    case "stream.message": {
      const msg = event.payload.message;
      if (msg.type === "stream_event") {
        const ev = msg.event;
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          process.stdout.write(ev.delta.text);
        }
      } else if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") process.stdout.write(block.text);
          else if (block.type === "tool_use") console.log(yellow(`\n⚡ Tool: ${block.name}`));
        }
      }
      break;
    }

    case "stream.user_prompt":
      break; // our own prompt echoed back

    case "session.status": {
      const { sessionId: sid, status } = event.payload;
      if (!sessionId && sid) sessionId = sid;
      if (status === "idle") {
        isWaiting = false;
        process.stdout.write("\n");
        promptUser();
      } else if (status === "error") {
        isWaiting = false;
        console.log(red(`\nError: ${event.payload.error ?? "unknown"}`));
        promptUser();
      }
      break;
    }

    case "runner.error":
      isWaiting = false;
      console.error(red(`\nRunner error: ${event.payload.message}`));
      promptUser();
      break;

    case "permission.request":
      // Auto-approve in remote mode
      ws?.send(JSON.stringify({
        type: "permission.response",
        payload: { sessionId: event.payload.sessionId, toolUseId: event.payload.toolUseId, result: { behavior: "allow" } },
      }));
      break;

    case "session.metadata": {
      const m = event.payload;
      const parts: string[] = [];
      if (m.contextUsagePercent != null) parts.push(`ctx: ${m.contextUsagePercent}%`);
      if (m.creditsUsed != null) parts.push(`credits: ${m.creditsUsed}`);
      if (m.turnDurationMs != null) parts.push(`${Math.round(m.turnDurationMs / 1000)}s`);
      if (parts.length) console.log(dim(`  [${parts.join(" | ")}]`));
      break;
    }

    default:
      break;
  }
}

// --- WebSocket connection with reconnect ---
function connect() {
  const wsUrl = config.serverUrl.replace(/^http/, "ws") + "/ws";
  ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    reconnectAttempt = 0;
    console.log(green("✓ Connected to ") + bold(config.serverUrl));
    if (sessionId) {
      console.log(dim(`Resuming session: ${sessionId}`));
    } else {
      console.log(dim("Type your prompt and press Enter. /quit to exit, /status for info.\n"));
    }
    promptUser();
  });

  ws.on("message", (raw) => {
    try { handleEvent(JSON.parse(raw.toString())); } catch { /* skip non-JSON */ }
  });

  ws.on("close", () => {
    if (intentionalClose) return;
    const delay = Math.min(config.reconnectBaseMs * 2 ** reconnectAttempt, config.reconnectMaxMs);
    reconnectAttempt++;
    console.log(dim(`\nDisconnected. Reconnecting in ${(delay / 1000).toFixed(1)}s...`));
    setTimeout(connect, delay);
  });

  ws.on("error", (err) => {
    if (reconnectAttempt === 0) {
      console.error(red(`Connection error: ${err.message}`));
    }
  });
}

// --- Ctrl+C handling ---
process.on("SIGINT", () => {
  if (isWaiting && ws?.readyState === WebSocket.OPEN && sessionId) {
    // Cancel the current turn
    ws.send(JSON.stringify({ type: "session.stop", payload: { sessionId } }));
    isWaiting = false;
    console.log(dim("\n[cancelled]"));
    promptUser();
  } else {
    intentionalClose = true;
    ws?.close();
    rl.close();
    process.exit(0);
  }
});

// --- Start ---
console.log(dim(`kiro-remote — connecting to ${config.serverUrl}...`));
connect();
