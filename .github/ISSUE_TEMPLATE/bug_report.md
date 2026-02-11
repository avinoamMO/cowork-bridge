---
name: Bug Report
about: Report a bug with the bridge server, poller, or CDP connection
title: "[Bug] "
labels: bug
assignees: ''
---

## Description

A clear description of what the bug is.

## Steps to Reproduce

1. Start the bridge: `npm start`
2. Perform the action (e.g., send a message via `/typeRaw`, read response via `/lastResponse`)
3. Observe the issue

## Expected Behavior

What should happen (e.g., message appears in Claude Desktop, response is returned).

## Actual Behavior

What actually happens (e.g., connection refused, empty response, timeout).

## Environment

- **OS**: macOS / Linux / Windows
- **Node.js version**: (`node --version`)
- **Claude Desktop version**: (Help > About)
- **CDP patch applied?**: Yes / No
- **Browser**: Chrome / Chromium (version)

## Logs

```
Paste relevant output from the bridge console or conversation.log here.
```

## HTTP Request/Response

If relevant, include the curl command and response:

```bash
# Example
curl -s http://localhost:7777/lastResponse
```

```json
# Response
```

## Additional Context

- Is tmux running? (needed for notification features)
- Is the poller active? (`npm run poll`)
- Did this work before? If so, what changed?
