# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-09

### Added
- Event-driven poller with SHA-256 content hashing for change detection
- Shared filesystem as primary communication channel (`tasks/agent-task-queue.json`)
- `GET /lastResponse` endpoint returning only the most recent assistant message
- `CLAUDE.md` integration for project-level agent instructions

### Changed
- Poller no longer types into CoWork's chat, preserving rate-limited turns
- Content-hash based polling replaces blind 3-minute interval polling

### Removed
- Auto-messaging from poller (was wasting CoWork turns)

## [0.2.0] - 2026-02-07

### Added
- `poller.sh` background script for automatic check-in reminders
- `npm run poll` script
- Documentation on newline behavior in `typeRaw` (each `\n` triggers Enter)

### Changed
- Simplified communication model: Code reads Cowork's responses by scraping the page via `GET /text` instead of file-based response channel

### Removed
- File-based response channel (`cowork-to-code.json` for responses)

## [0.1.0] - 2026-02-05

### Added
- Initial release
- Puppeteer CDP bridge connecting to Claude Desktop (Electron)
- HTTP API on port 7777 with full DOM automation
- Bidirectional JSON file messaging (`cowork-to-code.json`, `outbox.json`)
- Tmux terminal notifications
- Conversation logging to `conversation.log`
- CLI tool (`cowork-cli.sh`)
- Graceful shutdown handling
- Automatic page refresh on detached targets

[0.3.0]: https://github.com/avinoamMO/cowork-bridge/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/avinoamMO/cowork-bridge/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/avinoamMO/cowork-bridge/releases/tag/v0.1.0
