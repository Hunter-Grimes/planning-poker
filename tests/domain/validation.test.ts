import { describe, it, expect } from 'vitest';
import { isCardValue, isPeerMessage } from '../../src/domain/validation';
import { MAX_NAME_LENGTH } from '../../src/domain/types';
import { makeGameState, makePlayer, makeComponent } from '../helpers/factories';

describe('isCardValue', () => {
  it.each([1, 2, 3, 5, 8, 13, 21, 34, '?'])('accepts %s', (v) => {
    expect(isCardValue(v)).toBe(true);
  });

  it.each([0, 4, 100, '5', 'x', null, undefined, {}])('rejects %s', (v) => {
    expect(isCardValue(v)).toBe(false);
  });
});

describe('isPeerMessage', () => {
  it('rejects non-objects and unknown types', () => {
    expect(isPeerMessage(null)).toBe(false);
    expect(isPeerMessage('vote')).toBe(false);
    expect(isPeerMessage({ type: 'nope' })).toBe(false);
  });

  describe('request-join', () => {
    it('accepts a valid request', () => {
      expect(isPeerMessage({ type: 'request-join', name: 'Bob', persistentId: 'pid' })).toBe(true);
    });

    it('rejects an empty name', () => {
      expect(isPeerMessage({ type: 'request-join', name: '', persistentId: 'pid' })).toBe(false);
    });

    it('rejects an over-length name', () => {
      const name = 'x'.repeat(MAX_NAME_LENGTH + 1);
      expect(isPeerMessage({ type: 'request-join', name, persistentId: 'pid' })).toBe(false);
    });

    it('rejects a missing persistentId', () => {
      expect(isPeerMessage({ type: 'request-join', name: 'Bob', persistentId: '' })).toBe(false);
    });
  });

  describe('vote', () => {
    it('accepts a valid card value', () => {
      expect(isPeerMessage({ type: 'vote', value: 8 })).toBe(true);
      expect(isPeerMessage({ type: 'vote', value: '?' })).toBe(true);
    });

    it('rejects an invalid card value', () => {
      expect(isPeerMessage({ type: 'vote', value: 7 })).toBe(false);
      expect(isPeerMessage({ type: 'vote', value: null })).toBe(false);
    });
  });

  it.each(['approved', 'active', 'request-resync'])('accepts the bare %s message', (type) => {
    expect(isPeerMessage({ type })).toBe(true);
  });

  describe('rejected', () => {
    it('requires a string reason', () => {
      expect(isPeerMessage({ type: 'rejected', reason: 'full' })).toBe(true);
      expect(isPeerMessage({ type: 'rejected' })).toBe(false);
    });
  });

  describe('state deltas', () => {
    it.each(['voted', 'unvoted', 'player-active', 'player-disconnected', 'player-removed'])(
      'accepts a versioned %s with an id',
      (type) => {
        expect(isPeerMessage({ type, version: 2, id: 'guest1' })).toBe(true);
      },
    );

    it('rejects an id-bearing delta without a version', () => {
      expect(isPeerMessage({ type: 'voted', id: 'guest1' })).toBe(false);
    });

    it('rejects an id-bearing delta with an empty id', () => {
      expect(isPeerMessage({ type: 'voted', version: 1, id: '' })).toBe(false);
    });

    it('accepts a reveal carrying well-formed votes', () => {
      expect(
        isPeerMessage({ type: 'reveal', version: 4, votes: [['a', 5], ['b', '?']] }),
      ).toBe(true);
      expect(isPeerMessage({ type: 'reveal', version: 4, votes: [] })).toBe(true);
    });

    it('rejects a reveal with a bad vote value', () => {
      expect(isPeerMessage({ type: 'reveal', version: 4, votes: [['a', 7]] })).toBe(false);
      expect(isPeerMessage({ type: 'reveal', version: 4, votes: [['a']] })).toBe(false);
    });

    it('accepts a player-joined with a valid player', () => {
      expect(
        isPeerMessage({ type: 'player-joined', version: 3, player: makePlayer({ id: 'g1' }) }),
      ).toBe(true);
    });

    it('rejects a player-joined with an invalid player', () => {
      expect(
        isPeerMessage({ type: 'player-joined', version: 3, player: { id: '', name: 'x' } }),
      ).toBe(false);
    });
  });

  describe('snapshot (validates the embedded GameState)', () => {
    it('accepts a well-formed snapshot', () => {
      const state = makeGameState({
        players: [makePlayer({ vote: 5 })],
        components: [makeComponent({ average: 3 })],
        hostId: 'host',
      });
      expect(isPeerMessage({ type: 'snapshot', version: 0, state })).toBe(true);
    });

    it('rejects a snapshot without a version', () => {
      expect(isPeerMessage({ type: 'snapshot', state: makeGameState() })).toBe(false);
    });

    it('rejects a snapshot with a bad player', () => {
      const state = makeGameState({
        players: [{ id: '', name: 'x', vote: null, connected: true }],
      });
      expect(isPeerMessage({ type: 'snapshot', version: 1, state })).toBe(false);
    });

    it('rejects a snapshot with an invalid vote on a player', () => {
      const state = makeGameState({
        players: [{ id: 'p', name: 'x', vote: 7, connected: true } as never],
      });
      expect(isPeerMessage({ type: 'snapshot', version: 1, state })).toBe(false);
    });

    it('rejects a snapshot with a non-finite round', () => {
      expect(
        isPeerMessage({ type: 'snapshot', version: 1, state: makeGameState({ round: NaN }) }),
      ).toBe(false);
    });

    it('rejects a snapshot with an unknown phase', () => {
      const state = { ...makeGameState(), phase: 'paused' } as never;
      expect(isPeerMessage({ type: 'snapshot', version: 1, state })).toBe(false);
    });

    it('rejects a component whose average is not finite', () => {
      const state = makeGameState({ components: [makeComponent({ average: Infinity as never })] });
      expect(isPeerMessage({ type: 'snapshot', version: 1, state })).toBe(false);
    });
  });

  it('rejects the retired state and new-round message types', () => {
    expect(isPeerMessage({ type: 'state', state: makeGameState() })).toBe(false);
    expect(isPeerMessage({ type: 'new-round' })).toBe(false);
  });
});
