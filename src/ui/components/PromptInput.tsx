import { useCallback, useEffect, useRef, useState } from "react";
import { useEffectiveCwd } from "../hooks/useEffectiveCwd";
import { useAppStore } from "../store/useAppStore";
import type { PromptActions } from "../hooks/usePromptActions";

const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;

interface PromptInputProps {
  actions: PromptActions;
}

export function PromptInput({ actions }: PromptInputProps) {
  const effectiveCwd = useEffectiveCwd();
  const { sendPrompt, handleStop, isRunning, isConnecting } = actions;
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [uploadMessage, setUploadMessage] = useState<{ text: string; variant: "success" | "error" } | null>(null);
  const [modelLabel, setModelLabel] = useState("");

  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const activeSession = useAppStore((s) => activeSessionId ? s.sessions[activeSessionId] : undefined);
  const sessionCwd = activeSession?.cwd;
  const contextPercent = activeSession?.contextUsagePercent;
  const creditsUsed = activeSession?.creditsUsed;

  useEffect(() => {
    fetch("/api/model-settings").then(r => r.json()).then(d => {
      const m = d.models?.find((m: any) => m.id === d.currentModelId);
      setModelLabel(m?.label ?? d.currentModelId ?? "");
    }).catch(() => {});
  }, []);

  const formatCwd = (cwd?: string) => {
    if (!cwd) return "";
    const home = "/home/";
    const idx = cwd.indexOf(home);
    if (idx >= 0) {
      const afterHome = cwd.slice(idx + home.length);
      const slash = afterHome.indexOf("/");
      return slash >= 0 ? "~" + afterHome.slice(slash) : "~";
    }
    return cwd;
  };

  const contextIcon = (pct?: number) => {
    if (pct == null) return "○";
    if (pct < 25) return "◔";
    if (pct < 50) return "◑";
    if (pct < 75) return "◕";
    return "●";
  };

  const handleUpload = useCallback(async () => {
    setUploadMessage(null);
    const cwd = effectiveCwd?.trim();
    if (!cwd) {
      setUploadMessage({ text: "Start a session before uploading files.", variant: "error" });
      return;
    }
    const selected = await window.electron.selectFiles();
    if (!selected || selected.length === 0) return;
    const result = await window.electron.copyFilesToCwd({ cwd, files: selected });
    if (!result.success) {
      setUploadMessage({ text: result.error || "Failed to copy files.", variant: "error" });
      return;
    }
    const names = (result.copied ?? []).map((f) => f.filename).join(", ");
    const summary = result.copied?.length
      ? `Added ${result.copied.length} file${result.copied.length > 1 ? "s" : ""}${names ? `: ${names}` : ""}`
      : "Files copied.";
    const failures = result.failed ?? [];
    const hasFailures = failures.length > 0;
    setUploadMessage({
      text: hasFailures ? `${summary} (${failures.length} failed)` : summary,
      variant: hasFailures ? "error" : "success"
    });
  }, [effectiveCwd]);

  const handleSend = useCallback(async () => {
    if (!prompt.trim()) return;
    await sendPrompt(prompt);
    setPrompt("");
  }, [prompt, sendPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isConnecting) return;
    if (isRunning) {
      handleStop();
      return;
    }
    handleSend();
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  };

  useEffect(() => {
    if (!promptRef.current) return;
    promptRef.current.style.height = "auto";
    const scrollHeight = promptRef.current.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      promptRef.current.style.height = `${MAX_HEIGHT}px`;
      promptRef.current.style.overflowY = "auto";
    } else {
      promptRef.current.style.height = `${scrollHeight}px`;
      promptRef.current.style.overflowY = "hidden";
    }
  }, [prompt]);

  return (
    <section className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-surface via-surface to-transparent pb-6 px-2 lg:pb-8 pt-8 lg:ml-[280px]">
      <div className="relative mx-auto flex w-full max-w-full items-end gap-3 rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-card lg:max-w-3xl">
        {(modelLabel || sessionCwd) && (
          <div className="absolute -top-5 left-0 right-0 flex justify-center">
            <div className="flex items-center gap-2 text-[11px] text-muted font-mono">
              {modelLabel && <span className="text-ink-500">Kiro · {modelLabel}</span>}
              {contextPercent != null && <span title={`Context: ${contextPercent}%`}>{contextIcon(contextPercent)} {contextPercent}%</span>}
              {creditsUsed != null && <span title="Credits used this session">💰 {creditsUsed}</span>}
              {sessionCwd && <span className="text-ink-400">{formatCwd(sessionCwd)}</span>}
            </div>
          </div>
        )}
        <textarea
          rows={1}
          className="flex-1 resize-none bg-transparent py-1.5 text-sm text-ink-800 placeholder:text-muted focus:outline-none"
          style={{ fontFamily: '"Calibri", "Söhne", ui-sans-serif, system-ui, -apple-system, sans-serif' }}
          placeholder="Describe what you want agent to handle..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          ref={promptRef}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-900/20 text-ink-600 hover:bg-ink-900/5"
            onClick={handleUpload}
            title="Upload files into working directory"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 7h16v13H4z" />
              <path d="M12 4v8" />
              <path d="m8 8 4-4 4 4" />
            </svg>
          </button>
          <button
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${isConnecting ? "bg-amber-400 text-white cursor-wait" : isRunning ? "bg-error text-white hover:bg-error/90" : "bg-accent text-white hover:bg-accent-hover"}`}
            onClick={isConnecting ? undefined : isRunning ? handleStop : handleSend}
            disabled={isConnecting}
            aria-label={isConnecting ? "Connecting..." : isRunning ? "Stop session" : "Send prompt"}
          >
            {isConnecting ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42" strokeLinecap="round" /></svg>
            ) : isRunning ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z" fill="currentColor" /></svg>
            )}
          </button>
        </div>
      </div>
      {uploadMessage && (
        <div className={`mx-auto mt-2 max-w-3xl text-xs ${uploadMessage.variant === "error" ? "text-error" : "text-success"}`}>
          {uploadMessage.text}
        </div>
      )}
    </section>
  );
}
