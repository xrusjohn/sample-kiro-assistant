/**
 * ws-agent-handler.ts — Manages WebSocket connections from remote agents.
 *
 * Remote agents connect to /ws/agent, send agent.register, and receive
 * task.execute events. Results stream back over the same connection.
 */

import type { WebSocket } from "ws";
import type { A2ARegistry } from "./a2a-registry.js";
import type { WsAgentEvent, WsOrchestratorEvent } from "./ws-agent-types.js";
import type { AgentCard, Platform } from "./a2a-types.js";

const REGISTER_TIMEOUT_MS = 10_000;

// instanceId → WebSocket
const agentConnections = new Map<string, WebSocket>();

export function getAgentWs(instanceId: string): WebSocket | undefined {
  return agentConnections.get(instanceId);
}

export function getConnectedAgentIds(): string[] {
  return Array.from(agentConnections.keys());
}

function send(ws: WebSocket, event: WsOrchestratorEvent) {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(event));
}

export function handleAgentConnection(ws: WebSocket, registry: A2ARegistry) {
  let instanceId: string | null = null;

  // Must register within 10s
  const registerTimeout = setTimeout(() => {
    if (!instanceId) {
      console.warn("[ws-agent] Connection timed out waiting for agent.register");
      ws.close(4001, "Registration timeout");
    }
  }, REGISTER_TIMEOUT_MS);

  ws.on("message", (raw) => {
    let event: WsAgentEvent;
    try {
      event = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (event.type === "agent.register" && !instanceId) {
      clearTimeout(registerTimeout);
      const p = event.payload;

      const card: AgentCard = {
        name: p.label || p.profileId,
        description: `Remote WS agent (${p.platform})`,
        version: "1.0.0",
        protocolVersion: "0.3.0",
        preferredTransport: "JSONRPC",
        capabilities: { streaming: true },
        defaultInputModes: ["text"],
        defaultOutputModes: ["text"],
        skills: p.skills || (p.tags || []).map((t: string) => ({ id: t, name: t, tags: [t] } as any)),
        platform: p.platform as Platform,
      };

      const result = registry.registerWs({
        profileId: p.profileId,
        platform: p.platform as Platform,
        card,
        metadata: { binary: p.binary, label: p.label },
      });

      instanceId = result.id;
      agentConnections.set(instanceId, ws);
      console.log(`[ws-agent] Registered: ${p.profileId} (${p.platform}) → ${instanceId.slice(0, 8)}`);
      send(ws, { type: "agent.registered", payload: { instanceId } });
    }

    if (event.type === "agent.heartbeat" && instanceId) {
      registry.heartbeat(instanceId);
      send(ws, { type: "agent.heartbeat.ack", payload: {} });
    }

    // task.stream, task.result, task.error are handled by ws-agent-runner listeners
    // We re-emit them so runners can pick them up
    if (instanceId && (event.type === "task.stream" || event.type === "task.result" || event.type === "task.error")) {
      ws.emit("agent-event", event);
    }
  });

  ws.on("close", () => {
    clearTimeout(registerTimeout);
    if (instanceId) {
      console.log(`[ws-agent] Disconnected: ${instanceId.slice(0, 8)}`);
      agentConnections.delete(instanceId);
      registry.deregister(instanceId);
    }
  });

  ws.on("error", (err) => {
    console.error(`[ws-agent] Error: ${err.message}`);
  });
}
