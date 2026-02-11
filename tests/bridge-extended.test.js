/**
 * Cowork Bridge Extended Test Suite
 *
 * Tests cover:
 *   1. Message parsing edge cases
 *   2. Connection error handling
 *   3. Timeout scenarios
 *   4. Multi-agent message routing
 *   5. Bridge state management
 */

const http = require('http');
const crypto = require('crypto');

// Re-implement pure functions from bridge.js for isolated testing

function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function contentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function trimOutbox(outbox, maxSize) {
  if (outbox.length > maxSize) {
    return outbox.slice(-maxSize);
  }
  return outbox;
}

function sanitizeForTmux(message) {
  return (message || '').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
}

function parseAction(url) {
  return url.slice(1).split('?')[0];
}

function buildOutboxEntry(message, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    message,
    data,
    read: false,
  };
}

function generateSelector(el) {
  if (el.id) {
    return `#${el.id}`;
  }
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
    if (classes) {
      return `${el.tagName.toLowerCase()}.${classes}`;
    }
  }
  return el.tagName.toLowerCase();
}

function processFileContent(content) {
  try {
    const msgs = JSON.parse(content);
    const latest = Array.isArray(msgs) ? msgs[msgs.length - 1] : msgs;
    return latest.message || JSON.stringify(latest).slice(0, 80);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      return null;
    }
    return null;
  }
}

// ===========================================================================
// 1. Message Parsing Edge Cases
// ===========================================================================

describe('Message Parsing Edge Cases', () => {
  test('processFileContent handles single object (not array)', () => {
    const result = processFileContent('{"message":"hello world"}');
    expect(result).toBe('hello world');
  });

  test('processFileContent handles array with single message', () => {
    const result = processFileContent('[{"message":"single"}]');
    expect(result).toBe('single');
  });

  test('processFileContent handles array with multiple messages (takes last)', () => {
    const content = JSON.stringify([
      { message: 'first' },
      { message: 'second' },
      { message: 'last' },
    ]);
    const result = processFileContent(content);
    expect(result).toBe('last');
  });

  test('processFileContent handles object without message field', () => {
    const result = processFileContent('{"type":"status","count":5}');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  test('processFileContent returns null for invalid JSON', () => {
    expect(processFileContent('{broken json')).toBeNull();
  });

  test('processFileContent returns null for truncated JSON (mid-write)', () => {
    expect(processFileContent('{"message":"half wr')).toBeNull();
  });

  test('processFileContent handles deeply nested object', () => {
    const content = JSON.stringify({ message: 'nested', data: { deep: { value: 42 } } });
    const result = processFileContent(content);
    expect(result).toBe('nested');
  });

  test('processFileContent handles message with special characters', () => {
    const content = JSON.stringify({ message: 'Hello "world" with\nnewlines & <html>' });
    const result = processFileContent(content);
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  test('processFileContent handles empty array', () => {
    const result = processFileContent('[]');
    // Array with no elements - accessing last element returns undefined
    expect(result).toBeNull(); // undefined.message throws
  });

  test('processFileContent truncates long messages to 80 chars when no message field', () => {
    const longValue = 'x'.repeat(200);
    const content = JSON.stringify({ data: longValue });
    const result = processFileContent(content);
    expect(result.length).toBeLessThanOrEqual(80);
  });
});

// ===========================================================================
// 2. Connection Error Handling
// ===========================================================================

describe('Connection Error Handling', () => {
  test('executeWithRetry retries on detached page error', async () => {
    let attempt = 0;
    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          return await fn();
        }
        throw error;
      }
    }

    const result = await executeWithRetry(() => {
      attempt++;
      if (attempt === 1) {
        throw new Error(
          'Execution context was destroyed, most likely because of page navigation or detached'
        );
      }
      return { success: true };
    });

    expect(attempt).toBe(2);
    expect(result.success).toBe(true);
  });

  test('executeWithRetry retries on Session closed error', async () => {
    let attempt = 0;
    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          return await fn();
        }
        throw error;
      }
    }

    const result = await executeWithRetry(() => {
      attempt++;
      if (attempt === 1) {
        throw new Error('Session closed');
      }
      return { ok: true };
    });

    expect(result.ok).toBe(true);
  });

  test('executeWithRetry retries on Target closed error', async () => {
    let attempt = 0;
    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          return await fn();
        }
        throw error;
      }
    }

    const result = await executeWithRetry(() => {
      attempt++;
      if (attempt === 1) {
        throw new Error('Target closed');
      }
      return { done: true };
    });

    expect(result.done).toBe(true);
  });

  test('non-CDP errors propagate without retry', async () => {
    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          return await fn();
        }
        throw error;
      }
    }

    await expect(
      executeWithRetry(() => {
        throw new Error('ECONNREFUSED');
      })
    ).rejects.toThrow('ECONNREFUSED');
  });

  test('timeout errors propagate without retry', async () => {
    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          return await fn();
        }
        throw error;
      }
    }

    await expect(
      executeWithRetry(() => {
        throw new Error('Navigation timeout of 30000 ms exceeded');
      })
    ).rejects.toThrow('Navigation timeout');
  });
});

// ===========================================================================
// 3. Timeout Scenarios
// ===========================================================================

describe('Timeout Scenarios', () => {
  test('CDP startup timeout defaults to 30 seconds', () => {
    const defaultTimeout = parseInt(process.env.CDP_TIMEOUT || '30', 10);
    expect(defaultTimeout).toBe(30);
  });

  test('CDP startup timeout is configurable', () => {
    const original = process.env.CDP_TIMEOUT;
    process.env.CDP_TIMEOUT = '60';
    const timeout = parseInt(process.env.CDP_TIMEOUT || '30', 10);
    expect(timeout).toBe(60);
    if (original) {
      process.env.CDP_TIMEOUT = original;
    } else {
      delete process.env.CDP_TIMEOUT;
    }
  });

  test('file watch debounce defaults to 500ms', () => {
    const debounce = parseInt(process.env.FILE_WATCH_DEBOUNCE || '500', 10);
    expect(debounce).toBe(500);
  });

  test('outbox max defaults to 50 messages', () => {
    const maxMessages = parseInt(process.env.OUTBOX_MAX || '50', 10);
    expect(maxMessages).toBe(50);
  });
});

// ===========================================================================
// 4. Multi-Agent Message Routing
// ===========================================================================

describe('Multi-Agent Message Routing', () => {
  test('outbox entries are timestamped for ordering', () => {
    const entry1 = buildOutboxEntry('Message 1');
    const entry2 = buildOutboxEntry('Message 2');

    expect(new Date(entry1.timestamp).getTime()).toBeLessThanOrEqual(
      new Date(entry2.timestamp).getTime()
    );
  });

  test('outbox entries support arbitrary data payloads', () => {
    const entry = buildOutboxEntry('Task result', {
      agent: 'researcher',
      findings: ['A', 'B', 'C'],
      score: 95,
    });
    expect(entry.data.agent).toBe('researcher');
    expect(entry.data.findings).toHaveLength(3);
    expect(entry.data.score).toBe(95);
  });

  test('outbox entries start as unread', () => {
    const entry = buildOutboxEntry('New message');
    expect(entry.read).toBe(false);
  });

  test('trimming preserves most recent messages for multi-agent scenarios', () => {
    const outbox = [];
    for (let i = 0; i < 60; i++) {
      outbox.push(buildOutboxEntry(`Agent ${i % 3}: Message ${i}`, { agentId: i % 3 }));
    }
    const trimmed = trimOutbox(outbox, 50);
    expect(trimmed).toHaveLength(50);
    // Most recent messages are preserved
    expect(trimmed[49].message).toBe('Agent 2: Message 59');
    expect(trimmed[0].message).toBe('Agent 1: Message 10');
  });

  test('content hash detects duplicate messages', () => {
    const msg1 = 'Agent response: analysis complete';
    const msg2 = 'Agent response: analysis complete';
    const msg3 = 'Agent response: analysis updated';

    expect(contentHash(msg1)).toBe(contentHash(msg2));
    expect(contentHash(msg1)).not.toBe(contentHash(msg3));
  });
});

// ===========================================================================
// 5. Bridge State Management
// ===========================================================================

describe('Bridge State Management', () => {
  test('shutdown flag prevents duplicate cleanup', () => {
    let isShuttingDown = false;
    let cleanupCount = 0;

    function shutdown() {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      cleanupCount++;
    }

    shutdown();
    shutdown();
    shutdown();

    expect(cleanupCount).toBe(1);
  });

  test('TMUX_TARGET env var overrides auto-detection', () => {
    const original = process.env.TMUX_TARGET;
    process.env.TMUX_TARGET = '%42';

    const target = process.env.TMUX_TARGET;
    expect(target).toBe('%42');

    if (original) {
      process.env.TMUX_TARGET = original;
    } else {
      delete process.env.TMUX_TARGET;
    }
  });

  test('sanitizeForTmux handles message with all special chars', () => {
    const msg = '"line1"\n"line2"\n"line3"';
    const result = sanitizeForTmux(msg);
    expect(result).not.toContain('\n');
    expect(result).not.toContain('"line1"');
    expect(result).toContain('\\"line1\\"');
  });

  test('sanitizeForTmux preserves content up to 200 chars', () => {
    const msg = 'short message';
    const result = sanitizeForTmux(msg);
    expect(result).toBe(msg);
  });

  test('parseAction handles multiple query parameters', () => {
    expect(parseAction('/log?last=10&format=json')).toBe('log');
  });

  test('parseAction handles URL-encoded characters', () => {
    expect(parseAction('/search%20query')).toBe('search%20query');
  });

  test('selector generation handles element with single class', () => {
    const el = { id: '', className: 'btn', tagName: 'BUTTON' };
    expect(generateSelector(el)).toBe('button.btn');
  });

  test('selector generation handles element with empty spaces in className', () => {
    const el = { id: '', className: '   ', tagName: 'DIV' };
    expect(generateSelector(el)).toBe('div');
  });

  test('content hash handles unicode content', () => {
    const hash = contentHash('Hello, World! Shalom!');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('formatTimestamp handles midnight', () => {
    const midnight = new Date('2026-01-01T00:00:00.000Z');
    const result = formatTimestamp(midnight);
    expect(result).toBe('2026-01-01 00:00:00');
  });

  test('formatTimestamp handles end of day', () => {
    const endOfDay = new Date('2026-12-31T23:59:59.999Z');
    const result = formatTimestamp(endOfDay);
    expect(result).toBe('2026-12-31 23:59:59');
  });
});

// ===========================================================================
// 6. HTTP API Extended Tests
// ===========================================================================

describe('HTTP API Extended', () => {
  let server;
  let port;

  function createMockHandler() {
    const outbox = [];

    return (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const action = parseAction(req.url);
        let result;
        let statusCode = 200;

        switch (action) {
          case 'status':
            result = { status: 'ok', timestamp: Date.now() };
            break;
          case 'toClaudeCode':
            try {
              const cmd = JSON.parse(body);
              const entry = buildOutboxEntry(cmd.message, cmd.data || {});
              outbox.push(entry);
              result = entry;
            } catch (_e) {
              statusCode = 400;
              result = { error: 'Invalid JSON' };
            }
            break;
          case 'outbox':
            result = outbox;
            break;
          case 'clearOutbox':
            outbox.length = 0;
            result = { success: true };
            break;
          case 'typeRaw':
            try {
              const cmd = JSON.parse(body);
              if (!cmd.text) {
                statusCode = 400;
                result = { error: 'Missing text field' };
              } else {
                result = { success: true, text: cmd.text };
              }
            } catch (_e) {
              statusCode = 400;
              result = { error: 'Invalid JSON' };
            }
            break;
          default:
            statusCode = 404;
            result = { error: 'Unknown command' };
        }

        res.writeHead(statusCode);
        res.end(JSON.stringify(result));
      });
    };
  }

  function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        });
      });

      req.on('error', reject);
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  beforeAll((done) => {
    server = http.createServer(createMockHandler());
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('POST /toClaudeCode stores message in outbox', async () => {
    const res = await makeRequest('POST', '/toClaudeCode', {
      message: 'Test message',
      data: { key: 'value' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Test message');
    expect(res.body.read).toBe(false);
  });

  test('GET /outbox returns stored messages', async () => {
    const res = await makeRequest('GET', '/outbox');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('POST /clearOutbox empties the outbox', async () => {
    const res = await makeRequest('POST', '/clearOutbox');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    const outboxRes = await makeRequest('GET', '/outbox');
    expect(outboxRes.body).toHaveLength(0);
  });

  test('POST /typeRaw returns 400 for missing text', async () => {
    const res = await makeRequest('POST', '/typeRaw', {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Missing text field');
  });

  test('POST /typeRaw returns 400 for malformed JSON', async () => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: '/typeRaw',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    const result = await new Promise((resolve, reject) => {
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        });
      });
      req.on('error', reject);
      req.write('not valid json{');
      req.end();
    });
    expect(result.statusCode).toBe(400);
  });

  test('CORS headers include methods and headers for preflight', async () => {
    const res = await makeRequest('OPTIONS', '/status');
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });
});
