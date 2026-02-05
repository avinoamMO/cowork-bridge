# Cowork Bridge - Technical Architecture for AI Agents

**Purpose**: This document explains the cowork-bridge system for AI agents (LLMs) working with this codebase. It describes bidirectional communication between Claude Code (CLI) and Claude Cowork (desktop app).

**Target Audience**: Claude Code agents, future AI assistants, autonomous systems

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Communication Channels](#communication-channels)
4. [API Reference](#api-reference)
5. [Usage Guide for Claude Code](#usage-guide-for-claude-code)
6. [Usage Guide for Cowork](#usage-guide-for-cowork)
7. [Configuration](#configuration)
8. [Failure Modes & Recovery](#failure-modes--recovery)
9. [Security Considerations](#security-considerations)
10. [Implementation Details](#implementation-details)

---

## System Overview

### What is Cowork Bridge?

The cowork-bridge is a Node.js server that enables bidirectional communication between:
- **Claude Code**: Terminal-based AI agent (this CLI)
- **Claude Cowork**: Desktop Electron app with web UI

### How It Works

```
┌─────────────┐         HTTP API          ┌──────────────┐         CDP           ┌─────────────┐
│ Claude Code │ ◄──────────────────────► │ Bridge Server│ ◄─────────────────► │Claude Cowork│
│  (CLI)      │         File Watch        │  (Node.js)   │   (Puppeteer)        │ (Electron)  │
└─────────────┘ ◄──────────────────────► └──────────────┘                       └─────────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────┐
                                    │  Shared Files        │
                                    │  - conversation.log  │
                                    │  - outbox.json       │
                                    │  - cowork-to-code.json│
                                    └──────────────────────┘
```

**Key Components**:
1. **Bridge Server** (bridge.js): HTTP API + file watcher + CDP connection
2. **Puppeteer**: Controls Claude Desktop via Chrome DevTools Protocol
3. **Shared Files**: JSON-based async messaging between agents
4. **Conversation Log**: Persistent record of all messages

---

## Architecture

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Bridge Server | Node.js HTTP | Exposes REST API for Claude Code |
| Browser Control | Puppeteer-core | DOM automation via CDP |
| IPC | JSON files + fs.watch() | Async messaging between agents |
| Notifications | Tmux send-keys | Wake Claude Code when Cowork sends messages |
| Logging | Text file append | Persistent conversation history |

### Prerequisites

1. **Patched Claude Desktop**: Must have CDP enabled on port 9222
   - Standard Claude.app does **NOT** work
   - Requires custom build: `Claude-Debug.app`
   - Patching process (see Implementation Details section)

2. **Running Services**:
   - Claude Desktop (with CDP enabled)
   - Bridge server (node bridge.js)
   - Claude Code CLI (optional, for receiving messages)

### Ports

| Port | Service | Purpose |
|------|---------|---------|
| 7777 | Bridge HTTP API | Default API endpoint |
| 9222 | Chrome DevTools Protocol | Browser control connection |

---

## Communication Channels

### 1. Claude Code → Cowork (HTTP API)

**Method**: HTTP POST/GET requests to localhost:7777

**Capabilities**:
- Type text into focused elements
- Click buttons and elements
- Press keyboard keys
- Read page content
- Take screenshots
- Query DOM elements

**Example Flow**:
```bash
# Send message
curl -X POST http://localhost:7777/typeRaw --data-raw '{"text":"Hello Cowork"}'
curl -X POST http://localhost:7777/press --data-raw '{"key":"Enter"}'

# Read response
curl http://localhost:7777/text
```

### 2. Cowork → Claude Code (Shared File)

**Method**: JSON file writes monitored by fs.watch()

**Flow**:
1. Cowork writes to `~/cowork-bridge/cowork-to-code.json`
2. Bridge detects file change (500ms debounce)
3. Bridge logs message to `conversation.log`
4. (Optional) Bridge sends tmux notification to Claude Code terminal

**File Format**:
```json
[
  {
    "timestamp": "2026-02-05T12:34:56.789Z",
    "message": "Message text here",
    "data": {
      "key": "optional metadata"
    }
  }
]
```

### 3. Conversation Log (Persistent History)

**File**: `~/cowork-bridge/conversation.log`

**Format**:
```
[2026-02-05 12:34:56] → TO COWORK: Hello from Claude Code
[2026-02-05 12:35:02] ← FROM COWORK: Got it, working on that now
[2026-02-05 12:35:10] → TO COWORK: Send me the results
```

**Access**:
```bash
# Read last 20 lines
tail -20 ~/cowork-bridge/conversation.log

# Via API (last 10 messages)
curl http://localhost:7777/log --data-raw '{"last":10}'
```

### 4. Outbox System (Bridge → Claude Code)

**File**: `~/cowork-bridge/outbox.json`

**Purpose**: Bridge can send messages to Claude Code programmatically

**Usage** (from bridge code):
```javascript
sendToClaudeCode("Task completed", { resultCount: 42 });
```

**Claude Code reads**:
```bash
curl http://localhost:7777/outbox
# or
cat ~/cowork-bridge/outbox.json
```

---

## API Reference

### Base URL
```
http://localhost:7777
```

### Query Endpoints (GET)

#### GET /text
Returns visible text from the page body (limited to 5000 characters).

**Response**:
```json
"This is the visible text content..."
```

---

#### GET /html
Returns full HTML content of the page.

**Response**:
```json
"<!DOCTYPE html><html>...</html>"
```

---

#### GET /elements
Returns all interactive elements with properties.

**Response**:
```json
[
  {
    "tag": "button",
    "type": null,
    "id": "submit-btn",
    "class": "primary-button",
    "text": "Submit",
    "placeholder": null,
    "ariaLabel": "Submit form",
    "role": "button",
    "selector": "#submit-btn",
    "bounds": {"x": 100, "y": 200, "width": 80, "height": 40}
  }
]
```

---

#### GET /textareas
Returns all text input fields (textarea, contenteditable, input[type=text]).

**Response**:
```json
[
  {
    "index": 0,
    "tag": "textarea",
    "id": "message-input",
    "class": "chat-input",
    "placeholder": "Type a message...",
    "value": "Current content",
    "bounds": {"x": 50, "y": 300, "width": 400, "height": 100},
    "visible": true
  }
]
```

---

#### GET /buttons
Returns all button elements.

**Response**:
```json
[
  {
    "index": 0,
    "tag": "button",
    "id": "send-btn",
    "class": "send-button",
    "text": "Send",
    "ariaLabel": "Send message",
    "disabled": false,
    "bounds": {"x": 460, "y": 310, "width": 60, "height": 30},
    "visible": true
  }
]
```

---

#### GET /status
Health check endpoint with full system status.

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1738761234567,
  "uptime": 123.45,
  "config": {
    "httpPort": 7777,
    "cdpPort": 9222,
    "tmuxEnabled": true
  },
  "connection": {
    "browserConnected": true,
    "pageCount": 3,
    "currentPageUrl": "https://claude.ai/chat/...",
    "tmuxSession": "claude"
  },
  "files": {
    "outboxExists": true,
    "coworkFileExists": true,
    "logSize": 4096
  }
}
```

---

#### GET /outbox
Retrieves messages sent from bridge to Claude Code.

**Response**:
```json
[
  {
    "timestamp": "2026-02-05T12:34:56.789Z",
    "message": "Task completed",
    "data": {"resultCount": 42},
    "read": false
  }
]
```

---

#### GET /log
Retrieves conversation log entries.

**Request Body** (optional):
```json
{"last": 10}
```

**Response**:
```json
{
  "lines": [
    "[2026-02-05 12:34:56] → TO COWORK: Hello",
    "[2026-02-05 12:35:02] ← FROM COWORK: Hi there"
  ],
  "total": 42
}
```

---

### Action Endpoints (POST)

#### POST /click
Clicks an element by CSS selector.

**Request Body**:
```json
{"selector": "#submit-btn"}
```

**Response**:
```json
{"success": true, "action": "click", "selector": "#submit-btn"}
```

---

#### POST /clickText
Clicks an element containing specific text (uses XPath).

**Request Body**:
```json
{"text": "Submit"}
```

**Response**:
```json
{"success": true, "action": "clickByText", "text": "Submit"}
```

---

#### POST /clickCoords
Clicks at specific x, y coordinates.

**Request Body**:
```json
{"x": 100, "y": 200}
```

**Response**:
```json
{"success": true, "action": "clickAtCoords", "x": 100, "y": 200}
```

---

#### POST /type
Types text into a selector (clears existing content first with triple-click).

**Request Body**:
```json
{"selector": "#message-input", "text": "Hello world"}
```

**Response**:
```json
{"success": true, "action": "type", "selector": "#message-input", "text": "Hello world"}
```

**Side Effect**: Logs message to conversation.log

---

#### POST /typeRaw
Types into the currently focused element without clearing.

**Request Body**:
```json
{"text": "Hello from Claude Code"}
```

**Response**:
```json
{"success": true, "action": "typeIntoFocused", "text": "Hello from Claude Code"}
```

**Side Effect**: Logs message to conversation.log

---

#### POST /press
Presses a keyboard key.

**Request Body**:
```json
{"key": "Enter"}
```

**Common Keys**: "Enter", "Escape", "Tab", "Backspace", "ArrowUp", "ArrowDown", "Control", "Meta"

**Response**:
```json
{"success": true, "action": "pressKey", "key": "Enter"}
```

---

#### POST /focus
Focuses an element by selector.

**Request Body**:
```json
{"selector": "#message-input"}
```

**Response**:
```json
{"success": true, "action": "focus", "selector": "#message-input"}
```

---

#### POST /screenshot
Takes a screenshot and saves to bridge directory.

**Request Body** (optional):
```json
{"filename": "my-screenshot.png"}
```

**Default**: `screenshot.png`

**Response**:
```json
{
  "success": true,
  "action": "screenshot",
  "path": "/Users/avinoam/cowork-bridge/screenshot.png"
}
```

**Note**: Screenshot is saved to disk, not returned in response. Read with file tools.

---

#### POST /toClaudeCode
Sends a message from bridge to Claude Code via outbox.json.

**Request Body**:
```json
{
  "message": "Task completed successfully",
  "data": {"resultCount": 42, "errors": 0}
}
```

**Response**:
```json
{
  "timestamp": "2026-02-05T12:34:56.789Z",
  "message": "Task completed successfully",
  "data": {"resultCount": 42, "errors": 0},
  "read": false
}
```

**Side Effects**:
- Appends to outbox.json
- Sends tmux notification (if enabled)

---

#### POST /clearOutbox
Clears the outbox.json file.

**Response**:
```json
{"success": true, "action": "clearOutbox"}
```

---

### Error Responses

All endpoints return errors with HTTP 500:

```json
{
  "error": "Target closed. Most likely the page has been closed.",
  "stack": "Error: Target closed..."  // Only in development mode
}
```

**Common Errors**:
- "Target closed" - Page was closed or navigated away
- "Execution context was destroyed" - Page detached
- "Session closed" - Browser connection lost
- "No element found with text: X" - Element not found for clickText

**Auto-Recovery**: Bridge automatically refreshes page reference on detached/closed errors and retries once.

---

## Usage Guide for Claude Code

### Prerequisites Check

Before using the bridge, verify it's running:

```bash
# Check if bridge is alive
curl -s http://localhost:7777/status | jq '.status'

# Expected: "ok"
```

### Important: Send One Complete Message

**Always compose your full message in a single `/typeRaw` call, then press Enter once.** Do NOT send multiple short lines — each `/typeRaw` + `/press Enter` submits a separate message to Cowork, which fragments context and wastes Cowork's rate-limited turns.

```
WRONG (sends 3 separate messages):
  typeRaw "Hey"        + press Enter
  typeRaw "Can you"    + press Enter
  typeRaw "research X" + press Enter

RIGHT (sends 1 complete message):
  typeRaw "Hey, can you research X and create a summary doc with findings?" + press Enter
```

### Basic Communication Pattern

```bash
# 1. Send a COMPLETE message to Cowork (one thought, one send)
curl -s -X POST http://localhost:7777/typeRaw \
  --data-raw '{"text":"Please analyze the current page and summarize the key findings in a structured format"}'

# 2. Press Enter to send
curl -s -X POST http://localhost:7777/press \
  --data-raw '{"key":"Enter"}'

# 3. Wait for response (check every 2 seconds)
while true; do
  TEXT=$(curl -s http://localhost:7777/text)
  echo "$TEXT" | grep -q "Analysis complete" && break
  sleep 2
done

# 4. Read the full response
curl -s http://localhost:7777/text

# 5. Check conversation log
curl -s http://localhost:7777/log --data-raw '{"last":10}' | jq -r '.lines[]'
```

### Advanced: Visual Inspection

```bash
# Take a screenshot to see what Cowork is doing
curl -s -X POST http://localhost:7777/screenshot

# View the screenshot (Claude Code agents can read images)
# Use the Read tool with: /Users/avinoam/cowork-bridge/screenshot.png
```

### Advanced: DOM Inspection

```bash
# Get all buttons on the page
curl -s http://localhost:7777/buttons | jq '.'

# Find a specific button and click it
BUTTON_SELECTOR=$(curl -s http://localhost:7777/buttons | \
  jq -r '.[] | select(.text=="Send") | .selector' | head -1)

curl -s -X POST http://localhost:7777/click \
  --data-raw "{\"selector\":\"$BUTTON_SELECTOR\"}"
```

### Monitoring Cowork Messages

**Option 1: Check file directly**
```bash
cat ~/cowork-bridge/cowork-to-code.json | jq '.'
```

**Option 2: Watch conversation log**
```bash
tail -f ~/cowork-bridge/conversation.log
```

**Option 3: Tmux notifications** (if enabled)
- Bridge automatically sends notifications to your tmux session
- You'll see: `📬 COWORK MESSAGE: Check ~/cowork-bridge/outbox.json`

### Error Handling

```bash
# If API call fails, check bridge status
curl -s http://localhost:7777/status | jq '.'

# Check if browser is still connected
curl -s http://localhost:7777/status | jq '.connection.browserConnected'

# If false, restart bridge:
# pkill -f "node.*bridge.js"
# node ~/cowork-bridge/bridge.js &
```

### Complete Example: Task Delegation

```bash
# 1. Send task to Cowork
curl -s -X POST http://localhost:7777/typeRaw \
  --data-raw '{"text":"Please search for information about React 19 features"}'
curl -s -X POST http://localhost:7777/press --data-raw '{"key":"Enter"}'

# 2. Wait and monitor
sleep 5
curl -s -X POST http://localhost:7777/screenshot

# 3. Read results
RESPONSE=$(curl -s http://localhost:7777/text)
echo "$RESPONSE"

# 4. Check conversation history
curl -s http://localhost:7777/log --data-raw '{"last":5}' | jq -r '.lines[]'
```

---

## Usage Guide for Cowork

### Prerequisites

The bridge must be running and connected to your Electron app.

### Sending Messages to Claude Code

**Step 1**: Create or update the file `~/cowork-bridge/cowork-to-code.json`

**Format**:
```json
[
  {
    "timestamp": "2026-02-05T12:34:56.789Z",
    "message": "Task completed: Found 15 React 19 features",
    "data": {
      "features": ["React Compiler", "Actions", "..."],
      "sourceUrl": "https://react.dev/blog"
    }
  }
]
```

**Step 2**: The bridge will automatically:
1. Detect file change (within 500ms)
2. Log message to conversation.log
3. Send tmux notification to Claude Code (if configured)

**Example using JavaScript** (from Cowork context):
```javascript
const fs = require('fs');
const path = require('path');

function sendToClaudeCode(message, data = {}) {
  const filePath = path.join(process.env.HOME, 'cowork-bridge', 'cowork-to-code.json');

  const payload = [{
    timestamp: new Date().toISOString(),
    message: message,
    data: data
  }];

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

// Usage
sendToClaudeCode("Analysis complete", {
  resultCount: 42,
  status: "success"
});
```

### Receiving Messages from Claude Code

Monitor the conversation log or use the outbox:

```javascript
// Read outbox
const outbox = JSON.parse(
  fs.readFileSync(path.join(process.env.HOME, 'cowork-bridge', 'outbox.json'), 'utf8')
);

const unreadMessages = outbox.filter(msg => !msg.read);
console.log('Unread:', unreadMessages);
```

### Reading Conversation History

```javascript
const log = fs.readFileSync(
  path.join(process.env.HOME, 'cowork-bridge', 'conversation.log'),
  'utf8'
);

const lines = log.trim().split('\n');
const lastN = lines.slice(-10); // Last 10 messages

console.log('Recent conversation:', lastN);
```

---

## Configuration

All configuration is done via environment variables.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_PATH` | `/Users/avinoam/Claude-Debug.app/Contents/MacOS/Claude` | Path to patched Claude Desktop executable |
| `HTTP_PORT` | `7777` | HTTP API port |
| `CDP_PORT` | `9222` | Chrome DevTools Protocol port |
| `BRIDGE_DIR` | `__dirname` | Directory for shared files (conversation.log, outbox.json, etc.) |
| `TMUX_SESSION` | `claude` | Tmux session name for notifications |
| `CDP_TIMEOUT` | `30` | Seconds to wait for CDP to become available |
| `FILE_WATCH_DEBOUNCE` | `500` | Milliseconds to debounce file watch events |
| `OUTBOX_MAX` | `50` | Maximum number of messages to keep in outbox.json |
| `ENABLE_TMUX_NOTIFY` | `true` | Enable/disable tmux notifications (`false` to disable) |

### Example: Custom Configuration

```bash
# Custom ports
export HTTP_PORT=8888
export CDP_PORT=9223

# Custom bridge directory
export BRIDGE_DIR=/tmp/cowork-bridge

# Disable tmux notifications
export ENABLE_TMUX_NOTIFY=false

# Start bridge
node bridge.js
```

### File Locations

With default configuration:

```
~/cowork-bridge/
├── bridge.js              # Bridge server code
├── conversation.log       # Persistent message history
├── outbox.json           # Bridge → Claude Code messages
├── cowork-to-code.json   # Cowork → Claude Code messages
└── screenshot.png        # Latest screenshot
```

---

## Failure Modes & Recovery

### 1. Page Detached / Target Closed

**Symptom**: Error message "Target closed" or "Execution context was destroyed"

**Cause**: Page navigated, closed, or browser tab changed

**Recovery**: Automatic
- Bridge catches these errors
- Calls `refreshPage()` to find active page
- Retries the operation once
- If retry fails, returns error to client

**Manual Recovery**: Not needed

---

### 2. Browser Disconnected

**Symptom**:
- API calls return connection errors
- Bridge logs "Browser disconnected unexpectedly"
- Process exits with code 1

**Cause**:
- Claude Desktop closed
- CDP connection lost
- Network issue (unlikely on localhost)

**Recovery**: Restart bridge
```bash
# Kill existing bridge
pkill -f "node.*bridge.js"

# Restart bridge (it will start Claude-Debug.app if needed)
cd ~/cowork-bridge
node bridge.js
```

---

### 3. Port Already in Use

**Symptom**: Bridge fails to start with "Port 7777 is already in use"

**Cause**: Another bridge instance is running

**Recovery**:
```bash
# Find and kill the process
lsof -ti:7777 | xargs kill -9

# Or kill all bridge processes
pkill -f "node.*bridge.js"

# Restart
node bridge.js
```

---

### 4. CDP Not Available

**Symptom**: Bridge hangs with "Waiting for CDP" dots, then times out

**Cause**:
- Claude Desktop not running
- CDP not enabled (wrong app version)
- Port 9222 blocked

**Recovery**:

**Option 1**: Let bridge start it automatically
```bash
# Bridge will spawn Claude-Debug.app if CDP not available
node bridge.js
```

**Option 2**: Start Claude manually first
```bash
# Start Claude with CDP enabled
/Users/avinoam/Claude-Debug.app/Contents/MacOS/Claude &

# Wait 5 seconds for CDP to initialize
sleep 5

# Start bridge
node bridge.js
```

**Option 3**: Verify Claude is patched correctly
```bash
# Test CDP availability
curl http://127.0.0.1:9222/json/version

# Expected: JSON response with browser version
# If connection refused: Claude is not CDP-enabled
```

---

### 5. File Watch Not Triggering

**Symptom**: Cowork writes to cowork-to-code.json but bridge doesn't log it

**Cause**:
- File written too quickly (debounce issue)
- File write incomplete (partial JSON)
- File permissions issue

**Recovery**:
```bash
# Check file permissions
ls -la ~/cowork-bridge/cowork-to-code.json

# Should be readable by bridge process user
# If not:
chmod 644 ~/cowork-bridge/cowork-to-code.json

# Test file watch manually
echo '[{"timestamp":"2026-02-05T12:00:00Z","message":"test"}]' > ~/cowork-bridge/cowork-to-code.json

# Bridge should log: "← FROM COWORK: test"
```

---

### 6. Screenshot Fails

**Symptom**: `/screenshot` endpoint returns error or empty file

**Cause**:
- Page not loaded
- Insufficient disk space
- Permission issue

**Recovery**:
```bash
# Check page status
curl http://localhost:7777/status | jq '.connection.currentPageUrl'

# Check disk space
df -h ~/cowork-bridge

# Check permissions
ls -la ~/cowork-bridge/screenshot.png

# Try again with explicit filename
curl -s -X POST http://localhost:7777/screenshot \
  --data-raw '{"filename":"test.png"}'
```

---

### 7. Conversation Log Too Large

**Symptom**: Slow file operations, disk space warning

**Cause**: conversation.log grows unbounded

**Recovery**:
```bash
# Check log size
du -h ~/cowork-bridge/conversation.log

# Archive and truncate
mv ~/cowork-bridge/conversation.log ~/cowork-bridge/conversation.log.$(date +%Y%m%d)
touch ~/cowork-bridge/conversation.log

# Or rotate automatically with logrotate
# (create /etc/logrotate.d/cowork-bridge config)
```

---

### General Debugging Steps

1. **Check bridge status**:
   ```bash
   curl http://localhost:7777/status | jq '.'
   ```

2. **Check bridge logs**:
   ```bash
   # If bridge running in background
   tail -f ~/cowork-bridge/bridge.log

   # Or check conversation log
   tail -20 ~/cowork-bridge/conversation.log
   ```

3. **Test basic connectivity**:
   ```bash
   # HTTP API
   curl http://localhost:7777/status

   # CDP
   curl http://127.0.0.1:9222/json/version
   ```

4. **Restart everything**:
   ```bash
   pkill -f "node.*bridge.js"
   pkill -f "Claude"
   sleep 2
   node ~/cowork-bridge/bridge.js
   ```

---

## Security Considerations

### 1. Localhost Only

**Risk**: Bridge HTTP API has no authentication

**Mitigation**: Binds to localhost only, not accessible from network

**Implication**: Only processes on the same machine can access the API

---

### 2. No Authentication

**Risk**: Any local process can control Claude Desktop via the API

**Mitigation**: None - trust-based system

**Implication**:
- Malicious local software could send commands
- Not suitable for multi-user systems
- Only run bridge on trusted machines

---

### 3. CDP Full Control

**Risk**: Chrome DevTools Protocol gives complete control over the Electron app

**Capabilities**:
- Read all page content
- Execute arbitrary JavaScript
- Access cookies, localStorage, sessionStorage
- Intercept network requests
- Modify DOM
- Extract authentication tokens

**Mitigation**: Only use patched Claude-Debug.app, never patch production Claude

**Implication**: Bridge operator has full access to Cowork agent's environment

---

### 4. Cowork VM Sandbox

**Risk**: Cowork runs in a sandboxed VM with limited system access

**Capabilities of Cowork**:
- Write to shared files (cowork-to-code.json)
- Read from outbox.json
- No direct network access outside VM
- No access to host filesystem

**Implication**: Cowork cannot directly harm host system, only communicate via shared files

---

### 5. Conversation Log Privacy

**Risk**: conversation.log contains plaintext history of all messages

**Sensitive Data**:
- API keys if typed into Cowork
- Passwords if discussed
- Private URLs
- Personal information

**Mitigation**:
- Treat conversation.log as sensitive
- Rotate logs regularly
- Don't commit to version control (add to .gitignore)
- Encrypt if storing long-term

---

### 6. Shared File Tampering

**Risk**: Any process can modify cowork-to-code.json or outbox.json

**Mitigation**: None - file-based IPC is inherently trust-based

**Implication**:
- Other local processes could inject messages
- Message integrity not guaranteed
- Suitable for single-user development only

---

### 7. Screen Content Exposure

**Risk**: Screenshots capture whatever is visible in Claude Desktop

**Sensitive Data**:
- Authentication tokens in UI
- Private messages in Cowork chat
- User email addresses
- API keys displayed in settings

**Mitigation**: Review screenshots before sharing

---

### Best Practices

1. **Don't expose bridge to network**: Never port-forward or proxy the API
2. **Use on development machines only**: Not suitable for production or shared systems
3. **Rotate logs**: Archive conversation.log regularly
4. **Review screenshots**: Check for sensitive data before storing long-term
5. **Separate Claude versions**: Keep Claude-Debug.app separate from production Claude.app
6. **Limit CDP access**: Only run bridge when needed, stop when not in use

---

## Implementation Details

### Claude Desktop Patching Process

To enable CDP on Claude Desktop, the app must be patched:

**Step 1: Extract ASAR archive**
```bash
npx asar extract /Applications/Claude.app/Contents/Resources/app.asar ./app-extracted
```

**Step 2: Inject CDP flag**

Edit `app-extracted/main.js` or `app-extracted/index.js` to add:
```javascript
app.commandLine.appendSwitch("remote-debugging-port", "9222");
```

Place this **before** any `app.whenReady()` or `app.on('ready')` calls.

**Step 3: Repackage ASAR**
```bash
npx asar pack ./app-extracted /path/to/Claude-Debug.app/Contents/Resources/app.asar
```

**Step 4: Update integrity hash**

The app's code signature includes an integrity hash. Update it in:
`Claude-Debug.app/Contents/Resources/electron.asar.unpacked/Resources/integrity-hash.json`

Calculate new hash:
```bash
shasum -a 256 Claude-Debug.app/Contents/Resources/app.asar
```

Update the JSON:
```json
{
  "app.asar": "NEW_SHA256_HASH_HERE"
}
```

**Step 5: Re-sign with entitlements**

Create `entitlements.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

Re-sign:
```bash
codesign --deep --force --sign - \
  --entitlements entitlements.plist \
  Claude-Debug.app
```

**Step 6: Verify**

```bash
# Start the app
open Claude-Debug.app

# Wait 5 seconds, then test CDP
curl http://127.0.0.1:9222/json/version

# Expected: JSON with Chrome/Electron version info
```

**Important Notes**:
- This process voids the app's code signature
- macOS may show security warnings on first launch
- Allow in System Preferences > Security & Privacy
- Keep separate from production Claude.app
- Repeat after each Claude app update

---

### Puppeteer Connection Details

**Connection Method**: Puppeteer-core connects via `browserURL`

```javascript
const browser = await puppeteer.connect({
  browserURL: 'http://127.0.0.1:9222',
  defaultViewport: null  // Use existing viewport
});
```

**Why puppeteer-core**: Doesn't bundle Chromium, connects to external browser

**Page Selection**:
1. Get all pages: `await browser.pages()`
2. Find page with `claude.ai` in URL
3. Fallback to last page (most recently active)

**Page Refresh Logic**:
- Bridge keeps reference to `appPage`
- On "Target closed" or "detached" errors, calls `refreshPage()`
- Finds new active page from browser
- Retries failed operation once

---

### File Watch Debouncing

**Problem**: File writes may trigger multiple events

**Solution**: 500ms debounce timer

```javascript
let debounceTimer = null;

fs.watch(bridgeDir, (eventType, filename) => {
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    // Process file change
  }, 500);
});
```

**Why 500ms**: Balance between responsiveness and avoiding duplicate events

---

### Tmux Notification System

**Purpose**: Wake Claude Code terminal when Cowork sends a message

**Implementation**:
```javascript
function wakeClaudeCode(message) {
  const session = getClaudeTmuxSession();
  execSync(`tmux send-keys -t "${session}" "${notifyCmd}" Enter`);
  execSync(`tmux send-keys -t "${session}" "cat ~/cowork-bridge/outbox.json | jq ." Enter`);
}
```

**Session Discovery**:
1. Try configured session name (default: "claude")
2. Search for session with "claude" in name
3. Fallback to first available session
4. If tmux not available, silently skip

**Optional**: Disable with `ENABLE_TMUX_NOTIFY=false`

---

### Error Handling Strategy

**Automatic Retry**: Page detachment errors trigger refresh + retry

**Graceful Degradation**: Missing tmux is not fatal, logs warning

**Fail Fast**: Browser disconnection exits process (requires restart)

**Error Logging**: All errors logged to both console and conversation.log

**Client-Friendly**: API errors return JSON with `error` field, not HTML

---

### Conversation Log Format

**Timestamp**: ISO 8601, truncated to seconds
```
2026-02-05 12:34:56
```

**Direction Arrows**:
- `→ TO COWORK`: Message from Claude Code to Cowork
- `← FROM COWORK`: Message from Cowork to Claude Code

**Line Format**:
```
[TIMESTAMP] DIRECTION: MESSAGE_CONTENT
```

**Append-Only**: Never truncated or rotated automatically (manual maintenance needed)

---

### Outbox Size Management

**Problem**: outbox.json could grow unbounded

**Solution**: Automatic trimming to `OUTBOX_MAX` (default 50)

```javascript
if (outbox.length > CONFIG.outboxMaxMessages) {
  outbox = outbox.slice(-CONFIG.outboxMaxMessages);
}
```

**Oldest messages removed first** (keep most recent)

---

### Graceful Shutdown

**Signals**: SIGINT (Ctrl+C), SIGTERM

**Shutdown Sequence**:
1. Set `isShuttingDown` flag (prevents duplicate shutdown)
2. Close HTTP server
3. Disconnect from browser (but don't close it)
4. Exit process

**Important**: Claude Desktop keeps running after bridge shutdown

**Restart Bridge**: Claude doesn't need to restart, bridge reconnects via CDP

---

## Appendix: Quick Reference

### One-Liners for Common Tasks

```bash
# Check if bridge is running
curl -s http://localhost:7777/status | jq '.status'

# Send message to Cowork
curl -s -X POST http://localhost:7777/typeRaw --data-raw '{"text":"Hello"}' && \
curl -s -X POST http://localhost:7777/press --data-raw '{"key":"Enter"}'

# Read Cowork's response
curl -s http://localhost:7777/text

# Get last 5 conversation entries
curl -s http://localhost:7777/log --data-raw '{"last":5}' | jq -r '.lines[]'

# Take screenshot and read it
curl -s -X POST http://localhost:7777/screenshot && \
open ~/cowork-bridge/screenshot.png

# Check what Cowork sent
cat ~/cowork-bridge/cowork-to-code.json | jq '.'

# Restart bridge
pkill -f "node.*bridge.js" && node ~/cowork-bridge/bridge.js &
```

---

### Troubleshooting Checklist

- [ ] Bridge running? `curl http://localhost:7777/status`
- [ ] Browser connected? `jq '.connection.browserConnected' <<< $(curl -s localhost:7777/status)`
- [ ] CDP available? `curl http://127.0.0.1:9222/json/version`
- [ ] Claude running? `ps aux | grep Claude`
- [ ] Files writable? `ls -la ~/cowork-bridge/*.json`
- [ ] Tmux available? `tmux list-sessions`
- [ ] Logs recent? `tail -1 ~/cowork-bridge/conversation.log`
- [ ] Disk space? `df -h ~/cowork-bridge`

---

### File Locations Reference

```
~/cowork-bridge/
├── bridge.js                    # Main bridge server
├── conversation.log             # Persistent message history
├── outbox.json                  # Bridge → Claude Code
├── cowork-to-code.json          # Cowork → Claude Code
├── screenshot.png               # Latest screenshot
└── node_modules/                # Dependencies

/Users/avinoam/Claude-Debug.app/ # Patched Claude Desktop
└── Contents/
    ├── MacOS/Claude             # CDP-enabled executable
    └── Resources/
        └── app.asar             # Patched application code
```

---

### Common Selector Patterns for Claude Cowork

**Chat Input** (Claude Cowork UI):
```javascript
// Main message input
"textarea[placeholder*='message']"
"[contenteditable='true']"

// Send button
"button[aria-label*='Send']"
"button:has-text('Send')"
```

**Navigation**:
```javascript
// New conversation
"button:has-text('New chat')"

// Settings
"button[aria-label='Settings']"
```

**Finding elements by text**:
```bash
# Use clickText endpoint
curl -X POST http://localhost:7777/clickText --data-raw '{"text":"Send"}'
```

---

## Conclusion

This architecture document covers the complete cowork-bridge system from an AI agent's perspective. Key takeaways:

1. **Two-way communication**: HTTP API (Code→Cowork) + File watch (Cowork→Code)
2. **CDP-based control**: Full DOM automation via Puppeteer
3. **Persistent logging**: All messages logged to conversation.log
4. **Automatic recovery**: Page detachment handled transparently
5. **Security limitations**: Localhost-only, no authentication, trust-based

**For Claude Code agents**: Use HTTP API endpoints to control Cowork
**For Cowork agents**: Write to cowork-to-code.json to respond

**Next Steps**:
- Review API Reference for endpoint details
- Test basic communication with Usage Guide examples
- Implement error handling based on Failure Modes section
