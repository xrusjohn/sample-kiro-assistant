#!/usr/bin/env node
/**
 * Non-interactive test: create a session mentioning "workshop",
 * verify it routes to the remote A2A agent and gets a response.
 */
const WebSocket = require('ws');

const WS_URL = 'ws://localhost:3001/ws';
const PROMPT = 'Tell me about the workshop security profiles for AI agents';
const TIMEOUT_MS = 30_000;

async function main() {
  console.log('Connecting to', WS_URL);
  const ws = new WebSocket(WS_URL);

  let sessionId = null;
  let gotResponse = false;
  let responseText = '';

  const timeout = setTimeout(() => {
    console.error('✗ TIMEOUT — no response within', TIMEOUT_MS / 1000, 'seconds');
    ws.close();
    process.exit(1);
  }, TIMEOUT_MS);

  ws.on('open', () => {
    console.log('Connected. Starting session with workshop prompt...');
    ws.send(JSON.stringify({
      type: 'session.start',
      payload: {
        title: 'A2A Routing Test',
        prompt: PROMPT,
        interactive: false,
      },
    }));
  });

  ws.on('message', (raw) => {
    const event = JSON.parse(raw.toString());

    if (event.type === 'session.status') {
      const s = event.payload;
      console.log(`  [status] session=${s.sessionId?.slice(0, 8)} status=${s.status}`);
      if (!sessionId) sessionId = s.sessionId;

      if (s.status === 'idle' && gotResponse) {
        clearTimeout(timeout);
        console.log('\n✓ SUCCESS — got response from remote agent:');
        console.log('  ' + responseText.slice(0, 200) + (responseText.length > 200 ? '...' : ''));
        ws.close();
        process.exit(0);
      }
      if (s.status === 'error') {
        clearTimeout(timeout);
        console.error('✗ Session error:', s.error);
        ws.close();
        process.exit(1);
      }
    }

    if (event.type === 'stream.message') {
      const msg = event.payload.message;
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            gotResponse = true;
            responseText += block.text;
            console.log(`  [assistant] ${block.text.slice(0, 100)}...`);
          }
        }
      }
    }

    if (event.type === 'runner.error') {
      clearTimeout(timeout);
      console.error('✗ Runner error:', event.payload.message);
      ws.close();
      process.exit(1);
    }
  });

  ws.on('error', (err) => {
    clearTimeout(timeout);
    console.error('✗ WebSocket error:', err.message);
    process.exit(1);
  });
}

main();
