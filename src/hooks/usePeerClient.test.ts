import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePeerClient } from './usePeerClient';
import { FakeConnection, lastPeer, resetPeerMock } from '../test/peerMock';
import { PeerMessage } from '../types';
import { makeGameState, makePlayer } from '../test/factories';

vi.mock('peerjs', async () => {
  const mod = await import('../test/peerMock');
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

  it('adopts state broadcasts from the host', () => {
    const { result, conn } = connectClient();
    const state = makeGameState({ players: [makePlayer({ name: 'Host' })], round: 3 });
    act(() => conn.receive({ type: 'state', state } satisfies PeerMessage));
    expect(result.current.gameState).toEqual(state);
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

  it('closes inbound connections from non-host peers', () => {
    const { peer } = connectClient();
    const intruder = new FakeConnection('some-other-guest');
    act(() => peer.fireConnection(intruder));
    act(() => intruder.fireOpen());
    expect(intruder.closed).toBe(true);
  });
});
