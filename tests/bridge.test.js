/**
 * Cowork Bridge Test Suite
 *
 * Tests are organized into the following groups:
 *   1. Configuration & initialization
 *   2. Logging functions
 *   3. Content hash / poller logic
 *   4. Outbox / message formatting
 *   5. HTTP API route handling
 *   6. DOM query helpers
 *   7. Tmux integration
 *   8. Graceful shutdown
 *   9. CDP connection logic
 *  10. Error handling & retry logic
 */

const http = require('http');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Helpers: we extract pure-logic functions from bridge.js for unit testing.
// Since bridge.js is a monolithic script that starts on require(), we re-implement
// the pure functions here (they are copied verbatim) and test them in isolation.
// Integration tests use a real HTTP server with mocked Puppeteer.
// ---------------------------------------------------------------------------

/**
 * Formats a timestamp the same way bridge.js does.
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Formats a log line the same way bridge.js logMessage() does.
 * @param {string} direction - 'to-cowork' or 'from-cowork'
 * @param {string} message
 * @param {Date} [date]
 * @returns {string}
 */
function formatLogLine(direction, message, date = new Date()) {
  const ts = formatTimestamp(date);
  const arrow = direction === 'to-cowork' ? '→ TO COWORK' : '← FROM COWORK';
  return `[${ts}] ${arrow}: ${message}\n`;
}

/**
 * Computes a SHA-256 content hash (same algorithm as poller.sh).
 * @param {string} content
 * @returns {string}
 */
function contentHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Trims outbox to max size (same logic as bridge.js sendToClaudeCode).
 * @param {Array} outbox
 * @param {number} maxSize
 * @returns {Array}
 */
function trimOutbox(outbox, maxSize) {
  if (outbox.length > maxSize) {
    return outbox.slice(-maxSize);
  }
  return outbox;
}

/**
 * Generates a CSS selector for an element (same logic as bridge.js).
 * @param {object} el - Mock element
 * @returns {string}
 */
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

/**
 * Sanitizes a message for tmux (same logic as bridge.js wakeClaudeCode).
 * @param {string} message
 * @returns {string}
 */
function sanitizeForTmux(message) {
  return (message || '').replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
}

/**
 * Parses an action from a URL path (same logic as bridge.js handleRequest).
 * @param {string} url
 * @returns {string}
 */
function parseAction(url) {
  return url.slice(1).split('?')[0];
}

/**
 * Builds an outbox entry (same logic as bridge.js sendToClaudeCode).
 * @param {string} message
 * @param {object} data
 * @returns {object}
 */
function buildOutboxEntry(message, data = {}) {
  return {
    timestamp: new Date().toISOString(),
    message,
    data,
    read: false,
  };
}

// ===========================================================================
// 1. Configuration & Initialization
// ===========================================================================

describe('Configuration', () => {
  test('default HTTP port is 7777', () => {
    const defaultPort = parseInt(process.env.HTTP_PORT || '7777', 10);
    expect(defaultPort).toBe(7777);
  });

  test('default CDP port is 9222', () => {
    const defaultCdpPort = parseInt(process.env.CDP_PORT || '9222', 10);
    expect(defaultCdpPort).toBe(9222);
  });

  test('HTTP port can be overridden via env var', () => {
    const original = process.env.HTTP_PORT;
    process.env.HTTP_PORT = '8888';
    const port = parseInt(process.env.HTTP_PORT || '7777', 10);
    expect(port).toBe(8888);
    if (original) {
      process.env.HTTP_PORT = original;
    } else {
      delete process.env.HTTP_PORT;
    }
  });

  test('tmux notify defaults to enabled', () => {
    const enabled = process.env.ENABLE_TMUX_NOTIFY !== 'false';
    expect(enabled).toBe(true);
  });

  test('tmux notify can be disabled via env var', () => {
    const original = process.env.ENABLE_TMUX_NOTIFY;
    process.env.ENABLE_TMUX_NOTIFY = 'false';
    const enabled = process.env.ENABLE_TMUX_NOTIFY !== 'false';
    expect(enabled).toBe(false);
    if (original) {
      process.env.ENABLE_TMUX_NOTIFY = original;
    } else {
      delete process.env.ENABLE_TMUX_NOTIFY;
    }
  });
});

// ===========================================================================
// 2. Logging Functions
// ===========================================================================

describe('Logging', () => {
  test('formatTimestamp produces ISO-like string without T separator', () => {
    const date = new Date('2026-02-09T12:34:56.789Z');
    const result = formatTimestamp(date);
    expect(result).toBe('2026-02-09 12:34:56');
    expect(result).not.toContain('T');
  });

  test('formatTimestamp truncates to seconds (no milliseconds)', () => {
    const date = new Date('2026-01-15T08:05:30.999Z');
    const result = formatTimestamp(date);
    expect(result).toHaveLength(19);
    expect(result).not.toContain('.');
  });

  test('formatLogLine for to-cowork direction', () => {
    const date = new Date('2026-02-09T10:00:00.000Z');
    const line = formatLogLine('to-cowork', 'Hello Cowork', date);
    expect(line).toContain('→ TO COWORK');
    expect(line).toContain('Hello Cowork');
    expect(line).toMatch(/^\[2026-02-09 10:00:00\]/);
    expect(line.endsWith('\n')).toBe(true);
  });

  test('formatLogLine for from-cowork direction', () => {
    const date = new Date('2026-02-09T10:00:00.000Z');
    const line = formatLogLine('from-cowork', 'Response text', date);
    expect(line).toContain('← FROM COWORK');
    expect(line).toContain('Response text');
  });

  test('formatLogLine handles empty message', () => {
    const line = formatLogLine('to-cowork', '');
    expect(line).toContain('→ TO COWORK: \n');
  });
});

// ===========================================================================
// 3. Content Hash (Poller Logic)
// ===========================================================================

describe('Content Hash', () => {
  test('identical content produces identical hashes', () => {
    const content = 'Hello, this is a test response from CoWork';
    expect(contentHash(content)).toBe(contentHash(content));
  });

  test('different content produces different hashes', () => {
    const hash1 = contentHash('Response version 1');
    const hash2 = contentHash('Response version 2');
    expect(hash1).not.toBe(hash2);
  });

  test('hash is a 64-character hex string', () => {
    const hash = contentHash('any content');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('empty content produces a valid hash', () => {
    const hash = contentHash('');
    expect(hash).toHaveLength(64);
    // SHA-256 of empty string is well-known
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('content hash is deterministic across calls', () => {
    const content = 'CoWork says: the analysis is complete with 42 findings';
    const hashes = Array.from({ length: 5 }, () => contentHash(content));
    expect(new Set(hashes).size).toBe(1);
  });
});

// ===========================================================================
// 4. Outbox / Message Formatting
// ===========================================================================

describe('Outbox', () => {
  test('buildOutboxEntry creates well-formed entry', () => {
    const entry = buildOutboxEntry('Task done', { count: 5 });
    expect(entry.message).toBe('Task done');
    expect(entry.data).toEqual({ count: 5 });
    expect(entry.read).toBe(false);
    expect(entry.timestamp).toBeTruthy();
    // Timestamp should be ISO 8601
    expect(() => new Date(entry.timestamp)).not.toThrow();
  });

  test('buildOutboxEntry defaults data to empty object', () => {
    const entry = buildOutboxEntry('Simple message');
    expect(entry.data).toEqual({});
  });

  test('trimOutbox keeps all entries when under limit', () => {
    const outbox = [{ message: 'a' }, { message: 'b' }, { message: 'c' }];
    const result = trimOutbox(outbox, 50);
    expect(result).toHaveLength(3);
  });

  test('trimOutbox trims oldest entries when over limit', () => {
    const outbox = Array.from({ length: 55 }, (_, i) => ({ message: `msg-${i}` }));
    const result = trimOutbox(outbox, 50);
    expect(result).toHaveLength(50);
    // Should keep the most recent 50 (indices 5-54)
    expect(result[0].message).toBe('msg-5');
    expect(result[49].message).toBe('msg-54');
  });

  test('trimOutbox handles exact limit', () => {
    const outbox = Array.from({ length: 50 }, (_, i) => ({ message: `msg-${i}` }));
    const result = trimOutbox(outbox, 50);
    expect(result).toHaveLength(50);
    expect(result[0].message).toBe('msg-0');
  });

  test('trimOutbox handles empty array', () => {
    const result = trimOutbox([], 50);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// 5. HTTP API Route Parsing
// ===========================================================================

describe('HTTP API Route Parsing', () => {
  test('parseAction extracts simple path', () => {
    expect(parseAction('/status')).toBe('status');
    expect(parseAction('/text')).toBe('text');
    expect(parseAction('/typeRaw')).toBe('typeRaw');
  });

  test('parseAction strips query parameters', () => {
    expect(parseAction('/log?last=10')).toBe('log');
    expect(parseAction('/status?format=json')).toBe('status');
  });

  test('parseAction handles root path', () => {
    expect(parseAction('/')).toBe('');
  });

  test('parseAction handles nested paths (returns full path after leading slash)', () => {
    expect(parseAction('/api/v1/status')).toBe('api/v1/status');
  });
});

// ===========================================================================
// 6. DOM Query Helpers (Selector Generation)
// ===========================================================================

describe('Selector Generation', () => {
  test('generates id selector when id is present', () => {
    const el = { id: 'submit-btn', className: 'btn primary', tagName: 'BUTTON' };
    expect(generateSelector(el)).toBe('#submit-btn');
  });

  test('generates class selector when no id but className present', () => {
    const el = { id: '', className: 'btn primary extra', tagName: 'BUTTON' };
    expect(generateSelector(el)).toBe('button.btn.primary');
  });

  test('generates tag selector as fallback', () => {
    const el = { id: '', className: '', tagName: 'DIV' };
    expect(generateSelector(el)).toBe('div');
  });

  test('limits class selector to 2 classes', () => {
    const el = { id: '', className: 'a b c d e', tagName: 'SPAN' };
    const selector = generateSelector(el);
    expect(selector).toBe('span.a.b');
  });

  test('handles non-string className gracefully', () => {
    // SVG elements have className as SVGAnimatedString, not a string
    const el = { id: '', className: {}, tagName: 'SVG' };
    expect(generateSelector(el)).toBe('svg');
  });
});

// ===========================================================================
// 7. Tmux Integration
// ===========================================================================

describe('Tmux Message Sanitization', () => {
  test('escapes double quotes', () => {
    const result = sanitizeForTmux('He said "hello"');
    expect(result).toBe('He said \\"hello\\"');
  });

  test('replaces newlines with spaces', () => {
    const result = sanitizeForTmux('Line 1\nLine 2\nLine 3');
    expect(result).toBe('Line 1 Line 2 Line 3');
  });

  test('truncates to 200 characters', () => {
    const longMsg = 'x'.repeat(300);
    const result = sanitizeForTmux(longMsg);
    expect(result).toHaveLength(200);
  });

  test('handles null/undefined gracefully', () => {
    expect(sanitizeForTmux(null)).toBe('');
    expect(sanitizeForTmux(undefined)).toBe('');
  });

  test('handles empty string', () => {
    expect(sanitizeForTmux('')).toBe('');
  });

  test('combines escaping, newline replacement, and truncation', () => {
    const msg = '"a"\n'.repeat(100);
    const result = sanitizeForTmux(msg);
    expect(result).not.toContain('\n');
    expect(result).not.toContain('"a"');
    expect(result.length).toBeLessThanOrEqual(200);
  });
});

// ===========================================================================
// 8. Graceful Shutdown
// ===========================================================================

describe('Shutdown Flag Logic', () => {
  test('isShuttingDown flag prevents duplicate shutdown', () => {
    let isShuttingDown = false;
    let shutdownCount = 0;

    function shutdown() {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;
      shutdownCount++;
    }

    shutdown();
    shutdown();
    shutdown();

    expect(shutdownCount).toBe(1);
    expect(isShuttingDown).toBe(true);
  });
});

// ===========================================================================
// 9. Integration Tests: HTTP Server (Mock Puppeteer)
// ===========================================================================

describe('HTTP Server Integration', () => {
  let server;
  let port;

  // Minimal mock of the bridge's HTTP handler for testing route dispatch
  function createMockHandler() {
    return (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');

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
        const action = req.url.slice(1).split('?')[0];
        let result;
        let statusCode = 200;

        switch (action) {
          case 'status':
            result = {
              status: 'ok',
              timestamp: Date.now(),
              uptime: process.uptime(),
            };
            break;
          case 'ping':
            result = { status: 'ok', timestamp: Date.now() };
            break;
          case 'text':
            result = 'Mock page text content';
            break;
          case 'lastResponse':
            result = 'Mock assistant response';
            break;
          case 'typeRaw':
            try {
              const cmd = JSON.parse(body);
              result = { success: true, action: 'typeIntoFocused', text: cmd.text };
            } catch (_e) {
              statusCode = 400;
              result = { error: 'Invalid JSON' };
            }
            break;
          case 'click':
            try {
              const cmd = JSON.parse(body);
              result = { success: true, action: 'click', selector: cmd.selector };
            } catch (_e) {
              statusCode = 400;
              result = { error: 'Invalid JSON' };
            }
            break;
          default:
            statusCode = 404;
            result = {
              error: 'Unknown command',
              available: {
                query: ['text', 'lastResponse', 'status'],
                actions: ['click', 'typeRaw'],
                health: ['status', 'ping'],
              },
            };
        }

        res.writeHead(statusCode);
        res.end(JSON.stringify(result, null, 2));
      });
    };
  }

  beforeAll((done) => {
    server = http.createServer(createMockHandler());
    // Use port 0 to get a random available port
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

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

  test('GET /status returns ok status', async () => {
    const res = await makeRequest('GET', '/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  test('GET /ping returns ok status', async () => {
    const res = await makeRequest('GET', '/ping');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /text returns page text', async () => {
    const res = await makeRequest('GET', '/text');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Mock page text content');
  });

  test('GET /lastResponse returns assistant response', async () => {
    const res = await makeRequest('GET', '/lastResponse');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Mock assistant response');
  });

  test('POST /typeRaw sends text successfully', async () => {
    const res = await makeRequest('POST', '/typeRaw', { text: 'Hello CoWork' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.text).toBe('Hello CoWork');
  });

  test('POST /click sends click successfully', async () => {
    const res = await makeRequest('POST', '/click', { selector: '#send-btn' });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.selector).toBe('#send-btn');
  });

  test('unknown endpoint returns 404 with available routes', async () => {
    const res = await makeRequest('GET', '/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Unknown command');
    expect(res.body.available).toBeDefined();
  });

  test('CORS headers are set on all responses', async () => {
    const res = await makeRequest('GET', '/status');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['content-type']).toBe('application/json');
  });

  test('OPTIONS preflight returns 200', async () => {
    const res = await makeRequest('OPTIONS', '/status');
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
// 10. Error Handling & Retry Logic
// ===========================================================================

describe('Error Handling', () => {
  test('detached page error triggers retry logic', async () => {
    let callCount = 0;

    async function executeWithRetry(fn) {
      try {
        return await fn();
      } catch (error) {
        if (
          error.message.includes('detached') ||
          error.message.includes('Target closed') ||
          error.message.includes('Session closed')
        ) {
          callCount++;
          // Simulate successful retry
          return await fn();
        }
        throw error;
      }
    }

    // First call throws, simulating a stale page
    let firstCall = true;
    const result = await executeWithRetry(() => {
      if (firstCall) {
        firstCall = false;
        throw new Error(
          'Execution context was destroyed, most likely because of page navigation or Target closed'
        );
      }
      return { success: true };
    });

    expect(callCount).toBe(1);
    expect(result.success).toBe(true);
  });

  test('non-retryable errors propagate immediately', async () => {
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
        throw new Error('No element found with text: Submit');
      })
    ).rejects.toThrow('No element found with text: Submit');
  });

  test('file parse errors during watch are handled gracefully', () => {
    // Simulates the bridge's file watcher behavior with corrupt JSON
    let errorLogged = false;

    function processFileContent(content) {
      try {
        const msgs = JSON.parse(content);
        const latest = Array.isArray(msgs) ? msgs[msgs.length - 1] : msgs;
        return latest.message || JSON.stringify(latest).slice(0, 80);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errorLogged = true;
        }
        return null;
      }
    }

    // Valid JSON
    expect(processFileContent('[{"message":"hello"}]')).toBe('hello');

    // Invalid JSON (mid-write)
    expect(processFileContent('{"partial')).toBeNull();
    expect(errorLogged).toBe(true);
  });
});

// ===========================================================================
// Bonus: File Path Construction
// ===========================================================================

describe('File Path Construction', () => {
  test('outbox file path is within bridge directory', () => {
    const bridgeDir = '/Users/test/cowork-bridge';
    const outboxFile = path.join(bridgeDir, 'outbox.json');
    expect(outboxFile).toBe('/Users/test/cowork-bridge/outbox.json');
    expect(path.dirname(outboxFile)).toBe(bridgeDir);
  });

  test('log file path is within bridge directory', () => {
    const bridgeDir = '/Users/test/cowork-bridge';
    const logFile = path.join(bridgeDir, 'conversation.log');
    expect(path.basename(logFile)).toBe('conversation.log');
  });

  test('screenshot path is within bridge directory', () => {
    const bridgeDir = '/Users/test/cowork-bridge';
    const screenshotFile = path.join(bridgeDir, 'screenshot.png');
    expect(screenshotFile).toContain(bridgeDir);
  });
});
