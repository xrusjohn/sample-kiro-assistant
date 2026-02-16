import { randomUUID } from "node:crypto";
import type {
  AgentAssistantMessage,
  AgentMessage,
  AgentUserMessage
} from "../../shared/agent-schema.js";
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

type TextBlock = { type: "text"; text: string };

type AssistantMessageWithExtras = AgentAssistantMessage & {
  model?: string;
  message: AgentAssistantMessage["message"] & {
    transcript?: TextBlock[];
  };
};

type UserToolResultMessage = AgentUserMessage;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickModelString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const extractModelFromMetadata = (metadata?: Record<string, unknown>): string | undefined => {
  if (!metadata) return undefined;
  const candidateKeys = [
    "model",
    "model_id",
    "selected_model",
    "selectedModel",
    "modelName",
    "default_model"
  ] as const;
  for (const key of candidateKeys) {
    const candidate = pickModelString(metadata[key]);
    if (candidate) return candidate;
  }

  const nestedKeys = ["default_params", "request", "options", "config"] as const;
  for (const nestedKey of nestedKeys) {
    const nestedValue = metadata[nestedKey];
    if (!isRecord(nestedValue)) continue;
    const nestedCandidate = pickModelString(
      (typeof nestedValue.model === "string" ? nestedValue.model : undefined) ??
        (typeof nestedValue.model_id === "string" ? nestedValue.model_id : undefined) ??
        (typeof nestedValue.selected_model === "string" ? nestedValue.selected_model : undefined)
    );
    if (nestedCandidate) return nestedCandidate;
  }

  return undefined;
};

const normalizeTextBlocks = (value: unknown): TextBlock[] => {
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
      if (isRecord(item) && typeof item.Text === "string") {
        flattened.push(item.Text);
        continue;
      }
      if (isRecord(item) && typeof item.text === "string") {
        flattened.push(item.text);
        continue;
      }
      flattened.push(JSON.stringify(item));
    }
    if (flattened.length === 0) {
      return [{ type: "text", text: "" }];
    }
    return flattened.map((text) => ({ type: "text", text }));
  }
  if (isRecord(value)) {
    if ("stdout" in value || "stderr" in value) {
      const stdout = value.stdout;
      const stderr = value.stderr;
      const lines: string[] = [];
      if (typeof stdout === "string" && stdout.trim()) lines.push(`Stdout:\n${stdout}`);
      if (typeof stderr === "string" && stderr.trim()) lines.push(`Stderr:\n${stderr}`);
      if (lines.length === 0) {
        return [{ type: "text", text: JSON.stringify(value, null, 2) }];
      }
      return lines.map((text) => ({ type: "text", text }));
    }
    if (typeof value.Text === "string") {
      return [{ type: "text", text: value.Text }];
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
}): AssistantMessageWithExtras => {
  const uuid = coerceUuid(params.messageId);
  return {
    type: "assistant",
    message: {
      id: uuid,
      role: "assistant",
      content: params.content
    } as unknown as AgentAssistantMessage["message"],
    parent_tool_use_id: null,
    uuid,
    session_id: params.conversationId
  };
};

const buildUserToolResultMessage = (params: {
  conversationId: string;
  messageId?: string;
  results: ToolUseResultsRecord[];
}): UserToolResultMessage => {
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
    } as unknown as AgentUserMessage["message"],
    parent_tool_use_id: null,
    uuid,
    session_id: params.conversationId
  };
};

const buildUserPromptMessage = (
  prompt: string,
  messageId?: string
): UserPromptMessage & { uuid: AgentUuid } => ({
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

const readMetadataMessageId = (metadata: Record<string, unknown>): string | undefined =>
  typeof metadata.message_id === "string" ? metadata.message_id : undefined;

const readUserContent = (entry: KiroHistoryEntry): Record<string, unknown> => {
  if (!isRecord(entry.user)) return {};
  const content = entry.user.content;
  return isRecord(content) ? content : {};
};

const readAssistantContent = (entry: KiroHistoryEntry): Record<string, unknown> =>
  isRecord(entry.assistant) ? entry.assistant : {};

const readMetadata = (entry: KiroHistoryEntry): Record<string, unknown> =>
  isRecord(entry.request_metadata) ? entry.request_metadata : {};

const readToolUseResults = (userContent: Record<string, unknown>): ToolUseResultsRecord[] | undefined => {
  const toolUseResults = userContent.ToolUseResults;
  if (!isRecord(toolUseResults) || !Array.isArray(toolUseResults.tool_use_results)) return undefined;
  return toolUseResults.tool_use_results as ToolUseResultsRecord[];
};

const readPromptText = (userContent: Record<string, unknown>): string | undefined => {
  const promptNode = userContent.Prompt;
  if (!isRecord(promptNode)) return undefined;
  return typeof promptNode.prompt === "string" ? promptNode.prompt : undefined;
};

type ToolUseEnvelope = {
  message_id?: string;
  tool_uses?: ToolUseRecord[];
};

const readToolUseEnvelope = (assistantContent: Record<string, unknown>): ToolUseEnvelope | undefined => {
  const rawToolUse = assistantContent.ToolUse;
  if (!isRecord(rawToolUse)) return undefined;
  return {
    message_id: typeof rawToolUse.message_id === "string" ? rawToolUse.message_id : undefined,
    tool_uses: Array.isArray(rawToolUse.tool_uses) ? (rawToolUse.tool_uses as ToolUseRecord[]) : undefined
  };
};

type ResponseEnvelope = {
  message_id?: string;
  content?: unknown;
};

const readResponseEnvelope = (assistantContent: Record<string, unknown>): ResponseEnvelope | undefined => {
  const rawResponse = assistantContent.Response;
  if (!isRecord(rawResponse)) return undefined;
  return {
    message_id: typeof rawResponse.message_id === "string" ? rawResponse.message_id : undefined,
    content: rawResponse.content
  };
};

export const convertKiroHistoryEntries = (
  entries: KiroHistoryEntry[],
  conversationId: string,
  options?: { fallbackModel?: string }
): StreamMessage[] => {
  const messages: StreamMessage[] = [];
  let lastAssistant: AssistantMessageWithExtras | undefined;
  const fallbackModel = pickModelString(options?.fallbackModel);

  for (const entry of entries) {
    const userContent = readUserContent(entry);
    const assistantContent = readAssistantContent(entry);
    const metadata = readMetadata(entry);

    const metadataMessageId = readMetadataMessageId(metadata);
    const metadataModel = extractModelFromMetadata(metadata) ?? fallbackModel;

    const promptText = readPromptText(userContent);
    if (typeof promptText === "string" && promptText.trim()) {
      messages.push(buildUserPromptMessage(promptText, metadataMessageId));
    }

    const results = readToolUseResults(userContent);
    if (Array.isArray(results) && results.length) {
      messages.push(buildUserToolResultMessage({ conversationId, messageId: metadataMessageId, results }));
    }

    const toolUse = readToolUseEnvelope(assistantContent);
    if (toolUse?.tool_uses?.length) {
      const content = convertToolUses(toolUse.tool_uses);
      if (content) {
        const assistantMessage = buildAssistantMessage({
          conversationId,
          messageId: toolUse.message_id,
          content
        });
        if (metadataModel) {
          assistantMessage.model = metadataModel;
        }
        messages.push(assistantMessage as AgentMessage);
        lastAssistant = assistantMessage;
      }
    }

    const response = readResponseEnvelope(assistantContent);
    if (response?.content) {
      const transcript = normalizeTextBlocks(response.content);
      const assistantMessage = buildAssistantMessage({
        conversationId,
        messageId: response.message_id,
        content: transcript
      });
      assistantMessage.message.transcript = transcript;
      if (metadataModel) {
        assistantMessage.model = metadataModel;
      }
      messages.push(assistantMessage as AgentMessage);
      lastAssistant = assistantMessage;
    }

    if (lastAssistant && response?.content) {
      lastAssistant.message.transcript = normalizeTextBlocks(response.content);
    }
  }

  return messages;
};
