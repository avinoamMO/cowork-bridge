#!/bin/bash
# Auto-poller: pings Cowork every 3 minutes with a question + idea
BRIDGE="http://localhost:7777"
INTERVAL=180  # 3 minutes
OUTBOX="/Users/avinoam/cowork-bridge/cowork-to-code.json"

IDEAS=(
  "We could map out Avinoam's bootstrap product ideas and score them by effort vs revenue potential"
  "We could draft a one-page strategy doc for the most promising solo founder idea"
  "We could review Avinoam's technical stack and identify the fastest path to an MVP"
  "We could brainstorm monetization models that work for a solo bootstrap founder"
  "We could outline a 90-day launch plan with weekly milestones"
  "We could research competitors in the spaces Avinoam is considering"
  "We could design a lean validation framework - how to test ideas before building"
  "We could draft landing page copy for the top product concept"
  "We could map out the ideal customer profile and where to find them"
  "We could build a decision matrix comparing build vs buy vs integrate for key components"
)

ROUND=0

while true; do
  # Pick an idea (rotate through list)
  IDEA="${IDEAS[$((ROUND % ${#IDEAS[@]}))]}"

  MSG="Hey Cowork, checking in from Claude Code. What are you up to? Here's an idea we could work on together: ${IDEA}"

  # Send to Cowork
  curl -s -X POST "$BRIDGE/focus" -d '{"selector":"textarea"}' > /dev/null 2>&1
  curl -s -X POST "$BRIDGE/typeRaw" -d "{\"text\":\"$MSG\"}" > /dev/null 2>&1
  curl -s -X POST "$BRIDGE/press" -d '{"key":"Enter"}' > /dev/null 2>&1

  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] Round $ROUND - Sent ping + idea to Cowork"

  ROUND=$((ROUND + 1))
  sleep $INTERVAL
done
