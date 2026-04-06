#!/bin/bash
# Start both ACP bridge (8080) and A2A adapter (9000)
set -eu

node /home/kiro/a2a-adapter.js &
A2A_PID=$!

node /home/kiro/acp-bridge.js &
ACP_PID=$!

echo "[start-both] ACP bridge on :8080 (pid $ACP_PID), A2A adapter on :9000 (pid $A2A_PID)"

# Exit if either dies
wait -n $A2A_PID $ACP_PID
kill $A2A_PID $ACP_PID 2>/dev/null
exit 1
