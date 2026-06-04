import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRoom, UseRoomReturn } from '../../src/hooks/useRoom';
import { FakeConnection, lastPeer, peerInstances, resetPeerMock, FakePeer } from '../helpers/peerMock';
import { PeerMessage } from '../../src/domain/types';
import { makeGameState, makePlayer } from '../helpers/factories';
import { storage } from '../../src/lib/storage';

// Mirror of the hook's RECONNECT_BASE_MS so a timer advance lands a retry.
const RECONNECT_BASE_MS_GUESS = 2000;
// Mirror of the hook's HOST_HANDOFF_GRACE_MS.
const HOST_HANDOFF_GRACE_MS_GUESS = 600;

vi.mock('peerjs', async () => {
  const mod = await import('../helpers/peerMock');
  return { default: mod.FakePeer };
});

// Deterministic, secure-context-free crypto so `create` runs synchronously and
// claims verify by handle match.
vi.mock('../../src/lib/hostIdentity', () => ({
  cryptoAvailable: () => false,
  createHostKeypair: async () => null,
  signClaim: async () => null,
  verifyClaim: async () => false,
  randomNonce: () => 'nonce',
}));

beforeEach(() => {
  resetPeerMock();
  localStorage.clear();
});

type HookResult = { current: UseRoomReturn };

// ---------------------------------------------------------------------------

describe('useRoom — host role', () => {
  beforeEach(() => {
    // Defeat the per-type inbound throttle: advance a fake clock on each read.
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 100));
  });
  afterEach(() => vi.restoreAllMocks());

  function openHost(): { result: HookResult; peer: FakePeer } {
    const { result } = renderHook(() =>
      useRoom({ roomCode: 'ROOM01', playerName: 'Host', intent: 'create' }),
    );
    const peer = lastPeer();
    act(() => peer.fireOpen()); // id defaults to the requested 'ROOM01'
    return { result, peer };
  }

  function join(
    result: HookResult,
    peer: FakePeer,
    id: string,
    name: string,
    handle: string,
  ): FakeConnection {
    const conn = new FakeConnection(id);
    act(() => peer.fireConnection(conn));
    act(() => conn.fireOpen());
    act(() => conn.receive({ type: 'request-join', name, handle } satisfies PeerMessage));
    act(() => result.current.approvePlayer(id));
    return conn;
  }

  it('claims the room code and seeds itself as host', () => {
    const { result } = openHost();
    expect(result.current.role).toBe('host');
    expect(result.current.isPreferredHost).toBe(true);
    expect(result.current.myId).toBe('ROOM01');
    expect(result.current.gameState!.players).toEqual([
      expect.objectContaining({ id: 'ROOM01', name: 'Host', connected: true }),
    ]);
  });

  it('queues an unknown guest then approves them', () => {
    const { result, peer } = openHost();
    const conn = new FakeConnection('guest1');
    act(() => peer.fireConnection(conn));
    act(() => conn.fireOpen());
    act(() => conn.receive({ type: 'request-join', name: 'Alice', handle: 'h-a' } satisfies PeerMessage));
    expect(result.current.pendingPlayers).toEqual([
      { id: 'guest1', name: 'Alice', persistentId: 'h-a' },
    ]);
    act(() => result.current.approvePlayer('guest1'));
    expect(conn.sent).toContainEqual({ type: 'approved' });
    expect(result.current.gameState!.players).toContainEqual(
      expect.objectContaining({ id: 'guest1', name: 'Alice' }),
    );
  });

  it('records a guest vote and broadcasts a value-free voted delta', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    const b = join(result, peer, 'guest2', 'Bob', 'h-b');
    act(() => a.receive({ type: 'vote', value: 5 } satisfies PeerMessage));

    expect(result.current.gameState!.players.find((p) => p.id === 'guest1')!.vote).toBe(5);
    const voted = b.sent.filter((m) => (m as PeerMessage)?.type === 'voted').pop();
    expect(voted).toEqual({ type: 'voted', version: expect.any(Number), id: 'guest1' });
    expect(voted).not.toHaveProperty('value');
  });

  it('does not rebroadcast a voted delta for an unchanged vote', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    const b = join(result, peer, 'guest2', 'Bob', 'h-b');
    act(() => a.receive({ type: 'vote', value: 5 } satisfies PeerMessage));
    const first = b.sent.filter((m) => (m as PeerMessage)?.type === 'voted').length;
    act(() => a.receive({ type: 'vote', value: 5 } satisfies PeerMessage));
    expect(b.sent.filter((m) => (m as PeerMessage)?.type === 'voted').length).toBe(first);
  });

  it('reveals every vote on reveal()', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    act(() => a.receive({ type: 'vote', value: 8 } satisfies PeerMessage));
    act(() => result.current.reveal());
    const reveal = a.sent.filter((m) => (m as PeerMessage)?.type === 'reveal').pop() as Extract<
      PeerMessage,
      { type: 'reveal' }
    >;
    expect(reveal.votes).toContainEqual(['guest1', 8]);
  });

  it('marks a player disconnected when their connection closes', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    act(() => a.fireClose());
    expect(result.current.gameState!.players.find((p) => p.id === 'guest1')!.connected).toBe(false);
  });

  it('announces room-closed to connected guests on closeRoom()', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    act(() => result.current.closeRoom());
    expect(a.sent).toContainEqual({ type: 'room-closed' } satisfies PeerMessage);
  });

  it('announces host-departing to guests when the tab closes', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(a.sent).toContainEqual({ type: 'host-departing' } satisfies PeerMessage);
  });

  it('does not announce host-departing after an explicit closeRoom()', () => {
    const { result, peer } = openHost();
    const a = join(result, peer, 'guest1', 'Alice', 'h-a');
    act(() => result.current.closeRoom());
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(a.sent).not.toContainEqual({ type: 'host-departing' } satisfies PeerMessage);
  });

  it('auto-approves a returning handle from a restored host session', () => {
    storage.saveHost({ hostName: 'Host', roomCode: 'ROOM01', approvedHandles: { 'h-a': 'Alice' } });
    const { result, peer } = openHost();
    const conn = new FakeConnection('guest1');
    act(() => peer.fireConnection(conn));
    act(() => conn.fireOpen());
    act(() => conn.receive({ type: 'request-join', name: 'Alice', handle: 'h-a' } satisfies PeerMessage));
    // No manual approval needed.
    expect(result.current.pendingPlayers).toHaveLength(0);
    expect(conn.sent).toContainEqual({ type: 'approved' });
  });

  it('seeds its own handle as approved (and persists it) so a temp host re-approves it on return', () => {
    const { result } = openHost();
    const handle = storage.getRoomHandle('ROOM01');
    // Distributed in broadcast state → a guest promoted to temporary host knows
    // we're approved and won't force us back through the join queue.
    expect(result.current.gameState!.approvedHandles[handle]).toBe('Host');
    // Persisted → the approval survives a restart and rides into migration.
    expect(storage.getHost()!.approvedHandles[handle]).toBe('Host');
  });
});

// ---------------------------------------------------------------------------

describe('useRoom — guest role', () => {
  function openGuest() {
    const { result } = renderHook(() =>
      useRoom({ roomCode: 'ROOM01', playerName: 'Guest', intent: 'join' }),
    );
    const peer = lastPeer();
    act(() => peer.fireOpen('CLIENT01'));
    const conn = peer.outgoing[0];
    act(() => conn.fireOpen());
    return { result, peer, conn };
  }

  it('connects and sends a request-join with a handle', () => {
    const { result, conn } = openGuest();
    expect(result.current.role).toBe('guest');
    expect(result.current.status).toBe('pending');
    const join = conn.sent[0] as Extract<PeerMessage, { type: 'request-join' }>;
    expect(join.type).toBe('request-join');
    expect(join.name).toBe('Guest');
    expect(typeof join.handle).toBe('string');
    expect(join.handle.length).toBeGreaterThan(0);
  });

  it('becomes connected on approval and adopts a snapshot', () => {
    const { result, conn } = openGuest();
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));
    expect(result.current.status).toBe('connected');
    const state = makeGameState({ hostId: 'ROOM01', players: [makePlayer({ id: 'ROOM01' })] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));
    expect(result.current.gameState).toEqual(state);
  });

  it('errors on rejection and on room-closed', () => {
    const r1 = openGuest();
    act(() => r1.conn.receive({ type: 'rejected', reason: 'Room is full' } satisfies PeerMessage));
    expect(r1.result.current.status).toBe('error');
    expect(r1.result.current.error).toBe('Room is full');

    resetPeerMock();
    const r2 = openGuest();
    act(() => r2.conn.receive({ type: 'room-closed' } satisfies PeerMessage));
    expect(r2.result.current.status).toBe('error');
    expect(r2.result.current.error).toMatch(/closed the room/i);
  });

  it('applies an in-order delta and requests a resync on a gap', () => {
    const { result, conn } = openGuest();
    const state = makeGameState({ hostId: 'ROOM01', players: [makePlayer({ id: 'ROOM01' })] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));
    act(() => conn.receive({ type: 'voted', version: 2, id: 'ROOM01' } satisfies PeerMessage));
    expect(result.current.gameState!.players.find((p) => p.id === 'ROOM01')!.hasVoted).toBe(true);

    act(() => conn.receive({ type: 'voted', version: 4, id: 'ROOM01' } satisfies PeerMessage));
    expect(conn.sent).toContainEqual({ type: 'request-resync' } satisfies PeerMessage);
  });

  it('optimistically reflects the local vote', () => {
    const { result, conn } = openGuest();
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));
    const state = makeGameState({ hostId: 'ROOM01', players: [makePlayer({ id: 'CLIENT01' })] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));
    act(() => result.current.vote(8));
    const me = result.current.gameState!.players.find((p) => p.id === 'CLIENT01');
    expect(me!.vote).toBe(8);
  });
});

// ---------------------------------------------------------------------------

describe('useRoom — migration', () => {
  function connectedGuest(players: { id: string; name?: string; connected?: boolean }[]) {
    const { result } = renderHook(() =>
      useRoom({ roomCode: 'ROOM01', playerName: 'Guest', intent: 'join' }),
    );
    const peer = lastPeer();
    act(() => peer.fireOpen('CLIENT01'));
    const conn = peer.outgoing[0];
    act(() => conn.fireOpen());
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));
    const state = makeGameState({
      hostId: 'ROOM01',
      players: players.map((p) => makePlayer({ connected: true, ...p })),
    });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));
    return { result, peer, conn };
  }

  it('claims the room code when the host drops and we are the election winner', () => {
    vi.useFakeTimers();
    try {
      const { conn } = connectedGuest([{ id: 'ROOM01', name: 'Host' }, { id: 'CLIENT01' }]);
      act(() => conn.fireClose()); // host gone
      act(() => vi.advanceTimersByTime(RECONNECT_BASE_MS_GUESS));
      const claimant = peerInstances[peerInstances.length - 1];
      expect(claimant.requestedId).toBe('ROOM01'); // became host on the room code
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not claim when another connected peer is the winner', () => {
    vi.useFakeTimers();
    try {
      // 'AAA' sorts before 'CLIENT01' (uppercase), so it is the elected winner.
      const { conn } = connectedGuest([{ id: 'ROOM01', name: 'Host' }, { id: 'CLIENT01' }, { id: 'AAA' }]);
      act(() => conn.fireClose());
      act(() => vi.advanceTimersByTime(RECONNECT_BASE_MS_GUESS));
      const next = peerInstances[peerInstances.length - 1];
      expect(next.requestedId).toBeUndefined(); // reconnected as a guest, not host
    } finally {
      vi.useRealTimers();
    }
  });

  it('claims the room code immediately when the host announces departure', () => {
    const { conn } = connectedGuest([{ id: 'ROOM01', name: 'Host' }, { id: 'CLIENT01' }]);
    // No timer advance: the lone surviving candidate becomes host at once.
    act(() => conn.receive({ type: 'host-departing' } satisfies PeerMessage));
    const claimant = peerInstances[peerInstances.length - 1];
    expect(claimant.requestedId).toBe('ROOM01');
  });

  it('gives the winner a head start before a losing guest reconnects after departure', () => {
    vi.useFakeTimers();
    try {
      // 'AAA' is the elected winner; CLIENT01 must wait, then rejoin as a guest.
      const { conn } = connectedGuest([
        { id: 'ROOM01', name: 'Host' },
        { id: 'CLIENT01' },
        { id: 'AAA' },
      ]);
      const before = peerInstances.length;
      act(() => conn.receive({ type: 'host-departing' } satisfies PeerMessage));
      // The loser doesn't spin up a peer immediately — it waits the head start.
      expect(peerInstances.length).toBe(before);
      act(() => vi.advanceTimersByTime(HOST_HANDOFF_GRACE_MS_GUESS));
      const next = peerInstances[peerInstances.length - 1];
      expect(next.requestedId).toBeUndefined(); // reconnected as a guest, not host
    } finally {
      vi.useRealTimers();
    }
  });

  // The returning preferred host falls back to a guest (a temp host holds the
  // room code), gets approved, then must ask for control back. Without crypto
  // there's no keypair, so the takeover rides the handle-match path (sig: null).
  it('reclaims as preferred host after migration with a keyless handle-match claim', async () => {
    vi.useFakeTimers();
    try {
      storage.saveHost({ hostName: 'Host', roomCode: 'ROOM01', approvedHandles: {} });
      const handle = storage.getRoomHandle('ROOM01');
      renderHook(() => useRoom({ roomCode: 'ROOM01', playerName: 'Host', intent: 'create' }));

      // First we race for the room code, but a temporary host holds it: exhaust
      // the unavailable-id retries until we fall back to a guest peer.
      for (let i = 0; i < 20 && lastPeer().requestedId === 'ROOM01'; i++) {
        act(() => lastPeer().fireError({ type: 'unavailable-id' }));
        act(() => vi.advanceTimersByTime(600));
      }
      const guestPeer = lastPeer();
      expect(guestPeer.requestedId).toBeUndefined(); // failed over to a guest

      act(() => guestPeer.fireOpen('CLIENT01'));
      const conn = guestPeer.outgoing[0];
      act(() => conn.fireOpen());
      act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));

      // Snapshot from the temporary host: it holds the room code, the epoch is
      // bumped, and we are the pinned preferred host by handle (no pubKey).
      const state = makeGameState({
        hostId: 'ROOM01',
        migrationEpoch: 1,
        preferredHost: { handle, pubKey: null },
        players: [makePlayer({ id: 'ROOM01', name: 'Temp' })],
      });
      await act(async () => {
        conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage);
      });

      const claim = conn.sent.find((m) => (m as PeerMessage)?.type === 'claim-host') as
        | Extract<PeerMessage, { type: 'claim-host' }>
        | undefined;
      expect(claim).toBeDefined();
      expect(claim!.handle).toBe(handle);
      expect(claim!.sig).toBeNull();
      expect(claim!.epoch).toBe(2); // migrationEpoch + 1
    } finally {
      vi.useRealTimers();
    }
  });
});
