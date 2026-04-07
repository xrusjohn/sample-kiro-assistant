/**
 * ws-agent-runner.ts — RunnerHandle that sends tasks to a remote WS agent.
 */

import { randomUUID } from "node:crypto";
import type { RunnerHandle } from "./runner.js";
import type { ServerEvent } from "../electron/types.js";
import { getAgentWs } from "./ws-agent-handler.js";
import type { WsTaskExecuteEvent, WsAgentEvent } from "./ws-agent-types.js";

type EmitFn = (event: ServerEvent) => void;

const TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function createWsAgentRunner(opts: {
  instanceId: string;
  sessionId: string;
  onEvent: EmitFn;
}): RunnerHandle {
  const { instanceId, sessionId, onEvent } = opts;
  let currentTaskId: string | null = null;
  let taskTimeout: ReturnType<typeof setTimeout> | null = null;
  let closeCallbacks: Array<(code: number | null) => void> = [];
  let aborted = false;
  let fullText = "";

  const ws = getAgentWs(instanceId);
  if (!ws) {
    onEvent({ type: "runner.error", payload: { sessionId, message: "WS agent not connected" } });
    return {
      abort: () => {},
      sendPrompt: () => {},
      ready: Promise.reject(new Error("WS agent not connected")),
    };
  }

  const cleanup = (code: number | null = 0) => {
    if (taskTimeout) clearTimeout(taskTimeout);
    currentTaskId = null;
    for (const cb of closeCallbacks) cb(code);
  };

  const onAgentEvent = (event: WsAgentEvent) => {
    if (!currentTaskId) return;

    if (event.type === "task.stream" && event.payload.taskId === currentTaskId) {
      fullText += event.payload.delta;
      onEvent({
        type: "stream.message",
        payload: {
          sessionId,
          message: {
            type: "stream_event",
            event: { type: "content_block_delta", delta: { type: "text_delta", text: event.payload.delta } },
          } as any,
        },
      });
    }

    if (event.type === "task.result" && event.payload.taskId === currentTaskId) {
      const text = event.payload.text || fullText;
      // Emit content_block_stop + assistant message + idle
      onEvent({
        type: "stream.message",
        payload: {
          sessionId,
          message: { type: "stream_event", event: { type: "content_block_stop" } } as any,
        },
      });
      onEvent({
        type: "stream.message",
        payload: {
          sessionId,
          message: {
            type: "assistant",
            message: {
              id: randomUUID(),
              role: "assistant",
              content: [{ type: "text", text }],
            },
          } as any,
        },
      });
      onEvent({ type: "session.status", payload: { sessionId, status: "idle", title: "", cwd: "" } });
      cleanup(0);
    }

    if (event.type === "task.error" && event.payload.taskId === currentTaskId) {
      onEvent({ type: "runner.error", payload: { sessionId, message: event.payload.error } });
      onEvent({ type: "session.status", payload: { sessionId, status: "error", title: "", cwd: "", error: event.payload.error } });
      cleanup(1);
    }
  };

  // Listen for events from this agent's WS connection
  ws.on("agent-event", onAgentEvent);
  ws.on("close", () => {
    if (currentTaskId && !aborted) {
      onEvent({ type: "runner.error", payload: { sessionId, message: "WS agent disconnected" } });
      onEvent({ type: "session.status", payload: { sessionId, status: "error", title: "", cwd: "", error: "Agent disconnected" } });
      cleanup(1);
    }
  });

  return {
    ready: Promise.resolve(),

    sendPrompt(text: string) {
      currentTaskId = randomUUID();
      fullText = "";
      aborted = false;

      // Start streaming indicator
      onEvent({
        type: "stream.message",
        payload: {
          sessionId,
          message: { type: "stream_event", event: { type: "content_block_start" } } as any,
        },
      });

      const executeEvent: WsTaskExecuteEvent = {
        type: "task.execute",
        payload: { taskId: currentTaskId, sessionId, prompt: text },
      };
      ws.send(JSON.stringify(executeEvent));

      // Timeout
      taskTimeout = setTimeout(() => {
        if (currentTaskId) {
          onEvent({ type: "runner.error", payload: { sessionId, message: "WS agent task timed out (5m)" } });
          onEvent({ type: "session.status", payload: { sessionId, status: "error", title: "", cwd: "", error: "Task timeout" } });
          cleanup(1);
        }
      }, TASK_TIMEOUT_MS);
    },

    abort() {
      aborted = true;
      if (currentTaskId) {
        ws.send(JSON.stringify({ type: "task.cancel", payload: { taskId: currentTaskId } }));
      }
      cleanup(null);
    },

    onClose(callback) {
      closeCallbacks.push(callback);
    },
  };
}
