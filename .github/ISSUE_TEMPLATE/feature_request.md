---
name: Feature Request
about: Suggest a new endpoint, integration, or enhancement to the bridge
title: "[Feature] "
labels: enhancement
assignees: ''
---

## Feature Description

A clear description of what you'd like to see added.

## Use Case

Why is this feature useful? What multi-agent workflow does it enable?

**Example scenarios:**
- "I want WebSocket support so agents can stream messages in real-time"
- "I need authentication on the HTTP server to prevent accidental access"
- "I want automatic CDP reconnection when the browser restarts"

## Proposed API / Interface

If this adds or changes an endpoint, sketch out the API:

```
POST /your-new-endpoint
Content-Type: application/json

{ "param": "value" }

Response: 200 OK
{ "result": "value" }
```

## Alternatives Considered

Any other approaches you thought about.

## Compatibility Notes

- Does this require changes to the CDP connection?
- Does this work across macOS, Linux, and Windows?
- Does this add new npm dependencies? If so, which ones?
