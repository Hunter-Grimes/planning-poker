import { describe, it, expect } from 'vitest';
import { isCardValue, isPeerMessage, randomId, MAX_NAME_LENGTH } from './types';
import { makeGameState, makePlayer, makeStory } from './test/factories';

describe('randomId', () => {
  it('returns a non-empty string', () => {
    expect(randomId().length).toBeGreaterThan(0);
  });

  it('returns a unique value across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });
});

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

  it.each(['approved', 'active', 'reveal', 'new-round'])('accepts the bare %s message', (type) => {
    expect(isPeerMessage({ type })).toBe(true);
  });

  describe('rejected', () => {
    it('requires a string reason', () => {
      expect(isPeerMessage({ type: 'rejected', reason: 'full' })).toBe(true);
      expect(isPeerMessage({ type: 'rejected' })).toBe(false);
    });
  });

  describe('state (validates the embedded GameState)', () => {
    it('accepts a well-formed state', () => {
      const state = makeGameState({
        players: [makePlayer({ vote: 5 })],
        stories: [makeStory({ average: 3 })],
        hostId: 'host',
      });
      expect(isPeerMessage({ type: 'state', state })).toBe(true);
    });

    it('rejects a state with a bad player', () => {
      const state = makeGameState({
        players: [{ id: '', name: 'x', vote: null, connected: true }],
      });
      expect(isPeerMessage({ type: 'state', state })).toBe(false);
    });

    it('rejects a state with an invalid vote on a player', () => {
      const state = makeGameState({
        players: [{ id: 'p', name: 'x', vote: 7, connected: true } as never],
      });
      expect(isPeerMessage({ type: 'state', state })).toBe(false);
    });

    it('rejects a state with a non-finite round', () => {
      expect(isPeerMessage({ type: 'state', state: makeGameState({ round: NaN }) })).toBe(false);
    });

    it('rejects a state with an unknown phase', () => {
      const state = { ...makeGameState(), phase: 'paused' } as never;
      expect(isPeerMessage({ type: 'state', state })).toBe(false);
    });

    it('rejects a story whose average is not finite', () => {
      const state = makeGameState({ stories: [makeStory({ average: Infinity as never })] });
      expect(isPeerMessage({ type: 'state', state })).toBe(false);
    });
  });
});
