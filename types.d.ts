type Statistics = {
    cpuUsage: number;
    ramUsage: number;
    storageData: number;
}

type StaticData = {
    totalStorage: number;
    cpuModel: string;
    totalMemoryGB: number;
}

type UnsubscribeFunction = () => void;

type FileReadResult = {
    success: boolean;
    content?: string;
    error?: string;
    isText: boolean;
    mimeType?: string;
    fileType?: 'text' | 'image' | 'pdf' | 'excel' | 'ppt' | 'binary' | 'unknown';
    sheetNames?: string[];
}

type McpServersMap = import("./src/shared/mcp").McpServersMap;

type KiroMcpServersResponse = {
    success: boolean;
    servers: McpServersMap;
    error?: string;
    settingsPath: string;
}

type ToggleKiroMcpPayload = {
    name: string;
    disabled: boolean;
}

type ToggleKiroMcpResult = {
    success: boolean;
    error?: string;
    settingsPath: string;
    servers?: McpServersMap;
}

type FileSelectionResult = string[] | null;

type CopyFilesPayload = {
    cwd: string;
    files: string[];
};

type CopyFilesResult = {
    success: boolean;
    copied?: Array<{ source: string; destination: string; filename: string }>;
    failed?: Array<{ source: string; error: string }>;
    error?: string;
};

type KiroCommandPayload = {
    cwd: string;
    command: string;
}

type KiroCommandResult = {
    success: boolean;
    stdout?: string;
    stderr?: string;
    error?: string;
}

type SkillInfo = import("./src/shared/skills").SkillInfo;

type SkillsResponse = {
    success: boolean;
    user: SkillInfo[];
    project: SkillInfo[];
    error?: string;
}

declare module "qrcode-terminal" {
    type ErrorLevel = "L" | "M" | "Q" | "H";
    interface GenerateOptions {
        small?: boolean;
    }
    interface QRCodeTerminal {
        generate(text: string, opts?: GenerateOptions, callback?: (qr: string) => void): void;
        setErrorLevel(level: ErrorLevel): void;
    }
    const qrcode: QRCodeTerminal;
    export default qrcode;
}

type EventPayloadMapping = {
    statistics: Statistics;
    getStaticData: StaticData;
    "generate-session-title": string;
    "get-recent-cwds": string[];
    "select-directory": string | null;
    "read-file": FileReadResult;
    "open-file-external": boolean;
    "open-external-url": boolean;
    "file-exists": boolean;
    "get-kiro-mcp-servers": KiroMcpServersResponse;
    "set-kiro-mcp-disabled": ToggleKiroMcpResult;
    "select-files": FileSelectionResult;
    "copy-files-to-cwd": CopyFilesResult;
    "run-kiro-command": KiroCommandResult;
    "get-skills": SkillsResponse;
}

interface Window {
    electron: {
        subscribeStatistics: (callback: (statistics: Statistics) => void) => UnsubscribeFunction;
        getStaticData: () => Promise<StaticData>;
        // Claude Agent IPC APIs
        sendClientEvent: (event: any) => void;
        onServerEvent: (callback: (event: any) => void) => UnsubscribeFunction;
        generateSessionTitle: (userInput: string | null) => Promise<string>;
        getRecentCwds: (limit?: number) => Promise<string[]>;
        selectDirectory: () => Promise<string | null>;
        selectFiles: () => Promise<FileSelectionResult>;
        // File operations
        readFile: (filePath: string) => Promise<FileReadResult>;
        openFileExternal: (filePath: string) => Promise<boolean>;
        openExternalUrl: (url: string) => Promise<boolean>;
        fileExists: (filePath: string) => Promise<boolean>;
        getKiroMcpServers: () => Promise<KiroMcpServersResponse>;
        setKiroMcpDisabled: (payload: ToggleKiroMcpPayload) => Promise<ToggleKiroMcpResult>;
        runKiroCommand: (payload: KiroCommandPayload) => Promise<KiroCommandResult>;
        copyFilesToCwd: (payload: CopyFilesPayload) => Promise<CopyFilesResult>;
        getSkills: () => Promise<SkillsResponse>;
    }
}
