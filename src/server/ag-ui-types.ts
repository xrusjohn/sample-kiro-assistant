/**
 * AG-UI event types — subset we actually emit.
 * Based on https://docs.ag-ui.com/concepts/events
 */

export enum EventType {
  RUN_STARTED = "RUN_STARTED",
  RUN_FINISHED = "RUN_FINISHED",
  RUN_ERROR = "RUN_ERROR",
  STEP_STARTED = "STEP_STARTED",
  STEP_FINISHED = "STEP_FINISHED",
  TEXT_MESSAGE_START = "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END = "TEXT_MESSAGE_END",
  TOOL_CALL_START = "TOOL_CALL_START",
  TOOL_CALL_ARGS = "TOOL_CALL_ARGS",
  TOOL_CALL_END = "TOOL_CALL_END",
  STATE_SNAPSHOT = "STATE_SNAPSHOT",
  MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT",
  CUSTOM = "CUSTOM",
}

export interface BaseEvent {
  type: EventType;
  timestamp?: number;
  threadId?: string;
  runId?: string;
}

export interface RunStartedEvent extends BaseEvent { type: EventType.RUN_STARTED; }
export interface RunFinishedEvent extends BaseEvent { type: EventType.RUN_FINISHED; }
export interface RunErrorEvent extends BaseEvent { type: EventType.RUN_ERROR; message: string; }

export interface TextMessageStartEvent extends BaseEvent { type: EventType.TEXT_MESSAGE_START; messageId: string; }
export interface TextMessageContentEvent extends BaseEvent { type: EventType.TEXT_MESSAGE_CONTENT; messageId: string; delta: string; }
export interface TextMessageEndEvent extends BaseEvent { type: EventType.TEXT_MESSAGE_END; messageId: string; }

export interface ToolCallStartEvent extends BaseEvent { type: EventType.TOOL_CALL_START; toolCallId: string; name: string; }
export interface ToolCallArgsEvent extends BaseEvent { type: EventType.TOOL_CALL_ARGS; toolCallId: string; delta: string; }
export interface ToolCallEndEvent extends BaseEvent { type: EventType.TOOL_CALL_END; toolCallId: string; }

export interface CustomEvent extends BaseEvent { type: EventType.CUSTOM; name: string; value: unknown; }

export interface MessagesSnapshotEvent extends BaseEvent {
  type: EventType.MESSAGES_SNAPSHOT;
  messages: Array<{ id: string; role: string; content: string }>;
}

export type AgUiEvent =
  | RunStartedEvent | RunFinishedEvent | RunErrorEvent
  | TextMessageStartEvent | TextMessageContentEvent | TextMessageEndEvent
  | ToolCallStartEvent | ToolCallArgsEvent | ToolCallEndEvent
  | CustomEvent | MessagesSnapshotEvent;

/** Input to POST /ag-ui/run */
export interface RunAgentInput {
  threadId?: string;   // existing session ID, or omit to create new
  prompt: string;
  agentId?: string;
  profileId?: string;  // route to specific remote agent
  cwd?: string;
}
