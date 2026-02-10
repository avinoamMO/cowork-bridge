#!/bin/bash
# CoWork check-in cron - pings CoWork every 10 min if no recent comms
# Takes screenshot and wakes Claude Code via tmux send-keys

BRIDGE="http://localhost:7777"
INTERVAL=600  # 10 minutes in seconds
LAST_COMMS_FILE="/tmp/cowork-last-comms"
SCREENSHOT="checkin-latest.png"
LOG="/tmp/cowork-checkin.log"
TMUX_SESSION="${TMUX_TARGET:-17}"

# Initialize last comms time to now
date +%s > "$LAST_COMMS_FILE"

log() {
  echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

wake_claude_code() {
  # Send a user message into Claude Code's tmux pane
  # -l sends literal text (prevents tmux interpreting chars as key names)
  # -H 0d sends raw hex carriage return (works with Claude Code's TUI, unlike Enter/C-j)
  local msg="$1"
  local pane="${TMUX_SESSION}:0.1"  # active pane in session
  tmux send-keys -l -t "$pane" "$msg" 2>/dev/null
  sleep 1
  tmux send-keys -H -t "$pane" 0d 2>/dev/null
  log "Sent wake-up to Claude Code (tmux pane $pane)"
}

log "CoWork check-in cron started (every ${INTERVAL}s of silence, waking tmux:$TMUX_SESSION)"

while true; do
  sleep 60  # check every minute

  # Read last comms timestamp
  if [ -f "$LAST_COMMS_FILE" ]; then
    last=$(cat "$LAST_COMMS_FILE")
  else
    last=0
  fi

  now=$(date +%s)
  elapsed=$((now - last))

  if [ "$elapsed" -ge "$INTERVAL" ]; then
    log "10 min silence detected. Checking in with CoWork..."

    # Check bridge is alive
    status=$(curl -s -o /dev/null -w "%{http_code}" "$BRIDGE/status" 2>/dev/null)
    if [ "$status" != "200" ]; then
      log "Bridge not responding (HTTP $status). Skipping."
      continue
    fi

    # Send check-in message to CoWork
    curl -s -X POST "$BRIDGE/typeRaw" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"Hey CoWork, automated check-in from Claude Code. Any updates, new tasks, or things I should work on? Please write to /tmp/cowork-response.md if you have anything.\"}" > /dev/null

    sleep 0.3
    curl -s -X POST "$BRIDGE/press" -d '{"key":"Enter"}' > /dev/null

    log "Check-in sent. Waiting 60s for response..."
    sleep 60

    # Take screenshot of response
    curl -s -X POST "$BRIDGE/screenshot" \
      -H 'Content-Type: application/json' \
      -d "{\"filename\":\"$SCREENSHOT\"}" > /dev/null

    log "Screenshot saved to $SCREENSHOT"

    # Reset the timer
    date +%s > "$LAST_COMMS_FILE"

    # Wake Claude Code — tell it to check the screenshot
    wake_claude_code "CoWork cron check-in fired. Read /Users/avinoam/cowork-bridge/$SCREENSHOT and check /tmp/cowork-response.md for any new tasks from CoWork."
  fi
done
