import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { readFile, access, copyFile } from "fs/promises";
import { constants } from "fs";
import { extname, join, basename, resolve, normalize } from "path";
import { exec } from "child_process";
import { promisify } from "util";

import Database from "better-sqlite3";
import { handleClientEvent, sessions, setBroadcast, abortAll, manager, registry, restartSession, setA2ARegistry, addSessionListener, addGlobalListener } from "./session-handler.js";
import { createSendToRegistry, createSendToRouter, setSessionHandlerRef } from "./send-to/index.js";
import { A2ARegistry } from "./a2a-registry.js";
import { createA2ARouter } from "./a2a-router.js";
import { handleAgentConnection } from "./ws-agent-handler.js";
import { DB_PATH, SETTINGS_PATH } from "./paths.js";
import { generateSessionTitle, normalizeWorkingDirectory, enhancedEnv } from "./util.js";
import { loadAssistantSettings, saveAssistantSettings } from "./app-settings.js";
import { resolveKiroCliBinary } from "../electron/libs/kiro-cli.js";
import { getKiroMcpSettingsPath, loadKiroMcpServers, setKiroMcpServerDisabled, ensureAgentConfigDefaults } from "../electron/libs/mcp-config.js";
import { ensureWorkspaceRoot } from "../electron/libs/workspace.js";
import { loadSkills } from "../electron/libs/skill-loader.js";
import { models as availableModels, DEFAULT_MODEL_ID } from "../shared/models.js";
import { killStale, cleanup as cleanupPidFile } from "./pid-tracker.js";

import type { ServerEvent } from "../electron/types.js";

const execAsync = promisify(exec);
const PORT = parseInt(process.env.PORT || "3000", 10);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const wssAgents = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/ws/agent') {
    wssAgents.handleUpgrade(request, socket, head, (ws) => wssAgents.emit('connection', ws, request));
  } else if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});
const upload = multer({ dest: "/tmp/kiro-uploads" });

// A2A Registry — instantiated at module load so the router is registered
// before the static catch-all handler below.
const a2aDb = new Database(DB_PATH);
export const a2aRegistry = new A2ARegistry(a2aDb);

// Health check — registered early so it's not caught by the static/catch-all handler
const SERVER_BOOT_TIME = Date.now();
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: Date.now() - SERVER_BOOT_TIME, pid: process.pid });
});

// --- WebSocket: event stream ---
const clients = new Set<WebSocket>();

setBroadcast((event: ServerEvent) => {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
});

wss.on("connection", async (ws) => {
  clients.add(ws);

  // Send agent list on connect
  try {
    await registry.checkAvailability();
    const agents = registry.getAll().map(({ id, label, available }) => ({ id, label, available }));
    const event: ServerEvent = { type: "agents.list", payload: { agents } };
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
  } catch (e) { console.error("Failed to send agents.list:", e); }

  ws.on("message", (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      handleClientEvent(event);
    } catch (e) { console.error("Bad WS message:", e); }
  });
  ws.on("close", () => clients.delete(ws));
});

// --- REST API ---
app.use(express.json({ limit: "50mb" }));

// --- AG-UI endpoint (SSE) ---
import { createAgUiAdapter } from "./ag-ui-adapter.js";
import type { RunAgentInput } from "./ag-ui-types.js";
import crypto from "node:crypto";

app.post("/ag-ui/run", (req, res) => {
  const input = req.body as RunAgentInput;
  if (!input?.prompt) { res.status(400).json({ error: "prompt required" }); return; }

  const runId = crypto.randomUUID();

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;
  const sendEvent = (agUiEvent: any) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(agUiEvent)}\n\n`);
  };
  const finish = () => { if (!closed) { closed = true; res.end(); } };

  // For continue, we know the session ID
  if (input.threadId) {
    const adapter = createAgUiAdapter(input.threadId, runId);
    const remove = addSessionListener(input.threadId, (event) => {
      for (const e of adapter.translate(event)) {
        sendEvent(e);
        if (e.type === "RUN_FINISHED" || e.type === "RUN_ERROR") setTimeout(() => { remove(); finish(); }, 100);
      }
    });
    req.on("close", () => { remove(); closed = true; });
    handleClientEvent({ type: "session.continue", payload: { sessionId: input.threadId, prompt: input.prompt } });
    return;
  }

  // For new sessions: register a global listener BEFORE creating the session
  // so we catch all events including the fast ones during ACP init.
  let sessionId: string | null = null;
  let adapter: ReturnType<typeof createAgUiAdapter> | null = null;
  let removeGlobal: (() => void) | null = null;

  removeGlobal = addGlobalListener((event) => {
    const sid = (event.payload as any)?.sessionId;
    if (!sid) return;

    // Lock onto the session ID from the first event we see after creation
    if (!sessionId) {
      // Verify this is a new session (not an existing one)
      const before = knownSessionIds;
      if (before.has(sid)) return;
      sessionId = sid;
      adapter = createAgUiAdapter(sid, runId, { skipFirstIdle: true });
      sendEvent({ type: "CUSTOM", name: "thread.created", value: { threadId: sid }, runId, timestamp: Date.now() });
    }

    if (sid !== sessionId || !adapter) return;

    for (const e of adapter.translate(event)) {
      sendEvent(e);
      if (e.type === "RUN_FINISHED" || e.type === "RUN_ERROR") {
        setTimeout(() => { removeGlobal?.(); finish(); }, 100);
      }
    }
  });

  req.on("close", () => { removeGlobal?.(); closed = true; });

  // Snapshot existing session IDs so we can identify the new one
  const knownSessionIds = new Set(sessions.listSessions().map(s => s.id));

  handleClientEvent({
    type: "session.start",
    payload: {
      title: input.prompt.slice(0, 64),
      prompt: input.prompt,
      cwd: input.cwd,
      agentId: input.agentId,
      ...(input.profileId ? { profileId: input.profileId } : {}),
    },
  } as any);
});

// --- Widgets toggle ---
let widgetsEnabled = process.env.KIRO_WIDGETS !== "0";

app.get("/api/widgets-enabled", (_req, res) => res.json(widgetsEnabled));

// Get the current auth token (for server-side gateway calls)
const TOKEN_FILE = join(process.env.HOME || "/tmp", ".kiro-auth-token");
app.get("/api/auth/token", async (_req, res) => {
  try {
    const data = await readFile(TOKEN_FILE, "utf-8");
    const parsed = JSON.parse(data);
    // Check if expired
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      res.status(401).json({ error: "Token expired" });
    } else {
      res.json(parsed);
    }
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
});
app.post("/api/auth/token", async (req, res) => {
  try {
    const { writeFile } = await import("fs/promises");
    await writeFile(TOKEN_FILE, JSON.stringify(req.body), "utf-8");
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// OAuth callback — exchanges code for tokens and stores them
app.get("/auth/callback", (_req, res) => {
  res.send(`<!DOCTYPE html><html><body>
<div id="status" style="font-family:system-ui;padding:40px;text-align:center">
  <h3>Authenticating...</h3>
</div>
<script>
(async () => {
  const status = document.getElementById("status");
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    status.innerHTML = "<h3 style='color:red'>✗ " + error + "</h3>";
    return;
  }
  if (!code) {
    status.innerHTML = "<h3 style='color:red'>✗ No code received</h3>";
    return;
  }

  try {
    const res = await fetch("https://xrusjohn-demo.auth.us-east-1.amazoncognito.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "434321f0nj66bmo12i2qg7eled",
        redirect_uri: window.location.origin + "/auth/callback",
        code: code,
      }),
    });
    const data = await res.json();
    if (data.error) {
      status.innerHTML = "<h3 style='color:red'>✗ " + data.error + "</h3>";
      return;
    }

    // Decode ID token for user info and real expiry
    let email = null, username = null, expiresAt = null;
    if (data.id_token) {
      try {
        const claims = JSON.parse(atob(data.id_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
        email = claims.email || null;
        username = (claims["cognito:username"] || "").replace("Midway_", "") || null;
        if (claims.exp) expiresAt = claims.exp * 1000;
      } catch {}
    }

    // Store in localStorage (shared with main app)
    localStorage.setItem("kiro-auth", JSON.stringify({
      idToken: data.id_token || null,
      accessToken: data.access_token || null,
      refreshToken: data.refresh_token || null,
      expiresAt: expiresAt || (data.expires_in ? Date.now() + data.expires_in * 1000 : null),
      email: email,
      username: username,
    }));

    status.innerHTML = "<h3 style='color:green'>✓ Signed in as " + (username || email || "user") + "</h3><p>You can close this tab.</p>";

    // Push token to server file
    fetch("/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: data.id_token, expiresAt: expiresAt }),
    });

    // Notify opener if available
    if (window.opener) {
      window.opener.postMessage({ type: "AUTH_CALLBACK", success: true }, "*");
    }

    // Auto-close after 1.5s
    setTimeout(() => { try { window.close(); } catch {} }, 1500);
  } catch (e) {
    status.innerHTML = "<h3 style='color:red'>✗ " + e.message + "</h3>";
  }
})();
</script></body></html>`);
});
app.post("/api/widgets-enabled", (req, res) => {
  widgetsEnabled = req.body?.enabled !== false;
  process.env.KIRO_WIDGETS = widgetsEnabled ? "1" : "0";
  res.json(widgetsEnabled);
});

app.post("/api/generate-session-title", (req, res) => {
  res.json(generateSessionTitle(req.body.userInput ?? null));
});

app.post("/api/rename-session", (req, res) => {
  const { sessionId, title } = req.body ?? {};
  if (!sessionId || !title?.trim()) { res.json({ success: false, error: "sessionId and title required" }); return; }
  sessions.updateSession(sessionId, { title: title.trim() });
  res.json({ success: true });
});

app.get("/api/sessions/health", (_req, res) => {
  res.json(manager.getHealth());
});

// Restart a session's ACP process (picks up new MCP config, skills, etc.)
app.post("/api/sessions/:id/restart", (_req, res) => {
  const id = _req.params.id;
  if (restartSession(id)) {
    res.json({ ok: true, message: "Agent restarting — will reconnect automatically" });
  } else {
    res.status(404).json({ error: "Session not found or failed to respawn" });
  }
});

// Restart all sessions
app.post("/api/sessions/restart-all", (_req, res) => {
  const health = manager.getHealth();
  console.log(`[restart-all] Destroying ${health.activeProcesses} ACP processes...`);
  manager.abortAll();
  res.json({ ok: true, destroyed: health.activeProcesses });
});

app.get("/api/recent-cwds", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 8, 1), 20);
  res.json(sessions.listRecentCwds(limit));
});

app.get("/api/model-settings", (_req, res) => {
  const settings = loadAssistantSettings();
  const configuredModelId = settings.defaultModel?.trim() || null;
  res.json({
    models: availableModels,
    currentModelId: configuredModelId || DEFAULT_MODEL_ID,
    configuredModelId,
    source: configuredModelId ? "custom" : "default",
    settingsPath: SETTINGS_PATH
  });
});

app.post("/api/set-default-model", (req, res) => {
  const modelId = typeof req.body?.modelId === "string" ? req.body.modelId.trim() : "";
  if (!availableModels.find((m) => m.id === modelId)) {
    res.json({ success: false, error: "Unknown model." });
    return;
  }
  saveAssistantSettings({ ...loadAssistantSettings(), defaultModel: modelId });
  res.json({ success: true, currentModelId: modelId, source: "custom" });
});

// Text extensions for inline display
const textExts = new Set([
  '.txt','.md','.py','.js','.ts','.tsx','.jsx','.json','.xml','.html','.css',
  '.scss','.yaml','.yml','.sh','.bash','.c','.cpp','.h','.java','.go','.rs',
  '.rb','.php','.sql','.vue','.svelte','.toml','.ini','.cfg','.conf','.log','.csv',
  '.env','.gitignore','.dockerignore','.editorconfig','.markdown','.less',
  '.zsh','.fish','.ps1','.bat','.cmd','.hpp','.graphql','.astro'
]);
const imageExts = new Set(['.png','.jpg','.jpeg','.gif','.svg','.webp','.bmp','.ico']);
const excelExts = new Set(['.xlsx','.xls','.xlsm','.xlsb']);

const mimeMap: Record<string, string> = {
  '.txt':'text/plain','.md':'text/markdown','.json':'application/json','.html':'text/html',
  '.css':'text/css','.js':'text/javascript','.ts':'text/typescript','.pdf':'application/pdf',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.svg':'image/svg+xml','.webp':'image/webp','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

app.post("/api/read-file", async (req, res) => {
  const filePath = req.body?.filePath;
  if (!filePath) { res.json({ success: false, error: "No path", isText: false, fileType: "unknown" }); return; }
  try {
    const ext = extname(filePath).toLowerCase();
    const mimeType = mimeMap[ext] || "application/octet-stream";
    if (textExts.has(ext)) {
      const content = await readFile(filePath, "utf-8");
      res.json({ success: true, content, isText: true, fileType: "text", mimeType });
      return;
    }
    if (imageExts.has(ext)) {
      const buf = await readFile(filePath);
      res.json({ success: true, content: `data:${mimeType};base64,${buf.toString("base64")}`, isText: false, fileType: "image", mimeType });
      return;
    }
    if (ext === ".pdf") {
      res.json({ success: true, content: `/api/files?path=${encodeURIComponent(filePath)}`, isText: false, fileType: "pdf", mimeType });
      return;
    }
    if (excelExts.has(ext)) {
      const XLSX = await import("xlsx");
      const buf = await readFile(filePath);
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheets: Record<string, unknown[][]> = {};
      for (const name of wb.SheetNames) sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as unknown[][];
      res.json({ success: true, content: JSON.stringify(sheets), isText: false, fileType: "excel", sheetNames: wb.SheetNames, mimeType });
      return;
    }
    res.json({ success: true, isText: false, fileType: "binary", mimeType });
  } catch (e: any) {
    res.json({ success: false, error: e.message || "Failed to read file", isText: false, fileType: "unknown" });
  }
});

app.get("/api/files", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).send("Missing path"); return; }
  const resolved = resolve(filePath);
  try {
    await access(resolved, constants.R_OK);
    res.sendFile(resolved);
  } catch { res.status(404).send("Not found"); }
});

// Force-download a file
app.get("/api/files/download", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).send("Missing path"); return; }
  const resolved = resolve(filePath);
  try {
    await access(resolved, constants.R_OK);
    res.download(resolved, basename(resolved));
  } catch { res.status(404).send("Not found"); }
});

// Preview a file in the browser — renders .md as HTML, others served raw
app.get("/api/files/preview", async (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).send("Missing path"); return; }
  const resolved = resolve(filePath);
  try {
    await access(resolved, constants.R_OK);
    const ext = extname(resolved).toLowerCase();
    if (ext === ".md" || ext === ".markdown") {
      const content = await readFile(resolved, "utf-8");
      // Serve a self-contained page that renders markdown client-side with dark theme
      const escaped = content.replace(/`/g, "\\`").replace(/\$/g, "\\$");
      res.type("html").send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${basename(resolved)}</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark.min.css">
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11/highlight.min.js"><\/script>
<style>
body{max-width:800px;margin:40px auto;padding:0 20px;font-family:-apple-system,system-ui,sans-serif;line-height:1.7;color:#e0e0e0;background:#1a1a2e}
h1,h2,h3{color:#f0f0f0;margin-top:1.5em;border-bottom:1px solid #333;padding-bottom:0.3em}
a{color:#6ea8fe}code{font-size:0.9em;background:#2d2d44;padding:2px 6px;border-radius:4px;color:#e0e0e0}
pre{background:#2d2d44;padding:16px;border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid #444;padding:8px 12px;text-align:left}
th{background:#2d2d44;color:#f0f0f0}tr:nth-child(even){background:#1f1f35}
blockquote{border-left:3px solid #555;margin:1em 0;padding:0.5em 1em;color:#aaa;background:#1f1f35;border-radius:0 4px 4px 0}
li{margin:0.3em 0}hr{border:none;border-top:1px solid #333;margin:2em 0}
img{max-width:100%;border-radius:8px}
</style></head><body><div id="content"></div>
<script>
const md = \`${escaped}\`;
document.getElementById("content").innerHTML = marked.parse(md);
document.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
<\/script></body></html>`);
    } else {
      res.sendFile(resolved);
    }
  } catch { res.status(404).send("Not found"); }
});

app.post("/api/export-session", async (req, res) => {
  try {
    const { filename, content } = req.body;
    const outPath = join("/workspace", filename);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outPath, content, "utf-8");
    res.json({ success: true, path: outPath });
  } catch (e: any) { res.json({ success: false, error: e.message }); }
});

app.post("/api/save-image", async (req, res) => {
  try {
    const { filename, dataUrl } = req.body;
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const outPath = join("/workspace", filename);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outPath, Buffer.from(base64, "base64"));
    res.json({ success: true, path: outPath });
  } catch (e: any) { res.json({ success: false, error: e.message }); }
});

app.post("/api/file-exists", async (req, res) => {
  try {
    await access(req.body.filePath, constants.F_OK);
    res.json(true);
  } catch { res.json(false); }
});

app.get("/api/mcp-servers", async (_req, res) => {
  try {
    const { servers, path } = await loadKiroMcpServers();
    res.json({ success: true, servers, settingsPath: path });
  } catch (e: any) {
    res.json({ success: false, servers: {}, error: e.message, settingsPath: getKiroMcpSettingsPath() });
  }
});

app.post("/api/mcp-disabled", async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    if (!name) throw new Error("Server name required.");
    const servers = await setKiroMcpServerDisabled(name, req.body?.disabled ?? false);
    res.json({ success: true, servers, settingsPath: getKiroMcpSettingsPath() });
  } catch (e: any) {
    res.json({ success: false, error: e.message, settingsPath: getKiroMcpSettingsPath() });
  }
});

app.post("/api/run-kiro-command", async (req, res) => {
  const cwd = normalizeWorkingDirectory(req.body?.cwd) ?? process.cwd();
  let command = req.body?.command?.trim();
  if (!command) { res.json({ success: false, error: "Command required." }); return; }
  if (command.startsWith("/")) command = command.slice(1).trim();
  if (!command) { res.json({ success: false, error: "Command required." }); return; }
  const binary = resolveKiroCliBinary();
  if (!binary) { res.json({ success: false, error: "kiro-cli not found." }); return; }
  try {
    const q = binary.includes(" ") ? `"${binary}"` : binary;
    const { stdout, stderr } = await execAsync(`${q} ${command}`, {
      cwd, env: { ...enhancedEnv, NO_COLOR: "1", CLICOLOR: "0", KIRO_CLI_DISABLE_PAGER: "1" }
    });
    res.json({ success: true, stdout, stderr });
  } catch (e: any) {
    res.json({ success: false, error: e.message, stdout: e.stdout, stderr: e.stderr });
  }
});

app.post("/api/upload", upload.array("files"), async (req, res) => {
  const cwd = normalizeWorkingDirectory(req.body?.cwd);
  if (!cwd) { res.json({ success: false, error: "Working directory required." }); return; }
  const files = req.files as Express.Multer.File[];
  if (!files?.length) { res.json({ success: false, error: "No files." }); return; }

  const copied: { source: string; destination: string; filename: string }[] = [];
  const failed: { source: string; error: string }[] = [];

  for (const file of files) {
    try {
      let dest = join(cwd, file.originalname);
      let name = file.originalname;
      let counter = 1;
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      while (true) {
        try { await access(dest, constants.F_OK); name = `${base} (${counter++})${ext}`; dest = join(cwd, name); }
        catch { break; }
      }
      await copyFile(file.path, dest);
      copied.push({ source: file.originalname, destination: dest, filename: name });
    } catch (e: any) {
      failed.push({ source: file.originalname, error: e.message });
    }
  }
  res.json({ success: copied.length > 0, copied, failed: failed.length ? failed : undefined });
});

app.get("/api/skills", async (_req, res) => {
  try {
    const result = await loadSkills();
    res.json({ success: true, user: result.user, project: result.project });
  } catch (e: any) {
    res.json({ success: false, error: e.message, user: [], project: [] });
  }
});

// --- Send To ---
const sendToRegistry = createSendToRegistry();
setSessionHandlerRef({ handleClientEvent, sessions });
app.use("/api/files/send-to", createSendToRouter(sendToRegistry));

app.get("/api/agents", async (_req, res) => {
  await registry.checkAvailability();
  const agents = registry.getAll().map(({ id, label, available }) => ({ id, label, available }));
  res.json({ agents, default: registry.getDefault() });
});

// --- Server status & safe restart ---
app.get("/api/server/status", (_req, res) => {
  const health = manager.getHealth();
  const uptimeMs = Date.now() - SERVER_BOOT_TIME;
  res.json({
    uptime: uptimeMs,
    uptimeHuman: `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`,
    pid: process.pid,
    nodeVersion: process.version,
    memoryMB: Math.round(process.memoryUsage.call(process).rss / 1048576),
    sessions: health,
    port: PORT,
  });
});

app.post("/api/server/restart", async (_req, res) => {
  // Graceful restart: save all session state, notify clients, then exit.
  // tmux (server.sh) will respawn the process automatically.
  const health = manager.getHealth();
  console.log(`[restart] Graceful restart requested — ${health.activeProcesses} active sessions`);

  // Notify all WS clients so the UI can show a reconnecting state
  const restartEvent: ServerEvent = { type: "server.restarting", payload: { reason: "user_requested" } };
  const payload = JSON.stringify(restartEvent);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  res.json({ ok: true, message: "Server restarting...", sessionsAborted: health.activeProcesses });

  // Give the response and WS messages time to flush
  setTimeout(() => {
    shutdown("RESTART");
  }, 500);
});

// --- Downloads file server ---
import { readdir, stat } from "fs/promises";
import { homedir } from "os";

const DOWNLOADS_DIR = process.env.KIRO_DOWNLOADS_DIR ?? join(homedir(), "Downloads");

app.get("/downloads", async (_req, res) => {
  try {
    const entries = await readdir(DOWNLOADS_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries.filter(e => e.isFile()).map(async (e) => {
        const s = await stat(join(DOWNLOADS_DIR, e.name));
        return { name: e.name, size: s.size, modified: s.mtime.toISOString() };
      })
    );
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ dir: DOWNLOADS_DIR, files });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/downloads/:filename", async (req, res) => {
  const safe = basename(req.params.filename);
  const filePath = join(DOWNLOADS_DIR, safe);
  try {
    await access(filePath, constants.R_OK);
    res.download(filePath);
  } catch { res.status(404).send("Not found"); }
});

// --- Serve static React build ---
const staticDir = join(import.meta.dirname, "../../dist-react");

// A2A routes must be mounted BEFORE the static catch-all
app.use('/api/a2a', createA2ARouter(a2aRegistry));

app.use(express.static(staticDir));
app.get("/{*splat}", (_req, res) => {
  const indexPath = join(staticDir, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).send("Not found");
  });
});

// --- Boot ---
process.on("uncaughtException", (err) => console.error("Uncaught:", err.message));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

// --- Graceful shutdown ---
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down — aborting all ACP processes...`);
  abortAll();
  cleanupPidFile();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function boot() {
  killStale();
  const templatePath = join(import.meta.dirname, "../../resources/agent_config.template.json");
  await ensureAgentConfigDefaults(templatePath);
  ensureWorkspaceRoot();
  await registry.checkAvailability();

  a2aRegistry.startHeartbeatSweep();
  setA2ARegistry(a2aRegistry);

  // Remote agent WS connections
  wssAgents.on("connection", (ws) => handleAgentConnection(ws, a2aRegistry));

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Kiro Assistant Web UI running at http://0.0.0.0:${PORT}`);
  });
}

boot().catch((e) => { console.error("Boot failed:", e); process.exit(1); });
