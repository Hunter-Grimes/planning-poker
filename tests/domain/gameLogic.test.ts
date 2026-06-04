import { describe, it, expect } from 'vitest';
import {
  addComponent,
  applyDelta,
  buildRevealVotes,
  castVote,
  computeAverage,
  detectConsensus,
  generateRoomCode,
  isNameTaken,
  newRound,
  newTicket,
  nextComponent,
  nextVotableAfter,
  redactForClient,
  removeComponent,
  renameComponent,
  restartRound,
  reveal,
  setActive,
  toggleComponent,
  electHost,
} from '../../src/domain/gameLogic';
import { makeGameState, makePlayer, makeComponent, voter } from '../helpers/factories';

describe('electHost', () => {
  it('picks the connected non-host player with the smallest id', () => {
    const state = makeGameState({
      hostId: 'host',
      players: [
        makePlayer({ id: 'host', connected: true }),
        makePlayer({ id: 'ccc', connected: true }),
        makePlayer({ id: 'aaa', connected: true }),
        makePlayer({ id: 'bbb', connected: true }),
      ],
    });
    expect(electHost(state)!.id).toBe('aaa');
  });

  it('ignores the current host and disconnected players', () => {
    const state = makeGameState({
      hostId: 'aaa', // smallest id, but it is the (gone) host
      players: [
        makePlayer({ id: 'aaa', connected: true }),
        makePlayer({ id: 'bbb', connected: false }),
        makePlayer({ id: 'ccc', connected: true }),
      ],
    });
    expect(electHost(state)!.id).toBe('ccc');
  });

  it('returns null when nobody is eligible', () => {
    const state = makeGameState({
      hostId: 'aaa',
      players: [makePlayer({ id: 'aaa', connected: true }), makePlayer({ id: 'bbb', connected: false })],
    });
    expect(electHost(state)).toBeNull();
  });
});

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
  const components = [
    makeComponent({ id: 's0', enabled: true, average: 3 }), // already voted
    makeComponent({ id: 's1', enabled: false }), // disabled
    makeComponent({ id: 's2', enabled: true, average: null }), // votable
    makeComponent({ id: 's3', enabled: true, average: null }), // votable
  ];

  it('prefers the next votable component after the index', () => {
    expect(nextVotableAfter(components, 0)).toBe('s2');
  });

  it('skips disabled and already-averaged components', () => {
    expect(nextVotableAfter(components, 2)).toBe('s3');
  });

  it('falls back to any earlier votable component when none remain forward', () => {
    expect(nextVotableAfter(components, 3)).toBe('s2');
  });

  it('returns null when nothing is votable', () => {
    const done = [makeComponent({ enabled: true, average: 5 }), makeComponent({ enabled: false })];
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

// newRound and restartRound share the same reset behavior — clear votes/active
// flags, hide results, drop still-disconnected players. They differ only in the
// round counter: newRound advances it, restartRound holds it in place.
describe.each([
  ['newRound', newRound, (r: number) => r + 1],
  ['restartRound', restartRound, (r: number) => r],
] as const)('%s', (_name, run, nextRound) => {
  it('clears votes and active flags and hides results', () => {
    const state = makeGameState({
      revealed: true,
      players: [voter('a', 5, { active: true })],
    });
    const next = run(state);
    expect(next.revealed).toBe(false);
    expect(next.players[0].vote).toBeNull();
    expect(next.players[0].active).toBe(false);
  });

  it('drops players who are still disconnected', () => {
    const state = makeGameState({
      players: [voter('a', 5), makePlayer({ name: 'b', connected: false })],
    });
    expect(run(state).players.map((p) => p.name)).toEqual(['a']);
  });

  it('sets the round counter according to its policy', () => {
    expect(run(makeGameState({ round: 1 })).round).toBe(nextRound(1));
    expect(run(makeGameState({ round: 4 })).round).toBe(nextRound(4));
  });
});

describe('addComponent', () => {
  it('appends the component', () => {
    const component = makeComponent({ id: 'new' });
    expect(addComponent(makeGameState(), component).components).toContain(component);
  });

  it('adopts the new component as active when voting with none active', () => {
    const component = makeComponent({ id: 'new' });
    const next = addComponent(
      makeGameState({ activeComponentId: null, phase: 'voting' }),
      component,
    );
    expect(next.activeComponentId).toBe('new');
  });

  it('leaves the active component untouched when one is already active', () => {
    const component = makeComponent({ id: 'new' });
    const next = addComponent(makeGameState({ activeComponentId: 'existing' }), component);
    expect(next.activeComponentId).toBe('existing');
  });
});

describe('removeComponent', () => {
  it('removes the component and reassigns active to the next votable', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })],
      activeComponentId: 's1',
    });
    const next = removeComponent(state, 's1');
    expect(next.components.map((s) => s.id)).toEqual(['s2']);
    expect(next.activeComponentId).toBe('s2');
  });

  it('keeps the active component when removing a different one', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })],
      activeComponentId: 's2',
    });
    expect(removeComponent(state, 's1').activeComponentId).toBe('s2');
  });
});

describe('toggleComponent', () => {
  it('hands off the active component when it is disabled', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })],
      activeComponentId: 's1',
    });
    const next = toggleComponent(state, 's1');
    expect(next.components.find((s) => s.id === 's1')!.enabled).toBe(false);
    expect(next.activeComponentId).toBe('s2');
  });

  it('adopts a re-enabled component when nothing is active', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1', enabled: false })],
      activeComponentId: null,
      phase: 'voting',
    });
    expect(toggleComponent(state, 's1').activeComponentId).toBe('s1');
  });
});

describe('renameComponent', () => {
  it('renames the matching component only', () => {
    const state = makeGameState({
      components: [
        makeComponent({ id: 's1', label: 'old' }),
        makeComponent({ id: 's2', label: 'keep' }),
      ],
    });
    const next = renameComponent(state, 's1', 'new');
    expect(next.components.map((s) => s.label)).toEqual(['new', 'keep']);
  });
});

describe('nextComponent', () => {
  it('records the active components average and advances to the next votable', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })],
      activeComponentId: 's1',
      players: [voter('a', 3), voter('b', 5)],
    });
    const next = nextComponent(state);
    expect(next.components.find((s) => s.id === 's1')!.average).toBe(4);
    expect(next.activeComponentId).toBe('s2');
    expect(next.phase).toBe('voting');
    expect(next.players[0].vote).toBeNull();
  });

  it('resets the round counter to 1 on the next component', () => {
    const state = makeGameState({
      round: 5,
      components: [makeComponent({ id: 's1' }), makeComponent({ id: 's2' })],
      activeComponentId: 's1',
      players: [voter('a', 3)],
    });
    expect(nextComponent(state).round).toBe(1);
  });

  it('moves to the summary phase when no votable component remains', () => {
    const state = makeGameState({
      components: [makeComponent({ id: 's1' })],
      activeComponentId: 's1',
      players: [voter('a', 8)],
    });
    const next = nextComponent(state);
    expect(next.phase).toBe('summary');
    expect(next.activeComponentId).toBeNull();
    expect(next.components[0].average).toBe(8);
  });

  it('skips the summary and starts a fresh round when nothing was estimated', () => {
    const state = makeGameState({
      components: [],
      activeComponentId: null,
      revealed: true,
      round: 3,
      players: [voter('a', 8, { active: true })],
    });
    const next = nextComponent(state);
    expect(next.phase).toBe('voting');
    expect(next.activeComponentId).toBeNull();
    expect(next.revealed).toBe(false);
    expect(next.round).toBe(1);
    expect(next.players[0].vote).toBeNull();
    expect(next.players[0].active).toBe(false);
  });
});

describe('newTicket', () => {
  it('clears averages and returns to voting on the first enabled component', () => {
    const state = makeGameState({
      phase: 'summary',
      components: [
        makeComponent({ id: 's1', average: 3 }),
        makeComponent({ id: 's2', average: 5 }),
      ],
      activeComponentId: null,
      players: [voter('a', 5)],
    });
    const next = newTicket(state);
    expect(next.phase).toBe('voting');
    expect(next.components.every((s) => s.average === null)).toBe(true);
    expect(next.activeComponentId).toBe('s1');
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

describe('buildRevealVotes', () => {
  it('emits [id, value] pairs for connected players who voted', () => {
    const players = [
      voter('a', 5, { id: 'a' }),
      voter('b', '?', { id: 'b' }),
      makePlayer({ id: 'c', vote: null }),
      voter('d', 8, { id: 'd', connected: false }),
    ];
    expect(buildRevealVotes(players)).toEqual([
      ['a', 5],
      ['b', '?'],
    ]);
  });
});

describe('applyDelta', () => {
  const base = () =>
    makeGameState({
      players: [
        makePlayer({ id: 'a', name: 'Alice', vote: null }),
        makePlayer({ id: 'b', name: 'Bob', vote: null }),
      ],
    });

  it('voted flips hasVoted without exposing a value', () => {
    const next = applyDelta(base(), { type: 'voted', version: 1, id: 'a' });
    const a = next.players.find((p) => p.id === 'a')!;
    expect(a.hasVoted).toBe(true);
    expect(a.vote).toBeNull();
  });

  it('voted preserves an existing (own optimistic) value', () => {
    const start = makeGameState({ players: [makePlayer({ id: 'a', vote: 5 })] });
    const next = applyDelta(start, { type: 'voted', version: 1, id: 'a' });
    expect(next.players.find((p) => p.id === 'a')!.vote).toBe(5);
  });

  it('unvoted clears the value and the flag', () => {
    const start = makeGameState({ players: [makePlayer({ id: 'a', vote: 5, hasVoted: true })] });
    const next = applyDelta(start, { type: 'unvoted', version: 1, id: 'a' });
    const a = next.players.find((p) => p.id === 'a')!;
    expect(a.vote).toBeNull();
    expect(a.hasVoted).toBe(false);
  });

  it('player-active sets the active flag', () => {
    const next = applyDelta(base(), { type: 'player-active', version: 1, id: 'b' });
    expect(next.players.find((p) => p.id === 'b')!.active).toBe(true);
  });

  it('reveal fills in votes and marks the state revealed', () => {
    const next = applyDelta(base(), {
      type: 'reveal',
      version: 1,
      votes: [
        ['a', 5],
        ['b', '?'],
      ],
    });
    expect(next.revealed).toBe(true);
    expect(next.players.find((p) => p.id === 'a')!.vote).toBe(5);
    expect(next.players.find((p) => p.id === 'b')!.vote).toBe('?');
  });

  it('reveal clears the vote of a player who never voted', () => {
    const start = makeGameState({ players: [makePlayer({ id: 'a', vote: 5, hasVoted: true })] });
    const next = applyDelta(start, { type: 'reveal', version: 1, votes: [] });
    const a = next.players.find((p) => p.id === 'a')!;
    expect(a.vote).toBeNull();
    expect(a.hasVoted).toBe(false);
  });

  it('player-joined appends a new player', () => {
    const joined = makePlayer({ id: 'c', name: 'Carol' });
    const next = applyDelta(base(), { type: 'player-joined', version: 1, player: joined });
    expect(next.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('player-joined replaces an existing entry for the same id', () => {
    const rejoined = makePlayer({ id: 'a', name: 'Alice2' });
    const next = applyDelta(base(), { type: 'player-joined', version: 1, player: rejoined });
    expect(next.players.filter((p) => p.id === 'a')).toHaveLength(1);
    expect(next.players.find((p) => p.id === 'a')!.name).toBe('Alice2');
  });

  it('player-disconnected greys a player out but keeps them', () => {
    const next = applyDelta(base(), { type: 'player-disconnected', version: 1, id: 'a' });
    expect(next.players.find((p) => p.id === 'a')!.connected).toBe(false);
  });

  it('player-removed drops the player entirely', () => {
    const next = applyDelta(base(), { type: 'player-removed', version: 1, id: 'a' });
    expect(next.players.map((p) => p.id)).toEqual(['b']);
  });
});
