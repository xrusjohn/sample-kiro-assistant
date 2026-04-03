#!/usr/bin/env node
// acp-bridge.js — TCP bridge for kiro-cli ACP
// Uses `script -q -c` to give kiro-cli a PTY on stdin while keeping
// clean pipes for the bridge to read/write JSON-RPC.

const net = require("net");
const { spawn } = require("child_process");

const PORT = parseInt(process.env.ACP_PORT || "8080", 10);
const BINARY = process.env.KIRO_BINARY || "kiro-cli";

const child = spawn(
  "script",
  ["-q", "-c", `stty -echo; NO_COLOR=1 TERM=dumb ${BINARY} acp --agent kiro-assistant --trust-all-tools`, "/dev/null"],
  { stdio: ["pipe", "pipe", "pipe"] }
);

console.log(`[bridge] spawned kiro-cli pid=${child.pid}`);

let stdoutBuffer = Buffer.alloc(0);
let clientSocket = null;
let kiroReady = false;

// Strip ANSI codes, \r, and non-JSON lines (echo, progress bars, etc.)
function cleanOutput(str) {
  // eslint-disable-next-line no-control-regex
  const clean = str
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1B\[[0-9;]*m/g, "")
    .replace(/\x1B\[[\?0-9;]*[hlr]/g, "")
    .replace(/\r/g, "");
  // Only pass through lines that look like JSON-RPC (start with {)
  return clean.split("\n")
    .filter(l => l.trimStart().startsWith("{"))
    .join("\n") + (clean.endsWith("\n") ? "\n" : "");
}

child.stdout.on("data", (data) => {
  const clean = cleanOutput(data.toString());
  if (!clean.trim()) return;

  if (clientSocket && !clientSocket.destroyed) {
    clientSocket.write(Buffer.from(clean));
  } else {
    stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.from(clean)]);
  }
  if (!kiroReady) {
    kiroReady = true;
    console.log("[bridge] kiro-cli produced first output");
  }
});

child.stderr.on("data", (d) => process.stderr.write(d));

child.on("close", (code) => {
  console.log(`[bridge] kiro-cli exited code=${code}`);
  if (clientSocket && !clientSocket.destroyed) clientSocket.destroy();
  process.exit(code ?? 0);
});

const server = net.createServer((socket) => {
  clientSocket = socket;
  console.log(`[bridge] client connected from ${socket.remoteAddress}`);

  if (stdoutBuffer.length > 0) {
    socket.write(stdoutBuffer);
    stdoutBuffer = Buffer.alloc(0);
  }

  socket.on("data", (data) => child.stdin.write(data));

  socket.on("close", () => {
    console.log("[bridge] client disconnected, killing kiro-cli");
    child.kill("SIGINT");
  });

  socket.on("error", (err) => {
    console.error("[bridge] socket error:", err.message);
    child.kill("SIGINT");
  });

  server.close();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[bridge] listening on port ${PORT}`);
});
