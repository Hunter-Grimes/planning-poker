import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerHost, UsePeerHostReturn } from '../../src/hooks/usePeerHost';
import { FakeConnection, lastPeer, resetPeerMock, FakePeer } from '../helpers/peerMock';
import { GameState, PeerMessage } from '../../src/types';

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

/** The most recent broadcast state a connection received. */
function lastState(conn: FakeConnection): GameState {
  const states = conn.sent.filter(
    (m): m is { type: 'state'; state: GameState } =>
      !!m && typeof m === 'object' && (m as { type?: string }).type === 'state',
  );
  return states[states.length - 1].state;
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

describe('usePeerHost — voting and broadcast', () => {
  it('records a guest vote in host state', () => {
    const { result, peer } = openHost();
    const conn = join(result, peer, 'guest1', 'Alice', 'pid-a');
    act(() => conn.receive({ type: 'vote', value: 5 } satisfies PeerMessage));

    expect(result.current.gameState.players.find((p) => p.id === 'guest1')!.vote).toBe(5);
  });

  it('redacts other players votes in broadcasts before reveal', () => {
    const { result, peer } = openHost();
    const conn1 = join(result, peer, 'guest1', 'Alice', 'pid-a');
    join(result, peer, 'guest2', 'Bob', 'pid-b');

    act(() => conn1.receive({ type: 'vote', value: 5 } satisfies PeerMessage));
    act(() => result.current.gameState); // settle

    const seenByAlice = lastState(conn1);
    const alice = seenByAlice.players.find((p) => p.id === 'guest1')!;
    const bob = seenByAlice.players.find((p) => p.id === 'guest2')!;
    expect(alice.vote).toBe(5); // own vote visible
    expect(bob.vote).toBeNull(); // others hidden pre-reveal
  });

  it('reveals every vote after reveal()', () => {
    const { result, peer } = openHost();
    const conn1 = join(result, peer, 'guest1', 'Alice', 'pid-a');
    const conn2 = join(result, peer, 'guest2', 'Bob', 'pid-b');
    act(() => conn1.receive({ type: 'vote', value: 5 } satisfies PeerMessage));
    act(() => conn2.receive({ type: 'vote', value: 8 } satisfies PeerMessage));

    act(() => result.current.reveal());

    const seenByAlice = lastState(conn1);
    expect(seenByAlice.players.find((p) => p.id === 'guest2')!.vote).toBe(8);
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
