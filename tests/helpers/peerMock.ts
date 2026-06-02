// Minimal in-memory stand-in for PeerJS, good enough to drive usePeerHost /
// usePeerClient in tests. Tests reach the live instances via `peerInstances`
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
    this.emit('close');
  }

  /** Last message sent, for terse assertions. */
  get lastSent(): unknown {
    return this.sent[this.sent.length - 1];
  }

  // --- test drivers ---
  fireOpen(): void {
    this.open = true;
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

  constructor(id?: string) {
    super();
    this.requestedId = id;
    this.id = id ?? '';
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
