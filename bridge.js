// ============================================
// COWORK BRIDGE - Production Version
// ============================================
// Puppeteer-core bridge to Claude Desktop (Electron) via Chrome DevTools Protocol
// Enables HTTP API for DOM automation and bidirectional messaging between
// Claude Cowork and Claude Code via shared JSON files.
// ============================================

const puppeteer = require('puppeteer-core');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Path to patched Claude desktop app with CDP enabled
  claudePath: process.env.CLAUDE_PATH || '/Users/avinoam/Claude-Debug.app/Contents/MacOS/Claude',

  // Network ports
  httpPort: parseInt(process.env.HTTP_PORT || '7777', 10),
  cdpPort: parseInt(process.env.CDP_PORT || '9222', 10),

  // File paths
  bridgeDir: process.env.BRIDGE_DIR || __dirname,

  // Tmux session for notifications
  tmuxSession: process.env.TMUX_SESSION || 'claude',

  // Timeouts and limits
  cdpStartupTimeout: parseInt(process.env.CDP_TIMEOUT || '30', 10), // seconds
  fileWatchDebounce: parseInt(process.env.FILE_WATCH_DEBOUNCE || '500', 10), // ms
  outboxMaxMessages: parseInt(process.env.OUTBOX_MAX || '50', 10),

  // Feature flags
  enableTmuxNotify: process.env.ENABLE_TMUX_NOTIFY !== 'false',
};

// Derived paths
const OUTBOX_FILE = path.join(CONFIG.bridgeDir, 'outbox.json');
const COWORK_TO_CODE_FILE = path.join(CONFIG.bridgeDir, 'cowork-to-code.json');
const LOG_FILE = path.join(CONFIG.bridgeDir, 'conversation.log');

// ============================================
// STATE
// ============================================

let appPage = null;
let browser = null;
let httpServer = null;
let lastCoworkContent = '';
let isShuttingDown = false;

// ============================================
// LOGGING & CONVERSATION TRACKING
// ============================================

/**
 * Logs a message to both console and conversation.log with timestamp
 * @param {string} direction - 'to-cowork' or 'from-cowork'
 * @param {string} message - Message content to log
 */
function logMessage(direction, message) {
  try {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const arrow = direction === 'to-cowork' ? '→ TO COWORK' : '← FROM COWORK';
    const line = `[${ts}] ${arrow}: ${message}\n`;

    fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8' });
    console.log(line.trim());
  } catch (error) {
    console.error('Failed to log message:', error.message);
  }
}

/**
 * Logs errors with full context
 */
function logError(context, error) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ERROR in ${context}: ${error.message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, line, { encoding: 'utf8' });
  } catch (e) {
    // If we can't write to log, at least console it
  }
  console.error(line.trim());
}

// ============================================
// PAGE MANAGEMENT
// ============================================

/**
 * Refreshes the page reference by finding the active Claude page
 * Handles cases where page becomes detached or target closes
 * @returns {Promise<Page>} Active Puppeteer page
 */
async function refreshPage() {
  try {
    const pages = await browser.pages();

    // Try to find a claude.ai page first
    for (const page of pages) {
      const url = page.url();
      if (url.includes('claude.ai')) {
        appPage = page;
        console.log('Refreshed page reference to:', url.slice(0, 60));
        return appPage;
      }
    }

    // Fallback: use the last page (most recently active)
    if (pages.length > 0) {
      appPage = pages[pages.length - 1];
      console.log('Refreshed page reference to:', appPage.url().slice(0, 60));
      return appPage;
    }

    throw new Error('No pages available');
  } catch (error) {
    logError('refreshPage', error);
    throw error;
  }
}

// ============================================
// TMUX INTEGRATION
// ============================================

/**
 * Finds the Claude tmux session or falls back to first available session
 * @returns {string|null} Tmux session name or null if tmux not available
 */
function getClaudeTmuxSession() {
  if (!CONFIG.enableTmuxNotify) {
    return null;
  }

  try {
    const sessions = execSync('tmux list-sessions -F "#{session_name}"', {
      encoding: 'utf8',
      timeout: 2000
    });
    const sessionList = sessions.trim().split('\n').filter(s => s.length > 0);

    // Try to find a session matching the configured name or containing 'claude'
    const match = sessionList.find(s =>
      s.toLowerCase().includes('claude') || s === CONFIG.tmuxSession
    );

    return match || sessionList[0] || null;
  } catch (error) {
    // tmux not available or error occurred
    return null;
  }
}

/**
 * Sends a notification to Claude Code via tmux
 * @param {string} message - Message to include in notification
 * @returns {boolean} Success status
 */
function wakeClaudeCode(message) {
  const session = getClaudeTmuxSession();
  if (!session) {
    return false;
  }

  try {
    const notifyCmd = `echo "\\n📬 COWORK MESSAGE: Check ~/cowork-bridge/outbox.json\\n"`;
    execSync(`tmux send-keys -t "${session}" "${notifyCmd}" Enter`, {
      timeout: 2000,
      stdio: 'pipe'
    });
    execSync(`tmux send-keys -t "${session}" "cat ~/cowork-bridge/outbox.json | jq ." Enter`, {
      timeout: 2000,
      stdio: 'pipe'
    });

    console.log(`Notified tmux session: ${session}`);
    return true;
  } catch (error) {
    console.log('tmux notify failed:', error.message);
    return false;
  }
}

// ============================================
// FILE WATCHER - Cowork → Claude Code
// ============================================

/**
 * Starts watching cowork-to-code.json for changes
 * Implements debouncing to handle multiple rapid file writes
 */
function startFileWatcher() {
  // Initialize with current content to avoid false triggers
  if (fs.existsSync(COWORK_TO_CODE_FILE)) {
    try {
      lastCoworkContent = fs.readFileSync(COWORK_TO_CODE_FILE, 'utf8');
    } catch (error) {
      logError('startFileWatcher init', error);
    }
  }

  // Debounce timer to handle multiple rapid writes
  let debounceTimer = null;

  try {
    fs.watch(CONFIG.bridgeDir, (eventType, filename) => {
      if (filename !== 'cowork-to-code.json') {
        return;
      }

      // Clear existing timer
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // Set new timer
      debounceTimer = setTimeout(() => {
        try {
          const content = fs.readFileSync(COWORK_TO_CODE_FILE, 'utf8');

          // Skip if content hasn't changed
          if (content === lastCoworkContent) {
            return;
          }

          lastCoworkContent = content;

          // Parse and log the message
          const msgs = JSON.parse(content);
          const latest = Array.isArray(msgs) ? msgs[msgs.length - 1] : msgs;
          const messageText = latest.message || JSON.stringify(latest).slice(0, 80);

          logMessage('from-cowork', messageText);
        } catch (error) {
          // File might be in the middle of being written, ignore parse errors
          if (error.code !== 'ENOENT') {
            logError('fileWatcher parse', error);
          }
        }
      }, CONFIG.fileWatchDebounce);
    });

    console.log(`Watching ${COWORK_TO_CODE_FILE} for Cowork messages`);
  } catch (error) {
    logError('startFileWatcher', error);
  }
}

/**
 * Sends a message from bridge to Claude Code via outbox.json
 * @param {string} message - Message to send
 * @param {object} data - Additional data payload
 * @returns {object} The outbox entry that was created
 */
function sendToClaudeCode(message, data = {}) {
  try {
    const outboxData = {
      timestamp: new Date().toISOString(),
      message,
      data,
      read: false
    };

    // Load existing outbox
    let outbox = [];
    if (fs.existsSync(OUTBOX_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf8'));
        outbox = Array.isArray(existing) ? existing : [existing];
      } catch (error) {
        logError('sendToClaudeCode read', error);
        outbox = [];
      }
    }

    // Append new message
    outbox.push(outboxData);

    // Trim to max size
    if (outbox.length > CONFIG.outboxMaxMessages) {
      outbox = outbox.slice(-CONFIG.outboxMaxMessages);
    }

    // Write back
    fs.writeFileSync(OUTBOX_FILE, JSON.stringify(outbox, null, 2), { encoding: 'utf8' });

    // Notify via tmux
    wakeClaudeCode(message);

    return outboxData;
  } catch (error) {
    logError('sendToClaudeCode', error);
    throw error;
  }
}

// ============================================
// DOM QUERY FUNCTIONS
// ============================================

/**
 * Gets all interactive elements from the page with their properties
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Array of element descriptors
 */
async function getAllInteractiveElements(page) {
  return await page.evaluate(() => {
    const elements = [];
    const selectors = [
      'button',
      'a',
      'input',
      'textarea',
      '[role="button"]',
      '[onclick]',
      '[tabindex]'
    ];

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const rect = el.getBoundingClientRect();

        // Only include visible elements
        if (rect.width > 0 && rect.height > 0) {
          elements.push({
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            id: el.id || null,
            class: el.className || null,
            text: el.innerText?.slice(0, 100) || null,
            placeholder: el.placeholder || null,
            ariaLabel: el.getAttribute('aria-label') || null,
            role: el.getAttribute('role') || null,
            selector: generateSelector(el),
            bounds: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            }
          });
        }
      });
    });

    return elements;

    // Helper to generate a usable CSS selector
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

      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
        const index = siblings.indexOf(el) + 1;
        return `${el.tagName.toLowerCase()}:nth-of-type(${index})`;
      }

      return el.tagName.toLowerCase();
    }
  });
}

/**
 * Gets all text input fields (textarea, contenteditable, text inputs)
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Array of textarea descriptors
 */
async function getTextareas(page) {
  return await page.evaluate(() => {
    const results = [];
    const selectors = 'textarea, [contenteditable="true"], input[type="text"]';

    document.querySelectorAll(selectors).forEach((el, index) => {
      const rect = el.getBoundingClientRect();

      results.push({
        index,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: el.className || null,
        placeholder: el.placeholder || null,
        value: el.value?.slice(0, 50) || el.innerText?.slice(0, 50) || null,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        visible: rect.width > 0 && rect.height > 0
      });
    });

    return results;
  });
}

/**
 * Gets all button elements
 * @param {Page} page - Puppeteer page
 * @returns {Promise<Array>} Array of button descriptors
 */
async function getButtons(page) {
  return await page.evaluate(() => {
    const results = [];
    const selectors = 'button, [role="button"], input[type="submit"]';

    document.querySelectorAll(selectors).forEach((el, index) => {
      const rect = el.getBoundingClientRect();

      results.push({
        index,
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        class: el.className || null,
        text: el.innerText?.slice(0, 50) || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        disabled: el.disabled || false,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        visible: rect.width > 0 && rect.height > 0
      });
    });

    return results;
  });
}

/**
 * Gets visible text from page body (limited to 5000 chars)
 */
async function getVisibleText(page) {
  return await page.evaluate(() => document.body.innerText.slice(0, 5000));
}

/**
 * Gets full HTML content of the page
 */
async function getHTML(page) {
  return await page.content();
}

// ============================================
// DOM ACTION FUNCTIONS
// ============================================

/**
 * Clicks an element by CSS selector
 */
async function clickElement(page, selector) {
  await page.click(selector);
  return { success: true, action: 'click', selector };
}

/**
 * Clicks an element containing specific text using XPath
 */
async function clickByText(page, text) {
  const elements = await page.$x(`//*[contains(text(), "${text}")]`);

  if (elements.length === 0) {
    throw new Error(`No element found with text: ${text}`);
  }

  await elements[0].click();
  return { success: true, action: 'clickByText', text };
}

/**
 * Clicks at specific coordinates
 */
async function clickAtCoords(page, x, y) {
  await page.mouse.click(x, y);
  return { success: true, action: 'clickAtCoords', x, y };
}

/**
 * Types text into a selector (clears existing content first)
 */
async function typeText(page, selector, text) {
  await page.click(selector, { clickCount: 3 }); // Select all
  await page.type(selector, text);
  return { success: true, action: 'type', selector, text };
}

/**
 * Types into the currently focused element
 */
async function typeIntoFocused(page, text) {
  await page.keyboard.type(text);
  return { success: true, action: 'typeIntoFocused', text };
}

/**
 * Presses a keyboard key
 */
async function pressKey(page, key) {
  await page.keyboard.press(key);
  return { success: true, action: 'pressKey', key };
}

/**
 * Takes a screenshot and saves to bridge directory
 */
async function takeScreenshot(page, filename = 'screenshot.png') {
  const filepath = path.join(CONFIG.bridgeDir, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return { success: true, action: 'screenshot', path: filepath };
}

/**
 * Focuses an element by selector
 */
async function focusElement(page, selector) {
  await page.focus(selector);
  return { success: true, action: 'focus', selector };
}

// ============================================
// HTTP SERVER
// ============================================

/**
 * Handles HTTP requests to the bridge API
 */
async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(200);
    res.end();
    return;
  }

  let body = '';

  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const cmd = body ? JSON.parse(body) : {};
      const action = req.url.slice(1).split('?')[0]; // Remove leading / and query params
      let page = appPage;
      let result;

      // Wrapper that auto-recovers from detached page errors
      const executeWithRetry = async (fn) => {
        try {
          return await fn(page);
        } catch (error) {
          // If page is detached or target closed, refresh and retry once
          if (error.message.includes('detached') ||
              error.message.includes('Target closed') ||
              error.message.includes('Session closed')) {
            console.log('Page stale, refreshing...');
            page = await refreshPage();
            return await fn(page);
          }
          throw error;
        }
      };

      // Route the action
      switch (action) {
        // Query endpoints
        case 'elements':
          result = await executeWithRetry(p => getAllInteractiveElements(p));
          break;

        case 'textareas':
          result = await executeWithRetry(p => getTextareas(p));
          break;

        case 'buttons':
          result = await executeWithRetry(p => getButtons(p));
          break;

        case 'text':
          result = await executeWithRetry(p => getVisibleText(p));
          break;

        case 'html':
          result = await executeWithRetry(p => getHTML(p));
          break;

        // Action endpoints
        case 'click':
          result = await executeWithRetry(p => clickElement(p, cmd.selector));
          break;

        case 'clickText':
          result = await executeWithRetry(p => clickByText(p, cmd.text));
          break;

        case 'clickCoords':
          result = await executeWithRetry(p => clickAtCoords(p, cmd.x, cmd.y));
          break;

        case 'type':
          result = await executeWithRetry(p => typeText(p, cmd.selector, cmd.text));
          logMessage('to-cowork', cmd.text);
          break;

        case 'typeRaw':
          result = await executeWithRetry(p => typeIntoFocused(p, cmd.text));
          logMessage('to-cowork', cmd.text);
          break;

        case 'press':
          result = await executeWithRetry(p => pressKey(p, cmd.key));
          break;

        case 'screenshot':
          result = await executeWithRetry(p => takeScreenshot(p, cmd.filename));
          break;

        case 'focus':
          result = await executeWithRetry(p => focusElement(p, cmd.selector));
          break;

        // Bidirectional messaging endpoints
        case 'outbox':
          result = fs.existsSync(OUTBOX_FILE)
            ? JSON.parse(fs.readFileSync(OUTBOX_FILE, 'utf8'))
            : [];
          break;

        case 'clearOutbox':
          fs.writeFileSync(OUTBOX_FILE, '[]', { encoding: 'utf8' });
          result = { success: true, action: 'clearOutbox' };
          break;

        case 'toClaudeCode':
          result = sendToClaudeCode(cmd.message, cmd.data);
          break;

        // Log retrieval
        case 'log':
          if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            const lines = content.trim().split('\n');
            const limit = cmd.last || 20;
            result = {
              lines: lines.slice(-limit),
              total: lines.length
            };
          } else {
            result = { lines: [], total: 0 };
          }
          break;

        // Health check
        case 'status':
          const pages = await browser.pages();
          result = {
            status: 'ok',
            timestamp: Date.now(),
            uptime: process.uptime(),
            config: {
              httpPort: CONFIG.httpPort,
              cdpPort: CONFIG.cdpPort,
              tmuxEnabled: CONFIG.enableTmuxNotify
            },
            connection: {
              browserConnected: browser.isConnected(),
              pageCount: pages.length,
              currentPageUrl: appPage ? appPage.url() : null,
              tmuxSession: getClaudeTmuxSession()
            },
            files: {
              outboxExists: fs.existsSync(OUTBOX_FILE),
              coworkFileExists: fs.existsSync(COWORK_TO_CODE_FILE),
              logSize: fs.existsSync(LOG_FILE)
                ? fs.statSync(LOG_FILE).size
                : 0
            }
          };
          break;

        // Legacy ping endpoint (kept for backwards compatibility)
        case 'ping':
          result = {
            status: 'ok',
            timestamp: Date.now(),
            tmuxSession: getClaudeTmuxSession()
          };
          break;

        default:
          res.statusCode = 404;
          result = {
            error: 'Unknown command',
            available: {
              query: ['elements', 'textareas', 'buttons', 'text', 'html', 'outbox', 'log'],
              actions: ['click', 'clickText', 'clickCoords', 'type', 'typeRaw', 'press', 'screenshot', 'focus'],
              bidirectional: ['toClaudeCode', 'clearOutbox'],
              health: ['status', 'ping']
            }
          };
      }

      res.writeHead(res.statusCode || 200);
      res.end(JSON.stringify(result, null, 2));

    } catch (error) {
      logError(`HTTP ${req.url}`, error);
      res.writeHead(500);
      res.end(JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }, null, 2));
    }
  });
}

/**
 * Starts the HTTP server
 */
function startServer() {
  httpServer = http.createServer(handleRequest);

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${CONFIG.httpPort} is already in use`);
      process.exit(1);
    } else {
      logError('HTTP server', error);
    }
  });

  httpServer.listen(CONFIG.httpPort, () => {
    console.log(`Bridge API: http://localhost:${CONFIG.httpPort}`);
    console.log(`Health check: http://localhost:${CONFIG.httpPort}/status`);
  });

  return httpServer;
}

// ============================================
// CDP CONNECTION
// ============================================

/**
 * Checks if CDP is available on the configured port
 * @returns {Promise<boolean>}
 */
async function isCDPAvailable() {
  try {
    execSync(`curl -s --max-time 2 http://127.0.0.1:${CONFIG.cdpPort}/json/version`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Starts the Claude desktop app if CDP is not already available
 */
async function ensureCDPAvailable() {
  const cdpReady = await isCDPAvailable();

  if (cdpReady) {
    console.log('CDP already available');
    return;
  }

  console.log('CDP not available. Starting Claude-Debug...');

  // Spawn Claude desktop app
  const child = spawn(CONFIG.claudePath, [], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  console.log(`Spawned Claude-Debug (PID: ${child.pid})`);

  // Wait for CDP to become available
  process.stdout.write('Waiting for CDP');

  for (let i = 0; i < CONFIG.cdpStartupTimeout; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (await isCDPAvailable()) {
      console.log('\nCDP ready');
      return;
    }

    process.stdout.write('.');
  }

  throw new Error(`CDP did not start within ${CONFIG.cdpStartupTimeout} seconds`);
}

/**
 * Connects to Claude desktop via Puppeteer CDP
 */
async function connectToBrowser() {
  console.log('Connecting via Puppeteer...');

  browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${CONFIG.cdpPort}`,
    defaultViewport: null,
  });

  // Handle unexpected disconnection
  browser.on('disconnected', () => {
    if (!isShuttingDown) {
      console.error('Browser disconnected unexpectedly');
      logError('browser', new Error('Unexpected disconnection'));
      process.exit(1);
    }
  });

  const pages = await browser.pages();
  console.log(`Found ${pages.length} page(s)`);

  // Find the main Claude page
  let mainPage = pages[0];
  for (const page of pages) {
    const url = page.url();
    if (url.includes('claude.ai')) {
      mainPage = page;
      break;
    }
  }

  if (!mainPage) {
    throw new Error('No pages found in browser');
  }

  const title = await mainPage.title();
  const url = mainPage.url();
  console.log(`Main page: "${title}" [${url.slice(0, 60)}]`);

  appPage = mainPage;
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

/**
 * Handles graceful shutdown on SIGINT/SIGTERM
 */
async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  // Close HTTP server
  if (httpServer) {
    httpServer.close(() => {
      console.log('HTTP server closed');
    });
  }

  // Disconnect from browser (but keep Claude running)
  if (browser && browser.isConnected()) {
    await browser.disconnect();
    console.log('Disconnected from browser (Claude keeps running)');
  }

  console.log('Bridge shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logError('uncaughtException', error);
  console.error('Fatal error:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('unhandledRejection', new Error(String(reason)));
  console.error('Unhandled promise rejection:', reason);
});

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('='.repeat(50));
  console.log('COWORK BRIDGE - Starting');
  console.log('='.repeat(50));
  console.log('');

  // Display configuration
  console.log('Configuration:');
  console.log(`  Claude Path: ${CONFIG.claudePath}`);
  console.log(`  HTTP Port:   ${CONFIG.httpPort}`);
  console.log(`  CDP Port:    ${CONFIG.cdpPort}`);
  console.log(`  Bridge Dir:  ${CONFIG.bridgeDir}`);
  console.log(`  Tmux:        ${CONFIG.enableTmuxNotify ? CONFIG.tmuxSession : 'disabled'}`);
  console.log('');

  // Ensure CDP is available
  await ensureCDPAvailable();

  // Connect to browser
  await connectToBrowser();

  // Start services
  const tmuxSession = getClaudeTmuxSession();
  startServer();
  startFileWatcher();

  console.log('');
  console.log('='.repeat(50));
  console.log('BRIDGE READY');
  console.log('='.repeat(50));
  console.log(`Status:  http://localhost:${CONFIG.httpPort}/status`);
  console.log(`API:     http://localhost:${CONFIG.httpPort}`);
  console.log(`CDP:     http://127.0.0.1:${CONFIG.cdpPort}`);
  console.log(`Tmux:    ${tmuxSession || 'NONE'}`);
  console.log('');
  console.log('Press Ctrl+C to stop (Claude will keep running)');
  console.log('='.repeat(50));
}

// Start the bridge
main().catch((error) => {
  console.error('Fatal error during startup:', error);
  logError('main', error);
  process.exit(1);
});
