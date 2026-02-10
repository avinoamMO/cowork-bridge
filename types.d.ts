/**
 * TypeScript type definitions for cowork-bridge.
 *
 * These types describe the shapes of data structures used throughout the bridge,
 * including configuration, API request/response payloads, and internal state.
 */

/** Bridge configuration, populated from environment variables with defaults. */
export interface BridgeConfig {
  /** Path to the patched Claude Desktop executable. */
  claudePath: string;
  /** HTTP API port (default: 7777). */
  httpPort: number;
  /** Chrome DevTools Protocol port (default: 9222). */
  cdpPort: number;
  /** Directory for shared files (conversation.log, outbox.json, etc.). */
  bridgeDir: string;
  /** Tmux session name for notifications (default: 'claude'). */
  tmuxSession: string;
  /** Seconds to wait for CDP to become available on startup (default: 30). */
  cdpStartupTimeout: number;
  /** Milliseconds to debounce file watch events (default: 500). */
  fileWatchDebounce: number;
  /** Maximum number of messages to keep in outbox.json (default: 50). */
  outboxMaxMessages: number;
  /** Whether tmux notifications are enabled (default: true). */
  enableTmuxNotify: boolean;
}

/** Bounding rectangle for a DOM element. */
export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Descriptor for an interactive DOM element returned by /elements. */
export interface InteractiveElement {
  tag: string;
  type: string | null;
  id: string | null;
  class: string | null;
  text: string | null;
  placeholder: string | null;
  ariaLabel: string | null;
  role: string | null;
  selector: string;
  bounds: ElementBounds;
}

/** Descriptor for a text input returned by /textareas. */
export interface TextareaElement {
  index: number;
  tag: string;
  id: string | null;
  class: string | null;
  placeholder: string | null;
  value: string | null;
  bounds: ElementBounds;
  visible: boolean;
}

/** Descriptor for a button element returned by /buttons. */
export interface ButtonElement {
  index: number;
  tag: string;
  id: string | null;
  class: string | null;
  text: string | null;
  ariaLabel: string | null;
  disabled: boolean;
  bounds: ElementBounds;
  visible: boolean;
}

/** Result from an action endpoint (click, type, press, etc.). */
export interface ActionResult {
  success: boolean;
  action: string;
  [key: string]: unknown;
}

/** Response from GET /status. */
export interface StatusResponse {
  status: 'ok';
  timestamp: number;
  uptime: number;
  config: {
    httpPort: number;
    cdpPort: number;
    tmuxEnabled: boolean;
  };
  connection: {
    browserConnected: boolean;
    pageCount: number;
    currentPageUrl: string | null;
    tmuxSession: string | null;
  };
  files: {
    outboxExists: boolean;
    coworkFileExists: boolean;
    logSize: number;
  };
}

/** A single entry in the outbox. */
export interface OutboxEntry {
  timestamp: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
}

/** Response from GET /log. */
export interface LogResponse {
  lines: string[];
  total: number;
}

/** Error response from any endpoint. */
export interface ErrorResponse {
  error: string;
  stack?: string;
}

/** Request body for POST /click. */
export interface ClickRequest {
  selector: string;
}

/** Request body for POST /clickText. */
export interface ClickTextRequest {
  text: string;
}

/** Request body for POST /clickCoords. */
export interface ClickCoordsRequest {
  x: number;
  y: number;
}

/** Request body for POST /type. */
export interface TypeRequest {
  selector: string;
  text: string;
}

/** Request body for POST /typeRaw. */
export interface TypeRawRequest {
  text: string;
}

/** Request body for POST /press. */
export interface PressRequest {
  key: string;
}

/** Request body for POST /focus. */
export interface FocusRequest {
  selector: string;
}

/** Request body for POST /screenshot. */
export interface ScreenshotRequest {
  filename?: string;
}

/** Request body for POST /toClaudeCode. */
export interface ToClaudeCodeRequest {
  message: string;
  data?: Record<string, unknown>;
}

/** Available API endpoints listed in 404 response. */
export interface AvailableEndpoints {
  query: string[];
  actions: string[];
  bidirectional: string[];
  health: string[];
}
