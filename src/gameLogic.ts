import { CardValue, GamePhase, GameState, Player, Component } from './types';

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

// Pick the next still-votable component when the active one goes away (removed or
// disabled). Prefer the next one forward, but fall back to ANY remaining
// votable component so we never strand the user with votable work but no active
// component. Returns null only when nothing is left to vote on.
export function nextVotableAfter(components: Component[], idx: number): string | null {
  return (
    components.find((s, i) => i > idx && s.enabled && s.average === null)?.id ??
    components.find((s) => s.enabled && s.average === null)?.id ??
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

// Re-do the current round in place: hide results, clear votes/active flags, and
// drop players who are still disconnected. Does NOT advance the round counter —
// restarting before a reveal is still the same round.
export function restartRound(state: GameState): GameState {
  return {
    ...state,
    revealed: false,
    players: state.players
      .filter((p) => p.connected)
      .map((p) => ({ ...p, vote: null, active: false })),
  };
}

// Start the next round on the active component: same clearing as restartRound, but
// bumps the round counter — each re-vote after a reveal is the next round.
export function newRound(state: GameState): GameState {
  return { ...restartRound(state), round: state.round + 1 };
}

// Append `component`. If we're voting with no active component, the new one becomes
// active — votes already cast stay attached.
export function addComponent(state: GameState, component: Component): GameState {
  const components = [...state.components, component];
  const activeComponentId =
    state.activeComponentId === null && state.phase === 'voting' ? component.id : state.activeComponentId;
  return { ...state, components, activeComponentId };
}

export function removeComponent(state: GameState, id: string): GameState {
  const idx = state.components.findIndex((s) => s.id === id);
  const components = state.components.filter((s) => s.id !== id);
  const activeComponentId =
    state.activeComponentId === id ? nextVotableAfter(components, idx - 1) : state.activeComponentId;
  return { ...state, components, activeComponentId };
}

export function toggleComponent(state: GameState, id: string): GameState {
  const components = state.components.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
  const toggled = components.find((s) => s.id === id);
  let activeComponentId = state.activeComponentId;

  if (state.activeComponentId === id && toggled && !toggled.enabled) {
    // Disabled the active component — hand off to the next votable one.
    activeComponentId = nextVotableAfter(
      components,
      components.findIndex((s) => s.id === id),
    );
  } else if (
    activeComponentId === null &&
    toggled &&
    toggled.enabled &&
    toggled.average === null &&
    state.phase === 'voting'
  ) {
    // Re-enabled while nothing is active — adopt this one so voting can resume.
    activeComponentId = id;
  }

  return { ...state, components, activeComponentId };
}

export function renameComponent(state: GameState, id: string, label: string): GameState {
  return {
    ...state,
    components: state.components.map((s) => (s.id === id ? { ...s, label } : s)),
  };
}

// Record the active component's average, then advance to the next votable component.
// When none remain, move to the summary phase — unless nothing was ever
// estimated (no components), in which case there's nothing to summarize, so
// skip straight to a fresh voting round (the next ticket).
export function nextComponent(state: GameState): GameState {
  let components = state.components;
  if (state.activeComponentId !== null) {
    const average = computeAverage(state.players);
    components = state.components.map((s) => (s.id === state.activeComponentId ? { ...s, average } : s));
  }

  const currentIdx = components.findIndex((s) => s.id === state.activeComponentId);
  const next = components.find((s, i) => i > currentIdx && s.enabled && s.average === null);

  const clearedPlayers = state.players
    .filter((p) => p.connected)
    .map((p) => ({ ...p, vote: null, active: false }));

  if (next) {
    return {
      ...state,
      components,
      activeComponentId: next.id,
      revealed: false,
      round: 1,
      players: clearedPlayers,
    };
  }

  // Nothing left to vote on. Only show the summary if something was actually
  // estimated; otherwise start the next ticket directly.
  const hasEstimates = components.some((s) => s.enabled && s.average !== null);
  if (!hasEstimates) {
    return {
      ...state,
      components,
      activeComponentId: null,
      revealed: false,
      round: 1,
      players: clearedPlayers,
    };
  }

  return {
    ...state,
    components,
    activeComponentId: null,
    phase: 'summary' as GamePhase,
    players: clearedPlayers,
  };
}

// Reset all averages and return to voting on the first enabled component.
export function newTicket(state: GameState): GameState {
  const components = state.components.map((s) => ({ ...s, average: null }));
  const firstVotable = components.find((s) => s.enabled);
  return {
    ...state,
    components,
    activeComponentId: firstVotable?.id ?? null,
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
