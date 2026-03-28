#!/usr/bin/env node
// Non-interactive ACP test — runs with timeout, logs everything
const { spawn } = require("child_process");
const SESSION_ID = process.argv[2] || "";

const child = spawn("kiro-cli", ["acp", "--trust-all-tools"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NO_COLOR: "1" }
});

let rpcId = 0, buffer = "", sessionId = null;

function send(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  console.log("SEND[" + rpcId + "]", method, JSON.stringify(params).slice(0, 150));
  child.stdin.write(msg + "\n");
}

child.stdout.on("data", (d) => {
  buffer += d.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line.trim());
      if (msg.result) {
        console.log("RECV[" + msg.id + "] RESULT:", JSON.stringify(msg.result).slice(0, 300));
        if (msg.result.sessionId) sessionId = msg.result.sessionId;
      } else if (msg.error) {
        console.log("RECV[" + msg.id + "] ERROR:", JSON.stringify(msg.error).slice(0, 300));
      } else if (msg.method) {
        const u = msg.params?.update;
        if (u?.sessionUpdate === "agent_message_chunk") process.stdout.write(u.content?.text ?? "");
        else if (u?.sessionUpdate) console.log("NOTIFY:", u.sessionUpdate);
        else if (!msg.method.startsWith("_kiro")) console.log("NOTIFY:", msg.method);
      }
    } catch {}
  }
});
child.stderr.on("data", (d) => console.log("STDERR:", d.toString().trim()));
child.on("close", (c) => { console.log("\nEXIT:", c); process.exit(0); });

// Step 1: init
setTimeout(() => send("initialize", {
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  clientInfo: { name: "acp-test", version: "0.1" }
}), 500);

// Step 2: load or new
setTimeout(() => {
  if (SESSION_ID) {
    send("session/load", { sessionId: SESSION_ID });
  } else {
    send("session/new", { cwd: "/tmp", mcpServers: [] });
  }
}, 4000);

// Step 3: prompt (only if session ready)
setTimeout(() => {
  if (sessionId || SESSION_ID) {
    send("session/prompt", { sessionId: sessionId || SESSION_ID, prompt: [{ type: "text", text: "say hi in 5 words" }] });
  } else {
    console.log("NO SESSION — skipping prompt");
  }
}, 8000);

// Kill after 20s
setTimeout(() => { console.log("\nTIMEOUT"); child.kill(); process.exit(0); }, 20000);
