import type { DestinationProvider } from "./destination-provider.js";
import type { DestinationInfo } from "../../shared/send-to-types.js";

export class DestinationRegistry {
  private providers = new Map<string, DestinationProvider>();

  register(provider: DestinationProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): DestinationProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): DestinationInfo[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      label: p.label,
      icon: p.icon,
      supportedFileTypes: p.supportedFileTypes,
      configFields: p.getConfigFields(),
    }));
  }

  has(id: string): boolean {
    return this.providers.has(id);
  }

  getAvailableIds(): string[] {
    return Array.from(this.providers.keys());
  }
}
