#!/usr/bin/env node
/**
 * relay — thin CLI client for a remote Relay/kiro-assistant server.
 * Usage: npx tsx src/cli-client/relay.ts --server http://your-server:3001
 */

import WebSocket from "ws";
import readline from "readline";

const SERVER_URL =
  process.argv.find((a) => a.startsWith("--server="))?.split("=")[1] ??
  process.argv[process.argv.indexOf("--server") + 1] ??
  "http://localhost:3001";

const WS_URL = SERVER_URL.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

let sessionId: string | null = null;
let ws: WebSocket;
let reconnectAttempt = 0;
const MAX_RECONNECT = 5;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function promptUser() {
  rl.question(cyan("you → "), async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return promptUser();
    if (trimmed === "/quit" || trimmed === "/exit") { ws?.close(); process.exit(0); }

    if (!sessionId) {
      // Start a new session
      ws.send(JSON.stringify({
        type: "session.start",
        payload: { title: `remote-${Date.now()}`, prompt: trimmed }
      }));
    } else {
      ws.send(JSON.stringify({
        type: "session.continue",
        payload: { sessionId, prompt: trimmed }
      }));
    }
  });
}

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
        // Full assistant message (turn complete)
        for (const block of msg.message.content) {
          if (block.type === "text") process.stdout.write(block.text);
          else if (block.type === "tool_use") console.log(yellow(`\n⚡ Tool: ${block.name}`));
        }
      } else if (msg.type === "tool_use") {
        console.log(yellow(`\n⚡ Tool: ${msg.tool ?? msg.name ?? "unknown"}`));
      } else if (msg.type === "tool_result") {
        const r = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "").slice(0, 200);
        if (r) console.log(dim(`   → ${r}`));
      }
      break;
    }

    case "stream.user_prompt":
      // Our own prompt echoed back — ignore
      break;

    case "session.status": {
      const { sessionId: sid, status } = event.payload;
      if (!sessionId && sid) sessionId = sid;
      if (status === "idle") {
        process.stdout.write("\n");
        promptUser();
      } else if (status === "error") {
        console.log(red(`\nSession error: ${event.payload.error ?? "unknown"}`));
        promptUser();
      }
      break;
    }

    case "session.list":
      break; // ignore

    case "runner.error":
      console.error(red(`\nRunner error: ${event.payload.message}`));
      promptUser();
      break;

    case "permission.request":
      // Auto-approve in remote mode
      ws.send(JSON.stringify({
        type: "permission.response",
        payload: { sessionId: event.payload.sessionId, toolUseId: event.payload.toolUseId, result: { behavior: "allow" } }
      }));
      break;

    default:
      // Uncomment for debug: console.log(dim(JSON.stringify(event)));
      break;
  }
}

function connect() {
  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    reconnectAttempt = 0;
    console.log(green("✓ Connected to ") + cyan(SERVER_URL));
    console.log(dim("Type your prompt and press Enter. /quit to exit.\n"));
    promptUser();
  });

  ws.on("message", (raw) => {
    try { handleEvent(JSON.parse(raw.toString())); } catch { /* skip non-JSON */ }
  });

  ws.on("close", () => {
    if (reconnectAttempt >= MAX_RECONNECT) {
      console.log(red("Max reconnect attempts reached. Exiting."));
      process.exit(1);
    }
    const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
    reconnectAttempt++;
    console.log(dim(`Disconnected. Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempt}/${MAX_RECONNECT})`));
    setTimeout(connect, delay);
  });

  ws.on("error", (err) => {
    console.error(red(`WebSocket error: ${err.message}`));
  });
}

console.log(dim(`relay — connecting to ${SERVER_URL}...`));
connect();
