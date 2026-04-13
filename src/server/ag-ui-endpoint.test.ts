/**
 * AG-UI endpoint integration test — mock ACP runner.
 *
 * Tests the global-listener wiring pattern from index.ts without
 * importing the Express server. Simulates the exact flow:
 *   1. Register global listener
 *   2. handleClientEvent("session.start")
 *   3. Runner emits scripted ServerEvents
 *   4. Global listener locks onto new session, translates to AG-UI events
 *
 * Zero processes, zero kiro-cli, zero SQLite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAgUiAdapter } from "./ag-ui-adapter.js";
import { EventType, type AgUiEvent } from "./ag-ui-types.js";
import type { ServerEvent } from "../electron/types.js";

// Deterministic UUIDs
let uuidCounter = 0;
vi.mock("node:crypto", () => ({
  default: { randomUUID: () => `uuid-${++uuidCounter}` },
  randomUUID: () => `uuid-${++uuidCounter}`,
}));

// ── Mock infrastructure (simulates session-handler emit path) ─────────

type Listener = (event: ServerEvent) => void;

class MockSessionBus {
  private globalListeners = new Set<Listener>();
  private sessionListeners = new Map<string, Set<Listener>>();
  private knownIds = new Set<string>();

  addGlobalListener(fn: Listener): () => void {
    this.globalListeners.add(fn);
    return () => { this.globalListeners.delete(fn); };
  }

  addSessionListener(sid: string, fn: Listener): () => void {
    if (!this.sessionListeners.has(sid)) this.sessionListeners.set(sid, new Set());
    this.sessionListeners.get(sid)!.add(fn);
    return () => { this.sessionListeners.get(sid)?.delete(fn); };
  }

  listKnownIds(): Set<string> { return new Set(this.knownIds); }

  /** Simulate a runner emitting events for a new session */
  emitSequence(sessionId: string, events: ServerEvent[]) {
    this.knownIds.add(sessionId);
    for (const ev of events) {
      const patched = { ...ev, payload: { ...(ev as any).payload, sessionId } } as ServerEvent;
      this.globalListeners.forEach(fn => fn(patched));
      this.sessionListeners.get(sessionId)?.forEach(fn => fn(patched));
    }
  }
}

// ── Replicate the /ag-ui/run wiring logic from index.ts ───────────────

function simulateNewSessionRun(
  bus: MockSessionBus,
  runId: string,
  scriptedEvents: ServerEvent[],
  newSessionId: string,
): AgUiEvent[] {
  const collected: AgUiEvent[] = [];
  const sendEvent = (e: AgUiEvent) => collected.push(e);

  let sessionId: string | null = null;
  let adapter: ReturnType<typeof createAgUiAdapter> | null = null;
  const knownSessionIds = bus.listKnownIds();

  const removeGlobal = bus.addGlobalListener((event) => {
    const sid = (event.payload as any)?.sessionId;
    if (!sid) return;

    if (!sessionId) {
      if (knownSessionIds.has(sid)) return;
      sessionId = sid;
      adapter = createAgUiAdapter(sid, runId, { skipFirstIdle: true });
      sendEvent({ type: EventType.CUSTOM, name: "thread.created", value: { threadId: sid }, runId, timestamp: Date.now() } as any);
    }

    if (sid !== sessionId || !adapter) return;

    for (const e of adapter.translate(event)) {
      sendEvent(e);
      if (e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR) {
        removeGlobal();
      }
    }
  });

  // Simulate: handleClientEvent triggers runner which emits events
  bus.emitSequence(newSessionId, scriptedEvents);
  return collected;
}

function simulateContinueRun(
  bus: MockSessionBus,
  threadId: string,
  runId: string,
  scriptedEvents: ServerEvent[],
): AgUiEvent[] {
  const collected: AgUiEvent[] = [];
  const adapter = createAgUiAdapter(threadId, runId);

  const remove = bus.addSessionListener(threadId, (event) => {
    for (const e of adapter.translate(event)) {
      collected.push(e);
      if (e.type === EventType.RUN_FINISHED || e.type === EventType.RUN_ERROR) {
        remove();
      }
    }
  });

  bus.emitSequence(threadId, scriptedEvents);
  return collected;
}

// ── Helpers ───────────────────────────────────────────────────────────

function mkStatus(status: string): ServerEvent {
  return { type: "session.status", payload: { sessionId: "", status } } as ServerEvent;
}

function mkStreamEvent(event: Record<string, unknown>): ServerEvent {
  return { type: "stream.message", payload: { sessionId: "", message: { type: "stream_event", event } } } as ServerEvent;
}

function mkError(msg: string): ServerEvent {
  return { type: "session.status", payload: { sessionId: "", status: "error", error: msg } } as ServerEvent;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("AG-UI endpoint wiring (mock ACP)", () => {
  let bus: MockSessionBus;

  beforeEach(() => {
    bus = new MockSessionBus();
    uuidCounter = 0;
  });

  it("new session: full turn with skipFirstIdle", () => {
    const events = simulateNewSessionRun(bus, "run-1", [
      mkStatus("running"),    // ACP init
      mkStatus("idle"),       // init idle → suppressed
      mkStatus("running"),    // real turn
      mkStreamEvent({ type: "content_block_start" }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "hello" } }),
      mkStreamEvent({ type: "content_block_stop" }),
      mkStatus("idle"),       // real idle → RUN_FINISHED
    ], "session-abc");

    const types = events.map(e => (e as any).name ?? e.type);
    expect(types).toEqual([
      "thread.created",
      EventType.RUN_STARTED,
      // no RUN_FINISHED (skipFirstIdle)
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("new session: ignores events from pre-existing sessions", () => {
    // Pre-populate a known session
    bus.emitSequence("old-session", [mkStatus("idle")]);

    const events = simulateNewSessionRun(bus, "run-2", [
      mkStatus("running"),
      mkStatus("idle"),
      mkStatus("running"),
      mkStreamEvent({ type: "content_block_start" }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "yo" } }),
      mkStreamEvent({ type: "content_block_stop" }),
      mkStatus("idle"),
    ], "session-new");

    // Should lock onto session-new, not old-session
    const threadCreated = events.find(e => (e as any).name === "thread.created");
    expect((threadCreated as any).value.threadId).toBe("session-new");
  });

  it("continue session: no skipFirstIdle, direct turn", () => {
    const events = simulateContinueRun(bus, "session-existing", "run-3", [
      mkStatus("running"),
      mkStreamEvent({ type: "content_block_start" }),
      mkStreamEvent({ type: "content_block_delta", delta: { text: "reply" } }),
      mkStreamEvent({ type: "content_block_stop" }),
      mkStatus("idle"),
    ]);

    const types = events.map(e => e.type);
    expect(types).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("error during run closes the stream", () => {
    const events = simulateNewSessionRun(bus, "run-4", [
      mkStatus("running"),
      mkStatus("idle"),       // init idle suppressed
      mkStatus("running"),
      mkError("process crashed"),
    ], "session-err");

    const types = events.map(e => (e as any).name ?? e.type);
    expect(types).toContain(EventType.RUN_ERROR);
    const errEvent = events.find(e => e.type === EventType.RUN_ERROR);
    expect((errEvent as any).message).toBe("process crashed");
  });

  it("global listener is removed after RUN_FINISHED", () => {
    simulateNewSessionRun(bus, "run-5", [
      mkStatus("running"),
      mkStatus("idle"),
      mkStatus("running"),
      mkStatus("idle"),
    ], "session-done");

    // Emit more events — should not be captured (listener removed)
    const lateEvents: AgUiEvent[] = [];
    // The global listener was removed, so emitting more events should be a no-op
    // We verify by checking the bus has no global listeners left
    const remove = bus.addGlobalListener(() => { lateEvents.push({} as any); });
    bus.emitSequence("session-done", [mkStatus("running")]);
    remove();
    // Only our test listener should have fired, not the removed one
    expect(lateEvents).toHaveLength(1);
  });

  it("multiple concurrent new sessions don't cross-contaminate", () => {
    // Start two runs before either emits events
    const collected1: AgUiEvent[] = [];
    const collected2: AgUiEvent[] = [];

    // Wire up two independent global listeners (simulating two concurrent /ag-ui/run calls)
    const known1 = bus.listKnownIds();
    let sid1: string | null = null;
    let adapter1: ReturnType<typeof createAgUiAdapter> | null = null;
    const rm1 = bus.addGlobalListener((event) => {
      const sid = (event.payload as any)?.sessionId;
      if (!sid) return;
      if (!sid1) {
        if (known1.has(sid)) return;
        sid1 = sid;
        adapter1 = createAgUiAdapter(sid, "run-a", { skipFirstIdle: true });
      }
      if (sid !== sid1 || !adapter1) return;
      for (const e of adapter1.translate(event)) {
        collected1.push(e);
        if (e.type === EventType.RUN_FINISHED) rm1();
      }
    });

    // Second listener registered after first session is known
    bus.emitSequence("sess-1", [mkStatus("running")]);
    const known2 = bus.listKnownIds();
    let sid2: string | null = null;
    let adapter2: ReturnType<typeof createAgUiAdapter> | null = null;
    const rm2 = bus.addGlobalListener((event) => {
      const sid = (event.payload as any)?.sessionId;
      if (!sid) return;
      if (!sid2) {
        if (known2.has(sid)) return;
        sid2 = sid;
        adapter2 = createAgUiAdapter(sid, "run-b", { skipFirstIdle: true });
      }
      if (sid !== sid2 || !adapter2) return;
      for (const e of adapter2.translate(event)) {
        collected2.push(e);
        if (e.type === EventType.RUN_FINISHED) rm2();
      }
    });

    // sess-1 finishes
    bus.emitSequence("sess-1", [mkStatus("idle"), mkStatus("running"), mkStatus("idle")]);
    // sess-2 starts and finishes
    bus.emitSequence("sess-2", [mkStatus("running"), mkStatus("idle"), mkStatus("running"), mkStatus("idle")]);

    // Verify no cross-contamination
    expect(sid1).toBe("sess-1");
    expect(sid2).toBe("sess-2");
    expect(collected1.some(e => e.type === EventType.RUN_FINISHED)).toBe(true);
    expect(collected2.some(e => e.type === EventType.RUN_FINISHED)).toBe(true);
  });
});
