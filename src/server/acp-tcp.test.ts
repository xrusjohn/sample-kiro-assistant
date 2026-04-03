import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { AcpTcpTransport } from "./acp-tcp.js";

/** Helper: create a TCP server that accepts one connection and returns the server + client socket. */
function createTestServer(): Promise<{ server: Server; port: number; getClient: () => Promise<Socket> }> {
  return new Promise((resolve) => {
    const server = createServer();
    let clientResolve: (s: Socket) => void;
    const clientPromise = new Promise<Socket>((r) => { clientResolve = r; });
    server.on("connection", (socket) => clientResolve(socket));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ server, port: addr.port, getClient: () => clientPromise });
    });
  });
}

let servers: Server[] = [];
let transports: AcpTcpTransport[] = [];

afterEach(() => {
  for (const t of transports) t.close();
  transports = [];
  for (const s of servers) s.close();
  servers = [];
});

describe("AcpTcpTransport", () => {
  it("connects to a TCP server", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);

    await transport.connect(5000);
    expect(transport.isConnected).toBe(true);

    const client = await getClient();
    expect(client).toBeDefined();
  });

  it("sends a request and receives a response", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();

    // Echo server: parse request, send back a response with matching id
    let serverBuffer = "";
    client.on("data", (chunk) => {
      serverBuffer += chunk.toString();
      const lines = serverBuffer.split("\n");
      serverBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const req = JSON.parse(line);
        client.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { echo: req.method } }) + "\n");
      }
    });

    const result = await transport.request("initialize", { protocolVersion: 1 });
    expect(result).toEqual({ echo: "initialize" });
  });

  it("sends notifications without expecting a response", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();
    const received: any[] = [];
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) received.push(JSON.parse(line));
      }
    });

    transport.notify("session/cancel", { sessionId: "abc" });

    // Give it a moment to arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe("session/cancel");
    expect(received[0].id).toBeUndefined();
  });

  it("receives server notifications via onNotification", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();
    const notifications: { method: string; params: unknown }[] = [];
    transport.onNotification((method, params) => notifications.push({ method, params }));

    // Server sends a notification
    client.write(JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { text: "hello" } }) + "\n");

    await new Promise((r) => setTimeout(r, 50));
    expect(notifications).toHaveLength(1);
    expect(notifications[0].method).toBe("session/update");
    expect(notifications[0].params).toEqual({ text: "hello" });
  });

  it("rejects request when server returns an error", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();
    let buf = "";
    client.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const req = JSON.parse(line);
        client.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -1, message: "test error" } }) + "\n");
      }
    });

    await expect(transport.request("bad_method")).rejects.toThrow("test error");
  });

  it("rejects pending requests when connection closes", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();

    // Send a request but don't respond — then close the connection
    const promise = transport.request("initialize");
    await new Promise((r) => setTimeout(r, 20));
    client.destroy();

    await expect(promise).rejects.toThrow(/closed/i);
  });

  it("times out on connect when server is unreachable", async () => {
    // Use a port that nothing is listening on
    const transport = new AcpTcpTransport("127.0.0.1", 1);
    transports.push(transport);

    await expect(transport.connect(500)).rejects.toThrow(/failed|refused|timed out/i);
  });

  it("fires onClose when server disconnects", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();
    let closeFired = false;
    transport.onClose(() => { closeFired = true; });

    client.destroy();
    await new Promise((r) => setTimeout(r, 50));
    expect(closeFired).toBe(true);
    expect(transport.isConnected).toBe(false);
  });

  it("handles multiple messages in a single TCP chunk", async () => {
    const { server, port, getClient } = await createTestServer();
    servers.push(server);

    const transport = new AcpTcpTransport("127.0.0.1", port);
    transports.push(transport);
    await transport.connect(5000);

    const client = await getClient();
    const notifications: string[] = [];
    transport.onNotification((method) => notifications.push(method));

    // Send two notifications in a single write
    const batch =
      JSON.stringify({ jsonrpc: "2.0", method: "event/a", params: {} }) + "\n" +
      JSON.stringify({ jsonrpc: "2.0", method: "event/b", params: {} }) + "\n";
    client.write(batch);

    await new Promise((r) => setTimeout(r, 50));
    expect(notifications).toEqual(["event/a", "event/b"]);
  });
});
