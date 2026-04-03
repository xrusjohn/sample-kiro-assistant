/**
 * ACP TCP Transport — wraps a TCP socket with newline-delimited JSON-RPC framing.
 * Same protocol as the existing stdio transport in runner.ts, but over a network socket.
 */
import { Socket } from "node:net";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type NotificationHandler = (method: string, params: unknown) => void;
type RequestHandler = (method: string, params: unknown) => Promise<unknown>;
type CloseHandler = (hadError: boolean) => void;

export class AcpTcpTransport {
  private socket: Socket;
  private host: string;
  private port: number;
  private buffer = "";
  private rpcId = 0;
  private responseHandlers = new Map<number, { resolve: (result: unknown) => void; reject: (err: Error) => void }>();
  private notificationHandlers: NotificationHandler[] = [];
  private requestHandlers: RequestHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private connected = false;
  private destroyed = false;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
    this.socket = new Socket();
  }

  /** Connect to the Sub-Agent's ACP endpoint. Rejects after timeoutMs (default 30s). */
  connect(timeoutMs = 30_000): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error("Transport is destroyed"));
    if (this.connected) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.destroy();
        reject(new Error(`Connection to ${this.host}:${this.port} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.socket.once("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Connection to ${this.host}:${this.port} failed: ${err.message}`));
      });

      this.socket.connect(this.port, this.host, () => {
        clearTimeout(timer);
        this.connected = true;
        this.wireDataHandler();
        this.wireCloseHandler();
        resolve();
      });
    });
  }

  /** Send a JSON-RPC request and return the response result. Rejects on error response or timeout. */
  request(method: string, params?: Record<string, unknown>, timeoutMs = 90_000): Promise<unknown> {
    if (!this.connected || this.destroyed) {
      return Promise.reject(new Error("Transport not connected"));
    }

    const id = ++this.rpcId;
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method };
    if (params) msg.params = params;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.responseHandlers.delete(id);
        reject(new Error(`ACP request "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.responseHandlers.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this.writeLine(JSON.stringify(msg));
    });
  }

  /** Send a JSON-RPC notification (no response expected). */
  notify(method: string, params?: Record<string, unknown>): void {
    if (!this.connected || this.destroyed) return;
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method };
    if (params) msg.params = params;
    this.writeLine(JSON.stringify(msg));
  }

  /** Register a handler for incoming notifications (e.g., session/update). */
  onNotification(handler: NotificationHandler): void {
    this.notificationHandlers.push(handler);
  }

  /** Register a handler for incoming requests from the agent (e.g., session/update, fs/read_text_file). */
  onRequest(handler: RequestHandler): void {
    this.requestHandlers.push(handler);
  }

  /** Register a handler for connection close. */
  onClose(handler: CloseHandler): void {
    this.closeHandlers.push(handler);
  }

  /** Close the connection gracefully. */
  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    // Reject any pending requests
    for (const [id, handler] of this.responseHandlers) {
      handler.reject(new Error("Transport closed"));
    }
    this.responseHandlers.clear();
    this.socket.destroy();
  }

  /** Whether the transport is currently connected. */
  get isConnected(): boolean {
    return this.connected && !this.destroyed;
  }

  // --- Internal ---

  private writeLine(json: string): void {
    this.socket.write(json + "\n");
  }

  private wireDataHandler(): void {
    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      // Keep the last incomplete line in the buffer
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          this.handleMessage(msg);
        } catch {
          console.warn("[acp-tcp] Malformed JSON:", trimmed.slice(0, 200));
        }
      }
    });
  }

  private wireCloseHandler(): void {
    this.socket.on("close", (hadError) => {
      this.connected = false;
      // Reject any pending requests
      for (const [, handler] of this.responseHandlers) {
        handler.reject(new Error(hadError ? "Connection closed with error" : "Connection closed"));
      }
      this.responseHandlers.clear();
      for (const cb of this.closeHandlers) cb(hadError);
    });

    this.socket.on("error", (err) => {
      if (this.connected) {
        console.error(`[acp-tcp] Socket error: ${err.message}`);
      }
    });
  }

  private handleMessage(msg: any): void {
    // Response to a request we sent (has id + result/error, no method)
    if (typeof msg.id === "number" && !msg.method && (msg.result !== undefined || msg.error)) {
      const handler = this.responseHandlers.get(msg.id);
      if (handler) {
        this.responseHandlers.delete(msg.id);
        if (msg.error) handler.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        else handler.resolve(msg.result);
      }
      return;
    }

    // Incoming request from agent (has method + id) — must respond
    if (msg.method && typeof msg.id === "number") {
      const respond = (result: unknown, error?: { code: number; message: string }) => {
        if (error) this.writeLine(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error }));
        else this.writeLine(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: result ?? {} }));
      };
      if (this.requestHandlers.length > 0) {
        this.requestHandlers[0](msg.method, msg.params)
          .then((result) => respond(result))
          .catch(() => respond(null, { code: -32603, message: "Internal error" }));
      } else {
        respond(null, { code: -32601, message: "Method not found" });
      }
      return;
    }

    // Notification from agent (has method, no id)
    if (msg.method && msg.id === undefined) {
      for (const handler of this.notificationHandlers) handler(msg.method, msg.params);
    }
  }
}
