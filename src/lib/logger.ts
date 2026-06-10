// Lightweight, capturable diagnostic log for debugging the P2P room lifecycle in
// the field. There is no backend to ship logs to, so each browser keeps its own
// in-memory ring buffer that the user can export from DevTools (or the in-app
// "Copy debug log" button) and paste back to us. Off by default — gated by either
// the build-time `VITE_PP_DEBUG` flag or a runtime `localStorage` toggle, so it
// can be switched on against the deployed GitHub Pages build with no rebuild:
//
//   __PP_LOG.enable(); location.reload();   // capture from the start of a session
//   // …reproduce the bug…
//   copy(__PP_LOG.text());                  // grab the trace, then paste it to us
//
// Mirrors the philosophy of VITE_PEER_DEBUG (see peerConfig.ts): always shipped,
// near-zero cost when disabled (a single boolean check per call).

export interface LogEntry {
  /** Wall-clock ms (Date.now). Correlates events across tabs/windows on one machine. */
  t: number;
  /** Coarse source tag, e.g. 'room'. */
  tag: string;
  /** Short event name, e.g. 'becomeHost' or 'claim:reject'. */
  event: string;
  /** Optional structured context (role, ids, epochs, …). */
  data?: unknown;
}

const BUFFER_CAP = 2000;
const buffer: LogEntry[] = [];
const DEBUG_KEY = 'pp_debug';

function readToggle(): boolean {
  try {
    if (import.meta.env.VITE_PP_DEBUG) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = readToggle();

export function logEnabled(): boolean {
  return enabled;
}

function safe(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function format(e: LogEntry): string {
  const ts = new Date(e.t).toISOString().slice(11, 23); // HH:MM:SS.mmm
  return `${ts} [${e.tag}] ${e.event}${e.data !== undefined ? ' ' + safe(e.data) : ''}`;
}

/** Record a diagnostic event. No-op (cheap) unless debug logging is enabled. */
export function log(tag: string, event: string, data?: unknown): void {
  if (!enabled) return;
  const entry: LogEntry = { t: Date.now(), tag, event, ...(data !== undefined ? { data } : {}) };
  buffer.push(entry);
  if (buffer.length > BUFFER_CAP) buffer.shift();
  console.debug(format(entry));
}

export interface PPLogApi {
  /** The raw entries, oldest first. */
  dump(): LogEntry[];
  /** A copy-pasteable, one-line-per-event transcript. */
  text(): string;
  /** Clear the buffer. */
  clear(): void;
  /** Turn logging on (persisted) — reload to capture from the start of a session. */
  enable(): void;
  /** Turn logging off (persisted). */
  disable(): void;
  /** Whether logging is currently on. */
  readonly on: boolean;
}

const api: PPLogApi = {
  dump: () => [...buffer],
  text: () => buffer.map(format).join('\n'),
  clear: () => {
    buffer.length = 0;
  },
  enable: () => {
    enabled = true;
    try {
      localStorage.setItem(DEBUG_KEY, '1');
    } catch {
      /* best-effort */
    }
  },
  disable: () => {
    enabled = false;
    try {
      localStorage.removeItem(DEBUG_KEY);
    } catch {
      /* best-effort */
    }
  },
  get on() {
    return enabled;
  },
};

// Expose on window so it's reachable from DevTools on every participant's browser.
if (typeof window !== 'undefined') {
  (window as unknown as { __PP_LOG?: PPLogApi }).__PP_LOG = api;
}

export const ppLog = api;
