#!/usr/bin/env bash
# scripts/test-a2a-local.sh — validate a2a-adapter before deploying
# Fast checks (~5s): syntax, ping, agent-card, error handling
# Slow check (opt-in): full LLM round-trip — run with --full
set -euo pipefail

PORT=9001
SESSION_ID="test-$(date +%s)"
FULL=${1:-}

fail() { echo "FAIL: $*"; kill $ADAPTER_PID 2>/dev/null; exit 1; }

# 1. Syntax check (instant) — node --check doesn't execute, just parses
echo "=== syntax ==="
node --check scripts/a2a-adapter.js 2>&1 || fail "syntax error in a2a-adapter.js"
echo "OK"

# 2. Start adapter
echo "=== starting adapter on :$PORT ==="
PORT=$PORT node scripts/a2a-adapter.js > /tmp/a2a-test.log 2>&1 &
ADAPTER_PID=$!
trap "kill $ADAPTER_PID 2>/dev/null; wait $ADAPTER_PID 2>/dev/null" EXIT

for i in $(seq 1 10); do
  sleep 1
  curl -sf --max-time 1 http://localhost:$PORT/ping > /dev/null 2>&1 && break
  [ $i -eq 10 ] && fail "adapter didn't start — check /tmp/a2a-test.log"
done
echo "OK (pid $ADAPTER_PID)"

# 3. /ping
echo "=== /ping ==="
curl -sf --max-time 3 http://localhost:$PORT/ping | \
  python3 -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='Healthy', d" && echo "OK"

# 4. agent-card
echo "=== agent-card ==="
curl -sf --max-time 3 http://localhost:$PORT/.well-known/agent-card.json | \
  python3 -c "
import json,sys; d=json.load(sys.stdin)
assert d['capabilities']['streaming'], 'streaming not advertised'
assert d['skills'], 'no skills'
print('OK:', d['name'])
"

# 5. Unknown method → -32601
echo "=== unknown method ==="
echo -n '{"jsonrpc":"2.0","id":"t1","method":"bad/method","params":{}}' | \
  curl -sf --max-time 3 -X POST http://localhost:$PORT/ \
  -H "Content-Type: application/json" --data-binary @- | \
  python3 -c "import json,sys; d=json.load(sys.stdin); assert d['error']['code']==-32601, d" && echo "OK"

# 6. Empty text → -32052
echo "=== empty text ==="
echo -n '{"jsonrpc":"2.0","id":"t2","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":""}],"messageId":"m1"}}}' | \
  curl -sf --max-time 3 -X POST http://localhost:$PORT/ \
  -H "Content-Type: application/json" \
  -H "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: $SESSION_ID" \
  --data-binary @- | \
  python3 -c "import json,sys; d=json.load(sys.stdin); assert d['error']['code']==-32052, d" && echo "OK"

echo ""
echo "✅ fast checks passed"

# 7. Full LLM round-trip (opt-in, ~15s)
if [ "$FULL" = "--full" ]; then
  echo ""
  echo "=== message/send (LLM round-trip, 60s timeout) ==="
  PAYLOAD='{"jsonrpc":"2.0","id":"t3","method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"say PONG and nothing else"}],"messageId":"m2"}}}'
  echo -n "$PAYLOAD" | curl -sf --max-time 60 -X POST http://localhost:$PORT/ \
    -H "Content-Type: application/json" \
    -H "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: ${SESSION_ID}-full" \
    --data-binary @- | \
    python3 -c "
import json,sys; d=json.load(sys.stdin)
assert 'result' in d, f'no result: {d}'
text = d['result']['artifacts'][0]['parts'][0]['text']
assert text.strip(), 'empty response'
print('OK:', text[:80])
"

  echo "=== message/stream (SSE, 60s timeout) ==="
  STREAM_PAYLOAD='{"jsonrpc":"2.0","id":"t4","method":"message/stream","params":{"message":{"role":"user","parts":[{"kind":"text","text":"say PONG and nothing else"}],"messageId":"m3"}}}'
  STREAM=$(echo -n "$STREAM_PAYLOAD" | curl -sf --max-time 60 -X POST http://localhost:$PORT/ \
    -H "Content-Type: application/json" \
    -H "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: ${SESSION_ID}-stream" \
    --data-binary @- -N)
  echo "$STREAM" | grep -q "turn_end" && echo "OK: got turn_end" || fail "no turn_end in SSE stream"

  echo ""
  echo "✅ full checks passed"
fi
