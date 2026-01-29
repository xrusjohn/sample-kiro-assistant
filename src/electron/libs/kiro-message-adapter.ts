import { randomUUID } from "node:crypto";
import type { AgentMessage } from "../../shared/agent-schema.js";
import type { StreamMessage, UserPromptMessage } from "../types.js";
import type { KiroHistoryEntry } from "./kiro-conversation.js";

type ToolUseRecord = {
  id?: string;
  name?: string;
  orig_name?: string;
  args?: Record<string, unknown>;
  orig_args?: Record<string, unknown>;
};

type ToolUseResultsRecord = {
  tool_use_id?: string;
  content?: unknown;
  status?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
};

const normalizeTextBlocks = (value: unknown): Array<{ type: "text"; text: string }> => {
  if (value === null || value === undefined) {
    return [{ type: "text", text: "" }];
  }
  if (typeof value === "string") {
    return [{ type: "text", text: value }];
  }
  if (Array.isArray(value)) {
    const flattened: string[] = [];
    for (const item of value) {
      if (!item) continue;
      if (typeof item === "string") {
        flattened.push(item);
        continue;
      }
      if (typeof item === "object" && "Text" in item && typeof (item as Record<string, unknown>).Text === "string") {
        flattened.push(String((item as Record<string, unknown>).Text));
        continue;
      }
      if (typeof item === "object" && "text" in item && typeof (item as Record<string, unknown>).text === "string") {
        flattened.push(String((item as Record<string, unknown>).text));
        continue;
      }
      flattened.push(JSON.stringify(item));
    }
    if (flattened.length === 0) {
      return [{ type: "text", text: "" }];
    }
    return flattened.map((text) => ({ type: "text", text }));
  }
  if (typeof value === "object") {
    if ("stdout" in (value as Record<string, unknown>) || "stderr" in (value as Record<string, unknown>)) {
      const stdout = (value as Record<string, unknown>).stdout;
      const stderr = (value as Record<string, unknown>).stderr;
      const lines: string[] = [];
      if (typeof stdout === "string" && stdout.trim()) lines.push(`Stdout:\n${stdout}`);
      if (typeof stderr === "string" && stderr.trim()) lines.push(`Stderr:\n${stderr}`);
      if (lines.length === 0) {
        return [{ type: "text", text: JSON.stringify(value, null, 2) }];
      }
      return lines.map((text) => ({ type: "text", text }));
    }
    if ("Text" in (value as Record<string, unknown>)) {
      return [{ type: "text", text: String((value as Record<string, unknown>).Text) }];
    }
  }
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
};

type AgentUuid = `${string}-${string}-${string}-${string}-${string}`;

const coerceUuid = (candidate?: string): AgentUuid => {
  if (candidate && candidate.trim()) {
    return candidate as AgentUuid;
  }
  return randomUUID() as AgentUuid;
};

const buildAssistantMessage = (params: {
  conversationId: string;
  messageId?: string;
  content: Array<{ type: string; [key: string]: unknown }>;
}): AgentMessage => {
  const uuid = coerceUuid(params.messageId);
  return {
    type: "assistant",
    message: {
      id: uuid,
      role: "assistant",
      content: params.content
    } as any,
    parent_tool_use_id: null,
    uuid,
    session_id: params.conversationId
  };
};

const buildUserToolResultMessage = (params: {
  conversationId: string;
  messageId?: string;
  results: ToolUseResultsRecord[];
}): AgentMessage => {
  const uuid = coerceUuid(params.messageId);
  const content = params.results.map((result) => ({
    type: "tool_result",
    tool_use_id: result.tool_use_id ?? randomUUID(),
    content: normalizeTextBlocks(result.content),
    is_error: Boolean(result.status && result.status.toLowerCase() === "error")
  }));
  return {
    type: "user",
    message: {
      id: uuid,
      role: "user",
      content
    } as any,
    parent_tool_use_id: null,
    uuid,
    session_id: params.conversationId
  };
};

const buildUserPromptMessage = (prompt: string, messageId?: string): UserPromptMessage & { uuid: AgentUuid } => ({
  type: "user_prompt",
  prompt,
  uuid: coerceUuid(messageId)
});

const convertToolUses = (toolUses: ToolUseRecord[] | undefined) => {
  if (!Array.isArray(toolUses) || !toolUses.length) return undefined;
  return toolUses.map((tool) => ({
    type: "tool_use",
    id: tool.id ?? randomUUID(),
    name: tool.name ?? tool.orig_name ?? "tool",
    input: tool.args ?? tool.orig_args ?? {}
  }));
};

export const convertKiroHistoryEntries = (
  entries: KiroHistoryEntry[],
  conversationId: string
): StreamMessage[] => {
  const messages: StreamMessage[] = [];
  for (const entry of entries) {
    const userContent = (entry.user?.content ?? {}) as Record<string, any>;
    const assistantContent = entry.assistant ?? {};
    const metadata = entry.request_metadata ?? {};
    const metadataMessageId =
      typeof metadata?.message_id === "string" ? metadata.message_id : undefined;

    const promptText = userContent?.Prompt?.prompt;
    if (typeof promptText === "string" && promptText.trim()) {
      messages.push(buildUserPromptMessage(promptText, metadataMessageId));
    }

    const results = userContent?.ToolUseResults?.tool_use_results as ToolUseResultsRecord[] | undefined;
    if (Array.isArray(results) && results.length) {
      messages.push(buildUserToolResultMessage({ conversationId, messageId: metadataMessageId, results }));
    }

    const toolUse = (assistantContent as Record<string, any>)?.ToolUse;
    if (toolUse?.tool_uses?.length) {
      const content = convertToolUses(toolUse.tool_uses as ToolUseRecord[]);
      if (content) {
        messages.push(
          buildAssistantMessage({
            conversationId,
            messageId: toolUse.message_id,
            content
          })
        );
      }
    }

    const response = (assistantContent as Record<string, any>)?.Response;
    if (response?.content) {
      const textBlocks = normalizeTextBlocks(response.content);
      messages.push(
        buildAssistantMessage({
          conversationId,
          messageId: response.message_id,
          content: textBlocks
        })
      );
    }
  }
  return messages;
};
