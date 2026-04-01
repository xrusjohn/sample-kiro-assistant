import { useMemo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import type { CreatedFile } from "../types";
import { useSendToStore } from "../store/useSendToStore";
import { isTextFile } from "../../shared/send-to-types";

interface FileBarProps {
  createdFiles: CreatedFile[];
  accessedFiles: CreatedFile[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onFileClick: (file: CreatedFile) => void;
  onOpenExternal: (file: CreatedFile) => void;
}

// File type icon mappings
const fileIcons: Record<string, { icon: string; color: string }> = {
  // Documents
  pdf: { icon: "📄", color: "text-red-500" },
  doc: { icon: "📝", color: "text-blue-600" },
  docx: { icon: "📝", color: "text-blue-600" },
  // Spreadsheets
  xls: { icon: "📊", color: "text-green-600" },
  xlsx: { icon: "📊", color: "text-green-600" },
  csv: { icon: "📊", color: "text-green-500" },
  // Presentations
  ppt: { icon: "📽️", color: "text-orange-500" },
  pptx: { icon: "📽️", color: "text-orange-500" },
  // Code files
  py: { icon: "🐍", color: "text-yellow-500" },
  js: { icon: "📜", color: "text-yellow-400" },
  ts: { icon: "📜", color: "text-blue-500" },
  tsx: { icon: "⚛️", color: "text-blue-400" },
  jsx: { icon: "⚛️", color: "text-blue-400" },
  html: { icon: "🌐", color: "text-orange-500" },
  css: { icon: "🎨", color: "text-blue-400" },
  json: { icon: "{ }", color: "text-yellow-600" },
  // Text files
  txt: { icon: "📄", color: "text-gray-500" },
  md: { icon: "📑", color: "text-gray-600" },
  markdown: { icon: "📑", color: "text-gray-600" },
  // Config files
  yaml: { icon: "⚙️", color: "text-purple-500" },
  yml: { icon: "⚙️", color: "text-purple-500" },
  toml: { icon: "⚙️", color: "text-gray-600" },
  ini: { icon: "⚙️", color: "text-gray-500" },
  // Images
  png: { icon: "🖼️", color: "text-purple-400" },
  jpg: { icon: "🖼️", color: "text-purple-400" },
  jpeg: { icon: "🖼️", color: "text-purple-400" },
  gif: { icon: "🖼️", color: "text-purple-400" },
  svg: { icon: "🖼️", color: "text-orange-400" },
  // Other
  sh: { icon: "💻", color: "text-green-500" },
  bash: { icon: "💻", color: "text-green-500" },
  sql: { icon: "🗃️", color: "text-blue-500" },
  default: { icon: "📄", color: "text-gray-400" }
};

function getFileIcon(extension: string): { icon: string; color: string } {
  return fileIcons[extension.toLowerCase()] || fileIcons.default;
}

// Files that can be previewed in the sidebar
const previewableExtensions = new Set([
  // Text/code files
  "txt", "md", "markdown", "py", "js", "ts", "tsx", "jsx",
  "json", "xml", "html", "css", "scss", "less", "yaml", "yml",
  "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
  "c", "cpp", "h", "hpp", "java", "go", "rs", "rb", "php",
  "sql", "graphql", "vue", "svelte", "astro",
  "env", "gitignore", "dockerignore", "editorconfig",
  "toml", "ini", "cfg", "conf", "log", "csv",
  // Images
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
  // Documents
  "pdf",
  // Spreadsheets
  "xlsx", "xls", "xlsm", "xlsb"
]);

function isPreviewable(extension: string): boolean {
  return previewableExtensions.has(extension.toLowerCase());
}

function FileChip({
  file,
  onFileClick,
  onOpenExternal
}: {
  file: CreatedFile;
  onFileClick: (file: CreatedFile) => void;
  onOpenExternal: (file: CreatedFile) => void;
}) {
  const { icon, color } = getFileIcon(file.extension);
  const canPreview = isPreviewable(file.extension);
  const destinations = useSendToStore((s) => s.destinations);
  const openMenu = useSendToStore((s) => s.openMenu);
  const selectDestination = useSendToStore((s) => s.selectDestination);
  const fileIsText = isTextFile(file.extension);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          key={file.path}
          className="group relative flex items-center gap-1.5 rounded-lg border border-ink-900/10 bg-surface-secondary px-2.5 py-1.5 hover:border-accent/30 hover:bg-accent-subtle transition-colors cursor-pointer"
          onClick={() => canPreview ? onFileClick(file) : onOpenExternal(file)}
          title={canPreview ? file.path : `${file.path} (click to open in default app)`}
        >
          <span className={`text-base ${color}`}>{icon}</span>
          <span className="text-xs font-medium text-ink-700 max-w-[140px] truncate">
            {file.name}
          </span>
          <button
            className="ml-1 rounded p-0.5 text-ink-400 hover:text-ink-600 hover:bg-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onOpenExternal(file);
            }}
            title="Open in default app"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-[180px] rounded-xl border border-ink-900/10 bg-surface-secondary p-1 shadow-lg">
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary" onSelect={() => onFileClick(file)}>
            📄 Open
          </ContextMenu.Item>
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary" onSelect={() => window.open(`/api/files/preview?path=${encodeURIComponent(file.path)}`, "_blank")}>
            👁 Preview
          </ContextMenu.Item>
          <ContextMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary" onSelect={() => window.open(`/api/files/download?path=${encodeURIComponent(file.path)}`, "_blank")}>
            ⬇ Download
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-ink-900/10" />
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary">
              📤 Send To <span className="text-muted">▸</span>
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="z-50 min-w-[180px] rounded-xl border border-ink-900/10 bg-surface-secondary p-1 shadow-lg">
                {destinations.map((dest) => {
                  const supported = dest.supportedFileTypes === "all" || (dest.supportedFileTypes === "text" && fileIsText);
                  return (
                    <ContextMenu.Item
                      key={dest.id}
                      disabled={!supported}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary disabled:opacity-40"
                      onSelect={() => { openMenu(file); selectDestination(dest.id); }}
                    >
                      {dest.icon} {dest.label}
                    </ContextMenu.Item>
                  );
                })}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Section({
  title,
  files,
  onFileClick,
  onOpenExternal
}: {
  title: string;
  files: CreatedFile[];
  onFileClick: (file: CreatedFile) => void;
  onOpenExternal: (file: CreatedFile) => void;
}) {
  if (files.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{title}</div>
      <div className="flex flex-wrap gap-2 overflow-x-auto max-h-32 pr-1">
        {files.map((file) => (
          <FileChip key={file.path} file={file} onFileClick={onFileClick} onOpenExternal={onOpenExternal} />
        ))}
      </div>
    </div>
  );
}

export function FileBar({
  createdFiles,
  accessedFiles,
  collapsed,
  onToggleCollapse,
  onFileClick,
  onOpenExternal
}: FileBarProps) {
  const sortedCreated = useMemo(
    () => [...createdFiles].sort((a, b) => b.createdAt - a.createdAt),
    [createdFiles]
  );
  const sortedAccessed = useMemo(
    () => [...accessedFiles].sort((a, b) => b.createdAt - a.createdAt),
    [accessedFiles]
  );

  const total = sortedCreated.length + sortedAccessed.length;
  if (total === 0) {
    return null;
  }

  if (collapsed) {
    return (
      <div className="fixed bottom-[88px] left-0 right-0 px-4 z-30 lg:ml-[280px]">
        <div className="mx-auto max-w-3xl flex justify-end">
          <button
            className="rounded-full bg-surface-secondary/80 px-3 py-1 text-xs font-medium text-ink-700 border border-ink-900/10 shadow-sm hover:bg-surface-secondary transition-colors"
            onClick={onToggleCollapse}
          >
            Show files ({total})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-[88px] left-0 right-0 px-4 z-30 lg:ml-[280px]">
      <div className="mx-auto max-w-3xl rounded-2xl border border-ink-900/10 bg-surface-cream/95 backdrop-blur-sm px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-800 uppercase tracking-wide">Files</span>
            <span className="text-[11px] text-muted">{total} total</span>
          </div>
          <button
            className="text-xs text-muted hover:text-ink-700"
            onClick={onToggleCollapse}
          >
            Hide
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-4">
          <Section
            title="Accessed Files"
            files={sortedAccessed}
            onFileClick={onFileClick}
            onOpenExternal={onOpenExternal}
          />
          <Section
            title="Created Files"
            files={sortedCreated}
            onFileClick={onFileClick}
            onOpenExternal={onOpenExternal}
          />
        </div>
      </div>
    </div>
  );
}
