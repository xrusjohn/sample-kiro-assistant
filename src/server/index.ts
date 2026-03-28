import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { readFile, access, copyFile } from "fs/promises";
import { constants } from "fs";
import { extname, join, basename, resolve, normalize } from "path";
import { exec } from "child_process";
import { promisify } from "util";

import { handleClientEvent, sessions, setBroadcast } from "./session-handler.js";
import { generateSessionTitle, normalizeWorkingDirectory, enhancedEnv } from "./util.js";
import { loadAssistantSettings, saveAssistantSettings } from "./app-settings.js";
import { SETTINGS_PATH } from "./paths.js";
import { resolveKiroCliBinary } from "../electron/libs/kiro-cli.js";
import { getKiroMcpSettingsPath, loadKiroMcpServers, setKiroMcpServerDisabled, ensureAgentConfigDefaults } from "../electron/libs/mcp-config.js";
import { ensureWorkspaceRoot } from "../electron/libs/workspace.js";
import { loadSkills } from "../electron/libs/skill-loader.js";
import { models as availableModels, DEFAULT_MODEL_ID } from "../shared/models.js";

import type { ServerEvent } from "../electron/types.js";

const execAsync = promisify(exec);
const PORT = parseInt(process.env.PORT || "3000", 10);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const upload = multer({ dest: "/tmp/kiro-uploads" });

// --- WebSocket: event stream ---
const clients = new Set<WebSocket>();

setBroadcast((event: ServerEvent) => {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
});

wss.on("connection", (ws) => {
  clients.add(ws);
  ws.on("message", (raw) => {
    try {
      const event = JSON.parse(raw.toString());
      handleClientEvent(event);
    } catch (e) { console.error("Bad WS message:", e); }
  });
  ws.on("close", () => clients.delete(ws));
});

// --- REST API ---
app.use(express.json());

app.post("/api/generate-session-title", (req, res) => {
  res.json(generateSessionTitle(req.body.userInput ?? null));
});

app.post("/api/rename-session", (req, res) => {
  const { sessionId, title } = req.body ?? {};
  if (!sessionId || !title?.trim()) { res.json({ success: false, error: "sessionId and title required" }); return; }
  sessions.updateSession(sessionId, { title: title.trim() });
  res.json({ success: true });
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

// --- Serve static React build ---
const staticDir = join(import.meta.dirname, "../../dist-react");
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

async function boot() {
  const templatePath = join(import.meta.dirname, "../../resources/agent_config.template.json");
  await ensureAgentConfigDefaults(templatePath);
  ensureWorkspaceRoot();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Kiro Assistant Web UI running at http://0.0.0.0:${PORT}`);
  });
}

boot().catch((e) => { console.error("Boot failed:", e); process.exit(1); });
