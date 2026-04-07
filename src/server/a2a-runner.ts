/**
 * a2a-runner.ts — RunnerHandle that proxies prompts to a remote A2A agent instance.
 *
 * Instead of spawning a local kiro-cli process, this sends messages via
 * the A2A JSON-RPC protocol (message/send) to a registered agent container.
 */

import type { RunnerHandle } from './runner.js';
import type { ServerEvent } from '../electron/types.js';
import type { Session } from '../electron/libs/session-store.js';
import type { AgentInstance } from './a2a-types.js';

type EmitFn = (event: ServerEvent) => void;

export function createA2ARunner(opts: {
  session: Session;
  instance: AgentInstance;
  onEvent: EmitFn;
  onSessionUpdate?: (updates: Partial<Session>) => void;
  onFatalError?: (reason: string) => void;
}): RunnerHandle {
  const { session, instance, onEvent, onFatalError } = opts;
  let aborted = false;
  let closeCallback: ((code: number | null) => void) | undefined;

  const ready = Promise.resolve();

  function abort() {
    aborted = true;
    closeCallback?.(0);
  }

  async function sendPrompt(text: string) {
    if (aborted) return;

    onEvent({
      type: 'session.status',
      payload: { sessionId: session.id, status: 'running', title: session.title, cwd: session.cwd },
    });

    try {
      const res = await fetch(instance.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'message/send',
          params: {
            message: {
              parts: [{ kind: 'text', text }],
            },
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`A2A agent returned HTTP ${res.status}`);
      }

      const data = await res.json() as {
        result?: { artifacts?: Array<{ parts?: Array<{ text?: string }> }> };
        error?: { message?: string };
      };

      if (aborted) return;

      if (data.error) {
        throw new Error(data.error.message ?? 'A2A agent error');
      }

      // Extract text from response artifacts
      const responseText = data.result?.artifacts
        ?.flatMap(a => a.parts ?? [])
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n') ?? '(no response)';

      // Emit as an assistant message
      onEvent({
        type: 'stream.message',
        payload: {
          sessionId: session.id,
          message: {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: responseText }],
            },
          } as any,
        },
      });

      onEvent({
        type: 'session.status',
        payload: { sessionId: session.id, status: 'idle', title: session.title, cwd: session.cwd },
      });
    } catch (err) {
      if (aborted) return;
      const msg = (err as Error).message;
      console.error(`[a2a-runner] session=${session.id} instance=${instance.id} error: ${msg}`);

      // Classify the error and fall back if possible
      if (onFatalError) {
        const reason = msg.toLowerCase().includes('expired') ? 'credentials-expired'
          : msg.includes('ACP process exited') ? 'acp-crashed'
          : msg;
        onFatalError(reason);
        return;
      }

      const isAgentError = msg.startsWith('ACP process exited:');
      const displayMsg = isAgentError
        ? `🔴 Agent error (${instance.profileId} at ${instance.url}):\n${msg.replace('ACP process exited: ', '')}`
        : `⚠ Failed to reach agent ${instance.profileId} at ${instance.url}: ${msg}`;

      onEvent({
        type: 'stream.message',
        payload: {
          sessionId: session.id,
          message: {
            type: 'assistant',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: displayMsg }],
            },
          } as any,
        },
      });
      onEvent({
        type: 'session.status',
        payload: { sessionId: session.id, status: 'error', title: session.title, cwd: session.cwd, error: msg },
      });
    }
  }

  return {
    abort,
    sendPrompt,
    ready,
    onClose: (cb) => { closeCallback = cb; },
  };
}
