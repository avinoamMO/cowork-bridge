#!/bin/bash
# ============================================
# COWORK BRIDGE CLI v4
# ============================================
# Command-line interface for Cowork Bridge HTTP API
# Provides easy access to DOM querying, actions, and bidirectional messaging
# ============================================

BRIDGE="http://localhost:7777"

case "$1" in
  # ============================================
  # QUERY ENDPOINTS - Read-only operations
  # ============================================

  elements)
    # Get all interactive elements (buttons, links, inputs, etc.)
    curl -s "$BRIDGE/elements" | jq .
    ;;

  textareas)
    # Get all text input fields (textarea, contenteditable, text inputs)
    curl -s "$BRIDGE/textareas" | jq .
    ;;

  buttons)
    # Get all button elements with their properties
    curl -s "$BRIDGE/buttons" | jq .
    ;;

  text)
    # Get visible text from page body (limited to 5000 chars)
    curl -s "$BRIDGE/text"
    ;;

  html)
    # Get full HTML content of the page
    curl -s "$BRIDGE/html"
    ;;

  log)
    # Show conversation log (last 20 messages by default)
    # Usage: ./cowork-cli.sh log [number]
    LIMIT="${2:-20}"
    curl -s --data-raw "{\"last\":$LIMIT}" "$BRIDGE/log" | jq .
    ;;

  # ============================================
  # ACTION ENDPOINTS - DOM interactions
  # ============================================

  click)
    # Click an element by CSS selector
    # Usage: ./cowork-cli.sh click "button.send"
    curl -s -X POST --data-raw "{\"selector\":\"$2\"}" "$BRIDGE/click" | jq .
    ;;

  clickText)
    # Click an element containing specific text
    # Usage: ./cowork-cli.sh clickText "Submit"
    curl -s -X POST --data-raw "{\"text\":\"$2\"}" "$BRIDGE/clickText" | jq .
    ;;

  clickCoords)
    # Click at specific x,y coordinates
    # Usage: ./cowork-cli.sh clickCoords 100 200
    curl -s -X POST --data-raw "{\"x\":$2,\"y\":$3}" "$BRIDGE/clickCoords" | jq .
    ;;

  type)
    # Type text into a selector (clears existing content first)
    # Usage: ./cowork-cli.sh type "textarea" "Hello world"
    curl -s -X POST --data-raw "{\"selector\":\"$2\",\"text\":\"$3\"}" "$BRIDGE/type" | jq .
    ;;

  typeRaw)
    # Type into the currently focused element
    # Usage: ./cowork-cli.sh typeRaw "Hello world"
    curl -s -X POST --data-raw "{\"text\":\"$2\"}" "$BRIDGE/typeRaw" | jq .
    ;;

  press)
    # Press a keyboard key (Enter, Escape, ArrowDown, etc.)
    # Usage: ./cowork-cli.sh press Enter
    curl -s -X POST --data-raw "{\"key\":\"$2\"}" "$BRIDGE/press" | jq .
    ;;

  screenshot)
    # Take a screenshot and save to bridge directory
    # Usage: ./cowork-cli.sh screenshot [filename.png]
    FILENAME="${2:-screenshot.png}"
    curl -s -X POST --data-raw "{\"filename\":\"$FILENAME\"}" "$BRIDGE/screenshot" | jq .
    ;;

  focus)
    # Focus an element by selector
    # Usage: ./cowork-cli.sh focus "textarea"
    curl -s -X POST --data-raw "{\"selector\":\"$2\"}" "$BRIDGE/focus" | jq .
    ;;

  # ============================================
  # QUICK ACTIONS - Convenience shortcuts
  # ============================================

  send)
    # Quick send: focus textarea, type message, press Enter
    # Usage: ./cowork-cli.sh send "Hello from CLI"
    curl -s -X POST --data-raw '{"selector":"textarea"}' "$BRIDGE/focus" > /dev/null
    curl -s -X POST --data-raw "{\"text\":\"$2\"}" "$BRIDGE/typeRaw" > /dev/null
    curl -s -X POST --data-raw '{"key":"Enter"}' "$BRIDGE/press" | jq .
    ;;

  # ============================================
  # BIDIRECTIONAL MESSAGING
  # ============================================

  outbox)
    # Read messages from Cowork to Claude Code
    # Messages are stored in outbox.json
    curl -s "$BRIDGE/outbox" | jq .
    ;;

  clear)
    # Clear the outbox (mark all messages as read)
    curl -s -X POST "$BRIDGE/clearOutbox" | jq .
    ;;

  toClaudeCode)
    # Send a message from bridge to Claude Code via outbox.json
    # Also triggers tmux notification if enabled
    # Usage: ./cowork-cli.sh toClaudeCode "Task complete" '{"result":"success"}'
    DATA="${3:-{}}"
    curl -s -X POST --data-raw "{\"message\":\"$2\",\"data\":$DATA}" "$BRIDGE/toClaudeCode" | jq .
    ;;

  notify)
    # Test: send message to yourself via Cowork bridge
    # Usage: ./cowork-cli.sh notify "Test message"
    curl -s -X POST --data-raw "{\"message\":\"$2\",\"data\":{}}" "$BRIDGE/toClaudeCode" | jq .
    ;;

  # ============================================
  # HEALTH & STATUS
  # ============================================

  status)
    # Comprehensive health check: uptime, connections, file status
    curl -s "$BRIDGE/status" | jq .
    ;;

  ping)
    # Simple health check (legacy, use 'status' for more info)
    curl -s "$BRIDGE/ping" | jq .
    ;;

  # ============================================
  # HELP
  # ============================================

  *)
    echo "================================================================"
    echo "COWORK BRIDGE CLI v4 (Bidirectional)"
    echo "================================================================"
    echo ""
    echo "QUERY - Read page state:"
    echo "  elements           - Get all interactive elements"
    echo "  textareas          - Get all text input fields"
    echo "  buttons            - Get all button elements"
    echo "  text               - Get visible text from page"
    echo "  html               - Get full HTML content"
    echo "  log [N]            - Show last N conversation messages (default: 20)"
    echo ""
    echo "ACTIONS - Interact with page:"
    echo "  click <sel>        - Click element by CSS selector"
    echo "  clickText <txt>    - Click element containing text"
    echo "  clickCoords <x> <y> - Click at coordinates"
    echo "  type <sel> <txt>   - Type text into selector (clears first)"
    echo "  typeRaw <txt>      - Type into focused element"
    echo "  press <key>        - Press keyboard key (Enter, Escape, etc.)"
    echo "  screenshot [file]  - Take screenshot (default: screenshot.png)"
    echo "  focus <sel>        - Focus an element"
    echo ""
    echo "QUICK ACTIONS:"
    echo "  send <msg>         - Focus textarea, type message, press Enter"
    echo ""
    echo "BIDIRECTIONAL MESSAGING:"
    echo "  outbox             - Read messages from Cowork"
    echo "  clear              - Clear outbox"
    echo "  toClaudeCode <msg> - Send message to Claude Code via outbox"
    echo "  notify <msg>       - Test: send message to yourself"
    echo ""
    echo "HEALTH & STATUS:"
    echo "  status             - Comprehensive health check"
    echo "  ping               - Simple health check"
    echo ""
    echo "Examples:"
    echo "  ./cowork-cli.sh textareas"
    echo "  ./cowork-cli.sh send 'Hello from CLI'"
    echo "  ./cowork-cli.sh log 50"
    echo "  ./cowork-cli.sh status"
    echo ""
    echo "Bridge URL: $BRIDGE"
    echo "================================================================"
    ;;
esac
