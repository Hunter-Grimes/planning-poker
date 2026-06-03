import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerClient } from '../../src/hooks/usePeerClient';
import { FakeConnection, lastPeer, resetPeerMock } from '../helpers/peerMock';
import { PeerMessage } from '../../src/domain/types';
import { makeGameState, makePlayer } from '../helpers/factories';

vi.mock('peerjs', async () => {
  const mod = await import('../helpers/peerMock');
  return { default: mod.FakePeer };
});

beforeEach(() => {
  resetPeerMock();
});

/** Render the client, open its peer, and open the host connection. */
function connectClient() {
  const hook = renderHook(() => usePeerClient('ROOM01', 'Guest', 'pid-g'));
  const peer = lastPeer();
  act(() => peer.fireOpen('CLIENT01'));
  const conn = peer.outgoing[0];
  act(() => conn.fireOpen());
  return { ...hook, peer, conn };
}

describe('usePeerClient', () => {
  it('connects to the room and sends a join request on open', () => {
    const { result, conn } = connectClient();
    expect(result.current.myId).toBe('CLIENT01');
    expect(result.current.status).toBe('pending');
    expect(conn.peer).toBe('ROOM01');
    expect(conn.sent[0]).toEqual({
      type: 'request-join',
      name: 'Guest',
      persistentId: 'pid-g',
    } satisfies PeerMessage);
  });

  it('becomes connected on approval', () => {
    const { result, conn } = connectClient();
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));
    expect(result.current.status).toBe('connected');
  });

  it('surfaces the reason and errors on rejection', () => {
    const { result, conn } = connectClient();
    act(() => conn.receive({ type: 'rejected', reason: 'Room is full' } satisfies PeerMessage));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Room is full');
  });

  it('adopts snapshots from the host', () => {
    const { result, conn } = connectClient();
    const state = makeGameState({ players: [makePlayer({ name: 'Host' })], round: 3 });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));
    expect(result.current.gameState).toEqual(state);
  });

  it('applies an in-order delta on top of a snapshot', () => {
    const { result, conn } = connectClient();
    const host = makePlayer({ id: 'HOST', name: 'Host' });
    const state = makeGameState({ players: [host] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));

    act(() => conn.receive({ type: 'voted', version: 2, id: 'HOST' } satisfies PeerMessage));
    expect(result.current.gameState?.players.find((p) => p.id === 'HOST')?.hasVoted).toBe(true);

    act(() => conn.receive({ type: 'reveal', version: 3, votes: [['HOST', 5]] } satisfies PeerMessage));
    expect(result.current.gameState?.revealed).toBe(true);
    expect(result.current.gameState?.players.find((p) => p.id === 'HOST')?.vote).toBe(5);
  });

  it('requests a resync when a delta arrives out of order', () => {
    const { conn } = connectClient();
    const state = makeGameState({ players: [makePlayer({ id: 'HOST', name: 'Host' })] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));

    // Skip version 2 — a v3 delta must not be applied; client asks to resync.
    act(() => conn.receive({ type: 'voted', version: 3, id: 'HOST' } satisfies PeerMessage));
    expect(conn.sent).toContainEqual({ type: 'request-resync' } satisfies PeerMessage);
  });

  it('requests a resync if a delta arrives before any snapshot', () => {
    const { conn } = connectClient();
    act(() => conn.receive({ type: 'voted', version: 1, id: 'HOST' } satisfies PeerMessage));
    expect(conn.sent).toContainEqual({ type: 'request-resync' } satisfies PeerMessage);
  });

  it('optimistically reflects the local vote before the host echoes it', () => {
    const { result, conn } = connectClient();
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));
    const me = makePlayer({ id: 'CLIENT01', name: 'Guest' });
    const state = makeGameState({ players: [me] });
    act(() => conn.receive({ type: 'snapshot', version: 1, state } satisfies PeerMessage));

    act(() => result.current.vote(8));
    const mine = result.current.gameState?.players.find((p) => p.id === 'CLIENT01');
    expect(mine?.vote).toBe(8);
    expect(mine?.hasVoted).toBe(true);
  });

  it('sends a vote only while the connection is open', () => {
    const { result, conn } = connectClient();
    act(() => conn.receive({ type: 'approved' } satisfies PeerMessage));

    act(() => result.current.vote(5));
    expect(conn.sent).toContainEqual({ type: 'vote', value: 5 } satisfies PeerMessage);

    act(() => conn.fireClose());
    const before = conn.sent.length;
    act(() => result.current.vote(8));
    expect(conn.sent.length).toBe(before); // nothing sent on a closed connection
  });

  it('sends an active signal while open', () => {
    const { result, conn } = connectClient();
    act(() => result.current.signalActive());
    expect(conn.sent).toContainEqual({ type: 'active' } satisfies PeerMessage);
  });

  it('errors out instead of hanging when the channel never opens', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePeerClient('ROOM01', 'Guest', 'pid-g'));
      const peer = lastPeer();
      act(() => peer.fireOpen('CLIENT01'));
      // Connection created but ICE never completes — no 'open', no 'error'.
      expect(result.current.status).toBe('connecting');
      act(() => vi.advanceTimersByTime(15000));
      expect(result.current.status).toBe('error');
      expect(result.current.error).toMatch(/could not reach the host/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the connect timeout once the channel opens', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePeerClient('ROOM01', 'Guest', 'pid-g'));
      const peer = lastPeer();
      act(() => peer.fireOpen('CLIENT01'));
      const conn = peer.outgoing[0];
      act(() => conn.fireOpen());
      expect(result.current.status).toBe('pending');
      // Well past the timeout — status must not flip to error.
      act(() => vi.advanceTimersByTime(30000));
      expect(result.current.status).toBe('pending');
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes inbound connections from non-host peers', () => {
    const { peer } = connectClient();
    const intruder = new FakeConnection('some-other-guest');
    act(() => peer.fireConnection(intruder));
    act(() => intruder.fireOpen());
    expect(intruder.closed).toBe(true);
  });
});
