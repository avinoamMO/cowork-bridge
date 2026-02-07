#!/bin/bash
# CoWork Poller — nudges Claude Code every 3 minutes to check on CoWork
# Writes to a watched file that Claude Code can monitor

INTERVAL=180  # 3 minutes
BRIDGE="http://localhost:7777"
POLL_FILE="/Users/avinoam/cowork-bridge/poll-nudge.txt"

echo "[Poller] Starting CoWork poller (every ${INTERVAL}s)"
echo "[Poller] Will write nudges to: $POLL_FILE"

while true; do
  sleep $INTERVAL

  # Check if bridge is alive
  STATUS=$(curl -s --max-time 3 "$BRIDGE/status" 2>/dev/null)
  if [ $? -ne 0 ]; then
    echo "[Poller] Bridge not responding, skipping"
    continue
  fi

  # Grab latest visible text from CoWork's page
  PAGE_TEXT=$(curl -s --max-time 5 -X POST "$BRIDGE/text" 2>/dev/null | head -c 2000)

  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

  # Write nudge file — Claude Code can read this
  echo "[$TIMESTAMP] COWORK CHECK — Read CoWork's latest response via: curl -s -X POST http://localhost:7777/text | tail -c 2000" > "$POLL_FILE"

  echo "[$TIMESTAMP] Nudge written"
done
