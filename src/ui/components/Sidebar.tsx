import { useMemo, useState, useRef, useEffect } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useAppStore } from "../store/useAppStore";

interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onToggleDebug: () => void;
  debugPanelOpen: boolean;
}

export function Sidebar({
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  onToggleDebug,
  debugPanelOpen
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const formatCwd = (cwd?: string) => {
    if (!cwd) return "Working dir unavailable";
    const parts = cwd.split(/[\\/]+/).filter(Boolean);
    const tail = parts.slice(-2).join("/");
    return `/${tail || cwd}`;
  };

  const sessionList = useMemo(() => {
    const list = Object.values(sessions);
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return list;
  }, [sessions]);

  const handleRename = async (sessionId: string) => {
    const title = renameValue.trim();
    if (!title) { setRenamingId(null); return; }
    try {
      await fetch("/api/rename-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, title })
      });
      // Update local store
      useAppStore.setState((state) => {
        const s = state.sessions[sessionId];
        if (!s) return {};
        return { sessions: { ...state.sessions, [sessionId]: { ...s, title } } };
      });
    } catch { /* ignore */ }
    setRenamingId(null);
  };

  const handleStop = (sessionId: string) => {
    window.electron.sendClientEvent({ type: "session.stop", payload: { sessionId } });
  };

  const openWorkingDirectory = (cwd?: string) => {
    if (!cwd) return;
    try { void window.electron.openFileExternal(cwd); } catch { /* ignore */ }
  };

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col gap-4 border-r border-ink-900/20 bg-surface-secondary px-4 pb-4 pt-12">
      <div 
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />
      <button
        className="w-full rounded-xl border border-ink-900/20 bg-accent/20 px-4 py-2.5 text-sm font-medium text-ink-900 hover:bg-accent/30 hover:border-accent transition-colors"
        onClick={onNewSession}
      >
        + New Task
      </button>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {sessionList.length === 0 && (
          <div className="rounded-xl border border-ink-900/15 bg-surface-tertiary/60 px-4 py-5 text-center text-xs text-muted">
            No sessions yet. Start by sending a prompt.
          </div>
        )}
        {sessionList.map((session) => (
          <div
            key={session.id}
            className={`cursor-pointer rounded-xl border px-2 py-3 text-left transition ${activeSessionId === session.id ? "border-accent/50 bg-accent-subtle/40" : "border-ink-900/15 bg-surface-tertiary/60 hover:bg-surface-tertiary"}`}
            onClick={() => setActiveSessionId(session.id)}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
                {renamingId === session.id ? (
                  <input
                    ref={renameInputRef}
                    className="text-[12px] font-medium bg-transparent border-b border-accent outline-none text-ink-800 w-full"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(session.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className={`text-[12px] font-medium ${session.status === "running" ? "text-info" : session.status === "completed" ? "text-success" : session.status === "error" ? "text-error" : "text-ink-800"}`}>
                    {(() => {
                      const needsAttention = session.status === "running" && session.permissionRequests.length > 0;
                      const dotClass = needsAttention ? "bg-orange-500 animate-pulse" :
                        session.status === "running" ? "bg-emerald-500 animate-pulse" :
                        session.status === "idle" ? "bg-amber-400" :
                        session.status === "error" ? "bg-red-500" :
                        "bg-slate-300";
                      return <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle ${dotClass}`} />;
                    })()}
                    {session.title}
                  </div>
                )}
                <div className="flex items-center justify-between mt-0.5 text-xs text-muted">
                  <span className="truncate">{formatCwd(session.cwd)}</span>
                </div>
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex-shrink-0 rounded-full p-1.5 text-ink-500 hover:bg-surface-tertiary" aria-label="Open session menu" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <circle cx="5" cy="12" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="19" cy="12" r="1.7" />
                    </svg>
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content className="z-50 min-w-[220px] rounded-xl border border-ink-900/10 bg-surface-secondary p-1 shadow-lg" align="center" sideOffset={8}>
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary"
                      onSelect={() => { setRenameValue(session.title); setRenamingId(session.id); }}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                      Rename
                    </DropdownMenu.Item>
                    {session.status === "running" ? (
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary"
                        onSelect={() => handleStop(session.id)}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-warning" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                        Stop
                      </DropdownMenu.Item>
                    ) : (
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary"
                        onSelect={() => setActiveSessionId(session.id)}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4 text-success" fill="currentColor">
                          <polygon points="6,4 20,12 6,20" />
                        </svg>
                        Resume
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary"
                      onSelect={() => openWorkingDirectory(session.cwd)}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      Open Directory
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-ink-900/10" />
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-surface-tertiary"
                      onSelect={() => onDeleteSession(session.id)}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-error/80" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
                      </svg>
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
            debugPanelOpen
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-ink-900/20 bg-surface text-ink-100 hover:border-accent/40 hover:text-accent"
          }`}
          onClick={onToggleDebug}
        >
          🔍 ACP
        </button>
        <button
          className="flex-1 rounded-xl border border-ink-900/20 bg-surface px-4 py-2.5 text-sm font-medium text-ink-100 hover:border-accent/40 hover:text-accent transition-colors"
          onClick={onOpenSettings}
        >
          ⚙️ Settings
        </button>
      </div>
    </aside>
  );
}
