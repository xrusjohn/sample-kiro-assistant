import { useCallback } from "react";
import type { ClientEvent } from "../types";
import { useAppStore } from "../store/useAppStore";
import { PROMPT_SUBMIT_EVENT } from "../constants";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash,Skill";

export type PromptActions = {
  sendPrompt: (text: string) => Promise<void>;
  handleStop: () => void;
  handleStartFromModal: () => void;
  isRunning: boolean;
};

export function usePromptActions(sendEvent: (event: ClientEvent) => void): PromptActions {
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
