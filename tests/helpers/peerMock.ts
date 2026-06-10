// Minimal in-memory stand-in for PeerJS, good enough to drive useRoom (host and
// guest roles) in tests. Tests reach the live instances via `peerInstances`
// and drive them with the `fire*` / `receive` helpers.
//
// Wire it up in a test with:
//   vi.mock('peerjs', async () => {
//     const mod = await import('../helpers/peerMock');
//     return { default: mod.FakePeer };
//   });

type Handler = (...args: unknown[]) => void;

class Emitter {
  private handlers: Record<string, Handler[]> = {};
  on(event: string, cb: Handler): this {
    (this.handlers[event] ??= []).push(cb);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    (this.handlers[event] ?? []).slice().forEach((h) => h(...args));
  }
}

export class FakeConnection extends Emitter {
  peer: string;
  open = false;
  closed = false;
  /** True once the connection has ever fired 'open'. */
  everOpened = false;
  /** Every payload passed to `send`, in order — assert on this in tests. */
  sent: unknown[] = [];

  constructor(peer: string) {
    super();
    this.peer = peer;
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    // Real PeerJS only notifies 'close' for a connection that actually opened.
    // A connect() that never established (e.g. the broker still holds a dead id)
    // emits neither 'open' nor 'close' — the caller hangs unless it times out.
    // Modelling that is what lets tests reproduce the "stuck forever" hang.
    if (this.everOpened) this.emit('close');
  }

  /** Last message sent, for terse assertions. */
  get lastSent(): unknown {
    return this.sent[this.sent.length - 1];
  }

  // --- test drivers ---
  fireOpen(): void {
    this.open = true;
    this.everOpened = true;
    this.emit('open');
  }
  receive(data: unknown): void {
    this.emit('data', data);
  }
  fireError(err: unknown): void {
    this.emit('error', err);
  }
  fireClose(): void {
    this.open = false;
    this.emit('close');
  }
}

export class FakePeer extends Emitter {
  id: string;
  destroyed = false;
  requestedId: string | undefined;
  /** Connections created via `peer.connect(...)` (the client → host link). */
  outgoing: FakeConnection[] = [];

  // Mirror PeerJS's real overloads: new Peer(options) or new Peer(id, options).
  // A leading object is the options bag, not an id — don't mistake it for one.
  constructor(idOrOptions?: string | object, _options?: object) {
    super();
    this.requestedId = typeof idOrOptions === 'string' ? idOrOptions : undefined;
    this.id = this.requestedId ?? '';
    peerInstances.push(this);
  }

  connect(peerId: string, _opts?: unknown): FakeConnection {
    const conn = new FakeConnection(peerId);
    this.outgoing.push(conn);
    return conn;
  }

  destroy(): void {
    this.destroyed = true;
  }

  reconnect(): void {
    // no-op for tests
  }

  // --- test drivers ---
  /** Simulate the broker assigning an id. Defaults to the requested id. */
  fireOpen(id?: string): void {
    this.id = id ?? this.requestedId ?? '';
    this.emit('open', this.id);
  }
  fireError(err: { type?: string; message?: string }): void {
    this.emit('error', err);
  }
  fireDisconnected(): void {
    this.emit('disconnected');
  }
  /** Simulate a remote peer opening a data connection to us (host side). */
  fireConnection(conn: FakeConnection): void {
    this.emit('connection', conn);
  }
}

/** Every FakePeer constructed since the last reset, in creation order. */
export const peerInstances: FakePeer[] = [];

export function resetPeerMock(): void {
  peerInstances.length = 0;
}

export function lastPeer(): FakePeer {
  const p = peerInstances[peerInstances.length - 1];
  if (!p) throw new Error('No FakePeer has been constructed yet');
  return p;
}
