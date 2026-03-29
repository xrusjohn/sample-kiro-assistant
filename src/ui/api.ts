// Browser-side bridge: replaces window.electron with fetch() + WebSocket
// Populates window.electron so existing UI code works unchanged.

type ServerEvent = import("./types").ServerEvent;
type ClientEvent = import("./types").ClientEvent;

const BASE = window.location.origin;

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  return (await fetch(`${BASE}${path}`)).json();
}

// --- WebSocket singleton with auto-reconnect ---
type Listener = (event: ServerEvent) => void;
const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMessages: string[] = [];
let reconnectDelay = 1000;
let connectionStatus: "connected" | "reconnecting" | "disconnected" = "disconnected";
const statusListeners = new Set<(status: typeof connectionStatus) => void>();

export function onConnectionStatus(fn: (status: "connected" | "reconnecting" | "disconnected") => void) {
  statusListeners.add(fn);
  fn(connectionStatus);
  return () => { statusListeners.delete(fn); };
}

function setStatus(s: typeof connectionStatus) {
  connectionStatus = s;
  for (const fn of statusListeners) fn(s);
}

function connectWs() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${window.location.host}/ws`);
  ws.onopen = () => {
    reconnectDelay = 1000;
    setStatus("connected");
    // Flush any queued messages
    for (const msg of pendingMessages) ws!.send(msg);
    pendingMessages = [];
    // Always request session list on connect/reconnect
    ws!.send(JSON.stringify({ type: "session.list" }));
  };
  ws.onmessage = (msg) => {
    try {
      const event: ServerEvent = JSON.parse(msg.data);
      for (const fn of listeners) fn(event);
    } catch { /* ignore bad frames */ }
  };
  ws.onclose = () => {
    setStatus("reconnecting");
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
        connectWs();
      }, reconnectDelay);
    }
  };
  ws.onerror = () => ws?.close();
}

connectWs();

// --- Hidden file input for selectFiles ---
let fileInput: HTMLInputElement | null = null;
function getFileInput(): HTMLInputElement {
  if (!fileInput) {
    fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.multiple = true;
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
  }
  return fileInput;
}

function selectFilesViaDialog(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = getFileInput();
    input.value = "";
    input.onchange = () => {
      resolve(input.files ? Array.from(input.files) : null);
    };
    // If user cancels, onchange won't fire — resolve null after a timeout
    const cancel = () => { resolve(null); window.removeEventListener("focus", cancel); };
    window.addEventListener("focus", cancel, { once: true });
    // Small delay so the focus listener doesn't fire immediately
    setTimeout(() => input.click(), 50);
  });
}

// --- Populate window.electron ---
window.electron = {
  subscribeStatistics: () => () => {},
  getStaticData: async () => ({ totalStorage: 0, cpuModel: "remote", totalMemoryGB: 0 }),

  sendClientEvent: (event: ClientEvent) => {
    const msg = JSON.stringify(event);
    if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
    else pendingMessages.push(msg);
  },

  onServerEvent: (callback: Listener) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  },

  generateSessionTitle: (userInput: string | null) =>
    post<string>("/api/generate-session-title", { userInput }),

  getRecentCwds: (limit?: number) =>
    get<string[]>(`/api/recent-cwds?limit=${limit ?? 8}`),

  selectDirectory: async () => null, // No native dialog in browser — not needed for remote

  selectFiles: async () => {
    // Returns File[] from browser dialog — but the original API returns string[] (paths).
    // We'll handle upload in copyFilesToCwd instead.
    const files = await selectFilesViaDialog();
    if (!files || files.length === 0) return null;
    // Store files temporarily for the upcoming copyFilesToCwd call
    (window as any).__pendingUploadFiles = files;
    return files.map((f) => f.name);
  },

  readFile: (filePath: string) =>
    post<FileReadResult>("/api/read-file", { filePath }),

  openFileExternal: async (filePath: string) => {
    window.open(`${BASE}/api/files?path=${encodeURIComponent(filePath)}`, "_blank");
    return true;
  },

  openExternalUrl: async (url: string) => {
    window.open(url, "_blank");
    return true;
  },

  fileExists: (filePath: string) =>
    post<boolean>("/api/file-exists", { filePath }),

  getKiroMcpServers: () =>
    get<KiroMcpServersResponse>("/api/mcp-servers"),

  setKiroMcpDisabled: (payload: ToggleKiroMcpPayload) =>
    post<ToggleKiroMcpResult>("/api/mcp-disabled", payload),

  runKiroCommand: (payload: KiroCommandPayload) =>
    post<KiroCommandResult>("/api/run-kiro-command", payload),

  copyFilesToCwd: async (payload: CopyFilesPayload) => {
    // Use the pending files from selectFiles, upload via multipart
    const pendingFiles: File[] | undefined = (window as any).__pendingUploadFiles;
    (window as any).__pendingUploadFiles = undefined;

    if (!pendingFiles?.length) {
      return { success: false, error: "No files selected." } as CopyFilesResult;
    }

    const form = new FormData();
    form.append("cwd", payload.cwd);
    for (const f of pendingFiles) form.append("files", f);

    const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
    return res.json() as Promise<CopyFilesResult>;
  },

  getSkills: () =>
    get<SkillsResponse>("/api/skills"),

  getModelSettings: () =>
    get<ModelSettingsResponse>("/api/model-settings"),

  setDefaultModel: (payload: SetDefaultModelPayload) =>
    post<SetDefaultModelResult>("/api/set-default-model", payload),
};
