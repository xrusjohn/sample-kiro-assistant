#!/usr/bin/env node
// Test session/load with longer waits
const { spawn } = require("child_process");
const SESSION_ID = process.argv[2];
if (!SESSION_ID) { console.log("Usage: node acp-load-test.cjs <sessionId>"); process.exit(1); }

const child = spawn("kiro-cli", ["acp", "--trust-all-tools"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NO_COLOR: "1" }
});

let rpcId = 0, buffer = "";

function send(method, params) {
  const msg = JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params });
  console.log("SEND[" + rpcId + "]", method);
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
      if (msg.result) console.log("RECV[" + msg.id + "] RESULT:", JSON.stringify(msg.result).slice(0, 200));
      else if (msg.error) console.log("RECV[" + msg.id + "] ERROR:", JSON.stringify(msg.error));
      else if (msg.method) {
        const u = msg.params?.update;
        if (u?.sessionUpdate === "agent_message_chunk") process.stdout.write(u.content?.text ?? "");
        else if (u?.sessionUpdate) console.log("NOTIFY:", u.sessionUpdate);
        else console.log("NOTIFY:", msg.method);
      }
    } catch {}
  }
});
child.stderr.on("data", (d) => console.log("STDERR:", d.toString().trim()));
child.on("close", (c) => { console.log("\nEXIT:", c); process.exit(0); });

setTimeout(() => send("initialize", {
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  clientInfo: { name: "acp-test", version: "0.1" }
}), 500);

// Load after 3s
setTimeout(() => send("session/load", { sessionId: SESSION_ID }), 3000);

// Wait 12s then prompt
setTimeout(() => {
  console.log("--- Sending prompt after 12s wait ---");
  send("session/prompt", { sessionId: SESSION_ID, prompt: [{ type: "text", text: "what did I say before?" }] });
}, 12000);

setTimeout(() => { console.log("\nTIMEOUT"); child.kill(); process.exit(0); }, 25000);
