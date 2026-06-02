import { describe, it, expect } from 'vitest';
import {
  addStory,
  castVote,
  computeAverage,
  detectConsensus,
  generateRoomCode,
  isNameTaken,
  newRound,
  newSprint,
  nextStory,
  nextVotableAfter,
  redactForClient,
  removeStory,
  renameStory,
  reveal,
  setActive,
  toggleStory,
} from './gameLogic';
import { makeGameState, makePlayer, makeStory, voter } from './test/factories';

describe('computeAverage', () => {
  it('averages numeric votes only', () => {
    expect(computeAverage([voter('a', 1), voter('b', 2)])).toBe(1.5);
  });

  it("excludes '?' votes", () => {
    expect(computeAverage([voter('a', 2), voter('b', '?'), voter('c', 8)])).toBe(5);
  });

  it('ignores disconnected players', () => {
    expect(computeAverage([voter('a', 2), voter('b', 8, { connected: false })])).toBe(2);
  });

  it('ignores players who have not voted', () => {
    expect(computeAverage([voter('a', 5), makePlayer({ vote: null })])).toBe(5);
  });

  it('rounds to one decimal place', () => {
    expect(computeAverage([voter('a', 1), voter('b', 1), voter('c', 2)])).toBe(1.3);
  });

  it('returns null when there is nothing numeric to average', () => {
    expect(computeAverage([])).toBeNull();
    expect(computeAverage([voter('a', '?')])).toBeNull();
    expect(computeAverage([makePlayer({ vote: null })])).toBeNull();
  });
});

describe('detectConsensus', () => {
  it('is true when every voter picked the same card', () => {
    expect(detectConsensus([voter('a', 5), voter('b', 5)])).toBe(true);
  });

  it('is false when votes differ', () => {
    expect(detectConsensus([voter('a', 5), voter('b', 8)])).toBe(false);
  });

  it('is true for a single voter', () => {
    expect(detectConsensus([voter('a', 3)])).toBe(true);
  });

  it("treats matching '?' votes as consensus", () => {
    expect(detectConsensus([voter('a', '?'), voter('b', '?')])).toBe(true);
  });

  it('ignores non-voters and disconnected players', () => {
    expect(
      detectConsensus([
        voter('a', 8),
        makePlayer({ vote: null }),
        voter('b', 8, { connected: false }),
      ]),
    ).toBe(true);
  });

  it('is false when nobody has voted', () => {
    expect(detectConsensus([])).toBe(false);
    expect(detectConsensus([makePlayer({ vote: null })])).toBe(false);
  });
});

describe('nextVotableAfter', () => {
  const stories = [
    makeStory({ id: 's0', enabled: true, average: 3 }), // already voted
    makeStory({ id: 's1', enabled: false }), // disabled
    makeStory({ id: 's2', enabled: true, average: null }), // votable
    makeStory({ id: 's3', enabled: true, average: null }), // votable
  ];

  it('prefers the next votable story after the index', () => {
    expect(nextVotableAfter(stories, 0)).toBe('s2');
  });

  it('skips disabled and already-averaged stories', () => {
    expect(nextVotableAfter(stories, 2)).toBe('s3');
  });

  it('falls back to any earlier votable story when none remain forward', () => {
    expect(nextVotableAfter(stories, 3)).toBe('s2');
  });

  it('returns null when nothing is votable', () => {
    const done = [makeStory({ enabled: true, average: 5 }), makeStory({ enabled: false })];
    expect(nextVotableAfter(done, -1)).toBeNull();
  });
});

describe('redactForClient', () => {
  const state = makeGameState({
    players: [voter('me', 5, { id: 'me' }), voter('them', 8, { id: 'them' })],
  });

  it('hides other players votes before reveal but keeps the recipients own', () => {
    const redacted = redactForClient(state, 'me');
    const me = redacted.players.find((p) => p.id === 'me')!;
    const them = redacted.players.find((p) => p.id === 'them')!;
    expect(me.vote).toBe(5);
    expect(them.vote).toBeNull();
  });

  it('always reports hasVoted regardless of redaction', () => {
    const redacted = redactForClient(state, 'me');
    expect(redacted.players.every((p) => p.hasVoted)).toBe(true);
  });

  it('exposes every vote once revealed', () => {
    const redacted = redactForClient({ ...state, revealed: true }, 'me');
    expect(redacted.players.map((p) => p.vote)).toEqual([5, 8]);
  });

  it('does not mutate the input state', () => {
    redactForClient(state, 'me');
    expect(state.players.find((p) => p.id === 'them')!.vote).toBe(8);
  });
});

describe('generateRoomCode', () => {
  it('returns a 6-character code from the allowed charset', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe('isNameTaken', () => {
  const peerMap = new Map<string, string>([['peer-a', 'pid-a']]);
  const players = [makePlayer({ id: 'peer-a', name: 'Alice', connected: true })];

  it('rejects a name held by another connected player', () => {
    expect(isNameTaken(players, peerMap, [], 'pid-b', 'alice')).toBe(true);
  });

  it('allows a returning guest to keep their own name', () => {
    expect(isNameTaken(players, peerMap, [], 'pid-a', 'Alice')).toBe(false);
  });

  it('rejects a name held by a pending guest', () => {
    expect(
      isNameTaken([], new Map(), [{ persistentId: 'pid-x', name: 'Bob' }], 'pid-y', 'BOB'),
    ).toBe(true);
  });

  it('ignores disconnected players', () => {
    const offline = [makePlayer({ id: 'peer-c', name: 'Carol', connected: false })];
    expect(isNameTaken(offline, new Map(), [], 'pid-z', 'carol')).toBe(false);
  });
});

describe('reveal', () => {
  it('sets revealed true', () => {
    expect(reveal(makeGameState()).revealed).toBe(true);
  });
});

describe('newRound', () => {
  it('clears votes and active flags', () => {
    const state = makeGameState({
      revealed: true,
      players: [voter('a', 5, { active: true })],
    });
    const next = newRound(state);
    expect(next.revealed).toBe(false);
    expect(next.players[0].vote).toBeNull();
    expect(next.players[0].active).toBe(false);
  });

  it('drops players who are still disconnected', () => {
    const state = makeGameState({
      players: [voter('a', 5), makePlayer({ name: 'b', connected: false })],
    });
    expect(newRound(state).players.map((p) => p.name)).toEqual(['a']);
  });

  it('increments the round counter', () => {
    expect(newRound(makeGameState({ round: 1 })).round).toBe(2);
    expect(newRound(makeGameState({ round: 4 })).round).toBe(5);
  });
});

describe('addStory', () => {
  it('appends the story', () => {
    const story = makeStory({ id: 'new' });
    expect(addStory(makeGameState(), story).stories).toContain(story);
  });

  it('adopts the new story as active when voting with none active', () => {
    const story = makeStory({ id: 'new' });
    const next = addStory(makeGameState({ activeStoryId: null, phase: 'voting' }), story);
    expect(next.activeStoryId).toBe('new');
  });

  it('leaves the active story untouched when one is already active', () => {
    const story = makeStory({ id: 'new' });
    const next = addStory(makeGameState({ activeStoryId: 'existing' }), story);
    expect(next.activeStoryId).toBe('existing');
  });
});

describe('removeStory', () => {
  it('removes the story and reassigns active to the next votable', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
      activeStoryId: 's1',
    });
    const next = removeStory(state, 's1');
    expect(next.stories.map((s) => s.id)).toEqual(['s2']);
    expect(next.activeStoryId).toBe('s2');
  });

  it('keeps the active story when removing a different one', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
      activeStoryId: 's2',
    });
    expect(removeStory(state, 's1').activeStoryId).toBe('s2');
  });
});

describe('toggleStory', () => {
  it('hands off the active story when it is disabled', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
      activeStoryId: 's1',
    });
    const next = toggleStory(state, 's1');
    expect(next.stories.find((s) => s.id === 's1')!.enabled).toBe(false);
    expect(next.activeStoryId).toBe('s2');
  });

  it('adopts a re-enabled story when nothing is active', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1', enabled: false })],
      activeStoryId: null,
      phase: 'voting',
    });
    expect(toggleStory(state, 's1').activeStoryId).toBe('s1');
  });
});

describe('renameStory', () => {
  it('renames the matching story only', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1', label: 'old' }), makeStory({ id: 's2', label: 'keep' })],
    });
    const next = renameStory(state, 's1', 'new');
    expect(next.stories.map((s) => s.label)).toEqual(['new', 'keep']);
  });
});

describe('nextStory', () => {
  it('records the active storys average and advances to the next votable', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
      activeStoryId: 's1',
      players: [voter('a', 3), voter('b', 5)],
    });
    const next = nextStory(state);
    expect(next.stories.find((s) => s.id === 's1')!.average).toBe(4);
    expect(next.activeStoryId).toBe('s2');
    expect(next.phase).toBe('voting');
    expect(next.players[0].vote).toBeNull();
  });

  it('resets the round counter to 1 on the next story', () => {
    const state = makeGameState({
      round: 5,
      stories: [makeStory({ id: 's1' }), makeStory({ id: 's2' })],
      activeStoryId: 's1',
      players: [voter('a', 3)],
    });
    expect(nextStory(state).round).toBe(1);
  });

  it('moves to the summary phase when no votable story remains', () => {
    const state = makeGameState({
      stories: [makeStory({ id: 's1' })],
      activeStoryId: 's1',
      players: [voter('a', 8)],
    });
    const next = nextStory(state);
    expect(next.phase).toBe('summary');
    expect(next.activeStoryId).toBeNull();
    expect(next.stories[0].average).toBe(8);
  });
});

describe('newSprint', () => {
  it('clears averages and returns to voting on the first enabled story', () => {
    const state = makeGameState({
      phase: 'summary',
      stories: [makeStory({ id: 's1', average: 3 }), makeStory({ id: 's2', average: 5 })],
      activeStoryId: null,
      players: [voter('a', 5)],
    });
    const next = newSprint(state);
    expect(next.phase).toBe('voting');
    expect(next.stories.every((s) => s.average === null)).toBe(true);
    expect(next.activeStoryId).toBe('s1');
    expect(next.players[0].vote).toBeNull();
  });
});

describe('castVote / setActive', () => {
  const state = makeGameState({ players: [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })] });

  it('sets the vote on the targeted player only', () => {
    const next = castVote(state, 'p1', 8);
    expect(next.players.find((p) => p.id === 'p1')!.vote).toBe(8);
    expect(next.players.find((p) => p.id === 'p2')!.vote).toBeNull();
  });

  it('marks the targeted player active', () => {
    const next = setActive(state, 'p2');
    expect(next.players.find((p) => p.id === 'p2')!.active).toBe(true);
    expect(next.players.find((p) => p.id === 'p1')!.active).toBeUndefined();
  });
});
