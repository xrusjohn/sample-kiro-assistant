// WS Agent Protocol — event types for remote agents connecting via WebSocket

// ── Agent → Orchestrator ──────────────────────────────────────────────────
export type WsAgentRegisterEvent = {
  type: 'agent.register';
  payload: {
    profileId: string;
    platform: string;
    tags?: string[];
    skills?: Array<{ id: string; name: string; tags?: string[] }>;
    label?: string;
    binary?: string;  // e.g. 'claude-code', 'kiro-cli'
  };
};

export type WsAgentHeartbeatEvent = {
  type: 'agent.heartbeat';
  payload: {};
};

export type WsTaskStreamEvent = {
  type: 'task.stream';
  payload: { taskId: string; delta: string };
};

export type WsTaskResultEvent = {
  type: 'task.result';
  payload: { taskId: string; text: string };
};

export type WsTaskErrorEvent = {
  type: 'task.error';
  payload: { taskId: string; error: string };
};

export type WsAgentEvent =
  | WsAgentRegisterEvent
  | WsAgentHeartbeatEvent
  | WsTaskStreamEvent
  | WsTaskResultEvent
  | WsTaskErrorEvent;

// ── Orchestrator → Agent ──────────────────────────────────────────────────
export type WsAgentRegisteredEvent = {
  type: 'agent.registered';
  payload: { instanceId: string };
};

export type WsHeartbeatAckEvent = {
  type: 'agent.heartbeat.ack';
  payload: {};
};

export type WsTaskExecuteEvent = {
  type: 'task.execute';
  payload: { taskId: string; sessionId: string; prompt: string };
};

export type WsTaskCancelEvent = {
  type: 'task.cancel';
  payload: { taskId: string };
};

export type WsOrchestratorEvent =
  | WsAgentRegisteredEvent
  | WsHeartbeatAckEvent
  | WsTaskExecuteEvent
  | WsTaskCancelEvent;
