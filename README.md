# Cowork Bridge v0.3.0

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
│  (Terminal)  │─────────────►│  Bridge  │◄──►│   Cowork     │
│              │◄─ page scrape│ (Node.js)│ CDP│  (Desktop)   │
└─────────────┘              └──────────┘    └─────────────┘
```

The bridge does three things:

1. **HTTP API** (port 7777) — lets Code send messages and control Cowork's UI via Chrome DevTools Protocol
2. **Page scraping** — Code reads Cowork's responses by scraping visible text from the page (`GET /text` or `GET /lastResponse`)
3. **Smart polling** — a background poller uses content hashing to detect when CoWork has new content, only notifying Code when something actually changed

Every message is logged to `conversation.log` so you can see the full dialogue.

> **v0.2.0 update:** Removed the file-based communication layer (`cowork-to-code.json` for responses). Cowork doesn't need to write to any file — Code simply reads the page. This is simpler and more reliable. Added `poller.sh` for automatic check-in reminders.

---

## Quick start

### Prerequisites

- Node.js 18+
- Claude Desktop app with CDP enabled (requires a patched copy — see [SETUP.md](SETUP.md))
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
# Send a message (type + Enter in one shot)
curl -s -X POST http://localhost:7777/typeRaw -d '{"text":"Hey Cowork, research React 19 features for me"}' && \
curl -s -X POST http://localhost:7777/press -d '{"key":"Enter"}'

# Read Cowork's response (scrapes visible page text)
curl -s -X POST http://localhost:7777/text

# Take a screenshot to see what Cowork is showing
curl -s -X POST http://localhost:7777/screenshot -d '{"filename":"check.png"}'
```

> **Important:** Do NOT use newlines (`\n`) in `typeRaw` text. In Claude's chat UI, newlines trigger Enter which submits the message. Keep messages on a single line.

### Reading Cowork's responses

Cowork replies in the chat like normal. Code reads those responses by scraping the page:

```bash
# Get visible text (Cowork's latest response is at the bottom)
curl -s -X POST http://localhost:7777/text | tail -c 2000
```

No file-based communication needed. Cowork doesn't write to any file — Code just reads the page.

### Smart polling

Start the smart poller to get notified only when CoWork has new content:

```bash
bash poller.sh &
# Or:
npm run poll
```

The v0.3 poller uses SHA-256 content hashing — it only writes to `poll-nudge.txt` when the page content actually changes. Zero false nudges. It also updates `tasks/agent-task-queue.json` with a `coworkHasNewMessage` flag.

### Shared filesystem (primary communication)

Both agents read/write files in a shared `tasks/` folder:
- `tasks/agent-task-queue.json` — formal task state machine
- `tasks/cowork-to-code-checkin.md` — CoWork's messages to Code
- `tasks/*-completion-report.md` — Code's reports back to CoWork

---

## API at a glance

| Endpoint | What it does |
|----------|-------------|
| `GET /text` | Read visible text from Cowork's page |
| `GET /lastResponse` | Get only the most recent assistant message |
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

The bridge connects via Chrome DevTools Protocol. Claude Desktop doesn't expose CDP by default, so you need a patched copy. The short version:

1. Copy Claude.app to `~/Claude-Debug.app` (using tar to strip macOS provenance attributes)
2. Extract the app.asar archive
3. Inject one line of JS to enable CDP on port 9222
4. Repack asar, update the integrity hash, re-sign with original entitlements

**Full walkthrough with every gotcha**: [SETUP.md](SETUP.md)

Your regular Claude.app stays untouched.

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

## Changelog

### v0.3.0 (2026-02-09)
- **Event-driven poller**: Content-hash based change detection replaces blind 3-minute polling. Zero false nudges.
- **Shared filesystem as primary channel**: `tasks/agent-task-queue.json` formal task state machine replaces ad-hoc markdown handoffs.
- **`GET /lastResponse` endpoint**: Returns only the most recent assistant message instead of the entire page.
- **No more auto-messaging**: Poller no longer types into CoWork's chat, saving rate-limited turns.
- **CLAUDE.md integration**: Project-level instructions guide Code to use correct communication paths.

### v0.2.0 (2026-02-07)
- **Simplified communication model**: Removed file-based response channel (`cowork-to-code.json`). Code now reads Cowork's responses by scraping the page via `GET /text`.
- **Added `poller.sh`**: Background script that nudges Claude Code every 3 minutes to check for new Cowork messages.
- **Newline warning**: Documented that `\n` in `typeRaw` triggers message submission (each newline = Enter in Claude's UI). Messages must be single-line.
- **Updated CLI**: Added `npm run poll` script.

### v0.1.0 (2026-02-05)
- Initial release: Puppeteer CDP bridge, HTTP API, bidirectional JSON file messaging, tmux notifications, CLI tool.

## License

MIT

---

**Built by [@avinoamMO](https://github.com/avinoamMO)**
