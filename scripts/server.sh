#!/usr/bin/env bash
set -euo pipefail

SESSION="kiro-server"
PORT="${PORT:-3001}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Already running? (only block 'start')
if [ "${1:-start}" = "start" ] && tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "✓ $SESSION is already running (port $PORT)"
  echo "  Attach:  tmux attach -t $SESSION"
  echo "  Logs:    tmux capture-pane -t $SESSION -p"
  echo "  Stop:    $0 stop"
  exit 0
fi

case "${1:-start}" in
  start)
    echo "Building web UI..."
    cd "$DIR" && npm run build:web

    echo "Starting $SESSION in tmux on port $PORT..."
    tmux new-session -d -s "$SESSION" -c "$DIR" \
      "PORT=$PORT node dist-server/server/index.js; echo '[exited]'; read"

    # Wait for server to be ready
    for i in $(seq 1 15); do
      if curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
        echo "✓ Server running at http://localhost:$PORT"
        echo "  Attach:  tmux attach -t $SESSION"
        echo "  Stop:    $0 stop"
        exit 0
      fi
      sleep 1
    done
    echo "⚠ Server may still be starting — check: tmux attach -t $SESSION"
    ;;

  stop)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux send-keys -t "$SESSION" C-c
      sleep 2
      tmux kill-session -t "$SESSION" 2>/dev/null || true
      echo "✓ $SESSION stopped"
    else
      echo "No $SESSION session found"
    fi
    ;;

  restart)
    "$0" stop
    sleep 1
    "$0" start
    ;;

  status)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      echo "✓ $SESSION is running"
      tmux capture-pane -t "$SESSION" -p | tail -5
    else
      echo "✗ $SESSION is not running"
    fi
    ;;

  logs)
    if tmux has-session -t "$SESSION" 2>/dev/null; then
      tmux capture-pane -t "$SESSION" -p -S -100
    else
      echo "No $SESSION session found"
    fi
    ;;

  *)
    echo "Usage: $0 {start|stop|restart|status|logs}"
    exit 1
    ;;
esac
