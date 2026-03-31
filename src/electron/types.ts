import type { AgentMessage, AgentPermissionResult } from "../shared/agent-schema.js";

export type ClaudeSettingsEnv = {
  ANTHROPIC_AUTH_TOKEN: string;
  ANTHROPIC_BASE_URL: string;
  ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
  ANTHROPIC_DEFAULT_OPUS_MODEL: string;
  ANTHROPIC_DEFAULT_SONNET_MODEL: string;
  ANTHROPIC_MODEL: string;
  API_TIMEOUT_MS: string;
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: string;
};

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
};

export type StreamMessage = AgentMessage | UserPromptMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type AgentInfo = {
  id: string;
  label: string;
  available: boolean;
};

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  kiroConversationId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
  hasRunner?: boolean;
  agentId?: string;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; error?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; messages: StreamMessage[] } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } }
  | { type: "session.metadata"; payload: { sessionId: string; contextUsagePercent?: number; creditsUsed?: number; turnDurationMs?: number } }
  | { type: "debug.acp"; payload: { sessionId?: string; direction: "send" | "recv"; message: string; timestamp: number } }
  | { type: "agents.list"; payload: { agents: AgentInfo[] } }
  | { type: "server.restarting"; payload: { reason: string } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; allowedTools?: string; interactive?: boolean; agentId?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; interactive?: boolean } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: AgentPermissionResult } };
