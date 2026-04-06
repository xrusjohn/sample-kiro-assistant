#!/bin/bash
# Start all three protocol servers:
#   ACP bridge on :8080
#   A2A adapter on :9000
#   MCP agent-tool on :8000
set -eu

node /home/kiro/acp-bridge.js &
ACP_PID=$!

node /home/kiro/a2a-adapter.js &
A2A_PID=$!

# MCP needs ACP bridge up first
sleep 2
node /home/kiro/mcp-agent-tool.js &
MCP_PID=$!

echo "[start-all] ACP :8080 (pid $ACP_PID), A2A :9000 (pid $A2A_PID), MCP :8000 (pid $MCP_PID)"

# Exit if any dies
wait -n $ACP_PID $A2A_PID $MCP_PID
kill $ACP_PID $A2A_PID $MCP_PID 2>/dev/null
exit 1
