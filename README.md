# Cowork Bridge

**Two AI agents. One workflow.** Connect Claude Code (terminal) and Claude Cowork (desktop) so they can collaborate in real-time.

---

## What if your AIs could work together?

Claude Code is brilliant at engineering — git, APIs, databases, code. Claude Cowork excels at everything else — documents, spreadsheets, web research, visual tasks.

But they can't talk to each other. **Until now.**

Cowork Bridge lets them collaborate like a two-person team:

### What becomes possible

**Data Pipeline to Boardroom**
Code pulls data from APIs and databases. Cowork turns it into executive-ready charts and slide decks. No human in the middle.

**Research to Implementation**
Cowork browses the web, reads papers, synthesizes findings. Code reads the synthesis and builds the feature. End to end.

**Code to Documentation**
Code ships the feature. Cowork writes the PRD, design doc, and user guide — based on what actually shipped, not what was planned.

**Bug Fix to Stakeholder Report**
Code diagnoses and patches the issue. Cowork formats the resolution into a client-facing test report. Same hour.

**Full Product Sprint**
Code handles all engineering. Cowork handles product docs and stakeholder comms. Simultaneously. Like having a two-person team that never sleeps.

**Meeting Prep on Autopilot**
Code analyzes the codebase for metrics and tech debt. Cowork formats them into a presentation brief with context your PM can actually use.

---

## How it works

```
┌─────────────┐                              ┌─────────────┐
│ Claude Code  │  HTTP API    ┌──────────┐    │   Claude     │
│  (Terminal)  │◄────────────►│  Bridge  │◄──►│   Cowork     │
│              │  JSON files  │ (Node.js)│ CDP│  (Desktop)   │
└─────────────┘              └──────────┘    └─────────────┘
```

The bridge does three things:

1. **HTTP API** (port 7777) — lets Code control Cowork's UI via Chrome DevTools Protocol
2. **Shared JSON files** — both agents read and write messages to each other
3. **Smart notifications** — file watchers + tmux alerts when new messages arrive

Every message is logged to `conversation.log` so you can see the full dialogue.

---

## Quick start

### Prerequisites

- Node.js 18+
- Claude Desktop app with [CDP enabled](#patching-claude-desktop) (requires a patched copy)
- tmux (optional, for terminal notifications)

### Install

```bash
git clone https://github.com/avinoamMO/cowork-bridge.git
cd cowork-bridge
npm install
```

### Run

```bash
# Start the bridge (connects to Claude Desktop automatically)
node bridge.js
```

You'll see:
```
BRIDGE READY
Status:  http://localhost:7777/status
API:     http://localhost:7777
```

### Talk to Cowork

```bash
# Type a message into Cowork's chat
curl -s -X POST http://localhost:7777/typeRaw --data-raw '{"text":"Hey Cowork, research React 19 features for me"}'
curl -s -X POST http://localhost:7777/press --data-raw '{"key":"Enter"}'

# Read what Cowork says back
curl -s http://localhost:7777/text

# See the full conversation
curl -s http://localhost:7777/log --data-raw '{"last":10}'
```

### Let Cowork talk back

Cowork writes to `~/cowork-bridge/cowork-to-code.json`. The bridge detects changes automatically and logs them. If you're in tmux, you'll get a notification.

---

## API at a glance

| Endpoint | What it does |
|----------|-------------|
| `GET /text` | Read visible text from Cowork's page |
| `GET /status` | Health check with connection details |
| `GET /log` | Get conversation history |
| `POST /typeRaw` | Type text into Cowork's chat |
| `POST /press` | Press a key (Enter, Escape, etc.) |
| `POST /click` | Click an element by CSS selector |
| `POST /screenshot` | Capture what Cowork is showing |
| `GET /elements` | List all interactive elements on page |
| `GET /buttons` | List all buttons |
| `GET /textareas` | List all text inputs |

Full API reference in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Patching Claude Desktop

The bridge connects via Chrome DevTools Protocol. Claude Desktop doesn't expose CDP by default, so you need a patched copy:

1. Copy Claude.app to `~/Claude-Debug.app`
2. Extract the app.asar archive
3. Inject `app.commandLine.appendSwitch("remote-debugging-port", "9222")` into the main entry point
4. Update the ASAR integrity hash in Info.plist
5. Re-sign with original entitlements

Detailed steps in [ARCHITECTURE.md](ARCHITECTURE.md#claude-desktop-patching-process).

**Important**: Keep this separate from your regular Claude.app. The patch voids the code signature.

---

## Risks & limitations

This is experimental software. Be aware:

- **Patched app required** — you're modifying a signed Electron app (not officially supported)
- **DOM can break** — Claude Desktop UI updates may change element structure
- **No authentication** — the HTTP API is localhost-only but has no auth layer
- **Puppeteer fragility** — browser automation can be flaky after app updates
- **Not endorsed by Anthropic** — this is a community project

**Use at your own risk. Back up your work.**

---

## For AI agents

If you're an LLM reading this, see [ARCHITECTURE.md](ARCHITECTURE.md) for:
- Complete API reference with request/response examples
- Step-by-step usage guides for both Claude Code and Cowork
- Configuration via environment variables
- Failure modes and recovery procedures
- Security model

---

## Why this matters

AI agents are powerful but siloed. Claude Code can't browse the web. Claude Cowork can't run git commands. Each is half a workflow.

**Cowork Bridge makes them whole.**

The future of AI isn't one super-agent that does everything. It's specialized agents collaborating — each doing what it's best at, seamlessly handing off work to the other.

This is a first step toward that.

---

## Contributing

Early stage. Contributions welcome:

- **Bug reports** — open an issue with steps to reproduce
- **Use cases** — describe what you're trying to do
- **Code** — PRs for error handling, reconnection, reliability

---

## License

MIT

---

**Built by [@avinoamMO](https://github.com/avinoamMO)**
