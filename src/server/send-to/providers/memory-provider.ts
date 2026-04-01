import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

const MEMORY_CATEGORIES = ["preferences", "project-context", "decisions", "people", "general"];
const MAX_CONTENT = 2000;

// Memory store is injected via registry init (will be wired when shared-memories is built)
let memoryStoreRef: { create: (entry: any) => any } | null = null;

export function setMemoryStoreRef(ref: typeof memoryStoreRef) {
  memoryStoreRef = ref;
}

export class MemoryProvider implements DestinationProvider {
  readonly id = "memory";
  readonly label = "Memory";
  readonly icon = "🧠";
  readonly supportedFileTypes = "text" as const;

  getConfigFields(): ConfigField[] {
    return [
      {
        name: "category", label: "Category", type: "select", required: false,
        options: MEMORY_CATEGORIES.map((c) => ({ value: c, label: c.replace("-", " ") })),
      },
      { name: "content", label: "Content (override)", type: "textarea", required: false, placeholder: "Leave empty to use file content" },
    ];
  }

  validateParams(_params: Record<string, string>): string | null {
    return null; // All fields optional
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    try {
      let content = params.content?.trim();
      if (!content) {
        const raw = await readFile(filePath, "utf-8");
        content = raw.slice(0, MAX_CONTENT);
      }
      if (content.length > MAX_CONTENT) {
        content = content.slice(0, MAX_CONTENT);
      }

      if (!memoryStoreRef) {
        // Memory store not yet available — store via REST API instead
        return {
          success: false,
          message: "Memory store not yet configured. The shared-memories feature needs to be implemented first.",
        };
      }

      const entry = memoryStoreRef.create({
        content,
        category: params.category || "general",
        sourceType: "send-to",
      });

      return {
        success: true,
        message: `Saved to memory: ${content.slice(0, 80)}...`,
        data: { memoryId: entry.id },
      };
    } catch (err: any) {
      return { success: false, message: `Failed to save to memory: ${err.message}` };
    }
  }
}
