// Test: ACP bridge with claude-agent-acp
const { spawn } = require("child_process");
const net = require("net");

const bridge = spawn("node", ["scripts/acp-bridge.js"], {
  env: { ...process.env, KIRO_BINARY: "claude-agent-acp", ACP_PORT: "18080" },
  stdio: ["pipe", "pipe", "pipe"],
});

bridge.stdout.on("data", d => process.stdout.write("[bridge] " + d.toString()));
bridge.stderr.on("data", d => process.stderr.write("[bridge-err] " + d.toString()));

setTimeout(() => {
  const s = net.createConnection({ host: "127.0.0.1", port: 18080 });
  s.on("connect", () => {
    console.log("[test] Connected to bridge on :18080");
    s.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: 1, clientInfo: { name: "test", version: "0.1" }, clientCapabilities: {} }
    }) + "\n");
  });

  let buf = "";
  s.on("data", d => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim().startsWith("{")) continue;
      try {
        const m = JSON.parse(line);
        if (m.result?.agentCapabilities) {
          console.log("[test] ✓ Claude Code via ACP bridge works!");
          console.log("[test] Agent:", m.result.agentInfo?.name ?? "unknown");
          s.destroy();
          bridge.kill("SIGTERM");
          process.exit(0);
        }
      } catch {}
    }
  });

  s.on("error", e => {
    console.error("[test] Error:", e.message);
    bridge.kill("SIGTERM");
    process.exit(1);
  });
}, 2000);

setTimeout(() => {
  console.error("[test] Timeout");
  bridge.kill("SIGTERM");
  process.exit(1);
}, 15000);
