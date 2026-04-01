import type { ConfigField, SendToResponse } from "../../shared/send-to-types.js";

export interface DestinationProvider {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly supportedFileTypes: "text" | "binary" | "all";

  getConfigFields(): ConfigField[];
  validateParams(params: Record<string, string>): string | null;
  send(filePath: string, params: Record<string, string>): Promise<SendToResponse>;
}
