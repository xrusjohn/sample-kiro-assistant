import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentPermissionResult } from "../shared/agent-schema.js";
import { useIPC } from "./hooks/useIPC";
import { useAppStore } from "./store/useAppStore";
import type { PermissionRequest } from "./store/useAppStore";
import type { ServerEvent, CreatedFile, StreamMessage } from "./types";
import { Sidebar } from "./components/Sidebar";
import { StartSessionModal } from "./components/StartSessionModal";
import { PromptInput } from "./components/PromptInput";
import { MessageCard } from "./components/EventCard";
import { FileBar } from "./components/FileBar";
import { FileSidebar } from "./components/FileSidebar";
import MDContent from "./render/markdown";
import { SettingsModal } from "./components/SettingsModal";
import { usePromptActions } from "./hooks/usePromptActions";
import kiroVideo from "../../kiro.mp4";
import AcpDebugPanel from "./components/AcpDebugPanel";
import { AgentsPanel } from "./components/AgentsPanel";
import { onConnectionStatus } from "./api";
import promptStartSound from "./assets/on_it.mp3";
import promptDoneSound from "./assets/done.mp3";
import { PROMPT_SUBMIT_EVENT } from "./constants";

const EMPTY_MESSAGES: StreamMessage[] = [];
const EMPTY_PERMISSION_REQUESTS: PermissionRequest[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function downloadSessionMarkdown(title: string, messages: StreamMessage[]) {
  const lines = [`# ${title || "Kiro Assistant Session"}\n\n_Exported ${new Date().toLocaleString()}_\n\n---\n`];
  const filePromises: Promise<{index: number, html: string}>[] = [];

  for (const msg of messages) {
    if (msg.type === "user_prompt") {
      lines.push(`## 👤 User\n\n${msg.prompt}\n\n---\n`);
    } else if (msg.type === "assistant") {
      const content = (msg as any).message?.content;
      if (!Array.isArray(content)) continue;
      const text = content
        .filter((b: any) => b.type === "text" && b.text)
        .map((b: any) => b.text)
        .join("\n\n");
      if (!text.trim()) continue;
      // Check for widget:html file paths and fetch them
      const fileMatch = text.match(/```widget:html\s*\n(\/[\w\/-]+\.html)\s*\n```/);
      if (fileMatch) {
        const idx = lines.length;
        lines.push(`## 🤖 Assistant\n\n${text}\n\n---\n`); // placeholder
        filePromises.push(
          fetch(`/api/files?path=${encodeURIComponent(fileMatch[1])}`)
            .then(r => r.ok ? r.text() : "")
            .then(html => ({ index: idx, html }))
            .catch(() => ({ index: idx, html: "" }))
        );
      } else {
        lines.push(`## 🤖 Assistant\n\n${text}\n\n---\n`);
      }
    }
  }

  // Replace widget file paths with actual HTML content
  Promise.all(filePromises).then(results => {
    for (const { index, html } of results) {
      if (html) {
        lines[index] = lines[index].replace(
          /```widget:html\s*\n\/[\w\/-]+\.html\s*\n```/,
          `<details><summary>📊 Interactive Widget (open in browser)</summary>\n\n${html}\n\n</details>`
        );
      }
    }
    const md = lines.join("\n");
    const filename = `${(title || "session").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    // Save to workspace for inspection
    fetch("/api/export-session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content: md })
    }).catch(() => {});
    // Browser download
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

async function downloadSessionHtml(title: string) {
  // Grab all stylesheets
  const styles = Array.from(document.styleSheets).map(ss => {
    try { return Array.from(ss.cssRules).map(r => r.cssText).join("\n"); }
    catch { return ""; }
  }).join("\n");

  // Clone the message area
  const msgArea = document.querySelector(".mx-auto.max-w-3xl");
  if (!msgArea) return;
  const clone = msgArea.cloneNode(true) as HTMLElement;

  // Replace iframes with their content
  const iframes = clone.querySelectorAll("iframe");
  for (const iframe of Array.from(iframes)) {
    const src = iframe.getAttribute("src") || "";
    if (src.includes("/api/files")) {
      try {
        const html = await fetch(src).then(r => r.text());
        const wrapper = document.createElement("div");
        wrapper.className = "embedded-widget";
        wrapper.style.cssText = "border:1px solid #ddd;border-radius:12px;overflow:hidden;margin:12px 0";
        wrapper.innerHTML = `<iframe srcdoc="${html.replace(/"/g, "&quot;")}" style="width:100%;height:${iframe.style.height || "500px"};border:0" sandbox="allow-scripts"></iframe>`;
        iframe.parentElement?.replaceChild(wrapper, iframe);
      } catch {}
    }
  }

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>${title || "Kiro Assistant Session"}</title>
<style>${styles}</style>
<style>body{max-width:800px;margin:40px auto;padding:0 20px;background:#faf9f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}</style>
</head><body>
<h1 style="font-size:1.3rem;margin-bottom:4px">${title || "Kiro Assistant Session"}</h1>
<p style="color:#888;font-size:13px">Exported ${new Date().toLocaleString()}</p>
<hr style="margin:16px 0;border:none;border-top:1px solid #ddd">
${clone.innerHTML}
</body></html>`;

  const filename = `${(title || "session").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
  fetch("/api/export-session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content: fullHtml })
  }).catch(() => {});
  const blob = new Blob([fullHtml], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function captureWidgetScreenshot(): Promise<string | null> {
  const html2canvas = (await import("html2canvas")).default;
  const iframes = document.querySelectorAll<HTMLIFrameElement>('iframe[title="HTML Widget"]');
  const iframe = iframes[iframes.length - 1];
  if (!iframe) return null;

  try {
    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc?.body) return null;
    const canvas = await html2canvas(iframeDoc.body, {
      backgroundColor: "#1a1a2e",
      width: iframeDoc.body.scrollWidth,
      height: iframeDoc.body.scrollHeight,
      scale: 2,
    });
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("[screenshot]", e);
    return null;
  }
}

const getPartialMessageContent = (streamEvent: unknown): string => {
  if (!isRecord(streamEvent) || !isRecord(streamEvent.delta)) return "";
  const deltaType = typeof streamEvent.delta.type === "string" ? streamEvent.delta.type : "";
  const realType = deltaType.split("_")[0];
  const payload = streamEvent.delta[realType];
  if (typeof payload === "string") return payload;
  if (isRecord(payload) && typeof payload.text === "string") return payload.text;
  return "";
};

function App() {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const partialMessageRef = useRef("");
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fileBarCollapsed, setFileBarCollapsed] = useState(false);
  const prevFileBarStateRef = useRef<boolean | null>(null);
  const fileBarCollapsedRef = useRef(fileBarCollapsed);
  const spiritVideoRef = useRef<HTMLVideoElement | null>(null);
  const startSoundRef = useRef<HTMLAudioElement | null>(null);
  const doneSoundRef = useRef<HTMLAudioElement | null>(null);
  const wasRunningRef = useRef(false);
  const [spiritActive, setSpiritActive] = useState(false);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const showStartModal = useAppStore((s) => s.showStartModal);
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const commandResult = useAppStore((s) => s.commandResult);
  const setCommandResult = useAppStore((s) => s.setCommandResult);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const debugPanelOpen = useAppStore((s) => s.debugPanelOpen);
  const setDebugPanelOpen = useAppStore((s) => s.setDebugPanelOpen);
  const agentsPanelOpen = useAppStore((s) => s.agentsPanelOpen);
  const setAgentsPanelOpen = useAppStore((s) => s.setAgentsPanelOpen);

  // Connection status
  const [wsStatus, setWsStatus] = useState<"connected" | "reconnecting" | "disconnected">("disconnected");
  useEffect(() => onConnectionStatus(setWsStatus), []);

  // File sidebar state
  const fileSidebarOpen = useAppStore((s) => s.fileSidebarOpen);
  const setFileSidebarOpen = useAppStore((s) => s.setFileSidebarOpen);
  const fileSidebarWidth = useAppStore((s) => s.fileSidebarWidth);
  const setFileSidebarWidth = useAppStore((s) => s.setFileSidebarWidth);
  const openedFile = useAppStore((s) => s.openedFile);
  const setOpenedFile = useAppStore((s) => s.setOpenedFile);
  const fileContent = useAppStore((s) => s.fileContent);
  const setFileContent = useAppStore((s) => s.setFileContent);
  const fileType = useAppStore((s) => s.fileType);
  const setFileType = useAppStore((s) => s.setFileType);
  const fileSheetNames = useAppStore((s) => s.fileSheetNames);
  const setFileSheetNames = useAppStore((s) => s.setFileSheetNames);
  const fileLoading = useAppStore((s) => s.fileLoading);
  const setFileLoading = useAppStore((s) => s.setFileLoading);

  // Handle partial messages from stream events
  const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
    if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

    const streamEvent = partialEvent.payload.message.event;
    const eventType = isRecord(streamEvent) && typeof streamEvent.type === "string" ? streamEvent.type : "";

    if (eventType === "content_block_start") {
      partialMessageRef.current = "";
      setPartialMessage(partialMessageRef.current);
      setShowPartialMessage(true);
    }

    if (eventType === "content_block_delta") {
      partialMessageRef.current += getPartialMessageContent(streamEvent);
      setPartialMessage(partialMessageRef.current);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }

    if (eventType === "content_block_stop") {
      // Keep partial visible — it will be hidden once session goes idle
      // (the final assistant message in the messages array replaces it)
      setShowPartialMessage(false);
    }
  }, []);

  // Combined event handler
  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
    handlePartialMessages(event);

    // Clear partial when final assistant message lands in the store
    if (event.type === 'stream.message') {
      const msg = (event.payload as any)?.message;
      if (msg?.type === 'assistant') {
        partialMessageRef.current = "";
        setPartialMessage("");
      }
    }
  }, [handleServerEvent, handlePartialMessages]);

  const { connected, sendEvent } = useIPC(onEvent);
  const promptActions = usePromptActions(sendEvent);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const messages = activeSession?.messages ?? EMPTY_MESSAGES;
  const permissionRequests = activeSession?.permissionRequests ?? EMPTY_PERMISSION_REQUESTS;
  const isRunning = activeSession?.status === "running";
  const sessionFiles = activeSession?.createdFiles ?? [];
  const createdFiles = sessionFiles.filter((file) => file.kind === "created");
  const accessedFiles = sessionFiles.filter((file) => file.kind === "accessed");

  // Handle file click - open in sidebar
  const handleFileClick = useCallback(async (file: CreatedFile) => {
    setOpenedFile(file);
    setFileSidebarOpen(true);
    setFileLoading(true);
    setFileContent(null);
    setFileType(null);
    setFileSheetNames(undefined);

    try {
      const exists = await window.electron.fileExists(file.path);
      if (!exists) {
        setFileType('unknown');
        setFileContent('__not_found__');
        setFileLoading(false);
        return;
      }
      const result = await window.electron.readFile(file.path);
      if (result.success) {
        setFileContent(result.content || null);
        setFileType(result.fileType || null);
        setFileSheetNames(result.sheetNames);
      } else {
        console.error("Failed to read file:", result.error);
        setFileType('unknown');
      }
    } catch (error) {
      console.error("Error reading file:", error);
      setFileType('unknown');
    } finally {
      setFileLoading(false);
    }
  }, [setOpenedFile, setFileSidebarOpen, setFileLoading, setFileContent, setFileType, setFileSheetNames]);

  // Handle opening file externally
  const handleOpenExternal = useCallback(async (file: CreatedFile) => {
    try {
      await window.electron.openFileExternal(file.path);
    } catch (error) {
      console.error("Error opening file externally:", error);
    }
  }, []);

  // Handle closing file sidebar
  const handleCloseSidebar = useCallback(() => {
    setFileSidebarOpen(false);
    setOpenedFile(null);
    setFileContent(null);
    setFileType(null);
    setFileSheetNames(undefined);
  }, [setFileSidebarOpen, setOpenedFile, setFileContent, setFileType, setFileSheetNames]);

  useEffect(() => {
    if (connected) sendEvent({ type: "session.list" });
  }, [connected, sendEvent]);

  useEffect(() => {
    fileBarCollapsedRef.current = fileBarCollapsed;
  }, [fileBarCollapsed]);

  useEffect(() => {
    if (showSettings) {
      prevFileBarStateRef.current = fileBarCollapsedRef.current;
      setFileBarCollapsed(true);
    } else if (prevFileBarStateRef.current !== null) {
      setFileBarCollapsed(prevFileBarStateRef.current);
      prevFileBarStateRef.current = null;
    }
  }, [showSettings]);

  useEffect(() => {
    const startAudio = new Audio(promptStartSound);
    const doneAudio = new Audio(promptDoneSound);
    startSoundRef.current = startAudio;
    doneSoundRef.current = doneAudio;
    window.playPromptStartCue = () => {
      if (!startAudio) return;
      startAudio.currentTime = 0;
      startAudio.play().catch(() => undefined);
    };
    return () => {
      window.playPromptStartCue = undefined;
    };
  }, []);

  useEffect(() => {
    const handlePromptSubmit = () => {
      setSpiritActive(true);
    };
    window.addEventListener(PROMPT_SUBMIT_EVENT, handlePromptSubmit);
    return () => window.removeEventListener(PROMPT_SUBMIT_EVENT, handlePromptSubmit);
  }, []);

  useEffect(() => {
    if (isRunning) {
      wasRunningRef.current = true;
      setSpiritActive(true);
    } else if (wasRunningRef.current) {
      wasRunningRef.current = false;
      setSpiritActive(false);
      const doneSound = doneSoundRef.current;
      if (doneSound) {
        doneSound.currentTime = 0;
        doneSound.play().catch(() => undefined);
      }
    }
  }, [isRunning]);

  useEffect(() => {
    const video = spiritVideoRef.current;
    if (!video) return;
    if (spiritActive) {
      video.currentTime = 0;
      video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [spiritActive]);

  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partialMessage]);

  const handleNewSession = useCallback(() => {
    useAppStore.getState().setActiveSessionId(null);
    setShowStartModal(true);
  }, [setShowStartModal]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const handlePermissionResult = useCallback((toolUseId: string, result: AgentPermissionResult) => {
    if (!activeSessionId) return;
    sendEvent({ type: "permission.response", payload: { sessionId: activeSessionId, toolUseId, result } });
    resolvePermissionRequest(activeSessionId, toolUseId);
  }, [activeSessionId, sendEvent, resolvePermissionRequest]);

  return (
    <div className="relative flex h-screen bg-surface">
      {!showSettings && (
        <video
          ref={spiritVideoRef}
          src={kiroVideo}
          muted
          loop
          playsInline
          className={`pointer-events-none absolute bottom-6 right-10 z-10 w-44 opacity-90 mix-blend-screen rounded-2xl shadow-lg ${
            spiritActive ? "" : "grayscale opacity-70"
          }`}
        />
      )}
      <Sidebar
        connected={connected}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setShowSettings(true)}
        onToggleDebug={() => setDebugPanelOpen(!debugPanelOpen)}
        debugPanelOpen={debugPanelOpen}
        onToggleAgents={() => setAgentsPanelOpen(!agentsPanelOpen)}
        agentsPanelOpen={agentsPanelOpen}
      />

      <main
        className="flex flex-1 flex-col ml-[280px] bg-surface-cream transition-all duration-200"
        style={{ marginRight: (fileSidebarOpen ? fileSidebarWidth : 0) + (debugPanelOpen ? 420 : 0) + (agentsPanelOpen ? 480 : 0) }}
      >
        {wsStatus === "reconnecting" && (
          <div className="flex items-center justify-center gap-2 bg-amber-100 border-b border-amber-300 px-4 py-1.5 text-xs text-amber-800">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Reconnecting to server…
          </div>
        )}
        <div 
          className="flex items-center justify-between h-12 border-b border-ink-900/10 bg-surface-cream select-none px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div />
          <span className="text-sm font-medium text-ink-700">
            {activeSession?.agentId === "claude-code" ? <span style={{color: "#e67e22"}}>✦</span> : "🤖"}{" "}
            {activeSession?.title || "Kiro Assistant"}
            {activeSession?.agentId && activeSession.agentId !== "kiro" && (
              <span className="ml-2 text-xs font-normal text-purple-600">
                Claude Code
              </span>
            )}
          </span>
          {messages.length > 0 ? (
            <span style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex gap-2">
              <button
                onClick={() => downloadSessionMarkdown(activeSession?.title || "", messages)}
                className="text-xs text-muted hover:text-ink-700 transition-colors cursor-pointer"
                title="Download as Markdown"
              >⬇ .md</button>
              <button
                onClick={() => downloadSessionHtml(activeSession?.title || "")}
                className="text-xs text-muted hover:text-ink-700 transition-colors cursor-pointer"
                title="Download as HTML (high fidelity)"
              >⬇ .html</button>
              <button
                onClick={async () => {
                  const dataUrl = await captureWidgetScreenshot();
                  if (!dataUrl) { alert("No widget to capture"); return; }
                  const filename = `calendar-${Date.now()}.png`;
                  const saveRes = await fetch("/api/save-image", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename, dataUrl })
                  }).then(r => r.json()).catch(() => null);
                  if (!saveRes?.success) { alert("Failed to save screenshot"); return; }
                  sendEvent({ type: "session.continue", payload: { sessionId: activeSessionId!,
                    prompt: `Use a subagent to email ${saveRes.path} to xrusjohn@amazon.com with subject "📅 Calendar View". The subagent should read the PNG, base64-encode it with: base64 -w 0 ${saveRes.path}, then send an email with body: <html><body><img src="data:image/png;base64,BASE64_HERE" style="max-width:100%"></body></html>`
                  }});
                }}
                className="text-xs text-muted hover:text-ink-700 transition-colors cursor-pointer"
                title="Email calendar screenshot"
              >✉ email</button>
            </span>
          ) : <div />}
        </div>

        <div className="flex-1 overflow-y-auto px-8 pb-40 pt-6">
          <div className="mx-auto max-w-3xl">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-lg font-medium text-ink-700">No messages yet</div>
                <p className="mt-2 text-sm text-muted">Start a conversation with Kiro Assistant</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <MessageCard
                  key={idx}
                  message={msg}
                  isLast={idx === messages.length - 1}
                  isRunning={isRunning}
                  permissionRequest={permissionRequests[0]}
                  onPermissionResult={handlePermissionResult}
                />
              ))
            )}

            {/* Partial message display with skeleton loading */}
            {partialMessage && (
            <div className="partial-message">
              <div className="flex items-start gap-3 mt-6">
                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                  <span className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center text-sm">🤖</span>
                </div>
                <div className="min-w-0 flex-1 max-w-[85%]">
                  <div className="rounded-2xl bg-surface-secondary/80 px-5 py-3.5">
                    <MDContent text={partialMessage} />
                  </div>
                </div>
              </div>
              {showPartialMessage && (
                <span className="inline-flex items-center gap-1 ml-12 mt-1 text-ink-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce" style={{animationDelay: '0ms'}} />
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce" style={{animationDelay: '150ms'}} />
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-bounce" style={{animationDelay: '300ms'}} />
                </span>
              )}
            </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <FileBar
          createdFiles={createdFiles}
          accessedFiles={accessedFiles}
          collapsed={fileBarCollapsed}
          onToggleCollapse={() => setFileBarCollapsed((prev) => !prev)}
          onFileClick={handleFileClick}
          onOpenExternal={handleOpenExternal}
        />

        <PromptInput actions={promptActions} />
      </main>

      {fileSidebarOpen && (
        <FileSidebar
          file={openedFile}
          content={fileContent}
          fileType={fileType}
          sheetNames={fileSheetNames}
          loading={fileLoading}
          width={fileSidebarWidth}
          onWidthChange={setFileSidebarWidth}
          onClose={handleCloseSidebar}
          onOpenExternal={handleOpenExternal}
        />
      )}

      {showStartModal && (
        <StartSessionModal
          prompt={prompt}
          pendingStart={pendingStart}
          onPromptChange={setPrompt}
          onStart={promptActions.handleStartFromModal}
          onClose={() => setShowStartModal(false)}
        />
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {globalError && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-error/20 bg-error-light px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm text-error">{globalError}</span>
            <button className="text-error hover:text-error/80" onClick={() => setGlobalError(null)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      {commandResult && (
        <div className="fixed bottom-40 left-1/2 z-50 w-[90%] max-w-3xl -translate-x-1/2 rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase text-muted tracking-wide">Agent command</div>
              <div className="font-mono text-sm text-ink-900">{commandResult.command}</div>
            </div>
            <button className="text-ink-400 hover:text-ink-700" onClick={() => setCommandResult(null)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {commandResult.stdout && (
              <div>
                <div className="text-xs font-semibold text-ink-600">stdout</div>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-surface p-2 text-xs text-ink-800 whitespace-pre-wrap break-words">
                  {commandResult.stdout}
                </pre>
              </div>
            )}
            {commandResult.stderr && (
              <div>
                <div className="text-xs font-semibold text-error">stderr</div>
                <pre className="mt-1 max-h-32 overflow-auto rounded-lg bg-error/10 p-2 text-xs text-error whitespace-pre-wrap break-words">
                  {commandResult.stderr}
                </pre>
              </div>
            )}
            {commandResult.error && (
              <div className="text-sm text-error font-medium">{commandResult.error}</div>
            )}
          </div>
        </div>
      )}
      {debugPanelOpen && <AcpDebugPanel />}
      {agentsPanelOpen && <AgentsPanel />}
    </div>
  );
}

export default App;
