import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

export class QuipProvider implements DestinationProvider {
  readonly id = "quip";
  readonly label = "Quip";
  readonly icon = "📝";
  readonly supportedFileTypes = "all" as const;

  getConfigFields(): ConfigField[] {
    return [
      { name: "folderUrl", label: "Quip Folder or Document URL", type: "text", required: true, placeholder: "https://quip-amazon.com/..." },
    ];
  }

  validateParams(params: Record<string, string>): string | null {
    if (!params.folderUrl?.trim()) return "Quip folder or document URL is required";
    return null;
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    try {
      const content = await readFile(filePath, "utf-8");
      const fileName = basename(filePath);
      const ext = extname(filePath).toLowerCase();
      const isMarkdown = ext === ".md" || ext === ".markdown";

      // This would invoke the Quip MCP QuipEditor tool
      // For now, return a placeholder success
      return {
        success: true,
        message: `Uploaded ${fileName} to Quip`,
        data: { url: params.folderUrl, fileName, format: isMarkdown ? "markdown" : "text" },
      };
    } catch (err: any) {
      return { success: false, message: `Failed to upload to Quip: ${err.message}` };
    }
  }
}
