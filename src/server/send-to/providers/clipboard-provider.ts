import { readFile } from "node:fs/promises";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

export class ClipboardProvider implements DestinationProvider {
  readonly id = "clipboard";
  readonly label = "Clipboard";
  readonly icon = "📋";
  readonly supportedFileTypes = "text" as const;

  getConfigFields(): ConfigField[] {
    return []; // No config needed — immediate action
  }

  validateParams(_params: Record<string, string>): string | null {
    return null;
  }

  async send(filePath: string, _params: Record<string, string>): Promise<SendToResponse> {
    try {
      const content = await readFile(filePath, "utf-8");
      // Server returns the content; the client-side store handles navigator.clipboard.writeText()
      return {
        success: true,
        message: "Content copied to clipboard",
        data: { content },
      };
    } catch (err: any) {
      return { success: false, message: `Failed to read file: ${err.message}` };
    }
  }
}
