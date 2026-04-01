import { basename } from "node:path";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

// Session handler and store are injected via the registry init
let sessionHandlerRef: { handleClientEvent: (event: any) => void; sessions: { listSessions: () => any[]; getSession: (id: string) => any } } | null = null;

export function setSessionHandlerRef(ref: typeof sessionHandlerRef) {
  sessionHandlerRef = ref;
}

export class SessionProvider implements DestinationProvider {
  readonly id = "session";
  readonly label = "Another Session";
  readonly icon = "🔗";
  readonly supportedFileTypes = "all" as const;

  getConfigFields(): ConfigField[] {
    // Dynamic — populated from active sessions at request time
    const sessions = sessionHandlerRef?.sessions.listSessions() ?? [];
    const options = sessions.map((s: any) => ({ value: s.id, label: s.title || s.id }));
    return [
      { name: "sessionId", label: "Target Session", type: "select", required: true, options },
    ];
  }

  validateParams(params: Record<string, string>): string | null {
    if (!params.sessionId?.trim()) return "Target session is required";
    return null;
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    if (!sessionHandlerRef) {
      return { success: false, message: "Session handler not available" };
    }

    const session = sessionHandlerRef.sessions.getSession(params.sessionId);
    if (!session) {
      return { success: false, message: "Target session not found" };
    }

    const fileName = basename(filePath);
    const prompt = `[File shared from another session] The file "${fileName}" is available at: ${filePath}\n\nPlease review or use this file as needed.`;

    sessionHandlerRef.handleClientEvent({
      type: "session.continue",
      payload: { sessionId: params.sessionId, prompt },
    });

    return {
      success: true,
      message: `File reference sent to session "${session.title || params.sessionId}"`,
      data: { sessionId: params.sessionId, sessionTitle: session.title },
    };
  }
}
