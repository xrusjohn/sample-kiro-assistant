import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent } from "../types";
import { useAppStore } from "../store/useAppStore";
import { useEffectiveCwd } from "../hooks/useEffectiveCwd";
import { PROMPT_SUBMIT_EVENT } from "../constants";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash,Skill";
const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;

interface PromptInputProps {
  actions: ReturnType<typeof usePromptActions>;
}

export function usePromptActions(sendEvent: (event: ClientEvent) => void) {
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const setPendingStart = useAppStore((state) => state.setPendingStart);
  const setGlobalError = useAppStore((state) => state.setGlobalError);
  const setShowStartModal = useAppStore((state) => state.setShowStartModal);
  const setCommandResult = useAppStore((state) => state.setCommandResult);
  const cliInteractive = useAppStore((state) => state.cliInteractive);
  const startPrompt = useAppStore((state) => state.prompt);
  const setStartPrompt = useAppStore((state) => state.setPrompt);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const isRunning = activeSession?.status === "running";

  const runSlashCommand = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const workingDir = activeSession?.cwd?.trim();
      if (!trimmed) return;
      if (!workingDir) {
        setGlobalError("Start a session before running slash commands.");
        return;
      }
      const payload = trimmed.startsWith("/") ? trimmed.slice(1).trim() : trimmed;
      if (!payload) {
        setGlobalError("Command is empty.");
        return;
      }
      try {
        const result = await window.electron.runKiroCommand({ cwd: workingDir, command: payload });
        setCommandResult({
          command: trimmed,
          stdout: result.stdout,
          stderr: result.stderr,
          error: result.success ? undefined : result.error || "Command failed",
          createdAt: Date.now()
        });
      } catch (error) {
        setCommandResult({
          command: trimmed,
          error: error instanceof Error ? error.message : "Failed to run command",
          createdAt: Date.now()
        });
      }
    },
    [activeSession, setCommandResult, setGlobalError]
  );

  const sendPrompt = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;

      if (prompt.startsWith("/")) {
        await runSlashCommand(prompt);
        return;
      }

      window.playPromptStartCue?.();
      try {
        window.dispatchEvent(new CustomEvent(PROMPT_SUBMIT_EVENT));
      } catch {
        // ignore
      }

      if (!activeSessionId) {
        let title = "";
        try {
          setPendingStart(true);
          title = await window.electron.generateSessionTitle(prompt);
        } catch (error) {
          console.error(error);
          setPendingStart(false);
          setGlobalError("Failed to get session title.");
          return;
        }
        sendEvent({
          type: "session.start",
          payload: { title, prompt, allowedTools: DEFAULT_ALLOWED_TOOLS, interactive: cliInteractive }
        });
      } else {
        if (isRunning) {
          setGlobalError("Session is still running. Please wait for it to finish.");
          return;
        }
        sendEvent({
          type: "session.continue",
          payload: { sessionId: activeSessionId, prompt, interactive: cliInteractive }
        });
      }
    },
    [activeSessionId, cliInteractive, isRunning, runSlashCommand, sendEvent, setGlobalError, setPendingStart]
  );

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent]);

  const handleStartFromModal = useCallback(() => {
    const prompt = startPrompt.trim();
    if (!prompt) {
      setShowStartModal(false);
      return;
    }
    sendPrompt(prompt);
    setStartPrompt("");
    setShowStartModal(false);
  }, [sendPrompt, setShowStartModal, setStartPrompt, startPrompt]);

  return { sendPrompt, handleStop, handleStartFromModal, isRunning };
}

export function PromptInput({ actions }: PromptInputProps) {
  const effectiveCwd = useEffectiveCwd();
  const { sendPrompt, handleStop, isRunning } = actions;
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [uploadMessage, setUploadMessage] = useState<{ text: string; variant: "success" | "error" } | null>(null);

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
      <div className="mx-auto flex w-full max-w-full items-end gap-3 rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-card lg:max-w-3xl">
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${isRunning ? "bg-error text-white hover:bg-error/90" : "bg-accent text-white hover:bg-accent-hover"}`}
            onClick={isRunning ? handleStop : handleSend}
            aria-label={isRunning ? "Stop session" : "Send prompt"}
          >
            {isRunning ? (
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
