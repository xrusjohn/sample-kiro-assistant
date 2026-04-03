/**
 * ECS Runner — launches Sub-Agent containers on ECS Fargate and communicates via ACP-over-TCP.
 * Implements the same RunnerHandle interface as createAcpRunner so the rest of the server is unchanged.
 */
import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from "@aws-sdk/client-ecs";
import crypto from "node:crypto";
import { AcpTcpTransport } from "./acp-tcp.js";
import type { RunnerHandle } from "./runner.js";
import type { ServerEvent } from "../electron/types.js";
import type { Session } from "../electron/libs/session-store.js";
import type { AgentDefinition } from "./agent-registry.js";

// --- Config from environment variables ---
interface EcsTaskConfig {
  cluster: string;
  taskFamily: string;
  subnets: string[];
  securityGroup: string;
  containerPort: number;
  startupTimeoutMs: number;
}

function loadEcsConfig(): EcsTaskConfig {
  const subnetsRaw = process.env.ECS_SUBAGENT_SUBNETS;
  if (!subnetsRaw) throw new Error("ECS_SUBAGENT_SUBNETS is required");
  const securityGroup = process.env.ECS_SUBAGENT_SECURITY_GROUP;
  if (!securityGroup) throw new Error("ECS_SUBAGENT_SECURITY_GROUP is required");

  return {
    cluster: process.env.ECS_CLUSTER ?? "relay",
    taskFamily: process.env.ECS_SUBAGENT_TASK_FAMILY ?? "kiro-subagent",
    subnets: subnetsRaw.split(",").map(s => s.trim()).filter(Boolean),
    securityGroup,
    containerPort: parseInt(process.env.ECS_SUBAGENT_CONTAINER_PORT ?? "8080", 10),
    startupTimeoutMs: parseInt(process.env.ECS_SUBAGENT_STARTUP_TIMEOUT_MS ?? "120000", 10),
  };
}

const ecs = new ECSClient({});

type EmitFn = (event: ServerEvent) => void;

// --- ECS state tracking (for health endpoint) ---
export interface EcsRunnerInfo {
  taskArn: string | null;
  taskState: string;
  launchedAt: number;
  connectedAt: number | null;
  runTaskLatencyMs: number | null;
}

const ecsRunnerStates = new Map<string, EcsRunnerInfo>();

/** Get ECS runner info for a session (used by health endpoint). */
export function getEcsRunnerInfo(sessionId: string): EcsRunnerInfo | undefined {
  return ecsRunnerStates.get(sessionId);
}

/** Get all ECS runner infos (used by health endpoint). */
export function getAllEcsRunnerInfos(): Map<string, EcsRunnerInfo> {
  return ecsRunnerStates;
}

// --- Launch and discover Sub-Agent ---

async function launchSubAgent(
  config: EcsTaskConfig,
  session: Session,
  model: string,
  tag: string,
): Promise<{ taskArn: string; privateIp: string }> {
  const launchedAt = Date.now();

  console.log(`[${tag}] Launching ECS task: family=${config.taskFamily} cluster=${config.cluster}`);

  const envOverrides = [
    { name: "KIRO_SESSION_ID", value: session.id },
    { name: "KIRO_CWD", value: session.cwd ?? "/workspace" },
  ];
  if (model) envOverrides.push({ name: "KIRO_MODEL", value: model });

  // Pass through auth-related env vars from orchestrator to sub-agent
  for (const key of ["KIRO_TOKEN_VAULT_ENDPOINT", "KIRO_AUTH_SECRET_ARN", "KIRO_AUTH_S3_URI", "MIDWAY_COOKIE"]) {
    if (process.env[key]) envOverrides.push({ name: key, value: process.env[key]! });
  }

  const runResult = await ecs.send(new RunTaskCommand({
    cluster: config.cluster,
    taskDefinition: config.taskFamily,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.subnets,
        securityGroups: [config.securityGroup],
        assignPublicIp: "ENABLED",
      },
    },
    overrides: {
      containerOverrides: [{
        name: "subagent",
        environment: envOverrides,
      }],
    },
  }));

  const task = runResult.tasks?.[0];
  if (!task?.taskArn) {
    const failures = runResult.failures?.map(f => `${f.arn}: ${f.reason}`).join(", ") ?? "unknown";
    throw new Error(`RunTask failed: ${failures}`);
  }

  const taskArn = task.taskArn;
  console.log(`[${tag}] Task launched: ${taskArn}`);

  // Poll DescribeTasks until RUNNING or timeout
  const deadline = Date.now() + config.startupTimeoutMs;
  let privateIp: string | undefined;

  while (Date.now() < deadline) {
    await sleep(3000);

    const desc = await ecs.send(new DescribeTasksCommand({
      cluster: config.cluster,
      tasks: [taskArn],
    }));

    const taskInfo = desc.tasks?.[0];
    if (!taskInfo) throw new Error(`Task ${taskArn} disappeared from DescribeTasks`);

    const status = taskInfo.lastStatus;
    console.log(`[${tag}] Task status: ${status} (${Math.round((Date.now() - launchedAt) / 1000)}s)`);

    if (status === "STOPPED") {
      const reason = taskInfo.stoppedReason ?? taskInfo.containers?.[0]?.reason ?? "unknown";
      throw new Error(`Task stopped before reaching RUNNING: ${reason}`);
    }

    if (status === "RUNNING") {
      // Extract private IP from ENI attachment
      const eni = taskInfo.attachments?.find(a => a.type === "ElasticNetworkInterface");
      const ipDetail = eni?.details?.find(d => d.name === "privateIPv4Address");
      privateIp = ipDetail?.value;

      if (!privateIp) throw new Error("Task is RUNNING but no private IP found in ENI attachment");

      const latencyMs = Date.now() - launchedAt;
      console.log(`[${tag}] Task RUNNING at ${privateIp}:${config.containerPort} (latency: ${latencyMs}ms)`);
      return { taskArn, privateIp };
    }
  }

  // Timeout — cancel the task
  console.error(`[${tag}] Task startup timeout (${config.startupTimeoutMs}ms), cancelling task ${taskArn}`);
  try {
    await ecs.send(new StopTaskCommand({ cluster: config.cluster, task: taskArn, reason: "Startup timeout" }));
  } catch (e: any) {
    console.warn(`[${tag}] Failed to stop timed-out task: ${e.message}`);
  }
  throw new Error(`Task did not reach RUNNING within ${config.startupTimeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main: createEcsRunner ---

export function createEcsRunner(opts: {
  session: Session;
  model: string;
  agent: AgentDefinition;
  onEvent: EmitFn;
  onSessionUpdate?: (updates: Partial<Session>) => void;
}): RunnerHandle {
  const { session, model, onEvent, onSessionUpdate } = opts;
  const tag = `ecs:${session.id.slice(0, 8)}`;

  let config: EcsTaskConfig;
  try {
    config = loadEcsConfig();
  } catch (e: any) {
    console.error(`[${tag}] Config error: ${e.message}`);
    onEvent({ type: "runner.error", payload: { sessionId: session.id, message: `ECS config error: ${e.message}` } });
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: e.message } });
    return { abort() {}, sendPrompt() {}, ready: Promise.reject(e), onClose() {} };
  }

  let transport: AcpTcpTransport | null = null;
  let acpSessionId: string | null = null;
  let taskArn: string | null = null;
  let aborted = false;
  let pendingPrompt: string | null = null;
  let streamingStarted = false;
  let accumulatedText = "";
  const closeCallbacks: Array<(code: number | null) => void> = [];

  // Track ECS state for health endpoint
  const ecsInfo: EcsRunnerInfo = {
    taskArn: null,
    taskState: "LAUNCHING",
    launchedAt: Date.now(),
    connectedAt: null,
    runTaskLatencyMs: null,
  };
  ecsRunnerStates.set(session.id, ecsInfo);

  // --- Streaming helpers (mirrored from createAcpRunner) ---
  const emitDelta = (text: string) => {
    if (!text) return;
    accumulatedText += text;
    if (!streamingStarted) {
      streamingStarted = true;
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_start" } } as any } });
    }
    onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text } } } as any } });
  };

  const finishTurn = () => {
    if (streamingStarted) {
      onEvent({ type: "stream.message", payload: { sessionId: session.id, message: { type: "stream_event", event: { type: "content_block_stop" } } as any } });
      streamingStarted = false;
    }
    if (accumulatedText) {
      onEvent({
        type: "stream.message",
        payload: {
          sessionId: session.id,
          message: {
            type: "assistant",
            message: { id: crypto.randomUUID(), role: "assistant", content: [{ type: "text", text: accumulatedText }] },
            model, session_id: session.id, uuid: crypto.randomUUID(),
          } as any,
        },
      });
      accumulatedText = "";
    }
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "idle", title: session.title, cwd: session.cwd } });
  };

  // --- Send prompt over ACP ---
  const doSendPrompt = (text: string) => {
    if (!transport || !acpSessionId) return;
    accumulatedText = "";
    streamingStarted = false;
    onEvent({ type: "session.status", payload: { sessionId: session.id, status: "running", title: session.title, cwd: session.cwd } });
    transport.request("session/prompt", {
      sessionId: acpSessionId,
      prompt: [{ type: "text", text }],
    }).then(() => finishTurn()).catch(() => finishTurn());
  };

  // --- Handle ACP notifications from Sub-Agent ---
  const handleNotification = (method: string, params: any) => {
    if (method === "session/update") {
      const update = params?.update ?? params;
      const kind = update?.sessionUpdate ?? update?.kind ?? update?.type;

      if (kind === "agent_message_chunk") {
        const text = update.content?.text ?? "";
        if (text) {
          const contentType = update.content?.type ?? "text";
          emitDelta(contentType === "thinking" ? `*${text}*` : text);
        }
        return;
      }

      if (kind === "tool_call") {
        const title = update.title ?? "";
        const toolName = title.replace(/^Running:\s*/, "") || (update.toolName ?? update.name ?? "unknown");
        emitDelta(`\n\n🛠️ ${title || ("Using tool: **" + toolName + "**")}\n`);
        return;
      }

      if (kind === "tool_call_update") return; // skip progress updates

      if (kind === "turn_end") { finishTurn(); return; }

      console.log(`[${tag} update]`, kind, JSON.stringify(update).slice(0, 300));
    }

    if (method === "_kiro.dev/metadata" && params) {
      const meta: Record<string, unknown> = { sessionId: session.id };
      if (typeof params.contextUsagePercentage === "number") meta.contextUsagePercent = Math.round(params.contextUsagePercentage);
      if (Array.isArray(params.meteringUsage)) {
        const credit = params.meteringUsage.find((m: any) => m.unit === "credit");
        if (credit) meta.creditsUsed = Math.round(credit.value * 1000) / 1000;
      }
      if (typeof params.turnDurationMs === "number") meta.turnDurationMs = params.turnDurationMs;
      onEvent({ type: "session.metadata", payload: meta } as any);
    }
  };

  // --- Async init: launch task, connect, handshake ---
  let readyResolve: () => void;
  let readyReject: (err: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  emitDelta("⏳ Launching ECS sub-agent...\n");

  (async () => {
    try {
      const { taskArn: arn, privateIp } = await launchSubAgent(config, session, model, tag);
      taskArn = arn;
      ecsInfo.taskArn = arn;
      ecsInfo.taskState = "RUNNING";
      ecsInfo.runTaskLatencyMs = Date.now() - ecsInfo.launchedAt;

      if (aborted) {
        await ecs.send(new StopTaskCommand({ cluster: config.cluster, task: taskArn, reason: "Aborted before connect" }));
        return;
      }

      emitDelta("⏳ Connecting to sub-agent...\n");

      // Connect via TCP
      transport = new AcpTcpTransport(privateIp, config.containerPort);

      // Retry connection a few times — the container may need a moment after RUNNING
      let connectAttempts = 0;
      const maxConnectAttempts = 10;
      while (connectAttempts < maxConnectAttempts) {
        try {
          await transport.connect(10_000);
          break;
        } catch (e: any) {
          connectAttempts++;
          if (connectAttempts >= maxConnectAttempts) throw e;
          console.log(`[${tag}] TCP connect attempt ${connectAttempts} failed, retrying in 2s...`);
          await sleep(2000);
        }
      }

      // Wire up notification handler
      transport.onNotification(handleNotification);

      // Wire up request handler — agent calls session/update, fs/*, terminal/* as requests
      transport.onRequest(async (method, params) => {
        if (method === "session/update") {
          handleNotification(method, params);
          return {};
        }
        // fs and terminal stubs — return not-implemented for now
        return {};
      });

      // Wire up close handler
      transport.onClose((hadError) => {
        console.log(`[${tag}] ACP TCP connection closed (hadError=${hadError})`);
        if (!aborted) {
          onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: "Sub-agent connection lost" } });
        }
        for (const cb of closeCallbacks) cb(hadError ? 1 : 0);
      });

      // ACP handshake: initialize
      const initResult = await transport.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
        clientInfo: { name: "kiro-orchestrator", version: "0.1.0" },
      });
      console.log(`[${tag}] ACP initialize response:`, JSON.stringify(initResult).slice(0, 200));

      // ACP handshake: session/new
      // Use /tmp as cwd — the container doesn't have the client's local filesystem
      const sessionParams: Record<string, unknown> = { cwd: "/tmp", mcpServers: [] };
      if (model) sessionParams.model = model;
      const newResult = await transport.request("session/new", sessionParams) as any;
      acpSessionId = newResult?.sessionId;

      if (!acpSessionId) throw new Error("session/new did not return a sessionId");

      onSessionUpdate?.({ kiroConversationId: acpSessionId });
      ecsInfo.connectedAt = Date.now();
      emitDelta(" Connected ✓\n");
      finishTurn();
      readyResolve!();

      // Send queued prompt if any
      if (pendingPrompt) {
        doSendPrompt(pendingPrompt);
        pendingPrompt = null;
      }
    } catch (e: any) {
      console.error(`[${tag}] Startup failed: ${e.message}`);
      ecsInfo.taskState = "FAILED";
      onEvent({ type: "runner.error", payload: { sessionId: session.id, message: `ECS sub-agent failed: ${e.message}` } });
      onEvent({ type: "session.status", payload: { sessionId: session.id, status: "error", title: session.title, cwd: session.cwd, error: e.message } });
      readyReject!(e);
      for (const cb of closeCallbacks) cb(1);
    }
  })();

  return {
    ready,
    sendPrompt(text: string) {
      if (acpSessionId && transport) {
        doSendPrompt(text);
      } else {
        pendingPrompt = text;
      }
    },
    abort() {
      if (aborted) return;
      aborted = true;
      ecsInfo.taskState = "STOPPING";
      if (transport && acpSessionId) {
        transport.notify("session/cancel", { sessionId: acpSessionId });
      }
      transport?.close();
      // Stop the ECS task
      if (taskArn) {
        ecs.send(new StopTaskCommand({ cluster: config.cluster, task: taskArn, reason: "Session aborted" }))
          .catch((e: any) => console.warn(`[${tag}] Failed to stop task: ${e.message}`));
      }
    },
    onClose(callback: (code: number | null) => void) {
      closeCallbacks.push(callback);
    },
  };
}
