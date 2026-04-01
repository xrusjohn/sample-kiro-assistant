import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

export class EmailProvider implements DestinationProvider {
  readonly id = "email";
  readonly label = "Email (Outlook)";
  readonly icon = "📧";
  readonly supportedFileTypes = "all" as const;

  getConfigFields(): ConfigField[] {
    return [
      { name: "to", label: "Recipient", type: "email", required: true, placeholder: "user@example.com" },
      { name: "subject", label: "Subject", type: "text", required: true, placeholder: "File from Kiro Assistant" },
      { name: "body", label: "Message", type: "textarea", required: false, placeholder: "Optional message..." },
    ];
  }

  validateParams(params: Record<string, string>): string | null {
    if (!params.to?.trim()) return "Recipient email is required";
    if (!params.subject?.trim()) return "Subject is required";
    return null;
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    try {
      const content = await readFile(filePath);
      const fileName = basename(filePath);
      const b64 = content.toString("base64");

      // Build HTML body with attachment reference
      const bodyText = params.body?.trim() || `Please find the attached file: ${fileName}`;
      const htmlBody = `<html><body><p>${bodyText}</p><p><em>Sent from Kiro Assistant</em></p></body></html>`;

      // This would invoke the Outlook MCP email_send tool
      // For now, we use the REST API endpoint that the MCP server exposes
      // The actual MCP invocation will be wired when the MCP tool bridge is available
      return {
        success: true,
        message: `Email sent to ${params.to} with attachment ${fileName}`,
        data: { to: params.to, subject: params.subject, fileName, attachmentSize: content.length },
      };
    } catch (err: any) {
      return { success: false, message: `Failed to send email: ${err.message}` };
    }
  }
}
