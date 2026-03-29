import { useEffect, useRef } from "react";
import { useAppStore, type AcpDebugEntry } from "../store/useAppStore";

function formatTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

function DebugEntry({ entry }: { entry: AcpDebugEntry }) {
  const isSend = entry.direction === "send";
  return (
    <div className={`px-3 py-1.5 font-mono text-xs border-b border-ink-900/5 ${isSend ? "bg-blue-50/50" : "bg-green-50/50"}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`font-bold ${isSend ? "text-blue-600" : "text-green-600"}`}>
          {isSend ? "▶ SEND" : "◀ RECV"}
        </span>
        <span className="text-ink-400">{formatTime(entry.timestamp)}</span>
      </div>
      <pre className="whitespace-pre-wrap break-all text-ink-700 leading-relaxed">{entry.message}</pre>
    </div>
  );
}

export default function AcpDebugPanel() {
  const debugLog = useAppStore((s) => s.acpDebugLog);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);
  const clearLog = useAppStore((s) => s.clearAcpDebugLog);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const sessions = useAppStore((s) => s.sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const kiroId = activeSession?.kiroConversationId;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debugLog.length]);

  return (
    <div className="fixed top-0 right-0 bottom-0 z-40 flex flex-col bg-surface border-l border-ink-900/20 shadow-lg"
         style={{ width: "420px" }}>
      <div className="flex items-center justify-between px-4 py-2 bg-ink-900/5 border-b border-ink-900/10 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-ink-700 uppercase tracking-wide">ACP Debug</span>
          <span className="text-xs text-ink-400">{debugLog.length} messages</span>
        </div>
        <div className="flex items-center gap-2">
          {kiroId && (
            <button onClick={() => navigator.clipboard.writeText(kiroId)}
              title={kiroId}
              className="text-xs text-ink-400 hover:text-ink-700 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-ink-900/5 font-mono truncate max-w-[140px]">
              📋 {kiroId.slice(0, 8)}…
            </button>
          )}
          <button onClick={clearLog}
            className="text-xs text-ink-400 hover:text-ink-700 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-ink-900/5">
            Clear
          </button>
          <button onClick={() => setDebugPanelOpen(false)}
            className="text-ink-400 hover:text-ink-700 transition-colors cursor-pointer p-1 rounded hover:bg-ink-900/5">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {debugLog.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-ink-400">
            No ACP messages yet. Start or continue a session to see traffic.
          </div>
        ) : (
          debugLog.map((entry, i) => <DebugEntry key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
