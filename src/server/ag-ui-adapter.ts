/**
 * AG-UI Adapter — translates internal ServerEvents to AG-UI BaseEvents.
 *
 * Usage: wrap the orchestrator's emit function so each internal event
 * also produces zero or more AG-UI events sent to the SSE stream.
 */

import { EventType, type AgUiEvent } from "./ag-ui-types.js";
import type { ServerEvent } from "../electron/types.js";
import crypto from "node:crypto";

/** Stateful adapter for one run (one prompt → response cycle). */
export function createAgUiAdapter(threadId: string, runId: string) {
  let currentMessageId: string | null = null;

  /** Translate a ServerEvent into AG-UI events (0 or more). */
  function translate(event: ServerEvent): AgUiEvent[] {
    const ts = Date.now();
    const base = { threadId, runId, timestamp: ts };

    // --- Session status ---
    if (event.type === "session.status") {
      const { status, error } = event.payload;
      if (status === "running") return [{ ...base, type: EventType.RUN_STARTED }];
      if (status === "idle")    return [{ ...base, type: EventType.RUN_FINISHED }];
      if (status === "error")   return [{ ...base, type: EventType.RUN_ERROR, message: error || "Unknown error" }];
      return [];
    }

    // --- Streaming messages ---
    if (event.type === "stream.message") {
      const msg = event.payload.message as any;

      // stream_event wrapper (from ACP runner)
      if (msg?.type === "stream_event") {
        const ev = msg.event;
        if (ev?.type === "content_block_start") {
          currentMessageId = crypto.randomUUID();
          return [{ ...base, type: EventType.TEXT_MESSAGE_START, messageId: currentMessageId }];
        }
        if (ev?.type === "content_block_delta" && currentMessageId) {
          const delta = ev.delta?.text || "";
          if (!delta) return [];
          return [{ ...base, type: EventType.TEXT_MESSAGE_CONTENT, messageId: currentMessageId, delta }];
        }
        if (ev?.type === "content_block_stop" && currentMessageId) {
          const id = currentMessageId;
          currentMessageId = null;
          return [{ ...base, type: EventType.TEXT_MESSAGE_END, messageId: id }];
        }
      }

      // Final assistant message (for persistence / snapshot)
      if (msg?.type === "assistant" && msg.message?.content) {
        const text = msg.message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
        return [{
          ...base,
          type: EventType.MESSAGES_SNAPSHOT,
          messages: [{ id: msg.message.id || crypto.randomUUID(), role: "assistant", content: text }],
        }];
      }

      return [];
    }

    // --- User prompt echo ---
    if (event.type === "stream.user_prompt") {
      return [{
        ...base,
        type: EventType.MESSAGES_SNAPSHOT,
        messages: [{ id: crypto.randomUUID(), role: "user", content: event.payload.prompt }],
      }];
    }

    // --- Errors ---
    if (event.type === "runner.error") {
      return [{ ...base, type: EventType.RUN_ERROR, message: event.payload.message }];
    }

    // --- Metadata (credits, context %) ---
    if (event.type === "session.metadata") {
      return [{ ...base, type: EventType.CUSTOM, name: "metadata", value: event.payload }];
    }

    // --- Debug (optional, only if consumer wants it) ---
    if (event.type === "debug.acp") {
      return []; // skip debug events in AG-UI stream
    }

    return [];
  }

  return { translate };
}
