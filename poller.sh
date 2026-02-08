#!/bin/bash
# CoWork Smart Poller v0.3 — Only nudges when content actually changes
# Uses content hashing to detect new CoWork responses

INTERVAL=60  # Check every 60 seconds (faster checks, fewer false nudges)
BRIDGE="http://localhost:7777"
LAST_HASH=""
NUDGE_FILE="$HOME/cowork-bridge/poll-nudge.txt"
TASK_QUEUE="$HOME/coverage-reports/tasks/agent-task-queue.json"

echo "[Poller v0.3] Starting smart poller (every ${INTERVAL}s)"
echo "[Poller v0.3] Content-hash mode — zero false nudges"
echo "[Poller v0.3] Nudge file: $NUDGE_FILE"

while true; do
  sleep $INTERVAL

  # Check if bridge is alive
  STATUS=$(curl -s --max-time 3 "$BRIDGE/status" 2>/dev/null)
  if [ $? -ne 0 ]; then
    echo "[Poller v0.3] Bridge not responding, skipping"
    continue
  fi

  # Get current page text (last 3000 chars = most recent response area)
  PAGE_TEXT=$(curl -s --max-time 5 "$BRIDGE/text" 2>/dev/null | tail -c 3000)
  [ -z "$PAGE_TEXT" ] && continue

  # Hash it
  CURRENT_HASH=$(echo "$PAGE_TEXT" | shasum -a 256 | cut -d' ' -f1)

  # Only nudge if content changed AND we have a previous hash to compare
  if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -n "$LAST_HASH" ]; then
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

    # Write the ACTUAL new content into the nudge file
    echo "[$TIMESTAMP] NEW COWORK RESPONSE DETECTED" > "$NUDGE_FILE"
    echo "---" >> "$NUDGE_FILE"
    echo "$PAGE_TEXT" | tail -c 2000 >> "$NUDGE_FILE"

    # Also update the task queue flag if it exists
    if [ -f "$TASK_QUEUE" ]; then
      # Use python to safely update JSON
      python3 -c "
import json, sys
try:
    with open('$TASK_QUEUE', 'r') as f:
        data = json.load(f)
    data['coworkHasNewMessage'] = True
    data['lastCoworkUpdate'] = '$TIMESTAMP'
    with open('$TASK_QUEUE', 'w') as f:
        json.dump(data, f, indent=2)
except Exception as e:
    print(f'[Poller] Could not update task queue: {e}', file=sys.stderr)
" 2>/dev/null
    fi

    # Notify Code's tmux terminal (NOT CoWork's chat)
    if tmux has-session -t claude 2>/dev/null; then
      tmux send-keys -t claude "echo '📬 CoWork has new content — check tasks/agent-task-queue.json'" Enter
    fi

    echo "[$TIMESTAMP] New content detected, nudge written"
  else
    # No change — do nothing. This is the key improvement.
    :
  fi

  LAST_HASH="$CURRENT_HASH"
done
