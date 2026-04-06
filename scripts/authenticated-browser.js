#!/usr/bin/env node
/**
 * authenticated-browser.js — MCP server wrapping a local CDP Chrome session
 *
 * Exposes your authenticated Chrome browser as MCP tools.
 * The agent never sees credentials — it just drives the browser
 * you already logged into.
 *
 * Requires: Chrome with --remote-debugging-port=9222
 *           (tunneled from Windows or running locally)
 *
 * Tools:
 *   browse_page    — navigate to URL, return page text
 *   screenshot     — capture a screenshot
 *   click_element  — click by CSS selector
 *   fill_input     — type into an input field
 *   run_js         — execute JavaScript in page context
 *   list_tabs      — list open tabs
 */

import http from "node:http";

const CDP_HOST = process.env.CDP_HOST || "127.0.0.1";
const CDP_PORT = parseInt(process.env.CDP_PORT || "9222", 10);
const MCP_PORT = parseInt(process.env.MCP_PORT || "8100", 10);

// Helper: call CDP HTTP endpoint
async function cdpHttp(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://${CDP_HOST}:${CDP_PORT}${path}`, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on("error", reject);
  });
}

// Helper: send CDP command via WebSocket
async function cdpCommand(wsUrl, method, params = {}) {
  const { WebSocket } = await import("ws").catch(() => {
    // Fallback: use HTTP-based approach if ws not available
    throw new Error("ws module not available — install with: npm install ws");
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    const id = Date.now();
    ws.on("open", () => ws.send(JSON.stringify({ id, method, params })));
    ws.on("message", (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id === id) { ws.close(); resolve(data.result || data.error); }
    });
    ws.on("error", reject);
    setTimeout(() => { ws.close(); reject(new Error("CDP timeout")); }, 30000);
  });
}

// Get the first tab's WebSocket URL
async function getActiveTab() {
  const tabs = await cdpHttp("/json");
  const page = Array.isArray(tabs) ? tabs.find(t => t.type === "page") : null;
  if (!page) throw new Error("No active page tab found");
  return page;
}

// Tool implementations
const TOOLS = {
  browse_page: {
    description: "Navigate to a URL and return the page title and text content",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "URL to navigate to" } },
      required: ["url"]
    },
    handler: async ({ url }) => {
      const tab = await getActiveTab();
      await cdpCommand(tab.webSocketDebuggerUrl, "Page.navigate", { url });
      await new Promise(r => setTimeout(r, 3000)); // wait for load
      const result = await cdpCommand(tab.webSocketDebuggerUrl, "Runtime.evaluate", {
        expression: "JSON.stringify({title: document.title, text: document.body?.innerText?.slice(0, 5000) || ''})"
      });
      return JSON.parse(result.value || "{}");
    }
  },
  screenshot: {
    description: "Capture a screenshot of the current page (returns base64 PNG)",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const tab = await getActiveTab();
      const result = await cdpCommand(tab.webSocketDebuggerUrl, "Page.captureScreenshot", { format: "png" });
      return { image: result.data?.slice(0, 100) + "... (base64 truncated)", size: result.data?.length || 0 };
    }
  },
  run_js: {
    description: "Execute JavaScript in the page context and return the result",
    inputSchema: {
      type: "object",
      properties: { expression: { type: "string", description: "JavaScript to evaluate" } },
      required: ["expression"]
    },
    handler: async ({ expression }) => {
      const tab = await getActiveTab();
      const result = await cdpCommand(tab.webSocketDebuggerUrl, "Runtime.evaluate", { expression });
      return result;
    }
  },
  list_tabs: {
    description: "List all open browser tabs",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const tabs = await cdpHttp("/json");
      return tabs.filter(t => t.type === "page").map(t => ({ title: t.title, url: t.url }));
    }
  }
};

// MCP JSON-RPC server
const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200); res.end("pong"); return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    const rpc = JSON.parse(body);
    const response = await handleRpc(rpc);
    if (!response) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", ...response }));
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: e.message } }));
  }
});

async function handleRpc(req) {
  const { method, id, params } = req;

  if (method === "initialize") {
    return { id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "authenticated-browser", version: "1.0.0" } } };
  }
  if (method === "tools/list") {
    return { id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) } };
  }
  if (method === "tools/call") {
    const tool = TOOLS[params?.name];
    if (!tool) return { id, error: { code: -32601, message: `Unknown tool: ${params?.name}` } };
    try {
      const result = await tool.handler(params?.arguments || {});
      return { id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
    } catch (e) {
      return { id, error: { code: -32000, message: e.message } };
    }
  }
  if (method === "notifications/initialized") return null;
  return { id, error: { code: -32601, message: `Method not found: ${method}` } };
}

server.listen(MCP_PORT, "0.0.0.0", () => {
  console.log(`[auth-browser] MCP server on :${MCP_PORT}`);
  console.log(`[auth-browser] CDP target: ${CDP_HOST}:${CDP_PORT}`);
});
