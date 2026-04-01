import { DestinationRegistry } from "./destination-registry.js";
import { EmailProvider } from "./providers/email-provider.js";
import { QuipProvider } from "./providers/quip-provider.js";
import { S3Provider } from "./providers/s3-provider.js";
import { ClipboardProvider } from "./providers/clipboard-provider.js";
import { SessionProvider, setSessionHandlerRef } from "./providers/session-provider.js";
import { MemoryProvider } from "./providers/memory-provider.js";
import { createSendToRouter } from "./send-to-routes.js";

export function createSendToRegistry(): DestinationRegistry {
  const registry = new DestinationRegistry();
  registry.register(new EmailProvider());
  registry.register(new QuipProvider());
  registry.register(new S3Provider());
  registry.register(new ClipboardProvider());
  registry.register(new SessionProvider());
  registry.register(new MemoryProvider());
  return registry;
}

export { createSendToRouter, setSessionHandlerRef };
