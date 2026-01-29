import type {
  PermissionResult,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKUserMessage
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Centralized aliases for the agent message schema we surface to the renderer.
 * Keeping the types in one place lets us swap out the underlying implementation
 * (Claude SDK today, Kiro CLI tomorrow) without forcing touch points across the
 * entire codebase.
 */
export type AgentMessage = SDKMessage;
export type AgentAssistantMessage = SDKAssistantMessage;
export type AgentResultMessage = SDKResultMessage;
export type AgentSystemMessage = SDKSystemMessage;
export type AgentUserMessage = SDKUserMessage;
export type AgentPermissionResult = PermissionResult;

export type AgentStreamMessage = AgentMessage | { type: "user_prompt"; prompt: string };
