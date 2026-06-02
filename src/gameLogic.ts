import { CardValue, GamePhase, GameState, Player, Story } from './types';

// Signaling goes through broker.peerjs.com. Codes avoid easily-confused glyphs
// (no 0/O/1/I) so they're easy to read aloud.
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ROOM_CODE_CHARS[b % ROOM_CODE_CHARS.length]).join('');
}

// Hide every other player's vote until reveal; the recipient always sees their
// own. `hasVoted` is broadcast so clients can show "voted" without the value.
export function redactForClient(state: GameState, recipientPeerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const reveal = state.revealed || p.id === recipientPeerId;
      return {
        ...p,
        hasVoted: p.vote !== null,
        vote: reveal ? p.vote : null,
      };
    }),
  };
}

// Average of numeric votes only ('?' and non-votes excluded), from connected
// players, rounded to one decimal. null when there's nothing numeric to average.
export function computeAverage(players: Player[]): number | null {
  const numericVotes = players
    .filter((p) => p.connected && p.vote !== null && p.vote !== '?')
    .map((p) => p.vote as number);
  if (numericVotes.length === 0) return null;
  return Math.round((numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length) * 10) / 10;
}

// True when every connected player who voted picked the same card. False when
// nobody has voted.
export function detectConsensus(players: Player[]): boolean {
  const allVotes = players.filter((p) => p.vote !== null && p.connected).map((p) => p.vote!);
  if (allVotes.length === 0) return false;
  const freq = allVotes.reduce<Record<string, number>>((acc, v) => {
    const k = String(v);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const maxFreq = Math.max(...Object.values(freq));
  return maxFreq === allVotes.length;
}

// Pick the next still-votable story when the active one goes away (removed or
// disabled). Prefer the next one forward, but fall back to ANY remaining
// votable story so we never strand the user with votable work but no active
// story. Returns null only when nothing is left to vote on.
export function nextVotableAfter(stories: Story[], idx: number): string | null {
  return (
    stories.find((s, i) => i > idx && s.enabled && s.average === null)?.id ??
    stories.find((s) => s.enabled && s.average === null)?.id ??
    null
  );
}

// Whether `name` collides with an already-connected player or a pending guest.
// A returning guest (same persistentId) is allowed to keep their own name.
export function isNameTaken(
  players: Player[],
  peerToPersistentId: Map<string, string>,
  pending: { persistentId: string; name: string }[],
  persistentId: string,
  name: string,
): boolean {
  const normalized = name.trim().toLowerCase();
  const takenByPlayer = players.some(
    (p) =>
      p.connected &&
      peerToPersistentId.get(p.id) !== persistentId &&
      p.name.trim().toLowerCase() === normalized,
  );
  const takenByPending = pending.some(
    (p) => p.persistentId !== persistentId && p.name.trim().toLowerCase() === normalized,
  );
  return takenByPlayer || takenByPending;
}

// --- State reducers: pure (state, …args) => GameState ----------------------

export function reveal(state: GameState): GameState {
  return { ...state, revealed: true };
}

// Clear votes/active and drop players who are still disconnected — they sat out
// the prior round and shouldn't accumulate across rounds. Bumps the round
// counter: each re-vote on the active story is the next round.
export function newRound(state: GameState): GameState {
  return {
    ...state,
    revealed: false,
    round: state.round + 1,
    players: state.players
      .filter((p) => p.connected)
      .map((p) => ({ ...p, vote: null, active: false })),
  };
}

// Append `story`. If we're voting with no active story, the new one becomes
// active — votes already cast stay attached.
export function addStory(state: GameState, story: Story): GameState {
  const stories = [...state.stories, story];
  const activeStoryId =
    state.activeStoryId === null && state.phase === 'voting' ? story.id : state.activeStoryId;
  return { ...state, stories, activeStoryId };
}

export function removeStory(state: GameState, id: string): GameState {
  const idx = state.stories.findIndex((s) => s.id === id);
  const stories = state.stories.filter((s) => s.id !== id);
  const activeStoryId =
    state.activeStoryId === id ? nextVotableAfter(stories, idx - 1) : state.activeStoryId;
  return { ...state, stories, activeStoryId };
}

export function toggleStory(state: GameState, id: string): GameState {
  const stories = state.stories.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
  const toggled = stories.find((s) => s.id === id);
  let activeStoryId = state.activeStoryId;

  if (state.activeStoryId === id && toggled && !toggled.enabled) {
    // Disabled the active story — hand off to the next votable one.
    activeStoryId = nextVotableAfter(
      stories,
      stories.findIndex((s) => s.id === id),
    );
  } else if (
    activeStoryId === null &&
    toggled &&
    toggled.enabled &&
    toggled.average === null &&
    state.phase === 'voting'
  ) {
    // Re-enabled while nothing is active — adopt this one so voting can resume.
    activeStoryId = id;
  }

  return { ...state, stories, activeStoryId };
}

export function renameStory(state: GameState, id: string, label: string): GameState {
  return {
    ...state,
    stories: state.stories.map((s) => (s.id === id ? { ...s, label } : s)),
  };
}

// Record the active story's average, then advance to the next votable story.
// When none remain, move to the summary phase.
export function nextStory(state: GameState): GameState {
  let stories = state.stories;
  if (state.activeStoryId !== null) {
    const average = computeAverage(state.players);
    stories = state.stories.map((s) => (s.id === state.activeStoryId ? { ...s, average } : s));
  }

  const currentIdx = stories.findIndex((s) => s.id === state.activeStoryId);
  const next = stories.find((s, i) => i > currentIdx && s.enabled && s.average === null);

  const clearedPlayers = state.players
    .filter((p) => p.connected)
    .map((p) => ({ ...p, vote: null, active: false }));

  if (!next) {
    return {
      ...state,
      stories,
      activeStoryId: null,
      phase: 'summary' as GamePhase,
      players: clearedPlayers,
    };
  }

  return {
    ...state,
    stories,
    activeStoryId: next.id,
    revealed: false,
    round: 1,
    players: clearedPlayers,
  };
}

// Reset all averages and return to voting on the first enabled story.
export function newSprint(state: GameState): GameState {
  const stories = state.stories.map((s) => ({ ...s, average: null }));
  const firstVotable = stories.find((s) => s.enabled);
  return {
    ...state,
    stories,
    activeStoryId: firstVotable?.id ?? null,
    phase: 'voting' as GamePhase,
    revealed: false,
    round: 1,
    players: state.players
      .filter((p) => p.connected)
      .map((p) => ({ ...p, vote: null, active: false })),
  };
}

// `value` may be null to clear a vote. Guests can only ever send a concrete
// CardValue (the 'vote' PeerMessage carries no null), so in practice only the
// host clears votes locally — guests deselect by re-voting.
export function castVote(state: GameState, peerId: string, value: CardValue | null): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === peerId ? { ...p, vote: value } : p)),
  };
}

export function setActive(state: GameState, peerId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === peerId ? { ...p, active: true } : p)),
  };
}
