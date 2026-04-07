#!/usr/bin/env node
/**
 * relay-cli — talk to the Kiro Assistant orchestrator from the terminal.
 *
 * Usage:
 *   node scripts/relay-cli.js                        # interactive — list sessions, pick one or create new
 *   node scripts/relay-cli.js --list                  # list sessions
 *   node scripts/relay-cli.js --session <id> "prompt" # one-shot: send prompt, print response, exit
 *   node scripts/relay-cli.js --session <id>          # interactive on existing session
 *   node scripts/relay-cli.js --new "prompt"           # create new session with initial prompt
 *   node scripts/relay-cli.js --new --title "My Task"  # create with title
 */

const WebSocket = require('ws');
const readline = require('readline');

const BASE = process.env.RELAY_URL || 'http://localhost:3001';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

// ── arg parse ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) { args.splice(i, 1); return true; } return false; };
const opt = (name) => { const i = args.indexOf(name); if (i >= 0 && i + 1 < args.length) { const v = args[i + 1]; args.splice(i, 2); return v; } return null; };

const doList = flag('--list');
const doNew = flag('--new');
const doDetach = flag('--detach') || flag('-d');
const sessionId = opt('--session') || opt('-s');
const title = opt('--title') || opt('-t');
const source = opt('--as') || 'supervisor';
const cwd = opt('--cwd') || process.cwd();
const oneShot = args.length > 0 ? args.join(' ') : null;

// ── helpers ────────────────────────────────────────────────────────────────
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

async function fetchJSON(path) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

// ── list sessions ──────────────────────────────────────────────────────────
async function listSessions() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const allSessions = [];

    ws.on('open', () => {
      // Wait for agents.list to arrive first, then request sessions
      setTimeout(() => ws.send(JSON.stringify({ type: 'session.list', payload: {} })), 200);
    });
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());
      if (event.type === 'session.list') {
        for (const s of event.payload.sessions) allSessions.push(s);
        ws.close();
      }
    });
    ws.on('close', () => resolve(allSessions));
    ws.on('error', () => resolve([]));
    setTimeout(() => { ws.close(); resolve(allSessions); }, 5000);
  });
}

async function printSessions() {
  const sessions = await listSessions();
  if (sessions.length === 0) { console.log(dim('No sessions.')); return sessions; }

  console.log(bold(`\n  Sessions (${sessions.length}):\n`));
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const dot = s.status === 'running' ? green('●') : s.status === 'idle' ? yellow('○') : red('✕');
    const runner = s.hasRunner ? green(' [live]') : '';
    console.log(`  ${dim(String(i + 1).padStart(2))}  ${dot} ${s.title || dim('untitled')}${runner}`);
    console.log(`      ${dim(s.id)}`);
  }
  console.log();
  return sessions;
}

// ── interactive session ────────────────────────────────────────────────────
function connectSession(targetSessionId, initialPrompt) {
  const ws = new WebSocket(WS_URL);
  let currentSessionId = targetSessionId;
  let status = 'connecting';
  let streaming = false;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => { if (!streaming) rl.question(cyan('\n> '), handleInput); };

  function handleInput(text) {
    text = text.trim();
    if (!text) { prompt(); return; }
    if (text === '/quit' || text === '/q') { ws.close(); process.exit(0); }
    if (text === '/status') {
      console.log(dim(`session=${currentSessionId} status=${status}`));
      prompt(); return;
    }

    const event = currentSessionId
      ? { type: 'session.continue', payload: { sessionId: currentSessionId, prompt: text, source } }
      : { type: 'session.start', payload: { prompt: text, title: title || text.slice(0, 60), cwd, source } };

    ws.send(JSON.stringify(event));
    streaming = true;
  }

  ws.on('open', () => {
    console.log(dim(`Connected to ${WS_URL}`));
    if (initialPrompt) {
      handleInput(initialPrompt);
    } else {
      prompt();
    }
  });

  ws.on('message', (data) => {
    const event = JSON.parse(data.toString());

    if (event.type === 'session.status') {
      const s = event.payload;
      status = s.status;
      if (!currentSessionId && s.sessionId) currentSessionId = s.sessionId;

      if (s.status === 'running' && doDetach) {
        console.log(dim(`\nSession ${currentSessionId?.slice(0,8)} is running. Detaching.`));
        ws.close(); process.exit(0);
      }

      if (s.status === 'idle') {
        streaming = false;
        if (oneShot) { ws.close(); process.exit(0); }
        prompt();
      } else if (s.status === 'error') {
        console.error(red(`\n[error] ${s.error || 'unknown'}`));
        streaming = false;
        prompt();
      }
    }

    if (event.type === 'stream.message' && event.payload.sessionId === currentSessionId) {
      const msg = event.payload.message;
      if (msg?.type === 'stream_event' && msg.event?.delta?.text) {
        process.stdout.write(msg.event.delta.text);
      }
    }

    if (event.type === 'runner.error') {
      console.error(red(`\n[error] ${event.payload.message}`));
      streaming = false;
      prompt();
    }

    // Capture session ID from new sessions
    if (event.type === 'session.status' && !currentSessionId) {
      currentSessionId = event.payload.sessionId;
    }
  });

  ws.on('close', () => { console.log(dim('\nDisconnected.')); process.exit(0); });
  ws.on('error', (err) => { console.error(red(`WS error: ${err.message}`)); process.exit(1); });
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  if (doList) {
    await printSessions();
    process.exit(0);
  }

  if (sessionId) {
    console.log(dim(`Resuming session ${sessionId.slice(0, 8)}...`));
    connectSession(sessionId, oneShot);
    return;
  }

  if (doNew) {
    console.log(dim('Starting new session...'));
    connectSession(null, oneShot);
    return;
  }

  // Interactive: list sessions, let user pick
  const sessions = await printSessions();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question(cyan('  Enter # to resume, or "new" to create: '), (answer) => {
    rl.close();
    answer = answer.trim();

    if (answer === 'new' || answer === 'n') {
      console.log(dim('Starting new session...'));
      connectSession(null, null);
      return;
    }

    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < sessions.length) {
      console.log(dim(`Resuming "${sessions[idx].title || 'untitled'}"...`));
      connectSession(sessions[idx].id, null);
    } else {
      console.log(red('Invalid selection.'));
      process.exit(1);
    }
  });
}

main().catch((err) => { console.error(red(err.message)); process.exit(1); });
