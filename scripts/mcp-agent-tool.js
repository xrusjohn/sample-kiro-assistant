#!/usr/bin/env node
/**
 * mcp-agent-tool.js — MCP server exposing kiro-cli as a tool
 *
 * Runs on port 8000 (AgentCore MCP convention).
 * Exposes a single tool "kiro_agent" that sends a prompt to kiro-cli
 * via the ACP bridge on localhost:8080.
 */

import http from "node:http";

const PORT = parseInt(process.env.MCP_PORT || "8000", 10);

// Send a prompt to kiro-cli via the A2A adapter on localhost:9000
function callAgent(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      method: "message/send",
      id: "mcp-call",
      params: {
        message: {
          role: "user",
          parts: [{ kind: "text", text: prompt }]
        }
      }
    });

    const req = http.request({
      hostname: "127.0.0.1",
      port: 9000,
      path: "/",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, (res) => {
      let data = "";
      res.on("data", (d) => { data += d; });
      res.on("end", () => {
        try {
          const rpc = JSON.parse(data);
          const parts = rpc.result?.artifacts?.[0]?.parts || [];
          const text = parts.filter(p => p.kind === "text").map(p => p.text).join("\n");
          resolve(text || data);
        } catch { resolve(data); }
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error("timeout")); });
    req.end(body);
  });
}

// Minimal MCP-over-HTTP server (JSON-RPC)
const TOOLS = [{
  name: "kiro_agent",
  description: "Send a task to the kiro-cli coding agent. Returns the agent's complete response.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "The task or question for the agent" }
    },
    required: ["prompt"]
  }
}];

async function handleRpc(req) {
  const { method, id, params } = req;

  if (method === "initialize") {
    return { id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "kiro-agent-mcp", version: "1.0.0" } } };
  }
  if (method === "tools/list") {
    return { id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments || {};
    if (toolName !== "kiro_agent") {
      return { id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
    }
    try {
      const result = await callAgent(args.prompt || "");
      return { id, result: { content: [{ type: "text", text: result }] } };
    } catch (e) {
      return { id, error: { code: -32000, message: e.message } };
    }
  }
  if (method === "notifications/initialized") {
    return null; // notification, no response
  }
  return { id, error: { code: -32601, message: `Method not found: ${method}` } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200); res.end("pong"); return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    const rpc = JSON.parse(body);
    const response = await handleRpc(rpc);
    if (response === null) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", ...response }));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mcp] Listening on port ${PORT}`);
});
