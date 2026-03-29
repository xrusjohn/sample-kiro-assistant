#!/usr/bin/env node
/**
 * AgentCore Gateway MCP Proxy
 * 
 * A stdio MCP server that proxies requests to the AgentCore Gateway,
 * injecting the current Cognito ID token for authentication.
 * 
 * Token is fetched from the Kiro Assistant server (/api/auth/token)
 * and refreshed automatically.
 * 
 * Usage in agent_config.json:
 *   "agentcore-gateway": {
 *     "command": "node",
 *     "args": ["scripts/gateway-mcp-proxy.js"],
 *     "env": {
 *       "GATEWAY_URL": "https://xxx.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp",
 *       "TOKEN_URL": "http://localhost:3001/api/auth/token"
 *     }
 *   }
 */

const GATEWAY_URL = process.env.GATEWAY_URL || "https://kiro-assistant-gateway-bfsj0hg96b.gateway.bedrock-agentcore.us-west-2.amazonaws.com/mcp";
const TOKEN_URL = process.env.TOKEN_URL || "http://localhost:3001/api/auth/token";
const TOKEN_FILE = require("path").join(process.env.HOME || "/tmp", ".kiro-auth-token");

let cachedToken = null;

async function getToken() {
  // Try file first (survives server restarts), fall back to HTTP
  try {
    const data = JSON.parse(require("fs").readFileSync(TOKEN_FILE, "utf-8"));
    if (data.idToken && (!data.expiresAt || Date.now() < data.expiresAt)) {
      cachedToken = data.idToken;
      return cachedToken;
    }
  } catch {}
  try {
    const res = await fetch(TOKEN_URL);
    if (!res.ok) return cachedToken;
    const data = await res.json();
    cachedToken = data.idToken || null;
    return cachedToken;
  } catch {
    return cachedToken;
  }
}

async function forwardToGateway(request) {
  const token = await getToken();
  if (!token) {
    return { jsonrpc: "2.0", id: request.id, error: { code: -32001, message: "Not authenticated — sign in via the Kiro Assistant UI" } };
  }

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (res.status === 401) {
      cachedToken = null;
      return { jsonrpc: "2.0", id: request.id, error: { code: -32001, message: "Token expired — re-authenticate in the Kiro Assistant UI" } };
    }

    return await res.json();
  } catch (e) {
    return { jsonrpc: "2.0", id: request.id, error: { code: -32603, message: `Gateway error: ${e.message}` } };
  }
}

// stdio JSON-RPC transport
let buffer = "";
process.stdin.setEncoding("utf-8");
let pending = 0;
let stdinEnded = false;

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      
      if (request.method === "initialize") {
        const response = {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "agentcore-gateway-proxy", version: "1.0.0" },
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
        continue;
      }

      if (request.method === "notifications/initialized") continue;

      pending++;
      forwardToGateway(request).then((response) => {
        process.stdout.write(JSON.stringify(response) + "\n");
        pending--;
        if (stdinEnded && pending === 0) process.exit(0);
      });
    } catch {}
  }
});

process.stdin.on("end", () => {
  stdinEnded = true;
  if (pending === 0) process.exit(0);
});
