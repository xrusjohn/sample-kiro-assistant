#!/usr/bin/env node
/**
 * ws-agent.cjs — Remote agent that connects to the orchestrator via WebSocket.
 *
 * Registers itself, receives tasks, executes them with kiro-cli or claude-code,
 * streams results back. Works behind firewalls (outbound WS only).
 *
 * Usage:
 *   node ws-agent.cjs --url ws://relay.example.com/ws/agent --profile coding-assistant
 *   node ws-agent.cjs --url ws://localhost:3001/ws/agent --profile browser-agent --platform windows
 *
 * Env vars:
 *   WS_AGENT_URL       — orchestrator WS URL (default: ws://localhost:3001/ws/agent)
 *   WS_AGENT_PROFILE   — profile ID to register as
 *   WS_AGENT_PLATFORM  — platform (default: auto-detect)
 *   WS_AGENT_TAGS      — comma-separated tags
 *   WS_AGENT_BINARY    — CLI binary (default: kiro-cli on Linux/Mac, claude on Windows)
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');

// ── Config ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); if (i >= 0 && i + 1 < args.length) { const v = args[i + 1]; args.splice(i, 2); return v; } return null; };

const url = opt('--url') || process.env.WS_AGENT_URL || 'ws://localhost:3001/ws/agent';
const profileId = opt('--profile') || process.env.WS_AGENT_PROFILE || 'remote-agent';
const platform = opt('--platform') || process.env.WS_AGENT_PLATFORM || (os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'any' : 'linux');
const tags = (opt('--tags') || process.env.WS_AGENT_TAGS || '').split(',').filter(Boolean);
const binary = opt('--binary') || process.env.WS_AGENT_BINARY || (os.platform() === 'win32' ? 'claude' : 'kiro-cli');
const label = opt('--label') || process.env.WS_AGENT_LABEL || `${profileId} (${os.hostname()})`;

// ── Helpers ────────────────────────────────────────────────────────────────
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

let ws = null;
let instanceId = null;
let heartbeatInterval = null;
let reconnectDelay = 1000;
let activeTask = null; // { taskId, process }

function send(event) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

// ── Task execution ─────────────────────────────────────────────────────────
function executeTask(taskId, prompt) {
  console.log(yellow(`[task] ${taskId.slice(0, 8)}: ${prompt.slice(0, 80)}`));

  // Use claude CLI in print mode for simple prompt→response
  const isWindows = os.platform() === 'win32';
  const child = spawn(binary, ['--print', prompt], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
    env: { ...process.env, NO_COLOR: '1' },
  });

  activeTask = { taskId, process: child };
  let fullOutput = '';

  child.stdout.on('data', (data) => {
    const text = data.toString();
    fullOutput += text;
    send({ type: 'task.stream', payload: { taskId, delta: text } });
  });

  child.stderr.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.error(dim(`[stderr] ${text.slice(0, 200)}`));
  });

  child.on('close', (code) => {
    activeTask = null;
    if (code === 0 || code === null) {
      console.log(green(`[task] ${taskId.slice(0, 8)}: done (${fullOutput.length} chars)`));
      send({ type: 'task.result', payload: { taskId, text: fullOutput } });
    } else {
      console.log(red(`[task] ${taskId.slice(0, 8)}: failed (exit ${code})`));
      send({ type: 'task.error', payload: { taskId, error: `Process exited with code ${code}` } });
    }
  });

  child.on('error', (err) => {
    activeTask = null;
    console.error(red(`[task] ${taskId.slice(0, 8)}: spawn error: ${err.message}`));
    send({ type: 'task.error', payload: { taskId, error: err.message } });
  });
}

function cancelTask(taskId) {
  if (activeTask?.taskId === taskId) {
    console.log(yellow(`[task] Cancelling ${taskId.slice(0, 8)}`));
    activeTask.process.kill('SIGTERM');
    activeTask = null;
  }
}

// ── WebSocket connection ───────────────────────────────────────────────────
function connect() {
  console.log(dim(`Connecting to ${url}...`));
  ws = new WebSocket(url);

  ws.on('open', () => {
    reconnectDelay = 1000;
    console.log(green('Connected. Registering...'));

    send({
      type: 'agent.register',
      payload: { profileId, platform, tags, label, binary },
    });

    // Heartbeat every 30s
    heartbeatInterval = setInterval(() => send({ type: 'agent.heartbeat', payload: {} }), 30_000);
  });

  ws.on('message', (raw) => {
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }

    if (event.type === 'agent.registered') {
      instanceId = event.payload.instanceId;
      console.log(green(`Registered as ${instanceId.slice(0, 8)} (${profileId} / ${platform})`));
    }

    if (event.type === 'agent.heartbeat.ack') {
      // alive
    }

    if (event.type === 'task.execute') {
      const { taskId, prompt } = event.payload;
      if (activeTask) {
        send({ type: 'task.error', payload: { taskId, error: 'Agent busy with another task' } });
        return;
      }
      executeTask(taskId, prompt);
    }

    if (event.type === 'task.cancel') {
      cancelTask(event.payload.taskId);
    }
  });

  ws.on('close', () => {
    console.log(yellow('Disconnected.'));
    instanceId = null;
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }

    // Auto-reconnect
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
      connect();
    }, reconnectDelay);
  });

  ws.on('error', (err) => {
    console.error(red(`WS error: ${err.message}`));
  });
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log(`ws-agent: profile=${profileId} platform=${platform} binary=${binary}`);
console.log(`  tags: ${tags.length ? tags.join(', ') : '(none)'}`);
console.log(`  url: ${url}`);
connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(dim('\nShutting down...'));
  if (activeTask) activeTask.process.kill('SIGTERM');
  if (ws) ws.close();
  process.exit(0);
});
