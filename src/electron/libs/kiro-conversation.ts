import Database from "better-sqlite3";
import { resolveKiroDataPath } from "./kiro-cli.js";

let cachedDb: Database.Database | undefined;
let cachedPath: string | undefined;

const getKiroConversationDb = (): Database.Database | undefined => {
  const path = resolveKiroDataPath();
  if (!path) return undefined;
  if (cachedDb && cachedPath === path) return cachedDb;
  try {
    cachedDb?.close();
  } catch {
    // noop – best effort close before reopening in read-only mode
  }
  cachedDb = new Database(path, { readonly: true, fileMustExist: true });
  cachedPath = path;
  return cachedDb;
};

export type KiroHistoryEntry = {
  user?: Record<string, unknown>;
  assistant?: Record<string, unknown>;
  request_metadata?: Record<string, unknown>;
};

export type KiroConversationRecord = {
  key: string;
  conversationId: string;
  history: KiroHistoryEntry[];
  raw: Record<string, unknown>;
};

type ConversationRow = {
  key: string;
  conversation_id: string;
  value: string;
  updated_at?: number;
};

const parseConversationRow = (row: ConversationRow | undefined): KiroConversationRecord | null => {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const history = Array.isArray(parsed.history) ? (parsed.history as KiroHistoryEntry[]) : [];
    return {
      key: row.key,
      conversationId: row.conversation_id,
      history,
      raw: parsed
    };
  } catch (error) {
    console.warn("Failed to parse Kiro conversation payload:", error);
    return null;
  }
};

export const loadKiroConversation = (key: string): KiroConversationRecord | null => {
  const db = getKiroConversationDb();
  if (!db) return null;
  const row = db
    .prepare("select key, conversation_id, value, updated_at from conversations_v2 where key = ?")
    .get(key) as ConversationRow | undefined;
  return parseConversationRow(row);
};

export const listRecentKiroConversations = (limit = 20): KiroConversationRecord[] => {
  const db = getKiroConversationDb();
  if (!db) return [];
  const rows = db
    .prepare("select key, conversation_id, value, updated_at from conversations_v2 order by updated_at desc limit ?")
    .all(limit) as ConversationRow[];
  return rows.map((row) => parseConversationRow(row)).filter(Boolean) as KiroConversationRecord[];
};
