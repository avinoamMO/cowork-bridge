```
   ___                      _      ___      _    _
  / __|_____ __ _____ _ _| |__  | _ )_ _(_)__| |__ _ ___
 | (__/ _ \ V  V / _ \ '_| / /  | _ \ '_| / _` / _` / -_)
  \___\___/\_/\_/\___/_| |_\_\  |___/_| |_\__,_\__, \___|
                                                |___/
        Two AI agents. One workflow. Zero copy-paste.
```

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](https://github.com/avinoamMO/cowork-bridge/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![Tests](https://github.com/avinoamMO/cowork-bridge/actions/workflows/test.yml/badge.svg)](https://github.com/avinoamMO/cowork-bridge/actions/workflows/test.yml)
[![Lint](https://github.com/avinoamMO/cowork-bridge/actions/workflows/lint.yml/badge.svg)](https://github.com/avinoamMO/cowork-bridge/actions/workflows/lint.yml)

---

## What is this?

Cowork Bridge connects **Claude Code** (terminal) and **Claude Desktop** (desktop app) so they can collaborate in real-time -- like a two-person AI team where each agent does what it is best at.

Claude Code is a terminal-native engineer: git, APIs, databases, code generation. Claude Desktop excels at everything outside the terminal: web research, document editing, visual tasks, spreadsheets.

**The problem:** They cannot talk to each other.

**The solution:** Cowork Bridge creates a bidirectional communication channel between them using Chrome DevTools Protocol and a lightweight HTTP API.

```
                        Cowork Bridge
                     +-----------------+
                     |                 |
   Claude Code       |   Node.js       |       Claude Desktop
  +-----------+      |   HTTP API      |      +---------------+
  |           | ---->|   port 7777     |----> |               |
  | Terminal  |      |                 | CDP  |  Electron App |
  | engineer  | <----|   Page scraping |<---- |  (claude.ai)  |
  |           |      |   + polling     |      |               |
  +-----------+      +-----------------+      +---------------+
```

**How it works in three sentences:**

1. Claude Code sends messages to Claude Desktop by typing into its chat via the HTTP API (Puppeteer over CDP).
2. Claude Code reads Desktop's responses by scraping the visible page text.
3. A smart poller uses SHA-256 content hashing to detect new responses and notify Code only when something actually changed.

---

## What becomes possible

**Research to Implementation** -- Desktop browses the web and synthesizes findings. Code reads the synthesis and builds the feature. End to end.

**Code to Documentation** -- Code ships the feature. Desktop writes the PRD and user guide based on what actually shipped.

**Full Product Sprint** -- Code handles all engineering. Desktop handles product docs and stakeholder comms. Simultaneously.

**Bug Fix to Stakeholder Report** -- Code diagnoses and patches the issue. Desktop formats the resolution into a client-facing report. Same hour.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Claude Desktop app with CDP enabled (requires a patched copy -- see [SETUP.md](SETUP.md))
- tmux (optional, for terminal notifications)

### Install

```bash
git clone https://github.com/avinoamMO/cowork-bridge.git
cd cowork-bridge
npm install
```

### Run

```bash
node bridge.js
```

You will see:

```
==================================================
BRIDGE READY
==================================================
Status:  http://localhost:7777/status
API:     http://localhost:7777
CDP:     http://127.0.0.1:9222
```

### Send your first message

```bash
# Type a message into Desktop's chat
curl -s -X POST http://localhost:7777/typeRaw \
  -d '{"text":"Hey Desktop, research the latest Node.js 22 features for me"}'

# Press Enter to send it
curl -s -X POST http://localhost:7777/press -d '{"key":"Enter"}'

# Wait a moment, then read the response
curl -s http://localhost:7777/lastResponse
```

### Start the smart poller

```bash
bash poller.sh &
```

The poller checks every 60 seconds using SHA-256 content hashing. It only notifies Code when something actually changed -- zero false nudges.

---

## API Reference

Base URL: `http://localhost:7777`

### Reading data

| Endpoint        | Method   | Description                                            |
| --------------- | -------- | ------------------------------------------------------ |
| `/lastResponse` | GET      | Most recent assistant message only                     |
| `/text`         | GET      | All visible page text (max 5000 chars)                 |
| `/html`         | GET      | Full HTML content of the page                          |
| `/elements`     | GET      | All interactive DOM elements with selectors and bounds |
| `/buttons`      | GET      | All button elements                                    |
| `/textareas`    | GET      | All text input fields                                  |
| `/status`       | GET      | Health check with connection details                   |
| `/log`          | GET/POST | Conversation history (accepts `{"last": N}`)           |
| `/outbox`       | GET      | Messages sent from bridge to Code                      |
| `/ping`         | GET      | Simple health check (legacy)                           |

### Sending actions

| Endpoint       | Method | Body                                 | Description                            |
| -------------- | ------ | ------------------------------------ | -------------------------------------- |
| `/typeRaw`     | POST   | `{"text": "..."}`                    | Type into the focused element          |
| `/type`        | POST   | `{"selector": "...", "text": "..."}` | Clear and type into a specific element |
| `/press`       | POST   | `{"key": "Enter"}`                   | Press a keyboard key                   |
| `/click`       | POST   | `{"selector": "#btn"}`               | Click by CSS selector                  |
| `/clickText`   | POST   | `{"text": "Submit"}`                 | Click element containing text (XPath)  |
| `/clickCoords` | POST   | `{"x": 100, "y": 200}`               | Click at coordinates                   |
| `/focus`       | POST   | `{"selector": "..."}`                | Focus an element                       |
| `/screenshot`  | POST   | `{"filename": "check.png"}`          | Save screenshot to disk                |

### Messaging

| Endpoint        | Method | Body                                | Description                     |
| --------------- | ------ | ----------------------------------- | ------------------------------- |
| `/toClaudeCode` | POST   | `{"message": "...", "data": {...}}` | Send message to Code via outbox |
| `/clearOutbox`  | POST   | --                                  | Clear the outbox                |

### Example: GET /status response

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
    "tmuxSession": "%13"
  },
  "files": {
    "outboxExists": true,
    "coworkFileExists": true,
    "logSize": 4096
  }
}
```

### Error responses

All endpoints return errors as JSON with HTTP 500:

```json
{
  "error": "Target closed. Most likely the page has been closed."
}
```

The bridge auto-recovers from page detachment errors by refreshing its page reference and retrying once.

---

## Configuration

All settings are controlled via environment variables. Every variable has a sensible default.

| Variable              | Default                                    | Description                             |
| --------------------- | ------------------------------------------ | --------------------------------------- |
| `CLAUDE_PATH`         | `~/Claude-Debug.app/Contents/MacOS/Claude` | Patched Claude Desktop binary           |
| `HTTP_PORT`           | `7777`                                     | Bridge HTTP API port                    |
| `CDP_PORT`            | `9222`                                     | Chrome DevTools Protocol port           |
| `BRIDGE_DIR`          | Script directory                           | Directory for shared files              |
| `TMUX_SESSION`        | `claude`                                   | Tmux session name                       |
| `TMUX_TARGET`         | Auto-detected                              | Explicit tmux pane target               |
| `CDP_TIMEOUT`         | `30`                                       | Seconds to wait for CDP on startup      |
| `FILE_WATCH_DEBOUNCE` | `500`                                      | Debounce interval (ms) for file watcher |
| `OUTBOX_MAX`          | `50`                                       | Max messages in outbox.json             |
| `ENABLE_TMUX_NOTIFY`  | `true`                                     | Set `false` to disable tmux             |

```bash
# Example: custom ports, tmux disabled
HTTP_PORT=8888 CDP_PORT=9223 ENABLE_TMUX_NOTIFY=false node bridge.js
```

---

## Architecture

```
                    +------------------------------------------+
                    |            Cowork Bridge (Node.js)        |
                    |                                          |
                    |  +----------+   +--------+   +--------+ |
                    |  | HTTP     |   | File   |   | Tmux   | |
  Claude Code <--->|  | Server   |   | Watcher|   | Notify | |
  (terminal)       |  | :7777    |   | (JSON) |   |        | |
                    |  +----+-----+   +----+---+   +---+----+ |
                    |       |              |            |       |
                    |       v              v            v       |
                    |  +-----------+  +----------+  +------+   |
                    |  | Puppeteer |  | Shared   |  | Tmux |   |
                    |  | (CDP)     |  | Files    |  | CLI  |   |
                    |  +-----+-----+  +----------+  +------+   |
                    +--------|-----------------------------+
                             |
                             | Chrome DevTools Protocol
                             | (port 9222)
                             v
                    +------------------+
                    | Claude Desktop   |
                    | (Electron app)   |
                    | claude.ai        |
                    +------------------+
```

### Communication channels

1. **Code to Desktop** (HTTP API): Code sends HTTP requests to the bridge, which uses Puppeteer to type into Desktop's chat, click buttons, or read the page.

2. **Desktop to Code** (page scraping + polling): Code reads Desktop's responses by scraping visible text. The smart poller detects changes via content hashing and sets a flag in the shared task queue.

3. **Conversation log**: Every message in both directions is appended to `conversation.log` with timestamps.

4. **Tmux notifications**: When Desktop has new content, the bridge can send a notification to Code's terminal via tmux.

### Key files

```
cowork-bridge/
  bridge.js            # Main server: HTTP API + Puppeteer CDP + file watcher
  poller.sh            # Smart content-hash poller (runs as background process)
  checkin-cron.sh      # Periodic check-in script (optional)
  conversation.log     # Append-only message history (gitignored)
  outbox.json          # Bridge-to-Code message queue (gitignored)
  cowork-to-code.json  # Desktop-to-Code messages (gitignored)
```

---

## Patching Claude Desktop

The bridge connects via Chrome DevTools Protocol. Claude Desktop does not expose CDP by default, so you need a patched copy. The process:

1. Copy `Claude.app` to `~/Claude-Debug.app` (using tar to strip macOS provenance attributes)
2. Extract the `app.asar` archive
3. Inject one line of JS to enable CDP on port 9222
4. Repack asar, update the integrity hash in `Info.plist`
5. Re-sign with the original entitlements

Your regular `Claude.app` stays untouched.

**Full walkthrough:** [SETUP.md](SETUP.md)

---

## Use Cases

### For AI-assisted development teams

- Run a full product sprint: Code builds features while Desktop handles specs, docs, and comms
- Automate QA workflows: Code runs tests, Desktop formats results into stakeholder reports
- Research-driven development: Desktop researches APIs and libraries, Code implements based on findings

### For multi-agent researchers

- Study agent-to-agent communication patterns
- Benchmark task handoff protocols
- Experiment with specialized agent collaboration

### For Claude Code power users

- Extend Code's capabilities with Desktop's web browsing and document editing
- Automate repetitive workflows that span terminal and browser
- Build custom toolchains that leverage both agents

---

## Troubleshooting

### Bridge won't start

```bash
# Port already in use?
lsof -ti:7777 | xargs kill -9

# CDP not available?
curl -s http://127.0.0.1:9222/json/version
# If "Connection refused": Claude Desktop isn't running or isn't patched
```

### Page errors ("Target closed", "detached")

The bridge auto-recovers by refreshing its page reference and retrying. If errors persist, restart the bridge -- Claude Desktop keeps running.

### Poller not detecting changes

```bash
# Check if bridge is responding
curl -s http://localhost:7777/status | python3 -m json.tool

# Check poller process
ps aux | grep poller
```

### After a Claude Desktop update

You need to re-patch. The `app.asar` changes with each update. Follow [SETUP.md](SETUP.md) again.

For a full troubleshooting checklist, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Risks and Limitations

This is experimental software. Be aware:

- **Patched app required** -- you are modifying a signed Electron app (not officially supported)
- **DOM can break** -- Claude Desktop UI updates may change element structure
- **No authentication** -- the HTTP API is localhost-only but has no auth layer
- **Puppeteer fragility** -- browser automation can be flaky after app updates
- **Not endorsed by Anthropic** -- this is a community project

**Use at your own risk. Back up your work.**

---

## Development

```bash
# Install dependencies
npm install

# Run tests (93 tests)
npm test

# Run linting
npm run lint

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Project structure

```
cowork-bridge/
  bridge.js              # Main bridge server
  poller.sh              # Smart content-hash poller
  checkin-cron.sh        # Periodic check-in cron
  tests/
    bridge.test.js       # Jest test suite (93 tests)
  docs/
    index.html           # GitHub Pages documentation site
    gtm.md               # Go-to-market strategy
  types.d.ts             # TypeScript type definitions
  .github/workflows/
    test.yml             # CI: tests on Node 18/20/22
    lint.yml             # CI: ESLint + Prettier checks
  eslint.config.js       # ESLint configuration
  .prettierrc            # Prettier configuration
  jest.config.js         # Jest configuration
```

---

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

Priority areas:

- Reconnection logic for CDP drops
- Cross-platform support (Windows, Linux)
- Optional API authentication
- WebSocket event streaming

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

### v0.3.0 (2026-02-09)

- Event-driven poller with SHA-256 content hashing
- `GET /lastResponse` endpoint
- Shared filesystem as primary communication channel

### v0.2.0 (2026-02-07)

- Simplified communication: page scraping replaces file-based responses
- Added `poller.sh` for automatic polling

### v0.1.0 (2026-02-05)

- Initial release: Puppeteer CDP bridge, HTTP API, bidirectional messaging

---

## License

[MIT](LICENSE)

---

**Built by [@avinoamMO](https://github.com/avinoamMO)**
