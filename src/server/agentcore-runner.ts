/**
 * AgentCore Runner — invokes kiro-cli sub-agents via AgentCore Runtime.
 * Unlike the ECS runner (task-driven), this is request-driven:
 * InvokeAgentRuntime proxies each request to the container's A2A adapter.
 * No IP discovery, no direct TCP connection.
 */
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore";
import crypto from "node:crypto";
import type { RunnerHandle } from "./runner.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";
import type { AgentDefinition } from "./agent-registry.js";

interface AgentCoreConfig {
  agentRuntimeArn: string;  // env: AGENTCORE_AGENT_RUNTIME_ARN
  region: string;           // env: AGENTCORE_REGION (default: us-east-1)
}

function loadConfig(): AgentCoreConfig {
  const agentRuntimeArn = process.env.AGENTCORE_AGENT_RUNTIME_ARN;
  if (!agentRuntimeArn) throw new Error("AGENTCORE_AGENT_RUNTIME_ARN is required");
  return {
    agentRuntimeArn,
    region: process.env.AGENTCORE_REGION ?? "us-east-1",
  };
}

export interface AgentCoreRunnerInfo {
  agentRuntimeArn: string;
  containerState: string;
  invocationId: string | null;
  launchedAt: number;
  connectedAt: number | null;
}

const agentCoreRunnerStates = new Map<string, AgentCoreRunnerInfo>();

export function getAgentCoreRunnerInfo(sessionId: string): AgentCoreRunnerInfo | undefined {
  return agentCoreRunnerStates.get(sessionId);
}

type EmitFn = (event: ServerEvent) => void;

// --- A2A SSE → ServerEvent mapping ---

function handleA2AChunk(
  chunk: string,
  sessionId: string,
  session: Session,
  model: string,
  onEvent: EmitFn,
  state: { streaming: boolean; accumulated: string },
) {
  // SSE lines: "event: update\ndata: {...}\n\n"
  for (const line of chunk.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    let payload: any;
    try { payload = JSON.parse(line.slice(6)); } catch { continue; }

    const type = payload.type;

    if (type === "agent_message_chunk" && payload.content?.text) {
      const text = payload.content.text;
      state.accumulated += text;
      if (!state.streaming) {
        state.streaming = true;
        onEvent({ type: "stream.message", payload: { sessionId, message: { type: "stream_event", event: { type: "content_block_start" } } as any } });
      }
      onEvent({ type: "stream.message", payload: { sessionId, message: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } } as any } });
    }

    if (type === "tool_call") {
      const title = payload.title ?? `Using tool: **${payload.toolName ?? "unknown"}**`;
      const text = `\n\n🛠️ ${title}\n`;
      state.accumulated += text;
      onEvent({ type: "stream.message", payload: { sessionId, message: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } } as any } });
    }
  }
}

function finishTurn(
  sessionId: string,
  session: Session,
  model: string,
  onEvent: EmitFn,
  state: { streaming: boolean; accumulated: string },
) {
  if (state.streaming) {
    onEvent({ type: "stream.message", payload: { sessionId, message: { type: "stream_event", event: { type: "content_block_stop" } } as any } });
    state.streaming = false;
  }
  if (state.accumulated) {
    onEvent({
      type: "stream.message",
      payload: {
        sessionId,
        message: {
          type: "assistant",
          message: { id: crypto.randomUUID(), role: "assistant", content: [{ type: "text", text: state.accumulated }] },
          model, session_id: sessionId, uuid: crypto.randomUUID(),
        } as any,
      },
    });
    state.accumulated = "";
  }
  onEvent({ type: "session.status", payload: { sessionId, status: "idle", title: session.title, cwd: session.cwd } });
}

// --- Main: createAgentCoreRunner ---

export function createAgentCoreRunner(opts: {
  session: Session;
  model: string;
  agent: AgentDefinition;
  onEvent: EmitFn;
  onSessionUpdate?: (updates: Partial<Session>) => void;
}): RunnerHandle {
  const { session, model, onEvent } = opts;
  const tag = `agentcore:${session.id.slice(0, 8)}`;

  let config: AgentCoreConfig;
  try {
    config = loadConfig();
  } catch (e: any) {
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: `AgentCore config error: ${e.message}` } });
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: e.message } });
    return { abort() {}, sendPrompt() {}, ready: Promise.reject(e), onClose() {} };
  }

  const client = new BedrockAgentCoreClient({ region: config.region });
  const runtimeSessionId = session.id; // use our session ID as the AgentCore session ID
  let aborted = false;
  const closeCallbacks: Array<(code: number | null) => void> = [];

  const info: AgentCoreRunnerInfo = {
    agentRuntimeArn: config.agentRuntimeArn,
    containerState: "READY",
    invocationId: null,
    launchedAt: Date.now(),
    connectedAt: null,
  };
  agentCoreRunnerStates.set(session.id, info);

  // AgentCore is request-driven — no startup wait needed. Ready immediately.
  const ready = Promise.resolve();

  const sendPrompt = (text: string) => {
    if (aborted) return;

    const streamState = { streaming: false, accumulated: "" };
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "message/stream",
      params: {
        message: {
          role: "user",
          parts: [{ kind: "text", text }],
          messageId: crypto.randomUUID(),
        },
      },
    });

    (async () => {
      try {
        const cmd = new InvokeAgentRuntimeCommand({
          agentRuntimeArn: config.agentRuntimeArn,
          runtimeSessionId,
          payload: payload as any,
        });

        const response = await client.send(cmd);
        info.connectedAt = Date.now();

        // Stream the SSE response
        if (response.response) {
          const decoder = new TextDecoder();
          for await (const chunk of response.response as any) {
            if (aborted) break;
            const text = decoder.decode(chunk instanceof Uint8Array ? chunk : chunk.body ?? chunk, { stream: true });
            handleA2AChunk(text, session.id, session, model, onEvent, streamState);
          }
        }

        if (!aborted) finishTurn(session.id, session, model, onEvent, streamState);
      } catch (e: any) {
        if (!aborted) {
          console.error(`[${tag}] InvokeAgentRuntime failed: ${e.message}`);
          info.containerState = "FAILED";
          onEvent({ type: "runner.error", payload: { sessionId: session.id, message: `AgentCore invocation failed: ${e.message}` } });
          onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: e.message } });
          for (const cb of closeCallbacks) cb(1);
        }
      }
    })();
  };

  return {
    ready,
    sendPrompt,
    abort() {
      if (aborted) return;
      aborted = true;
      info.containerState = "STOPPING";
      agentCoreRunnerStates.delete(session.id);
      for (const cb of closeCallbacks) cb(0);
    },
    onClose(callback: (code: number | null) => void) {
      closeCallbacks.push(callback);
    },
  };
}
