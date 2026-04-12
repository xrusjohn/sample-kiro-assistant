#!/usr/bin/env node
/**
 * ws-agent.cjs — Remote agent using ACP (JSON-RPC over stdio).
 *
 * Spawns kiro-cli in ACP mode, keeps a persistent session, receives tasks
 * over WS from the orchestrator, and streams clean text back.
 *
 * Usage:
 *   node ws-agent.cjs --profile coding-assistant --tags math,general
 *   WS_AGENT_URL=wss://relay.example.com/ws/agent node ws-agent.cjs --profile browser-agent
 */

const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');

// ── Config ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); if (i >= 0 && i + 1 < argv.length) { const v = argv[i + 1]; argv.splice(i, 2); return v; } return null; };

const url       = opt('--url')      || process.env.WS_AGENT_URL      || 'ws://localhost:3001/ws/agent';
const profileId = opt('--profile')  || process.env.WS_AGENT_PROFILE  || 'remote-agent';
const platform  = opt('--platform') || process.env.WS_AGENT_PLATFORM || (os.platform() === 'win32' ? 'windows' : 'cdm');
const tags      = (opt('--tags')    || process.env.WS_AGENT_TAGS     || '').split(',').filter(Boolean);
const binary    = opt('--binary')   || process.env.WS_AGENT_BINARY   || 'kiro-cli';
const label     = opt('--label')    || process.env.WS_AGENT_LABEL    || `${profileId} (${os.hostname()})`;
const agentName = opt('--agent')    || process.env.WS_AGENT_AGENT    || 'kiro-assistant';

const dim    = (s) => `\x1b[2m${s}\x1b[0m`;
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// ── ACP Process (persistent) ──────────────────────────────────────────────
let acp = null;          // child process
let acpSessionId = null; // ACP session ID
let acpReady = false;
let acpBuffer = '';
let rpcId = 0;
let currentTaskId = null;
let accText = '';

function acpWrite(method, params = {}) {
  const id = ++rpcId;
  const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  console.log(dim(`[acp →] ${method}`));
  if (acp?.stdin?.writable) acp.stdin.write(msg);
  else console.log(red('[acp →] stdin not writable!'));
  return id;
}

function acpParse(buf) {
  const msgs = []; const lines = buf.split('\n'); const rest = lines.pop() || '';
  for (const l of lines) { const t = l.trim(); if (!t) continue; try { msgs.push(JSON.parse(t)); } catch {} }
  return { msgs, rest };
}

function startAcp() {
  const acpArgs = ['acp', '--agent', agentName, '--trust-all-tools'];
  console.log(dim(`Spawning: ${binary} ${acpArgs.join(' ')}`));

  acp = spawn(binary, acpArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1', CLICOLOR: '0', TERM: 'dumb' },
  });

  acp.stdout.on('data', (d) => {
    acpBuffer += d.toString();
    const { msgs, rest } = acpParse(acpBuffer);
    acpBuffer = rest;
    for (const m of msgs) handleAcp(m);
  });

  acp.stderr.on('data', (d) => {
    const t = d.toString().trim();
    if (t) console.log(dim(`[acp err] ${t.slice(0, 300)}`));
  });

  acp.on('close', (code) => {
    console.log(yellow(`[acp] exited code=${code}`));
    acpReady = false; acpSessionId = null;
    if (currentTaskId) {
      wsSend({ type: 'task.error', payload: { taskId: currentTaskId, error: `ACP exited (code ${code})` } });
      currentTaskId = null;
    }
    // Restart ACP after a delay
    setTimeout(() => startAcp(), 3000);
  });

  acpWrite('initialize', {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
    clientInfo: { name: 'ws-agent', version: '1.0.0' },
  });
}

function handleAcp(msg) {
  // initialize response → send session/new
  if (msg.result?.agentInfo && !acpSessionId) {
    console.log(dim(`[acp] Initialized (v${msg.result.protocolVersion})`));
    acpWrite('session/new', { cwd: process.cwd(), mcpServers: [] });
    return;
  }

  // session/new response
  if (msg.result?.sessionId && !acpSessionId) {
    acpSessionId = msg.result.sessionId;
    acpReady = true;
    console.log(green(`[acp] Session ready: ${acpSessionId.slice(0, 8)}`));
    return;
  }

  // session/new error → retry
  if (msg.error && !acpSessionId) {
    console.warn(yellow(`[acp] session/new failed: ${msg.error.message || JSON.stringify(msg.error)}`));
    acpWrite('session/new', { cwd: process.cwd(), mcpServers: [] });
    return;
  }

  // Streaming updates
  if (msg.method === 'session/update' && msg.params) {
    const u = msg.params.update || msg.params;
    const k = u.sessionUpdate || u.kind || u.type;

    if (k === 'agent_message_chunk') {
      const text = u.content?.text || '';
      if (text && currentTaskId) {
        accText += text;
        wsSend({ type: 'task.stream', payload: { taskId: currentTaskId, delta: text } });
      }
      return;
    }
    if (k === 'tool_call') {
      const title = u.title || u.toolName || u.name || 'unknown';
      const delta = `\n🛠️ ${title}\n`;
      if (currentTaskId) { accText += delta; wsSend({ type: 'task.stream', payload: { taskId: currentTaskId, delta } }); }
      return;
    }
    if (k === 'turn_end') { finishTask(); return; }
    return; // ignore other updates
  }

  // Response to session/prompt with stopReason
  if (msg.id && msg.result?.stopReason) { finishTask(); return; }

  // Errors during a task
  if (msg.error && currentTaskId) {
    console.log(red(`[task] error: ${msg.error.message}`));
    wsSend({ type: 'task.error', payload: { taskId: currentTaskId, error: msg.error.message || 'ACP error' } });
    currentTaskId = null; accText = '';
  }
}

function finishTask() {
  if (!currentTaskId) return;
  console.log(green(`[task] ${currentTaskId.slice(0, 8)}: done (${accText.length} chars)`));
  wsSend({ type: 'task.result', payload: { taskId: currentTaskId, text: accText } });
  currentTaskId = null; accText = '';
}

function runTask(taskId, prompt) {
  if (!acpReady || !acpSessionId) {
    wsSend({ type: 'task.error', payload: { taskId, error: 'ACP session not ready' } });
    return;
  }
  console.log(yellow(`[task] ${taskId.slice(0, 8)}: ${prompt.slice(0, 80)}`));
  currentTaskId = taskId; accText = '';
  acpWrite('session/prompt', { sessionId: acpSessionId, prompt: [{ type: 'text', text: prompt }] });
}

function cancelTask(taskId) {
  if (currentTaskId === taskId && acpSessionId) {
    acpWrite('session/cancel', { sessionId: acpSessionId });
    currentTaskId = null; accText = '';
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────
let ws = null;
let heartbeatInterval = null;
let reconnectDelay = 1000;

function wsSend(event) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
}

function connect() {
  console.log(dim(`Connecting to ${url}...`));
  ws = new WebSocket(url);

  ws.on('open', () => {
    reconnectDelay = 1000;
    console.log(green('Connected. Registering...'));
    wsSend({ type: 'agent.register', payload: { profileId, platform, tags, label, binary } });
    heartbeatInterval = setInterval(() => wsSend({ type: 'agent.heartbeat', payload: {} }), 30000);
  });

  ws.on('message', (raw) => {
    let event; try { event = JSON.parse(raw.toString()); } catch { return; }
    if (event.type === 'agent.registered') console.log(green(`Registered as ${event.payload.instanceId.slice(0, 8)} (${profileId})`));
    if (event.type === 'task.execute') {
      if (currentTaskId) { wsSend({ type: 'task.error', payload: { taskId: event.payload.taskId, error: 'Agent busy' } }); return; }
      runTask(event.payload.taskId, event.payload.prompt);
    }
    if (event.type === 'task.cancel') cancelTask(event.payload.taskId);
  });

  ws.on('close', () => {
    console.log(yellow('Disconnected.'));
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    setTimeout(() => { reconnectDelay = Math.min(reconnectDelay * 1.5, 30000); connect(); }, reconnectDelay);
  });

  ws.on('error', (err) => console.error(red(`WS error: ${err.message}`)));
}

// ── Main ───────────────────────────────────────────────────────────────────
console.log(`ws-agent: profile=${profileId} platform=${platform} binary=${binary} agent=${agentName}`);
console.log(`  tags: ${tags.length ? tags.join(', ') : '(none)'}`);
console.log(`  url: ${url}`);

startAcp();
connect();

process.on('SIGINT', () => {
  console.log(dim('\nShutting down...'));
  if (acp) acp.kill('SIGINT');
  if (ws) ws.close();
  process.exit(0);
});
