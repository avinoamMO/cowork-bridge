# Contributing to Cowork Bridge

Thank you for your interest in contributing to Cowork Bridge. This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm
- Claude Desktop app (with CDP patch for integration testing)
- tmux (optional, for notification testing)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/avinoamMO/cowork-bridge.git
cd cowork-bridge

# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run lint

# Check formatting
npm run format:check
```

## Project Structure

```
cowork-bridge/
  bridge.js           # Main bridge server (Node.js + Puppeteer)
  poller.sh           # Smart content-hash poller
  checkin-cron.sh     # Periodic check-in script
  tests/              # Jest test suite
    bridge.test.js    # Unit and integration tests
  docs/               # GitHub Pages documentation site
  types.d.ts          # TypeScript type definitions
  .github/workflows/  # CI/CD pipelines
```

## Making Changes

### Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run the test suite: `npm test`
5. Run the linter: `npm run lint`
6. Check formatting: `npm run format:check`
7. Commit with a clear message: `git commit -m "Add feature X"`
8. Push and open a pull request

### Commit Messages

Use clear, conventional commit messages:

- `feat: add reconnection logic for CDP`
- `fix: handle page detachment during screenshot`
- `docs: update API reference for /lastResponse`
- `test: add unit tests for content hash calculation`
- `chore: update dependencies`

### Code Style

- The project uses ESLint and Prettier for consistent formatting
- Run `npm run lint:fix` and `npm run format` before committing
- All functions should have JSDoc comments
- Use `const` by default; `let` only when reassignment is needed

### Testing

- Write tests for any new functionality
- Tests use Jest and live in the `tests/` directory
- Mock external dependencies (Puppeteer, filesystem, child_process)
- Aim for meaningful coverage, not 100% line coverage

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run a specific test file
npx jest tests/bridge.test.js
```

## Areas Where Help Is Welcome

### High Priority

- **Reconnection logic**: Automatic re-connect when browser disconnects
- **Error recovery**: More robust handling of CDP connection drops
- **Cross-platform**: Windows and Linux support for CDP patching

### Medium Priority

- **Authentication**: Optional API key for the HTTP server
- **Rate limiting**: Protect against accidental request floods
- **WebSocket**: Real-time event streaming alongside REST API

### Nice to Have

- **Dashboard**: Simple web UI showing bridge status and conversation log
- **Metrics**: Request latency, uptime, error rates
- **Plugin system**: Extensible action handlers

## Reporting Bugs

Open an issue with:

1. Steps to reproduce the problem
2. Expected behavior
3. Actual behavior
4. Environment details (OS, Node version, Claude Desktop version)
5. Relevant logs from `conversation.log` or bridge console output

## Questions?

Open a discussion or issue on GitHub. We are happy to help.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
