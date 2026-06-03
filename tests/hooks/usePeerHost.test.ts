import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerHost, UsePeerHostReturn } from '../../src/hooks/usePeerHost';
import { FakeConnection, lastPeer, resetPeerMock, FakePeer } from '../helpers/peerMock';
import { GameState, PeerMessage, StateDelta } from '../../src/domain/types';
import { applyDelta } from '../../src/domain/gameLogic';

const DELTA_TYPES = new Set([
  'voted',
  'unvoted',
  'player-active',
  'reveal',
  'player-joined',
  'player-disconnected',
  'player-removed',
]);

vi.mock('peerjs', async () => {
  const mod = await import('../helpers/peerMock');
  return { default: mod.FakePeer };
});

beforeEach(() => {
  resetPeerMock();
  // The host throttles inbound messages to one per 50ms per connection. In
  // tests every message lands in the same tick, so advance a fake clock on each
  // Date.now() read to clear the throttle window between messages.
  let now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => (now += 100));
});

afterEach(() => {
  vi.restoreAllMocks();
});

type HookResult = { current: UsePeerHostReturn };

function openHost(options = {}): { result: HookResult; peer: FakePeer } {
  const { result } = renderHook(() => usePeerHost('Host', { roomCode: 'ROOM01', ...options }));
  const peer = lastPeer();
  act(() => peer.fireOpen());
  return { result, peer };
}

function requestJoin(
  peer: FakePeer,
  id: string,
  name: string,
  persistentId: string,
): FakeConnection {
  const conn = new FakeConnection(id);
  act(() => peer.fireConnection(conn));
  act(() => conn.fireOpen());
  act(() => conn.receive({ type: 'request-join', name, persistentId } satisfies PeerMessage));
  return conn;
}

function join(
  result: HookResult,
  peer: FakePeer,
  id: string,
  name: string,
  persistentId: string,
): FakeConnection {
  const conn = requestJoin(peer, id, name, persistentId);
  act(() => result.current.approvePlayer(id));
  return conn;
}

/**
 * Reconstruct what a connection's client would actually display, by folding the
 * host→client messages it received: snapshots set the base state, deltas patch
 * it — exactly what usePeerClient does. (Own-vote optimism is client-only, so a
 * voter's own value won't appear here; that's intentional.)
 */
function replayView(conn: FakeConnection): GameState | null {
  let state: GameState | null = null;
  for (const raw of conn.sent) {
    if (!raw || typeof raw !== 'object') continue;
    const msg = raw as PeerMessage;
    if (msg.type === 'snapshot') state = msg.state;
    else if (state && DELTA_TYPES.has(msg.type)) state = applyDelta(state, msg as StateDelta);
  }
  return state;
}

/** The last message of a given type a connection received. */
function lastOfType<T extends PeerMessage['type']>(
  conn: FakeConnection,
  type: T,
): Extract<PeerMessage, { type: T }> | undefined {
  const matches = conn.sent.filter(
    (m): m is Extract<PeerMessage, { type: T }> =>
      !!m && typeof m === 'object' && (m as { type?: string }).type === type,
  );
  return matches[matches.length - 1];
}

describe('usePeerHost — peer lifecycle', () => {
  it('assigns the room id and seeds the host player on open', () => {
    const { result } = openHost();
    expect(result.current.roomId).toBe('ROOM01');
    expect(result.current.gameState.hostId).toBe('ROOM01');
    expect(result.current.gameState.players).toEqual([
      expect.objectContaining({ id: 'ROOM01', name: 'Host', connected: true }),
    ]);
  });
});

describe('usePeerHost — joining', () => {
  it('queues an unknown guest for manual approval', () => {
    const { result, peer } = openHost();
    requestJoin(peer, 'guest1', 'Alice', 'pid-a');
    expect(result.current.pendingPlayers).toEqual([
      { id: 'guest1', name: 'Alice', persistentId: 'pid-a' },
    ]);
  });

  it('approving a guest adds the player and sends an approval', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');

    expect(result.current.pendingPlayers).toHaveLength(0);
    expect(result.current.gameState.players).toContainEqual(
      expect.objectContaining({ id: 'guest1', name: 'Alice', connected: true }),
    );
    expect(conn.sent).toContainEqual({ type: 'approved' });
  });

  it('rejects a duplicate name from a different guest', () => {
    const { result, peer } = openHost();
    join(result, peer, 'guest1', 'Alice', 'pid-a');

    const dup = requestJoin(peer, 'guest2', 'alice', 'pid-b'); // case-insensitive clash
    expect(result.current.pendingPlayers).toHaveLength(0);
    expect(dup.sent).toContainEqual(expect.objectContaining({ type: 'rejected' }));
  });

  it('auto-approves a previously-approved persistent id without queueing', () => {
    const { result, peer } = openHost({ approvedPlayers: { 'pid-a': 'Alice' } });
    const conn = requestJoin(peer, 'guest1', 'Alice', 'pid-a');

    expect(result.current.pendingPlayers).toHaveLength(0);
    expect(conn.sent).toContainEqual({ type: 'approved' });
    expect(result.current.gameState.players).toContainEqual(
      expect.objectContaining({ id: 'guest1', name: 'Alice' }),
    );
  });

  it('rejects connections once the room is full', () => {
    const { result, peer } = openHost();
    // Host + 9 guests = MAX_PLAYERS (10); the 10th guest is over the cap.
    for (let i = 1; i <= 9; i++) {
      join(result, peer, `guest${i}`, `Player${i}`, `pid-${i}`);
    }
    const overflow = new FakeConnection('guest10');
    act(() => peer.fireConnection(overflow));
    act(() => overflow.fireOpen());

    expect(overflow.sent).toContainEqual({ type: 'rejected', reason: 'Room is full' });
  });
});

describe('usePeerHost — joining broadcast', () => {
  it('sends a snapshot to the joiner and a player-joined delta to others', () => {
    const { result, peer } = openHost();
    const conn1 = join(result, peer, 'guest1', 'Alice', 'pid-a');
    const conn2 = join(result, peer, 'guest2', 'Bob', 'pid-b');

    // The newcomer (conn2) gets a full snapshot to seed its state…
    expect(lastOfType(conn2, 'snapshot')).toBeDefined();
    // …while the existing player (conn1) only gets a cheap join delta.
    const joined = lastOfType(conn1, 'player-joined');
    expect(joined?.player.id).toBe('guest2');
    expect(replayView(conn1)?.players.map((p) => p.id)).toEqual(
      expect.arrayContaining(['ROOM01', 'guest1', 'guest2']),
    );
  });
});

describe('usePeerHost — voting and broadcast', () => {
  it('records a guest vote in host state', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');
    act(() => conn.receive({ type: 'vote', value: 5 } satisfies PeerMessage));

    expect(result.current.gameState.players.find((p) => p.id === 'guest1')!.vote).toBe(5);
  });

  it('broadcasts a value-free voted delta before reveal', () => {
    const { result, peer } = openHost();
    const conn1 = join(result, peer, 'guest1', 'Alice', 'pid-a');
    const conn2 = join(result, peer, 'guest2', 'Bob', 'pid-b');

    act(() => conn1.receive({ type: 'vote', value: 5 } satisfies PeerMessage));

    // The delta sent to Bob carries only the voter id — no value leaks.
    const voted = lastOfType(conn2, 'voted');
    expect(voted).toEqual({ type: 'voted', version: expect.any(Number), id: 'guest1' });
    expect(voted).not.toHaveProperty('value');

    // And Bob's reconstructed view shows Alice as voted, but her value hidden.
    const alice = replayView(conn2)!.players.find((p) => p.id === 'guest1')!;
    expect(alice.hasVoted).toBe(true);
    expect(alice.vote).toBeNull();
  });

  it('reveals every vote after reveal()', () => {
    const { result, peer } = openHost();
    const conn1 = join(result, peer, 'guest1', 'Alice', 'pid-a');
    const conn2 = join(result, peer, 'guest2', 'Bob', 'pid-b');
    act(() => conn1.receive({ type: 'vote', value: 5 } satisfies PeerMessage));
    act(() => conn2.receive({ type: 'vote', value: 8 } satisfies PeerMessage));

    act(() => result.current.reveal());

    const seenByAlice = replayView(conn1)!;
    expect(seenByAlice.revealed).toBe(true);
    expect(seenByAlice.players.find((p) => p.id === 'guest1')!.vote).toBe(5);
    expect(seenByAlice.players.find((p) => p.id === 'guest2')!.vote).toBe(8);
  });

  it('replies with a snapshot when a client requests a resync', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');
    const before = conn.sent.filter((m) => (m as PeerMessage)?.type === 'snapshot').length;

    act(() => conn.receive({ type: 'request-resync' } satisfies PeerMessage));

    const after = conn.sent.filter((m) => (m as PeerMessage)?.type === 'snapshot').length;
    expect(after).toBe(before + 1);
  });

  it('ignores votes once revealed', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');
    act(() => result.current.reveal());
    act(() => conn.receive({ type: 'vote', value: 13 } satisfies PeerMessage));

    expect(result.current.gameState.players.find((p) => p.id === 'guest1')!.vote).toBeNull();
  });
});

describe('usePeerHost — disconnect', () => {
  it('marks a player disconnected when their connection closes', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');
    act(() => conn.fireClose());

    expect(result.current.gameState.players.find((p) => p.id === 'guest1')!.connected).toBe(false);
  });
});
