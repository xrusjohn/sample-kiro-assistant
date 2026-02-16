import { app, BrowserWindow, ipcMain, dialog, shell, type IpcMainInvokeEvent } from "electron"
import { readFile, access, copyFile } from "fs/promises"
import { constants } from "fs"
import { extname, join, basename } from "path"
import * as XLSX from "xlsx"
import * as yauzl from "yauzl"
import { exec } from "child_process"
import { promisify } from "util"
import { ipcMainHandle, isDev, DEV_PORT } from "./util.js";
import { getPreloadPath, getUIPath, getIconPath } from "./pathResolver.js";
import { getStaticData, pollResources } from "./test.js";
import { handleClientEvent, sessions } from "./ipc-handlers.js";
import { generateSessionTitle, enhancedEnv, normalizeWorkingDirectory } from "./libs/util.js";
import { resolveKiroCliBinary } from "./libs/kiro-cli.js";
import { getKiroMcpSettingsPath, loadKiroMcpServers, setKiroMcpServerDisabled, ensureAgentConfigDefaults } from "./libs/mcp-config.js";
import { ensureWorkspaceRoot } from "./libs/workspace.js";
import { loadSkills } from "./libs/skill-loader.js";
import { loadAssistantSettings, saveAssistantSettings, getAssistantSettingsPath, type AssistantSettings } from "./libs/app-settings.js";
import { models as availableModels, DEFAULT_MODEL_ID } from "../shared/models.js";
import type { ClientEvent } from "./types.js";
import "./libs/claude-settings.js";

const execAsync = promisify(exec);
let assistantSettings: AssistantSettings = {};

type CommandExecError = {
    message?: string;
    stdout?: string;
    stderr?: string;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "object" && error !== null && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) return message;
    }
    return fallback;
};

const getCommandErrorStream = (error: unknown, stream: "stdout" | "stderr"): string | undefined => {
    if (!error || typeof error !== "object") return undefined;
    const value = (error as CommandExecError)[stream];
    return typeof value === "string" ? value : undefined;
};

app.on("ready", async () => {
    const templatePath = app.isPackaged
        ? join(process.resourcesPath, "agent_config.template.json")
        : join(process.cwd(), "resources", "agent_config.template.json");
    await ensureAgentConfigDefaults(templatePath);
    ensureWorkspaceRoot();
    assistantSettings = loadAssistantSettings();
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: getPreloadPath(),
            webSecurity: false, // Allow loading local file:// URLs
        },
        icon: getIconPath(),
        titleBarStyle: "hiddenInset",
        backgroundColor: "#FAF9F6",
        trafficLightPosition: { x: 15, y: 18 }
    });

    if (isDev()) mainWindow.loadURL(`http://localhost:${DEV_PORT}`)
    else mainWindow.loadFile(getUIPath());

    pollResources(mainWindow);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) {
            openExternalLink(url);
        }
        return { action: "deny" };
    });

    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (isAppUrl(url)) return;
        event.preventDefault();
        if (isSafeExternalUrl(url)) {
            openExternalLink(url);
        }
    });

    ipcMainHandle("getStaticData", () => {
        return getStaticData();
    });

    // Handle client events
    ipcMain.on("client-event", (_, event: ClientEvent) => {
        handleClientEvent(event);
    });

    // Handle session title generation
    ipcMainHandle("generate-session-title", async (_event: IpcMainInvokeEvent, userInput: string | null) => {
        return await generateSessionTitle(userInput);
    });

    // Handle recent cwds request
    ipcMainHandle("get-recent-cwds", (_event: IpcMainInvokeEvent, limit?: number) => {
        const boundedLimit = limit ? Math.min(Math.max(limit, 1), 20) : 8;
        return sessions.listRecentCwds(boundedLimit);
    });

    // Handle directory selection
    ipcMainHandle("select-directory", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (result.canceled) {
            return null;
        }

        return result.filePaths[0];
    });

    ipcMainHandle("select-files", async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections']
        });
        if (result.canceled) {
            return null;
        }
        return result.filePaths;
    });

    ipcMainHandle("get-model-settings", () => {
        const configuredModelId = assistantSettings.defaultModel?.trim() || null;
        const currentModelId = configuredModelId || DEFAULT_MODEL_ID;
        return {
            models: availableModels,
            currentModelId,
            configuredModelId,
            environmentModelId: null,
            source: configuredModelId ? "custom" : "default",
            settingsPath: getAssistantSettingsPath()
        };
    });

    ipcMainHandle("set-default-model", (_event: IpcMainInvokeEvent, payload: { modelId: string }) => {
        const modelId = typeof payload?.modelId === "string" ? payload.modelId.trim() : "";
        const valid = availableModels.find((model) => model.id === modelId);
        if (!valid) {
            return { success: false, error: "Unknown model selected." };
        }
        assistantSettings = { ...assistantSettings, defaultModel: modelId };
        saveAssistantSettings(assistantSettings);
        return {
            success: true,
            currentModelId: modelId,
            source: "custom"
        };
    });

    // Text file extensions that can be displayed in the app
    const textExtensions = new Set([
        '.txt', '.md', '.markdown', '.py', '.js', '.ts', '.tsx', '.jsx',
        '.json', '.xml', '.html', '.css', '.scss', '.less', '.yaml', '.yml',
        '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
        '.c', '.cpp', '.h', '.hpp', '.java', '.go', '.rs', '.rb', '.php',
        '.sql', '.graphql', '.vue', '.svelte', '.astro',
        '.env', '.gitignore', '.dockerignore', '.editorconfig',
        '.toml', '.ini', '.cfg', '.conf', '.log', '.csv'
    ]);

    // Image extensions
    const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico']);

    // Excel extensions
    const excelExtensions = new Set(['.xlsx', '.xls', '.xlsm', '.xlsb']);

    // PowerPoint extensions
    const pptExtensions = new Set(['.pptx']);

    // Read file content
    ipcMainHandle("read-file", async (_event: IpcMainInvokeEvent, filePath: string) => {
        try {
            const ext = extname(filePath).toLowerCase();
            const mimeType = getMimeType(ext);

            // Handle text files
            if (textExtensions.has(ext)) {
                const content = await readFile(filePath, 'utf-8');
                return {
                    success: true,
                    content,
                    isText: true,
                    fileType: 'text',
                    mimeType
                };
            }

            // Handle images - return as base64 data URL
            if (imageExtensions.has(ext)) {
                const buffer = await readFile(filePath);
                const base64 = buffer.toString('base64');
                return {
                    success: true,
                    content: `data:${mimeType};base64,${base64}`,
                    isText: false,
                    fileType: 'image',
                    mimeType
                };
            }

            // Handle PDF - return file path for embedding
            if (ext === '.pdf') {
                return {
                    success: true,
                    content: filePath,
                    isText: false,
                    fileType: 'pdf',
                    mimeType
                };
            }

            // Handle Excel files - parse and return as JSON
            if (excelExtensions.has(ext)) {
                const buffer = await readFile(filePath);
                const workbook = XLSX.read(buffer, { type: 'buffer' });
                const sheets: Record<string, unknown[][]> = {};

                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    // Convert to array of arrays (including headers)
                    sheets[sheetName] = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
                }

                return {
                    success: true,
                    content: JSON.stringify(sheets),
                    isText: false,
                    fileType: 'excel',
                    sheetNames: workbook.SheetNames,
                    mimeType
                };
            }

            if (pptExtensions.has(ext)) {
                const slides = await extractPptSlides(filePath);
                return {
                    success: true,
                    content: JSON.stringify(slides),
                    isText: false,
                    fileType: 'ppt',
                    mimeType
                };
            }

            // For other non-text files, indicate they can't be displayed inline
            return {
                success: true,
                isText: false,
                fileType: 'binary',
                mimeType
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: getErrorMessage(error, 'Failed to read file'),
                isText: false,
                fileType: 'unknown'
            };
        }
    });

    // Open file with default system application
    ipcMainHandle("open-file-external", async (_event: IpcMainInvokeEvent, filePath: string) => {
        try {
            const errorMessage = await shell.openPath(filePath);
            if (errorMessage) {
                console.error('Failed to open file externally:', errorMessage);
                return false;
            }
            return true;
        } catch (error) {
            console.error('Failed to open file externally:', error);
            return false;
        }
    });

    ipcMainHandle("open-external-url", async (_event: IpcMainInvokeEvent, url: string) => {
        return await openExternalLink(url);
    });

    // Check if file exists
    ipcMainHandle("file-exists", async (_event: IpcMainInvokeEvent, filePath: string) => {
        try {
            await access(filePath, constants.F_OK);
            return true;
        } catch {
            return false;
        }
    });

    ipcMainHandle("get-kiro-mcp-servers", async () => {
        try {
            const { servers, path } = await loadKiroMcpServers();
            return {
                success: true,
                servers,
                settingsPath: path
            };
        } catch (error: unknown) {
            return {
                success: false,
                servers: {},
                error: getErrorMessage(error, "Failed to load MCP servers"),
                settingsPath: getKiroMcpSettingsPath()
            };
        }
    });

    ipcMainHandle("set-kiro-mcp-disabled", async (_event: IpcMainInvokeEvent, payload: { name: string; disabled: boolean }) => {
        try {
            const name = payload?.name?.trim();
            if (!name) {
                throw new Error("Server name is required.");
            }
            const servers = await setKiroMcpServerDisabled(name, payload?.disabled ?? false);
            return {
                success: true,
                servers,
                settingsPath: getKiroMcpSettingsPath()
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: getErrorMessage(error, "Failed to update MCP server"),
                settingsPath: getKiroMcpSettingsPath()
            };
        }
    });

    ipcMainHandle("run-kiro-command", async (_event: IpcMainInvokeEvent, payload: { cwd: string; command: string }) => {
        const normalizedCwd = normalizeWorkingDirectory(payload?.cwd) ?? process.cwd();
        let command = payload?.command?.trim();
        if (!command) {
            return { success: false, error: "Command is required." };
        }
        if (command.startsWith("/")) {
            command = command.slice(1).trim();
        }
        if (!command) {
            return { success: false, error: "Command is required." };
        }
        const binary = resolveKiroCliBinary();
        if (!binary) {
            return { success: false, error: "kiro-cli is not installed or not found on PATH." };
        }
        try {
            const quotedBinary = binary.includes(" ") ? `"${binary}"` : binary;
            const fullCommand = `${quotedBinary} ${command}`;
            const { stdout, stderr } = await execAsync(fullCommand, {
                cwd: normalizedCwd,
                env: {
                    ...enhancedEnv,
                    NO_COLOR: "1",
                    CLICOLOR: "0",
                    KIRO_CLI_DISABLE_PAGER: "1"
                }
            });
            return { success: true, stdout, stderr };
        } catch (error: unknown) {
            return {
                success: false,
                error: getErrorMessage(error, "Failed to run command"),
                stdout: getCommandErrorStream(error, "stdout"),
                stderr: getCommandErrorStream(error, "stderr")
            };
        }
    });

    ipcMainHandle("copy-files-to-cwd", async (_event: IpcMainInvokeEvent, payload: { cwd: string; files: string[] }) => {
        const normalizedCwd = normalizeWorkingDirectory(payload?.cwd);
        if (!normalizedCwd) {
            return { success: false, error: "Working directory is required." };
        }
        if (!Array.isArray(payload?.files) || payload.files.length === 0) {
            return { success: false, error: "No files selected." };
        }

        const copied: Array<{ source: string; destination: string; filename: string }> = [];
        const failed: Array<{ source: string; error: string }> = [];

        const ensureDestination = async (targetDir: string, filename: string) => {
            let candidate = join(targetDir, filename);
            let name = filename;
            const dotIndex = filename.lastIndexOf(".");
            const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
            const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
            let counter = 1;
            while (true) {
                try {
                    await access(candidate, constants.F_OK);
                    name = `${base} (${counter++})${ext}`;
                    candidate = join(targetDir, name);
                } catch {
                    return { path: candidate, name };
                }
            }
        };

        for (const source of payload.files) {
            try {
                const filename = basename(source);
                const { path: destination, name } = await ensureDestination(normalizedCwd, filename);
                await copyFile(source, destination);
                copied.push({ source, destination, filename: name });
            } catch (error: unknown) {
                failed.push({ source, error: getErrorMessage(error, "Failed to copy") });
            }
        }

        const success = copied.length > 0;
        return {
            success,
            copied,
            failed: failed.length ? failed : undefined,
            error: success ? undefined : (failed[0]?.error ?? "Failed to copy files")
        };
    });

    ipcMainHandle("get-skills", async () => {
        try {
            const fsResult = await loadSkills();
            return {
                success: true,
                user: fsResult.user,
                project: fsResult.project
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: getErrorMessage(error, "Failed to load skills"),
                user: [],
                project: []
            };
        }
    });
})

// Helper function to get MIME type from extension
function getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.markdown': 'text/markdown',
        '.py': 'text/x-python',
        '.js': 'text/javascript',
        '.ts': 'text/typescript',
        '.tsx': 'text/typescript-jsx',
        '.jsx': 'text/javascript-jsx',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.html': 'text/html',
        '.css': 'text/css',
        '.scss': 'text/x-scss',
        '.yaml': 'text/yaml',
        '.yml': 'text/yaml',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function isSafeExternalUrl(url?: string | null): boolean {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
    } catch {
        return false;
    }
}

function isAppUrl(url?: string | null): boolean {
    if (!url) return false;
    return url.startsWith("file://") ||
        url.startsWith("devtools://") ||
        url.startsWith("http://localhost:") ||
        url.startsWith("http://127.0.0.1:");
}

async function openExternalLink(targetUrl?: string | null): Promise<boolean> {
    if (!isSafeExternalUrl(targetUrl)) {
        console.warn("Blocked attempt to open non-http(s) URL:", targetUrl);
        return false;
    }
    try {
        await shell.openExternal(targetUrl!);
        return true;
    } catch (error) {
        console.error("Failed to open external URL:", error);
        return false;
    }
}

type PptSlide = {
    slideNumber: number;
    paragraphs: string[];
};

function extractSlideNumber(name: string): number {
    const match = name.match(/slide(\d+)/i);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function decodeXml(text: string): string {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&#xA;/g, "\n")
        .replace(/&#xD;/g, "\r");
}

function extractParagraphs(xml: string): string[] {
    const paragraphs: string[] = [];
    const paragraphRegex = /<a:p[\s\S]*?<\/a:p>/gi;
    let paragraphMatch: RegExpExecArray | null;

    while ((paragraphMatch = paragraphRegex.exec(xml)) !== null) {
        const block = paragraphMatch[0];
        const textParts: string[] = [];
        const textRegex = /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi;
        let textMatch: RegExpExecArray | null;
        while ((textMatch = textRegex.exec(block)) !== null) {
            textParts.push(decodeXml(textMatch[1]));
        }
        const line = textParts.join("").replace(/\s+/g, " ").trim();
        if (line) paragraphs.push(line);
    }

    if (paragraphs.length === 0) {
        const fallbackMatches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)).map((m) => decodeXml(m[1]).trim());
        return fallbackMatches.filter(Boolean);
    }

    return paragraphs;
}

async function extractPptSlides(filePath: string): Promise<PptSlide[]> {
    const slideEntries: { name: string; data: string }[] = [];

    await new Promise<void>((resolve, reject) => {
        yauzl.open(filePath, { lazyEntries: true }, (err, zip) => {
            if (err || !zip) {
                reject(err ?? new Error("Failed to open presentation"));
                return;
            }

            zip.readEntry();

            zip.on("entry", (entry) => {
                if (!/^ppt\/slides\/slide\d+\.xml$/i.test(entry.fileName)) {
                    zip.readEntry();
                    return;
                }

                zip.openReadStream(entry, (streamErr, stream) => {
                    if (streamErr || !stream) {
                        zip.close();
                        reject(streamErr ?? new Error("Failed to read slide"));
                        return;
                    }
                    const chunks: Buffer[] = [];
                    stream.on("data", (chunk) => chunks.push(chunk));
                    stream.on("end", () => {
                        slideEntries.push({
                            name: entry.fileName,
                            data: Buffer.concat(chunks).toString("utf8")
                        });
                        zip.readEntry();
                    });
                    stream.on("error", (streamError) => {
                        zip.close();
                        reject(streamError);
                    });
                });
            });

            zip.on("end", () => resolve());
            zip.on("error", (zipError) => reject(zipError));
        });
    });

    return slideEntries
        .sort((a, b) => extractSlideNumber(a.name) - extractSlideNumber(b.name))
        .map((entry) => ({
            slideNumber: extractSlideNumber(entry.name),
            paragraphs: extractParagraphs(entry.data)
        }));
}
