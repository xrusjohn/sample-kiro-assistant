import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgUiAdapter } from "./ag-ui-adapter.js";
import { EventType } from "./ag-ui-types.js";
import type { ServerEvent } from "../electron/types.js";

// Deterministic UUIDs for snapshot assertions
let uuidCounter = 0;
vi.mock("node:crypto", () => ({
  default: { randomUUID: () => `uuid-${++uuidCounter}` },
  randomUUID: () => `uuid-${++uuidCounter}`,
}));

const TID = "thread-1";
const RID = "run-1";

function mkStatus(status: string, sessionId = TID): ServerEvent {
  return { type: "session.status", payload: { sessionId, status } } as ServerEvent;
}

function mkStreamEvent(event: Record<string, unknown>): ServerEvent {
  return { type: "stream.message", payload: { sessionId: TID, message: { type: "stream_event", event } } } as ServerEvent;
}

describe("createAgUiAdapter", () => {
  beforeEach(() => { uuidCounter = 0; });

  it("translates running → RUN_STARTED", () => {
    const a = createAgUiAdapter(TID, RID);
    const out = a.translate(mkStatus("running"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: EventType.RUN_STARTED, threadId: TID, runId: RID });
  });

  it("translates idle → RUN_FINISHED", () => {
    const a = createAgUiAdapter(TID, RID);
    const out = a.translate(mkStatus("idle"));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe(EventType.RUN_FINISHED);
  });

  it("translates error → RUN_ERROR with message", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "session.status", payload: { sessionId: TID, status: "error", error: "boom" } } as ServerEvent;
    const out = a.translate(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: EventType.RUN_ERROR, message: "boom" });
  });

  it("RUN_ERROR defaults message when error is missing", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "session.status", payload: { sessionId: TID, status: "error" } } as ServerEvent;
    const out = a.translate(ev);
    expect(out[0]).toMatchObject({ type: EventType.RUN_ERROR, message: "Unknown error" });
  });

  // --- skipFirstIdle ---

  it("skipFirstIdle suppresses first idle, emits second", () => {
    const a = createAgUiAdapter(TID, RID, { skipFirstIdle: true });
    expect(a.translate(mkStatus("idle"))).toHaveLength(0); // suppressed
    const second = a.translate(mkStatus("idle"));
    expect(second).toHaveLength(1);
    expect(second[0].type).toBe(EventType.RUN_FINISHED);
  });

  it("without skipFirstIdle, first idle emits normally", () => {
    const a = createAgUiAdapter(TID, RID);
    expect(a.translate(mkStatus("idle"))).toHaveLength(1);
  });

  // --- Streaming text ---

  it("translates content_block_start/delta/stop → TEXT_MESSAGE lifecycle", () => {
    const a = createAgUiAdapter(TID, RID);
    const start = a.translate(mkStreamEvent({ type: "content_block_start" }));
    expect(start).toHaveLength(1);
    expect(start[0]).toMatchObject({ type: EventType.TEXT_MESSAGE_START, messageId: "uuid-1" });

    const delta = a.translate(mkStreamEvent({ type: "content_block_delta", delta: { text: "hello" } }));
    expect(delta).toHaveLength(1);
    expect(delta[0]).toMatchObject({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: "uuid-1", delta: "hello" });

    const stop = a.translate(mkStreamEvent({ type: "content_block_stop" }));
    expect(stop).toHaveLength(1);
    expect(stop[0]).toMatchObject({ type: EventType.TEXT_MESSAGE_END, messageId: "uuid-1" });
  });

  it("skips empty text deltas", () => {
    const a = createAgUiAdapter(TID, RID);
    a.translate(mkStreamEvent({ type: "content_block_start" }));
    const out = a.translate(mkStreamEvent({ type: "content_block_delta", delta: { text: "" } }));
    expect(out).toHaveLength(0);
  });

  it("ignores delta/stop before any content_block_start", () => {
    const a = createAgUiAdapter(TID, RID);
    expect(a.translate(mkStreamEvent({ type: "content_block_delta", delta: { text: "x" } }))).toHaveLength(0);
    expect(a.translate(mkStreamEvent({ type: "content_block_stop" }))).toHaveLength(0);
  });

  // --- Assistant message snapshot ---

  it("translates final assistant message → MESSAGES_SNAPSHOT", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = {
      type: "stream.message",
      payload: {
        sessionId: TID,
        message: { type: "assistant", message: { id: "msg-1", content: [{ type: "text", text: "hi" }] } } as any,
      },
    };
    const out = a.translate(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ id: "msg-1", role: "assistant", content: "hi" }],
    });
  });

  // --- User prompt echo ---

  it("translates stream.user_prompt → MESSAGES_SNAPSHOT with role user", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "stream.user_prompt", payload: { sessionId: TID, prompt: "do stuff" } };
    const out = a.translate(ev);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: EventType.MESSAGES_SNAPSHOT,
      messages: [{ role: "user", content: "do stuff" }],
    });
  });

  // --- runner.error ---

  it("translates runner.error → RUN_ERROR", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "runner.error", payload: { message: "process died" } };
    const out = a.translate(ev);
    expect(out).toMatchObject([{ type: EventType.RUN_ERROR, message: "process died" }]);
  });

  // --- Metadata ---

  it("translates session.metadata → CUSTOM event", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "session.metadata", payload: { sessionId: TID, creditsUsed: 5 } } as ServerEvent;
    const out = a.translate(ev);
    expect(out).toMatchObject([{ type: EventType.CUSTOM, name: "metadata" }]);
  });

  // --- Unknown / debug events ---

  it("returns empty for debug.acp events", () => {
    const a = createAgUiAdapter(TID, RID);
    const ev: ServerEvent = { type: "debug.acp", payload: { direction: "recv", message: "x", timestamp: 0 } };
    expect(a.translate(ev)).toHaveLength(0);
  });

  it("returns empty for unknown status values", () => {
    const a = createAgUiAdapter(TID, RID);
    expect(a.translate(mkStatus("completed"))).toHaveLength(0);
  });

  // --- Full sequence: simulates a real ACP turn ---

  it("full turn: running → text stream → idle", () => {
    const a = createAgUiAdapter(TID, RID);
    const events = [
      mkStatus("running"),
      mkStreamEvent({ type: "content_block_start" }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "Hello " } }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "world" } }),
      mkStreamEvent({ type: "content_block_stop" }),
      mkStatus("idle"),
    ];
    const all = events.flatMap(e => a.translate(e));
    const types = all.map(e => e.type);
    expect(types).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("full turn with skipFirstIdle: init idle suppressed, real turn works", () => {
    const a = createAgUiAdapter(TID, RID, { skipFirstIdle: true });
    const events = [
      // ACP init phase
      mkStatus("running"),
      mkStatus("idle"),       // ← suppressed
      // Real prompt turn
      mkStatus("running"),
      mkStreamEvent({ type: "content_block_start" }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "hi" } }),
      mkStreamEvent({ type: "content_block_stop" }),
      mkStatus("idle"),       // ← emitted
    ];
    const all = events.flatMap(e => a.translate(e));
    const types = all.map(e => e.type);
    expect(types).toEqual([
      EventType.RUN_STARTED,
      // no RUN_FINISHED here (suppressed)
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });
});
